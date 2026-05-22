// src/services/attendance.ts — Attendance check-in/out, pending approval
import { supabase } from "../supabaseClient";

export interface AttendanceRow {
  id: string;
  student_id: string;
  course_id: string | null;
  attended_at_ts: string;
  approved_by: string | null;
}

// Today's date string (YYYY-MM-DD)
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Fetch today's attendance records
export async function fetchTodayAttendance() {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .gte("attended_at_ts", todayStr());
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

// Fetch attendance for a student (all time)
export async function fetchStudentAttendance(studentId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("student_id", studentId)
    .order("attended_at_ts", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

// Fetch attendance for a student+course combo
export async function fetchStudentCourseAttendance(studentId: string, courseId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("attended_at_ts", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

// Check in a student (manual, instant approval)
export async function checkIn(
  studentId: string,
  courseId: string,
  approverId: string
) {
  const { data, error } = await supabase
    .from("attendance")
    .insert({
      student_id: studentId,
      course_id: courseId,
      attended_at_ts: todayStr(),
      approved_by: approverId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AttendanceRow;
}

// QR scan — insert pending (no course, no approver)
export async function scanCheckIn(studentId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .insert({
      student_id: studentId,
      course_id: null,
      attended_at_ts: todayStr(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as AttendanceRow;
}

// Approve a pending check-in
export async function approvePending(
  rowId: string,
  courseId: string,
  approverId: string
) {
  const { error } = await supabase
    .from("attendance")
    .update({ course_id: courseId, approved_by: approverId })
    .eq("id", rowId);
  if (error) throw error;
}

// Delete an attendance record (undo)
export async function deleteAttendance(rowId: string) {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("id", rowId);
  if (error) throw error;
}

// Get used hours count for a student+course
export async function getUsedHours(studentId: string, courseId: string) {
  const { count, error } = await supabase
    .from("attendance")
    .select("*", { head: true, count: "exact" })
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .not("approved_by", "is", null);
  if (error) throw error;
  return count ?? 0;
}
