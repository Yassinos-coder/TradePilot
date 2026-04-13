//+------------------------------------------------------------------+
//|  TradePilot_EA.mq4                                               |
//|  Connects to TradePilot WebSocket gateway and executes signals   |
//|  Requires: Tools > Options > Expert Advisors > Allow DLL imports |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property strict

//--- winhttp.dll WebSocket API
#import "winhttp.dll"
   int  WinHttpOpen(string agent, int accessType, string proxy, string bypass, int flags);
   int  WinHttpConnect(int session, string server, int port, int reserved);
   int  WinHttpOpenRequest(int conn, string verb, string url, string version,
                           string referrer, int acceptTypes, int flags);
   bool WinHttpSendRequest(int req, string headers, int headersLen,
                           int optional, int optLen, int totalLen, int context);
   bool WinHttpReceiveResponse(int req, int reserved);
   int  WinHttpWebSocketCompleteUpgrade(int req, int context);
   bool WinHttpWebSocketSend(int ws, int bufType,
                             uchar &buf[], int bufLen);
   bool WinHttpWebSocketReceive(int ws, uchar &buf[], int bufLen,
                                int &bytesRead, int &bufType);
   bool WinHttpWebSocketClose(int ws, int status,
                              uchar &reason[], int reasonLen);
   bool WinHttpCloseHandle(int handle);
#import

//--- Input parameters
input string ServerHost          = "tradepilot.yassinecastro.com"; // Server hostname
input int    ServerPort          = 443;                             // Port (443=WSS, 80=WS)
input bool   UseSSL              = true;                            // Use TLS
input string WsPath              = "/ws/ea";                        // WebSocket endpoint
input string ApiKey              = "";                              // TradePilot API key
input double LotSize             = 0.01;                            // Lot size per trade
input int    UseTpCount          = 1;                               // TPs to use (1-3)
input int    Slippage            = 3;                               // Slippage in points
input int    MagicNumber         = 20260413;                        // Magic number
input bool   EnableTrading       = true;                            // false = log only
input int    ReconnectDelaySec   = 5;                               // Base reconnect delay (s)

//--- WinHTTP constants
#define WINHTTP_ACCESS_TYPE_DEFAULT_PROXY   0
#define WINHTTP_NO_PROXY_NAME               ""
#define WINHTTP_NO_PROXY_BYPASS             ""
#define WINHTTP_FLAG_SECURE                 0x00800000
#define WINHTTP_FLAG_ASYNC                  0x10000000
#define WINHTTP_ADDREQ_FLAG_ADD             0x20000000
#define WINHTTP_WS_BUFFER_TYPE_UTF8_MESSAGE 2

//--- Connection states
enum EState { ST_DISCONNECTED, ST_CONNECTED, ST_AUTHENTICATING };

//--- Globals
EState   g_state            = ST_DISCONNECTED;
int      g_hSession         = 0;
int      g_hConnect         = 0;
int      g_hRequest         = 0;
int      g_hWs              = 0;
int      g_reconnectAttempt = 0;
datetime g_reconnectAfter   = 0;
datetime g_lastMessageTime  = 0;
string   g_pendingMsg       = "";

//+------------------------------------------------------------------+
//| Utility log                                                      |
//+------------------------------------------------------------------+
void Log(string msg) {
   Print("[TradePilot] ", msg);
}

//+------------------------------------------------------------------+
//| Extract a string value from JSON: "key":"value"                 |
//+------------------------------------------------------------------+
string JsonStr(string json, string key) {
   string needle = "\"" + key + "\":\"";
   int p = StringFind(json, needle);
   if (p < 0) return "";
   p += StringLen(needle);
   int q = StringFind(json, "\"", p);
   if (q < 0) return "";
   return StringSubstr(json, p, q - p);
}

