//+------------------------------------------------------------------+
//| TradePilot_RiskGuard_EA.mq5                                     |
//| Standalone live position-size calculator + daily/overall loss   |
//| guard. Fully self-contained: no server, no network, no other EA |
//| dependency. Runs entirely inside the MT5 terminal.              |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property description "Live position size calculator with an on-chart GUI, plus a daily-loss / overall-equity-loss guard that auto-closes losing positions and blocks new exposure once tripped."

#include <Trade/Trade.mqh>

#define PFX "TPRG_"

enum ENUM_RISK_MODE  { RISK_MODE_PERCENT = 0, RISK_MODE_MONEY = 1 };
enum ENUM_SL_MODE    { SL_MODE_PIPS = 0, SL_MODE_PERCENT = 1 };
enum ENUM_LIMIT_MODE { LIMIT_MODE_MONEY = 0, LIMIT_MODE_PERCENT = 1 };

input group "=== Panel ==="
input ENUM_BASE_CORNER PanelCorner            = CORNER_LEFT_UPPER;
input int              PanelX                 = 12;
input int              PanelY                 = 24;

input group "=== Position Size Calculator (first-run defaults only) ==="
input double           DefaultRiskPercent      = 1.0;    // Used the first time the panel ever loads
input double           DefaultRiskMoney        = 50.0;
input double           DefaultStopLossPips     = 30.0;
input double           DefaultStopLossPercent  = 0.30;

input group "=== Daily Loss Limit (broker trading day, first-run defaults only) ==="
input double           DefaultDailyLossMoney   = 50.0;   // Account currency; 0 = off
input double           DefaultDailyLossPercent = 3.0;    // % of day-start balance; 0 = off
input bool             DailyLimitStartsInMoneyMode = true;

input group "=== Overall Loss Limit (from peak equity, first-run defaults only) ==="
input double           DefaultOverallLossMoney   = 0.0;  // Account currency; 0 = off
input double           DefaultOverallLossPercent = 10.0; // % of peak equity; 0 = off
input bool             OverallLimitStartsInMoneyMode = false;

input group "=== Enforcement ==="
input bool             CloseLosingPositionsOnTrip = true;  // Positions currently in the red are closed; profitable ones are left open
input bool             BlockNewTradesWhileTripped = true;   // Anything opened/placed after a trip is closed/deleted on the next tick
input int              TimerSeconds               = 1;      // Enforcement + panel refresh cadence, independent of price ticks

//+------------------------------------------------------------------+
//| State                                                             |
//+------------------------------------------------------------------+
CTrade   g_trade;
string   g_prefix;

ENUM_RISK_MODE   g_riskMode;
double           g_riskPercent, g_riskMoney;

ENUM_SL_MODE     g_slMode;
double           g_slPips, g_slPercent;

ENUM_LIMIT_MODE  g_dailyMode;
double           g_dailyMoney, g_dailyPercent;

ENUM_LIMIT_MODE  g_overallMode;
double           g_overallMoney, g_overallPercent;

double           g_peakEquity;
bool             g_dailyTripped;
datetime         g_dailyTripDay;
datetime         g_dailyTripTime;
bool             g_overallTripped;
datetime         g_overallTripTime;

// Last computed figures, kept around purely so the panel can redraw between
// enforcement passes without recomputing everything on a plain redraw event.
double g_lastDayPnl = 0.0;
double g_lastDayStartBalance = 0.0;
double g_lastOverallLossAmount = 0.0;
double g_lastOverallLossPercent = 0.0;

//+------------------------------------------------------------------+
//| Persistence (terminal GlobalVariables, keyed by account login so |
//| multiple accounts in the same terminal never collide)            |
//+------------------------------------------------------------------+
string GKey(const string suffix) { return g_prefix + suffix; }

void GSetD(const string suffix, const double value) { GlobalVariableSet(GKey(suffix), value); }

double GGetD(const string suffix, const double fallback) {
   string key = GKey(suffix);
   if (!GlobalVariableCheck(key)) return fallback;
   return GlobalVariableGet(key);
}

