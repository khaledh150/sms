// src/services/students.ts — Student + Enrollment queries (normalized)
import { supabase } from "../supabaseClient";
import { parseCourseLimit } from "../utils";

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  dob: string | null;
  parent_phone: string | null;
  parent_line_id: string | null;
  joined_at: string | null;
  status: string | null;
  qr_code_url: string | null;
  avatar_url?: string | null;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  purchased_hours: number;
  weekday: string | null;
  time_slot: string | null;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  courses?: { id: string; name: string };
}

export interface ExpectedStudent {
  enrollment_id: string;
  student_id: string;
  course_id: string;
  weekday: string;
  time_slot: string;
  purchased_hours: number;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  qr_code_url: string | null;
  course_name: string;
  hours_used: number;
  hours_remaining: number;
}

// Fetch all students (basic list)
export async function fetchStudents(activeOnly = true) {
  let query = supabase
    .from("students")
    .select("id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status,qr_code_url")
    .order("joined_at", { ascending: false });
  if (activeOnly) query = query.or("status.eq.active,status.is.null");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Student[];
}

export async function fetchAllStudents() { return fetchStudents(false); }

export async function fetchInactiveStudents() {
  const { data, error } = await supabase.from("students")
    .select("id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status,qr_code_url")
    .eq("status", "inactive").order("joined_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Student[];
}

export async function fetchStudent(id: string) {
  const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Student;
}

// Fetch enrollments for a student (with course name) — uses enrollments table
export async function fetchStudentEnrollments(studentId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("*, courses(id, name)")
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Enrollment[];
}

// Fetch students expected today (from DB view)
export async function fetchExpectedToday() {
  const { data, error } = await supabase
    .from("expected_students_today")
    .select("*")
    .order("time_slot");
  if (error) throw error;
  return (data ?? []) as ExpectedStudent[];
}

// Fetch enrolled students for a course
export async function fetchStudentsForCourse(courseId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, student_id, purchased_hours, weekday, time_slot, students(id, first_name, last_name, nick_name, qr_code_url)")
    .eq("course_id", courseId)
    .eq("status", "active");
  if (error) throw error;
  return data ?? [];
}

// Delete a student
export async function deleteStudent(id: string) {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) throw error;
}

// Student notes
export async function fetchStudentNotes(studentId: string) {
  const { data, error } = await supabase
    .from("student_notes")
    .select("*, profiles:created_by(full_name)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addStudentNote(studentId: string, createdBy: string, note: string, category = "general") {
  const { data, error } = await supabase
    .from("student_notes")
    .insert([{ student_id: studentId, created_by: createdBy, note, category }])
    .select().single();
  if (error) throw error;
  return data;
}
