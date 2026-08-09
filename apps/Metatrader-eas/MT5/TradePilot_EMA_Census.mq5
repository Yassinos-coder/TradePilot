//+------------------------------------------------------------------+
//| TradePilot_EMA_Census.mq5                                        |
//| 100/200 EMA trend model — measurement only                       |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property script_show_inputs
#property strict

//
// THIS PLACES NO ORDERS. Third setup through the same harness.
//
// ---------------------------------------------------------------------------
// WHAT DIED BEFORE THIS, AND WHY THIS IS A DIFFERENT BET
//
//   Reversal patterns H1   n=335   out-of-sample t = -0.12
//   AMD / PO3 H1           n=674   out-of-sample t = -1.17, gross ~ +0.01R
//
// Both were REVERSAL setups — fading a move. This is trend-following, the other
// side of the market. That matters because the pattern census showed reversal
// expectancy was best in 2021-22 (gold ranging) and worst in 2023-24 (gold
// trending). A trend model should earn precisely where those lost. That is a
// falsifiable prediction, not a rationale.
//
// ---------------------------------------------------------------------------
// THE EVIDENCE, STATED HONESTLY BEFORE ANY RESULT
//
// Brock, Lakonishok & LeBaron (1992) found strong predictive power for moving
// average rules over 90 years of DJIA. Sullivan, Timmermann & White then showed
// that success was "a spurious result of data snooping", and that the best rule
// produced NO superior performance in the following 10-year post-sample period.
// Multiple replications find BLL's profits non-existent after publication.
//
// Price-crosses-the-MA is therefore the single most tested, most arbitraged and
// most publicly discredited rule in the literature. Expect a small effect or
// none. Anything large is a bug.
//
// ---------------------------------------------------------------------------
// COST — the constraint that killed the previous two
//
// Cost must be <= 3% of risk, which at $0.30/oz means a stop of $10+. Gold
// structures scale with price but the spread does not, so a rule producing $4
// stops in 2019 and $28 stops in 2026 is only tradeable in the second half of
// the sample. H2 sits between H1 (fails) and H4 (comfortable). The COST line and
// the by-year table below are what decide whether the early years count.
//
// ---------------------------------------------------------------------------
// PRE-REGISTERED
//
//   * Decision rule: OUT-OF-SAMPLE t >= 2.
//   * Arm 1 = close crosses the 200 EMA (chosen). Arm 2 = pullback to the 100
//     EMA while beyond the 200. Two declared looks; arm 2 needs a stricter bar.
//   * EMA, not SMA. Fixed R target. Both directions. Not swept.
//   * Confluence score is MEASURED, not traded. Sizing on a score that does not
//     separate expectancy adds variance and nothing else, so the tier table
//     comes before any sizing logic is written.
//

input group  "=== Data Window ==="
input datetime StartDate      = D'2017.01.01';   // Start date
input datetime EndDate        = 0;               // End date (0 = latest bar)
input ENUM_TIMEFRAMES TF      = PERIOD_H2;       // Timeframe

input group  "=== Moving Averages ==="
input int      FastEmaLen     = 100;             // Fast EMA length
input int      SlowEmaLen     = 200;             // Slow EMA length

input group  "=== Entry ==="
input bool     UsePullbackArm = false;           // ARM 2: pullback to fast EMA
input bool     RequireAlignment = false;         // Require fast EMA beyond slow
input bool     AllowLongs      = true;           // Allow longs
input bool     AllowShorts     = true;           // Allow shorts

input group  "=== Exit ==="
input int      AtrLen         = 14;              // ATR length
input double   StopAtr        = 1.50;            // Stop distance, ATR
input double   TargetR        = 2.00;            // Target, R multiple
input int      TradeMaxBars   = 120;             // Max bars in trade

input group  "=== Cost ==="
input double   MaxCostPctOfRisk = 100.0;         // Max cost as pct of risk (100 = off)
input double   CostPerOz      = 0.30;            // Round-turn cost per oz

