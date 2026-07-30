//+------------------------------------------------------------------+
//| TradePilot_EA.mq5                                                |
//| Connects to TradePilot WebSocket gateway and executes signals    |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "3.16"
#property strict

#include <Trade/Trade.mqh>

input group  "=== TradePilot Server ==="
input string ServerHost          = "tradepilot.yassinecastro.com";
input int    ServerPort          = 4000;
input bool   UseSSL              = false;
input string WsPath              = "/ws/ea";

input group  "=== Authentication ==="
input string ApiKey              = "";

input group  "=== Trade Execution ==="
input double LotSize             = 0.01;
input int    UseTpCount          = 3;
input int    Slippage            = 10;
input ulong  MagicNumber         = 20260417;
input bool   EnableTrading       = true;

input group  "=== Connection ==="
input int    ReconnectDelaySec   = 5;
input int    HeartbeatTimeoutSec = 30;

enum EState { ST_DISCONNECTED, ST_CONNECTING, ST_HANDSHAKING, ST_AUTHENTICATING, ST_CONNECTED };

EState        g_state            = ST_DISCONNECTED;
int           g_socket           = INVALID_HANDLE;
int           g_reconnectAttempt = 0;
datetime      g_reconnectAfter   = 0;
datetime      g_lastMessageTime  = 0;
datetime      g_lastPingSentAt   = 0;
datetime      g_lastAccountStatusSent = 0;
datetime      g_lastSymbolsSent  = 0;
datetime      g_lastTradeHistorySyncAt = 0;
CTrade        g_trade;
string        g_wsKey            = "dGhlIHNhbXBsZSBub25jZQ==";

uchar g_readBuf[];
int   g_readLen = 0;
ulong g_reportedDealTickets[];

void Log(string msg) {
   Print("[TradePilot] ", msg);
}

string EscapeJson(string value) {
   string result = "";
   int len = StringLen(value);

   for (int i = 0; i < len; i++) {
      ushort c = StringGetCharacter(value, i);

      if (c == '\\') {
         result += "\\\\";
      } else if (c == '"') {
         result += "\\\"";
      } else if (c == 8) {
         result += "\\b";
      } else if (c == 9) {
         result += "\\t";
      } else if (c == 10) {
         result += "\\n";
      } else if (c == 12) {
         result += "\\f";
      } else if (c == 13) {
         result += "\\r";
      } else if (c < 32) {
         result += StringFormat("\\u%04X", c);
      } else {
         result += CharToString(c);
      }
   }

   return result;
}

string JsonStr(string json, string key) {
   string needle = "\"" + key + "\":\"";
   int p = StringFind(json, needle);
   if (p < 0) return "";
   p += StringLen(needle);
   int q = StringFind(json, "\"", p);
   if (q < 0) return "";
   return StringSubstr(json, p, q - p);
}

double JsonNum(string json, string key) {
   string needle = "\"" + key + "\":";
   int p = StringFind(json, needle);
   if (p < 0) return 0.0;
   p += StringLen(needle);
   while (p < StringLen(json) && (StringGetCharacter(json, p) == ' ' || StringGetCharacter(json, p) == '\t'))
      p++;

   if (StringSubstr(json, p, 4) == "null")
      return 0.0;

   string num = "";
   int len = StringLen(json);
   for (int i = p; i < len; i++) {
      ushort c = StringGetCharacter(json, i);
      if ((c >= '0' && c <= '9') || c == '.' || c == '-') {
         num += CharToString((uchar)c);
         continue;
      }
      break;
   }
   return (num == "") ? 0.0 : StringToDouble(num);
}

string IsoTimestamp(datetime value) {
   MqlDateTime parts;
   TimeToStruct(value, parts);
   return StringFormat(
      "%04d-%02d-%02dT%02d:%02d:%02dZ",
      parts.year,
      parts.mon,
      parts.day,
      parts.hour,
      parts.min,
      parts.sec
   );
}

string JsonNullableNumber(bool hasValue, double value, int digits) {
   if (!hasValue)
      return "null";
   return DoubleToString(value, digits);
}

string AccountId() {
   return (string)AccountInfoInteger(ACCOUNT_LOGIN);
}

string AccountNameLabel() {
   string accountName = AccountInfoString(ACCOUNT_NAME);
   if (accountName == "")
      return AccountInfoString(ACCOUNT_SERVER);
   return accountName;
}

double NormalizeVolumeForSymbol(string symbol, double volume) {
   if (volume <= 0.0)
      return 0.0;

   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);

   if (step <= 0.0)
      step = 0.01;

   double normalized = MathFloor(volume / step + 0.5) * step;

   if (minVolume > 0.0 && normalized < minVolume)
      normalized = minVolume;

   if (maxVolume > 0.0 && normalized > maxVolume)
      normalized = maxVolume;

   int digits = 2;
   if (step < 0.1) digits = 3;
   if (step < 0.01) digits = 4;

   return NormalizeDouble(normalized, digits);
}

bool ContainsReportedDeal(ulong ticket) {
   for (int i = 0; i < ArraySize(g_reportedDealTickets); i++) {
      if (g_reportedDealTickets[i] == ticket)
         return true;
   }

   return false;
}

void AddReportedDeal(ulong ticket) {
   if (ticket == 0 || ContainsReportedDeal(ticket))
      return;

   int size = ArraySize(g_reportedDealTickets);
   ArrayResize(g_reportedDealTickets, size + 1);
   g_reportedDealTickets[size] = ticket;
}

