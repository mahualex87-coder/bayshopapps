import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { ActionResult, DemoAction, DemoContextValue, DemoState, RegistrationInput } from './contracts';
import { authenticateDemo, makeInitialState, restoreDemoState, transition, validateRegistration } from './demo';

const STORAGE_KEY = '@bayshop/prototype/domain-v2';
const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(makeInitialState);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const current = useRef(state);
  const readyRef = useRef(false);
  const authenticatedRef = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!active) return;
      if (raw) {
        let restored: DemoState | null = null;
        try { restored = restoreDemoState(JSON.parse(raw)); } catch { /* Recover with fresh fixtures below. */ }
        if (restored) { current.current = restored; setState(restored); }
        else setPersistenceError('Datele salvate nu au putut fi citite. Am restaurat starea inițială.');
      }
    }).catch(() => {
      if (active) setPersistenceError('Memoria locală nu este disponibilă. Modificările pot dispărea la închidere.');
    }).finally(() => { if (active) { readyRef.current = true; setReady(true); } });
    return () => { active = false; };
  }, []);

  const commit = useCallback((next: DemoState) => {
    current.current = next; setState(next);
    const serialized = JSON.stringify(next);
    // Queue writes so two quick actions cannot persist in the wrong order.
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, serialized)).then(() => {
      setPersistenceError(null);
    }).catch(() => {
      setPersistenceError('Modificarea funcționează în această sesiune, dar nu s-a putut salva pe dispozitiv.');
    });
  }, []);

  const dispatch = useCallback((action: DemoAction): ActionResult => {
    if (!readyRef.current) return { ok: false, error: 'Datele se încarcă. Încearcă din nou într-un moment.' };
    if (!authenticatedRef.current) return { ok: false, error: 'Intră în cont pentru a continua.' };
    const next = transition(current.current, action);
    if (next.result.ok) commit(next.state);
    return next.result;
  }, [commit]);
  const enterDemo = useCallback(() => {
    if (!readyRef.current) return;
    authenticatedRef.current = true; setAuthenticated(true);
  }, []);
  const login = useCallback((email: string, password: string): ActionResult => {
    if (!readyRef.current) return { ok: false, error: 'Așteaptă încărcarea datelor.' };
    const result = authenticateDemo(email, password);
    if (result.ok) enterDemo();
    return result;
  }, [enterDemo]);
  const logout = useCallback(() => { authenticatedRef.current = false; setAuthenticated(false); }, []);
  const register = useCallback((input: RegistrationInput): ActionResult => {
    if (!readyRef.current) return { ok: false, error: 'Așteaptă încărcarea datelor.' };
    const validation = validateRegistration(input);
    if (!validation.ok) return validation;
    // The exercise password is deliberately discarded, never persisted or sent.
    const next = transition(current.current, { type: 'updateProfile', input: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim().toLowerCase(), phone: input.phone.trim() } });
    if (next.result.ok) { commit(next.state); enterDemo(); }
    return next.result;
  }, [commit, enterDemo]);

  return <DemoContext.Provider value={{ state, ready, authenticated, persistenceError, dispatch, login, enterDemo, logout, register }}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo trebuie folosit în DemoProvider.');
  return value;
}
