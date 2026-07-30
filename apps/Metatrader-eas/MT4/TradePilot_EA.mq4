//+------------------------------------------------------------------+
//| TradePilot_EA.mq4                                                |
//| Connects to TradePilot WebSocket gateway and executes signals    |
//| Requires: Tools > Options > Expert Advisors > Allow DLL imports  |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "3.01"
#property strict

#import "winhttp.dll"
   int  WinHttpOpen(string agent, int accessType, string proxy, string bypass, int flags);
   int  WinHttpConnect(int session, string server, int port, int reserved);
   int  WinHttpOpenRequest(int conn, string verb, string url, string version,
                           string referrer, int acceptTypes, int flags);
   bool WinHttpSendRequest(int req, string headers, int headersLen,
                           int optional, int optLen, int totalLen, int context);
   bool WinHttpReceiveResponse(int req, int reserved);
   int  WinHttpWebSocketCompleteUpgrade(int req, int context);
   bool WinHttpWebSocketSend(int ws, int bufType, uchar &buf[], int bufLen);
   bool WinHttpWebSocketReceive(int ws, uchar &buf[], int bufLen, int &bytesRead, int &bufType);
   bool WinHttpWebSocketClose(int ws, int status, uchar &reason[], int reasonLen);
   bool WinHttpCloseHandle(int handle);
#import

input string ServerHost          = "tradepilot.yassinecastro.com";
input int    ServerPort          = 443;
input bool   UseSSL              = true;
input string WsPath              = "/ws/ea";
input string ApiKey              = "";
input double LotSize             = 0.01;
input int    UseTpCount          = 1;
input int    Slippage            = 3;
input int    MagicNumber         = 20260417;
input bool   EnableTrading       = true;
input int    ReconnectDelaySec   = 5;

#define WINHTTP_ACCESS_TYPE_DEFAULT_PROXY   0
#define WINHTTP_NO_PROXY_NAME               ""
#define WINHTTP_NO_PROXY_BYPASS             ""
#define WINHTTP_FLAG_SECURE                 0x00800000
#define WINHTTP_FLAG_ASYNC                  0x10000000
#define WINHTTP_WS_BUFFER_TYPE_UTF8_MESSAGE 2

enum EState { ST_DISCONNECTED, ST_CONNECTED, ST_AUTHENTICATING };

EState   g_state                 = ST_DISCONNECTED;
int      g_hSession              = 0;
int      g_hConnect              = 0;
int      g_hRequest              = 0;
int      g_hWs                   = 0;
int      g_reconnectAttempt      = 0;
datetime g_reconnectAfter        = 0;
datetime g_lastMessageTime       = 0;
datetime g_lastPingSentAt        = 0;
datetime g_lastAccountStatusSent = 0;
datetime g_lastSymbolsSent       = 0;
datetime g_lastTradeSyncAt       = 0;
bool     g_fullHistorySynced     = false;
int      g_openReportedTickets[];
int      g_closedReportedTickets[];

void Log(string msg) {
   Print("[TradePilot] ", msg);
}

string EscapeJson(string value) {
   string result = "";
   int len = StringLen(value);

   for (int i = 0; i < len; i++) {
      int c = StringGetCharacter(value, i);

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
         result += CharToStr(c);
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
      int c = StringGetCharacter(json, i);
      if ((c >= '0' && c <= '9') || c == '.' || c == '-') {
         num += CharToStr((char)c);
         continue;
      }
      break;
   }
   return (num == "") ? 0.0 : StrToDouble(num);
}

string IsoTimestamp(datetime value) {
   return TimeToString(value, TIME_DATE | TIME_SECONDS);
}

string AccountId() {
   return IntegerToString(AccountNumber());
}

string AccountNameLabel() {
   string name = AccountName();
   if (name == "")
      return AccountCompany();
   return name;
}

double NormalizeVolumeForSymbol(string symbol, double volume) {
   if (volume <= 0.0)
      return 0.0;

   double step = MarketInfo(symbol, MODE_LOTSTEP);
   double minLot = MarketInfo(symbol, MODE_MINLOT);
   double maxLot = MarketInfo(symbol, MODE_MAXLOT);

   if (step <= 0.0)
      step = 0.01;

   double normalized = MathFloor(volume / step + 0.5) * step;

   if (minLot > 0.0 && normalized < minLot)
      normalized = minLot;

   if (maxLot > 0.0 && normalized > maxLot)
      normalized = maxLot;

   return NormalizeDouble(normalized, 2);
}

