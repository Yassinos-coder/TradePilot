//+------------------------------------------------------------------+
//| TradePilot_ATR_Excursion_EA.mq5                                 |
//| Live MT5 port of TradePilot_ATR_Excursion_Strategy.pine         |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property strict
#property description "Weekly ATR pullback/reclaim strategy with live MT5 execution"

#include <Trade/Trade.mqh>

enum ENUM_TP_SIZING_MODE {
   TP_RISK_PERCENT = 0,
   TP_FIXED_LOTS   = 1
};

enum ENUM_TP_ENTRY_NOTCHES {
   TP_NOTCH_0_ONLY       = 0,
   TP_NOTCH_0_AND_M05    = 1,
   TP_NOTCH_0_M05_M10    = 2
};

enum ENUM_TP_RECLAIM_LEVEL {
   TP_RECLAIM_MIDLINE = 0,
   TP_RECLAIM_FAR_SIDE = 1
};

enum ENUM_TP_TARGET_MODE {
   TP_TARGET_R_MULTIPLE = 0,
   TP_TARGET_NOTCH_LADDER = 1,
   TP_TARGET_HYBRID = 2
};

enum ENUM_TP_ZONE_SOURCE {
   TP_ZONE_H4_ATR_EQUILIBRIUM = 0,
   TP_ZONE_WEEKLY_ATR = 1
};

enum ENUM_TP_MA_METHOD {
   TP_MA_EMA = 0,
   TP_MA_SMA = 1,
   TP_MA_SMMA = 2,
   TP_MA_WMA = 3,
   TP_MA_VWMA = 4
};

input group "=== 1. Execution ==="
input bool              EnableTrading            = true;
input ENUM_TIMEFRAMES   SignalTimeframe           = PERIOD_CURRENT;
input ulong             MagicNumber              = 20260821;
input int               SlippagePoints           = 20;
input double            MaxSpreadPoints          = 0.0;  // 0 = disabled
input bool              RespectAnySymbolPosition = true;
input bool              EnableLogging            = true;
input bool              ShowDashboard            = true;

input group "=== 1B. Account and Trade Protection ==="
input double            MinimumLotSize           = 0.01;  // Effective minimum; never rounds risk up
input double            MaximumLotSize           = 1.00;  // Hard cap after risk sizing
input int               MaxStrategyOpenTrades    = 3;     // Across all symbols with this MagicNumber; 0 = off
input int               MaxAccountOpenTrades     = 0;     // Includes manual/other-EA positions; 0 = off
input int               MaxTradesPerDay          = 2;     // Across this MagicNumber; 0 = off
input int               MaxLosingTradesPerDay    = 2;     // Net losing closed positions for this MagicNumber; 0 = off
input double            MinimumAccountEquity     = 0.0;   // Account currency; 0 = off
input double            MaxFloatingDrawdownPct   = 10.0;  // Equity below balance; 0 = off
input double            MaxDailyLossPct          = 3.0;   // Realized + floating, broker day; 0 = off
input double            MaxDailyLossMoney        = 0.0;   // Account currency; 0 = off
input bool              CloseStrategyOnEquityStop = true; // Only positions with this MagicNumber

input group "=== 2. Trend Detection ==="
input bool              TradeLongs          = true;
input bool              TradeShorts         = true;
input ENUM_TIMEFRAMES   StructureTimeframe  = PERIOD_D1;
input int               SwingBars           = 3;
input bool              RequireWeeklyMa     = true;
input bool              RequireDailyMa      = false;
input bool              RequireH4Ma         = false;

input group "=== 3. Excursion Gates ==="
input bool              UseSpentGate        = true;
input double            MaxWeekSpent        = 1.25;
input bool              UseAdverseGate      = true;
input double            MaxWeekAdverse      = 1.00;
input bool              UsePremiumGate      = true;
input double            MaxPremium          = 0.50;
input bool              UseSession          = true;
input int               SessionStartHour    = 7;     // Broker server time
input int               SessionStartMinute  = 0;
input int               SessionEndHour      = 19;    // End is exclusive
input int               SessionEndMinute    = 0;
input int               MaxTradesPerWeek    = 3;

input group "=== 4. Entry ==="
input ENUM_TP_ENTRY_NOTCHES EntryNotches    = TP_NOTCH_0_AND_M05;
input ENUM_TP_RECLAIM_LEVEL ReclaimLevel    = TP_RECLAIM_MIDLINE;
input int               ReclaimBars         = 8;
input bool              AllowSameBar        = true;
input bool              RequireChartMa      = false;

input group "=== 5. Risk ==="
input ENUM_TP_SIZING_MODE SizingMode        = TP_RISK_PERCENT;
input double            RiskPerTradePct     = 1.0;
input double            FixedLots           = 0.10;
input double            StopBufferZone      = 0.15;
input double            MinRiskWeeklyAtr    = 0.05;
input double            MaxRiskWeeklyAtr    = 0.60;
input double            SetupFailBufferZone = 0.35;

input group "=== 6. Targets and Exits ==="
input ENUM_TP_TARGET_MODE TargetMode         = TP_TARGET_R_MULTIPLE;
input double            T1RiskMultiple      = 1.5;
input double            T2RiskMultiple      = 3.0;
input double            T1NotchWeeklyAtr    = 1.0;
input double            T2NotchWeeklyAtr    = 1.5;
input double            MinTargetRisk       = 1.0;
input int               T1ScaleOutPct       = 50;
input bool              MoveToBreakeven     = true;
input double            BreakevenOffsetR    = 0.0;
input bool              TrailAfterT1        = true;
input double            TrailDistanceZone   = 1.0;
input bool              ExitOnBiasFlip      = true;
input int               MaxBarsInTrade      = 48;    // 0 = disabled
input bool              FlatBeforeWeekend   = true;
input int               FridayExitHour      = 20;    // Broker server time

input group "=== 7. Moving Average Vote ==="
input bool              UseMa1              = true;
input int               Ma1Length           = 9;
input ENUM_TP_MA_METHOD Ma1Method           = TP_MA_EMA;
input bool              UseMa2              = true;
input int               Ma2Length           = 21;
input ENUM_TP_MA_METHOD Ma2Method           = TP_MA_EMA;
input bool              UseMa3              = true;
input int               Ma3Length           = 50;
input ENUM_TP_MA_METHOD Ma3Method           = TP_MA_EMA;
input bool              UseMa4              = true;
input int               Ma4Length           = 100;
input ENUM_TP_MA_METHOD Ma4Method           = TP_MA_EMA;
input bool              UseMa5              = true;
input int               Ma5Length           = 200;
input ENUM_TP_MA_METHOD Ma5Method           = TP_MA_EMA;

input group "=== 8. ATR and Zones ==="
input int               AtrLength           = 14;
input ENUM_TP_ZONE_SOURCE ZoneSource         = TP_ZONE_H4_ATR_EQUILIBRIUM;
input bool              CapZoneHeight       = true;
input double            ZoneCapWeeklyAtr    = 0.35;

CTrade g_trade;
int    g_weeklyAtrHandle = INVALID_HANDLE;
int    g_h4AtrHandle     = INVALID_HANDLE;

datetime g_lastBarOpen = 0;
datetime g_weekStart   = 0;

double g_weeklyClose = 0.0;
double g_weeklyAtr   = 0.0;
double g_zoneHeight = 0.0;
double g_h4AtrEq    = 0.0;
bool   g_dataReady  = false;

int    g_structBias = 0;
int    g_swingLabel = 0;
double g_structRes  = 0.0;
double g_structSup  = 0.0;
bool   g_hasStructRes = false;
bool   g_hasStructSup = false;
int    g_tradeDir = 0;
int    g_voteW = 0;
int    g_voteD = 0;
int    g_voteH4 = 0;

