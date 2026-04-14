//+------------------------------------------------------------------+
//| TradePilot_EA.mq5                                                |
//| Connects to TradePilot WebSocket gateway and executes signals    |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "2.00"
#property strict

#include <Trade/Trade.mqh>

input group  "=== TradePilot Server ==="
input string ServerHost          = "tradepilot.yassinecastro.com";
input int    ServerPort          = 443;
input bool   UseSSL              = true;
input string WsPath              = "/ws/ea";

input group  "=== Authentication ==="
input string ApiKey              = "";

input group  "=== Trade Execution ==="
input double LotSize             = 0.01;
input int    UseTpCount          = 3;
input int    Slippage            = 10;
input ulong  MagicNumber         = 20260414;
input bool   EnableTrading       = true;

input group  "=== Connection ==="
input int    ReconnectDelaySec   = 5;

enum EState { ST_DISCONNECTED, ST_CONNECTING, ST_HANDSHAKING, ST_AUTHENTICATING, ST_CONNECTED };

EState        g_state            = ST_DISCONNECTED;
int           g_socket           = INVALID_HANDLE;
int           g_reconnectAttempt = 0;
datetime      g_reconnectAfter   = 0;
datetime      g_lastMessageTime  = 0;
datetime      g_lastAccountStatusSent = 0;
CTrade        g_trade;
string        g_wsKey            = "dGhlIHNhbXBsZSBub25jZQ==";

uchar g_readBuf[];
int   g_readLen = 0;

