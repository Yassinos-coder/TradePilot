//+------------------------------------------------------------------+
//| TradePilot_AMD_Census.mq5                                        |
//| Accumulation / Manipulation / Distribution — measurement only    |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property script_show_inputs
#property strict

//
// THIS PLACES NO ORDERS. Same protocol as the pattern census: measure first,
// pre-register the decision rule, write no strategy code until the out-of-sample
// block clears it.
//
// ---------------------------------------------------------------------------
// WHY THIS SETUP AND NOT THE LAST ONE
//
// Reversal patterns on XAUUSD H1 were killed on 335 trades over 9.6 years:
// out-of-sample t = -0.12, and the cost filter that should have saved them
// turned out to be a gold-price filter in disguise (42 of 46 survivors were
// 2025-2026, because a $0.30 spread against a $4 stop is 7.5% of risk).
//
// AMD differs in the three ways that mattered:
//
//   1. MECHANISM. Osler (NY Fed Staff Reports 125 and 150) documents that
//      stop-loss and take-profit orders cluster at round numbers — roughly 10%
//      of them at rates ending in "00" — and that rates move rapidly once those
//      clusters are reached, producing self-reinforcing price cascades. That is
//      a microstructure reason for someone to be on the other side, which is
//      exactly what a double top never had.
//
//      Read honestly, though: Osler finds cascades PROLONG the move. AMD claims
//      the sweep REVERSES it. The reconciliation — cascade runs, exhausts, then
//      reverses once the initiating flow is filled — is plausible and is the
//      thing being tested here, not assumed.
//
//   2. SAMPLE. Time-anchored, so one candidate setup per day. ~2,400 days over
//      9.6 years instead of 46 qualified trades.
//
//   3. COST. The stop sits beyond a session-range sweep, not an H1 wick, so it
//      is large in dollars and survives the years when gold traded at 1,300.
//
// Supporting evidence from the other direction: naive Asian-range breakouts run
// 40-60% with false breakouts named as the main failure mode. AMD is the inverse
// trade, so there is a real population of failed breakouts to fade.
//
// ---------------------------------------------------------------------------
// PRE-REGISTERED, BEFORE ANY RESULT IS SEEN
//
//   * Decision rule: OUT-OF-SAMPLE t >= 2. Nothing else counts.
//   * Two declared arms: "close back inside" first, "displacement" only if the
//     first fails. Two looks at one dataset, so a marginal pass on the second
//     arm needs a stricter bar than t >= 2, not the same one.
//   * Session times fixed at classic ICT PO3 and not swept.
//   * Target fixed at the opposite side of the accumulation range.
//
// ---------------------------------------------------------------------------
// TIME HANDLING — the thing most likely to silently ruin this
//
// Bar timestamps are SERVER time, which differs per broker (IC Markets runs
// GMT+2 winter / GMT+3 summer; FTMO differs again). Session windows are New
// York time. Getting this wrong measures a window nobody trades.
//
// So: server -> UTC using the EU DST calendar the broker's clock follows, then
// UTC -> New York using the US DST calendar. They disagree for about two weeks
// a year and both are handled. The report prints sample timestamps in all three
// zones — CHECK THEM against your chart before trusting a single number below.
//

input group  "=== Data Window ==="
input datetime StartDate      = D'2017.01.01';
input datetime EndDate        = 0;

//
// NOTE ON LABELS: MetaEditor uses the trailing comment on an input as its
// DISPLAY NAME in the inputs dialog. Anything written there replaces the
// variable name on screen, so these stay short and descriptive — reasoning
// belongs in the header, not beside the field.
//
input group  "=== Broker Clock ==="
input int      ServerGmtWinter = 2;             // Server GMT offset, winter
input int      ServerGmtSummer = 3;             // Server GMT offset, summer

input group  "=== Sessions (New York time, classic ICT PO3) ==="
input int      AccumStartNY   = 20;             // Accumulation start hour NY
input int      AccumEndNY     = 0;              // Accumulation end hour NY
input int      ManipStartNY   = 2;              // Manipulation start hour NY
input int      ManipEndNY     = 5;              // Manipulation end hour NY
input int      ExitHourNY     = 16;             // Flat by hour NY

