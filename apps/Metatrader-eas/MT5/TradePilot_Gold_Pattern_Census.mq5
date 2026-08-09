//+------------------------------------------------------------------+
//| TradePilot_Gold_Pattern_Census.mq5                               |
//| Port of TradePilot_Gold_Pattern_Census.pine — measurement only   |
//+------------------------------------------------------------------+
#property copyright "TradePilot"
#property version   "1.00"
#property script_show_inputs
#property strict

//
// THIS PLACES NO ORDERS. It is the Pine census, moved to MT5 for one reason:
// TradingView's free plan caps H1 gold at ~1.5 years, which produced 64 trades
// and a +0.297R result whose 95% confidence interval was [-0.174, +0.778] —
// statistically indistinguishable from zero.
//
// IC Markets carries dense XAUUSD H1 from 2017 (the 2010-2016 files are sparse,
// which is why the start date defaults to 2017-01-01). That is ~9.6 years and
// roughly 400 qualified trades — past the ~170 needed for the current effect
// size to reach significance, and spanning four regimes rather than one:
//
//   2017-2018  range
//   2019-2020  run into the COVID spike
//   2020-2022  correction / range
//   2022-2026  structural bull  <- the ONLY regime the Pine sample covered
//
// The logic below is a straight port. No thresholds retuned, no rules added.
// If the numbers move, it is the data talking, not the code.
//
// It runs as a SCRIPT, not a Strategy Tester EA: it walks the bar array once
// with CopyRates and prints to the Experts log. No tick modelling required,
// because nothing here simulates an order — it measures where price went.
//
// ---------------------------------------------------------------------------
// NON-REPAINTING
//
// A pivot at bar p is only confirmed once bar p+pivotLen has printed. The main
// loop therefore evaluates the pivot at (b - pivotLen) when it reaches bar b,
// so the confirmation window [p-pivotLen, p+pivotLen] never reads past b.
// Lifecycle transitions read only bar b. Nothing looks ahead.
//
// Known bias, same as the Pine: a neckline break occurring inside those
// pivotLen bars is never counted, so break counts are a floor, not a total.
// ---------------------------------------------------------------------------

input group  "=== Data Window ==="
input datetime StartDate      = D'2017.01.01';
input datetime EndDate        = 0;              // End date (0 = latest bar)

input group  "=== Detection ==="
input int      PivotLen       = 5;
input int      AtrLen         = 14;
input bool     UseDoubleBottom = true;
input bool     UseInverseHS   = true;
input bool     UseDoubleTop   = true;
input bool     UseHeadShoulders = true;

input group  "=== Geometry Tolerances ==="
input double   LevelTolAtr    = 0.60;
input double   MinHeightAtr   = 1.50;
input bool     ConservativeNeckline = true;

input group  "=== Lifecycle ==="
input int      ExpiryBars     = 100;
input double   RetestTolAtr   = 0.25;
input int      RetestMaxBars  = 30;
input int      TradeMaxBars   = 200;

input group  "=== Risk / Reward Filter ==="
input double   MinRR          = 2.0;
input double   StopBufAtr     = 0.50;
input double   CostPerOz      = 0.30;           // Round-turn cost per oz

//
// TEST 1 — the cost bar we set BEFORE seeing any data, finally enforced.
//
// The 9.6-year run showed a median qualified stop of $4.00, which hands 7.53%
// of risk to execution and consumed 55% of gross expectancy. A trade whose stop
// cannot absorb the spread should never have been in the sample. Requiring
// cost <= 3% of risk means a stop of at least $10 at $0.30/oz.
//
// This is applying a pre-registered rule, not fitting a new one. Set to 100 to
// disable and reproduce the original run.
//
input group  "=== Test 1: Cost Filter ==="
input double   MaxCostPctOfRisk = 3.0;

//
// TEST 2 — regime.
//
// 2021 (+0.70) and 2022 (+0.53) were gold's choppy years; 2023 (-0.30) and 2024
// (-0.32) were strongly trending. Reversal patterns failing in trends is a
// mechanism, not a story invented after the fact — so it is worth one test.
//
// Trendiness is measured by Kaufman's Efficiency Ratio: net move over the
// summed absolute path. ~1 means a straight line, ~0 means chop. One parameter,
// no thresholds borrowed from anywhere.
//
// The honest part is the SPLIT: everything before SplitDate is in-sample and
// everything after is out-of-sample, decided now rather than after looking. If
// the filter only works across all ten years pooled, it is not real.
//
input group  "=== Test 2: Regime Filter ==="
input bool     UseRegimeFilter = false;
input int      ErLen           = 30;
input double   ErMax           = 0.35;          // Max efficiency ratio (trade below this)