bool WsSend(string text);
bool WsSendControl(uchar opcode, uchar &payload[]);
void Disconnect();

void WsBuildFrame(string text, uchar &frame[]) {
   uchar payload[];
   int plen = StringToCharArray(text, payload, 0, WHOLE_ARRAY, CP_UTF8) - 1;

   int headerLen = 2;
   if (plen > 65535)
      headerLen += 8;
   else if (plen > 125)
      headerLen += 2;
   int totalLen = headerLen + 4 + plen;

   ArrayResize(frame, totalLen);
   frame[0] = 0x81;
   if (plen > 65535) {
      frame[1] = (uchar)(0x80 | 0x7F);
      frame[2] = 0;
      frame[3] = 0;
      frame[4] = 0;
      frame[5] = 0;
      frame[6] = (uchar)((plen >> 24) & 0xFF);
      frame[7] = (uchar)((plen >> 16) & 0xFF);
      frame[8] = (uchar)((plen >> 8) & 0xFF);
      frame[9] = (uchar)(plen & 0xFF);
   } else if (plen > 125) {
      frame[1] = (uchar)(0x80 | 0x7E);
      frame[2] = (uchar)((plen >> 8) & 0xFF);
      frame[3] = (uchar)(plen & 0xFF);
   } else {
      frame[1] = (uchar)(0x80 | plen);
   }

   uchar mask[4];
   mask[0] = (uchar)(MathRand() & 0xFF);
   mask[1] = (uchar)(MathRand() & 0xFF);
   mask[2] = (uchar)(MathRand() & 0xFF);
   mask[3] = (uchar)(MathRand() & 0xFF);

   frame[headerLen]     = mask[0];
   frame[headerLen + 1] = mask[1];
   frame[headerLen + 2] = mask[2];
   frame[headerLen + 3] = mask[3];

   for (int i = 0; i < plen; i++)
      frame[headerLen + 4 + i] = payload[i] ^ mask[i % 4];
}

bool WsSend(string text) {
   if (g_socket == INVALID_HANDLE) return false;
   uchar frame[];
   WsBuildFrame(text, frame);
   if (UseSSL)
      return SocketTlsSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
   return SocketSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
}

bool WsSendControl(uchar opcode, uchar &payload[]) {
   if (g_socket == INVALID_HANDLE)
      return false;

   int plen = ArraySize(payload);
   if (plen > 125)
      return false;

   int headerLen = 2;
   int totalLen = headerLen + 4 + plen;
   uchar frame[];
   ArrayResize(frame, totalLen);
   frame[0] = (uchar)(0x80 | (opcode & 0x0F));
   frame[1] = (uchar)(0x80 | plen);

   uchar mask[4];
   mask[0] = (uchar)(MathRand() & 0xFF);
   mask[1] = (uchar)(MathRand() & 0xFF);
   mask[2] = (uchar)(MathRand() & 0xFF);
   mask[3] = (uchar)(MathRand() & 0xFF);

   frame[headerLen]     = mask[0];
   frame[headerLen + 1] = mask[1];
   frame[headerLen + 2] = mask[2];
   frame[headerLen + 3] = mask[3];

   for (int i = 0; i < plen; i++)
      frame[headerLen + 4 + i] = payload[i] ^ mask[i % 4];

   if (UseSSL)
      return SocketTlsSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
   return SocketSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
}

