import { useQuery } from "@tanstack/react-query";
import { STALE } from "../constants";
import { fetchCourses, fetchCoursesForToday, fetchCourseOverview } from "../services/courses";

export function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
    staleTime: STALE.SLOW,
  });
}

export function useCoursesToday() {
  return useQuery({
    queryKey: ["courses", "today"],
    queryFn: fetchCoursesForToday,
    staleTime: STALE.SLOW,
  });
}

export function useCourseOverview() {
  return useQuery({
    queryKey: ["course_overview"],
    queryFn: fetchCourseOverview,
    staleTime: STALE.NORMAL,
  });
}