input group  "=== In-Sample / Out-Of-Sample Split ==="
input datetime SplitDate      = D'2022.01.01';   // Split date

MqlRates g_rates[];
double   g_atr[], g_fast[], g_slow[];
int      g_total = 0;

int g_signals = 0, g_qualified = 0;

double   g_tradeMfeR[], g_tradeR[], g_stopsQ[];
bool     g_tradeWon[], g_tradeStop[], g_tradeLong[];
int      g_tradeScore[], g_tradeYear[];
datetime g_tradeTime[];
int      g_tradeCount = 0;

void Log(string msg) { Print("[EMA] ", msg); }

//+------------------------------------------------------------------+
//| EMA seeded with an SMA, so the series is deterministic and does   |
//| not depend on how much history the terminal happened to load.     |
//+------------------------------------------------------------------+
void BuildEma(int len, double &out[]) {
   ArrayResize(out, g_total);
   double k = 2.0 / (len + 1.0);
   double sum = 0.0;
   for (int i = 0; i < g_total; i++) {
      if (i < len) {
         sum += g_rates[i].close;
         out[i] = sum / (i + 1);
      } else {
         out[i] = g_rates[i].close * k + out[i - 1] * (1.0 - k);
      }
   }
}

void BuildAtr() {
   ArrayResize(g_atr, g_total);
   double trSum = 0.0;
   for (int i = 0; i < g_total; i++) {
      double tr;
      if (i == 0) tr = g_rates[i].high - g_rates[i].low;
      else {
         double pc = g_rates[i - 1].close;
         tr = MathMax(g_rates[i].high - g_rates[i].low,
                      MathMax(MathAbs(g_rates[i].high - pc), MathAbs(g_rates[i].low - pc)));
      }
      if (i < AtrLen) { trSum += tr; g_atr[i] = trSum / (i + 1); }
      else            { g_atr[i] = (g_atr[i - 1] * (AtrLen - 1) + tr) / AtrLen; }
   }
}

//+------------------------------------------------------------------+
//| Candlestick confirmation — the ATR-normalised specs worked out    |
//| earlier. Raw wick-to-body ratios fire constantly on gold and go   |
//| degenerate on a doji, so significance is measured against the     |
//| bar's RANGE and against ATR, never against the body alone.        |
//+------------------------------------------------------------------+
bool BullCandle(int i) {
   if (i < 1) return false;
   double body = MathAbs(g_rates[i].close - g_rates[i].open);
   double rng  = g_rates[i].high - g_rates[i].low;
   double lw   = MathMin(g_rates[i].close, g_rates[i].open) - g_rates[i].low;
   double uw   = g_rates[i].high - MathMax(g_rates[i].close, g_rates[i].open);
   double atr  = g_atr[i];
   if (rng <= 0 || atr <= 0) return false;

   bool prevBear = g_rates[i - 1].close < g_rates[i - 1].open;
   double pbody  = MathAbs(g_rates[i - 1].close - g_rates[i - 1].open);
   bool engulf = prevBear && g_rates[i].close > g_rates[i].open
              && g_rates[i].close > g_rates[i - 1].open
              && body >= 1.3 * pbody && body >= 0.5 * atr;

   bool hammer = rng >= 0.8 * atr && lw >= 2.0 * body
              && lw >= 0.60 * rng && uw <= 0.15 * rng;

   return engulf || hammer;
}

bool BearCandle(int i) {
   if (i < 1) return false;
   double body = MathAbs(g_rates[i].close - g_rates[i].open);
   double rng  = g_rates[i].high - g_rates[i].low;
   double lw   = MathMin(g_rates[i].close, g_rates[i].open) - g_rates[i].low;
   double uw   = g_rates[i].high - MathMax(g_rates[i].close, g_rates[i].open);
   double atr  = g_atr[i];
   if (rng <= 0 || atr <= 0) return false;

   bool prevBull = g_rates[i - 1].close > g_rates[i - 1].open;
   double pbody  = MathAbs(g_rates[i - 1].close - g_rates[i - 1].open);
   bool engulf = prevBull && g_rates[i].close < g_rates[i].open
              && g_rates[i].close < g_rates[i - 1].open
              && body >= 1.3 * pbody && body >= 0.5 * atr;

   bool star = rng >= 0.8 * atr && uw >= 2.0 * body
            && uw >= 0.60 * rng && lw <= 0.15 * rng;

   return engulf || star;
}

