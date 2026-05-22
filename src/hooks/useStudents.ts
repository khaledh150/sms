// src/hooks/useStudents.ts — React Query wrappers for students service
import { useQuery } from "@tanstack/react-query";
import {
  fetchStudents,
  fetchAllStudents,
  fetchInactiveStudents,
  fetchStudent,
  fetchStudentEnrollments,
  fetchStudentsForCourse,
  fetchStudentNotes,
  fetchExpectedToday,
} from "../services/students";

export function useStudents(activeOnly = true) {
  return useQuery({
    queryKey: ["students", activeOnly ? "active" : "all"],
    queryFn: () => (activeOnly ? fetchStudents() : fetchAllStudents()),
    staleTime: 120_000,
  });
}

export function useInactiveStudents() {
  return useQuery({
    queryKey: ["students", "inactive"],
    queryFn: fetchInactiveStudents,
    staleTime: 120_000,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["student", id],
    queryFn: () => fetchStudent(id!),
    enabled: !!id,
    staleTime: 120_000,
  });
}

export function useStudentEnrollments(studentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollments", studentId],
    queryFn: () => fetchStudentEnrollments(studentId!),
    enabled: !!studentId,
    staleTime: 120_000,
  });
}

export function useExpectedToday() {
  return useQuery({
    queryKey: ["expected_today"],
    queryFn: fetchExpectedToday,
    staleTime: 30_000,
  });
}

export function useStudentsForCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: ["students_for_course", courseId],
    queryFn: () => fetchStudentsForCourse(courseId!),
    enabled: !!courseId,
    staleTime: 60_000,
  });
}

export function useStudentNotes(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student_notes", studentId],
    queryFn: () => fetchStudentNotes(studentId!),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}
