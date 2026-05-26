import { supabase } from "../supabaseClient";
import type { Notification } from "../types";

export async function fetchNotifications(): Promise<{ notifications: Notification[]; count: number }> {
  const { data, count } = await supabase
    .from("notifications")
    .select("id,type,payload,student_id,read,created_at,students(nick_name,first_name)", { count: "exact" })
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const notifications = (data ?? []).map((n: any) => ({
    ...n,
    student_name: n.students?.nick_name || n.students?.first_name || "",
    students: undefined,
  })) as Notification[];

  return { notifications, count: count || 0 };
}

export async function markNotificationRead(id: string) {
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function markAllNotificationsRead() {
  await supabase.from("notifications").update({ read: true }).eq("read", false);
}