input group  "=== Entry Trigger ==="
input bool     UseDisplacement = false;         // ARM 2: require displacement
input double   DisplacementAtr = 1.00;          // Displacement body, ATR

input group  "=== Filters ==="
input int      AtrLen         = 14;             // ATR length
input double   MinRangeAtr    = 0.50;           // Min accumulation range, ATR
input double   StopBufAtr     = 0.50;           // Stop buffer beyond sweep, ATR
input double   MinRR          = 1.00;           // Minimum R:R
input double   MaxCostPctOfRisk = 100.0;        // Max cost as pct of risk (100 = off)
input double   CostPerOz      = 0.30;           // Round-turn cost per oz

input group  "=== In-Sample / Out-Of-Sample Split ==="
input datetime SplitDate      = D'2022.01.01';

MqlRates g_rates[];
double   g_atr[];
int      g_total = 0;

// ---- funnel counters -------------------------------------------------------
int g_days = 0, g_rangesOk = 0, g_swept = 0, g_entered = 0, g_qualified = 0;
int g_sweepHigh = 0, g_sweepLow = 0;

// ---- trade ledger ----------------------------------------------------------
double   g_tradeMfeR[];
double   g_tradeRR[];
// Actual R booked by the trade. Needed because a session model has THREE
// outcomes, not two: target (+rr), stop (-1), and flat-at-session-end (whatever
// it was worth at the time). Scoring only the first two would quietly delete
// every trade that went nowhere — which is the flattering half of the sample.
double   g_tradeR[];
bool     g_tradeWon[];
bool     g_tradeStop[];
bool     g_tradeLate[];
bool     g_tradeLong[];
datetime g_tradeTime[];
int      g_tradeYear[];
double   g_stopsQ[];
double   g_rangeSizes[];
int      g_tradeCount = 0;

void Log(string msg) { Print("[AMD] ", msg); }

//+------------------------------------------------------------------+
//| DST calendars                                                     |
//| EU: last Sunday March 01:00 UTC -> last Sunday October 01:00 UTC  |
//| US: 2nd Sunday March -> 1st Sunday November                       |
//+------------------------------------------------------------------+
int DayOfWeekFor(int y, int m, int d) {
   MqlDateTime t;
   t.year = y; t.mon = m; t.day = d; t.hour = 12; t.min = 0; t.sec = 0;
   datetime dt = StructToTime(t);
   MqlDateTime o;
   TimeToStruct(dt, o);
   return o.day_of_week;
}

int LastSundayOf(int y, int m) {
   int dim = 31;
   if (m == 4 || m == 6 || m == 9 || m == 11) dim = 30;
   if (m == 2) dim = ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) ? 29 : 28;
   for (int d = dim; d >= 1; d--)
      if (DayOfWeekFor(y, m, d) == 0) return d;
   return dim;
}

int NthSundayOf(int y, int m, int nth) {
   int seen = 0;
   for (int d = 1; d <= 31; d++) {
      if (DayOfWeekFor(y, m, d) == 0) {
         seen++;
         if (seen == nth) return d;
      }
   }
   return 1;
}

bool IsEuDst(datetime serverTime) {
   MqlDateTime t;
   TimeToStruct(serverTime, t);
   if (t.mon < 3 || t.mon > 10) return false;
   if (t.mon > 3 && t.mon < 10) return true;
   if (t.mon == 3)  return t.day >= LastSundayOf(t.year, 3);
   return t.day < LastSundayOf(t.year, 10);
}

bool IsUsDst(datetime utc) {
   MqlDateTime t;
   TimeToStruct(utc, t);
   if (t.mon < 3 || t.mon > 11) return false;
   if (t.mon > 3 && t.mon < 11) return true;
   if (t.mon == 3)  return t.day >= NthSundayOf(t.year, 3, 2);
   return t.day < NthSundayOf(t.year, 11, 1);
}