bool SocketWriteStr(string s) {
   uchar buf[];
   int len = StringToCharArray(s, buf, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if (UseSSL)
      return SocketTlsSend(g_socket, buf, len) == len;
   return SocketSend(g_socket, buf, len) == len;
}

int ReadAvailable() {
   uint avail = SocketIsReadable(g_socket);
   if (avail == 0) return 0;

   uchar tmp[];
   int got;
   if (UseSSL)
      got = SocketTlsReadAvailable(g_socket, tmp, (int)avail);
   else
      got = SocketRead(g_socket, tmp, (int)avail, 0);

   if (got <= 0) return got;

   int old = g_readLen;
   g_readLen += got;
   ArrayResize(g_readBuf, g_readLen);
   for (int i = 0; i < got; i++)
      g_readBuf[old + i] = tmp[i];

   return got;
}

string ConsumeReadBuf() {
   if (g_readLen == 0) return "";
   string s = CharArrayToString(g_readBuf, 0, g_readLen, CP_UTF8);
   g_readLen = 0;
   ArrayResize(g_readBuf, 0);
   return s;
}

bool ParseWsFrame(string &payload, uchar &opcode) {
   if (g_readLen < 2) return false;

   opcode = g_readBuf[0] & 0x0F;
   int plen = g_readBuf[1] & 0x7F;
   int headerLen = 2;

   if (plen == 126) {
      if (g_readLen < 4) return false;
      plen = ((int)g_readBuf[2] << 8) | (int)g_readBuf[3];
      headerLen = 4;
   } else if (plen == 127) {
      return false;
   }

   int totalLen = headerLen + plen;
   if (g_readLen < totalLen) return false;

   uchar data[];
   ArrayResize(data, plen);
   for (int i = 0; i < plen; i++)
      data[i] = g_readBuf[headerLen + i];

   payload = CharArrayToString(data, 0, plen, CP_UTF8);

   int remaining = g_readLen - totalLen;
   if (remaining > 0) {
      uchar tmp[];
      ArrayResize(tmp, remaining);
      for (int i = 0; i < remaining; i++)
         tmp[i] = g_readBuf[totalLen + i];
      ArrayResize(g_readBuf, remaining);
      for (int i = 0; i < remaining; i++)
         g_readBuf[i] = tmp[i];
   } else {
      ArrayResize(g_readBuf, 0);
   }
   g_readLen = remaining;

   return true;
}

int ExtractSignalObjects(string message, string &objects[]) {
   int dataPos = StringFind(message, "\"data\":[");
   if (dataPos < 0) return 0;

   int len = StringLen(message);
   int depth = 0;
   int start = -1;
   int count = 0;
   ArrayResize(objects, 0);

   for (int i = dataPos + 8; i < len; i++) {
      ushort c = StringGetCharacter(message, i);
      if (c == '{') {
         if (depth == 0)
            start = i;
         depth++;
      } else if (c == '}') {
         depth--;
         if (depth == 0 && start >= 0) {
            ArrayResize(objects, count + 1);
            objects[count] = StringSubstr(message, start, i - start + 1);
            count++;
            start = -1;
         }
      } else if (c == ']' && depth == 0) {
         break;
      }
   }

   return count;
}

void SendCommandResult(
   string action,
   string symbol,
   bool success,
   string message,
   string signalId,
   string executionKey
) {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   string payload = StringFormat(
      "{\"type\":\"command_result\",\"accountId\":\"%s\",\"action\":\"%s\",\"symbol\":\"%s\",\"status\":\"%s\",\"message\":\"%s\",\"signal_id\":%s,\"execution_key\":%s}",
      AccountId(),
      action,
      symbol,
      success ? "SUCCESS" : "ERROR",
      EscapeJson(message),
      signalId == "" ? "null" : "\"" + EscapeJson(signalId) + "\"",
      executionKey == "" ? "null" : "\"" + EscapeJson(executionKey) + "\""
   );

   if (WsSend(payload))
      Log("-> command_result " + action + " " + (success ? "SUCCESS" : "ERROR"));
}

void SendSymbols() {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   int total = SymbolsTotal(false);
   string payload = StringFormat(
      "{\"type\":\"symbols\",\"accountId\":\"%s\",\"symbols\":[",
      AccountId()
   );

   for (int i = 0; i < total; i++) {
      string symbol = SymbolName(i, false);
      if (symbol == "")
         continue;

      if (StringSubstr(payload, StringLen(payload) - 1, 1) != "[")
         payload += ",";

      payload += "\"" + EscapeJson(symbol) + "\"";
   }

   payload += "]}";

   if (WsSend(payload)) {
      g_lastSymbolsSent = TimeCurrent();
      Log("-> symbols");
   }
}

void SendHeartbeat() {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   long timestamp = (long)TimeCurrent() * 1000;
   string payload = StringFormat("{\"type\":\"ping\",\"timestamp\":%I64d}", timestamp);

   if (WsSend(payload)) {
      g_lastPingSentAt = TimeCurrent();
   }
}

void SendAccountStatus() {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double drawdown = 0.0;

   if (balance > 0.0)
      drawdown = MathMax(0.0, (balance - equity) / balance * 100.0);

   string payload = StringFormat(
      "{\"type\":\"account_status\",\"accountId\":\"%s\",\"data\":{\"balance\":%s,\"equity\":%s,\"margin\":%s,\"freeMargin\":%s,\"drawdownPercent\":%s,\"openPositions\":%d}}",
      AccountId(),
      DoubleToString(balance, 2),
      DoubleToString(equity, 2),
      DoubleToString(margin, 2),
      DoubleToString(freeMargin, 2),
      DoubleToString(drawdown, 2),
      (int)PositionsTotal()
   );

   if (WsSend(payload)) {
      g_lastAccountStatusSent = TimeCurrent();
      Log("-> account_status");
   }
}

int SendOpenPositionsSnapshot() {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return 0;

   int sent = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      long posType = PositionGetInteger(POSITION_TYPE);
      string side = posType == POSITION_TYPE_BUY ? "BUY" : "SELL";
      double volume = PositionGetDouble(POSITION_VOLUME);
      double entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double stopLoss = PositionGetDouble(POSITION_SL);
      double takeProfit = PositionGetDouble(POSITION_TP);
      double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      string comment = PositionGetString(POSITION_COMMENT);
      datetime openedAt = (datetime)PositionGetInteger(POSITION_TIME);

      SendTradeEvent(
         "OPEN",
         ticket,
         symbol,
         side,
         side,
         side == "BUY" ? "LONG" : "SHORT",
         volume,
         true,
         entryPrice,
         false,
         0.0,
         stopLoss > 0.0,
         stopLoss,
         takeProfit > 0.0,
         takeProfit,
         profit,
         comment,
         openedAt,
         false,
         0
      );
      sent++;
   }

   Log(StringFormat("-> open_positions snapshot count=%d", sent));
   return sent;
}

