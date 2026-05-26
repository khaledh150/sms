export type UserRole = "superadmin" | "owner" | "admin" | "staff";

export interface HourPackage {
  hours: number;
  price: number;
}

export interface Notification {
  id: string;
  type: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any> | null;
  student_id: string | null;
  student_name?: string;
  read: boolean;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string;
}

export interface Payment {
  id: string;
  student_id: string;
  amount: number;
  currency: string;
  method: string | null;
  received_at: string;
  course_id: string | null;
  note: string | null;
  receipt_url: string | null;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
}

export interface MonthlySummary {
  id: string;
  month: number;
  year: number;
  income: number;
  expenses: number;
  profit: number;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  username: string | null;
  avatar_url?: string | null;
}
