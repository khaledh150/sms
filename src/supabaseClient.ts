// src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_KEY!
);

// 👉 expose for console debugging
declare global {
  interface Window { supabase: typeof supabase }
}
if (typeof window !== "undefined") {
  window.supabase = supabase;
}
