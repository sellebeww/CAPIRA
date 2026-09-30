import { useEffect, useState } from 'react';

/** Minimal hash router (works offline & on static hosting). '#/result/5' → ['result', ['5']]. */
export function parseHash(hash: string): [string, string[]] {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return [parts[0] ?? '', parts.slice(1)];
}

export function useRoute(): [string, string[]] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}

export function go(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}
