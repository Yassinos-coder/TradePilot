//+------------------------------------------------------------------+
//| TradePilot_ORB_EA.mq5                                            |
//| Autonomous Opening Range Breakout (ORB) strategy.                |
//|                                                                  |
//| Strategy (New York session):                                     |
//|   1. Mark the opening range High/Low (wicks included) formed by  |
//|      the first N minutes after 09:30 New York.                   |
//|   2. Drop to a lower confirmation timeframe (M1 / M2 / M5).       |
//|   3. Wait for a candle to CLOSE outside the range.               |
//|        close > rangeHigh  -> BUY                                 |
//|        close < rangeLow   -> SELL                                |
//|   4. One breakout per direction per day, one trade per symbol.   |
//|   5. ATR stop-loss, Risk:Reward take-profit, fixed or risk% lot. |
//|                                                                  |
//| Multi-symbol: every symbol in the Symbols input is traded from   |
//| a single chart with fully independent daily state.               |
//|                                                                  |
//| Architecture (modular, extension-ready):                         |
//|   CLogger       - gated structured logging                       |
//|   CTimeManager  - NY <-> broker time conversion + US/EU DST      |
//|   CTradeMath    - ATR stops, RR targets, lot sizing, volume calc |
//|   CSymbolTrader - per-symbol daily state machine                 |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property description "Autonomous Opening Range Breakout (ORB) EA - NY session, multi-symbol"
#property strict

#include <Trade/Trade.mqh>

//==================================================================
//  ENUMS
//==================================================================
enum EConfirmTF        { CTF_M1 = 0, CTF_M2 = 1, CTF_M5 = 2 };
enum ESizingMode       { SIZING_FIXED = 0, SIZING_RISK_PERCENT = 1 };
enum EBrokerTimeMode   { BROKER_AUTO_DETECT = 0, BROKER_MANUAL_OFFSET = 1 };

//==================================================================
//  INPUTS  (every parameter is optimizable in the Strategy Tester)
//==================================================================
input group "=== Symbols ==="
input string          InpSymbols               = "XAUUSD,US100,US30,NZDUSD"; // Comma-separated symbols

input group "=== New York Session ==="
input int             InpSessionStartHour      = 9;   // NY session start hour
input int             InpSessionStartMinute    = 30;  // NY session start minute
input int             InpOpeningRangeMinutes   = 15;  // Opening range duration (minutes)
input int             InpEntryWindowEndHour    = 12;  // Last entry hour (NY)
input int             InpEntryWindowEndMinute  = 0;   // Last entry minute (NY)

input group "=== Broker Time / DST ==="
input EBrokerTimeMode InpBrokerTimeMode        = BROKER_AUTO_DETECT; // Live: AUTO_DETECT, Tester: MANUAL_OFFSET
input int             InpManualBrokerGmtOffset = 2;    // Broker GMT offset in WINTER (hours)
input bool            InpBrokerFollowsEuDst    = true; // Broker shifts +1h on EU summer time

input group "=== Breakout Confirmation ==="
input EConfirmTF      InpConfirmTimeframe      = CTF_M1; // Confirmation timeframe

input group "=== Stop Loss (ATR) ==="
input int             InpAtrPeriod             = 14;         // ATR period
input ENUM_TIMEFRAMES InpAtrTimeframe          = PERIOD_M15; // ATR timeframe
input double          InpAtrMultiplier         = 1.5;        // ATR multiplier

input group "=== Take Profit ==="
input double          InpRiskRewardRatio       = 2.0;   // Risk : Reward ratio (R)

input group "=== Position Sizing ==="
input ESizingMode     InpSizingMode            = SIZING_RISK_PERCENT; // Lot mode
input double          InpFixedLotSize          = 0.10;  // Fixed lot size
input double          InpRiskPercent           = 1.0;   // Risk % of balance (Risk% mode)
input bool            InpSkipIfRiskLotBelowMin = true;  // Risk%: skip if broker min lot would exceed target risk

input group "=== Filters ==="
input int             InpMaxSpreadPoints       = 50;    // Max spread in points (0 = disabled)
input bool            InpRespectAnySymbolPosition = false; // Block if any position exists on symbol

input group "=== Trading Schedule ==="
input bool            InpTradeMonday           = true;
input bool            InpTradeTuesday          = true;
input bool            InpTradeWednesday        = true;
input bool            InpTradeThursday         = true;
input bool            InpTradeFriday           = true;

