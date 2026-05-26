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
  photo_url: string | null;
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
    .select("id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status,qr_code_url,photo_url")
    .order("joined_at", { ascending: false });
  if (activeOnly) query = query.or("status.eq.active,status.is.null");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Student[];
}

export async function fetchAllStudents() { return fetchStudents(false); }

export async function fetchInactiveStudents() {
  const { data, error } = await supabase.from("students")
    .select("id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status,qr_code_url,photo_url")
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

export interface RenewalStudent {
  enrollment_id: string;
  student_id: string;
  course_id: string;
  purchased_hours: number;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  course_name: string;
  hours_used: number;
  hours_remaining: number;
}

export async function fetchRenewalStudents() {
  const { data, error } = await supabase
    .from("renewal_students")
    .select("*")
    .lte("hours_remaining", 2)
    .order("hours_remaining");
  if (error) throw error;
  return (data ?? []) as RenewalStudent[];
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
  photo_url: string | null;
}

export async function fetchAllEnrolledStudents() {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, student_id, course_id, purchased_hours, initial_used_hours, schedule, students(id, first_name, last_name, nick_name, qr_code_url, photo_url), courses(id, name)")
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
    photo_url: r.students?.photo_url ?? null,
  })) as EnrolledStudent[];
}

// Fetch students with their latest check-in and hour status for the 3-tab view
export interface StudentWithStatus extends Student {
  last_checkin: string | null;
  total_purchased: number;
  total_used: number;
  tab: "active" | "notActive" | "finished";
}

export async function fetchStudentsWithStatus(): Promise<StudentWithStatus[]> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [studentsRes, enrollmentsRes, attendanceRes, hourSummaryRes] = await Promise.all([
    supabase
      .from("students")
      .select("id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status,qr_code_url,photo_url")
      .or("status.eq.active,status.is.null")
      .order("joined_at", { ascending: false }),
    supabase
      .from("enrollments")
      .select("student_id, purchased_hours, initial_used_hours")
      .eq("status", "active"),
    // Only fetch last 2 weeks of attendance — older = "not active" anyway
    supabase
      .from("attendance")
      .select("student_id, attended_at_ts")
      .is("cancelled_by", null)
      .not("approved_by", "is", null)
      .gte("attended_at_ts", twoWeeksAgo)
      .order("attended_at_ts", { ascending: false }),
    supabase
      .from("student_course_attendance_summary")
      .select("student_id, total_hours"),
  ]);

  if (studentsRes.error) throw studentsRes.error;

  const purchasedMap = new Map<string, number>();
  const initialUsedMap = new Map<string, number>();
  (enrollmentsRes.data ?? []).forEach((e: any) => {
    purchasedMap.set(e.student_id, (purchasedMap.get(e.student_id) || 0) + (e.purchased_hours || 0));
    initialUsedMap.set(e.student_id, (initialUsedMap.get(e.student_id) || 0) + (e.initial_used_hours || 0));
  });

  const usedMap = new Map<string, number>();
  (hourSummaryRes.data ?? []).forEach((h: any) => {
    usedMap.set(h.student_id, (usedMap.get(h.student_id) || 0) + (h.total_hours || 0));
  });

  const lastCheckinMap = new Map<string, string>();
  (attendanceRes.data ?? []).forEach((a: any) => {
    if (!lastCheckinMap.has(a.student_id)) lastCheckinMap.set(a.student_id, a.attended_at_ts);
  });

  return (studentsRes.data ?? []).map((s: any) => {
    const totalPurchased = purchasedMap.get(s.id) || 0;
    const totalUsed = (usedMap.get(s.id) || 0) + (initialUsedMap.get(s.id) || 0);
    const lastCheckin = lastCheckinMap.get(s.id) || null;

    let tab: "active" | "notActive" | "finished" = "active";
    if (totalPurchased > 0 && totalUsed >= totalPurchased) {
      tab = "finished";
    } else if (!lastCheckin) {
      tab = "notActive";
    }

    return { ...s, last_checkin: lastCheckin, total_purchased: totalPurchased, total_used: totalUsed, tab };
  }) as StudentWithStatus[];
}

// Enrollment history
export interface EnrollmentHistoryRecord {
  id: string;
  student_id: string;
  course_id: string;
  course_name: string;
  purchased_hours: number;
  used_hours: number;
  price: number | null;
  book_info: string | null;
  receipt_url: string | null;
  renewed_at: string;
}

export async function fetchEnrollmentHistory(studentId: string) {
  const { data, error } = await supabase
    .from("enrollment_history")
    .select("id,student_id,course_id,course_name,purchased_hours,used_hours,price,book_info,receipt_url,renewed_at")
    .eq("student_id", studentId)
    .order("renewed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnrollmentHistoryRecord[];
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
