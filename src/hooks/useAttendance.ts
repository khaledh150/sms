// src/hooks/useAttendance.ts — React Query wrappers for attendance
import { useQuery } from "@tanstack/react-query";
import { fetchTodayAttendance, fetchStudentAttendance } from "../services/attendance";

export function useTodayAttendance() {
  return useQuery({
    queryKey: ["attendance", "today"],
    queryFn: fetchTodayAttendance,
    staleTime: 30_000,
  });
}

export function useStudentAttendance(studentId: string | undefined) {
  return useQuery({
    queryKey: ["attendance", studentId],
    queryFn: () => fetchStudentAttendance(studentId!),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}