input group "=== Execution ==="
input ulong           InpMagicNumber           = 20260723; // Magic number
input int             InpSlippagePoints        = 20;       // Max slippage (points)
input bool            InpOneTradePerSymbolDay  = true;     // true = no opposite breakout after first trade closes
input bool            InpEnableTrading         = true;     // false = dry-run (log only)
input bool            InpEnableLogging         = true;     // Verbose logging

input group "=== Dashboard ==="
input bool            InpShowDashboard         = true;  // Show on-chart panel (auto-off in tester)
input int             InpDashboardX            = 12;
input int             InpDashboardY            = 20;
input int             InpDashboardWidth        = 360;
input int             InpDashboardFontSize     = 9;

//==================================================================
//  GLOBAL TRADE OBJECT
//==================================================================
CTrade g_trade;

//==================================================================
//  CLogger - gated, structured logging.
//  Info/Warn respect InpEnableLogging; Errors are always printed.
//==================================================================
class CLogger
{
public:
   static void Info(const string ctx, const string msg)
   {
      if(InpEnableLogging) Print("[ORB][", ctx, "] ", msg);
   }
   static void Warn(const string ctx, const string msg)
   {
      if(InpEnableLogging) Print("[ORB][", ctx, "][WARN] ", msg);
   }
   static void Error(const string ctx, const string msg)
   {
      Print("[ORB][", ctx, "][ERROR] ", msg);
   }
};

//==================================================================
//  CTimeManager - converts New York wall-clock time to broker
//  server time year-round, handling US Eastern DST (always) and,
//  in MANUAL mode, the broker's own EU DST shift.
//==================================================================
class CTimeManager
{
public:
   //--- Broker server offset from UTC (seconds), per selected mode.
   static int BrokerOffsetSeconds(const datetime serverNow)
   {
      // In the Strategy Tester, TimeGMT() is simulated from tester data and
      // broker-offset auto-detection is not deterministic. Prefer the manual
      // winter GMT offset path there so NY 09:30 maps consistently.
      if(InpBrokerTimeMode == BROKER_AUTO_DETECT && !MQLInfoInteger(MQL_TESTER))
      {
         long diff    = (long)serverNow - (long)TimeGMT();
         long rounded = (long)MathRound((double)diff / 1800.0) * 1800; // nearest 30 min
         return (int)rounded;
      }

      int base = InpManualBrokerGmtOffset * 3600;
      if(InpBrokerFollowsEuDst)
      {
         datetime utcApprox = serverNow - base;
         if(IsEuDstActive(utcApprox)) base += 3600;
      }
      return base;
   }

   //--- Current time expressed in New York local time.
   static void GetNyTime(const datetime serverNow, MqlDateTime &ny)
   {
      int      brokerOff = BrokerOffsetSeconds(serverNow);
      datetime utc       = serverNow - brokerOff;
      TimeToStruct(utc + NyOffsetSeconds(utc), ny);
   }

   //--- Server time for a given NY wall-clock time on today's NY date.
   static datetime NyWallToServer(const datetime serverNow, const int hour, const int minute)
   {
      int      brokerOff = BrokerOffsetSeconds(serverNow);
      datetime utc       = serverNow - brokerOff;
      int      nyOff     = NyOffsetSeconds(utc);

      MqlDateTime ny;
      TimeToStruct(utc + nyOff, ny);
      ny.hour = hour;
      ny.min  = minute;
      ny.sec  = 0;

      datetime nyWall = StructToTime(ny);
      datetime utcT   = nyWall - nyOff;   // NY local -> UTC
      return utcT + brokerOff;            // UTC -> server
   }

private:
   //--- US Eastern offset from UTC in seconds (EDT -4h / EST -5h).
   static int NyOffsetSeconds(const datetime utc)
   {
      return IsUsEasternDstActive(utc) ? -4 * 3600 : -5 * 3600;
   }

   //--- US DST: 2nd Sunday of March 02:00 -> 1st Sunday of November 02:00.
   static bool IsUsEasternDstActive(const datetime t)
   {
      MqlDateTime dt;
      TimeToStruct(t, dt);
      if(dt.mon < 3 || dt.mon > 11) return false;
      if(dt.mon > 3 && dt.mon < 11) return true;
      if(dt.mon == 3)  return dt.day >= NthSundayDay(dt.year, 3, 2);
      return dt.day < NthSundayDay(dt.year, 11, 1); // November
   }