datetime ServerToUtc(datetime serverTime) {
   int off = IsEuDst(serverTime) ? ServerGmtSummer : ServerGmtWinter;
   return serverTime - (datetime)(off * 3600);
}

datetime UtcToNy(datetime utc) {
   int off = IsUsDst(utc) ? -4 : -5;
   return utc + (datetime)(off * 3600);
}

datetime ServerToNy(datetime serverTime) {
   return UtcToNy(ServerToUtc(serverTime));
}

int NyHour(datetime serverTime) {
   MqlDateTime t;
   TimeToStruct(ServerToNy(serverTime), t);
   return t.hour;
}

int NyDayStamp(datetime serverTime) {
   MqlDateTime t;
   TimeToStruct(ServerToNy(serverTime), t);
   return t.year * 10000 + t.mon * 100 + t.day;
}

//+------------------------------------------------------------------+
void BuildAtr() {
   ArrayResize(g_atr, g_total);
   double trSum = 0.0;
   for (int i = 0; i < g_total; i++) {
      double tr;
      if (i == 0) {
         tr = g_rates[i].high - g_rates[i].low;
      } else {
         double pc = g_rates[i - 1].close;
         tr = MathMax(g_rates[i].high - g_rates[i].low,
                      MathMax(MathAbs(g_rates[i].high - pc), MathAbs(g_rates[i].low - pc)));
      }
      if (i < AtrLen) { trSum += tr; g_atr[i] = trSum / (i + 1); }
      else            { g_atr[i] = (g_atr[i - 1] * (AtrLen - 1) + tr) / AtrLen; }
   }
}

bool InWindowHour(int h, int start, int end) {
   if (start == end) return false;
   if (start < end)  return (h >= start && h < end);
   return (h >= start || h < end);            // wraps midnight
}

void RecordTrade(datetime when, int year, bool isLong, double mfeR, double rr, double rBooked, bool won, bool stopped) {
   ArrayResize(g_tradeMfeR, g_tradeCount + 1);
   ArrayResize(g_tradeRR,   g_tradeCount + 1);
   ArrayResize(g_tradeR,    g_tradeCount + 1);
   ArrayResize(g_tradeWon,  g_tradeCount + 1);
   ArrayResize(g_tradeStop, g_tradeCount + 1);
   ArrayResize(g_tradeLate, g_tradeCount + 1);
   ArrayResize(g_tradeLong, g_tradeCount + 1);
   ArrayResize(g_tradeTime, g_tradeCount + 1);
   ArrayResize(g_tradeYear, g_tradeCount + 1);

   g_tradeMfeR[g_tradeCount] = mfeR;
   g_tradeRR[g_tradeCount]   = rr;
   g_tradeR[g_tradeCount]    = rBooked;
   g_tradeWon[g_tradeCount]  = won;
   g_tradeStop[g_tradeCount] = stopped;
   g_tradeLate[g_tradeCount] = false;
   g_tradeLong[g_tradeCount] = isLong;
   g_tradeTime[g_tradeCount] = when;
   g_tradeYear[g_tradeCount] = year;
   g_tradeCount++;
}