//+------------------------------------------------------------------+
//| Confluence score, 0-3. Recorded per trade so the tier table can   |
//| answer whether it carries information BEFORE anything is sized on |
//| it. Each component is a separate, mechanical yes/no.              |
//+------------------------------------------------------------------+
int ConfluenceScore(int i, bool isLong) {
   int s = 0;
   if (isLong  && BullCandle(i)) s++;
   if (!isLong && BearCandle(i)) s++;
   if (isLong  && g_fast[i] > g_slow[i]) s++;
   if (!isLong && g_fast[i] < g_slow[i]) s++;
   if (i >= 10) {
      bool slopeUp = g_slow[i] > g_slow[i - 10];
      if (isLong == slopeUp) s++;
   }
   return s;
}

void RecordTrade(datetime when, int year, bool isLong, int score, double mfeR, double rBooked, bool won, bool stopped) {
   int n = g_tradeCount;
   ArrayResize(g_tradeMfeR, n + 1);  ArrayResize(g_tradeR,     n + 1);
   ArrayResize(g_tradeWon,  n + 1);  ArrayResize(g_tradeStop,  n + 1);
   ArrayResize(g_tradeLong, n + 1);  ArrayResize(g_tradeScore, n + 1);
   ArrayResize(g_tradeYear, n + 1);  ArrayResize(g_tradeTime,  n + 1);

   g_tradeMfeR[n] = mfeR;  g_tradeR[n]     = rBooked;
   g_tradeWon[n]  = won;   g_tradeStop[n]  = stopped;
   g_tradeLong[n] = isLong; g_tradeScore[n] = score;
   g_tradeYear[n] = year;  g_tradeTime[n]  = when;
   g_tradeCount++;
}