bool ContainsTicket(int &arr[], int ticket) {
   for (int i = 0; i < ArraySize(arr); i++) {
      if (arr[i] == ticket)
         return true;
   }
   return false;
}

void AddTicket(int &arr[], int ticket) {
   if (ContainsTicket(arr, ticket))
      return;

   int size = ArraySize(arr);
   ArrayResize(arr, size + 1);
   arr[size] = ticket;
}

bool WsSend(string text) {
   if (g_hWs == 0) return false;
   uchar buf[];
   int len = StringToCharArray(text, buf, 0, WHOLE_ARRAY) - 1;
   return WinHttpWebSocketSend(g_hWs, WINHTTP_WS_BUFFER_TYPE_UTF8_MESSAGE, buf, len);
}

bool WsReceive(string &out) {
   if (g_hWs == 0) return false;

   uchar buf[8192];
   int bytesRead = 0;
   int bufType   = 0;

   if (!WinHttpWebSocketReceive(g_hWs, buf, 8192, bytesRead, bufType))
      return false;

   if (bytesRead <= 0) return false;

   out = CharArrayToString(buf, 0, bytesRead);
   return true;
}

void SendCommandResult(string action, string symbol, bool success, string message, string signalId, string executionKey) {
   if (g_state != ST_CONNECTED || g_hWs == 0)
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

   WsSend(payload);
}

void SendSymbols() {
   if (g_state != ST_CONNECTED || g_hWs == 0)
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

   if (WsSend(payload))
      g_lastSymbolsSent = TimeCurrent();
}

void SendHeartbeat() {
   if (g_state != ST_CONNECTED || g_hWs == 0)
      return;

   long timestamp = TimeCurrent() * 1000;
   string payload = StringFormat("{\"type\":\"ping\",\"timestamp\":%d}", timestamp);

   if (WsSend(payload))
      g_lastPingSentAt = TimeCurrent();
}

void SendAccountStatus() {
   if (g_state != ST_CONNECTED || g_hWs == 0)
      return;

   double balance = AccountBalance();
   double equity = AccountEquity();
   double margin = AccountMargin();
   double freeMargin = AccountFreeMargin();
   double drawdown = 0.0;

   if (balance > 0.0)
      drawdown = MathMax(0.0, (balance - equity) / balance * 100.0);

   int openPositions = 0;
   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      if (OrderType() == OP_BUY || OrderType() == OP_SELL)
         openPositions++;
   }

   string payload = StringFormat(
      "{\"type\":\"account_status\",\"accountId\":\"%s\",\"data\":{\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"drawdownPercent\":%.2f,\"openPositions\":%d}}",
      AccountId(),
      balance,
      equity,
      margin,
      freeMargin,
      drawdown,
      openPositions
   );

   if (WsSend(payload))
      g_lastAccountStatusSent = TimeCurrent();
}

void SendTradeEvent(
   string status,
   int ticket,
   string symbol,
   string side,
   double volume,
   double entryPrice,
   double exitPrice,
   double stopLoss,
   double takeProfit,
   double profit,
   string comment,
   datetime openedAt,
   datetime closedAt
) {
   if (g_state != ST_CONNECTED || g_hWs == 0)
      return;

   string payload = StringFormat(
      "{\"type\":\"trade_event\",\"accountId\":\"%s\",\"data\":{\"ticket\":\"%d\",\"signal_id\":null,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,\"entry_price\":%.5f,\"exit_price\":%s,\"stop_loss\":%s,\"take_profit\":%s,\"profit\":%.2f,\"status\":\"%s\",\"comment\":\"%s\",\"opened_at\":\"%s\",\"closed_at\":%s}}",
      AccountId(),
      ticket,
      EscapeJson(symbol),
      EscapeJson(side),
      volume,
      entryPrice,
      status == "OPEN" ? "null" : DoubleToStr(exitPrice, 5),
      stopLoss > 0 ? DoubleToStr(stopLoss, 5) : "null",
      takeProfit > 0 ? DoubleToStr(takeProfit, 5) : "null",
      profit,
      EscapeJson(status),
      EscapeJson(comment),
      IsoTimestamp(openedAt),
      status == "OPEN" ? "null" : "\"" + IsoTimestamp(closedAt) + "\""
   );

   WsSend(payload);
}

