import { useEffect, useState } from 'react';

export function useDeviceStatus() {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let active = true;
    navigator.serviceWorker?.ready.then(() => { if (active) setReady(true); }).catch(() => undefined);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      active = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const offlineLabel = ready ? 'Ready offline' : import.meta.env.DEV ? 'Development mode' : !('serviceWorker' in navigator) ? 'Offline not supported' : 'Offline not ready';
  return { ready, online, offlineLabel };
}
