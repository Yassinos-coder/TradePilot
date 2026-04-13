import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Terminal, Wifi, WifiOff, Loader2 } from 'lucide-react';

import { clientEnv } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface EaSocketDemoCardProps {
  apiKey?: string;
}

const STATE_TONE: Record<ConnectionState, 'positive' | 'warning' | 'danger' | 'neutral'> = {
  connected: 'positive',
  connecting: 'warning',
  error: 'danger',
  closed: 'neutral',
  idle: 'neutral',
};

export function EaSocketDemoCard({ apiKey }: EaSocketDemoCardProps) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [log, setLog] = useState<string[]>([]);

  const wsUrl = useMemo(
    () => `${clientEnv.VITE_WS_BASE_URL.replace(/\/$/, '')}/ws/ea`,
    [],
  );

  const append = (msg: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog((prev) => [`${ts}  ${msg}`, ...prev].slice(0, 10));
  };

  const handleMessage = useEffectEvent((event: MessageEvent<string>) => {
    let payload: { type: string; message?: string };
    try {
      payload = JSON.parse(event.data) as { type: string; message?: string };
    } catch {
      append('← non-JSON payload');
      return;
    }
    switch (payload.type) {
      case 'auth_success': setStatus('connected'); append('← auth_success'); break;
      case 'auth_error':   setStatus('error');     append(`← auth_error: ${payload.message ?? ''}`); break;
      case 'pong':                                  append('← pong'); break;
      case 'signal':                                append('← signal received'); break;
      default:                                      append(`← ${payload.type}`);
    }
  });

  useEffect(() => {
    if (!socket) return;
    socket.onmessage = handleMessage;
    socket.onclose = () => { setStatus('closed'); append('connection closed'); setSocket(null); };
    socket.onerror = () => { setStatus('error'); append('transport error'); };
    return () => { socket.onmessage = null; socket.onclose = null; socket.onerror = null; };
  }, [socket, handleMessage]);

  // Heartbeat every 12 s when connected
  useEffect(() => {
    if (!socket || status !== 'connected') return;
    const id = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
        append('→ ping');
      }
    }, 12_000);
    return () => clearInterval(id);
  }, [socket, status]);

  useEffect(() => () => socket?.close(), [socket]);

  const connect = () => {
    if (!apiKey || socket) return;
    const ws = new WebSocket(wsUrl);
    setStatus('connecting');
    append(`→ connecting to ${wsUrl}`);
    ws.onopen = () => {
      append('→ auth');
      ws.send(JSON.stringify({ type: 'auth', apiKey }));
    };
    setSocket(ws);
  };

  const disconnect = () => { socket?.close(); setSocket(null); setStatus('closed'); };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <Card
      title="EA WebSocket Demo"
      eyebrow="Realtime"
      description="Simulate a MetaTrader EA connecting from the browser."
      actions={<Badge tone={STATE_TONE[status]} dot>{status}</Badge>}
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={connect}
            disabled={!apiKey || Boolean(socket)}
          >
            {isConnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            Connect
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={disconnect}
            disabled={!socket}
          >
            <WifiOff className="h-3.5 w-3.5" />
            Disconnect
          </Button>
          {!apiKey && (
            <span className="text-xs text-gray-400 dark:text-slate-500">
              Rotate your API key to enable
            </span>
          )}
        </div>

        {/* Protocol log */}
        <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 px-3 py-2">
            <Terminal className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
              Protocol log
            </span>
            {isConnected && (
              <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}
          </div>
          <div className="h-36 overflow-y-auto p-3 space-y-1">
            {log.length > 0 ? (
              log.map((line, i) => (
                <p key={i} className="text-xs font-mono text-gray-600 dark:text-slate-400">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-xs text-gray-400 dark:text-slate-600 italic">
                No activity yet — click Connect to begin.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
