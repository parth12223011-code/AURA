"use client";

import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthLoadingScreen() {
  return (
    <main className="auth-loading" aria-live="polite">
      <div className="auth-loading-orb" aria-hidden="true">A</div>
      <p>Getting AURA ready…</p>
    </main>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const isSignInPage = pathname === "/sign-in";

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  useEffect(() => {
    if (loading) return;
    if (user && isSignInPage) router.replace("/");
    if (!user && !isSignInPage) router.replace("/sign-in");
  }, [isSignInPage, loading, router, user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signOut: () => firebaseSignOut(auth),
  }), [loading, user]);

  const waitingForRoute = (user && isSignInPage) || (!user && !isSignInPage);

  return (
    <AuthContext.Provider value={value}>
      {loading || waitingForRoute ? <AuthLoadingScreen /> : children}
    </AuthContext.Provider>
  );
}

export function useAuraAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuraAuth must be used inside AuthProvider.");
  return context;
}