   //--- EU DST: last Sunday of March -> last Sunday of October.
   static bool IsEuDstActive(const datetime t)
   {
      MqlDateTime dt;
      TimeToStruct(t, dt);
      if(dt.mon < 3 || dt.mon > 10) return false;
      if(dt.mon > 3 && dt.mon < 10) return true;
      if(dt.mon == 3)  return dt.day >= LastSundayDay(dt.year, 3);
      return dt.day < LastSundayDay(dt.year, 10); // October
   }

   //--- Day-of-month of the n-th Sunday of a month.
   static int NthSundayDay(const int year, const int month, const int n)
   {
      MqlDateTime dt;
      ZeroMemory(dt);
      dt.year = year;
      dt.mon  = month;
      dt.day  = 1;

      MqlDateTime f;
      TimeToStruct(StructToTime(dt), f);
      int firstSunday = 1 + ((7 - f.day_of_week) % 7);
      return firstSunday + (n - 1) * 7;
   }

   //--- Day-of-month of the last Sunday of a month.
   static int LastSundayDay(const int year, const int month)
   {
      int ny = year, nm = month + 1;
      if(nm > 12) { nm = 1; ny++; }

      MqlDateTime dt;
      ZeroMemory(dt);
      dt.year = ny;
      dt.mon  = nm;
      dt.day  = 1;

      datetime lastDay = StructToTime(dt) - 86400; // last day of `month`
      MqlDateTime f;
      TimeToStruct(lastDay, f);
      return f.day - f.day_of_week;
   }
};

//==================================================================
//  CTradeMath - pure calculations: pip size, volume normalization,
//  ATR reading and risk-based lot sizing. No state, no side effects.
//==================================================================
class CTradeMath
{
public:
   //--- Pip size (handles 3/5-digit quotes).
   static double PipSize(const string sym)
   {
      int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double point  = SymbolInfoDouble(sym, SYMBOL_POINT);
      return (digits == 3 || digits == 5) ? point * 10.0 : point;
   }

   //--- Clamp a raw volume to the symbol's min/max/step and digits.
   static double NormalizeVolume(const string sym, double volume)
   {
      double minLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
      double maxLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
      double step   = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
      if(step <= 0.0) step = 0.01;

      volume = MathFloor(volume / step + 1e-8) * step;
      if(minLot > 0.0 && volume < minLot) volume = minLot;
      if(maxLot > 0.0 && volume > maxLot) volume = maxLot;

      int volDigits = 2;
      if(step >= 0.1)        volDigits = 1;
      else if(step >= 0.01)  volDigits = 2;
      else if(step >= 0.001) volDigits = 3;
      else                   volDigits = 4;

      return NormalizeDouble(volume, volDigits);
   }

   static double MinVolume(const string sym)
   {
      return SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   }

   //--- Read the ATR of the last completed bar. Returns false if not ready.
   static bool GetAtr(const int handle, double &atr)
   {
      atr = 0.0;
      if(handle == INVALID_HANDLE)   return false;
      if(BarsCalculated(handle) <= 0) return false;

      double buf[];
      if(CopyBuffer(handle, 0, 1, 1, buf) != 1) return false;
      atr = buf[0];
      return atr > 0.0;
   }

   //--- Lot size so that `slDistancePrice` of adverse move costs `riskMoney`.
   static double LotForRisk(const string sym, const double riskMoney, const double slDistancePrice)
   {
      double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double tickSize  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      if(tickValue <= 0.0 || tickSize <= 0.0 || slDistancePrice <= 0.0) return 0.0;

      double lossPerLot = (slDistancePrice / tickSize) * tickValue;
      if(lossPerLot <= 0.0) return 0.0;
      return riskMoney / lossPerLot;
   }
};

//--- Map the restricted confirmation-TF enum to a real timeframe.
ENUM_TIMEFRAMES ConfirmTF()
{
   switch(InpConfirmTimeframe)
   {
      case CTF_M1: return PERIOD_M1;
      case CTF_M2: return PERIOD_M2;
      case CTF_M5: return PERIOD_M5;
   }
   return PERIOD_M1;
}

//==================================================================
//  CSymbolTrader - one instance per symbol. Owns that symbol's ATR
//  handle and its independent daily ORB state machine.
//==================================================================
class CSymbolTrader
{
private:
   string   m_symbol;
   int      m_atrHandle;
   bool     m_valid;