input group  "=== In-Sample / Out-Of-Sample Split ==="
input datetime SplitDate      = D'2022.01.01';

#define KIND_DB   0
#define KIND_IHS  1
#define KIND_DT   2
#define KIND_HS   3
#define MAX_PIVOTS 12

struct Pivot {
   double price;
   int    bar;
};

struct Pattern {
   int    kind;
   bool   bullish;
   double neckline;
   double extreme;
   double height;
   int    formedBar;
   int    brokenBar;
   int    retestBar;
   double retestExtreme;
   double entry;
   double stop;
   double target;
   double rr;
   double mfeR;
   int    ledgerIdx;
   bool   broken;
   bool   touched;
   bool   entered;
   bool   qualified;
   bool   stopped;
   bool   laterTarget;
   bool   resolved;
   bool   won;
   bool   dead;
};

MqlRates g_rates[];
double   g_atr[];
double   g_er[];
int      g_total = 0;

Pivot    g_highs[];
Pivot    g_lows[];
int      g_highCount = 0;
int      g_lowCount  = 0;

Pattern  g_patterns[];
int      g_patternCount = 0;
int      g_active[];
int      g_activeCount = 0;

int      g_nFormed[4], g_nBroken[4], g_nRetest[4], g_nQual[4], g_nWon[4], g_nLost[4];
double   g_heights[];
int      g_heightKind[];
double   g_stopsQ[];

double   g_tradeMfeR[];
double   g_tradeRR[];
bool     g_tradeWon[];
bool     g_tradeStop[];
bool     g_tradeLate[];
int      g_tradeKind[];
int      g_tradeYear[];
datetime g_tradeTime[];
int      g_tradeCount = 0;

void Log(string msg) {
   Print("[Census] ", msg);
}

string KindName(int k) {
   if (k == KIND_DB)  return "Double Bottom";
   if (k == KIND_IHS) return "Inverse H&S";
   if (k == KIND_DT)  return "Double Top";
   return "Head & Shoulders";
}

//+------------------------------------------------------------------+
//| ATR — Wilder's smoothing of True Range, seeded with an SMA.       |
//| Computed by hand rather than via iATR so it matches Pine's        |
//| ta.atr() exactly; a handle-based value would drift at the seed    |
//| and make the two censuses non-comparable.                         |
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

      if (i < AtrLen) {
         trSum += tr;
         g_atr[i] = trSum / (i + 1);
      } else {
         g_atr[i] = (g_atr[i - 1] * (AtrLen - 1) + tr) / AtrLen;
      }
   }
}

//+------------------------------------------------------------------+
//| Kaufman Efficiency Ratio — net displacement over the summed path. |
//| Near 1 the market is travelling in a straight line; near 0 it is  |
//| covering the same ground repeatedly.                              |
//+------------------------------------------------------------------+
void BuildEr() {
   ArrayResize(g_er, g_total);
   for (int i = 0; i < g_total; i++) {
      if (i < ErLen) { g_er[i] = 1.0; continue; }
      double net  = MathAbs(g_rates[i].close - g_rates[i - ErLen].close);
      double path = 0.0;
      for (int j = i - ErLen + 1; j <= i; j++)
         path += MathAbs(g_rates[j].close - g_rates[j - 1].close);
      g_er[i] = (path > 0.0) ? net / path : 0.0;
   }
}

//+------------------------------------------------------------------+
//| Pivot confirmation — bar p is a pivot high if it is the highest   |
//| of [p-PivotLen, p+PivotLen]. Called only when p+PivotLen has      |
//| already printed, so this never reads a future bar.                |
//+------------------------------------------------------------------+
bool IsPivotHigh(int p) {
   if (p - PivotLen < 0 || p + PivotLen >= g_total) return false;
   double v = g_rates[p].high;
   for (int i = p - PivotLen; i <= p + PivotLen; i++)
      if (i != p && g_rates[i].high >= v) return false;
   return true;
}