double g_wkFav = 0.0;
double g_wkAdv = 0.0;
bool   g_hasWkFav = false;
bool   g_hasWkAdv = false;
int    g_tradesThisWeek = 0;

int    g_armDir = 0;
double g_armFib = 0.0;
double g_armZoneAdv = 0.0;
double g_armZoneFar = 0.0;
double g_armZoneMid = 0.0;
double g_armExtreme = 0.0;
int    g_armAge = 0;

bool   g_positionState = false;
ulong  g_posTicket = 0;
int    g_posDir = 0;
double g_posEntry = 0.0;
double g_posStop = 0.0;
double g_posTp1 = 0.0;
double g_posTp2 = 0.0;
double g_posRisk = 0.0;
double g_posFib = 0.0;
double g_posZoneHeight = 0.0;
double g_posExtreme = 0.0;
double g_posInitialVolume = 0.0;
bool   g_posTp1Done = false;
int    g_posBars = 0;

string g_status = "initializing";
bool   g_equityLocked = false;
string g_equityLockReason = "";
datetime g_lastProtectionCheck = 0;

void Log(const string message) {
   if (EnableLogging)
      Print("[TP ATR X] ", message);
}

ENUM_TIMEFRAMES ActiveTimeframe() {
   if (SignalTimeframe == PERIOD_CURRENT)
      return (ENUM_TIMEFRAMES)_Period;
   return SignalTimeframe;
}

int PriceDigits() {
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

double PricePoint() {
   return SymbolInfoDouble(_Symbol, SYMBOL_POINT);
}

double NormalizePrice(const double price) {
   return NormalizeDouble(price, PriceDigits());
}

int VolumeDigits(const double step) {
   if (step >= 1.0) return 0;
   if (step >= 0.1) return 1;
   if (step >= 0.01) return 2;
   if (step >= 0.001) return 3;
   return 4;
}

double NormalizeVolumeDown(const double requested) {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double brokerMin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double brokerMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if (step <= 0.0) step = 0.01;
   double minVolume = MathMax(brokerMin, MinimumLotSize);
   double maxVolume = brokerMax;
   if (MaximumLotSize > 0.0) maxVolume = MathMin(maxVolume, MaximumLotSize);
   maxVolume = MathFloor(maxVolume / step + 1e-9) * step;
   if (maxVolume < minVolume || requested < minVolume || requested <= 0.0) return 0.0;
   double result = MathFloor(requested / step + 1e-9) * step;
   result = MathMin(result, maxVolume);
   if (result < minVolume) return 0.0;
   return NormalizeDouble(result, VolumeDigits(step));
}

double NormalizeCloseVolumeDown(const double requested) {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if (step <= 0.0) step = 0.01;
   if (requested < minVolume || requested <= 0.0) return 0.0;
   double result = MathFloor(requested / step + 1e-9) * step;
   result = MathMin(result, maxVolume);
   if (result < minVolume) return 0.0;
   return NormalizeDouble(result, VolumeDigits(step));
}

bool TradeRetcodeOk() {
   uint code = g_trade.ResultRetcode();
   return code == TRADE_RETCODE_DONE || code == TRADE_RETCODE_PLACED ||
          code == TRADE_RETCODE_DONE_PARTIAL || code == TRADE_RETCODE_NO_CHANGES;
}

string StateKey(const string suffix) {
   string symbolPart = StringSubstr(_Symbol, 0, 14);
   return "TPAX." + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "." +
          symbolPart + "." + (string)MagicNumber + "." + suffix;
}

string RiskKey(const string suffix) {
   return "TPAXR." + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "." +
          (string)MagicNumber + "." + suffix;
}

datetime BrokerDayStart(const datetime value) {
   MqlDateTime parts;
   TimeToStruct(value, parts);
   parts.hour = 0;
   parts.min = 0;
   parts.sec = 0;
   return StructToTime(parts);
}

void SaveEquityLock(const datetime dayStart, const string reason) {
   GlobalVariableSet(RiskKey("lockday"), (double)dayStart);
   // The numeric reason is only diagnostic across restarts; the dashboard uses
   // the more specific live reason while the trigger is in memory.
   GlobalVariableSet(RiskKey("locked"), 1.0);
   g_equityLocked = true;
   g_equityLockReason = reason;
}

void RefreshEquityLock() {
   datetime today = BrokerDayStart(TimeCurrent());
   string dayKey = RiskKey("lockday");
   string lockKey = RiskKey("locked");
   if (GlobalVariableCheck(dayKey) && GlobalVariableCheck(lockKey) &&
       (datetime)GlobalVariableGet(dayKey) == today && GlobalVariableGet(lockKey) > 0.5) {
      g_equityLocked = true;
      if (g_equityLockReason == "") g_equityLockReason = "equity lock until next broker day";
      return;
   }
   g_equityLocked = false;
   g_equityLockReason = "";
   if (GlobalVariableCheck(dayKey)) GlobalVariableDel(dayKey);
   if (GlobalVariableCheck(lockKey)) GlobalVariableDel(lockKey);
}

void StoreValue(const string suffix, const double value) {
   GlobalVariableSet(StateKey(suffix), value);
}

bool LoadValue(const string suffix, double &value) {
   string key = StateKey(suffix);
   if (!GlobalVariableCheck(key)) return false;
   value = GlobalVariableGet(key);
   return true;
}

void DeleteValue(const string suffix) {
   string key = StateKey(suffix);
   if (GlobalVariableCheck(key)) GlobalVariableDel(key);
}

void SaveStrategyState() {
   StoreValue("ws", (double)g_weekStart);
   StoreValue("hf", g_hasWkFav ? 1.0 : 0.0);
   StoreValue("f", g_wkFav);
   StoreValue("ha", g_hasWkAdv ? 1.0 : 0.0);
   StoreValue("a", g_wkAdv);
   StoreValue("tw", (double)g_tradesThisWeek);
   StoreValue("ad", (double)g_armDir);
   StoreValue("af", g_armFib);
   StoreValue("aa", g_armZoneAdv);
   StoreValue("ar", g_armZoneFar);
   StoreValue("am", g_armZoneMid);
   StoreValue("ae", g_armExtreme);
   StoreValue("ag", (double)g_armAge);
}

bool LoadStrategyState() {
   double storedWeek = 0.0;
   if (!LoadValue("ws", storedWeek) || (datetime)storedWeek != g_weekStart)
      return false;

   double value = 0.0;
   if (LoadValue("hf", value)) g_hasWkFav = (value > 0.5);
   if (LoadValue("f", value))  g_wkFav = value;
   if (LoadValue("ha", value)) g_hasWkAdv = (value > 0.5);
   if (LoadValue("a", value))  g_wkAdv = value;
   if (LoadValue("tw", value)) g_tradesThisWeek = (int)value;
   if (LoadValue("ad", value)) g_armDir = (int)value;
   if (LoadValue("af", value)) g_armFib = value;
   if (LoadValue("aa", value)) g_armZoneAdv = value;
   if (LoadValue("ar", value)) g_armZoneFar = value;
   if (LoadValue("am", value)) g_armZoneMid = value;
   if (LoadValue("ae", value)) g_armExtreme = value;
   if (LoadValue("ag", value)) g_armAge = (int)value;
   return true;
}

void SavePositionState() {
   if (!g_positionState || g_posTicket == 0) return;
   StoreValue("pt", (double)g_posTicket);
   StoreValue("pd", (double)g_posDir);
   StoreValue("pe", g_posEntry);
   StoreValue("ps", g_posStop);
   StoreValue("p1", g_posTp1);
   StoreValue("p2", g_posTp2);
   StoreValue("pr", g_posRisk);
   StoreValue("pf", g_posFib);
   StoreValue("pz", g_posZoneHeight);
   StoreValue("px", g_posExtreme);
   StoreValue("pv", g_posInitialVolume);
   StoreValue("p1d", g_posTp1Done ? 1.0 : 0.0);
   StoreValue("pb", (double)g_posBars);
}

void ClearPositionState() {
   string keys[] = {"pt","pd","pe","ps","p1","p2","pr","pf","pz","px","pv","p1d","pb"};
   for (int i = 0; i < ArraySize(keys); i++) DeleteValue(keys[i]);
   g_positionState = false;
   g_posTicket = 0;
   g_posDir = 0;
   g_posEntry = 0.0;
   g_posStop = 0.0;
   g_posTp1 = 0.0;
   g_posTp2 = 0.0;
   g_posRisk = 0.0;
   g_posFib = 0.0;
   g_posZoneHeight = 0.0;
   g_posExtreme = 0.0;
   g_posInitialVolume = 0.0;
   g_posTp1Done = false;
   g_posBars = 0;
}

bool LoadPositionState(const ulong ticket) {
   double value = 0.0;
   if (!LoadValue("pt", value) || (ulong)value != ticket) return false;
   g_posTicket = ticket;
   if (LoadValue("pd", value)) g_posDir = (int)value;
   if (LoadValue("pe", value)) g_posEntry = value;
   if (LoadValue("ps", value)) g_posStop = value;
   if (LoadValue("p1", value)) g_posTp1 = value;
   if (LoadValue("p2", value)) g_posTp2 = value;
   if (LoadValue("pr", value)) g_posRisk = value;
   if (LoadValue("pf", value)) g_posFib = value;
   if (LoadValue("pz", value)) g_posZoneHeight = value;
   if (LoadValue("px", value)) g_posExtreme = value;
   if (LoadValue("pv", value)) g_posInitialVolume = value;
   if (LoadValue("p1d", value)) g_posTp1Done = (value > 0.5);
   if (LoadValue("pb", value)) g_posBars = (int)value;
   g_positionState = true;
   return g_posEntry > 0.0 && g_posRisk > 0.0 && g_posTp1 > 0.0 && g_posTp2 > 0.0;
}

bool FindManagedPosition(ulong &ticket) {
   ticket = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong candidate = PositionGetTicket(i);
      if (candidate == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if ((ulong)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      ticket = candidate;
      return true;
   }
   return false;
}

bool HasAnySymbolPosition() {
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol)
         return true;
   }
   return false;
}

