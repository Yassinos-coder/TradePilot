//+------------------------------------------------------------------+
//|  TradePilot_EA.mq5                                               |
//|  Connects to TradePilot WebSocket gateway and executes signals   |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//--- Input parameters
input group  "=== TradePilot Server ==="
input string ServerHost          = "tradepilot.yassinecastro.com"; // Server hostname
input int    ServerPort          = 443;                             // Port  (443=WSS  80=WS)
input bool   UseSSL              = true;                            // Enable TLS/WSS
input string WsPath              = "/ws/ea";                        // WebSocket endpoint

input group  "=== Authentication ==="
input string ApiKey              = "";                              // API key from TradePilot dashboard

input group  "=== Trade Execution ==="
input double LotSize             = 0.01;                            // Base lot size
input int    UseTpCount          = 1;                               // TP orders to open (1-3)
input int    Slippage            = 10;                              // Max slippage (points)
input ulong  MagicNumber         = 20260413;                        // Magic number
input bool   EnableTrading       = true;                            // FALSE = dry-run (log only)

input group  "=== Connection ==="
input int    ReconnectDelaySec   = 5;                               // Base reconnect delay (s)

//--- Connection states
enum EState { ST_DISCONNECTED, ST_CONNECTING, ST_HANDSHAKING, ST_AUTHENTICATING, ST_CONNECTED };

//--- Globals
EState        g_state            = ST_DISCONNECTED;
int           g_socket           = INVALID_HANDLE;
int           g_reconnectAttempt = 0;
datetime      g_reconnectAfter   = 0;
datetime      g_lastMessageTime  = 0;
CTrade        g_trade;
string        g_wsKey            = "dGhlIHNhbXBsZSBub25jZQ=="; // fixed Sec-WebSocket-Key

//--- Read buffer (accumulate partial frames)
uchar g_readBuf[];
int   g_readLen = 0;

//+------------------------------------------------------------------+
//| Utility log                                                       |
//+------------------------------------------------------------------+
void Log(string msg) {
   Print("[TradePilot] ", msg);
}

//+------------------------------------------------------------------+
//| Extract a string value from JSON: "key":"value"                  |
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
//| Extract a numeric value from JSON: "key":number                  |
//+------------------------------------------------------------------+
double JsonNum(string json, string key) {
   string needle = "\"" + key + "\":";
   int p = StringFind(json, needle);
   if (p < 0) return 0.0;
   p += StringLen(needle);
   // skip whitespace
   while (p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   // read digits and decimal point
   string num = "";
   int len = StringLen(json);
   for (int i = p; i < len; i++) {
      ushort c = StringGetCharacter(json, i);
      if (c >= '0' && c <= '9') { num += CharToString((uchar)c); continue; }
      if (c == '.' || c == '-') { num += CharToString((uchar)c); continue; }
      break;
   }
   return (num == "") ? 0.0 : StringToDouble(num);
}

//+------------------------------------------------------------------+
//| Extract take_profits array from JSON                             |
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
      ushort c = StringGetCharacter(json, i);
      if (c == ']') {
         if (num != "" && count < 3) { tps[count++] = StringToDouble(num); }
         break;
      }
      if (c == ',') {
         if (num != "" && count < 3) { tps[count++] = StringToDouble(num); num = ""; }
         continue;
      }
      if ((c >= '0' && c <= '9') || c == '.' || c == '-') {
         num += CharToString((uchar)c);
      }
   }
}