   // Daily state (reset on New York day rollover)
   int      m_tradeDayKey;      // yyyymmdd of the active NY day
   bool     m_rangeReady;
   double   m_rangeHigh;
   double   m_rangeLow;
   bool     m_tradedToday;
   bool     m_boughtToday;
   bool     m_soldToday;
   datetime m_lastConfirmBar;   // new-candle detector on the confirm TF

public:
   CSymbolTrader(const string sym)
   {
      m_symbol       = sym;
      m_atrHandle    = INVALID_HANDLE;
      m_valid        = false;
      m_tradeDayKey  = -1;
      ResetDaily();
   }
   ~CSymbolTrader() { Deinit(); }

   string Symbol()  const { return m_symbol; }
   bool   IsValid() const { return m_valid; }

   //--- Create Market-Watch subscription and ATR handle.
   bool Init()
   {
      if(!SymbolSelect(m_symbol, true))
      {
         CLogger::Error(m_symbol, "SymbolSelect failed - unknown symbol or not available");
         m_valid = false;
         return false;
      }

      m_atrHandle = iATR(m_symbol, InpAtrTimeframe, InpAtrPeriod);
      if(m_atrHandle == INVALID_HANDLE)
      {
         CLogger::Error(m_symbol, StringFormat("iATR failed err=%d", GetLastError()));
         m_valid = false;
         return false;
      }

      m_tradeDayKey = -1;
      ResetDaily();
      m_valid = true;
      CLogger::Info(m_symbol, "Initialised");
      return true;
   }

   void Deinit()
   {
      if(m_atrHandle != INVALID_HANDLE)
      {
         IndicatorRelease(m_atrHandle);
         m_atrHandle = INVALID_HANDLE;
      }
   }

   //--- Main per-symbol cycle, called on every timer tick.
   void Update(const datetime serverNow)
   {
      if(!m_valid) return;

      // 1. Roll to a new NY day -> reset daily state.
      MqlDateTime ny;
      CTimeManager::GetNyTime(serverNow, ny);
      int dayKey = ny.year * 10000 + ny.mon * 100 + ny.day;
      if(dayKey != m_tradeDayKey)
      {
         m_tradeDayKey = dayKey;
         ResetDaily();
         CLogger::Info(m_symbol, StringFormat("Daily reset - NY day %04d-%02d-%02d", ny.year, ny.mon, ny.day));
      }

      // 2. Manage any open position (extension hooks live here).
      ManageOpenPosition(serverNow);

      // 3. Only trade on permitted weekdays.
      if(!IsTradingDay(ny.day_of_week)) return;

      datetime sessionStart = CTimeManager::NyWallToServer(serverNow, InpSessionStartHour, InpSessionStartMinute);
      datetime rangeEnd     = sessionStart + InpOpeningRangeMinutes * 60;

      // 4. Build the opening range once its window has fully closed.
      if(!m_rangeReady)
      {
         if(serverNow < rangeEnd) return;         // range window still forming
         if(!BuildRange(sessionStart, rangeEnd)) return; // data not synced yet - retry next tick

         m_rangeReady = true;
         int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
         CLogger::Info(m_symbol, StringFormat("Opening range formed [%s - %s]  High=%s  Low=%s",
                       TimeToString(sessionStart, TIME_MINUTES),
                       TimeToString(rangeEnd, TIME_MINUTES),
                       DoubleToString(m_rangeHigh, digits),
                       DoubleToString(m_rangeLow, digits)));
      }

      // 5. Watch the confirmation timeframe for a breakout close.
      TryBreakout(serverNow, rangeEnd);
   }

   //--- Compact one-line status for the dashboard.
   string DashboardLine()
   {
      int    digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      string range  = m_rangeReady
                    ? StringFormat("H %s L %s", DoubleToString(m_rangeHigh, digits), DoubleToString(m_rangeLow, digits))
                    : "range pending";
      string dir    = StringFormat("B:%s S:%s", m_boughtToday ? "x" : "-", m_soldToday ? "x" : "-");
      string pos    = HasOpenPosition() ? "POS" : "flat";
      return StringFormat("%-8s | %-22s | %s | %s", m_symbol, range, dir, pos);
   }

   //--- Public so the dashboard can query it.
   bool HasOpenPosition()
   {
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
         if(PositionGetString(POSITION_SYMBOL) != m_symbol) continue;
         if(InpRespectAnySymbolPosition) return true;
         if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;
         return true;
      }
      return false;
   }