void GDel(const string suffix) {
   string key = GKey(suffix);
   if (GlobalVariableCheck(key)) GlobalVariableDel(key);
}

//+------------------------------------------------------------------+
//| Broker-day helpers (mirrors the pattern already proven in        |
//| TradePilot_ATR_Excursion_EA.mq5 for consistent broker-day math)   |
//+------------------------------------------------------------------+
datetime BrokerDayStart(const datetime value) {
   MqlDateTime parts;
   TimeToStruct(value, parts);
   parts.hour = 0;
   parts.min = 0;
   parts.sec = 0;
   return StructToTime(parts);
}

double AccountDayPnl(double &dayStartBalance) {
   datetime startTime = BrokerDayStart(TimeCurrent());
   double realized = 0.0;
   if (HistorySelect(startTime, TimeCurrent())) {
      for (int i = 0; i < HistoryDealsTotal(); i++) {
         ulong deal = HistoryDealGetTicket(i);
         if (deal == 0) continue;
         long type = HistoryDealGetInteger(deal, DEAL_TYPE);
         if (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue; // excludes deposits/withdrawals/credit
         realized += HistoryDealGetDouble(deal, DEAL_PROFIT) +
                     HistoryDealGetDouble(deal, DEAL_COMMISSION) +
                     HistoryDealGetDouble(deal, DEAL_SWAP) +
                     HistoryDealGetDouble(deal, DEAL_FEE);
      }
   }
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   dayStartBalance = balance - realized;
   return realized + (equity - balance);
}

//+------------------------------------------------------------------+
//| Position size / calculator math                                  |
//+------------------------------------------------------------------+
double PipSize() {
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   return (digits == 3 || digits == 5) ? point * 10.0 : point;
}

double ReferencePrice() {
   MqlTick tick;
   if (!SymbolInfoTick(_Symbol, tick) || tick.bid <= 0.0 || tick.ask <= 0.0) {
      return SymbolInfoDouble(_Symbol, SYMBOL_BID);
   }
   return (tick.bid + tick.ask) / 2.0;
}

double SlDistanceInPrice() {
   if (g_slMode == SL_MODE_PIPS) return g_slPips * PipSize();
   return ReferencePrice() * (g_slPercent / 100.0);
}

// Account-currency value of a given price distance for exactly 1.0 lot.
// SYMBOL_TRADE_TICK_VALUE is already broker/account-currency converted, so
// this works for cross pairs, metals and indices without a manual FX table.
double ValuePerLotForDistance(const double priceDistance) {
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if (tickSize <= 0.0) return 0.0;
   return (priceDistance / tickSize) * tickValue;
}

double NormalizeVolume(const double requested) {
   double minVol = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxVol = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if (step <= 0.0) step = 0.01;
   double result = MathFloor(requested / step + 1e-9) * step;
   result = MathMin(result, maxVol);
   if (result < minVol) return 0.0;
   int stepDigits = 0;
   double s = step;
   while (s < 0.999999 && stepDigits < 8) { s *= 10.0; stepDigits++; }
   return NormalizeDouble(result, stepDigits);
}

double MarginForLots(const double lots) {
   if (lots <= 0.0) return 0.0;
   double margin = 0.0;
   if (!OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, lots, ReferencePrice(), margin)) return 0.0;
   return margin;
}

//+------------------------------------------------------------------+
//| Risk engine                                                       |
//+------------------------------------------------------------------+
void UpdatePeakEquity() {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if (equity > g_peakEquity) {
      g_peakEquity = equity;
      GSetD("peakEquity", g_peakEquity);
   }
}

