// src/services/students.ts — Student + Enrollment queries (normalized)
import { supabase } from "../supabaseClient";


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
  initial_used_hours: number;
  schedule: Record<string, string[]>;
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
  schedule: Record<string, string[]>;
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
    .order("course_name");
  if (error) throw error;
  return (data ?? []) as ExpectedStudent[];
}

// Fetch enrolled students for a course
export async function fetchStudentsForCourse(courseId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, student_id, purchased_hours, schedule, students(id, first_name, last_name, nick_name, qr_code_url)")
    .eq("course_id", courseId)
    .eq("status", "active");
  if (error) throw error;
  return data ?? [];
}

export interface EnrolledStudent {
  enrollment_id: string;
  student_id: string;
  course_id: string;
  course_name: string;
  purchased_hours: number;
  initial_used_hours: number;
  schedule: Record<string, string[]>;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  qr_code_url: string | null;
}

export async function fetchAllEnrolledStudents() {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, student_id, course_id, purchased_hours, initial_used_hours, schedule, students(id, first_name, last_name, nick_name, qr_code_url), courses(id, name)")
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    enrollment_id: r.id,
    student_id: r.student_id,
    course_id: r.course_id,
    course_name: r.courses?.name ?? "",
    purchased_hours: r.purchased_hours ?? 0,
    initial_used_hours: r.initial_used_hours ?? 0,
    schedule: r.schedule ?? {},
    first_name: r.students?.first_name ?? "",
    last_name: r.students?.last_name ?? "",
    nick_name: r.students?.nick_name ?? null,
    qr_code_url: r.students?.qr_code_url ?? null,
  })) as EnrolledStudent[];
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