private:
   void ResetDaily()
   {
      m_rangeReady     = false;
      m_rangeHigh      = 0.0;
      m_rangeLow       = 0.0;
      m_tradedToday    = false;
      m_boughtToday    = false;
      m_soldToday      = false;
      m_lastConfirmBar = 0;
   }

   bool IsTradingDay(const int dow)
   {
      switch(dow)
      {
         case 1: return InpTradeMonday;
         case 2: return InpTradeTuesday;
         case 3: return InpTradeWednesday;
         case 4: return InpTradeThursday;
         case 5: return InpTradeFriday;
      }
      return false; // weekend
   }

   //--- High/Low (wicks included) over [sessionStart, rangeEnd) on M1.
   bool BuildRange(const datetime sessionStart, const datetime rangeEnd)
   {
      MqlRates rates[];
      int copied = CopyRates(m_symbol, PERIOD_M1, sessionStart, rangeEnd - 1, rates);
      if(copied <= 0) return false;

      double hi = -DBL_MAX, lo = DBL_MAX;
      int used = 0;
      for(int i = 0; i < copied; i++)
      {
         if(rates[i].time < sessionStart || rates[i].time >= rangeEnd) continue;
         hi = MathMax(hi, rates[i].high);
         lo = MathMin(lo, rates[i].low);
         used++;
      }

      // Avoid forming an OR from partially-synchronised history. M1 data should
      // contain one bar per opening-range minute before the range is trusted.
      if(used < InpOpeningRangeMinutes)
      {
         CLogger::Warn(m_symbol, StringFormat("Opening range history incomplete: %d/%d M1 bars - retrying", used, InpOpeningRangeMinutes));
         return false;
      }
      if(hi <= 0.0 || lo <= 0.0 || hi <= lo) return false;
      m_rangeHigh = hi;
      m_rangeLow  = lo;
      return true;
   }

   //--- On each freshly-closed confirm candle, act on a range breakout.
   void TryBreakout(const datetime serverNow, const datetime rangeEnd)
   {
      if(InpOneTradePerSymbolDay && m_tradedToday) return;
      if(m_boughtToday && m_soldToday) return;

      datetime entryEnd = CTimeManager::NyWallToServer(serverNow, InpEntryWindowEndHour, InpEntryWindowEndMinute);
      if(serverNow > entryEnd) return;     // entry window closed for the day
      if(HasOpenPosition())    return;     // one trade per symbol at a time

      ENUM_TIMEFRAMES tf = ConfirmTF();
      datetime curBarOpen = iTime(m_symbol, tf, 0);
      if(curBarOpen == 0) return;                 // series not ready
      if(curBarOpen == m_lastConfirmBar) return;  // no new bar yet
      m_lastConfirmBar = curBarOpen;

      // The bar at shift 1 has just closed. It must lie fully after the range.
      datetime prevBarOpen = iTime(m_symbol, tf, 1);
      if(prevBarOpen == 0 || prevBarOpen < rangeEnd) return;

      double close1 = iClose(m_symbol, tf, 1);
      if(close1 <= 0.0) return;

      // Spread filter: calculate from the current tick so live executable
      // spread is used instead of a possibly stale SYMBOL_SPREAD snapshot.
      if(InpMaxSpreadPoints > 0)
      {
         MqlTick spreadTick;
         double point = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
         if(!SymbolInfoTick(m_symbol, spreadTick) || spreadTick.ask <= 0.0 || spreadTick.bid <= 0.0 || point <= 0.0)
         {
            CLogger::Warn(m_symbol, "No valid tick for spread check - skipping breakout");
            return;
         }
         double spreadPts = (spreadTick.ask - spreadTick.bid) / point;
         if(spreadPts > InpMaxSpreadPoints)
         {
            CLogger::Warn(m_symbol, StringFormat("Spread %.1f > max %d - skipping breakout", spreadPts, InpMaxSpreadPoints));
            return;
         }
      }

      int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);

      if(!m_boughtToday && close1 > m_rangeHigh)
      {
         CLogger::Info(m_symbol, StringFormat("Breakout UP detected: close %s > rangeHigh %s",
                       DoubleToString(close1, digits), DoubleToString(m_rangeHigh, digits)));
         OpenTrade(true);
         return;
      }

      if(!m_soldToday && close1 < m_rangeLow)
      {
         CLogger::Info(m_symbol, StringFormat("Breakout DOWN detected: close %s < rangeLow %s",
                       DoubleToString(close1, digits), DoubleToString(m_rangeLow, digits)));
         OpenTrade(false);
      }
   }

   //--- Compute ATR SL, RR TP, size, validate and send the order.
   bool OpenTrade(const bool isBuy)
   {
      double atr;
      if(!CTradeMath::GetAtr(m_atrHandle, atr))
      {
         CLogger::Error(m_symbol, "ATR not ready - entry skipped");
         return false;
      }

      double slDist = atr * InpAtrMultiplier;
      if(slDist <= 0.0)
      {
         CLogger::Error(m_symbol, "Invalid ATR stop distance - entry skipped");
         return false;
      }

      MqlTick tick;
      if(!SymbolInfoTick(m_symbol, tick) || tick.ask <= 0.0 || tick.bid <= 0.0)
      {
         CLogger::Error(m_symbol, "No valid market price - entry skipped");
         return false;
      }

      int    digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      double entry  = isBuy ? tick.ask : tick.bid;
      double sl     = isBuy ? entry - slDist : entry + slDist;
      double tpDist = slDist * InpRiskRewardRatio;
      double tp     = isBuy ? entry + tpDist : entry - tpDist;
      sl = NormalizeDouble(sl, digits);
      tp = NormalizeDouble(tp, digits);

      // Position size.
      double lot = InpFixedLotSize;
      if(InpSizingMode == SIZING_RISK_PERCENT)
      {
         double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
         double rawLot = CTradeMath::LotForRisk(m_symbol, riskMoney, slDist);
         double minLot = CTradeMath::MinVolume(m_symbol);
         if(InpSkipIfRiskLotBelowMin && minLot > 0.0 && rawLot > 0.0 && rawLot < minLot)
         {
            CLogger::Warn(m_symbol, StringFormat("Risk lot %.4f below broker min %.4f - skipping to preserve %.2f%% risk cap",
                          rawLot, minLot, InpRiskPercent));
            return false;
         }
         lot = rawLot;
      }
      lot = CTradeMath::NormalizeVolume(m_symbol, lot);
      if(lot <= 0.0)
      {
         CLogger::Error(m_symbol, "Computed lot <= 0 - entry skipped");
         return false;
      }

      string side = isBuy ? "BUY" : "SELL";

      // Dry-run mode: log the intended trade, mark the direction, do not send.
      if(!InpEnableTrading)
      {
         CLogger::Info(m_symbol, StringFormat("DRY-RUN %s lot=%.2f entry=%s SL=%s TP=%s ATR=%s RR=%.2f",
                       side, lot, DoubleToString(entry, digits), DoubleToString(sl, digits),
                       DoubleToString(tp, digits), DoubleToString(atr, digits), InpRiskRewardRatio));
         if(isBuy) m_boughtToday = true; else m_soldToday = true;
         m_tradedToday = true;
         return true;
      }

      // Pre-trade validation (connection, permissions, symbol mode, margin).
      string reason;
      ENUM_ORDER_TYPE ot = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(!CanOpen(ot, lot, sl, tp, reason))
      {
         CLogger::Error(m_symbol, "Entry blocked: " + reason);
         return false;
      }

      g_trade.SetExpertMagicNumber(InpMagicNumber);
      g_trade.SetDeviationInPoints(InpSlippagePoints);
      g_trade.SetTypeFillingBySymbol(m_symbol);

      string comment = StringFormat("ORB-%s", isBuy ? "B" : "S");
      bool ok = isBuy
              ? g_trade.Buy(lot, m_symbol, 0.0, sl, tp, comment)
              : g_trade.Sell(lot, m_symbol, 0.0, sl, tp, comment);

      uint rc = g_trade.ResultRetcode();
      if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
      {
         if(isBuy) m_boughtToday = true; else m_soldToday = true;
         m_tradedToday = true;
         CLogger::Info(m_symbol, StringFormat("%s EXECUTED lot=%.2f entry~%s SL=%s TP=%s ATR=%s RR=%.2f rc=%d %s",
                       side, lot, DoubleToString(entry, digits), DoubleToString(sl, digits),
                       DoubleToString(tp, digits), DoubleToString(atr, digits), InpRiskRewardRatio,
                       rc, g_trade.ResultRetcodeDescription()));
         return true;
      }

      CLogger::Error(m_symbol, StringFormat("Order failed ok=%s rc=%d %s",
                     ok ? "true" : "false", rc, g_trade.ResultRetcodeDescription()));
      return false;
   }

   //--- Broker/permission/margin gate before sending an order.
   bool CanOpen(const ENUM_ORDER_TYPE ot, const double volume, const double sl, const double tp, string &reason)
   {
      reason = "";

      if(!TerminalInfoInteger(TERMINAL_CONNECTED))
      { reason = "terminal not connected"; return false; }

      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
         !MQLInfoInteger(MQL_TRADE_ALLOWED) ||
         !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      { reason = "automated trading not allowed"; return false; }

      long mode = SymbolInfoInteger(m_symbol, SYMBOL_TRADE_MODE);
      if(mode == SYMBOL_TRADE_MODE_DISABLED || mode == SYMBOL_TRADE_MODE_CLOSEONLY)
      { reason = "symbol closed for new trades"; return false; }
      if(ot == ORDER_TYPE_BUY  && mode == SYMBOL_TRADE_MODE_SHORTONLY)
      { reason = "symbol allows sell only"; return false; }
      if(ot == ORDER_TYPE_SELL && mode == SYMBOL_TRADE_MODE_LONGONLY)
      { reason = "symbol allows buy only"; return false; }

      MqlTick tick;
      if(!SymbolInfoTick(m_symbol, tick) || tick.ask <= 0.0 || tick.bid <= 0.0)
      { reason = "no valid market prices"; return false; }

      double price  = (ot == ORDER_TYPE_BUY) ? tick.ask : tick.bid;

      double point = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      long stopsLevel = SymbolInfoInteger(m_symbol, SYMBOL_TRADE_STOPS_LEVEL);
      long freezeLevel = SymbolInfoInteger(m_symbol, SYMBOL_TRADE_FREEZE_LEVEL);
      long minLevel = (stopsLevel > freezeLevel) ? stopsLevel : freezeLevel;
      if(point > 0.0 && minLevel > 0)
      {
         double minDist = minLevel * point;
         double slDist = MathAbs(price - sl);
         double tpDist = MathAbs(tp - price);
         if(slDist < minDist || tpDist < minDist)
         {
            reason = StringFormat("SL/TP too close for broker stop level: SL %.1f pts TP %.1f pts min %d pts",
                                  slDist / point, tpDist / point, (int)minLevel);
            return false;
         }
      }

      double margin = 0.0;
      if(!OrderCalcMargin(ot, m_symbol, volume, price, margin))
      { reason = StringFormat("margin calc failed err=%d", GetLastError()); return false; }
      if(AccountInfoDouble(ACCOUNT_MARGIN_FREE) < margin)
      { reason = StringFormat("insufficient free margin - need %.2f", margin); return false; }

      return true;
   }

   //--- Extension point for future trade-management modules.
   //    v1 relies on broker-side SL/TP only. Drop new behavior in here:
   //      BreakEven / TrailingStop / PartialTakeProfit / AtrTrailing /
   //      TimeBasedExit / NewsFilter / VolatilityFilter.
   void ManageOpenPosition(const datetime serverNow)
   {
      // Intentionally empty in v1.
   }
};