double GetAtrValue(const int handle, const int shift) {
   if (handle == INVALID_HANDLE) return 0.0;
   double values[];
   ArraySetAsSeries(values, true);
   if (CopyBuffer(handle, 0, shift, 1, values) != 1) return 0.0;
   return values[0];
}

double RatePrice(const MqlRates &rate) {
   return rate.close;
}

bool CalculateMa(const ENUM_TIMEFRAMES timeframe, const int shift, const int length,
                 const ENUM_TP_MA_METHOD method, double &result) {
   result = 0.0;
   if (length < 1) return false;

   int wanted = length;
   if (method == TP_MA_EMA || method == TP_MA_SMMA)
      wanted = MathMax(500, length * 10);

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, timeframe, shift, wanted, rates);
   if (copied < length) return false;

   if (method == TP_MA_SMA) {
      double sum = 0.0;
      for (int i = copied - length; i < copied; i++) sum += RatePrice(rates[i]);
      result = sum / length;
      return true;
   }

   if (method == TP_MA_WMA) {
      double weighted = 0.0, weights = 0.0;
      for (int i = 0; i < length; i++) {
         double weight = i + 1.0;
         weighted += RatePrice(rates[copied - length + i]) * weight;
         weights += weight;
      }
      result = weighted / weights;
      return true;
   }

   if (method == TP_MA_VWMA) {
      double weighted = 0.0, volume = 0.0;
      for (int i = copied - length; i < copied; i++) {
         double v = (double)rates[i].tick_volume;
         weighted += RatePrice(rates[i]) * v;
         volume += v;
      }
      if (volume <= 0.0) return false;
      result = weighted / volume;
      return true;
   }

   if (method == TP_MA_SMMA) {
      double seed = 0.0;
      for (int i = 0; i < length; i++) seed += RatePrice(rates[i]);
      result = seed / length;
      for (int i = length; i < copied; i++)
         result = (result * (length - 1) + RatePrice(rates[i])) / length;
      return true;
   }

   result = RatePrice(rates[0]);
   double alpha = 2.0 / (length + 1.0);
   for (int i = 1; i < copied; i++)
      result = alpha * RatePrice(rates[i]) + (1.0 - alpha) * result;
   return true;
}

int MaVote(const ENUM_TIMEFRAMES timeframe) {
   double closePrice = iClose(_Symbol, timeframe, 1);
   if (closePrice <= 0.0) return 0;
   int score = 0;
   double ma = 0.0;
   if (UseMa1 && CalculateMa(timeframe, 1, Ma1Length, Ma1Method, ma)) score += closePrice > ma ? 1 : -1;
   if (UseMa2 && CalculateMa(timeframe, 1, Ma2Length, Ma2Method, ma)) score += closePrice > ma ? 1 : -1;
   if (UseMa3 && CalculateMa(timeframe, 1, Ma3Length, Ma3Method, ma)) score += closePrice > ma ? 1 : -1;
   if (UseMa4 && CalculateMa(timeframe, 1, Ma4Length, Ma4Method, ma)) score += closePrice > ma ? 1 : -1;
   if (UseMa5 && CalculateMa(timeframe, 1, Ma5Length, Ma5Method, ma)) score += closePrice > ma ? 1 : -1;
   return score > 0 ? 1 : score < 0 ? -1 : 0;
}

bool IsPivotHigh(MqlRates &rates[], const int p, const int strength) {
   if (p - strength < 0 || p + strength >= ArraySize(rates)) return false;
   double price = rates[p].high;
   for (int i = p - strength; i <= p + strength; i++)
      if (i != p && rates[i].high >= price) return false;
   return true;
}

bool IsPivotLow(MqlRates &rates[], const int p, const int strength) {
   if (p - strength < 0 || p + strength >= ArraySize(rates)) return false;
   double price = rates[p].low;
   for (int i = p - strength; i <= p + strength; i++)
      if (i != p && rates[i].low <= price) return false;
   return true;
}