//+------------------------------------------------------------------+
void OnStart() {
   ArraySetAsSeries(g_rates, false);
   datetime from = StartDate;
   datetime to   = (EndDate == 0) ? TimeCurrent() : EndDate;

   g_total = CopyRates(_Symbol, TF, from, to, g_rates);
   if (g_total <= SlowEmaLen + 10) {
      Log("Not enough bars. Load history first (Tools > Options > Charts > Max bars, then scroll back).");
      return;
   }

   BuildAtr();
   BuildEma(FastEmaLen, g_fast);
   BuildEma(SlowEmaLen, g_slow);

   Log(StringFormat("%s %s — %d bars, %s to %s", _Symbol, EnumToString(TF), g_total,
       TimeToString(g_rates[0].time, TIME_DATE), TimeToString(g_rates[g_total - 1].time, TIME_DATE)));

   bool   inTrade = false, isLong = false;
   double entry = 0, stop = 0, target = 0, mfeR = 0;
   int    entryBar = -1, score = 0;

   // Warm-up: skip until the slow EMA is a real average rather than a
   // partial-sum seed, otherwise the first trades key off a fictional level.
   for (int b = SlowEmaLen + 1; b < g_total; b++) {
      double atr = g_atr[b];
      if (atr <= 0) continue;
      double hi = g_rates[b].high, lo = g_rates[b].low, cl = g_rates[b].close;

      // ---- manage an open trade ------------------------------------------
      if (inTrade) {
         double R = MathAbs(entry - stop);
         bool hitStop   = isLong ? (lo <= stop)   : (hi >= stop);
         bool hitTarget = isLong ? (hi >= target) : (lo <= target);
         MqlDateTime dt; TimeToStruct(g_rates[entryBar].time, dt);

         if (hitStop) {
            RecordTrade(g_rates[entryBar].time, dt.year, isLong, score, mfeR, -1.0, false, true);
            inTrade = false;
         } else {
            double fav = R > 0 ? (isLong ? (hi - entry) / R : (entry - lo) / R) : 0.0;
            if (fav > mfeR) mfeR = fav;
            if (hitTarget) {
               RecordTrade(g_rates[entryBar].time, dt.year, isLong, score, mfeR, TargetR, true, false);
               inTrade = false;
            } else if (b - entryBar >= TradeMaxBars) {
               double rOut = R > 0 ? (isLong ? (cl - entry) / R : (entry - cl) / R) : 0.0;
               RecordTrade(g_rates[entryBar].time, dt.year, isLong, score, mfeR, rOut, false, false);
               inTrade = false;
            }
         }
      }

      if (inTrade) continue;

      // ---- signal ---------------------------------------------------------
      bool longSig = false, shortSig = false;

      if (!UsePullbackArm) {
         // ARM 1 — close crosses the slow EMA.
         longSig  = (cl > g_slow[b]) && (g_rates[b - 1].close <= g_slow[b - 1]);
         shortSig = (cl < g_slow[b]) && (g_rates[b - 1].close >= g_slow[b - 1]);
      } else {
         // ARM 2 — beyond the slow EMA, price pulls back to the fast EMA and
         // closes back on the trend side of it.
         bool aboveSlow = cl > g_slow[b];
         bool belowSlow = cl < g_slow[b];
         longSig  = aboveSlow && (lo <= g_fast[b]) && (cl > g_fast[b]) && (g_rates[b - 1].close <= g_fast[b - 1]);
         shortSig = belowSlow && (hi >= g_fast[b]) && (cl < g_fast[b]) && (g_rates[b - 1].close >= g_fast[b - 1]);
      }

      if (RequireAlignment) {
         if (longSig  && !(g_fast[b] > g_slow[b])) longSig  = false;
         if (shortSig && !(g_fast[b] < g_slow[b])) shortSig = false;
      }
      if (!AllowLongs)  longSig  = false;
      if (!AllowShorts) shortSig = false;
      if (longSig && shortSig) continue;
      if (!longSig && !shortSig) continue;

      g_signals++;
      isLong = longSig;
      entry  = cl;
      stop   = isLong ? entry - StopAtr * atr : entry + StopAtr * atr;
      double risk = MathAbs(entry - stop);
      target = isLong ? entry + TargetR * risk : entry - TargetR * risk;

      bool costOk = (risk > 0) && (100.0 * CostPerOz / risk <= MaxCostPctOfRisk);
      if (!costOk) continue;

      score    = ConfluenceScore(b, isLong);
      inTrade  = true;
      mfeR     = 0;
      entryBar = b;
      g_qualified++;
      int sc = ArraySize(g_stopsQ);
      ArrayResize(g_stopsQ, sc + 1);
      g_stopsQ[sc] = risk;
   }

   PrintReport();
}