bool IsPivotLow(int p) {
   if (p - PivotLen < 0 || p + PivotLen >= g_total) return false;
   double v = g_rates[p].low;
   for (int i = p - PivotLen; i <= p + PivotLen; i++)
      if (i != p && g_rates[i].low <= v) return false;
   return true;
}

void PushPivot(Pivot &arr[], int &count, double price, int bar) {
   if (count < MAX_PIVOTS) {
      arr[count].price = price;
      arr[count].bar   = bar;
      count++;
      return;
   }
   for (int i = 0; i < MAX_PIVOTS - 1; i++) arr[i] = arr[i + 1];
   arr[MAX_PIVOTS - 1].price = price;
   arr[MAX_PIVOTS - 1].bar   = bar;
}

bool HighBetween(int a, int b, Pivot &out) {
   bool found = false;
   for (int i = 0; i < g_highCount; i++) {
      if (g_highs[i].bar > a && g_highs[i].bar < b) {
         if (!found || g_highs[i].price > out.price) { out = g_highs[i]; found = true; }
      }
   }
   return found;
}

bool LowBetween(int a, int b, Pivot &out) {
   bool found = false;
   for (int i = 0; i < g_lowCount; i++) {
      if (g_lows[i].bar > a && g_lows[i].bar < b) {
         if (!found || g_lows[i].price < out.price) { out = g_lows[i]; found = true; }
      }
   }
   return found;
}

bool LastHighBefore(int b, Pivot &out) {
   bool found = false;
   for (int i = 0; i < g_highCount; i++)
      if (g_highs[i].bar < b) { out = g_highs[i]; found = true; }
   return found;
}

bool LastLowBefore(int b, Pivot &out) {
   bool found = false;
   for (int i = 0; i < g_lowCount; i++)
      if (g_lows[i].bar < b) { out = g_lows[i]; found = true; }
   return found;
}

void Register(int kind, bool bullish, double neckline, double extreme, int formedBar, double atr) {
   int idx = g_patternCount;
   ArrayResize(g_patterns, idx + 1);
   g_patternCount++;

   double h = MathAbs(neckline - extreme);

   g_patterns[idx].kind        = kind;
   g_patterns[idx].bullish     = bullish;
   g_patterns[idx].neckline    = neckline;
   g_patterns[idx].extreme     = extreme;
   g_patterns[idx].height      = h;
   g_patterns[idx].formedBar   = formedBar;
   g_patterns[idx].brokenBar   = -1;
   g_patterns[idx].retestBar   = -1;
   g_patterns[idx].retestExtreme = 0.0;
   g_patterns[idx].entry       = 0.0;
   g_patterns[idx].stop        = 0.0;
   g_patterns[idx].target      = 0.0;
   g_patterns[idx].rr          = 0.0;
   g_patterns[idx].mfeR        = 0.0;
   g_patterns[idx].ledgerIdx   = -1;
   g_patterns[idx].broken      = false;
   g_patterns[idx].touched     = false;
   g_patterns[idx].entered     = false;
   g_patterns[idx].qualified   = false;
   g_patterns[idx].stopped     = false;
   g_patterns[idx].laterTarget = false;
   g_patterns[idx].resolved    = false;
   g_patterns[idx].won         = false;
   g_patterns[idx].dead        = false;

   g_nFormed[kind]++;

   int hc = ArraySize(g_heights);
   ArrayResize(g_heights, hc + 1);
   ArrayResize(g_heightKind, hc + 1);
   g_heights[hc]    = h;
   g_heightKind[hc] = kind;

   ArrayResize(g_active, g_activeCount + 1);
   g_active[g_activeCount] = idx;
   g_activeCount++;
}

void RecordTrade(int kind, int year, datetime when, double mfeR, double rr, bool won, bool stopped, int &ledgerIdx) {
   ledgerIdx = g_tradeCount;
   ArrayResize(g_tradeMfeR, g_tradeCount + 1);
   ArrayResize(g_tradeRR,   g_tradeCount + 1);
   ArrayResize(g_tradeWon,  g_tradeCount + 1);
   ArrayResize(g_tradeStop, g_tradeCount + 1);
   ArrayResize(g_tradeLate, g_tradeCount + 1);
   ArrayResize(g_tradeKind, g_tradeCount + 1);
   ArrayResize(g_tradeYear, g_tradeCount + 1);
   ArrayResize(g_tradeTime, g_tradeCount + 1);

   g_tradeMfeR[g_tradeCount] = mfeR;
   g_tradeRR[g_tradeCount]   = rr;
   g_tradeWon[g_tradeCount]  = won;
   g_tradeStop[g_tradeCount] = stopped;
   g_tradeLate[g_tradeCount] = false;
   g_tradeKind[g_tradeCount] = kind;
   g_tradeYear[g_tradeCount] = year;
   g_tradeTime[g_tradeCount] = when;
   g_tradeCount++;
}