bool CalculateStructure() {
   int strength = MathMax(1, SwingBars);
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, StructureTimeframe, 1, 3000, rates);
   if (copied < strength * 2 + 10) return false;

   double a = 0.0, b = 0.0, c = 0.0;
   bool hasA = false, hasB = false, hasC = false;
   int aDir = 0;
   int lastLabel = 0;
   double resistance = 0.0, support = 0.0;
   bool hasResistance = false, hasSupport = false;
   int bias = 0;

   for (int i = 0; i < copied; i++) {
      int p = i - strength;
      bool pivotHigh = p >= strength && IsPivotHigh(rates, p, strength);
      bool pivotLow  = p >= strength && IsPivotLow(rates, p, strength);
      int newDir = pivotHigh ? 1 : pivotLow ? -1 : 0;
      double newPrice = pivotHigh ? rates[p].high : pivotLow ? rates[p].low : 0.0;
      bool moved = false;

      if (newDir != 0) {
         if (newDir == aDir) {
            if ((newDir == 1 && newPrice > a) || (newDir == -1 && newPrice < a)) {
               a = newPrice;
               moved = true;
            }
         } else if (!hasA || (newDir == 1 && newPrice > a) || (newDir == -1 && newPrice < a)) {
            c = b; hasC = hasB;
            b = a; hasB = hasA;
            a = newPrice; hasA = true;
            aDir = newDir;
            moved = true;
         }
      }

      int newLabel = 0;
      if (moved && hasC) {
         if (aDir == 1) newLabel = a > c ? 1 : -1;
         else           newLabel = a > c ? 2 : -2;
         lastLabel = newLabel;
      }

      if (newLabel == -1 || (bias == 0 && newLabel == 1)) {
         resistance = a; hasResistance = true;
      }
      if (newLabel == 2 || (bias == 0 && newLabel == -2)) {
         support = a; hasSupport = true;
      }

      if (hasResistance && rates[i].close > resistance) bias = 1;
      if (hasSupport && rates[i].close < support) bias = -1;

      if (bias == 1 && newLabel == 1) {
         resistance = a; hasResistance = true;
      }
      if (bias == -1 && newLabel == -2) {
         support = a; hasSupport = true;
      }
   }

   g_structBias = bias;
   g_swingLabel = lastLabel;
   g_structRes = resistance;
   g_structSup = support;
   g_hasStructRes = hasResistance;
   g_hasStructSup = hasSupport;
   return true;
}

double CalculatePreviousWeekH4AtrEquilibrium() {
   datetime currentWeek = iTime(_Symbol, PERIOD_W1, 0);
   datetime previousWeek = iTime(_Symbol, PERIOD_W1, 1);
   if (currentWeek <= 0 || previousWeek <= 0) return 0.0;

   double hi = 0.0, lo = 0.0;
   bool found = false;
   int bars = Bars(_Symbol, PERIOD_H4);
   int maxScan = MathMin(bars, 500);
   for (int shift = 1; shift < maxScan; shift++) {
      datetime barTime = iTime(_Symbol, PERIOD_H4, shift);
      if (barTime <= 0) continue;
      if (barTime >= currentWeek) continue;
      if (barTime < previousWeek) break;
      double atr = GetAtrValue(g_h4AtrHandle, shift);
      if (atr <= 0.0) continue;
      if (!found) { hi = atr; lo = atr; found = true; }
      else { hi = MathMax(hi, atr); lo = MathMin(lo, atr); }
   }
   return found ? (hi + lo) / 2.0 : 0.0;
}

void RefreshMarketState() {
   g_weeklyClose = iClose(_Symbol, PERIOD_W1, 1);
   g_weeklyAtr = GetAtrValue(g_weeklyAtrHandle, 1);
   if (g_h4AtrEq <= 0.0) g_h4AtrEq = CalculatePreviousWeekH4AtrEquilibrium();

   double rawZone = (ZoneSource == TP_ZONE_H4_ATR_EQUILIBRIUM && g_h4AtrEq > 0.0)
                    ? g_h4AtrEq : g_weeklyAtr;
   g_zoneHeight = rawZone;
   if (CapZoneHeight && g_weeklyAtr > 0.0 && g_zoneHeight > 0.0)
      g_zoneHeight = MathMin(g_zoneHeight, ZoneCapWeeklyAtr * g_weeklyAtr);

   bool structureReady = CalculateStructure();
   g_voteW = MaVote(PERIOD_W1);
   g_voteD = MaVote(PERIOD_D1);
   g_voteH4 = MaVote(PERIOD_H4);

   bool bull = g_structBias == 1 && (!RequireWeeklyMa || g_voteW == 1) &&
               (!RequireDailyMa || g_voteD == 1) && (!RequireH4Ma || g_voteH4 == 1);
   bool bear = g_structBias == -1 && (!RequireWeeklyMa || g_voteW == -1) &&
               (!RequireDailyMa || g_voteD == -1) && (!RequireH4Ma || g_voteH4 == -1);
   g_tradeDir = bull ? 1 : bear ? -1 : 0;
   g_dataReady = structureReady && g_weeklyClose > 0.0 && g_weeklyAtr > 0.0 && g_zoneHeight > 0.0;
}

double NotchPrice(const double fib, const int direction) {
   return g_weeklyClose + g_weeklyAtr * fib * direction;
}

bool IsInSession(const datetime barTime) {
   if (!UseSession) return true;
   MqlDateTime parts;
   TimeToStruct(barTime, parts);
   int minute = parts.hour * 60 + parts.min;
   int start = SessionStartHour * 60 + SessionStartMinute;
   int finish = SessionEndHour * 60 + SessionEndMinute;
   if (start == finish) return true;
   if (start < finish) return minute >= start && minute < finish;
   return minute >= start || minute < finish;
}

bool IsFridayExitTime(const datetime value) {
   MqlDateTime parts;
   TimeToStruct(value, parts);
   return parts.day_of_week == 5 && parts.hour >= FridayExitHour;
}

int CountWeekEntries() {
   if (g_weekStart <= 0 || !HistorySelect(g_weekStart, TimeCurrent())) return 0;
   int count = 0;
   int total = HistoryDealsTotal();
   for (int i = 0; i < total; i++) {
      ulong deal = HistoryDealGetTicket(i);
      if (deal == 0) continue;
      if (HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol) continue;
      if ((ulong)HistoryDealGetInteger(deal, DEAL_MAGIC) != MagicNumber) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) count++;
   }
   return count;
}

int CountStrategyOpenPositions() {
   int count = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && (ulong)PositionGetInteger(POSITION_MAGIC) == MagicNumber) count++;
   }
   return count;
}

int CountEntriesSince(const datetime startTime) {
   if (!HistorySelect(startTime, TimeCurrent())) return 0;
   int count = 0;
   for (int i = 0; i < HistoryDealsTotal(); i++) {
      ulong deal = HistoryDealGetTicket(i);
      if (deal == 0 || (ulong)HistoryDealGetInteger(deal, DEAL_MAGIC) != MagicNumber) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) count++;
   }
   return count;
}

bool IsPositionIdentifierOpen(const long identifier) {
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetInteger(POSITION_IDENTIFIER) == identifier) return true;
   }
   return false;
}

int CountLosingTradesSince(const datetime startTime) {
   // Aggregate every deal belonging to a position. This counts one completed
   // decision, not each scale-out, and includes entry/exit costs in the result.
   datetime lookback = startTime - 365 * 86400;
   if (lookback < 0) lookback = 0;
   if (!HistorySelect(lookback, TimeCurrent())) return 0;

   long ids[];
   double pnls[];
   datetime exitTimes[];
   int positions = 0;
   for (int i = 0; i < HistoryDealsTotal(); i++) {
      ulong deal = HistoryDealGetTicket(i);
      if (deal == 0 || (ulong)HistoryDealGetInteger(deal, DEAL_MAGIC) != MagicNumber) continue;
      long identifier = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if (identifier <= 0) continue;

      int slot = -1;
      for (int j = 0; j < positions; j++) {
         if (ids[j] == identifier) { slot = j; break; }
      }
      if (slot < 0) {
         slot = positions++;
         ArrayResize(ids, positions);
         ArrayResize(pnls, positions);
         ArrayResize(exitTimes, positions);
         ids[slot] = identifier;
         pnls[slot] = 0.0;
         exitTimes[slot] = 0;
      }

      pnls[slot] += HistoryDealGetDouble(deal, DEAL_PROFIT) +
                    HistoryDealGetDouble(deal, DEAL_COMMISSION) +
                    HistoryDealGetDouble(deal, DEAL_SWAP) +
                    HistoryDealGetDouble(deal, DEAL_FEE);
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
         exitTimes[slot] = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
   }

   int count = 0;
   for (int i = 0; i < positions; i++) {
      if (exitTimes[i] >= startTime && pnls[i] < -0.0000001 && !IsPositionIdentifierOpen(ids[i]))
         count++;
   }
   return count;
}

