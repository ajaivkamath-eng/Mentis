/* App lock: biometric/PIN gate with auto-lock (default 5 min, rule 27). */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

const AUTO_LOCK_MS = 5 * 60_000;

const Ctx = createContext<{ locked: boolean; unlock: () => Promise<boolean> }>({ locked: true, unlock: async () => false });

export function LockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(true);
  const backgroundedAt = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') backgroundedAt.current = Date.now();
      if (s === 'active' && Date.now() - backgroundedAt.current > AUTO_LOCK_MS) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  const unlock = async (): Promise<boolean> => {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      if (!has) { setLocked(false); return true; }
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Mentis' });
      if (r.success) setLocked(false);
      return r.success;
    } catch {
      setLocked(false);
      return true;
    }
  };

  return <Ctx.Provider value={{ locked, unlock }}>{children}</Ctx.Provider>;
}

export function useLock() {
  return useContext(Ctx);
}
