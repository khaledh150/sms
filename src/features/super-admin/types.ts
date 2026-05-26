export interface SchoolHealth {
  school_id: string;
  name: string;
  status: string;
  plan: string;
  owner_id: string | null;
  created_at: string;
  max_students: number;
  max_staff: number;
  feature_flags: Record<string, boolean>;
  setup_checklist: Record<string, boolean>;
  active_students: number;
  total_students: number;
  staff_count: number;
  admin_count: number;
  course_count: number;
  checkins_30d: number;
  line_messages_30d: number;
  owner_last_login?: string | null;
  owner_name: string | null;
  owner_email: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface SuperAdminAuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  actor_name?: string;
  school_name?: string;
}