//+------------------------------------------------------------------+
//| MAIN — one pass, day-stateful.                                    |
//|                                                                   |
//| Accumulation spans midnight (20:00 -> 00:00 NY), so the range is  |
//| built on the evening BEFORE the day it is traded. State is        |
//| latched when the accumulation window ends, not while it forms.    |
//+------------------------------------------------------------------+
void OnStart() {
   ArraySetAsSeries(g_rates, false);
   datetime from = StartDate;
   datetime to   = (EndDate == 0) ? TimeCurrent() : EndDate;

   g_total = CopyRates(_Symbol, PERIOD_H1, from, to, g_rates);
   if (g_total <= 0) {
      Log("CopyRates failed. Load H1 history first (Tools > Options > Charts > Max bars, then scroll back).");
      return;
   }
   BuildAtr();

   Log(StringFormat("%s H1 — %d bars, %s to %s", _Symbol, g_total,
       TimeToString(g_rates[0].time, TIME_DATE), TimeToString(g_rates[g_total - 1].time, TIME_DATE)));

   // ---- timezone sanity check, printed before anything else -------------
   Log("TIMEZONE CHECK — verify these against your chart before trusting results:");
   for (int s = 0; s < 3; s++) {
      int bi = (int)(g_total * (0.1 + 0.4 * s));
      if (bi >= g_total) continue;
      Log(StringFormat("   server %s   utc %s   NY %s   (NY hour %d)",
          TimeToString(g_rates[bi].time, TIME_DATE | TIME_MINUTES),
          TimeToString(ServerToUtc(g_rates[bi].time), TIME_DATE | TIME_MINUTES),
          TimeToString(ServerToNy(g_rates[bi].time), TIME_DATE | TIME_MINUTES),
          NyHour(g_rates[bi].time)));
   }
   Log("");

   // ---- per-setup state --------------------------------------------------
   double accHigh = 0, accLow = 0;
   bool   accBuilding = false, rangeReady = false;
   double rangeHigh = 0, rangeLow = 0;
   int    rangeDay = -1;

   bool   swept = false, entered = false;
   bool   isLong = false;
   double sweepExtreme = 0;
   double entry = 0, stop = 0, target = 0, rr = 0, mfeR = 0;
   bool   stopped = false;
   int    entryBar = -1;

   int prevHour = -1;

   for (int b = 1; b < g_total; b++) {
      double atr = g_atr[b];
      if (atr <= 0) continue;

      int h  = NyHour(g_rates[b].time);
      int ds = NyDayStamp(g_rates[b].time);
      double hi = g_rates[b].high, lo = g_rates[b].low, cl = g_rates[b].close, op = g_rates[b].open;

      // ---- resolve a live trade first -----------------------------------
      if (entered) {
         double R = MathAbs(entry - stop);
         bool hitStop   = isLong ? (lo <= stop)   : (hi >= stop);
         bool hitTarget = isLong ? (hi >= target) : (lo <= target);

         MqlDateTime dt; TimeToStruct(g_rates[entryBar].time, dt);

         if (!stopped) {
            if (hitStop) {
               stopped = true;
               RecordTrade(g_rates[entryBar].time, dt.year, isLong, mfeR, rr, -1.0, false, true);
            } else {
               double fav = R > 0 ? (isLong ? (hi - entry) / R : (entry - lo) / R) : 0.0;
               if (fav > mfeR) mfeR = fav;
               if (hitTarget) {
                  RecordTrade(g_rates[entryBar].time, dt.year, isLong, mfeR, rr, rr, true, false);
                  entered = false;
               }
            }
         } else {
            // already booked as a loss; kept alive only to answer whether the
            // stop was the thing that was wrong
            if (hitTarget) {
               if (g_tradeCount > 0) g_tradeLate[g_tradeCount - 1] = true;
               entered = false;
            }
         }

         // Flat by end of NY session. An unresolved trade books whatever it is
         // actually worth at the close — not nothing, and not a free scratch.
         if (entered && h >= ExitHourNY) {
            if (!stopped) {
               double rOut = (R > 0) ? (isLong ? (cl - entry) / R : (entry - cl) / R) : 0.0;
               RecordTrade(g_rates[entryBar].time, dt.year, isLong, mfeR, rr, rOut, false, false);
            }
            entered = false;
         }
      }

      // ---- accumulation window ------------------------------------------
      if (InWindowHour(h, AccumStartNY, AccumEndNY)) {
         if (!accBuilding) { accBuilding = true; accHigh = hi; accLow = lo; }
         else { if (hi > accHigh) accHigh = hi; if (lo < accLow) accLow = lo; }
      } else if (accBuilding) {
         // window just closed — latch the range for the day ahead
         accBuilding = false;
         rangeHigh = accHigh;
         rangeLow  = accLow;
         rangeDay  = ds;
         rangeReady = (rangeHigh - rangeLow) >= MinRangeAtr * atr;
         g_days++;
         if (rangeReady) {
            g_rangesOk++;
            int rc = ArraySize(g_rangeSizes);
            ArrayResize(g_rangeSizes, rc + 1);
            g_rangeSizes[rc] = rangeHigh - rangeLow;
         }
         swept = false; entered = false; stopped = false; mfeR = 0;
      }

      // ---- manipulation window -------------------------------------------
      if (rangeReady && !entered && InWindowHour(h, ManipStartNY, ManipEndNY)) {
         if (!swept) {
            if (hi > rangeHigh)      { swept = true; isLong = false; sweepExtreme = hi; g_swept++; g_sweepHigh++; }
            else if (lo < rangeLow)  { swept = true; isLong = true;  sweepExtreme = lo; g_swept++; g_sweepLow++;  }
         } else {
            if (isLong) { if (lo < sweepExtreme) sweepExtreme = lo; }
            else        { if (hi > sweepExtreme) sweepExtreme = hi; }
         }

         if (swept) {
            // ARM 1 — a bar CLOSES back inside the accumulation range.
            bool backInside = isLong ? (cl > rangeLow) : (cl < rangeHigh);

            // ARM 2 — additionally require a body big enough to call it
            // displacement rather than a drift back across the line.
            bool bigEnough = !UseDisplacement || (MathAbs(cl - op) >= DisplacementAtr * atr);

            if (backInside && bigEnough) {
               entry  = cl;
               stop   = isLong ? sweepExtreme - StopBufAtr * atr : sweepExtreme + StopBufAtr * atr;
               target = isLong ? rangeHigh : rangeLow;

               double risk   = MathAbs(entry - stop);
               double reward = MathAbs(target - entry);
               rr = (risk > 0) ? reward / risk : 0.0;

               bool costOk = (risk > 0) && (100.0 * CostPerOz / risk <= MaxCostPctOfRisk);
               g_entered++;

               if (rr >= MinRR && costOk) {
                  entered = true; stopped = false; mfeR = 0; entryBar = b;
                  g_qualified++;
                  int sc = ArraySize(g_stopsQ);
                  ArrayResize(g_stopsQ, sc + 1);
                  g_stopsQ[sc] = risk;
               }
               rangeReady = false;     // one setup per day, taken or not
            }
         }
      }

      // manipulation window has passed without an entry — stand down
      if (rangeReady && !entered && h >= ManipEndNY && h < AccumStartNY && swept)
         rangeReady = false;

      prevHour = h;
   }

   PrintReport();
}