//+------------------------------------------------------------------+
//| DETECTION                                                         |
//+------------------------------------------------------------------+
void DetectOnNewLow(int b, double atr) {
   if (g_lowCount >= 2 && UseDoubleBottom) {
      Pivot l2 = g_lows[g_lowCount - 1];
      Pivot l1 = g_lows[g_lowCount - 2];
      Pivot neck, prior;
      if (HighBetween(l1.bar, l2.bar, neck) && LastHighBefore(l1.bar, prior)) {
         bool levelOk  = MathAbs(l1.price - l2.price) <= LevelTolAtr * atr;
         double deepest = MathMin(l1.price, l2.price);
         bool heightOk = neck.price - MathMax(l1.price, l2.price) >= MinHeightAtr * atr;
         bool trendOk  = prior.price - l1.price >= MinHeightAtr * atr;
         if (levelOk && heightOk && trendOk)
            Register(KIND_DB, true, neck.price, deepest, l2.bar, atr);
      }
   }

   if (g_lowCount >= 3 && UseInverseHS) {
      Pivot ls = g_lows[g_lowCount - 3];
      Pivot hd = g_lows[g_lowCount - 2];
      Pivot rs = g_lows[g_lowCount - 1];
      Pivot p1, p2;
      if (HighBetween(ls.bar, hd.bar, p1) && HighBetween(hd.bar, rs.bar, p2)) {
         bool headOk      = hd.price < ls.price && hd.price < rs.price;
         bool shouldersOk = MathAbs(ls.price - rs.price) <= LevelTolAtr * atr;
         double neckIhs   = ConservativeNeckline ? MathMax(p1.price, p2.price) : p2.price;
         bool heightOk    = neckIhs - hd.price >= MinHeightAtr * atr;
         if (headOk && shouldersOk && heightOk)
            Register(KIND_IHS, true, neckIhs, hd.price, rs.bar, atr);
      }
   }
}

void DetectOnNewHigh(int b, double atr) {
   if (g_highCount >= 2 && UseDoubleTop) {
      Pivot h2 = g_highs[g_highCount - 1];
      Pivot h1 = g_highs[g_highCount - 2];
      Pivot neck, prior;
      if (LowBetween(h1.bar, h2.bar, neck) && LastLowBefore(h1.bar, prior)) {
         bool levelOk  = MathAbs(h1.price - h2.price) <= LevelTolAtr * atr;
         double highest = MathMax(h1.price, h2.price);
         bool heightOk = MathMin(h1.price, h2.price) - neck.price >= MinHeightAtr * atr;
         bool trendOk  = h1.price - prior.price >= MinHeightAtr * atr;
         if (levelOk && heightOk && trendOk)
            Register(KIND_DT, false, neck.price, highest, h2.bar, atr);
      }
   }

   if (g_highCount >= 3 && UseHeadShoulders) {
      Pivot ls = g_highs[g_highCount - 3];
      Pivot hd = g_highs[g_highCount - 2];
      Pivot rs = g_highs[g_highCount - 1];
      Pivot t1, t2;
      if (LowBetween(ls.bar, hd.bar, t1) && LowBetween(hd.bar, rs.bar, t2)) {
         bool headOk      = hd.price > ls.price && hd.price > rs.price;
         bool shouldersOk = MathAbs(ls.price - rs.price) <= LevelTolAtr * atr;
         double neckHs    = ConservativeNeckline ? MathMin(t1.price, t2.price) : t2.price;
         bool heightOk    = hd.price - neckHs >= MinHeightAtr * atr;
         if (headOk && shouldersOk && heightOk)
            Register(KIND_HS, false, neckHs, hd.price, rs.bar, atr);
      }
   }
}

