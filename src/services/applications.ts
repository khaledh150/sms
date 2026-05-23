// src/services/applications.ts — Admissions, changes, review
import { supabase } from "../supabaseClient";

export interface Application {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nick_name: string | null;
  dob: string | null;
  parent_email: string | null;
  parent_phone: number | null;
  courses: Record<string, any>;
  course_limits: Record<string, number>;
  status: string;
  created_at: string;
  payment_receipt_urls: string[] | null;
  submitted_by: string | null;
  purchased_packages: any;
  total_price: number | null;
}

export interface ApplicationChange {
  id: string;
  student_id: string;
  type: "renewal" | "edit" | "cancel";
  status: string;
  changes: Record<string, any>;
  created_at: string;
  receipt_urls: string[] | null;
  submitted_by: string | null;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  purchased_packages: any;
  total_price: number | null;
}

// Fetch pending applications
export async function fetchPendingApplications() {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Application[];
}

// Fetch pending application changes
export async function fetchPendingChanges() {
  const { data, error } = await supabase
    .from("application_changes")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ApplicationChange[];
}

// Count all pending reviews
export async function countPendingReviews() {
  const [apps, changes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("application_changes").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return (apps.count ?? 0) + (changes.count ?? 0);
}

// Approve applications
export async function approveApplications(ids: string[]) {
  const { error } = await supabase
    .from("applications")
    .update({ status: "approved" })
    .in("id", ids);
  if (error) throw error;
}

// Approve changes
export async function approveChanges(ids: string[]) {
  const { error } = await supabase
    .from("application_changes")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

// Reject (delete) applications
export async function rejectApplications(ids: string[]) {
  const { error } = await supabase
    .from("applications")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

// Reject (delete) changes
export async function rejectChanges(ids: string[]) {
  const { error } = await supabase
    .from("application_changes")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

export async function fetchPendingChangesForStudent(studentId: string) {
  const { data, error } = await supabase
    .from("application_changes")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApplicationChange[];
}

// Submit a new application
export async function submitApplication(data: {
  nick_name: string;
  first_name: string;
  last_name: string;
  dob: string;
  parent_phone: string;
  parent_line_id: string;
  courses: Record<string, any>;
  course_limits: Record<string, number>;
  payment_receipt_urls: string[];
  submitted_by?: string;
}) {
  const { error } = await supabase
    .from("applications")
    .insert([{ ...data, status: "pending" }]);
  if (error) throw error;
}

// Admin direct-enroll a student (bypass application)
export async function directEnrollStudent(data: {
  nick_name: string;
  first_name: string;
  last_name: string;
  dob: string;
  parent_phone: string;
  parent_line_id: string;
  courses: Record<string, any>;
  course_limits: Record<string, number>;
  payment_receipt_urls: string[];
}) {
  const { error } = await supabase.from("students").insert([{
    ...data,
    joined_at: new Date().toISOString(),
    status: "active",
  }]);
  if (error) throw error;
}

// Submit a change request (renewal/edit)
export async function submitChangeRequest(data: {
  student_id: string;
  type: "renewal" | "edit" | "cancel";
  changes: Record<string, any>;
  receipt_urls?: string[];
}) {
  const { error } = await supabase
    .from("application_changes")
    .insert([{ ...data, status: "pending" }]);
  if (error) throw error;
}

// Fetch application links
export async function fetchOrCreatePublicLink() {
  const { data: links } = await supabase
    .from("application_links")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  let link = links && links[0] && new Date(links[0].expires_at) > new Date()
    ? links[0]
    : null;
  if (!link) {
    await supabase
      .from("application_links")
      .update({ expires_at: new Date(Date.now() - 60_000) })
      .neq("expires_at", null as any);
    const { data: newLink } = await supabase
      .from("application_links")
      .insert([{ expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000) }])
      .select("*")
      .single();
    link = newLink;
  }
  return `${window.location.origin}/apply/${link.id}`;
}

// Upload receipt files, returns public URLs
export async function uploadReceipts(files: File[]) {
  const urls: string[] = [];
  for (const f of files) {
    const fn = `${Date.now()}-${Math.random().toString(36).slice(2)}.${f.name.split(".").pop()}`;
    const { data: u, error } = await supabase.storage
      .from("receipts")
      .upload(fn, f, { cacheControl: "3600" });
    if (error) throw error;
    const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
    urls.push(pu.publicUrl);
  }
  return urls;
}
