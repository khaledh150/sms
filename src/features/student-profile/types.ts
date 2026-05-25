export interface StudentData {
  id: string;
  nick_name: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  parent_phone: string | null;
  parent_line_id: string | null;
  qr_code_url: string | null;
  joined_at: string | null;
  status: string | null;
}

export interface EnrollmentData {
  id: string;
  student_id: string;
  course_id: string;
  purchased_hours: number;
  initial_used_hours: number;
  status: string;
  schedule: Record<string, string[]> | null;
}

export interface CourseData {
  id: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
  hour_packages: { hours: number; price: number }[];
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  course_id: string | null;
  attended_at_ts: string;
  approved_by: string | null;
}

export interface PendingChange {
  id: string;
  student_id: string;
  type: string;
  status: string;
  changes: {
    course_limits?: Record<string, number>;
    course_changes?: Record<string, Record<string, string[]>>;
    receipts?: string[];
    enrollment_id?: string;
    course_id?: string;
    course_name?: string;
  };
}

export interface LineConnectionData {
  line_user_id: string;
  display_name: string | null;
}

export interface UnlinkedLineUser {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  created_at: string;
}

export interface LineConfigData {
  auto_link_notify: boolean;
  message_templates: Record<string, string>;
}