//==================================================================
//  GLOBAL STATE
//==================================================================
CSymbolTrader *g_traders[];
int            g_traderCount = 0;

//==================================================================
//  DASHBOARD (optional, disabled automatically in the tester)
//==================================================================
const string DASH_PREFIX = "ORB_DASH_";

void CreateOrUpdateLabel(const string name, const string text, const int x, const int y,
                         const int fontSize, const color clr)
{
   string obj = DASH_PREFIX + name;
   if(ObjectFind(0, obj) < 0)
   {
      ObjectCreate(0, obj, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clr);
   ObjectSetString(0, obj, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, obj, OBJPROP_TEXT, text);
}

void CreatePanel(const int height)
{
   string obj = DASH_PREFIX + "PANEL";
   if(ObjectFind(0, obj) < 0)
   {
      ObjectCreate(0, obj, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, obj, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   }
   ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, InpDashboardX);
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, InpDashboardY);
   ObjectSetInteger(0, obj, OBJPROP_XSIZE, InpDashboardWidth);
   ObjectSetInteger(0, obj, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, obj, OBJPROP_BGCOLOR, C'20,24,34');
   ObjectSetInteger(0, obj, OBJPROP_BORDER_COLOR, C'70,90,130');
   ObjectSetInteger(0, obj, OBJPROP_BACK, false);
}

