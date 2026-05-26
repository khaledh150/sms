export interface MessageTemplates {
  checkin: string;
  renewal_approaching: string;
  overlimit: string;
  enrollment: string;
  approval: string;
  link_welcome: string;
  renewal_payment: string;
  new_course: string;
}

export interface LineConfig {
  id: string;
  channel_id: string;
  secrets_configured: boolean;
  auto_checkin_notify: boolean;
  auto_limit_notify: boolean;
  auto_renewal_notify: boolean;
  auto_link_notify: boolean;
  message_templates: MessageTemplates;
  payment_qr_url: string | null;
}

export interface LineMessage {
  id: string;
  message_type: string;
  content: string;
  recipient_count: number;
  recipient_student_ids: string[] | null;
  status: string;
  created_at: string;
  direction: "incoming" | "outgoing";
  student_id: string | null;
  media_url: string | null;
  media_type: string | null;
}

export interface LineConnection {
  id: string;
  student_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
}

export interface UnlinkedUser {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  created_at: string;
}

export interface StudentBasic {
  id: string;
  nick_name: string | null;
  first_name: string;
  last_name: string;
}

export const LINE_GREEN = "#06C755";
export const LINE_BG = "#f7f8fa";
export const CHAT_BG = "#7494A5";
