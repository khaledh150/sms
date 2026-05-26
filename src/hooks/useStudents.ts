import { useQuery } from "@tanstack/react-query";
import { STALE } from "../constants";
import {
  fetchStudents,
  fetchAllStudents,
  fetchInactiveStudents,
  fetchStudent,
  fetchStudentEnrollments,
  fetchStudentsForCourse,
  fetchStudentNotes,
  fetchExpectedToday,
  fetchAllEnrolledStudents,
  fetchRenewalStudents,
  fetchStudentsWithStatus,
  fetchEnrollmentHistory,
} from "../services/students";

export function useStudents(activeOnly = true) {
  return useQuery({
    queryKey: ["students", activeOnly ? "active" : "all"],
    queryFn: () => (activeOnly ? fetchStudents() : fetchAllStudents()),
    staleTime: STALE.NORMAL,
  });
}

export function useInactiveStudents() {
  return useQuery({
    queryKey: ["students", "inactive"],
    queryFn: fetchInactiveStudents,
    staleTime: STALE.NORMAL,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["student", id],
    queryFn: () => fetchStudent(id!),
    enabled: !!id,
    staleTime: STALE.NORMAL,
  });
}

export function useStudentEnrollments(studentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollments", studentId],
    queryFn: () => fetchStudentEnrollments(studentId!),
    enabled: !!studentId,
    staleTime: STALE.NORMAL,
  });
}

export function useExpectedToday() {
  return useQuery({
    queryKey: ["expected_today"],
    queryFn: fetchExpectedToday,
    staleTime: STALE.FAST,
  });
}

export function useStudentsForCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: ["students_for_course", courseId],
    queryFn: () => fetchStudentsForCourse(courseId!),
    enabled: !!courseId,
    staleTime: STALE.NORMAL,
  });
}

export function useStudentNotes(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student_notes", studentId],
    queryFn: () => fetchStudentNotes(studentId!),
    enabled: !!studentId,
    staleTime: STALE.NORMAL,
  });
}

export function useAllEnrolledStudents() {
  return useQuery({
    queryKey: ["all_enrolled_students"],
    queryFn: fetchAllEnrolledStudents,
    staleTime: STALE.FAST,
  });
}

export function useStudentsWithStatus() {
  return useQuery({
    queryKey: ["students_with_status"],
    queryFn: fetchStudentsWithStatus,
    staleTime: STALE.NORMAL,
  });
}

export function useRenewalStudents() {
  return useQuery({
    queryKey: ["renewal_students"],
    queryFn: fetchRenewalStudents,
    staleTime: STALE.NORMAL,
  });
}

export function useEnrollmentHistory(studentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollment_history", studentId],
    queryFn: () => fetchEnrollmentHistory(studentId!),
    enabled: !!studentId,
    staleTime: STALE.NORMAL,
  });
}