void SendStateSyncComplete(string requestId, int syncedTrades) {
   if (requestId == "" || g_state != ST_CONNECTED || g_hWs == 0)
      return;

   string payload = StringFormat(
      "{\"type\":\"sync_state_complete\",\"accountId\":\"%s\",\"request_id\":\"%s\",\"synced_at\":\"%s\",\"synced_trades\":%d}",
      AccountId(),
      EscapeJson(requestId),
      EscapeJson(IsoTimestamp(TimeCurrent())),
      syncedTrades
   );

   WsSend(payload);
}

int SyncTradeEvents(bool includeFullHistory) {
   int syncedTrades = 0;

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      int type = OrderType();
      if (type != OP_BUY && type != OP_SELL)
         continue;

      int ticket = OrderTicket();
      if (ContainsTicket(g_openReportedTickets, ticket))
         continue;

      SendTradeEvent(
         "OPEN",
         ticket,
         OrderSymbol(),
         type == OP_BUY ? "BUY" : "SELL",
         OrderLots(),
         OrderOpenPrice(),
         0.0,
         OrderStopLoss(),
         OrderTakeProfit(),
         OrderProfit() + OrderSwap() + OrderCommission(),
         OrderComment(),
         OrderOpenTime(),
         0
      );
      AddTicket(g_openReportedTickets, ticket);
      syncedTrades++;
   }

   int historyTotal = OrdersHistoryTotal();
   int start = includeFullHistory ? 0 : MathMax(0, historyTotal - 200);
   for (int j = historyTotal - 1; j >= start; j--) {
      if (!OrderSelect(j, SELECT_BY_POS, MODE_HISTORY))
         continue;

      int type = OrderType();
      if (type != OP_BUY && type != OP_SELL)
         continue;

      int ticket = OrderTicket();
      if (ContainsTicket(g_closedReportedTickets, ticket))
         continue;

      SendTradeEvent(
         "CLOSED",
         ticket,
         OrderSymbol(),
         type == OP_BUY ? "BUY" : "SELL",
         OrderLots(),
         OrderOpenPrice(),
         OrderClosePrice(),
         OrderStopLoss(),
         OrderTakeProfit(),
         OrderProfit() + OrderSwap() + OrderCommission(),
         OrderComment(),
         OrderOpenTime(),
         OrderCloseTime()
      );
      AddTicket(g_closedReportedTickets, ticket);
      syncedTrades++;
   }

   return syncedTrades;
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
      int c = StringGetCharacter(message, i);
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

bool ExecuteOpenPayload(string data, double lotPerTrade, int tradeIndex) {
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

   int cmd;
   double price;
   color clr;
   bool isBuy = side == "BUY";
   // The execution key goes in the order comment so the server can trace this
   // fill back to the copy order that requested it, which is how a later close
   // or SL/TP change on the master finds the right position here.
   string comment = (executionKey != "") ? executionKey : "TradePilot-" + IntegerToString(tradeIndex);

   if (entryKind == "LIMIT" && entryPrice > 0.0) {
      cmd = isBuy ? OP_BUYLIMIT : OP_SELLLIMIT;
      price = entryPrice;
   } else if (entryKind == "STOP" && entryPrice > 0.0) {
      cmd = isBuy ? OP_BUYSTOP : OP_SELLSTOP;
      price = entryPrice;
   } else if (entryKind == "STOP_LIMIT") {
      SendCommandResult("OPEN", symbol, false, "STOP_LIMIT orders are not supported yet; use STOP or LIMIT", signalId, executionKey);
      return false;
   } else {
      cmd = isBuy ? OP_BUY : OP_SELL;
      price = isBuy ? Ask : Bid;
   }

   clr = isBuy ? Blue : Red;
   ResetLastError();
   int ticket = OrderSend(symbol, cmd, normalizedLot, price, Slippage, stopLoss, takeProfit, comment, MagicNumber, 0, clr);

   if (ticket > 0) {
      SendCommandResult("OPEN", symbol, true, "Trade request accepted", signalId, executionKey);
      return true;
   }

   SendCommandResult(
      "OPEN",
      symbol,
      false,
      "OrderSend failed (" + IntegerToString(GetLastError()) + ")",
      signalId,
      executionKey
   );
   return false;
}

