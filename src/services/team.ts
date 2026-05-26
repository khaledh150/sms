import { supabase } from "../supabaseClient";
import type { Profile, UserRole } from "../types";

export async function fetchTeamProfiles(
  schoolId: string | undefined,
  userRole: UserRole,
  userId: string
): Promise<Profile[]> {
  let query = supabase
    .from("profiles")
    .select("id,email,full_name,role,username")
    .order("role", { ascending: false });
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query;
  if (error) throw error;

  const isOwner = userRole === "owner" || userRole === "superadmin";
  const isAdmin = isOwner || userRole === "admin";
  let filtered = (data as Profile[]).filter(p => p.role !== "superadmin");
  if (!isAdmin) filtered = filtered.filter(p => p.id === userId);
  else if (!isOwner) filtered = filtered.filter(p => p.role !== "owner");
  return filtered;
}

export async function inviteStaffUser(params: {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "staff";
}) {
  const { error } = await supabase.rpc("create_staff_user", {
    p_email: params.email,
    p_password: params.password,
    p_full_name: params.fullName,
    p_role: params.role,
  });
  if (error) throw error;
}

export async function updateStaffMember(params: {
  id: string;
  fullName: string;
  role: UserRole;
  username?: string;
  password?: string;
}) {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: params.fullName, role: params.role })
    .eq("id", params.id);
  if (error) throw error;

  if (params.username) {
    const { error: unErr } = await supabase.rpc("update_staff_username", {
      p_user_id: params.id,
      p_new_username: params.username,
    });
    if (unErr) throw unErr;
  }

  if (params.password) {
    const { error: pwErr } = await supabase.rpc("update_staff_password", {
      p_user_id: params.id,
      p_new_password: params.password,
    });
    if (pwErr) throw pwErr;
  }
}

export async function deleteStaffMember(id: string) {
  await supabase.from("profiles").delete().eq("id", id);
}