void SendTradeEvent(
   string status,
   ulong ticket,
   string symbol,
   string side,
   string openingOrderType,
   string positionDirection,
   double volume,
   bool hasEntryPrice,
   double entryPrice,
   bool hasExitPrice,
   double exitPrice,
   bool hasStopLoss,
   double stopLoss,
   bool hasTakeProfit,
   double takeProfit,
   double profit,
   string comment,
   datetime openedAt,
   bool hasClosedAt,
   datetime closedAt
) {
   if (g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   string payload = StringFormat(
      "{\"type\":\"trade_event\",\"accountId\":\"%s\",\"data\":{\"ticket\":\"%I64u\",\"signal_id\":null,\"symbol\":\"%s\",\"type\":\"%s\",\"opening_order_type\":\"%s\",\"position_direction\":\"%s\",\"volume\":%s,\"entry_price\":%s,\"exit_price\":%s,\"stop_loss\":%s,\"take_profit\":%s,\"profit\":%s,\"status\":\"%s\",\"comment\":\"%s\",\"opened_at\":\"%s\",\"closed_at\":%s}}",
      AccountId(),
      ticket,
      EscapeJson(symbol),
      EscapeJson(side),
      EscapeJson(openingOrderType),
      EscapeJson(positionDirection),
      DoubleToString(volume, 2),
      JsonNullableNumber(hasEntryPrice, entryPrice, 5),
      JsonNullableNumber(hasExitPrice, exitPrice, 5),
      JsonNullableNumber(hasStopLoss, stopLoss, 5),
      JsonNullableNumber(hasTakeProfit, takeProfit, 5),
      DoubleToString(profit, 2),
      EscapeJson(status),
      EscapeJson(comment),
      IsoTimestamp(openedAt),
      hasClosedAt ? "\"" + IsoTimestamp(closedAt) + "\"" : "null"
   );

   if (WsSend(payload))
      Log("-> trade_event " + status + " ticket " + (string)ticket);
}

string OpeningOrderTypeFromDealType(long dealType) {
   return dealType == DEAL_TYPE_BUY ? "BUY" : "SELL";
}

string PositionDirectionFromOrderType(string openingOrderType) {
   return openingOrderType == "BUY" ? "LONG" : "SHORT";
}

string FindOpeningOrderType(long positionId, long fallbackDealType) {
   string openingOrderType = OpeningOrderTypeFromDealType(fallbackDealType);

   if (positionId <= 0)
      return openingOrderType;

   int total = HistoryDealsTotal();
   datetime earliest = 0;

   for (int i = 0; i < total; i++) {
      ulong dealTicket = HistoryDealGetTicket(i);
      if (dealTicket == 0)
         continue;

      if ((long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID) != positionId)
         continue;

      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if (entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_INOUT)
         continue;

      datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      if (earliest == 0 || dealTime < earliest) {
         earliest = dealTime;
         openingOrderType = OpeningOrderTypeFromDealType(
            HistoryDealGetInteger(dealTicket, DEAL_TYPE)
         );
      }
   }

   return openingOrderType;
}

void SendStateSyncComplete(string requestId, int syncedTrades) {
   if (requestId == "" || g_state != ST_CONNECTED || g_socket == INVALID_HANDLE)
      return;

   string payload = StringFormat(
      "{\"type\":\"sync_state_complete\",\"accountId\":\"%s\",\"request_id\":\"%s\",\"synced_at\":\"%s\",\"synced_trades\":%d}",
      AccountId(),
      EscapeJson(requestId),
      EscapeJson(IsoTimestamp(TimeCurrent())),
      syncedTrades
   );

   if (WsSend(payload))
      Log("-> sync_state_complete");
}

datetime FindOpenedAt(long positionId, datetime fallback) {
   if (positionId <= 0)
      return fallback;

   datetime openedAt = fallback;
   int total = HistoryDealsTotal();
   for (int i = 0; i < total; i++) {
      ulong dealTicket = HistoryDealGetTicket(i);
      if (dealTicket == 0)
         continue;

      if ((long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID) != positionId)
         continue;

      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if (entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_INOUT)
         continue;

      datetime candidate = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      if (openedAt == fallback || candidate < openedAt)
         openedAt = candidate;
   }

   return openedAt;
}

double FindEntryPrice(long positionId, double fallback) {
   if (positionId <= 0)
      return fallback;

   int total = HistoryDealsTotal();
   double entryPrice = fallback;
   datetime earliest = 0;

   for (int i = 0; i < total; i++) {
      ulong dealTicket = HistoryDealGetTicket(i);
      if (dealTicket == 0)
         continue;

      if ((long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID) != positionId)
         continue;

      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if (entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_INOUT)
         continue;

      datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      if (earliest == 0 || dealTime < earliest) {
         earliest = dealTime;
         entryPrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      }
   }

   return entryPrice;
}

bool SendTradeEventFromDeal(ulong dealTicket) {
   if (!HistoryDealSelect(dealTicket)) {
      Log(StringFormat("Deal %I64u: HistoryDealSelect failed err=%d", dealTicket, GetLastError()));
      return false;
   }

   long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if (dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) {
      Log(StringFormat("Deal %I64u: non-trade type=%d sym=%s", dealTicket, dealType, HistoryDealGetString(dealTicket, DEAL_SYMBOL)));
      return false;
   }

   string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   string side = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double stopLoss = HistoryDealGetDouble(dealTicket, DEAL_SL);
   double takeProfit = HistoryDealGetDouble(dealTicket, DEAL_TP);
   double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT) +
      HistoryDealGetDouble(dealTicket, DEAL_COMMISSION) +
      HistoryDealGetDouble(dealTicket, DEAL_SWAP) +
      HistoryDealGetDouble(dealTicket, DEAL_FEE);
   string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
   datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   string openingOrderType = FindOpeningOrderType(positionId, dealType);
   string positionDirection = PositionDirectionFromOrderType(openingOrderType);

   // Use positionId as the stable ticket so OPEN and CLOSED events for the
   // same position share the same key and the backend upsert merges them.
   ulong ticket = positionId > 0 ? (ulong)positionId : dealTicket;

   if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) {
      SendTradeEvent(
         "OPEN",
         ticket,
         symbol,
         side,
         openingOrderType,
         positionDirection,
         volume,
         true,
         price,
         false,
         0.0,
         stopLoss > 0.0,
         stopLoss,
         takeProfit > 0.0,
         takeProfit,
         profit,
         comment,
         dealTime,
         false,
         0
      );
      return true;
   }

   if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY) {
      datetime openedAt = FindOpenedAt(positionId, dealTime);
      double entryPrice = FindEntryPrice(positionId, price);
      SendTradeEvent(
         "CLOSED",
         ticket,
         symbol,
         side,
         openingOrderType,
         positionDirection,
         volume,
         true,
         entryPrice,
         true,
         price,
         stopLoss > 0.0,
         stopLoss,
         takeProfit > 0.0,
         takeProfit,
         profit,
         comment,
         openedAt,
         true,
         dealTime
      );
      return true;
   }

   Log(StringFormat("Deal %I64u: skipped entry=%d type=%d sym=%s", dealTicket, entry, dealType, symbol));
   return false;
}