bool ExecutePartialClose(string symbol, double percent) {
   bool anySuccess = false;

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      int type = OrderType();
      if ((type != OP_BUY && type != OP_SELL) || OrderSymbol() != symbol)
         continue;

      double closeLots = NormalizeVolumeForSymbol(symbol, OrderLots() * percent / 100.0);
      if (closeLots <= 0.0 || closeLots > OrderLots())
         closeLots = OrderLots();

      double closePrice = type == OP_BUY ? Bid : Ask;
      if (OrderClose(OrderTicket(), closeLots, closePrice, Slippage, clrNONE))
         anySuccess = true;
   }

   return anySuccess;
}

bool ExecuteCloseAll(string symbol) {
   bool anySuccess = false;

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      int type = OrderType();
      if (OrderSymbol() != symbol)
         continue;

      if (type == OP_BUY || type == OP_SELL) {
         double closePrice = type == OP_BUY ? Bid : Ask;
         if (OrderClose(OrderTicket(), OrderLots(), closePrice, Slippage, clrNONE))
            anySuccess = true;
      } else if (type == OP_BUYLIMIT || type == OP_SELLLIMIT || type == OP_BUYSTOP || type == OP_SELLSTOP) {
         if (OrderDelete(OrderTicket()))
            anySuccess = true;
      }
   }

   return anySuccess;
}

bool ExecuteMoveSl(string symbol, double newStopLoss) {
   bool anySuccess = false;

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      int type = OrderType();
      if ((type != OP_BUY && type != OP_SELL) || OrderSymbol() != symbol)
         continue;

      if (OrderModify(OrderTicket(), OrderOpenPrice(), newStopLoss, OrderTakeProfit(), 0, clrNONE))
         anySuccess = true;
   }

   return anySuccess;
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
      ExecuteOpenPayload(payloads[i], lotPerTrade, i + 1);
}

void HandlePartialCloseMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");
   double percent = JsonNum(msg, "percent");

   bool success = symbol != "" && percent > 0.0 && percent <= 100.0 && (!EnableTrading || ExecutePartialClose(symbol, percent));
   SendCommandResult(
      "PARTIAL_CLOSE",
      symbol,
      success,
      success ? "Partial close request executed" : "No matching orders were partially closed",
      signalId,
      executionKey
   );
}

void HandleCloseAllMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");

   bool success = symbol != "" && (!EnableTrading || ExecuteCloseAll(symbol));
   SendCommandResult(
      "CLOSE_ALL",
      symbol,
      success,
      success ? "Close all request executed" : "No matching orders were closed",
      signalId,
      executionKey
   );
}