//+------------------------------------------------------------------+
//| Build a masked WebSocket text frame (RFC 6455)                   |
//+------------------------------------------------------------------+
void WsBuildFrame(string text, uchar &frame[]) {
   uchar payload[];
   int plen = StringToCharArray(text, payload, 0, WHOLE_ARRAY, CP_UTF8) - 1; // strip null

   int headerLen = 2;
   bool extended = (plen > 125);
   if (extended) headerLen += 2;
   int totalLen = headerLen + 4 + plen; // +4 for mask

   ArrayResize(frame, totalLen);
   frame[0] = 0x81; // FIN=1, opcode=text
   if (extended) {
      frame[1] = (uchar)(0x80 | 0x7E); // MASK=1, 126
      frame[2] = (uchar)((plen >> 8) & 0xFF);
      frame[3] = (uchar)(plen & 0xFF);
   } else {
      frame[1] = (uchar)(0x80 | plen); // MASK=1
   }

   // Random 4-byte mask
   uchar mask[4];
   mask[0] = (uchar)(MathRand() & 0xFF);
   mask[1] = (uchar)(MathRand() & 0xFF);
   mask[2] = (uchar)(MathRand() & 0xFF);
   mask[3] = (uchar)(MathRand() & 0xFF);
   frame[headerLen]     = mask[0];
   frame[headerLen + 1] = mask[1];
   frame[headerLen + 2] = mask[2];
   frame[headerLen + 3] = mask[3];

   // XOR payload with mask
   for (int i = 0; i < plen; i++) {
      frame[headerLen + 4 + i] = payload[i] ^ mask[i % 4];
   }
}

//+------------------------------------------------------------------+
//| Send a text message over the WebSocket                           |
//+------------------------------------------------------------------+
bool WsSend(string text) {
   if (g_socket == INVALID_HANDLE) return false;
   uchar frame[];
   WsBuildFrame(text, frame);
   if (UseSSL)
      return SocketTlsSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
   else
      return SocketSend(g_socket, frame, ArraySize(frame)) == ArraySize(frame);
}

//+------------------------------------------------------------------+
//| Send raw bytes (for HTTP upgrade)                                |
//+------------------------------------------------------------------+
bool SocketWriteStr(string s) {
   uchar buf[];
   int len = StringToCharArray(s, buf, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if (UseSSL)
      return SocketTlsSend(g_socket, buf, len) == len;
   else
      return SocketSend(g_socket, buf, len) == len;
}

//+------------------------------------------------------------------+
//| Read available bytes into g_readBuf                              |
//+------------------------------------------------------------------+
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

//+------------------------------------------------------------------+
//| Consume g_readBuf as string                                      |
//+------------------------------------------------------------------+
string ConsumeReadBuf() {
   if (g_readLen == 0) return "";
   string s = CharArrayToString(g_readBuf, 0, g_readLen, CP_UTF8);
   g_readLen = 0;
   ArrayResize(g_readBuf, 0);
   return s;
}

//+------------------------------------------------------------------+
//| Parse one WS frame from g_readBuf; returns payload or ""         |
//+------------------------------------------------------------------+
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
      // oversized frame — skip
      return false;
   }

   int totalLen = headerLen + plen;
   if (g_readLen < totalLen) return false;

   // Extract payload bytes
   uchar data[];
   ArrayResize(data, plen);
   for (int i = 0; i < plen; i++)
      data[i] = g_readBuf[headerLen + i];

   payload = CharArrayToString(data, 0, plen, CP_UTF8);

   // Consume frame from buffer
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

