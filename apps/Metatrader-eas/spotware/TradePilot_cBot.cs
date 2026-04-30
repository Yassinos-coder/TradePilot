using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    [Robot(Name = "TradePilot EA", Version = "1.0.0", TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class TradePilotEA : Robot
    {
        [Parameter("Server Host", Group = "=== TradePilot Server ===", DefaultValue = "tradepilot.yassinecastro.com")]
        public string ServerHost { get; set; }

        [Parameter("Server Port", Group = "=== TradePilot Server ===", DefaultValue = 4000)]
        public int ServerPort { get; set; }

        [Parameter("Use SSL", Group = "=== TradePilot Server ===", DefaultValue = false)]
        public bool UseSSL { get; set; }

        [Parameter("WS Path", Group = "=== TradePilot Server ===", DefaultValue = "/ws/ea")]
        public string WsPath { get; set; }

        [Parameter("API Key", Group = "=== Authentication ===", DefaultValue = "")]
        public string ApiKey { get; set; }

        [Parameter("Lot Size", Group = "=== Trade Execution ===", DefaultValue = 0.01, MinValue = 0.01)]
        public double LotSize { get; set; }

        [Parameter("Use TP Count (0 = all)", Group = "=== Trade Execution ===", DefaultValue = 3, MinValue = 0)]
        public int UseTpCount { get; set; }

        [Parameter("Enable Trading", Group = "=== Trade Execution ===", DefaultValue = true)]
        public bool EnableTrading { get; set; }

        [Parameter("Reconnect Delay Sec", Group = "=== Connection ===", DefaultValue = 5, MinValue = 1)]
        public int ReconnectDelaySec { get; set; }

        private enum BotState { Disconnected, Connecting, Authenticating, Connected }

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private BotState _state = BotState.Disconnected;
        private int _reconnectAttempt;
        private DateTime _reconnectAfter = DateTime.MinValue;
        private DateTime _lastMessageAt = DateTime.MinValue;
        private DateTime _lastPingSentAt = DateTime.MinValue;
        private DateTime _lastAccountStatusAt = DateTime.MinValue;
        private DateTime _lastSymbolsAt = DateTime.MinValue;

        // Incoming messages are queued from the WS receive thread and processed on the timer thread
        // so all trading API calls happen on cTrader's main bot thread.
        private readonly ConcurrentQueue<string> _inbox = new ConcurrentQueue<string>();
        private readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);
        private readonly HashSet<long> _reportedPositionIds = new HashSet<long>();

        private string BotAccountId => Account.Number.ToString();
        private string BotAccountName => string.IsNullOrEmpty(Account.BrokerName) ? BotAccountId : Account.BrokerName;

        // ── Lifecycle ─────────────────────────────────────────────────────────────

        protected override void OnStart()
        {
            if (string.IsNullOrEmpty(ApiKey))
            {
                Log("ERROR: API Key is required");
                Stop();
                return;
            }

            Positions.Opened += OnPositionOpened;
            Positions.Closed += OnPositionClosed;

            Timer.Start(TimeSpan.FromMilliseconds(500));
            _ = ConnectAsync();
        }

        protected override void OnTimer()
        {
            // Drain the message queue on the main thread so trading APIs are safe to call
            while (_inbox.TryDequeue(out var msg))
                HandleMessage(msg);

            if (_state == BotState.Disconnected && DateTime.UtcNow >= _reconnectAfter)
            {
                _ = ConnectAsync();
                return;
            }

            if (_state != BotState.Connected)
                return;

            var now = DateTime.UtcNow;

            if ((now - _lastPingSentAt).TotalSeconds >= 5)
                _ = SendAsync(BuildPing());

            if ((now - _lastAccountStatusAt).TotalSeconds >= 10)
                _ = SendAccountStatusAsync();

            if ((now - _lastSymbolsAt).TotalSeconds >= 60)
                _ = SendSymbolsAsync();

            if (_lastMessageAt != DateTime.MinValue && (now - _lastMessageAt).TotalSeconds > 35)
            {
                Log("Heartbeat timeout, reconnecting");
                _ = DisconnectAsync();
            }
        }

        protected override void OnStop()
        {
            Timer.Stop();
            Positions.Opened -= OnPositionOpened;
            Positions.Closed -= OnPositionClosed;
            _cts?.Cancel();
            _ws?.Dispose();
            _ws = null;
            Log("EA stopped");
        }

        // ── WebSocket ─────────────────────────────────────────────────────────────

        private async Task ConnectAsync()
        {
            if (_state != BotState.Disconnected)
                return;

            _state = BotState.Connecting;
            _cts?.Dispose();
            _cts = new CancellationTokenSource();
            _ws = new ClientWebSocket();

            try
            {
                var scheme = UseSSL ? "wss" : "ws";
                var uri = new Uri($"{scheme}://{ServerHost}:{ServerPort}{WsPath}");
                Log($"Connecting to {uri}");

                await _ws.ConnectAsync(uri, _cts.Token);

                _state = BotState.Authenticating;

                await SendRawAsync(JsonSerializer.Serialize(new
                {
                    type = "auth",
                    apiKey = ApiKey,
                    accountId = BotAccountId,
                    accountName = BotAccountName
                }));

                Log("-> auth");
                _ = ReceiveLoopAsync();
            }
            catch (Exception ex)
            {
                Log($"Connect failed: {ex.Message}");
                await DisconnectAsync();
            }
        }

        private async Task ReceiveLoopAsync()
        {
            var buf = new byte[65536];
            try
            {
                while (_ws != null && _ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buf), _cts.Token);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Log("Server closed connection");
                        await DisconnectAsync();
                        return;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        _lastMessageAt = DateTime.UtcNow;
                        _inbox.Enqueue(Encoding.UTF8.GetString(buf, 0, result.Count));
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                Log($"Receive error: {ex.Message}");
                await DisconnectAsync();
            }
        }

        private async Task DisconnectAsync()
        {
            _ws?.Dispose();
            _ws = null;

            if (_state == BotState.Disconnected)
                return;

            int delay = ReconnectDelaySec;
            for (int i = 0; i < _reconnectAttempt && i < 7; i++)
                delay *= 2;
            if (_reconnectAttempt >= 8)
                delay = 600;

            _reconnectAfter = DateTime.UtcNow.AddSeconds(delay);
            _reconnectAttempt++;
            _state = BotState.Disconnected;

            Log($"Disconnected, reconnecting in {delay}s (attempt {_reconnectAttempt})");
            await Task.CompletedTask;
        }

        private async Task SendAsync(string json)
        {
            if (_ws == null || _ws.State != WebSocketState.Open)
                return;

            await _sendLock.WaitAsync();
            try
            {
                await _ws.SendAsync(
                    new ArraySegment<byte>(Encoding.UTF8.GetBytes(json)),
                    WebSocketMessageType.Text,
                    true,
                    _cts?.Token ?? CancellationToken.None
                );
            }
            catch (Exception ex)
            {
                Log($"Send failed: {ex.Message}");
                _ = DisconnectAsync();
            }
            finally
            {
                _sendLock.Release();
            }
        }

        private Task SendRawAsync(string json) => SendAsync(json);

        // ── Message Handling (runs on main timer thread) ──────────────────────────

        private void HandleMessage(string msg)
        {
            try
            {
                using var doc = JsonDocument.Parse(msg);
                var root = doc.RootElement;

                if (!root.TryGetProperty("type", out var typeProp))
                    return;

                switch (typeProp.GetString())
                {
                    case "auth_success":
                        _state = BotState.Connected;
                        _reconnectAttempt = 0;
                        Log("Auth success, ready for signals");
                        _ = SendSymbolsAsync();
                        _ = SendAccountStatusAsync();
                        SyncTradeHistory();
                        break;

                    case "error":
                        Log($"Server error: {GetStr(root, "message")}");
                        _ = DisconnectAsync();
                        break;

                    case "ping":
                        var ts = GetDouble(root, "timestamp");
                        _ = SendAsync($"{{\"type\":\"pong\",\"timestamp\":{ts}}}");
                        break;

                    case "pong":
                        break;

                    case "sync_state":
                        HandleSyncState(GetStr(root, "request_id"));
                        break;

                    case "signal":
                        if (root.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == JsonValueKind.Array)
                            HandleSignal(dataArr);
                        break;

                    case "partial_close":
                        HandlePartialClose(root);
                        break;

                    case "close_all":
                        HandleCloseAll(root);
                        break;

                    case "move_sl":
                        HandleMoveSl(root);
                        break;
                }
            }
            catch (Exception ex)
            {
                Log($"Message error: {ex.Message}");
            }
        }

        private void HandleSyncState(string requestId)
        {
            _ = SendSymbolsAsync();
            _ = SendAccountStatusAsync();
            int synced = SyncTradeHistory();
            _ = SendAsync(JsonSerializer.Serialize(new
            {
                type = "sync_state_complete",
                accountId = BotAccountId,
                request_id = requestId,
                synced_at = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                synced_trades = synced
            }));
        }

        private void HandleSignal(JsonElement dataArray)
        {
            var items = new List<JsonElement>();
            foreach (var item in dataArray.EnumerateArray())
                items.Add(item.Clone());

            int count = UseTpCount > 0 && UseTpCount < items.Count ? UseTpCount : items.Count;
            for (int i = 0; i < count; i++)
                ExecuteTrade(items[i], i + 1);
        }

        private void HandlePartialClose(JsonElement root)
        {
            var symbol = GetStr(root, "symbol");
            var signalId = GetStr(root, "signal_id");
            var executionKey = GetStr(root, "execution_key");
            var percent = GetDouble(root, "percent");

            if (string.IsNullOrEmpty(symbol) || percent <= 0 || percent > 100)
            {
                SendCommandResult("PARTIAL_CLOSE", symbol, false, "Invalid payload", signalId, executionKey);
                return;
            }

            if (!EnableTrading)
            {
                SendCommandResult("PARTIAL_CLOSE", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
                return;
            }

            bool anySuccess = false;
            foreach (var pos in Positions)
            {
                if (pos.SymbolName != symbol) continue;

                var sym = Symbols.GetSymbol(symbol);
                if (sym == null) continue;

                double closeVol = NormalizeVolume(sym, pos.VolumeInUnits * percent / 100.0);
                if (closeVol <= 0) continue;

                var result = ClosePosition(pos, closeVol);
                if (result.IsSuccessful)
                    anySuccess = true;
            }

            SendCommandResult("PARTIAL_CLOSE", symbol, anySuccess,
                anySuccess ? "Partial close executed" : "No matching positions", signalId, executionKey);
        }

        private void HandleCloseAll(JsonElement root)
        {
            var symbol = GetStr(root, "symbol");
            var signalId = GetStr(root, "signal_id");
            var executionKey = GetStr(root, "execution_key");

            if (string.IsNullOrEmpty(symbol))
            {
                SendCommandResult("CLOSE_ALL", symbol, false, "Invalid payload", signalId, executionKey);
                return;
            }

            if (!EnableTrading)
            {
                SendCommandResult("CLOSE_ALL", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
                return;
            }

            bool anySuccess = false;

            foreach (var pos in Positions)
            {
                if (pos.SymbolName != symbol) continue;
                if (ClosePosition(pos).IsSuccessful)
                    anySuccess = true;
            }

            foreach (var order in PendingOrders)
            {
                if (order.SymbolName != symbol) continue;
                if (CancelPendingOrder(order).IsSuccessful)
                    anySuccess = true;
            }

            SendCommandResult("CLOSE_ALL", symbol, anySuccess,
                anySuccess ? "Close all executed" : "No matching positions or orders", signalId, executionKey);
        }

        private void HandleMoveSl(JsonElement root)
        {
            var symbol = GetStr(root, "symbol");
            var signalId = GetStr(root, "signal_id");
            var executionKey = GetStr(root, "execution_key");
            var newSl = GetDouble(root, "new_stop_loss");

            if (string.IsNullOrEmpty(symbol) || newSl <= 0)
            {
                SendCommandResult("MOVE_SL", symbol, false, "Invalid payload", signalId, executionKey);
                return;
            }

            if (!EnableTrading)
            {
                SendCommandResult("MOVE_SL", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
                return;
            }

            bool anySuccess = false;
            foreach (var pos in Positions)
            {
                if (pos.SymbolName != symbol) continue;
                if (ModifyPosition(pos, newSl, pos.TakeProfit).IsSuccessful)
                    anySuccess = true;
            }

            SendCommandResult("MOVE_SL", symbol, anySuccess,
                anySuccess ? "Stop loss updated" : "No matching positions", signalId, executionKey);
        }

        // ── Trade Execution ───────────────────────────────────────────────────────

        private void ExecuteTrade(JsonElement data, int index)
        {
            var symbol = GetStr(data, "symbol");
            var side = GetStr(data, "type");
            var entry = GetStr(data, "entry");
            var signalId = GetStr(data, "signal_id");
            var executionKey = GetStr(data, "execution_key");
            var entryPrice = GetDouble(data, "entry_price");
            var stopLoss = GetDouble(data, "stop_loss");
            var takeProfit = GetDouble(data, "take_profit");

            if (string.IsNullOrEmpty(symbol) || string.IsNullOrEmpty(side) || string.IsNullOrEmpty(entry))
            {
                SendCommandResult("OPEN", symbol, false, "Invalid trade payload", signalId, executionKey);
                return;
            }

            if (!EnableTrading)
            {
                SendCommandResult("OPEN", symbol, true, "EnableTrading=false dry run", signalId, executionKey);
                return;
            }

            var sym = Symbols.GetSymbol(symbol);
            if (sym == null)
            {
                SendCommandResult("OPEN", symbol, false, $"Symbol '{symbol}' not available", signalId, executionKey);
                return;
            }

            double volume = NormalizeVolume(sym, sym.QuantityToVolumeInUnits(LotSize));
            if (volume <= 0)
            {
                SendCommandResult("OPEN", symbol, false, "LotSize produces invalid volume", signalId, executionKey);
                return;
            }

            var tradeType = side == "BUY" ? TradeType.Buy : TradeType.Sell;
            var label = $"TradePilot-{index}";
            double? sl = stopLoss > 0 ? stopLoss : (double?)null;
            double? tp = takeProfit > 0 ? takeProfit : (double?)null;

            if (entry == "LIMIT" && entryPrice > 0)
            {
                // SL/TP for pending orders must be expressed in pips relative to the target price
                double? slPips = null;
                double? tpPips = null;

                if (sl.HasValue)
                {
                    double diff = tradeType == TradeType.Buy
                        ? entryPrice - sl.Value
                        : sl.Value - entryPrice;
                    if (diff > 0) slPips = diff / sym.PipSize;
                }

                if (tp.HasValue)
                {
                    double diff = tradeType == TradeType.Buy
                        ? tp.Value - entryPrice
                        : entryPrice - tp.Value;
                    if (diff > 0) tpPips = diff / sym.PipSize;
                }

                var orderResult = PlaceLimitOrder(tradeType, symbol, volume, entryPrice, label, slPips, tpPips, label);
                if (!orderResult.IsSuccessful)
                {
                    SendCommandResult("OPEN", symbol, false, orderResult.Error.ToString(), signalId, executionKey);
                    SendRejectedTradeEvent(symbol, side, volume, sym, entry, entryPrice, stopLoss, takeProfit, orderResult.Error.ToString());
                    return;
                }

                SendCommandResult("OPEN", symbol, true, "Limit order placed", signalId, executionKey);
                Log($"Limit order: {symbol} {side} {LotSize} lots @ {entryPrice}");
            }
            else
            {
                var result = ExecuteMarketOrder(tradeType, symbol, volume, label, null, null, label);
                if (!result.IsSuccessful)
                {
                    SendCommandResult("OPEN", symbol, false, result.Error.ToString(), signalId, executionKey);
                    SendRejectedTradeEvent(symbol, side, volume, sym, entry, entryPrice, stopLoss, takeProfit, result.Error.ToString());
                    return;
                }

                // Set SL/TP by price level after the position is open
                if ((sl.HasValue || tp.HasValue) && result.Position != null)
                    ModifyPosition(result.Position, sl, tp);

                SendCommandResult("OPEN", symbol, true, "Trade executed", signalId, executionKey);
                Log($"Trade opened: {symbol} {side} {LotSize} lots");
            }
        }

        // ── Position Events & Trade History ───────────────────────────────────────

        private void OnPositionOpened(PositionOpenedEventArgs args)
        {
            if (_state != BotState.Connected) return;
            var pos = args.Position;
            _reportedPositionIds.Add(pos.Id);
            _ = SendAsync(BuildTradeEventJson(
                "OPEN", pos.Id, pos.SymbolName, pos.TradeType.ToString().ToUpper(),
                pos.VolumeInUnits, pos.SymbolName,
                true, pos.EntryPrice, false, 0,
                pos.StopLoss.HasValue, pos.StopLoss ?? 0,
                pos.TakeProfit.HasValue, pos.TakeProfit ?? 0,
                0, pos.Label ?? "", pos.EntryTime, false, DateTime.MinValue
            ));
        }

        private void OnPositionClosed(PositionClosedEventArgs args)
        {
            if (_state != BotState.Connected) return;
            var pos = args.Position;
            var now = DateTime.UtcNow;

            var trade = History.FindLast(pos.Label, pos.SymbolName, pos.TradeType);
            double exitPrice = trade?.ClosingPrice ?? 0;

            _ = SendAsync(BuildTradeEventJson(
                "CLOSED", pos.Id, pos.SymbolName, pos.TradeType.ToString().ToUpper(),
                pos.VolumeInUnits, pos.SymbolName,
                true, pos.EntryPrice, exitPrice > 0, exitPrice,
                false, 0, false, 0,
                pos.GrossProfit, pos.Label ?? "", pos.EntryTime, true, now
            ));
        }

        private int SyncTradeHistory()
        {
            int synced = 0;
            foreach (var pos in Positions)
            {
                if (_reportedPositionIds.Contains(pos.Id)) continue;
                _ = SendAsync(BuildTradeEventJson(
                    "OPEN", pos.Id, pos.SymbolName, pos.TradeType.ToString().ToUpper(),
                    pos.VolumeInUnits, pos.SymbolName,
                    true, pos.EntryPrice, false, 0,
                    pos.StopLoss.HasValue, pos.StopLoss ?? 0,
                    pos.TakeProfit.HasValue, pos.TakeProfit ?? 0,
                    pos.GrossProfit, pos.Label ?? "", pos.EntryTime, false, DateTime.MinValue
                ));
                _reportedPositionIds.Add(pos.Id);
                synced++;
            }
            return synced;
        }

        private void SendRejectedTradeEvent(
            string symbol, string side, double volumeInUnits, Symbol sym,
            string entry, double entryPrice, double stopLoss, double takeProfit, string reason)
        {
            if (_state != BotState.Connected) return;
            long pseudoTicket = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var now = DateTime.UtcNow;
            _ = SendAsync(BuildTradeEventJson(
                "REJECTED", pseudoTicket, symbol, side, volumeInUnits, symbol,
                entry == "LIMIT", entryPrice, false, 0,
                stopLoss > 0, stopLoss, takeProfit > 0, takeProfit,
                0, reason, now, true, now
            ));
        }

        // ── Outgoing Messages ─────────────────────────────────────────────────────

        private string BuildPing()
        {
            _lastPingSentAt = DateTime.UtcNow;
            return $"{{\"type\":\"ping\",\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}}}";
        }

        private async Task SendAccountStatusAsync()
        {
            if (_state != BotState.Connected) return;

            double balance = Account.Balance;
            double equity = Account.Equity;
            double drawdown = balance > 0 ? Math.Max(0, (balance - equity) / balance * 100.0) : 0;

            await SendAsync(JsonSerializer.Serialize(new
            {
                type = "account_status",
                accountId = BotAccountId,
                data = new
                {
                    balance = Math.Round(balance, 2),
                    equity = Math.Round(equity, 2),
                    margin = Math.Round(Account.Margin, 2),
                    freeMargin = Math.Round(Account.FreeMargin, 2),
                    drawdownPercent = Math.Round(drawdown, 2),
                    openPositions = Positions.Count
                }
            }));

            _lastAccountStatusAt = DateTime.UtcNow;
        }

        private async Task SendSymbolsAsync()
        {
            if (_state != BotState.Connected) return;

            var names = new List<string>();
            try
            {
                foreach (var sym in Symbols)
                    names.Add(sym.Name);
            }
            catch { }

            await SendAsync(JsonSerializer.Serialize(new
            {
                type = "symbols",
                accountId = BotAccountId,
                symbols = names
            }));

            _lastSymbolsAt = DateTime.UtcNow;
        }

        private void SendCommandResult(string action, string symbol, bool success, string message, string signalId, string executionKey)
        {
            if (_state != BotState.Connected) return;
            _ = SendAsync(JsonSerializer.Serialize(new
            {
                type = "command_result",
                accountId = BotAccountId,
                action,
                symbol,
                status = success ? "SUCCESS" : "ERROR",
                message,
                signal_id = string.IsNullOrEmpty(signalId) ? null : signalId,
                execution_key = string.IsNullOrEmpty(executionKey) ? null : executionKey
            }));
            Log($"-> command_result {action} {(success ? "SUCCESS" : "ERROR")}");
        }

        private string BuildTradeEventJson(
            string status, long ticket, string symbol, string side,
            double volumeInUnits, string symbolName,
            bool hasEntry, double entryPrice,
            bool hasExit, double exitPrice,
            bool hasSl, double sl,
            bool hasTp, double tp,
            double profit, string comment,
            DateTime openedAt, bool hasClosed, DateTime closedAt)
        {
            var sym = Symbols.GetSymbol(symbolName);
            double lots = sym != null
                ? Math.Round(sym.VolumeInUnitsToQuantity(volumeInUnits), 2)
                : Math.Round(volumeInUnits / 100000.0, 2);

            return JsonSerializer.Serialize(new
            {
                type = "trade_event",
                accountId = BotAccountId,
                data = new
                {
                    ticket = ticket.ToString(),
                    signal_id = (string)null,
                    symbol,
                    type = side,
                    volume = lots,
                    entry_price = hasEntry ? (double?)Math.Round(entryPrice, 5) : null,
                    exit_price = hasExit ? (double?)Math.Round(exitPrice, 5) : null,
                    stop_loss = hasSl ? (double?)Math.Round(sl, 5) : null,
                    take_profit = hasTp ? (double?)Math.Round(tp, 5) : null,
                    profit = Math.Round(profit, 2),
                    status,
                    comment,
                    opened_at = openedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    closed_at = hasClosed ? (string)closedAt.ToString("yyyy-MM-ddTHH:mm:ssZ") : null
                }
            });
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static double NormalizeVolume(Symbol sym, double volume)
        {
            if (volume <= 0) return 0;
            double step = sym.VolumeInUnitsStep;
            double normalized = Math.Round(volume / step) * step;
            return Math.Max(sym.VolumeInUnitsMin, Math.Min(sym.VolumeInUnitsMax, normalized));
        }

        private static string GetStr(JsonElement el, string key) =>
            el.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String
                ? p.GetString() ?? string.Empty
                : string.Empty;

        private static double GetDouble(JsonElement el, string key) =>
            el.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.Number
                ? p.GetDouble()
                : 0.0;

        private void Log(string msg) => Print($"[TradePilot] {msg}");
    }
}