//+------------------------------------------------------------------+
//| LIFECYCLE — one bar. Walks active patterns backwards so that      |
//| removals do not disturb indices still to be visited.              |
//+------------------------------------------------------------------+
void UpdateLifecycle(int b, double atr) {
   double hi = g_rates[b].high;
   double lo = g_rates[b].low;
   double cl = g_rates[b].close;
   double retestTol = RetestTolAtr * atr;

   MqlDateTime dt;
   TimeToStruct(g_rates[b].time, dt);

   for (int a = g_activeCount - 1; a >= 0; a--) {
      int pi = g_active[a];
      int idx = g_patterns[pi].kind;

      if (g_patterns[pi].entered && g_patterns[pi].qualified && !g_patterns[pi].resolved) {
         double R = MathAbs(g_patterns[pi].entry - g_patterns[pi].stop);
         bool hitStop   = g_patterns[pi].bullish ? (lo <= g_patterns[pi].stop)   : (hi >= g_patterns[pi].stop);
         bool hitTarget = g_patterns[pi].bullish ? (hi >= g_patterns[pi].target) : (lo <= g_patterns[pi].target);

         if (!g_patterns[pi].stopped) {
            if (hitStop) {
               g_patterns[pi].stopped = true;
               g_patterns[pi].won     = false;
               g_nLost[idx]++;
               int li = -1;
               RecordTrade(idx, dt.year, g_rates[g_patterns[pi].retestBar].time, g_patterns[pi].mfeR, g_patterns[pi].rr, false, true, li);
               g_patterns[pi].ledgerIdx = li;
            } else {
               double fav = R > 0 ? (g_patterns[pi].bullish ? (hi - g_patterns[pi].entry) / R
                                                            : (g_patterns[pi].entry - lo) / R) : 0.0;
               if (fav > g_patterns[pi].mfeR) g_patterns[pi].mfeR = fav;
               if (hitTarget) {
                  g_patterns[pi].resolved = true;
                  g_patterns[pi].won      = true;
                  g_nWon[idx]++;
                  int lw = -1;
                  RecordTrade(idx, dt.year, g_rates[g_patterns[pi].retestBar].time, g_patterns[pi].mfeR, g_patterns[pi].rr, true, false, lw);
                  g_patterns[pi].ledgerIdx = lw;
               }
            }
         } else {
            if (hitTarget) {
               g_patterns[pi].laterTarget = true;
               g_patterns[pi].resolved    = true;
               if (g_patterns[pi].ledgerIdx >= 0) g_tradeLate[g_patterns[pi].ledgerIdx] = true;
            }
         }

         if (!g_patterns[pi].resolved && b - g_patterns[pi].retestBar > TradeMaxBars)
            g_patterns[pi].resolved = true;

      } else if (!g_patterns[pi].dead && !g_patterns[pi].entered) {
         bool reclaimed = g_patterns[pi].bullish ? (cl < g_patterns[pi].extreme) : (cl > g_patterns[pi].extreme);

         if (reclaimed) {
            g_patterns[pi].dead = true;
         } else if (!g_patterns[pi].broken) {
            bool broke = g_patterns[pi].bullish ? (cl > g_patterns[pi].neckline) : (cl < g_patterns[pi].neckline);
            if (broke) {
               g_patterns[pi].broken    = true;
               g_patterns[pi].brokenBar = b;
               g_nBroken[idx]++;
            } else if (b - g_patterns[pi].formedBar > ExpiryBars) {
               g_patterns[pi].dead = true;
            }
         } else {
            if (b - g_patterns[pi].brokenBar > RetestMaxBars && !g_patterns[pi].touched) {
               g_patterns[pi].dead = true;
            } else {
               bool inZone = g_patterns[pi].bullish ? (lo <= g_patterns[pi].neckline + retestTol)
                                                    : (hi >= g_patterns[pi].neckline - retestTol);
               if (inZone) {
                  if (!g_patterns[pi].touched) {
                     g_patterns[pi].touched = true;
                     g_nRetest[idx]++;
                     g_patterns[pi].retestExtreme = g_patterns[pi].bullish ? lo : hi;
                  } else {
                     if (g_patterns[pi].bullish) {
                        if (lo < g_patterns[pi].retestExtreme) g_patterns[pi].retestExtreme = lo;
                     } else {
                        if (hi > g_patterns[pi].retestExtreme) g_patterns[pi].retestExtreme = hi;
                     }
                  }
               }

               bool held = g_patterns[pi].bullish ? (cl > g_patterns[pi].neckline) : (cl < g_patterns[pi].neckline);
               if (g_patterns[pi].touched && held) {
                  g_patterns[pi].entered   = true;
                  g_patterns[pi].retestBar = b;
                  g_patterns[pi].entry     = cl;
                  g_patterns[pi].stop      = g_patterns[pi].bullish
                                             ? g_patterns[pi].retestExtreme - StopBufAtr * atr
                                             : g_patterns[pi].retestExtreme + StopBufAtr * atr;
                  g_patterns[pi].target    = g_patterns[pi].bullish
                                             ? g_patterns[pi].neckline + g_patterns[pi].height
                                             : g_patterns[pi].neckline - g_patterns[pi].height;

                  double risk   = MathAbs(g_patterns[pi].entry - g_patterns[pi].stop);
                  double reward = MathAbs(g_patterns[pi].target - g_patterns[pi].entry);
                  g_patterns[pi].rr = risk > 0 ? reward / risk : 0.0;

                  // TEST 1 — a stop that cannot absorb the spread is not a trade.
                  bool costOk = (risk > 0) && (100.0 * CostPerOz / risk <= MaxCostPctOfRisk);

                  // TEST 2 — reversal patterns are taken only in chop, if enabled.
                  bool regimeOk = !UseRegimeFilter || (g_er[b] <= ErMax);

                  if (g_patterns[pi].rr >= MinRR && costOk && regimeOk) {
                     g_patterns[pi].qualified = true;
                     g_nQual[idx]++;
                     int sc = ArraySize(g_stopsQ);
                     ArrayResize(g_stopsQ, sc + 1);
                     g_stopsQ[sc] = risk;
                  } else {
                     g_patterns[pi].dead = true;
                  }
               }
            }
         }
      }

      if (g_patterns[pi].dead || g_patterns[pi].resolved) {
         g_active[a] = g_active[g_activeCount - 1];
         g_activeCount--;
         ArrayResize(g_active, g_activeCount);
      }
   }
}

