// src/services/courses.ts — Course CRUD + schedule queries
import { supabase } from "../supabaseClient";

export interface Course {
  id: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
  capacity: number | null;
  start: string | null;
  end: string | null;
  hour_packages: any;
  created_at: string;
}

export interface CourseTime {
  id: string;
  course_id: string;
  weekday: string;
  start: string;
  end: string;
}

// Fetch all courses
export async function fetchCourses() {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Course[];
}

// Fetch a single course
export async function fetchCourse(id: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Course;
}

// Fetch course_times for a course
export async function fetchCourseTimes(courseId: string) {
  const { data, error } = await supabase
    .from("course_times")
    .select("*")
    .eq("course_id", courseId)
    .order("weekday");
  if (error) throw error;
  return (data ?? []) as CourseTime[];
}

// Get today's weekday name
export function getTodayWeekday(): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()];
}

// Fetch courses happening today (based on weekdays array)
export async function fetchCoursesForToday() {
  const today = getTodayWeekday();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .contains("weekdays", [today])
    .order("name");
  if (error) throw error;
  return (data ?? []) as Course[];
}

// Create a course
export async function createCourse(course: Partial<Course>) {
  const { data, error } = await supabase
    .from("courses")
    .insert([course])
    .select()
    .single();
  if (error) throw error;
  return data as Course;
}

// Update a course
export async function updateCourse(id: string, updates: Partial<Course>) {
  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Course;
}

// Delete a course
export async function deleteCourse(id: string) {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) throw error;
}

// Fetch course overview (view with enrollment counts)
export async function fetchCourseOverview() {
  const { data, error } = await supabase
    .from("course_overview")
    .select("*");
  if (error) throw error;
  return data ?? [];
}