//+------------------------------------------------------------------+
//| STATS — identical machinery to the pattern census                 |
//+------------------------------------------------------------------+
bool InWin(int i, datetime from, datetime to) {
   return (g_tradeTime[i] >= from && (to == 0 || g_tradeTime[i] < to));
}

int CountIn(datetime from, datetime to) {
   int c = 0;
   for (int i = 0; i < g_tradeCount; i++) if (InWin(i, from, to)) c++;
   return c;
}

double HitRateAt(double x, datetime from, datetime to) {
   int n = 0, c = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWin(i, from, to)) continue;
      n++; if (g_tradeMfeR[i] >= x) c++;
   }
   return (n == 0) ? 0.0 : 100.0 * c / n;
}

double ExpectancyAt(double x, datetime from, datetime to) {
   int n = 0; double t = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWin(i, from, to)) continue;
      n++; t += (g_tradeMfeR[i] >= x) ? x : -1.0;
   }
   return (n == 0) ? 0.0 : t / n;
}

// Scored off actual R booked, so session-end exits carry their real value
// instead of disappearing.
double ExpectancyMM(datetime from, datetime to) {
   int n = 0; double t = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWin(i, from, to)) continue;
      n++; t += g_tradeR[i];
   }
   return (n == 0) ? 0.0 : t / n;
}