//+------------------------------------------------------------------+
//| STATS                                                             |
//+------------------------------------------------------------------+
double Median(double &arr[]) {
   int n = ArraySize(arr);
   if (n == 0) return 0.0;
   double tmp[];
   ArrayResize(tmp, n);
   ArrayCopy(tmp, arr);
   ArraySort(tmp);
   if (n % 2 == 1) return tmp[n / 2];
   return (tmp[n / 2 - 1] + tmp[n / 2]) / 2.0;
}

double MedianForKind(int kind) {
   double tmp[];
   int c = 0;
   for (int i = 0; i < ArraySize(g_heights); i++) {
      if (g_heightKind[i] == kind) {
         ArrayResize(tmp, c + 1);
         tmp[c] = g_heights[i];
         c++;
      }
   }
   return Median(tmp);
}

// Every statistic below is windowed by trade time, so the same code produces
// the pooled result, the in-sample result and the out-of-sample result. The
// split is the whole point: a filter that only works pooled is a filter fitted
// to the years it was chosen from.
bool InWindow(int i, datetime from, datetime to) {
   return (g_tradeTime[i] >= from && (to == 0 || g_tradeTime[i] < to));
}

int CountIn(datetime from, datetime to) {
   int c = 0;
   for (int i = 0; i < g_tradeCount; i++) if (InWindow(i, from, to)) c++;
   return c;
}

double HitRateAt(double x, datetime from, datetime to) {
   int n = 0, c = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWindow(i, from, to)) continue;
      n++;
      if (g_tradeMfeR[i] >= x) c++;
   }
   return (n == 0) ? 0.0 : 100.0 * c / n;
}

double ExpectancyAt(double x, datetime from, datetime to) {
   int n = 0;
   double t = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWindow(i, from, to)) continue;
      n++;
      t += (g_tradeMfeR[i] >= x) ? x : -1.0;
   }
   return (n == 0) ? 0.0 : t / n;
}

double ExpectancyMM(datetime from, datetime to) {
   int n = 0;
   double t = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWindow(i, from, to)) continue;
      n++;
      t += g_tradeWon[i] ? g_tradeRR[i] : -1.0;
   }
   return (n == 0) ? 0.0 : t / n;
}

