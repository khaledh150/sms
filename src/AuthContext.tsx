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
  setUser: (u: User | null) => void;
}>({ user: null, setUser: () => {} });

/* ---------- hook (convenience) ---------- */
export function useAuth() {
  return useContext(AuthCtx);
}

/* ---------- provider ---------- */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) loadProfile({
        id: data.session.user.id,
        email: data.session.user.email ?? null // <-- Convert undefined to null
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) loadProfile({
        id: session.user.id,
        email: session.user.email ?? null // <-- Convert undefined to null
      });
      else setUser(null);
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
      return;
    }
    setUser({
      id: supaUser.id,
      email: supaUser.email,
      role: (data?.role as "admin" | "staff") ?? "staff",
    });
  }

  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
