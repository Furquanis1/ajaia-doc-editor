import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Demo identities. These mirror the users seeded in `server/db.js`.
 * Phase 4 (real auth) will replace this with a login flow.
 */
export const DEMO_USERS = [
  { id: 1, name: 'Alice', email: 'alice@demo.com', color: 'bg-rose-500' },
  { id: 2, name: 'Bob', email: 'bob@demo.com', color: 'bg-sky-500' },
  { id: 3, name: 'Charlie', email: 'charlie@demo.com', color: 'bg-amber-500' },
];

const STORAGE_KEY = 'ajaia.activeUserId';
const DEFAULT_USER_ID = 1;

const AuthContext = createContext(null);

function readStoredUserId() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return DEMO_USERS.some((user) => user.id === stored)
      ? stored
      : DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

export function AuthProvider({ children }) {
  const [activeUserId, setActiveUserIdState] = useState(readStoredUserId);

  const setActiveUserId = useCallback((userId) => {
    const nextId = Number(userId);
    if (!DEMO_USERS.some((user) => user.id === nextId)) return;

    setActiveUserIdState(nextId);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextId));
    } catch {
      // Private browsing / disabled storage: in-memory state still works.
    }
  }, []);

  const activeUser =
    DEMO_USERS.find((user) => user.id === activeUserId) ?? DEMO_USERS[0];

  const value = useMemo(
    () => ({
      activeUserId,
      activeUser,
      users: DEMO_USERS,
      setActiveUserId,
    }),
    [activeUserId, activeUser, setActiveUserId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
