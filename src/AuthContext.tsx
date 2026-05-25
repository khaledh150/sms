// src/AuthContext.tsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
} from "react";
import { supabase } from "./supabaseClient";
import { queryClient } from "./queryClient";

/* ---------- types ---------- */
export interface User {
  id: string;
  email: string | null;
  role: "superadmin" | "owner" | "admin" | "staff";
  school_id: string | null;
  full_name: string | null;
  username: string | null;
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
      if (session?.user) {
        if (event === "SIGNED_IN") {
          queryClient.clear();
        }
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
      .select("role,school_id,full_name,username")
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
      role: (data?.role as "superadmin" | "owner" | "admin" | "staff") ?? "staff",
      school_id: data?.school_id ?? null,
      full_name: data?.full_name ?? null,
      username: data?.username ?? null,
    });
    setLoading(false);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