bool CheckDailyTrip(double &dayPnl, double &dayStartBalance) {
   dayPnl = AccountDayPnl(dayStartBalance);
   datetime today = BrokerDayStart(TimeCurrent());

   if (g_dailyTripped && g_dailyTripDay != today) {
      g_dailyTripped = false;
      GDel("dailyTripped");
      GDel("dailyTripDay");
      GDel("dailyTripTime");
      Print("[TP RiskGuard] New broker day — daily loss trip cleared automatically.");
   }

   if (g_dailyTripped) return true;

   bool tripped = false;
   if (g_dailyMode == LIMIT_MODE_MONEY) {
      tripped = g_dailyMoney > 0.0 && dayPnl <= -g_dailyMoney;
   } else {
      tripped = g_dailyPercent > 0.0 && dayStartBalance > 0.0 &&
                (dayPnl / dayStartBalance * 100.0) <= -g_dailyPercent;
   }

   if (tripped) {
      g_dailyTripped = true;
      g_dailyTripDay = today;
      g_dailyTripTime = TimeCurrent();
      GSetD("dailyTripped", 1.0);
      GSetD("dailyTripDay", (double)g_dailyTripDay);
      GSetD("dailyTripTime", (double)g_dailyTripTime);
      string msg = StringFormat("[TP RiskGuard] DAILY LOSS LIMIT HIT on %s: day P/L %.2f. Trading blocked until next broker day.",
                                 AccountInfoString(ACCOUNT_SERVER), dayPnl);
      Print(msg);
      Alert(msg);
   }

   return g_dailyTripped;
}

bool CheckOverallTrip(double &overallLossAmount, double &overallLossPercent) {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   overallLossAmount = MathMax(0.0, g_peakEquity - equity);
   overallLossPercent = g_peakEquity > 0.0 ? (overallLossAmount / g_peakEquity * 100.0) : 0.0;

   if (g_overallTripped) return true;

   bool tripped = false;
   if (g_overallMode == LIMIT_MODE_MONEY) {
      tripped = g_overallMoney > 0.0 && overallLossAmount >= g_overallMoney;
   } else {
      tripped = g_overallPercent > 0.0 && overallLossPercent >= g_overallPercent;
   }

   if (tripped) {
      g_overallTripped = true;
      g_overallTripTime = TimeCurrent();
      GSetD("overallTripped", 1.0);
      GSetD("overallTripTime", (double)g_overallTripTime);
      string msg = StringFormat("[TP RiskGuard] OVERALL LOSS LIMIT HIT: down %.2f from peak equity %.2f. Trading blocked until you click Resume.",
                                 overallLossAmount, g_peakEquity);
      Print(msg);
      Alert(msg);
   }

   return g_overallTripped;
}

// Closes every currently losing position on the ENTIRE account (all symbols,
// all magic numbers — this guard is account-wide by design). Profitable
// positions are left completely untouched, including their own SL/TP.
void CloseLosingPositions() {
   if (!CloseLosingPositionsOnTrip) return;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      double netFloating = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      if (netFloating < 0.0) {
         if (!g_trade.PositionClose(ticket)) {
            Print("[TP RiskGuard] Failed to close losing position #", ticket, ": ", g_trade.ResultRetcodeDescription());
         }
      }
   }
}

// While tripped, MT5 gives no API to preemptively veto a manual click or a
// new order before it fills — so this reactively closes/deletes anything
// opened or placed after the trip moment, on the very next tick/timer pass.
void BlockNewExposure() {
   if (!BlockNewTradesWhileTripped) return;

   datetime cutoff = 0;
   if (g_dailyTripped) cutoff = MathMax(cutoff, g_dailyTripTime);
   if (g_overallTripped) cutoff = MathMax(cutoff, g_overallTripTime);
   if (cutoff == 0) return;

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      if (openTime > cutoff) {
         if (!g_trade.PositionClose(ticket)) {
            Print("[TP RiskGuard] Failed to block new position #", ticket, ": ", g_trade.ResultRetcodeDescription());
         }
      }
   }

   for (int i = OrdersTotal() - 1; i >= 0; i--) {
      ulong ticket = OrderGetTicket(i);
      if (ticket == 0) continue;
      datetime setupTime = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      if (setupTime > cutoff) {
         if (!g_trade.OrderDelete(ticket)) {
            Print("[TP RiskGuard] Failed to delete blocked pending order #", ticket, ": ", g_trade.ResultRetcodeDescription());
         }
      }
   }
}