void Log(string msg) {
   Print("[TradePilot] ", msg);
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

bool WsSend(string text);
void Disconnect();

void WsBuildFrame(string text, uchar &frame[]) {
   uchar payload[];
   int plen = StringToCharArray(text, payload, 0, WHOLE_ARRAY, CP_UTF8) - 1;

   int headerLen = 2;
   bool extended = (plen > 125);
   if (extended) headerLen += 2;
   int totalLen = headerLen + 4 + plen;

   ArrayResize(frame, totalLen);
   frame[0] = 0x81;
   if (extended) {
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
      "{\"type\":\"account_status\",\"data\":{\"balance\":%s,\"equity\":%s,\"margin\":%s,\"freeMargin\":%s,\"drawdownPercent\":%s,\"openPositions\":%d}}",
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

void SendTradeEvent(
   string status,
   ulong ticket,
   string symbol,
   string side,
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
      "{\"type\":\"trade_event\",\"data\":{\"ticket\":\"%I64u\",\"signal_id\":null,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%s,\"entry_price\":%s,\"exit_price\":%s,\"stop_loss\":%s,\"take_profit\":%s,\"profit\":%s,\"status\":\"%s\",\"comment\":\"%s\",\"opened_at\":\"%s\",\"closed_at\":%s}}",
      ticket,
      symbol,
      side,
      DoubleToString(volume, 2),
      JsonNullableNumber(hasEntryPrice, entryPrice, 5),
      JsonNullableNumber(hasExitPrice, exitPrice, 5),
      JsonNullableNumber(hasStopLoss, stopLoss, 5),
      JsonNullableNumber(hasTakeProfit, takeProfit, 5),
      DoubleToString(profit, 2),
      status,
      comment,
      IsoTimestamp(openedAt),
      hasClosedAt ? "\"" + IsoTimestamp(closedAt) + "\"" : "null"
   );

   if (WsSend(payload))
      Log("-> trade_event " + status + " ticket " + (string)ticket);
}

datetime FindOpenedAt(long positionId, datetime fallback) {
   if (positionId <= 0)
      return fallback;

   if (!HistorySelect(0, TimeCurrent()))
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
      if (candidate < openedAt)
         openedAt = candidate;
   }

   return openedAt;
}

void SendTradeEventFromDeal(ulong dealTicket) {
   if (!HistoryDealSelect(dealTicket))
      return;

   long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if (dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      return;

   string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   string side = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double stopLoss = HistoryDealGetDouble(dealTicket, DEAL_SL);
   double takeProfit = HistoryDealGetDouble(dealTicket, DEAL_TP);
   double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
   datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

   if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) {
      SendTradeEvent(
         "OPEN",
         dealTicket,
         symbol,
         side,
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
      return;
   }

   if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY) {
      datetime openedAt = FindOpenedAt(positionId, dealTime);
      SendTradeEvent(
         "CLOSED",
         dealTicket,
         symbol,
         side,
         volume,
         true,
         price,
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
   }
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
   double entryPrice = JsonNum(data, "entry_price");
   double stopLoss = JsonNum(data, "stop_loss");
   double takeProfit = JsonNum(data, "take_profit");

   if (symbol == "" || side == "" || entryKind == "") {
      Log("Invalid trade payload");
      return false;
   }

   if (!EnableTrading) {
      Log("EnableTrading=false, dry run only");
      return true;
   }

   g_trade.SetExpertMagicNumber(MagicNumber);
   g_trade.SetDeviationInPoints(Slippage);

   string comment = StringFormat("TradePilot-%d", tradeIndex);
   bool isBuy = (side == "BUY");
   bool success = false;

   if (entryKind == "LIMIT" && entryPrice > 0.0) {
      if (isBuy)
         success = g_trade.BuyLimit(lotPerTrade, entryPrice, symbol, stopLoss, takeProfit, ORDER_TIME_GTC, 0, comment);
      else
         success = g_trade.SellLimit(lotPerTrade, entryPrice, symbol, stopLoss, takeProfit, ORDER_TIME_GTC, 0, comment);
   } else {
      if (isBuy)
         success = g_trade.Buy(lotPerTrade, symbol, 0.0, stopLoss, takeProfit, comment);
      else
         success = g_trade.Sell(lotPerTrade, symbol, 0.0, stopLoss, takeProfit, comment);
   }

   if (success) {
      Log(StringFormat("Trade accepted: %s %s lot %.2f TP %.5f", symbol, side, lotPerTrade, takeProfit));
      return true;
   }

   Log(StringFormat("Trade failed: retcode=%d %s", (int)g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription()));
   SendRejectedTradeEvent(symbol, side, lotPerTrade, entryKind, entryPrice, stopLoss, takeProfit, comment);
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

   double lotPerTrade = (activeCount > 0) ? LotSize / activeCount : LotSize;
   for (int i = 0; i < activeCount; i++)
      ExecuteTradePayload(payloads[i], lotPerTrade, i + 1);
}

void HandleMessage(string msg) {
   g_lastMessageTime = TimeCurrent();

   string type = JsonStr(msg, "type");
   if (type == "") return;

   if (type == "auth_success") {
      g_state = ST_CONNECTED;
      g_reconnectAttempt = 0;
      Log("Auth success, ready for signals");
      SendAccountStatus();
      return;
   }

   if (type == "error") {
      Log("ERROR: " + JsonStr(msg, "message"));
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
      Log("<- pong");
      return;
   }

   if (type == "signal") {
      HandleSignalMessage(msg);
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
         uchar pongFrame[2];
         pongFrame[0] = 0x8A;
         pongFrame[1] = 0x00;
         if (UseSSL) SocketTlsSend(g_socket, pongFrame, 2);
         else        SocketSend(g_socket, pongFrame, 2);
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

   Sleep(300);
   ReadAvailable();
   string resp = ConsumeReadBuf();

   if (StringFind(resp, "101") < 0) {
      Log("Unexpected upgrade response: " + StringSubstr(resp, 0, 120));
      Disconnect();
      return;
   }

   g_state = ST_AUTHENTICATING;
   string authMsg = "{\"type\":\"auth\",\"apiKey\":\"" + ApiKey + "\"}";
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
   Log("EA initialised, connecting");
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

   if (g_state == ST_CONNECTED && (TimeCurrent() - g_lastAccountStatusSent >= 10))
      SendAccountStatus();

   if (g_state == ST_CONNECTED && g_lastMessageTime > 0) {
      if (TimeCurrent() - g_lastMessageTime > 12) {
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

   SendTradeEventFromDeal(trans.deal);
}