//+------------------------------------------------------------------+
//| STATS                                                             |
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
double ExpectancyR(datetime from, datetime to) {
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

   double ex = ExpectancyR(from, to);
   double net = ex - costR;
   double se = StdErr(ex, from, to);

   Log(StringFormat("%s  n=%d", label, n));
   Log(StringFormat("   %-10s %8s %8s %8s %8s %8s %10s", "", "1.0R", "1.5R", "2.0R", "2.5R", "3.0R", "Actual"));
   Log(StringFormat("   %-10s %7.0f%% %7.0f%% %7.0f%% %7.0f%% %7.0f%% %9s", "Hit %",
       HitRateAt(1.0, from, to), HitRateAt(1.5, from, to), HitRateAt(2.0, from, to),
       HitRateAt(2.5, from, to), HitRateAt(3.0, from, to), Pct(w, n)));
   Log(StringFormat("   %-10s %+8.3f %+8.3f %+8.3f %+8.3f %+8.3f %+10.3f", "Exp (R)",
       ExpectancyAt(1.0, from, to) - costR, ExpectancyAt(1.5, from, to) - costR,
       ExpectancyAt(2.0, from, to) - costR, ExpectancyAt(2.5, from, to) - costR,
       ExpectancyAt(3.0, from, to) - costR, net));
   if (se > 0) {
      double tstat = net / se;
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
   Log(StringFormat("CONFIG  %s  ema=%d/%d  arm=%s  align=%s  stop=%.2f ATR  target=%.1fR  maxCost=%.1f%%",
       EnumToString(TF), FastEmaLen, SlowEmaLen,
       UsePullbackArm ? "ARM2 pullback to fast" : "ARM1 cross of slow",
       RequireAlignment ? "on" : "off", StopAtr, TargetR, MaxCostPctOfRisk));
   Log("---------------------------------------------------------------------------------------");
   Log(StringFormat("SAMPLE  %d signals -> %d taken   %.1f trades / year over %.1f yrs   (n = %d)",
       g_signals, g_qualified, g_tradeCount / MathMax(years, 0.01), years, g_tradeCount));
   Log(StringFormat("COST    median stop $%.1f  ->  %.2f%% of risk at $%.2f/oz", medStop, 100.0 * costR, CostPerOz));
   Log("");

   PrintBlock("ALL           ", 0, 0, costR);
   PrintBlock("IN-SAMPLE     ", 0, SplitDate, costR);
   PrintBlock("OUT-OF-SAMPLE ", SplitDate, 0, costR);

   int nl = 0, ns = 0, wl = 0, ws = 0; double sl = 0.0, ss = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeLong[i]) { nl++; if (g_tradeWon[i]) wl++; sl += g_tradeR[i]; }
      else                { ns++; if (g_tradeWon[i]) ws++; ss += g_tradeR[i]; }
   }
   Log("BY DIRECTION");
   if (nl > 0) Log(StringFormat("   long   n=%-5d hit %-5s exp %+.3f", nl, Pct(wl, nl), sl / nl - costR));
   if (ns > 0) Log(StringFormat("   short  n=%-5d hit %-5s exp %+.3f", ns, Pct(ws, ns), ss / ns - costR));
   Log("");

   // ---- does the confluence score carry information? ---------------------
   // If tier 3 does not beat tier 0, sizing on this score adds variance and
   // nothing else. This table is the precondition for any sizing logic.
   Log("BY CONFLUENCE SCORE  (candle + EMA alignment + slow-EMA slope)");
   Log(StringFormat("   %-7s %7s %7s %11s", "Score", "n", "Hit", "Exp (R)"));
   for (int s = 0; s <= 3; s++) {
      int n = 0, w = 0; double sum = 0.0;
      for (int i = 0; i < g_tradeCount; i++) {
         if (g_tradeScore[i] != s) continue;
         n++; if (g_tradeWon[i]) w++; sum += g_tradeR[i];
      }
      if (n > 0) Log(StringFormat("   %-7d %7d %6s %+11.3f%s", s, n, Pct(w, n), sum / n - costR,
                     (n < 30) ? "   (n<30)" : ""));
   }
   Log("");

   Log("BY YEAR");
   Log(StringFormat("   %-6s %7s %7s %11s", "Year", "n", "Hit", "Exp (R)"));
   int minY = 99999, maxY = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeYear[i] < minY) minY = g_tradeYear[i];
      if (g_tradeYear[i] > maxY) maxY = g_tradeYear[i];
   }
   for (int y = minY; y <= maxY; y++) {
      int n = 0, w = 0; double sum = 0.0;
      for (int i = 0; i < g_tradeCount; i++) {
         if (g_tradeYear[i] != y) continue;
         n++; if (g_tradeWon[i]) w++; sum += g_tradeR[i];
      }
      if (n > 0) Log(StringFormat("   %-6d %7d %6s %+11.3f", y, n, Pct(w, n), sum / n - costR));
   }
   Log("=======================================================================================");
}