void UpdateDashboard()
{
   int step   = 16;
   int height = 60 + (g_traderCount + 1) * step + 12;
   CreatePanel(height);

   int x = InpDashboardX + 10;
   int y = InpDashboardY + 8;

   CreateOrUpdateLabel("TITLE",
      StringFormat("TradePilot ORB  |  %d symbols  |  %s", g_traderCount, InpEnableTrading ? "LIVE" : "DRY-RUN"),
      x, y, InpDashboardFontSize + 2, clrDeepSkyBlue);
   y += 22;

   datetime now = TimeCurrent();
   MqlDateTime ny;
   CTimeManager::GetNyTime(now, ny);
   CreateOrUpdateLabel("NY",
      StringFormat("NY %02d:%02d  Server %s  Offset %+d h",
                   ny.hour, ny.min, TimeToString(now, TIME_MINUTES),
                   CTimeManager::BrokerOffsetSeconds(now) / 3600),
      x, y, InpDashboardFontSize, clrSilver);
   y += step + 6;

   for(int i = 0; i < g_traderCount; i++)
   {
      if(g_traders[i] == NULL) continue;
      color c = g_traders[i].IsValid() ? clrWhite : clrTomato;
      CreateOrUpdateLabel("SYM" + IntegerToString(i), g_traders[i].DashboardLine(),
                          x, y, InpDashboardFontSize, c);
      y += step;
   }
   ChartRedraw();
}

