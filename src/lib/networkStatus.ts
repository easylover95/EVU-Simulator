import { useCallback, useEffect, useRef, useState } from 'react';

export type NetworkStatus = 'checking' | 'online' | 'offline';

const PROBE_TIMEOUT_MS = 3_000;
const PROBE_HEADER = 'X-EVU-Network-Probe';

type RuntimeEvent = 'offline' | 'online' | 'probe-failed';

function postRuntimeEvent(event: RuntimeEvent): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'evu-runtime-event', event });
}

async function probeSameOrigin(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/manifest.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { [PROBE_HEADER]: '1' },
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Reports connectivity as a UI hint only. The local simulator remains usable
 * when offline; browser online status is verified against a same-origin probe
 * because navigator.onLine can be a false positive on captive/LAN networks.
 */
export function useNetworkStatus() {
  const initialStatus: NetworkStatus = typeof navigator === 'undefined' || !navigator.onLine ? 'offline' : 'checking';
  const [status, setStatus] = useState<NetworkStatus>(initialStatus);
  const statusRef = useRef<NetworkStatus>(initialStatus);
  const activeControllerRef = useRef<AbortController | null>(null);

  const updateStatus = useCallback((next: NetworkStatus) => {
    if (statusRef.current === next) return;
    const previous = statusRef.current;
    statusRef.current = next;
    setStatus(next);

    if (next === 'offline') postRuntimeEvent(previous === 'checking' ? 'probe-failed' : 'offline');
    if (next === 'online' && previous === 'offline') postRuntimeEvent('online');
  }, []);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      updateStatus('offline');
      return false;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    updateStatus('checking');
    const reachable = await probeSameOrigin(controller.signal);
    window.clearTimeout(timeout);

    if (activeControllerRef.current !== controller) return false;
    activeControllerRef.current = null;
    updateStatus(reachable ? 'online' : 'offline');
    return reachable;
  }, [updateStatus]);

  useEffect(() => {
    const onOffline = () => {
      activeControllerRef.current?.abort();
      updateStatus('offline');
    };
    const onOnline = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refresh();

    return () => {
      activeControllerRef.current?.abort();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, updateStatus]);

  return {
    status,
    isOffline: status === 'offline',
    refresh,
  };
}