double StdErr(double mean, datetime from, datetime to) {
   int n = 0; double ss = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWin(i, from, to)) continue;
      ss += (g_tradeR[i] - mean) * (g_tradeR[i] - mean); n++;
   }
   if (n < 2) return 0.0;
   return MathSqrt(ss / (n - 1)) / MathSqrt((double)n);
}

double Median(double &arr[]) {
   int n = ArraySize(arr);
   if (n == 0) return 0.0;
   double tmp[]; ArrayResize(tmp, n); ArrayCopy(tmp, arr); ArraySort(tmp);
   if (n % 2 == 1) return tmp[n / 2];
   return (tmp[n / 2 - 1] + tmp[n / 2]) / 2.0;
}

string Pct(int part, int whole) {
   if (whole == 0) return "-";
   return StringFormat("%d%%", (int)MathRound(100.0 * part / whole));
}

void PrintBlock(string label, datetime from, datetime to, double costR) {
   int n = CountIn(from, to);
   if (n == 0) { Log(StringFormat("%s  no trades in window", label)); return; }

   int w = 0;
   for (int i = 0; i < g_tradeCount; i++) if (InWin(i, from, to) && g_tradeWon[i]) w++;

   double exMM = ExpectancyMM(from, to);
   double net  = exMM - costR;
   double se   = StdErr(exMM, from, to);

   Log(StringFormat("%s  n=%d", label, n));
   Log(StringFormat("   %-10s %8s %8s %8s %8s %8s %10s", "", "1.0R", "1.5R", "2.0R", "2.5R", "3.0R", "RangeOpp"));
   Log(StringFormat("   %-10s %7.0f%% %7.0f%% %7.0f%% %7.0f%% %7.0f%% %9s", "Hit %",
       HitRateAt(1.0, from, to), HitRateAt(1.5, from, to), HitRateAt(2.0, from, to),
       HitRateAt(2.5, from, to), HitRateAt(3.0, from, to), Pct(w, n)));
   Log(StringFormat("   %-10s %+8.3f %+8.3f %+8.3f %+8.3f %+8.3f %+10.3f", "Exp (R)",
       ExpectancyAt(1.0, from, to) - costR, ExpectancyAt(1.5, from, to) - costR,
       ExpectancyAt(2.0, from, to) - costR, ExpectancyAt(2.5, from, to) - costR,
       ExpectancyAt(3.0, from, to) - costR, net));
   if (se > 0) {
      double tstat = net / se;
      // A large NEGATIVE t is not a pass. The earlier version flagged on |t|,
      // which labelled a reliably-losing block as though it had cleared the bar.
      string verdict = (tstat >= 2.0)  ? "<-- PASSES: t >= 2"
                     : (tstat <= -2.0) ? "<-- reliably NEGATIVE"
                                       : "t < 2, not distinguishable from zero";
      if (n < 30) verdict = StringFormat("n=%d too small to interpret", n);
      Log(StringFormat("   net %+.3fR  SE %.3f  t = %.2f  95%% CI [%+.3f, %+.3f]   %s",
          net, se, tstat, net - 1.96 * se, net + 1.96 * se, verdict));
   }
   Log("");
}