void EnforceRiskRules() {
   UpdatePeakEquity();

   double dayPnl = 0.0, dayStartBalance = 0.0;
   bool dailyNow = CheckDailyTrip(dayPnl, dayStartBalance);

   double overallLossAmount = 0.0, overallLossPercent = 0.0;
   bool overallNow = CheckOverallTrip(overallLossAmount, overallLossPercent);

   if (dailyNow || overallNow) {
      CloseLosingPositions();
      BlockNewExposure();
   }

   g_lastDayPnl = dayPnl;
   g_lastDayStartBalance = dayStartBalance;
   g_lastOverallLossAmount = overallLossAmount;
   g_lastOverallLossPercent = overallLossPercent;
}

void ManualResume() {
   if (!g_dailyTripped && !g_overallTripped) return;
   g_dailyTripped = false;
   g_overallTripped = false;
   GDel("dailyTripped"); GDel("dailyTripDay"); GDel("dailyTripTime");
   GDel("overallTripped"); GDel("overallTripTime");
   Print("[TP RiskGuard] Trading manually resumed by trader at ", TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES), ".");
}

//+------------------------------------------------------------------+
//| GUI object helpers                                                |
//+------------------------------------------------------------------+
void CreateRect(const string name, const int x, const int y, const int w, const int h, const color bg, const color border) {
   if (ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 0);
}

void CreateLabel(const string name, const int x, const int y, const string text, const color clr, const int fontSize = 9, const bool bold = false) {
   if (ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, bold ? "Segoe UI Semibold" : "Segoe UI");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 1);
}

void SetLabelText(const string name, const string text) {
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

void SetLabelColor(const string name, const color clr) {
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

void CreateEdit(const string name, const int x, const int y, const int w, const int h, const string text) {
   if (ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, name, OBJPROP_READONLY, false);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clrDimGray);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, clrSilver);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 2);
}

void CreateButton(const string name, const int x, const int y, const int w, const int h, const string text, const bool pressed = false) {
   if (ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clrDimGray);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, clrSilver);
   ObjectSetInteger(0, name, OBJPROP_STATE, pressed);
   ObjectSetInteger(0, name, OBJPROP_COLOR, pressed ? clrLime : clrSilver);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 2);
}

void SetToggleState(const string name, const bool active) {
   ObjectSetInteger(0, name, OBJPROP_STATE, active);
   ObjectSetInteger(0, name, OBJPROP_COLOR, active ? clrLime : clrSilver);
}

//+------------------------------------------------------------------+
//| Panel layout                                                      |
//+------------------------------------------------------------------+
#define PANEL_W    336
#define ROW_H      20
#define PAD        10
#define LBL_W      118
#define EDIT_W     70
#define BTN_W      62
#define BTN_H      18

// Forward-declared here for readability; MQL5 resolves all global-scope
// function calls against the whole compiled module, not just what precedes
// the call site, so definition order below does not matter.