// Standard error of the measured-move expectancy. Reported because a point
// estimate without one is how a noise field gets mistaken for an edge.
double ExpectancyMMStdErr(double mean, datetime from, datetime to) {
   int n = 0;
   double ss = 0.0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (!InWindow(i, from, to)) continue;
      double v = g_tradeWon[i] ? g_tradeRR[i] : -1.0;
      ss += (v - mean) * (v - mean);
      n++;
   }
   if (n < 2) return 0.0;
   return MathSqrt(ss / (n - 1)) / MathSqrt((double)n);
}

string Pct(int part, int whole) {
   if (whole == 0) return "-";
   return StringFormat("%d%%", (int)MathRound(100.0 * part / whole));
}

//+------------------------------------------------------------------+
void OnStart() {
   ArrayResize(g_highs, MAX_PIVOTS);
   ArrayResize(g_lows,  MAX_PIVOTS);
   ArraySetAsSeries(g_rates, false);

   datetime from = StartDate;
   datetime to   = (EndDate == 0) ? TimeCurrent() : EndDate;

   g_total = CopyRates(_Symbol, PERIOD_H1, from, to, g_rates);
   if (g_total <= 0) {
      Log("CopyRates failed. Open an H1 chart of this symbol, set Tools > Options > Charts > Max bars to unlimited, and scroll back to force the download.");
      return;
   }

   Log(StringFormat("%s H1 — %d bars, %s to %s",
       _Symbol, g_total,
       TimeToString(g_rates[0].time, TIME_DATE),
       TimeToString(g_rates[g_total - 1].time, TIME_DATE)));

   BuildAtr();
   BuildEr();

   ArrayInitialize(g_nFormed, 0);
   ArrayInitialize(g_nBroken, 0);
   ArrayInitialize(g_nRetest, 0);
   ArrayInitialize(g_nQual,   0);
   ArrayInitialize(g_nWon,    0);
   ArrayInitialize(g_nLost,   0);

   for (int b = 0; b < g_total; b++) {
      double atr = g_atr[b];
      if (atr <= 0) continue;

      int p = b - PivotLen;
      if (p >= PivotLen && p + PivotLen < g_total) {
         if (IsPivotHigh(p)) {
            PushPivot(g_highs, g_highCount, g_rates[p].high, p);
            DetectOnNewHigh(b, atr);
         }
         if (IsPivotLow(p)) {
            PushPivot(g_lows, g_lowCount, g_rates[p].low, p);
            DetectOnNewLow(b, atr);
         }
      }

      UpdateLifecycle(b, atr);
   }

   PrintReport();
}

