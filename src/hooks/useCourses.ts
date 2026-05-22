// src/hooks/useCourses.ts — React Query wrappers for courses service
import { useQuery } from "@tanstack/react-query";
import { fetchCourses, fetchCoursesForToday, fetchCourseOverview } from "../services/courses";

export function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
    staleTime: 300_000,
  });
}

export function useCoursesToday() {
  return useQuery({
    queryKey: ["courses", "today"],
    queryFn: fetchCoursesForToday,
    staleTime: 300_000,
  });
}

export function useCourseOverview() {
  return useQuery({
    queryKey: ["course_overview"],
    queryFn: fetchCourseOverview,
    staleTime: 120_000,
  });
}