int SyncTradeHistory() {
   if (g_state != ST_CONNECTED)
      return 0;

   datetime historyFrom = (datetime)(TimeCurrent() - 365 * 24 * 3600);
   bool selected = HistorySelect(historyFrom, TimeCurrent());
   int ordersTotal = HistoryOrdersTotal();
   Log(StringFormat("SyncTradeHistory: HistorySelect=%s orders=%d deals=%d reported=%d",
      selected ? "true" : "false",
      ordersTotal,
      HistoryDealsTotal(),
      ArraySize(g_reportedDealTickets)
   ));

   if (!selected)
      return 0;

   // Collect unique position IDs from historical orders.
   // HistorySelectByPosition avoids broker-specific HistoryDealGetTicket(i)=0 issues.
   ulong positionIds[];
   int posCount = 0;
   for (int i = 0; i < ordersTotal; i++) {
      ulong orderTicket = HistoryOrderGetTicket(i);
      if (orderTicket == 0) continue;
      long posId = (long)HistoryOrderGetInteger(orderTicket, ORDER_POSITION_ID);
      if (posId <= 0) continue;
      bool found = false;
      for (int k = 0; k < posCount; k++) {
         if (positionIds[k] == (ulong)posId) { found = true; break; }
      }
      if (!found) {
         ArrayResize(positionIds, posCount + 1);
         positionIds[posCount++] = (ulong)posId;
      }
   }

   int syncedTrades = 0;

   if (posCount > 0) {
      Log(StringFormat("SyncTradeHistory: %d unique positions", posCount));
      for (int p = 0; p < posCount; p++) {
         if (!HistorySelectByPosition(positionIds[p])) continue;
         int dealsInPos = HistoryDealsTotal();
         for (int j = 0; j < dealsInPos; j++) {
            ulong dealTicket = HistoryDealGetTicket(j);
            if (dealTicket == 0) continue;
            if (ContainsReportedDeal(dealTicket)) continue;
            if (SendTradeEventFromDeal(dealTicket)) {
               AddReportedDeal(dealTicket);
               syncedTrades++;
            }
         }
      }
   } else {
      // Fallback: iterate deals directly when no historical orders exist
      int total = HistoryDealsTotal();
      int zeroTickets = 0;
      for (int i = 0; i < total; i++) {
         ulong dealTicket = HistoryDealGetTicket(i);
         if (dealTicket == 0) { zeroTickets++; continue; }
         if (ContainsReportedDeal(dealTicket)) continue;
         if (SendTradeEventFromDeal(dealTicket)) {
            AddReportedDeal(dealTicket);
            syncedTrades++;
         }
      }
      Log(StringFormat("SyncTradeHistory: fallback zeroTickets=%d total=%d", zeroTickets, total));
   }

   Log(StringFormat("SyncTradeHistory: done synced=%d positions=%d", syncedTrades, posCount));
   g_lastTradeHistorySyncAt = TimeCurrent();
   return syncedTrades;
}

void SendRejectedTradeEvent(
   string symbol,
   string side,
   double volume,
   string entryKind,
   double entryPrice,
   double stopLoss,
   double takeProfit,
   string comment
) {
   ulong pseudoTicket = (ulong)(TimeLocal() * 1000 + MathRand());
   datetime nowTime = TimeCurrent();
   string reason = g_trade.ResultRetcodeDescription();
   string payloadComment = (comment == "" ? reason : comment + " | " + reason);

   SendTradeEvent(
      "REJECTED",
      pseudoTicket,
      symbol,
      side,
      side,
      side == "BUY" ? "LONG" : "SHORT",
      volume,
      entryKind == "LIMIT",
      entryPrice,
      false,
      0.0,
      stopLoss > 0.0,
      stopLoss,
      takeProfit > 0.0,
      takeProfit,
      0.0,
      payloadComment,
      nowTime,
      true,
      nowTime
   );
}