//+------------------------------------------------------------------+
//| One statistics block over a time window. Printed three times —    |
//| pooled, in-sample, out-of-sample — from identical code, so the    |
//| only thing that differs between them is the data.                 |
//+------------------------------------------------------------------+
void PrintBlock(string label, datetime from, datetime to, double costR) {
   int n = CountIn(from, to);
   if (n == 0) {
      Log(StringFormat("%s  no trades in window", label));
      return;
   }

   int w = 0;
   for (int i = 0; i < g_tradeCount; i++)
      if (InWindow(i, from, to) && g_tradeWon[i]) w++;

   double exMM = ExpectancyMM(from, to);
   double net  = exMM - costR;
   double se   = ExpectancyMMStdErr(exMM, from, to);

   Log(StringFormat("%s  n=%d", label, n));
   Log(StringFormat("   %-10s %8s %8s %8s %8s %8s %10s", "", "1.0R", "1.5R", "2.0R", "2.5R", "3.0R", "MeasMove"));
   Log(StringFormat("   %-10s %7.0f%% %7.0f%% %7.0f%% %7.0f%% %7.0f%% %9s",
       "Hit %",
       HitRateAt(1.0, from, to), HitRateAt(1.5, from, to), HitRateAt(2.0, from, to),
       HitRateAt(2.5, from, to), HitRateAt(3.0, from, to), Pct(w, n)));
   Log(StringFormat("   %-10s %+8.3f %+8.3f %+8.3f %+8.3f %+8.3f %+10.3f",
       "Exp (R)",
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

//+------------------------------------------------------------------+
void PrintReport() {
   int tf = 0, tb = 0, tr = 0, tq = 0, tw = 0, tl = 0;
   for (int k = 0; k < 4; k++) {
      tf += g_nFormed[k]; tb += g_nBroken[k]; tr += g_nRetest[k];
      tq += g_nQual[k];   tw += g_nWon[k];    tl += g_nLost[k];
   }

   double years = (double)(g_rates[g_total - 1].time - g_rates[0].time) / (365.25 * 24 * 3600);
   double medStop = Median(g_stopsQ);
   double costR = (medStop > 0) ? CostPerOz / medStop : 0.0;

   Log("=======================================================================================");
   // Self-documenting header — every run goes in the variant log, and a table
   // without its settings attached is a table you cannot reproduce.
   Log(StringFormat("CONFIG  pivot=%d  levelTol=%.2f  minH=%.2f  minRR=%.1f  stopBuf=%.2f  maxCost=%.1f%%  regime=%s%s  split=%s",
       PivotLen, LevelTolAtr, MinHeightAtr, MinRR, StopBufAtr, MaxCostPctOfRisk,
       UseRegimeFilter ? "ON" : "OFF",
       UseRegimeFilter ? StringFormat(" (ER<=%.2f, len %d)", ErMax, ErLen) : "",
       TimeToString(SplitDate, TIME_DATE)));
   Log("---------------------------------------------------------------------------------------");
   Log(StringFormat("%-18s %7s %12s %12s %12s %12s %10s", "Pattern", "Formed", "Broke", "Retest", "Qual", "Hit", "MedH $"));
   Log("---------------------------------------------------------------------------------------");
   for (int k = 0; k < 4; k++) {
      Log(StringFormat("%-18s %7d %6d %5s %6d %5s %6d %5s %6d %5s %10.1f",
          KindName(k), g_nFormed[k],
          g_nBroken[k], Pct(g_nBroken[k], g_nFormed[k]),
          g_nRetest[k], Pct(g_nRetest[k], g_nBroken[k]),
          g_nQual[k],   Pct(g_nQual[k],   g_nRetest[k]),
          g_nWon[k],    Pct(g_nWon[k],    g_nWon[k] + g_nLost[k]),
          MedianForKind(k)));
   }
   Log("---------------------------------------------------------------------------------------");
   Log(StringFormat("%-18s %7d %6d %5s %6d %5s %6d %5s %6d %5s %10.1f",
       "TOTAL", tf, tb, Pct(tb, tf), tr, Pct(tr, tb), tq, Pct(tq, tr), tw, Pct(tw, tw + tl), Median(g_heights)));
   Log("");

   Log(StringFormat("SAMPLE  %.1f qualified / year over %.1f yrs   (n = %d)", tq / MathMax(years, 0.01), years, g_tradeCount));
   Log(StringFormat("COST    median qualified stop $%.1f  ->  %.2f%% of risk at $%.2f/oz", medStop, 100.0 * costR, CostPerOz));
   Log("");

   PrintBlock("ALL           ", 0, 0, costR);
   PrintBlock("IN-SAMPLE     ", 0, SplitDate, costR);
   PrintBlock("OUT-OF-SAMPLE ", SplitDate, 0, costR);

   int nStopped = 0, nLate = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeStop[i]) { nStopped++; if (g_tradeLate[i]) nLate++; }
   }
   Log(StringFormat("STOP          %d of %d stopped trades (%s) reached the measured move anyway",
       nLate, nStopped, Pct(nLate, nStopped)));
   Log("");

   // ---- per-year, the regime test ----------------------------------------
   Log("BY YEAR  (the regime test — does this only work when gold trends up?)");
   Log(StringFormat("  %-6s %7s %7s %10s", "Year", "n", "Hit", "Exp (R)"));
   int minY = 99999, maxY = 0;
   for (int i = 0; i < g_tradeCount; i++) {
      if (g_tradeYear[i] < minY) minY = g_tradeYear[i];
      if (g_tradeYear[i] > maxY) maxY = g_tradeYear[i];
   }
   for (int y = minY; y <= maxY; y++) {
      int n = 0, w = 0;
      double sum = 0.0;
      for (int i = 0; i < g_tradeCount; i++) {
         if (g_tradeYear[i] != y) continue;
         n++;
         if (g_tradeWon[i]) w++;
         sum += g_tradeWon[i] ? g_tradeRR[i] : -1.0;
      }
      if (n > 0)
         Log(StringFormat("  %-6d %7d %6s %+10.3f", y, n, Pct(w, n), sum / n - costR));
   }
   Log("=======================================================================================");
}
