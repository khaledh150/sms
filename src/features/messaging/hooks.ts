import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../supabaseClient";
import type { LineConfig, LineMessage, LineConnection, UnlinkedUser } from "./types";

export function useLineConfig() {
  return useQuery({
    queryKey: ["line_config"],
    queryFn: async () => {
      const { data } = await supabase.from("line_config").select("*").limit(1).single();
      return data as LineConfig | null;
    },
    staleTime: 300_000,
  });
}

export function useLineMessages() {
  return useQuery({
    queryKey: ["line_messages"],
    queryFn: async () => {
      const { data } = await supabase.from("line_messages").select("*").order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as LineMessage[];
    },
    staleTime: 30_000,
  });
}

export function useLineConnections() {
  return useQuery({
    queryKey: ["line_connections"],
    queryFn: async () => {
      const { data } = await supabase.from("line_connections").select("*");
      return (data ?? []) as LineConnection[];
    },
    staleTime: 60_000,
  });
}

export function useEnrollments() {
  return useQuery({
    queryKey: ["enrollments_active"],
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("student_id, course_id").eq("status", "active");
      return (data ?? []) as { student_id: string; course_id: string }[];
    },
    staleTime: 120_000,
  });
}

export function useUnlinkedLineUsers() {
  return useQuery({
    queryKey: ["unlinked_line_users"],
    queryFn: async () => {
      const { data } = await supabase.from("unlinked_line_users").select("*").order("created_at", { ascending: false });
      return (data ?? []) as UnlinkedUser[];
    },
    staleTime: 30_000,
  });
}