bool ExecuteTradePayload(string data, double lotPerTrade, int tradeIndex) {
   string symbol = JsonStr(data, "symbol");
   string side = JsonStr(data, "type");
   string entryKind = JsonStr(data, "entry");
   string signalId = JsonStr(data, "signal_id");
   string executionKey = JsonStr(data, "execution_key");
   double entryPrice = JsonNum(data, "entry_price");
   double stopLoss = JsonNum(data, "stop_loss");
   double takeProfit = JsonNum(data, "take_profit");
   double requestedVolume = JsonNum(data, "volume");

   if (symbol == "" || side == "" || entryKind == "") {
      SendCommandResult("OPEN", symbol, false, "Invalid trade payload", signalId, executionKey);
      return false;
   }

   if (!EnableTrading) {
      SendCommandResult("OPEN", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
      return true;
   }

   double normalizedLot = NormalizeVolumeForSymbol(symbol, requestedVolume > 0.0 ? requestedVolume : lotPerTrade);
   if (normalizedLot <= 0.0) {
      SendCommandResult("OPEN", symbol, false, "LotSize must be greater than zero", signalId, executionKey);
      return false;
   }

   g_trade.SetExpertMagicNumber(MagicNumber);
   g_trade.SetDeviationInPoints(Slippage);

   // The execution key goes in the order comment so the server can trace this
   // fill back to the copy order that requested it, which is how a later close
   // or SL/TP change on the master finds the right position here.
   string comment = (executionKey != "") ? executionKey : StringFormat("TradePilot-%d", tradeIndex);
   bool isBuy = (side == "BUY");
   bool success = false;

   if (entryKind == "LIMIT" && entryPrice > 0.0) {
      if (isBuy)
         success = g_trade.BuyLimit(normalizedLot, entryPrice, symbol, stopLoss, takeProfit, ORDER_TIME_GTC, 0, comment);
      else
         success = g_trade.SellLimit(normalizedLot, entryPrice, symbol, stopLoss, takeProfit, ORDER_TIME_GTC, 0, comment);
   } else {
      if (isBuy)
         success = g_trade.Buy(normalizedLot, symbol, 0.0, stopLoss, takeProfit, comment);
      else
         success = g_trade.Sell(normalizedLot, symbol, 0.0, stopLoss, takeProfit, comment);
   }

   if (success) {
      SendCommandResult("OPEN", symbol, true, "Trade request accepted", signalId, executionKey);
      Log(StringFormat("Trade accepted: %s %s lot %.2f TP %.5f", symbol, side, normalizedLot, takeProfit));
      return true;
   }

   SendCommandResult("OPEN", symbol, false, g_trade.ResultRetcodeDescription(), signalId, executionKey);
   Log(StringFormat("Trade failed: retcode=%d %s", (int)g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription()));
   SendRejectedTradeEvent(symbol, side, normalizedLot, entryKind, entryPrice, stopLoss, takeProfit, comment);
   return false;
}

void HandleSignalMessage(string msg) {
   string payloads[];
   int payloadCount = ExtractSignalObjects(msg, payloads);

   if (payloadCount <= 0) {
      Log("Signal payload was empty");
      return;
   }

   int activeCount = payloadCount;
   if (UseTpCount > 0 && UseTpCount < activeCount)
      activeCount = UseTpCount;

   double lotPerTrade = LotSize;
   for (int i = 0; i < activeCount; i++)
      ExecuteTradePayload(payloads[i], lotPerTrade, i + 1);
}

bool MatchesPositionTarget(ulong ticket, string symbol, string ticketFilter) {
   if (ticketFilter != "" && (string)ticket != ticketFilter)
      return false;
   if (symbol != "" && PositionGetString(POSITION_SYMBOL) != symbol)
      return false;
   return ticketFilter != "" || symbol != "";
}

bool ExecutePartialClose(string symbol, string ticketFilter, double percent) {
   bool anySuccess = false;

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if (!MatchesPositionTarget(ticket, symbol, ticketFilter))
         continue;

      double volume = PositionGetDouble(POSITION_VOLUME);
      double closeVolume = NormalizeVolumeForSymbol(symbol, volume * percent / 100.0);
      if (closeVolume <= 0.0 || closeVolume > volume)
         closeVolume = volume;

      if (g_trade.PositionClosePartial(ticket, closeVolume))
         anySuccess = true;
   }

   return anySuccess;
}

bool ExecuteCloseAll(string symbol, string ticketFilter) {
   bool anySuccess = false;

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if (!MatchesPositionTarget(ticket, symbol, ticketFilter))
         continue;

      if (g_trade.PositionClose(ticket))
         anySuccess = true;
   }

   for (int j = OrdersTotal() - 1; j >= 0; j--) {
      ulong orderTicket = OrderGetTicket(j);
      if (orderTicket == 0 || !OrderSelect(orderTicket))
         continue;

      if (ticketFilter != "")
         continue;
      if (symbol != "" && OrderGetString(ORDER_SYMBOL) != symbol)
         continue;

      ENUM_ORDER_TYPE orderType = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if (orderType == ORDER_TYPE_BUY_LIMIT ||
          orderType == ORDER_TYPE_SELL_LIMIT ||
          orderType == ORDER_TYPE_BUY_STOP ||
          orderType == ORDER_TYPE_SELL_STOP ||
          orderType == ORDER_TYPE_BUY_STOP_LIMIT ||
          orderType == ORDER_TYPE_SELL_STOP_LIMIT) {
         if (g_trade.OrderDelete(orderTicket))
            anySuccess = true;
      }
   }

   return anySuccess;
}