void RemoveDashboard()
{
   ObjectsDeleteAll(0, DASH_PREFIX);
}

//==================================================================
//  EA EVENT HANDLERS
//==================================================================
int OnInit()
{
   // Validate core inputs.
   if(InpOpeningRangeMinutes <= 0)
   {
      CLogger::Error("EA", "OpeningRangeMinutes must be > 0");
      return INIT_FAILED;
   }
   if(InpAtrPeriod <= 0 || InpAtrMultiplier <= 0.0 || InpRiskRewardRatio <= 0.0)
   {
      CLogger::Error("EA", "ATR period/multiplier and Risk:Reward must be > 0");
      return INIT_FAILED;
   }
   if(InpSizingMode == SIZING_RISK_PERCENT && InpRiskPercent <= 0.0)
   {
      CLogger::Error("EA", "RiskPercent must be > 0 in Risk% mode");
      return INIT_FAILED;
   }

   // Parse the comma-separated symbol list into per-symbol traders.
   string list[];
   int n = StringSplit(InpSymbols, ',', list);
   if(n <= 0)
   {
      CLogger::Error("EA", "No symbols parsed from Symbols input");
      return INIT_FAILED;
   }

   ArrayResize(g_traders, n);
   g_traderCount = 0;

   for(int i = 0; i < n; i++)
   {
      string sym = list[i];
      StringTrimLeft(sym);
      StringTrimRight(sym);
      if(sym == "") continue;

      CSymbolTrader *t = new CSymbolTrader(sym);
      if(!t.Init())
      {
         CLogger::Warn("EA", "Skipping symbol: " + sym);
         delete t;
         continue;
      }
      g_traders[g_traderCount++] = t;
   }

   if(g_traderCount == 0)
   {
      CLogger::Error("EA", "No valid symbols to trade");
      return INIT_FAILED;
   }
   ArrayResize(g_traders, g_traderCount);

   EventSetTimer(1);
   CLogger::Info("EA", StringFormat("ORB EA v1.00 initialised with %d symbol(s)", g_traderCount));
   if(InpShowDashboard && !MQLInfoInteger(MQL_TESTER)) UpdateDashboard();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   for(int i = 0; i < g_traderCount; i++)
   {
      if(g_traders[i] != NULL)
      {
         g_traders[i].Deinit();
         delete g_traders[i];
         g_traders[i] = NULL;
      }
   }
   ArrayFree(g_traders);
   g_traderCount = 0;
   RemoveDashboard();
}

void OnTimer()
{
   datetime now = TimeCurrent();
   for(int i = 0; i < g_traderCount; i++)
   {
      if(g_traders[i] != NULL && g_traders[i].IsValid())
         g_traders[i].Update(now);
   }

   if(InpShowDashboard && !MQLInfoInteger(MQL_TESTER))
      UpdateDashboard();
}

//--- Log fills and closes for our positions (SL/TP visibility, performance).
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0) return;
   if(!HistoryDealSelect(trans.deal)) return;
   if((ulong)HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != InpMagicNumber) return;

   string        sym   = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);

   if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
   {
      double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT)
                    + HistoryDealGetDouble(trans.deal, DEAL_SWAP)
                    + HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
      CLogger::Info(sym, StringFormat("Position closed - net %.2f %s", profit, AccountInfoString(ACCOUNT_CURRENCY)));
   }
}
//+------------------------------------------------------------------+