//+------------------------------------------------------------------+
//| Execute a trade from signal data                                 |
//+------------------------------------------------------------------+
void ExecuteSignal(string data) {
   string symbol    = JsonStr(data, "symbol");
   string side      = JsonStr(data, "type");
   string entryStr  = JsonStr(data, "entry");
   double sl        = JsonNum(data, "stop_loss");

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

   g_trade.SetExpertMagicNumber(MagicNumber);
   g_trade.SetDeviationInPoints(Slippage);

   int activeTps = MathMin(tpCount, MathMin(UseTpCount, 3));
   if (activeTps == 0) activeTps = 1;

   double lotPer = LotSize / activeTps;

   bool isBuy = (side == "BUY");
   ENUM_ORDER_TYPE orderType = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   for (int i = 0; i < activeTps; i++) {
      double tp = (tpCount > i) ? tps[i] : 0.0;
      string comment = StringFormat("TradePilot-TP%d", i + 1);

      bool ok;
      if (isBuy)
         ok = g_trade.Buy(lotPer, symbol, 0, sl, tp, comment);
      else
         ok = g_trade.Sell(lotPer, symbol, 0, sl, tp, comment);

      if (ok)
         Log(StringFormat("Trade opened: ticket #%d %s %s %.2f SL=%.5f TP=%.5f",
             (int)g_trade.ResultOrder(), symbol, side, lotPer, sl, tp));
      else
         Log(StringFormat("Trade failed: retcode=%d %s", (int)g_trade.ResultRetcode(),
             g_trade.ResultRetcodeDescription()));
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
      string errMsg = JsonStr(msg, "message");
      Log("ERROR: " + errMsg);
      Disconnect();
   } else if (type == "ping") {
      double ts = JsonNum(msg, "timestamp");
      string pong = StringFormat("{\"type\":\"pong\",\"timestamp\":%.0f}", ts);
      WsSend(pong);
      long latency = (long)(TimeCurrent() * 1000) - (long)ts;
      Log(StringFormat("<- ping (latency %d ms)", (int)latency));
   } else if (type == "pong") {
      Log("<- pong");
   } else if (type == "signal") {
      // find "data":{...}
      int p = StringFind(msg, "\"data\":{");
      if (p >= 0) {
         int start = p + 7;
         int depth = 0;
         int end = start;
         int len = StringLen(msg);
         for (int i = start; i < len; i++) {
            ushort c = StringGetCharacter(msg, i);
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
//| Process all buffered WS frames                                   |
//+------------------------------------------------------------------+
void ProcessFrames() {
   string payload;
   uchar opcode;

   while (ParseWsFrame(payload, opcode)) {
      if (opcode == 0x1) { // text
         HandleMessage(payload);
      } else if (opcode == 0x8) { // close
         Log("Server closed connection");
         Disconnect();
         return;
      } else if (opcode == 0x9) { // ping from server
         // send pong frame
         uchar pongFrame[2];
         pongFrame[0] = 0x8A; // FIN=1, opcode=pong
         pongFrame[1] = 0x00;
         if (UseSSL) SocketTlsSend(g_socket, pongFrame, 2);
         else        SocketSend(g_socket, pongFrame, 2);
      }
   }
}

//+------------------------------------------------------------------+
//| Close socket and reset state                                     |
//+------------------------------------------------------------------+
void Disconnect() {
   if (g_socket != INVALID_HANDLE) {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
   g_readLen = 0;
   ArrayResize(g_readBuf, 0);

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
//| Initiate connection                                              |
//+------------------------------------------------------------------+
void Connect() {
   if (ApiKey == "") {
      Log("ERROR: ApiKey is empty — set it in EA inputs");
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

   // Send HTTP Upgrade request
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

   // Wait briefly for 101 response
   Sleep(300);
   ReadAvailable();
   string resp = ConsumeReadBuf();

   if (StringFind(resp, "101") < 0) {
      Log("Unexpected upgrade response: " + StringSubstr(resp, 0, 120));
      Disconnect();
      return;
   }

   // Send auth
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
//| OnInit                                                           |
//+------------------------------------------------------------------+
int OnInit() {
   EventSetMillisecondTimer(100);
   Log("EA initialised — connecting...");
   Connect();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| OnDeinit                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   EventKillTimer();
   if (g_socket != INVALID_HANDLE) {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
   Log("EA removed");
}

//+------------------------------------------------------------------+
//| OnTimer — called every 100 ms                                    |
//+------------------------------------------------------------------+
void OnTimer() {
   // Reconnect logic
   if (g_state == ST_DISCONNECTED) {
      if (TimeCurrent() >= g_reconnectAfter)
         Connect();
      return;
   }

   // Check socket still valid
   if (!SocketIsConnected(g_socket)) {
      Log("Socket lost");
      Disconnect();
      return;
   }

   // Read incoming bytes
   ReadAvailable();

   // If handshaking, responses already handled inside Connect()
   // After that, process WS frames normally
   if (g_state == ST_AUTHENTICATING || g_state == ST_CONNECTED) {
      ProcessFrames();
   }

   // Heartbeat timeout — server pings every ~10 s, we expect at least one per 35 s
   if (g_state == ST_CONNECTED && g_lastMessageTime > 0) {
      if (TimeCurrent() - g_lastMessageTime > 35) {
         Log("Heartbeat timeout — reconnecting");
         Disconnect();
      }
   }
}
//+------------------------------------------------------------------+