bool ExecuteMoveSl(string symbol, string ticketFilter, double newStopLoss, double newTakeProfit) {
   bool anySuccess = false;

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if (!MatchesPositionTarget(ticket, symbol, ticketFilter))
         continue;

      double currentStopLoss = PositionGetDouble(POSITION_SL);
      double currentTakeProfit = PositionGetDouble(POSITION_TP);
      double targetStopLoss = newStopLoss > 0.0 ? newStopLoss : currentStopLoss;
      double targetTakeProfit = newTakeProfit > 0.0 ? newTakeProfit : currentTakeProfit;
      if (g_trade.PositionModify(ticket, targetStopLoss, targetTakeProfit))
         anySuccess = true;
   }

   return anySuccess;
}

void HandlePartialCloseMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string ticketFilter = JsonStr(msg, "ticket");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");
   double percent = JsonNum(msg, "percent");

   if ((symbol == "" && ticketFilter == "") || percent <= 0.0 || percent > 100.0) {
      SendCommandResult("PARTIAL_CLOSE", symbol, false, "Invalid partial close payload", signalId, executionKey);
      return;
   }

   if (!EnableTrading) {
      SendCommandResult("PARTIAL_CLOSE", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
      return;
   }

   bool success = ExecutePartialClose(symbol, ticketFilter, percent);
   SendCommandResult(
      "PARTIAL_CLOSE",
      symbol,
      success,
      success ? "Partial close request executed" : "No matching positions were partially closed",
      signalId,
      executionKey
   );
}

void HandleCloseAllMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string ticketFilter = JsonStr(msg, "ticket");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");

   if (symbol == "" && ticketFilter == "") {
      SendCommandResult("CLOSE_ALL", symbol, false, "Invalid close all payload", signalId, executionKey);
      return;
   }

   if (!EnableTrading) {
      SendCommandResult("CLOSE_ALL", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
      return;
   }

   bool success = ExecuteCloseAll(symbol, ticketFilter);
   SendCommandResult(
      "CLOSE_ALL",
      symbol,
      success,
      success ? "Close all request executed" : "No matching positions or orders were closed",
      signalId,
      executionKey
   );
}

void HandleMoveSlMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string ticketFilter = JsonStr(msg, "ticket");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");
   double newStopLoss = JsonNum(msg, "new_stop_loss");
   double newTakeProfit = JsonNum(msg, "new_take_profit");

   if ((symbol == "" && ticketFilter == "") || (newStopLoss <= 0.0 && newTakeProfit <= 0.0)) {
      SendCommandResult("MOVE_SL", symbol, false, "Invalid move SL payload", signalId, executionKey);
      return;
   }

   if (!EnableTrading) {
      SendCommandResult("MOVE_SL", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
      return;
   }

   bool success = ExecuteMoveSl(symbol, ticketFilter, newStopLoss, newTakeProfit);
   SendCommandResult(
      "MOVE_SL",
      symbol,
      success,
      success ? "Move SL request executed" : "No matching positions were updated",
      signalId,
      executionKey
   );
}

void HandleMessage(string msg) {
   g_lastMessageTime = TimeCurrent();

   string type = JsonStr(msg, "type");
   if (type == "") return;

   if (type == "auth_success") {
      g_state = ST_CONNECTED;
      g_reconnectAttempt = 0;
      Log("Auth success, ready for signals");
      SendSymbols();
      SendAccountStatus();
      SyncTradeHistory();
      return;
   }

   if (type == "error") {
      string errorMessage = JsonStr(msg, "message");
      Log("SERVER ERROR: " + errorMessage);
      if (g_state != ST_CONNECTED || StringFind(errorMessage, "Invalid API key") >= 0 || StringFind(errorMessage, "Authenticate") >= 0)
         Disconnect();
      return;
   }

   if (type == "ping") {
      double ts = JsonNum(msg, "timestamp");
      string pong = StringFormat("{\"type\":\"pong\",\"timestamp\":%.0f}", ts);
      WsSend(pong);
      return;
   }

   if (type == "pong") {
      return;
   }

   if (type == "sync_state") {
      string requestId = JsonStr(msg, "request_id");
      SendSymbols();
      SendAccountStatus();
      SendOpenPositionsSnapshot();
      int syncedTrades = 0;
      if (ArraySize(g_reportedDealTickets) == 0 || TimeCurrent() - g_lastTradeHistorySyncAt >= 60)
         syncedTrades = SyncTradeHistory();
      SendStateSyncComplete(requestId, syncedTrades);
      return;
   }

   if (type == "signal") {
      HandleSignalMessage(msg);
      return;
   }

   if (type == "partial_close") {
      HandlePartialCloseMessage(msg);
      return;
   }

   if (type == "close_all") {
      HandleCloseAllMessage(msg);
      return;
   }

   if (type == "move_sl") {
      HandleMoveSlMessage(msg);
   }
}

void ProcessFrames() {
   string payload;
   uchar opcode;

   while (ParseWsFrame(payload, opcode)) {
      if (opcode == 0x1) {
         HandleMessage(payload);
      } else if (opcode == 0x8) {
         Log("Server closed connection");
         Disconnect();
         return;
      } else if (opcode == 0x9) {
         uchar pongPayload[];
         WsSendControl(0xA, pongPayload);
      }
   }
}

