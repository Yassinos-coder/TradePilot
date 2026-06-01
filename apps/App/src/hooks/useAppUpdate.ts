import { useEffect, useMemo, useState } from 'react';

type VersionManifest = {
  version: string;
  buildId: string;
  builtAt: string;
};

const UPDATE_CHECK_INTERVAL_MS = 60_000;

const currentManifest: VersionManifest = {
  version: __APP_VERSION__,
  buildId: __APP_BUILD_ID__,
  builtAt: __APP_BUILT_AT__,
};

async function fetchVersionManifest(): Promise<VersionManifest | null> {
  const manifestUrl = new URL('/version.json', window.location.origin);
  manifestUrl.searchParams.set('ts', Date.now().toString());

  try {
    const response = await fetch(manifestUrl.toString(), {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<VersionManifest>;

    if (
      typeof payload.version !== 'string' ||
      typeof payload.buildId !== 'string' ||
      typeof payload.builtAt !== 'string'
    ) {
      return null;
    }

    return {
      version: payload.version,
      buildId: payload.buildId,
      builtAt: payload.builtAt,
    };
  } catch {
    return null;
  }
}

async function clearClientCaches() {
  if ('caches' in window) {
    const cacheKeys = await window.caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

export function useAppUpdate() {
  const [availableManifest, setAvailableManifest] = useState<VersionManifest | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    let active = true;

    const runCheck = async () => {
      const nextManifest = await fetchVersionManifest();

      if (!active || !nextManifest) {
        return;
      }

      if (nextManifest.buildId !== currentManifest.buildId) {
        setAvailableManifest((previous) =>
          previous?.buildId === nextManifest.buildId ? previous : nextManifest,
        );
      }
    };

    void runCheck();
    const intervalId = window.setInterval(() => {
      void runCheck();
    }, UPDATE_CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runCheck();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const hasUpdate =
    availableManifest !== null && availableManifest.buildId !== dismissedBuildId;

  const dismiss = () => {
    if (availableManifest) {
      setDismissedBuildId(availableManifest.buildId);
    }
  };

  const refreshToLatest = async () => {
    setIsRefreshing(true);

    try {
      await clearClientCaches();
    } finally {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('refresh', Date.now().toString());
      window.location.replace(nextUrl.toString());
    }
  };

  return useMemo(
    () => ({
      currentManifest,
      availableManifest,
      hasUpdate,
      isRefreshing,
      dismiss,
      refreshToLatest,
    }),
    [availableManifest, hasUpdate, isRefreshing],
  );
}
