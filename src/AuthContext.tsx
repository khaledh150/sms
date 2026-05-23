// src/AuthContext.tsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
} from "react";
import { supabase } from "./supabaseClient";

/* ---------- types ---------- */
export interface User {
  id: string;
  email: string | null;
  role: "admin" | "staff";
}

/* ---------- context ---------- */
export const AuthCtx = createContext<{
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
}>({ user: null, loading: true, setUser: () => {} });

/* ---------- hook (convenience) ---------- */
export function useAuth() {
  return useContext(AuthCtx);
}

/* ---------- provider ---------- */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile({
          id: session.user.id,
          email: session.user.email ?? null,
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(supaUser: { id: string; email: string | null }) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", supaUser.id)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("loadProfile error", error);
      setLoading(false);
      return;
    }
    setUser({
      id: supaUser.id,
      email: supaUser.email,
      role: (data?.role as "admin" | "staff") ?? "staff",
    });
    setLoading(false);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