void Disconnect() {
   if (g_socket != INVALID_HANDLE) {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }

   g_readLen = 0;
   ArrayResize(g_readBuf, 0);

   int delaySec = ReconnectDelaySec;
   for (int i = 0; i < g_reconnectAttempt && i < 7; i++)
      delaySec *= 2;
   if (g_reconnectAttempt >= 8)
      delaySec = 600;

   g_reconnectAfter = TimeCurrent() + delaySec;
   g_reconnectAttempt++;
   g_state = ST_DISCONNECTED;

   Log(StringFormat("Disconnected, reconnecting in %d s (attempt %d)", delaySec, g_reconnectAttempt));
}

void Connect() {
   if (ApiKey == "") {
      Log("ERROR: ApiKey is empty");
      return;
   }

   g_socket = SocketCreate();
   if (g_socket == INVALID_HANDLE) {
      Log("SocketCreate failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   g_state = ST_CONNECTING;
   Log(StringFormat("Connecting to %s:%d%s", ServerHost, ServerPort, WsPath));

   if (!SocketConnect(g_socket, ServerHost, ServerPort, 5000)) {
      Log("SocketConnect failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   if (UseSSL) {
      if (!SocketTlsHandshake(g_socket, ServerHost)) {
         Log("TLS handshake failed: " + (string)GetLastError());
         Disconnect();
         return;
      }
   }

   g_state = ST_HANDSHAKING;
   string req = "GET " + WsPath + " HTTP/1.1\r\n"
              + "Host: " + ServerHost + "\r\n"
              + "Upgrade: websocket\r\n"
              + "Connection: Upgrade\r\n"
              + "Sec-WebSocket-Key: " + g_wsKey + "\r\n"
              + "Sec-WebSocket-Version: 13\r\n"
              + "\r\n";

   if (!SocketWriteStr(req)) {
      Log("HTTP upgrade send failed");
      Disconnect();
      return;
   }

   string resp = "";
   for (int attempt = 0; attempt < 40 && resp == ""; attempt++) {
      Sleep(100);
      ReadAvailable();
      resp = ConsumeReadBuf();
   }

   if (StringFind(resp, "101") < 0) {
      Log("Unexpected upgrade response: " + StringSubstr(resp, 0, 120));
      Disconnect();
      return;
   }

   g_state = ST_AUTHENTICATING;
   string authMsg = StringFormat(
      "{\"type\":\"auth\",\"apiKey\":\"%s\",\"accountId\":\"%s\",\"accountName\":\"%s\"}",
      EscapeJson(ApiKey),
      AccountId(),
      EscapeJson(AccountNameLabel())
   );
   if (!WsSend(authMsg)) {
      Log("Auth send failed");
      Disconnect();
      return;
   }

   Log("-> auth");
   g_lastMessageTime = TimeCurrent();
}

int OnInit() {
   EventSetMillisecondTimer(100);
   MathSrand((int)TimeLocal());
   Log("EA v3.16 initialised, connecting");
   Connect();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   if (g_socket != INVALID_HANDLE) {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
   Log("EA removed");
}

void OnTimer() {
   if (g_state == ST_DISCONNECTED) {
      if (TimeCurrent() >= g_reconnectAfter)
         Connect();
      return;
   }

   if (!SocketIsConnected(g_socket)) {
      Log("Socket lost");
      Disconnect();
      return;
   }

   ReadAvailable();

   if (g_state == ST_AUTHENTICATING || g_state == ST_CONNECTED)
      ProcessFrames();

   if (g_state == ST_CONNECTED && (TimeCurrent() - g_lastPingSentAt >= 5))
      SendHeartbeat();

   if (g_state == ST_CONNECTED && (TimeCurrent() - g_lastAccountStatusSent >= 10))
      SendAccountStatus();

   if (g_state == ST_CONNECTED && (TimeCurrent() - g_lastSymbolsSent >= 60))
      SendSymbols();

   // Retry history sync if it stalled due to unloaded deal data (zeroTickets).
   // g_lastTradeHistorySyncAt stays at 0/old when zero-ticket deals are detected,
   // so this condition fires every ~5 s until all deals are loaded.
   if (g_state == ST_CONNECTED && ArraySize(g_reportedDealTickets) == 0 && TimeCurrent() - g_lastTradeHistorySyncAt >= 5)
      SyncTradeHistory();

   int heartbeatTimeout = (int)MathMax(HeartbeatTimeoutSec, ReconnectDelaySec * 2 + 5);
   if (g_state == ST_CONNECTED && g_lastMessageTime > 0) {
      if (TimeCurrent() - g_lastMessageTime > heartbeatTimeout) {
         Log("Heartbeat timeout, reconnecting");
         Disconnect();
      }
   }
}

void OnTradeTransaction(
   const MqlTradeTransaction &trans,
   const MqlTradeRequest &request,
   const MqlTradeResult &result
) {
   if (trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   if (trans.deal == 0)
      return;

   if (!HistorySelect(0, TimeCurrent()))
      return;

   if (ContainsReportedDeal(trans.deal))
      return;

   if (SendTradeEventFromDeal(trans.deal))
      AddReportedDeal(trans.deal);
}