double AccountDayPnl(double &dayStartBalance) {
   datetime startTime = BrokerDayStart(TimeCurrent());
   double realized = 0.0;
   if (HistorySelect(startTime, TimeCurrent())) {
      for (int i = 0; i < HistoryDealsTotal(); i++) {
         ulong deal = HistoryDealGetTicket(i);
         if (deal == 0) continue;
         long type = HistoryDealGetInteger(deal, DEAL_TYPE);
         if (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
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

bool EntryProtectionAllows(string &reason) {
   RefreshEquityLock();
   if (g_equityLocked) {
      reason = g_equityLockReason;
      return false;
   }
   if (MaxStrategyOpenTrades > 0 && CountStrategyOpenPositions() >= MaxStrategyOpenTrades) {
      reason = "strategy open-trade cap";
      return false;
   }
   if (MaxAccountOpenTrades > 0 && PositionsTotal() >= MaxAccountOpenTrades) {
      reason = "account open-trade cap";
      return false;
   }
   datetime today = BrokerDayStart(TimeCurrent());
   if (MaxTradesPerDay > 0 && CountEntriesSince(today) >= MaxTradesPerDay) {
      reason = "daily trade cap";
      return false;
   }
   if (MaxLosingTradesPerDay > 0 && CountLosingTradesSince(today) >= MaxLosingTradesPerDay) {
      reason = "daily losing-trade cap";
      return false;
   }
   reason = "";
   return true;
}

void RebuildCurrentWeekExcursion() {
   g_hasWkFav = false;
   g_hasWkAdv = false;
   if (g_weekStart <= 0 || g_structBias == 0 || g_weeklyClose <= 0.0 || g_weeklyAtr <= 0.0)
      return;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, ActiveTimeframe(), g_weekStart, TimeCurrent(), rates);
   for (int i = 0; i < copied; i++) {
      double fav = (g_structBias == 1 ? rates[i].high - g_weeklyClose : g_weeklyClose - rates[i].low) / g_weeklyAtr;
      double adv = (g_structBias == 1 ? g_weeklyClose - rates[i].low : rates[i].high - g_weeklyClose) / g_weeklyAtr;
      if (!g_hasWkFav) { g_wkFav = fav; g_hasWkFav = true; } else g_wkFav = MathMax(g_wkFav, fav);
      if (!g_hasWkAdv) { g_wkAdv = adv; g_hasWkAdv = true; } else g_wkAdv = MathMax(g_wkAdv, adv);
   }
}

void RefreshWeek() {
   datetime current = iTime(_Symbol, PERIOD_W1, 0);
   if (current <= 0) return;
   if (g_weekStart == current) return;

   g_weekStart = current;
   g_h4AtrEq = 0.0;
   g_hasWkFav = false;
   g_hasWkAdv = false;
   g_wkFav = 0.0;
   g_wkAdv = 0.0;
   g_tradesThisWeek = CountWeekEntries();
   g_armDir = 0;
   g_armAge = 0;
   Log("New broker week: state reset");
}

void UpdateExcursion(const MqlRates &bar) {
   if (g_structBias == 0 || !g_dataReady) return;
   double fav = (g_structBias == 1 ? bar.high - g_weeklyClose : g_weeklyClose - bar.low) / g_weeklyAtr;
   double adv = (g_structBias == 1 ? g_weeklyClose - bar.low : bar.high - g_weeklyClose) / g_weeklyAtr;
   if (!g_hasWkFav) { g_wkFav = fav; g_hasWkFav = true; } else g_wkFav = MathMax(g_wkFav, fav);
   if (!g_hasWkAdv) { g_wkAdv = adv; g_hasWkAdv = true; } else g_wkAdv = MathMax(g_wkAdv, adv);
}

double FavSpent() {
   if (g_tradeDir == 0) return 0.0;
   if (g_tradeDir == g_structBias) return g_hasWkFav ? g_wkFav : 0.0;
   return g_hasWkAdv ? g_wkAdv : 0.0;
}

double AdvSpent() {
   if (g_tradeDir == 0) return 0.0;
   if (g_tradeDir == g_structBias) return g_hasWkAdv ? g_wkAdv : 0.0;
   return g_hasWkFav ? g_wkFav : 0.0;
}

bool BuildTargets(const double entry, const double risk, const int direction,
                  double &tp1, double &tp2) {
   if (risk <= 0.0 || direction == 0) return false;
   double notch1 = NotchPrice(T1NotchWeeklyAtr, direction);
   double notch2 = NotchPrice(T2NotchWeeklyAtr, direction);
   double rTarget1 = entry + T1RiskMultiple * risk * direction;
   double rTarget2 = entry + T2RiskMultiple * risk * direction;

   tp1 = TargetMode == TP_TARGET_NOTCH_LADDER ? notch1 : rTarget1;
   tp2 = TargetMode == TP_TARGET_R_MULTIPLE ? rTarget2 : notch2;
   if (direction == 1) tp2 = MathMax(tp1, tp2);
   else                tp2 = MathMin(tp1, tp2);
   tp1 = NormalizePrice(tp1);
   tp2 = NormalizePrice(tp2);
   return (tp1 - entry) * direction >= MinTargetRisk * risk;
}

double CalculateOrderVolume(const int direction, const double entry, const double stop) {
   if (SizingMode == TP_FIXED_LOTS) return NormalizeVolumeDown(FixedLots);
   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * RiskPerTradePct / 100.0;
   double oneLotLoss = 0.0;
   ENUM_ORDER_TYPE type = direction == 1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if (!OrderCalcProfit(type, _Symbol, 1.0, entry, stop, oneLotLoss)) {
      Log("OrderCalcProfit failed: " + (string)GetLastError());
      return 0.0;
   }
   oneLotLoss = MathAbs(oneLotLoss);
   if (oneLotLoss <= 0.0 || riskMoney <= 0.0) return 0.0;
   return NormalizeVolumeDown(riskMoney / oneLotLoss);
}

double BrokerStopDistance() {
   long stops = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   long freeze = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   return (double)MathMax(stops, freeze) * PricePoint();
}

bool EntryPricesAllowed(const int direction, const double stop, const double tp2) {
   MqlTick tick;
   if (!SymbolInfoTick(_Symbol, tick)) return false;
   double minDistance = BrokerStopDistance();
   if (direction == 1)
      return stop < tick.bid - minDistance && tp2 > tick.ask + minDistance;
   return stop > tick.ask + minDistance && tp2 < tick.bid - minDistance;
}

void RecoverPositionState(const ulong ticket) {
   if (!PositionSelectByTicket(ticket)) return;
   g_positionState = true;
   g_posTicket = ticket;
   g_posDir = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
   g_posEntry = PositionGetDouble(POSITION_PRICE_OPEN);
   g_posStop = PositionGetDouble(POSITION_SL);
   g_posTp2 = PositionGetDouble(POSITION_TP);
   g_posRisk = MathAbs(g_posEntry - g_posStop);
   g_posZoneHeight = g_zoneHeight > 0.0 ? g_zoneHeight : g_weeklyAtr;
   g_posExtreme = g_posEntry;
   g_posInitialVolume = PositionGetDouble(POSITION_VOLUME);
   g_posTp1Done = false;
   g_posBars = 0;
   double rebuiltTp2 = 0.0;
   if (g_posRisk > 0.0 && BuildTargets(g_posEntry, g_posRisk, g_posDir, g_posTp1, rebuiltTp2)) {
      if (g_posTp2 <= 0.0) g_posTp2 = rebuiltTp2;
   }
   SavePositionState();
   Log("Recovered management state for position " + (string)ticket);
}

bool ModifyManagedPosition(const double stop, const double tp) {
   if (!g_positionState || g_posTicket == 0 || !PositionSelectByTicket(g_posTicket)) return false;
   bool sent = g_trade.PositionModify(g_posTicket, NormalizePrice(stop), NormalizePrice(tp));
   if (!sent || !TradeRetcodeOk()) {
      Log("PositionModify failed: " + g_trade.ResultRetcodeDescription());
      return false;
   }
   return true;
}

bool CloseManagedPosition(const string reason) {
   if (!g_positionState || g_posTicket == 0 || !PositionSelectByTicket(g_posTicket)) return false;
   bool sent = g_trade.PositionClose(g_posTicket, SlippagePoints);
   if (!sent || !TradeRetcodeOk()) {
      Log("Close failed (" + reason + "): " + g_trade.ResultRetcodeDescription());
      return false;
   }
   Log("Position closed: " + reason);
   g_status = "closed: " + reason;
   return true;
}

void CloseAllStrategyPositions(const string reason) {
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || (ulong)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      string symbol = PositionGetString(POSITION_SYMBOL);
      g_trade.SetTypeFillingBySymbol(symbol);
      bool sent = g_trade.PositionClose(ticket, SlippagePoints);
      if (!sent || !TradeRetcodeOk())
         Log("Equity-stop close failed for " + symbol + " #" + (string)ticket + ": " +
             g_trade.ResultRetcodeDescription());
      else
         Log("Equity stop closed " + symbol + " #" + (string)ticket + ": " + reason);
   }
   g_trade.SetTypeFillingBySymbol(_Symbol);
}

bool EnforceAccountProtection() {
   RefreshEquityLock();
   datetime now = TimeCurrent();
   if (now == g_lastProtectionCheck) return !g_equityLocked;
   g_lastProtectionCheck = now;
   if (!g_equityLocked) {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      string reason = "";

      if (MinimumAccountEquity > 0.0 && equity <= MinimumAccountEquity) {
         reason = "minimum account equity";
      } else if (MaxFloatingDrawdownPct > 0.0 && balance > 0.0 &&
                 (balance - equity) / balance * 100.0 >= MaxFloatingDrawdownPct) {
         reason = "floating drawdown limit";
      } else {
         double dayStartBalance = 0.0;
         double dayPnl = AccountDayPnl(dayStartBalance);
         if (MaxDailyLossMoney > 0.0 && dayPnl <= -MaxDailyLossMoney) {
            reason = "daily money loss limit";
         } else if (MaxDailyLossPct > 0.0 && dayStartBalance > 0.0 &&
                    dayPnl / dayStartBalance * 100.0 <= -MaxDailyLossPct) {
            reason = "daily percentage loss limit";
         }
      }

      if (reason != "") {
         SaveEquityLock(BrokerDayStart(now), reason);
         Log("ACCOUNT PROTECTION TRIGGERED: " + reason + "; entries locked until next broker day");
      }
   }

   if (g_equityLocked) {
      g_status = "LOCKED: " + g_equityLockReason;
      g_armDir = 0;
      g_armAge = 0;
      if (CloseStrategyOnEquityStop) CloseAllStrategyPositions(g_equityLockReason);
      return false;
   }
   return true;
}

ENUM_ORDER_TYPE_FILLING SymbolFillingMode() {
   long mode = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if ((mode & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK) return ORDER_FILLING_FOK;
   if ((mode & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

bool ClosePartialRaw(const double volume) {
   if (!PositionSelectByTicket(g_posTicket)) return false;
   MqlTick tick;
   if (!SymbolInfoTick(_Symbol, tick)) return false;
   bool isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;

   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   request.action = TRADE_ACTION_DEAL;
   request.position = g_posTicket;
   request.symbol = _Symbol;
   request.magic = MagicNumber;
   request.volume = volume;
   request.deviation = SlippagePoints;
   request.type = isLong ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   request.price = isLong ? tick.bid : tick.ask;
   request.type_filling = SymbolFillingMode();
   request.comment = "TPAX T1";
   if (!OrderSend(request, result)) {
      Log("Partial close OrderSend failed: " + (string)GetLastError());
      return false;
   }
   if (result.retcode != TRADE_RETCODE_DONE && result.retcode != TRADE_RETCODE_DONE_PARTIAL) {
      Log("Partial close rejected: " + result.comment);
      return false;
   }
   return true;
}

bool TakeFirstTarget() {
   if (!PositionSelectByTicket(g_posTicket)) return false;
   double currentVolume = PositionGetDouble(POSITION_VOLUME);
   if (T1ScaleOutPct >= 100) return CloseManagedPosition("T1");

   double closeVolume = NormalizeCloseVolumeDown(g_posInitialVolume * T1ScaleOutPct / 100.0);
   double minVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double remaining = currentVolume - closeVolume;
   if (closeVolume <= 0.0 || remaining < minVolume - 1e-9) {
      Log("Volume cannot be split at broker lot step; closing fully at T1");
      return CloseManagedPosition("T1 (minimum lot)");
   }
   if (!ClosePartialRaw(closeVolume)) return false;
   Log("T1 filled, closed " + DoubleToString(closeVolume, VolumeDigits(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP))) + " lots");
   return true;
}

void ManageOpenPosition() {
   ulong ticket = 0;
   if (!FindManagedPosition(ticket)) {
      if (g_positionState) {
         Log("Managed position is no longer open");
         ClearPositionState();
      }
      return;
   }

   if (!g_positionState || g_posTicket != ticket) {
      if (!LoadPositionState(ticket)) RecoverPositionState(ticket);
   }
   if (!PositionSelectByTicket(ticket) || g_posEntry <= 0.0) return;

   MqlTick tick;
   if (!SymbolInfoTick(_Symbol, tick)) return;
   double exitPrice = g_posDir == 1 ? tick.bid : tick.ask;
   if (g_posDir == 1) g_posExtreme = MathMax(g_posExtreme, tick.bid);
   else               g_posExtreme = MathMin(g_posExtreme, tick.ask);

   if (FlatBeforeWeekend && IsFridayExitTime(TimeCurrent())) {
      CloseManagedPosition("weekend");
      return;
   }

   bool reachedT1 = !g_posTp1Done && (g_posDir == 1 ? exitPrice >= g_posTp1 : exitPrice <= g_posTp1);
   if (reachedT1) {
      if (!TakeFirstTarget()) return;
      ulong remainingTicket = 0;
      if (!FindManagedPosition(remainingTicket)) return;
      g_posTicket = remainingTicket;
      g_posTp1Done = true;
   }

   if (g_posTp1Done && PositionSelectByTicket(g_posTicket)) {
      double desired = g_posStop;
      if (MoveToBreakeven) {
         double be = g_posEntry + BreakevenOffsetR * g_posRisk * g_posDir;
         desired = g_posDir == 1 ? MathMax(desired, be) : MathMin(desired, be);
      }
      if (TrailAfterT1 && g_posZoneHeight > 0.0) {
         double trail = g_posExtreme - TrailDistanceZone * g_posZoneHeight * g_posDir;
         desired = g_posDir == 1 ? MathMax(desired, trail) : MathMin(desired, trail);
      }

      double minDistance = BrokerStopDistance();
      if (g_posDir == 1) desired = MathMin(desired, tick.bid - minDistance);
      else               desired = MathMax(desired, tick.ask + minDistance);
      desired = NormalizePrice(desired);

      bool improves = g_posDir == 1 ? desired > g_posStop + PricePoint() * 0.5
                                    : desired < g_posStop - PricePoint() * 0.5;
      if (improves && ModifyManagedPosition(desired, g_posTp2)) g_posStop = desired;
   }
   SavePositionState();
}

bool OpenTrade(const int direction, const double structuralStop, const double fib) {
   string protectionReason = "";
   if (!EntryProtectionAllows(protectionReason)) {
      g_status = "skipped: " + protectionReason;
      Log(g_status);
      return false;
   }

   MqlTick tick;
   if (!SymbolInfoTick(_Symbol, tick)) return false;
   double point = PricePoint();
   if (MaxSpreadPoints > 0.0 && point > 0.0 && (tick.ask - tick.bid) / point > MaxSpreadPoints) {
      g_status = "skipped: spread";
      Log(g_status);
      return false;
   }

   double entry = direction == 1 ? tick.ask : tick.bid;
   double stop = NormalizePrice(structuralStop);
   double risk = MathAbs(entry - stop);
   if ((entry - stop) * direction <= 0.0 || risk < MinRiskWeeklyAtr * g_weeklyAtr ||
       risk > MaxRiskWeeklyAtr * g_weeklyAtr) {
      g_status = "skipped: risk bounds";
      Log(g_status);
      return false;
   }

   double tp1 = 0.0, tp2 = 0.0;
   if (!BuildTargets(entry, risk, direction, tp1, tp2)) {
      g_status = "skipped: T1 below minimum R";
      Log(g_status);
      return false;
   }
   if (!EntryPricesAllowed(direction, stop, tp2)) {
      g_status = "skipped: broker stop distance";
      Log(g_status);
      return false;
   }

   double volume = CalculateOrderVolume(direction, entry, stop);
   if (volume <= 0.0) {
      g_status = "skipped: volume below broker minimum";
      Log(g_status);
      return false;
   }

   if (!EnableTrading) {
      g_status = "dry-run " + (direction == 1 ? "LONG" : "SHORT");
      Log(g_status + " " + DoubleToString(volume, 2) + " lots");
      return false;
   }

   string comment = "TPAX " + (direction == 1 ? "L " : "S ") + DoubleToString(fib, 1);
   bool sent = direction == 1
               ? g_trade.Buy(volume, _Symbol, 0.0, stop, tp2, comment)
               : g_trade.Sell(volume, _Symbol, 0.0, stop, tp2, comment);
   if (!sent || !TradeRetcodeOk()) {
      g_status = "entry rejected";
      Log(g_status + ": " + g_trade.ResultRetcodeDescription());
      return false;
   }

   ulong ticket = 0;
   if (!FindManagedPosition(ticket) || !PositionSelectByTicket(ticket)) {
      g_status = "entry sent; position not found";
      Log(g_status);
      return false;
   }

   g_positionState = true;
   g_posTicket = ticket;
   g_posDir = direction;
   g_posEntry = PositionGetDouble(POSITION_PRICE_OPEN);
   g_posStop = stop;
   g_posRisk = MathAbs(g_posEntry - g_posStop);
   g_posFib = fib;
   g_posZoneHeight = g_zoneHeight;
   g_posExtreme = g_posEntry;
   g_posInitialVolume = PositionGetDouble(POSITION_VOLUME);
   g_posTp1Done = false;
   g_posBars = 0;
   BuildTargets(g_posEntry, g_posRisk, direction, g_posTp1, g_posTp2);
   ModifyManagedPosition(g_posStop, g_posTp2);
   g_tradesThisWeek++;
   g_status = direction == 1 ? "LONG open" : "SHORT open";
   SavePositionState();
   SaveStrategyState();
   Log(g_status + " ticket=" + (string)ticket + " lots=" + DoubleToString(g_posInitialVolume, 2) +
       " SL=" + DoubleToString(g_posStop, PriceDigits()) + " T1=" + DoubleToString(g_posTp1, PriceDigits()) +
       " T2=" + DoubleToString(g_posTp2, PriceDigits()));
   return true;
}

int EntryFibCount() {
   if (EntryNotches == TP_NOTCH_0_ONLY) return 1;
   if (EntryNotches == TP_NOTCH_0_M05_M10) return 3;
   return 2;
}

double EntryFib(const int index) {
   if (index == 0) return 0.0;
   if (index == 1) return -0.5;
   return -1.0;
}

void ProcessSetup(const MqlRates &bar, const bool inSession, const bool canArm) {
   if (g_armDir == 0 && canArm) {
      bool found = false;
      double bestFib = 0.0;
      for (int i = 0; i < EntryFibCount(); i++) {
         double fib = EntryFib(i);
         double mid = NotchPrice(fib, g_tradeDir);
         if (bar.high >= mid - g_zoneHeight / 2.0 && bar.low <= mid + g_zoneHeight / 2.0) {
            if (!found || fib < bestFib) { found = true; bestFib = fib; }
         }
      }

      if (found) {
         g_armDir = g_tradeDir;
         g_armFib = bestFib;
         g_armZoneMid = NotchPrice(bestFib, g_armDir);
         g_armZoneAdv = g_armDir == 1 ? g_armZoneMid - g_zoneHeight / 2.0
                                      : g_armZoneMid + g_zoneHeight / 2.0;
         g_armZoneFar = g_armDir == 1 ? g_armZoneMid + g_zoneHeight / 2.0
                                      : g_armZoneMid - g_zoneHeight / 2.0;
         g_armExtreme = g_armDir == 1 ? bar.low : bar.high;
         g_armAge = 0;
         g_status = "armed " + DoubleToString(bestFib, 1);
         Log(g_status);
      }
   }

   if (g_armDir == 0) return;
   g_armExtreme = g_armDir == 1 ? MathMin(g_armExtreme, bar.low) : MathMax(g_armExtreme, bar.high);
   double failLine = g_armZoneAdv - SetupFailBufferZone * g_zoneHeight * g_armDir;
   bool expired = g_armAge > ReclaimBars || g_tradeDir != g_armDir || !g_dataReady;
   bool broke = g_armDir == 1 ? bar.close < failLine : bar.close > failLine;
   double reclaim = ReclaimLevel == TP_RECLAIM_FAR_SIDE ? g_armZoneFar : g_armZoneMid;
   bool sameBarOk = AllowSameBar || g_armAge > 0;
   bool bodyOk = g_armDir == 1 ? bar.close > bar.open : bar.close < bar.open;
   bool levelOk = g_armDir == 1 ? bar.close > reclaim : bar.close < reclaim;

   double chartMa = 0.0;
   bool maAvailable = CalculateMa(ActiveTimeframe(), 1, Ma2Length, Ma2Method, chartMa);
   bool maOk = !RequireChartMa || !maAvailable || (g_armDir == 1 ? bar.close > chartMa : bar.close < chartMa);
   bool triggered = !expired && !broke && sameBarOk && bodyOk && levelOk && maOk && inSession;

   if (triggered) {
      double stop = g_armDir == 1
                    ? MathMin(g_armExtreme, g_armZoneAdv) - StopBufferZone * g_zoneHeight
                    : MathMax(g_armExtreme, g_armZoneAdv) + StopBufferZone * g_zoneHeight;
      OpenTrade(g_armDir, stop, g_armFib);
   }

   if (triggered || expired || broke) {
      if (expired) g_status = "setup expired";
      if (broke)   g_status = "setup invalidated";
      g_armDir = 0;
      g_armAge = 0;
   }
}

void ProcessClosedBar() {
   MqlRates bars[];
   ArraySetAsSeries(bars, true);
   if (CopyRates(_Symbol, ActiveTimeframe(), 1, 1, bars) != 1) return;
   MqlRates bar = bars[0];

   bool hadArm = g_armDir != 0;
   if (hadArm) g_armAge++;

   RefreshWeek();
   RefreshMarketState();
   UpdateExcursion(bar);

   ulong ticket = 0;
   bool hasManaged = FindManagedPosition(ticket);
   if (hasManaged) {
      if (!g_positionState || g_posTicket != ticket) {
         if (!LoadPositionState(ticket)) RecoverPositionState(ticket);
      }
      g_posBars++;
      SavePositionState();
      if (ExitOnBiasFlip && ((g_posDir == 1 && g_structBias == -1) ||
                             (g_posDir == -1 && g_structBias == 1))) {
         CloseManagedPosition("bias flip");
      } else if (MaxBarsInTrade > 0 && g_posBars >= MaxBarsInTrade) {
         CloseManagedPosition("time exit");
      }
      SaveStrategyState();
      return;
   }

   bool inSession = IsInSession(bar.time);
   double premium = g_tradeDir == 0 || !g_dataReady ? 0.0
                    : (bar.close - g_weeklyClose) * g_tradeDir / g_weeklyAtr;
   double spentFav = FavSpent();
   double spentAdv = AdvSpent();
   bool gateSpent = !UseSpentGate || !g_hasWkFav || spentFav <= MaxWeekSpent;
   bool gateAdverse = !UseAdverseGate || !g_hasWkAdv || spentAdv <= MaxWeekAdverse;
   bool gatePremium = !UsePremiumGate || premium <= MaxPremium;
   bool sideAllowed = g_tradeDir == 1 ? TradeLongs : g_tradeDir == -1 ? TradeShorts : false;
   bool fridayBlocked = FlatBeforeWeekend && IsFridayExitTime(bar.time);
   bool foreignPosition = RespectAnySymbolPosition && HasAnySymbolPosition();
   string protectionReason = "";
   bool protectionAllows = EntryProtectionAllows(protectionReason);
   bool canArm = g_dataReady && g_tradeDir != 0 && sideAllowed && inSession &&
                 gateSpent && gateAdverse && gatePremium && !fridayBlocked &&
                 g_tradesThisWeek < MaxTradesPerWeek && !foreignPosition && protectionAllows;

   if (!protectionAllows && g_armDir == 0) g_status = "blocked: " + protectionReason;

   ProcessSetup(bar, inSession, canArm);
   SaveStrategyState();
}

string DirectionText(const int direction) {
   if (direction == 1) return "BULLISH";
   if (direction == -1) return "BEARISH";
   return "BLOCKED / NEUTRAL";
}

void UpdateDashboard() {
   if (!ShowDashboard) return;
   string setup = g_positionState ? "in position" : g_armDir != 0
                  ? "armed " + DoubleToString(g_armFib, 1) + " (age " + (string)g_armAge + ")"
                  : "waiting";
   string text = "TradePilot ATR Excursion EA\n";
   text += _Symbol + "  " + EnumToString(ActiveTimeframe()) + "  " + (EnableTrading ? "LIVE" : "DRY RUN") + "\n";
   text += "Bias: " + DirectionText(g_tradeDir) + "  structure=" + (string)g_structBias +
           "  MA W/D/H4=" + (string)g_voteW + "/" + (string)g_voteD + "/" + (string)g_voteH4 + "\n";
   text += "Setup: " + setup + "  trades/week=" + (string)g_tradesThisWeek + "/" + (string)MaxTradesPerWeek + "\n";
   text += "Anchor: " + DoubleToString(g_weeklyClose, PriceDigits()) +
           "  W-ATR: " + DoubleToString(g_weeklyAtr, PriceDigits()) +
           "  zone: " + DoubleToString(g_zoneHeight, PriceDigits()) + "\n";
   text += "Spent fav/adv: " + DoubleToString(FavSpent(), 2) + " / " + DoubleToString(AdvSpent(), 2) + " W-ATR\n";
   text += "Equity/balance: " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + " / " +
           DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
           "  open(strategy/account): " + (string)CountStrategyOpenPositions() + "/" + (string)PositionsTotal() + "\n";
   text += "Lot bounds: " + DoubleToString(MinimumLotSize, 2) + " - " +
           (MaximumLotSize > 0.0 ? DoubleToString(MaximumLotSize, 2) : "broker max") + "\n";
   text += "Status: " + g_status;
   Comment(text);
}

int OnInit() {
   if (AtrLength < 1 || SwingBars < 1 || RiskPerTradePct <= 0.0 ||
       MaxTradesPerWeek < 1 || ReclaimBars < 1 || T1ScaleOutPct < 1 || T1ScaleOutPct > 100 ||
       MinimumLotSize < 0.0 || MaximumLotSize < 0.0 ||
       (MaximumLotSize > 0.0 && MinimumLotSize > MaximumLotSize) ||
       MaxStrategyOpenTrades < 0 || MaxAccountOpenTrades < 0 || MaxTradesPerDay < 0 ||
       MaxLosingTradesPerDay < 0 || MinimumAccountEquity < 0.0 ||
       MaxFloatingDrawdownPct < 0.0 || MaxDailyLossPct < 0.0 || MaxDailyLossMoney < 0.0) {
      Print("[TP ATR X] Invalid inputs");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_weeklyAtrHandle = iATR(_Symbol, PERIOD_W1, AtrLength);
   g_h4AtrHandle = iATR(_Symbol, PERIOD_H4, AtrLength);
   if (g_weeklyAtrHandle == INVALID_HANDLE || g_h4AtrHandle == INVALID_HANDLE) {
      Print("[TP ATR X] Could not create ATR handles");
      return INIT_FAILED;
   }

   g_trade.SetExpertMagicNumber(MagicNumber);
   g_trade.SetDeviationInPoints(SlippagePoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetAsyncMode(false);
   RefreshEquityLock();

   g_weekStart = iTime(_Symbol, PERIOD_W1, 0);
   RefreshMarketState();
   if (!LoadStrategyState()) {
      g_tradesThisWeek = CountWeekEntries();
      RebuildCurrentWeekExcursion();
   }

   ulong ticket = 0;
   if (FindManagedPosition(ticket)) {
      if (!LoadPositionState(ticket)) RecoverPositionState(ticket);
   }

   g_lastBarOpen = iTime(_Symbol, ActiveTimeframe(), 0);
   int seconds = PeriodSeconds(ActiveTimeframe());
   if (seconds < 3600 || seconds > 7200)
      Log("Warning: the source strategy was designed for H1/H2 charts");
   EventSetTimer(1);
   g_status = "ready";
   Log("Initialized on " + _Symbol + " " + EnumToString(ActiveTimeframe()) +
       "; session and Friday hours use broker server time");
   UpdateDashboard();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   SaveStrategyState();
   SavePositionState();
   EventKillTimer();
   if (g_weeklyAtrHandle != INVALID_HANDLE) IndicatorRelease(g_weeklyAtrHandle);
   if (g_h4AtrHandle != INVALID_HANDLE) IndicatorRelease(g_h4AtrHandle);
   Comment("");
}

void OnTick() {
   EnforceAccountProtection();
   ManageOpenPosition();
   datetime currentBar = iTime(_Symbol, ActiveTimeframe(), 0);
   if (currentBar > 0 && g_lastBarOpen > 0 && currentBar != g_lastBarOpen) {
      g_lastBarOpen = currentBar;
      ProcessClosedBar();
   } else if (g_lastBarOpen == 0) {
      g_lastBarOpen = currentBar;
   }
   UpdateDashboard();
}

void OnTimer() {
   EnforceAccountProtection();
   ManageOpenPosition();
   UpdateDashboard();
}
//+------------------------------------------------------------------+