//+------------------------------------------------------------------+
//| Extract a numeric value from JSON: "key":number                 |
//+------------------------------------------------------------------+
double JsonNum(string json, string key) {
   string needle = "\"" + key + "\":";
   int p = StringFind(json, needle);
   if (p < 0) return 0.0;
   p += StringLen(needle);
   while (p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   string num = "";
   int len = StringLen(json);
   for (int i = p; i < len; i++) {
      int c = StringGetCharacter(json, i);
      if (c >= '0' && c <= '9') { num += CharToStr((char)c); continue; }
      if (c == '.' || c == '-') { num += CharToStr((char)c); continue; }
      break;
   }
   return (num == "") ? 0.0 : StrToDouble(num);
}

//+------------------------------------------------------------------+
//| Extract take_profits array from JSON                            |
//+------------------------------------------------------------------+
void JsonTPs(string json, double &tps[], int &count) {
   count = 0;
   ArrayResize(tps, 3);
   int p = StringFind(json, "\"take_profits\":[");
   if (p < 0) return;
   p += 16;
   int len = StringLen(json);
   string num = "";
   for (int i = p; i < len; i++) {
      int c = StringGetCharacter(json, i);
      if (c == ']') {
         if (num != "" && count < 3) { tps[count++] = StrToDouble(num); }
         break;
      }
      if (c == ',') {
         if (num != "" && count < 3) { tps[count++] = StrToDouble(num); num = ""; }
         continue;
      }
      if ((c >= '0' && c <= '9') || c == '.' || c == '-') {
         num += CharToStr((char)c);
      }
   }
}

//+------------------------------------------------------------------+
//| Send a UTF-8 text message over the WS handle                    |
//+------------------------------------------------------------------+
bool WsSend(string text) {
   if (g_hWs == 0) return false;
   uchar buf[];
   int len = StringToCharArray(text, buf, 0, WHOLE_ARRAY) - 1; // strip null
   return WinHttpWebSocketSend(g_hWs, WINHTTP_WS_BUFFER_TYPE_UTF8_MESSAGE, buf, len);
}

//+------------------------------------------------------------------+
//| Try to read a message (non-blocking via short timeout approach)  |
//+------------------------------------------------------------------+
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

//+------------------------------------------------------------------+
//| Execute a trade from signal data                                 |
//+------------------------------------------------------------------+
void ExecuteSignal(string data) {
   string symbol   = JsonStr(data, "symbol");
   string side     = JsonStr(data, "type");
   string entryStr = JsonStr(data, "entry");
   double sl       = JsonNum(data, "stop_loss");

   double tps[];
   int tpCount;
   JsonTPs(data, tps, tpCount);

   if (symbol == "" || side == "") {
      Log("Invalid signal — missing symbol or side");
      return;
   }

   Log(StringFormat("<- signal: %s %s @ %s SL=%.5f TP[0]=%.5f",
       symbol, side, entryStr, sl, tpCount > 0 ? tps[0] : 0));

   if (!EnableTrading) {
      Log("EnableTrading=false — dry run only");
      return;
   }

   bool isBuy = (side == "BUY");

   int activeTps = MathMin(tpCount, MathMin(UseTpCount, 3));
   if (activeTps == 0) activeTps = 1;

   double lotPer = LotSize / activeTps;

   for (int i = 0; i < activeTps; i++) {
      double tp      = (tpCount > i) ? tps[i] : 0.0;
      double price   = isBuy ? Ask : Bid;
      int    optype  = isBuy ? OP_BUY : OP_SELL;
      color  clr     = isBuy ? Blue : Red;
      string comment = StringFormat("TradePilot-TP%d", i + 1);

      int ticket = OrderSend(symbol, optype, lotPer, price,
                             Slippage, sl, tp, comment,
                             MagicNumber, 0, clr);

      if (ticket > 0)
         Log(StringFormat("Trade opened: ticket #%d %s %s %.2f SL=%.5f TP=%.5f",
             ticket, symbol, side, lotPer, sl, tp));
      else
         Log(StringFormat("Trade failed: error=%d %s", GetLastError(), symbol));
   }
}

//+------------------------------------------------------------------+
//| Handle a decoded WS message                                      |
//+------------------------------------------------------------------+
void HandleMessage(string msg) {
   g_lastMessageTime = TimeCurrent();

   string type = JsonStr(msg, "type");
   if (type == "") return;

   if (type == "auth_success") {
      g_state = ST_CONNECTED;
      g_reconnectAttempt = 0;
      Log("Auth success — ready for signals");
   } else if (type == "error") {
      Log("ERROR: " + JsonStr(msg, "message"));
      Disconnect();
   } else if (type == "ping") {
      double ts = JsonNum(msg, "timestamp");
      WsSend(StringFormat("{\"type\":\"pong\",\"timestamp\":%.0f}", ts));
      Log(StringFormat("<- ping (ts=%.0f)", ts));
   } else if (type == "pong") {
      Log("<- pong");
   } else if (type == "signal") {
      int p = StringFind(msg, "\"data\":{");
      if (p >= 0) {
         int start = p + 7;
         int depth = 0;
         int end   = start;
         int len   = StringLen(msg);
         for (int i = start; i < len; i++) {
            int c = StringGetCharacter(msg, i);
            if (c == '{') depth++;
            else if (c == '}') {
               depth--;
               if (depth == 0) { end = i + 1; break; }
            }
         }
         ExecuteSignal(StringSubstr(msg, start, end - start));
      }
   }
}

//+------------------------------------------------------------------+
//| Close all WinHTTP handles                                        |
//+------------------------------------------------------------------+
void CloseHandles() {
   if (g_hWs      != 0) { WinHttpCloseHandle(g_hWs);      g_hWs      = 0; }
   if (g_hRequest != 0) { WinHttpCloseHandle(g_hRequest);  g_hRequest = 0; }
   if (g_hConnect != 0) { WinHttpCloseHandle(g_hConnect);  g_hConnect = 0; }
   if (g_hSession != 0) { WinHttpCloseHandle(g_hSession);  g_hSession = 0; }
}

//+------------------------------------------------------------------+
//| Disconnect and schedule reconnect                               |
//+------------------------------------------------------------------+
void Disconnect() {
   if (g_hWs != 0) {
      uchar reason[];
      ArrayResize(reason, 0);
      WinHttpWebSocketClose(g_hWs, 1000, reason, 0);
   }
   CloseHandles();

   int delaySec = ReconnectDelaySec;
   for (int i = 0; i < g_reconnectAttempt && i < 7; i++) delaySec *= 2;
   if (g_reconnectAttempt >= 8) delaySec = 600;

   g_reconnectAfter = TimeCurrent() + delaySec;
   g_reconnectAttempt++;
   g_state = ST_DISCONNECTED;

   Log(StringFormat("Disconnected — reconnecting in %d s (attempt %d)",
       delaySec, g_reconnectAttempt));
}

//+------------------------------------------------------------------+
//| Establish WebSocket connection via WinHTTP                      |
//+------------------------------------------------------------------+
void Connect() {
   if (ApiKey == "") {
      Log("ERROR: ApiKey is empty — set it in EA inputs");
      return;
   }

   CloseHandles();

   Log(StringFormat("Connecting to %s:%d%s", ServerHost, ServerPort, WsPath));

   int flags = WINHTTP_FLAG_ASYNC;
   g_hSession = WinHttpOpen("TradePilot-EA/1.0",
                            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                            WINHTTP_NO_PROXY_NAME,
                            WINHTTP_NO_PROXY_BYPASS,
                            flags);
   if (g_hSession == 0) {
      Log("WinHttpOpen failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   g_hConnect = WinHttpConnect(g_hSession, ServerHost, ServerPort, 0);
   if (g_hConnect == 0) {
      Log("WinHttpConnect failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   int reqFlags = UseSSL ? WINHTTP_FLAG_SECURE : 0;
   g_hRequest = WinHttpOpenRequest(g_hConnect, "GET", WsPath,
                                   "HTTP/1.1", "", 0, reqFlags);
   if (g_hRequest == 0) {
      Log("WinHttpOpenRequest failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   // Request WebSocket upgrade
   string upgradeHdr = "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                     + "Sec-WebSocket-Version: 13\r\n"
                     + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n";

   if (!WinHttpSendRequest(g_hRequest, upgradeHdr, -1, 0, 0, 0, 0)) {
      Log("WinHttpSendRequest failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   if (!WinHttpReceiveResponse(g_hRequest, 0)) {
      Log("WinHttpReceiveResponse failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   g_hWs = WinHttpWebSocketCompleteUpgrade(g_hRequest, 0);
   if (g_hWs == 0) {
      Log("WinHttpWebSocketCompleteUpgrade failed: " + (string)GetLastError());
      Disconnect();
      return;
   }

   // Authenticate
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

//+------------------------------------------------------------------+
//| Poll for incoming messages                                       |
//+------------------------------------------------------------------+
void PollMessages() {
   if (g_hWs == 0) return;
   if (g_state != ST_AUTHENTICATING && g_state != ST_CONNECTED) return;

   string msg;
   // Drain available messages (up to 10 per tick to avoid blocking)
   for (int i = 0; i < 10; i++) {
      if (!WsReceive(msg)) break;
      if (msg != "") HandleMessage(msg);
   }

   // Heartbeat timeout
   if (g_state == ST_CONNECTED && g_lastMessageTime > 0) {
      if (TimeCurrent() - g_lastMessageTime > 35) {
         Log("Heartbeat timeout — reconnecting");
         Disconnect();
      }
   }
}

//+------------------------------------------------------------------+
//| OnInit                                                          |
//+------------------------------------------------------------------+
int OnInit() {
   EventSetTimer(1);
   Log("EA initialised — connecting...");
   Connect();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| OnDeinit                                                        |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   EventKillTimer();
   CloseHandles();
   Log("EA removed");
}

//+------------------------------------------------------------------+
//| OnTimer — 1 s interval                                          |
//+------------------------------------------------------------------+
void OnTimer() {
   if (g_state == ST_DISCONNECTED) {
      if (TimeCurrent() >= g_reconnectAfter)
         Connect();
      return;
   }
   PollMessages();
}

//+------------------------------------------------------------------+
//| OnTick — additional polling on active markets                   |
//+------------------------------------------------------------------+
void OnTick() {
   if (g_state == ST_DISCONNECTED) return;
   PollMessages();
}
//+------------------------------------------------------------------+
