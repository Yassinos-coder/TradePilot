import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Loader2, Terminal, Wifi, WifiOff } from 'lucide-react';

import { clientEnv } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface EaSocketDemoCardProps {
  apiKey?: string;
}

interface SocketMessage {
  type: string;
  message?: string;
  timestamp?: number;
}

const STATE_TONE: Record<
  ConnectionState,
  'positive' | 'warning' | 'danger' | 'neutral'
> = {
  connected: 'positive',
  connecting: 'warning',
  error: 'danger',
  closed: 'neutral',
  idle: 'neutral',
};

function resolveWebSocketOrigin(rawValue: string) {
  if (!rawValue || rawValue === 'auto') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  if (rawValue.startsWith('http://')) {
    return rawValue.replace(/^http:\/\//, 'ws://');
  }

  if (rawValue.startsWith('https://')) {
    return rawValue.replace(/^https:\/\//, 'wss://');
  }

  return rawValue;
}

export function EaSocketDemoCard({ apiKey }: EaSocketDemoCardProps) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [log, setLog] = useState<string[]>([]);

  const wsUrl = useMemo(
    () => `${resolveWebSocketOrigin(clientEnv.VITE_WS_BASE_URL).replace(/\/$/, '')}/ws/ea`,
    [],
  );

  const append = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setLog((previous) => [`${timestamp}  ${message}`, ...previous].slice(0, 10));
  };

  const handleMessage = useEffectEvent((event: MessageEvent<string>) => {
    let payload: SocketMessage;

    try {
      payload = JSON.parse(event.data) as SocketMessage;
    } catch {
      append('<- non-JSON payload');
      return;
    }

    switch (payload.type) {
      case 'auth_success':
        setStatus('connected');
        append('<- auth_success');
        break;
      case 'error':
        setStatus('error');
        append(`<-- error: ${payload.message ?? 'Unknown error'}`);
        break;
      case 'ping':
        append('<- ping');
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'pong',
              timestamp: payload.timestamp ?? Date.now(),
            }),
          );
          append('-> pong');
        }
        break;
      case 'pong':
        append('<- pong');
        break;
      case 'signal':
        append('<- signal received');
        break;
      default:
        append(`<-- ${payload.type}`);
        break;
    }
  });

  useEffect(() => {
    if (!socket) {
      return;
    }

    socket.onmessage = handleMessage;
    socket.onclose = () => {
      setStatus('closed');
      append('connection closed');
      setSocket(null);
    };
    socket.onerror = () => {
      setStatus('error');
      append('transport error');
    };

    return () => {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };
  }, [socket, handleMessage]);

  useEffect(() => {
    if (!socket || status !== 'connected') {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        append('-> ping');
      }
    }, 12_000);

    return () => clearInterval(intervalId);
  }, [socket, status]);

  useEffect(() => {
    return () => socket?.close();
  }, [socket]);

  const connect = () => {
    if (!apiKey || socket) {
      return;
    }

    const nextSocket = new WebSocket(wsUrl);
    setStatus('connecting');
    append(`-> connecting to ${wsUrl}`);

    nextSocket.onopen = () => {
      append('-> auth');
      nextSocket.send(JSON.stringify({ type: 'auth', apiKey }));
    };

    setSocket(nextSocket);
  };

  const disconnect = () => {
    socket?.close();
    setSocket(null);
    setStatus('closed');
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <Card
      title="EA WebSocket Demo"
      eyebrow="Realtime"
      description="Simulate a MetaTrader EA connecting from the browser."
      actions={
        <Badge tone={STATE_TONE[status]} dot>
          {status}
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={connect} disabled={!apiKey || Boolean(socket)}>
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
          {!apiKey ? (
            <span className="text-xs text-gray-400 dark:text-slate-500">
              Rotate your API key to enable the demo socket
            </span>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-slate-700">
            <Terminal className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
              Protocol log
            </span>
            {isConnected ? (
              <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                live
              </span>
            ) : null}
          </div>
          <div className="h-36 space-y-1 overflow-y-auto p-3">
            {log.length > 0 ? (
              log.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="text-xs font-mono text-gray-600 dark:text-slate-400"
                >
                  {line}
                </p>
              ))
            ) : (
              <p className="text-xs italic text-gray-400 dark:text-slate-600">
                No activity yet. Click Connect to begin the EA handshake.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