void BuildPanel() {
   int y = PanelY;
   int x0 = PanelX;

   // Section: header (height finalized after we know every row's Y below)
   y += 6;
   CreateLabel(PFX + "lblTitle", x0 + PAD, y, "TradePilot Risk Guard", clrWhite, 11, true);
   y += ROW_H;
   CreateLabel(PFX + "lblSubtitle", x0 + PAD, y, "", clrSilver, 8);
   y += ROW_H + 4;

   CreateLabel(PFX + "lblSecAccount", x0 + PAD, y, "ACCOUNT", clrDodgerBlue, 8, true);
   y += ROW_H - 2;
   CreateLabel(PFX + "lblBalance", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblEquity", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblFreeMargin", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblMarginUsed", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblLeverage", x0 + PAD, y, "", clrWhite, 9); y += ROW_H + 4;

   CreateLabel(PFX + "lblSecCalc", x0 + PAD, y, "POSITION SIZE CALCULATOR", clrDodgerBlue, 8, true);
   y += ROW_H - 2;

   CreateLabel(PFX + "lblRiskCap", x0 + PAD, y + 3, "Risk", clrWhite, 9);
   CreateEdit(PFX + "editRisk", x0 + PAD + LBL_W, y, EDIT_W, BTN_H, "");
   CreateButton(PFX + "btnRiskPct", x0 + PAD + LBL_W + EDIT_W + 4, y, 30, BTN_H, "%");
   CreateButton(PFX + "btnRiskMoney", x0 + PAD + LBL_W + EDIT_W + 4 + 32, y, 30, BTN_H, "$");
   y += ROW_H;

   CreateLabel(PFX + "lblSlCap", x0 + PAD, y + 3, "Stop loss", clrWhite, 9);
   CreateEdit(PFX + "editSl", x0 + PAD + LBL_W, y, EDIT_W, BTN_H, "");
   CreateButton(PFX + "btnSlPips", x0 + PAD + LBL_W + EDIT_W + 4, y, 30, BTN_H, "Pip");
   CreateButton(PFX + "btnSlPct", x0 + PAD + LBL_W + EDIT_W + 4 + 32, y, 30, BTN_H, "%");
   y += ROW_H;

   CreateLabel(PFX + "lblSlConv", x0 + PAD, y, "", clrSilver, 8); y += ROW_H;
   CreateLabel(PFX + "lblLotSize", x0 + PAD, y, "", clrLime, 9, true); y += ROW_H;
   CreateLabel(PFX + "lblMarginReq", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblPipValue", x0 + PAD, y, "", clrWhite, 9); y += ROW_H;
   CreateLabel(PFX + "lblRiskAmt", x0 + PAD, y, "", clrWhite, 9); y += ROW_H + 4;

   CreateLabel(PFX + "lblSecRules", x0 + PAD, y, "RISK RULES", clrDodgerBlue, 8, true);
   y += ROW_H - 2;

   CreateLabel(PFX + "lblDailyCap", x0 + PAD, y + 3, "Daily loss limit", clrWhite, 9);
   CreateEdit(PFX + "editDaily", x0 + PAD + LBL_W, y, EDIT_W, BTN_H, "");
   CreateButton(PFX + "btnDailyMoney", x0 + PAD + LBL_W + EDIT_W + 4, y, 30, BTN_H, "$");
   CreateButton(PFX + "btnDailyPct", x0 + PAD + LBL_W + EDIT_W + 4 + 32, y, 30, BTN_H, "%");
   y += ROW_H;

   CreateLabel(PFX + "lblOverallCap", x0 + PAD, y + 3, "Overall loss limit", clrWhite, 9);
   CreateEdit(PFX + "editOverall", x0 + PAD + LBL_W, y, EDIT_W, BTN_H, "");
   CreateButton(PFX + "btnOverallMoney", x0 + PAD + LBL_W + EDIT_W + 4, y, 30, BTN_H, "$");
   CreateButton(PFX + "btnOverallPct", x0 + PAD + LBL_W + EDIT_W + 4 + 32, y, 30, BTN_H, "%");
   y += ROW_H;

   CreateLabel(PFX + "lblDailyStatus", x0 + PAD, y, "", clrSilver, 8); y += ROW_H - 4;
   CreateLabel(PFX + "lblOverallStatus", x0 + PAD, y, "", clrSilver, 8); y += ROW_H;
   CreateLabel(PFX + "lblGuardStatus", x0 + PAD, y, "", clrLime, 10, true); y += ROW_H + 4;

   CreateButton(PFX + "btnResume", x0 + PAD, y, PANEL_W - PAD * 2, BTN_H + 2, "Resume trading (clears a trip)");
   y += ROW_H + 8;

   CreateLabel(PFX + "lblFooter", x0 + PAD, y, "Reactive guard: new trades opened while tripped are\nclosed on the next tick — manual MT5 clicks can't be\npre-blocked, only closed immediately after.", clrGray, 7);
   y += ROW_H + 18;

   int panelH = y - PanelY;
   CreateRect(PFX + "rectBg", PanelX, PanelY, PANEL_W, panelH, C'20,22,26', clrSilver);

   RefreshEditBoxes();
   RefreshToggleButtons();
}

void RefreshEditBoxes() {
   SetLabelTextIfNotFocused(PFX + "editRisk", DoubleToString(g_riskMode == RISK_MODE_PERCENT ? g_riskPercent : g_riskMoney, 2));
   SetLabelTextIfNotFocused(PFX + "editSl", DoubleToString(g_slMode == SL_MODE_PIPS ? g_slPips : g_slPercent, 2));
   SetLabelTextIfNotFocused(PFX + "editDaily", DoubleToString(g_dailyMode == LIMIT_MODE_MONEY ? g_dailyMoney : g_dailyPercent, 2));
   SetLabelTextIfNotFocused(PFX + "editOverall", DoubleToString(g_overallMode == LIMIT_MODE_MONEY ? g_overallMoney : g_overallPercent, 2));
}

// Edit boxes are only rewritten here on mode-toggle switches (never on a plain
// tick refresh), so a value the trader is mid-typing is never overwritten.
void SetLabelTextIfNotFocused(const string name, const string text) {
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

void RefreshToggleButtons() {
   SetToggleState(PFX + "btnRiskPct", g_riskMode == RISK_MODE_PERCENT);
   SetToggleState(PFX + "btnRiskMoney", g_riskMode == RISK_MODE_MONEY);
   SetToggleState(PFX + "btnSlPips", g_slMode == SL_MODE_PIPS);
   SetToggleState(PFX + "btnSlPct", g_slMode == SL_MODE_PERCENT);
   SetToggleState(PFX + "btnDailyMoney", g_dailyMode == LIMIT_MODE_MONEY);
   SetToggleState(PFX + "btnDailyPct", g_dailyMode == LIMIT_MODE_PERCENT);
   SetToggleState(PFX + "btnOverallMoney", g_overallMode == LIMIT_MODE_MONEY);
   SetToggleState(PFX + "btnOverallPct", g_overallMode == LIMIT_MODE_PERCENT);
}

void RefreshPanel() {
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double marginUsed = AccountInfoDouble(ACCOUNT_MARGIN);
   double marginFree = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double marginLevel = marginUsed > 0.0 ? (equity / marginUsed * 100.0) : 0.0;
   int leverage = (int)AccountInfoInteger(ACCOUNT_LEVERAGE);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);

   SetLabelText(PFX + "lblSubtitle", _Symbol + "  ·  Login " + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "  ·  " + currency);
   SetLabelText(PFX + "lblBalance", StringFormat("Balance:  %s %.2f", currency, balance));
   SetLabelText(PFX + "lblEquity", StringFormat("Equity:  %s %.2f", currency, equity));
   SetLabelText(PFX + "lblFreeMargin", StringFormat("Free margin:  %s %.2f", currency, marginFree));
   SetLabelText(PFX + "lblMarginUsed", StringFormat("Margin used:  %s %.2f  (level %.0f%%)", currency, marginUsed, marginLevel));
   SetLabelText(PFX + "lblLeverage", StringFormat("Leverage:  1:%d", leverage));

   double riskAmount = (g_riskMode == RISK_MODE_PERCENT) ? balance * (g_riskPercent / 100.0) : g_riskMoney;
   double slDistance = SlDistanceInPrice();
   double valuePerLot = ValuePerLotForDistance(slDistance);
   double rawLots = (slDistance > 0.0 && valuePerLot > 0.0) ? riskAmount / valuePerLot : 0.0;
   double lots = NormalizeVolume(rawLots);
   double actualRisk = valuePerLot * lots;
   double margin = MarginForLots(lots);
   double refPrice = ReferencePrice();

   double slPips = PipSize() > 0.0 ? slDistance / PipSize() : 0.0;
   double slPercent = refPrice > 0.0 ? (slDistance / refPrice * 100.0) : 0.0;

   SetLabelText(PFX + "lblSlConv", StringFormat("= %.1f pips  ·  %.2f%%  ·  %s %.2f at sized lot", slPips, slPercent, currency, actualRisk));
   SetLabelText(PFX + "lblLotSize", StringFormat("Suggested lot: %.2f", lots));
   SetLabelText(PFX + "lblMarginReq", StringFormat("Margin required: %s %.2f", currency, margin));
   SetLabelText(PFX + "lblPipValue", StringFormat("Pip value / lot: %s %.2f", currency, ValuePerLotForDistance(PipSize())));
   SetLabelText(PFX + "lblRiskAmt", StringFormat("Configured risk: %s %.2f  ·  Actual at lot: %s %.2f", currency, riskAmount, currency, actualRisk));

   double dayPctOfStart = g_lastDayStartBalance > 0.0 ? (g_lastDayPnl / g_lastDayStartBalance * 100.0) : 0.0;
   SetLabelText(PFX + "lblDailyStatus", StringFormat("Today P/L: %s %.2f (%.2f%%) of %s %.2f start balance",
      currency, g_lastDayPnl, dayPctOfStart, currency, g_lastDayStartBalance));
   SetLabelText(PFX + "lblOverallStatus", StringFormat("Drawdown from peak: %s %.2f (%.2f%%)  ·  Peak: %s %.2f",
      currency, g_lastOverallLossAmount, g_lastOverallLossPercent, currency, g_peakEquity));

   if (g_dailyTripped && g_overallTripped) {
      SetLabelText(PFX + "lblGuardStatus", "STATUS: DAILY + OVERALL LIMIT TRIPPED");
      SetLabelColor(PFX + "lblGuardStatus", clrRed);
   } else if (g_dailyTripped) {
      SetLabelText(PFX + "lblGuardStatus", "STATUS: DAILY LIMIT TRIPPED");
      SetLabelColor(PFX + "lblGuardStatus", clrOrange);
   } else if (g_overallTripped) {
      SetLabelText(PFX + "lblGuardStatus", "STATUS: OVERALL LIMIT TRIPPED");
      SetLabelColor(PFX + "lblGuardStatus", clrRed);
   } else {
      SetLabelText(PFX + "lblGuardStatus", "STATUS: ARMED");
      SetLabelColor(PFX + "lblGuardStatus", clrLime);
   }

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Event handlers                                                    |
//+------------------------------------------------------------------+
double ParseEditNumber(const string objName) {
   string text = ObjectGetString(0, objName, OBJPROP_TEXT);
   double value = StringToDouble(text);
   if (value < 0.0) value = 0.0;
   return value;
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if (id == CHARTEVENT_OBJECT_ENDEDIT) {
      if (sparam == PFX + "editRisk") {
         double v = ParseEditNumber(sparam);
         if (g_riskMode == RISK_MODE_PERCENT) { g_riskPercent = v; GSetD("riskPercent", v); }
         else { g_riskMoney = v; GSetD("riskMoney", v); }
      } else if (sparam == PFX + "editSl") {
         double v = ParseEditNumber(sparam);
         if (g_slMode == SL_MODE_PIPS) { g_slPips = v; GSetD("slPips", v); }
         else { g_slPercent = v; GSetD("slPercent", v); }
      } else if (sparam == PFX + "editDaily") {
         double v = ParseEditNumber(sparam);
         if (g_dailyMode == LIMIT_MODE_MONEY) { g_dailyMoney = v; GSetD("dailyMoney", v); }
         else { g_dailyPercent = v; GSetD("dailyPercent", v); }
      } else if (sparam == PFX + "editOverall") {
         double v = ParseEditNumber(sparam);
         if (g_overallMode == LIMIT_MODE_MONEY) { g_overallMoney = v; GSetD("overallMoney", v); }
         else { g_overallPercent = v; GSetD("overallPercent", v); }
      }
      RefreshEditBoxes();
      RefreshPanel();
      return;
   }

   if (id == CHARTEVENT_OBJECT_CLICK) {
      bool handled = true;
      if (sparam == PFX + "btnRiskPct") { g_riskMode = RISK_MODE_PERCENT; GSetD("riskMode", 0); }
      else if (sparam == PFX + "btnRiskMoney") { g_riskMode = RISK_MODE_MONEY; GSetD("riskMode", 1); }
      else if (sparam == PFX + "btnSlPips") { g_slMode = SL_MODE_PIPS; GSetD("slMode", 0); }
      else if (sparam == PFX + "btnSlPct") { g_slMode = SL_MODE_PERCENT; GSetD("slMode", 1); }
      else if (sparam == PFX + "btnDailyMoney") { g_dailyMode = LIMIT_MODE_MONEY; GSetD("dailyMode", 0); }
      else if (sparam == PFX + "btnDailyPct") { g_dailyMode = LIMIT_MODE_PERCENT; GSetD("dailyMode", 1); }
      else if (sparam == PFX + "btnOverallMoney") { g_overallMode = LIMIT_MODE_MONEY; GSetD("overallMode", 0); }
      else if (sparam == PFX + "btnOverallPct") { g_overallMode = LIMIT_MODE_PERCENT; GSetD("overallMode", 1); }
      else if (sparam == PFX + "btnResume") {
         ManualResume();
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      } else {
         handled = false;
      }

      if (handled) {
         RefreshEditBoxes();
         RefreshToggleButtons();
         RefreshPanel();
      }
   }
}

void OnTick() {
   EnforceRiskRules();
   RefreshPanel();
}

void OnTimer() {
   EnforceRiskRules();
   RefreshPanel();
}

int OnInit() {
   g_prefix = "TPRG." + (string)AccountInfoInteger(ACCOUNT_LOGIN) + ".";

   g_trade.SetAsyncMode(false);

   g_riskMode = (ENUM_RISK_MODE)(int)GGetD("riskMode", (double)RISK_MODE_PERCENT);
   g_riskPercent = GGetD("riskPercent", DefaultRiskPercent);
   g_riskMoney = GGetD("riskMoney", DefaultRiskMoney);

   g_slMode = (ENUM_SL_MODE)(int)GGetD("slMode", (double)SL_MODE_PIPS);
   g_slPips = GGetD("slPips", DefaultStopLossPips);
   g_slPercent = GGetD("slPercent", DefaultStopLossPercent);

   double dailyModeDefault = DailyLimitStartsInMoneyMode ? (double)LIMIT_MODE_MONEY : (double)LIMIT_MODE_PERCENT;
   g_dailyMode = (ENUM_LIMIT_MODE)(int)GGetD("dailyMode", dailyModeDefault);
   g_dailyMoney = GGetD("dailyMoney", DefaultDailyLossMoney);
   g_dailyPercent = GGetD("dailyPercent", DefaultDailyLossPercent);

   double overallModeDefault = OverallLimitStartsInMoneyMode ? (double)LIMIT_MODE_MONEY : (double)LIMIT_MODE_PERCENT;
   g_overallMode = (ENUM_LIMIT_MODE)(int)GGetD("overallMode", overallModeDefault);
   g_overallMoney = GGetD("overallMoney", DefaultOverallLossMoney);
   g_overallPercent = GGetD("overallPercent", DefaultOverallLossPercent);

   g_peakEquity = GGetD("peakEquity", AccountInfoDouble(ACCOUNT_EQUITY));

   g_dailyTripped = GGetD("dailyTripped", 0.0) > 0.5;
   g_dailyTripDay = (datetime)GGetD("dailyTripDay", 0.0);
   g_dailyTripTime = (datetime)GGetD("dailyTripTime", 0.0);

   g_overallTripped = GGetD("overallTripped", 0.0) > 0.5;
   g_overallTripTime = (datetime)GGetD("overallTripTime", 0.0);

   BuildPanel();
   EnforceRiskRules();
   RefreshPanel();

   int timerSeconds = TimerSeconds > 0 ? TimerSeconds : 1;
   EventSetTimer(timerSeconds);

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   ObjectsDeleteAll(0, PFX);
   ChartRedraw(0);
}