void HandleMoveSlMessage(string msg) {
   string symbol = JsonStr(msg, "symbol");
   string signalId = JsonStr(msg, "signal_id");
   string executionKey = JsonStr(msg, "execution_key");
   double newStopLoss = JsonNum(msg, "new_stop_loss");

   bool success = symbol != "" && newStopLoss > 0.0 && (!EnableTrading || ExecuteMoveSl(symbol, newStopLoss));
   SendCommandResult(
      "MOVE_SL",
      symbol,
      success,
      success ? "Move SL request executed" : "No matching orders were updated",
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
      SyncTradeEvents(true);
      g_fullHistorySynced = true;
      g_lastTradeSyncAt = TimeCurrent();
      return;
   }

   if (type == "error") {
      Log("ERROR: " + JsonStr(msg, "message"));
      Disconnect();
      return;
   }

   if (type == "ping") {
      double ts = JsonNum(msg, "timestamp");
      WsSend(StringFormat("{\"type\":\"pong\",\"timestamp\":%.0f}", ts));
      return;
   }

   if (type == "pong") {
      return;
   }

   if (type == "sync_state") {
      string requestId = JsonStr(msg, "request_id");
      SendSymbols();
      SendAccountStatus();
      int syncedTrades = SyncTradeEvents(!g_fullHistorySynced);
      g_fullHistorySynced = true;
      g_lastTradeSyncAt = TimeCurrent();
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

void CloseHandles() {
   if (g_hWs      != 0) { WinHttpCloseHandle(g_hWs);      g_hWs      = 0; }
   if (g_hRequest != 0) { WinHttpCloseHandle(g_hRequest);  g_hRequest = 0; }
   if (g_hConnect != 0) { WinHttpCloseHandle(g_hConnect);  g_hConnect = 0; }
   if (g_hSession != 0) { WinHttpCloseHandle(g_hSession);  g_hSession = 0; }
}

void Disconnect() {
   if (g_hWs != 0) {
      uchar reason[];
      ArrayResize(reason, 0);
      WinHttpWebSocketClose(g_hWs, 1000, reason, 0);
   }
   CloseHandles();

   int delaySec = ReconnectDelaySec;
   for (int i = 0; i < g_reconnectAttempt && i < 7; i++)
      delaySec *= 2;
   if (g_reconnectAttempt >= 8)
      delaySec = 600;

   g_reconnectAfter = TimeCurrent() + delaySec;
   g_reconnectAttempt++;
   g_state = ST_DISCONNECTED;
   g_fullHistorySynced = false;

   Log(StringFormat("Disconnected, reconnecting in %d s (attempt %d)", delaySec, g_reconnectAttempt));
}

void Connect() {
   if (ApiKey == "") {
      Log("ERROR: ApiKey is empty");
      return;
   }

   CloseHandles();

   int flags = WINHTTP_FLAG_ASYNC;
   g_hSession = WinHttpOpen("TradePilot-EA/3.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, flags);
   if (g_hSession == 0) {
      Disconnect();
      return;
   }

   g_hConnect = WinHttpConnect(g_hSession, ServerHost, ServerPort, 0);
   if (g_hConnect == 0) {
      Disconnect();
      return;
   }

   int reqFlags = UseSSL ? WINHTTP_FLAG_SECURE : 0;
   g_hRequest = WinHttpOpenRequest(g_hConnect, "GET", WsPath, "HTTP/1.1", "", 0, reqFlags);
   if (g_hRequest == 0) {
      Disconnect();
      return;
   }

   string upgradeHdr = "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                     + "Sec-WebSocket-Version: 13\r\n"
                     + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n";

   if (!WinHttpSendRequest(g_hRequest, upgradeHdr, -1, 0, 0, 0, 0)) {
      Disconnect();
      return;
   }

   if (!WinHttpReceiveResponse(g_hRequest, 0)) {
      Disconnect();
      return;
   }

   g_hWs = WinHttpWebSocketCompleteUpgrade(g_hRequest, 0);
   if (g_hWs == 0) {
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
      Disconnect();
      return;
   }

   g_lastMessageTime = TimeCurrent();
}

void PollMessages() {
   if (g_hWs == 0) return;
   if (g_state != ST_AUTHENTICATING && g_state != ST_CONNECTED) return;

   string msg;
   for (int i = 0; i < 10; i++) {
      if (!WsReceive(msg)) break;
      if (msg != "") HandleMessage(msg);
   }

   if (g_state == ST_CONNECTED && TimeCurrent() - g_lastPingSentAt >= 5)
      SendHeartbeat();

   if (g_state == ST_CONNECTED && TimeCurrent() - g_lastAccountStatusSent >= 10)
      SendAccountStatus();

   if (g_state == ST_CONNECTED && TimeCurrent() - g_lastSymbolsSent >= 60)
      SendSymbols();

   if (g_state == ST_CONNECTED && TimeCurrent() - g_lastTradeSyncAt >= 5) {
      SyncTradeEvents(!g_fullHistorySynced);
      g_fullHistorySynced = true;
      g_lastTradeSyncAt = TimeCurrent();
   }

   if (g_state == ST_CONNECTED && g_lastMessageTime > 0 && TimeCurrent() - g_lastMessageTime > 12) {
      Log("Heartbeat timeout, reconnecting");
      Disconnect();
   }
}

int OnInit() {
   EventSetTimer(1);
   Log("EA initialised, connecting");
   Connect();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   CloseHandles();
   Log("EA removed");
}

void OnTimer() {
   if (g_state == ST_DISCONNECTED) {
      if (TimeCurrent() >= g_reconnectAfter)
         Connect();
      return;
   }

   PollMessages();
}

void OnTick() {
   if (g_state == ST_DISCONNECTED) return;
   PollMessages();
}
