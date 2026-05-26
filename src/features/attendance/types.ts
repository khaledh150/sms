export interface StudentForGrid {
  student_id: string;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  purchased_hours: number;
  initial_used_hours: number;
  isExpectedToday: boolean;
  photo_url: string | null;
}

export interface CourseGroup {
  courseName: string;
  courseId: string;
  students: StudentForGrid[];
}
