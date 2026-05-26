// src/services/auth.ts — Auth, profile, role checking
import { supabase } from "../supabaseClient";

export type { Profile } from "../types";
import type { Profile } from "../types";

// Get current auth user
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// Get current user's profile
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data as Profile;
}

// Sign in
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Update avatar
export async function updateAvatar(userId: string, file: File) {
  const ext = file.name.split(".").pop();
  const path = `${userId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatar_url = urlData.publicUrl;
  const { error: dbError } = await supabase
    .from("profiles")
    .update({ avatar_url })
    .eq("id", userId);
  if (dbError) throw dbError;
  return avatar_url;
}

// Fetch all profiles (admin)
export async function fetchAllProfiles() {
  const { data, error } = await supabase.rpc("list_all_profiles");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

// Fetch unread notification count
export async function fetchUnreadCount() {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { head: true, count: "exact" })
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}