void PrintReport() {
   double medStop = Median(g_stopsQ);
   double costR = (medStop > 0) ? CostPerOz / medStop : 0.0;
   double years = (double)(g_rates[g_total - 1].time - g_rates[0].time) / (365.25 * 24 * 3600);

   Log("=======================================================================================");
   Log(StringFormat("CONFIG  accum=%02d-%02d NY  manip=%02d-%02d NY  exit=%02d NY  trigger=%s  minRR=%.1f  stopBuf=%.2f  maxCost=%.1f%%",
       AccumStartNY, AccumEndNY, ManipStartNY, ManipEndNY, ExitHourNY,
       UseDisplacement ? StringFormat("displacement %.2f ATR", DisplacementAtr) : "close back inside",
       MinRR, StopBufAtr, MaxCostPctOfRisk));
   Log("---------------------------------------------------------------------------------------");
   Log("FUNNEL");
   Log(StringFormat("   days with an accumulation window   %d", g_days));
   Log(StringFormat("   range passed min size              %d  (%s)", g_rangesOk, Pct(g_rangesOk, g_days)));
   Log(StringFormat("   swept in manipulation window       %d  (%s)   high %d / low %d",
       g_swept, Pct(g_swept, g_rangesOk), g_sweepHigh, g_sweepLow));
   Log(StringFormat("   reclaimed (trigger fired)          %d  (%s)", g_entered, Pct(g_entered, g_swept)));
   Log(StringFormat("   qualified                          %d  (%s)", g_qualified, Pct(g_qualified, g_entered)));
   Log("");
   Log(StringFormat("SAMPLE  %.1f trades / year over %.1f yrs   (n = %d)", g_tradeCount / MathMax(years, 0.01), years, g_tradeCount));
   Log(StringFormat("COST    median stop $%.1f  ->  %.2f%% of risk at $%.2f/oz   |   median range $%.1f",
       medStop, 100.0 * costR, CostPerOz, Median(g_rangeSizes)));
   Log("");

   PrintBlock("ALL           ", 0, 0, costR);
   PrintBlock("IN-SAMPLE     ", 0, SplitDate, costR);
   PrintBlock("OUT-OF-SAMPLE ", SplitDate, 0, costR);

   // long vs short — the pattern census showed a bull-regime skew, so check it
   int nl = 0, ns = 0, wl = 0, ws = 0;
   double sl = 0.0, ss = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      double v = g_tradeR[i];
      if (g_tradeLong[i]) { nl++; if (g_tradeWon[i]) wl++; sl += v; }
      else                { ns++; if (g_tradeWon[i]) ws++; ss += v; }
   }
   Log("BY DIRECTION");
   if (nl > 0) Log(StringFormat("   long  (swept low)   n=%-5d hit %-5s exp %+.3f", nl, Pct(wl, nl), sl / nl - costR));
   if (ns > 0) Log(StringFormat("   short (swept high)  n=%-5d hit %-5s exp %+.3f", ns, Pct(ws, ns), ss / ns - costR));
   Log("");

   // Three-way outcome split. If session-end exits dominate, the model is not
   // wrong so much as it is not finishing — which is a target/holding-time
   // problem, not a direction problem.
   int nStopped = 0, nLate = 0, nTarget = 0, nFlat = 0;
   double sumFlat = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeStop[i])      { nStopped++; if (g_tradeLate[i]) nLate++; }
      else if (g_tradeWon[i])  { nTarget++; }
      else                     { nFlat++; sumFlat += g_tradeR[i]; }
   }
   Log("OUTCOMES");
   Log(StringFormat("   target hit        %d  (%s)", nTarget, Pct(nTarget, g_tradeCount)));
   Log(StringFormat("   stopped           %d  (%s)   of which %s reached target later", nStopped, Pct(nStopped, g_tradeCount), Pct(nLate, nStopped)));
   Log(StringFormat("   session-end flat  %d  (%s)   avg %+.3fR", nFlat, Pct(nFlat, g_tradeCount), nFlat > 0 ? sumFlat / nFlat : 0.0));
   Log("");

   Log("BY YEAR");
   Log(StringFormat("   %-6s %7s %7s %10s", "Year", "n", "Hit", "Exp (R)"));
   int minY = 99999, maxY = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeYear[i] < minY) minY = g_tradeYear[i];
      if (g_tradeYear[i] > maxY) maxY = g_tradeYear[i];
   }
   for (int y = minY; y <= maxY; y++) {
      int n = 0, w = 0; double sum = 0.0;
      for (int i = 0; i < g_tradeCount; i++) {
         if (g_tradeYear[i] != y) continue;
         n++; if (g_tradeWon[i]) w++;
         sum += g_tradeR[i];
      }
      if (n > 0) Log(StringFormat("   %-6d %7d %6s %+10.3f", y, n, Pct(w, n), sum / n - costR));
   }
   Log("=======================================================================================");
}
