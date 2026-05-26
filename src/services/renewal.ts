import { supabase } from "../supabaseClient";

interface RenewalTokenRow {
  school_id: string;
  [key: string]: unknown;
}

export interface RenewalData {
  studentName: string;
  courseName: string;
  packages: { hours: number; price: number }[];
  qrUrl: string | null;
  usedHours: number;
  purchasedHours: number;
  schoolId: string;
  studentId: string;
  courseId: string;
}

export async function validateRenewalToken(
  token: string,
  studentId: string,
  courseId: string
): Promise<RenewalTokenRow> {
  const { data, error } = await supabase
    .from("renewal_tokens")
    .select("*")
    .eq("token", token)
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    throw new Error("ลิงก์หมดอายุหรือถูกใช้แล้ว / This link has expired or already been used.");
  }
  return data as RenewalTokenRow;
}

export async function fetchRenewalData(
  tokenRow: RenewalTokenRow,
  studentId: string,
  courseId: string
): Promise<RenewalData> {
  const [studentRes, courseRes, enrollRes, configRes] = await Promise.all([
    supabase.from("students").select("nick_name,first_name,last_name").eq("id", studentId).single(),
    supabase.from("courses").select("name,hour_packages").eq("id", courseId).single(),
    supabase.from("enrollments").select("purchased_hours,initial_used_hours").eq("student_id", studentId).eq("course_id", courseId).single(),
    supabase.from("line_config").select("payment_qr_url").eq("school_id", tokenRow.school_id).single(),
  ]);

  const student = studentRes.data;
  const course = courseRes.data;
  const enrollment = enrollRes.data;

  if (!student || !course) {
    throw new Error("ไม่พบข้อมูล / Data not found.");
  }

  const { count } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .not("approved_by", "is", null)
    .is("cancelled_by", null);

  const usedHours = (count || 0) + (enrollment?.initial_used_hours || 0);
  const displayName = student.nick_name
    ? `${student.nick_name} (${student.first_name})`
    : student.first_name;

  return {
    studentName: displayName,
    courseName: course.name,
    packages: course.hour_packages || [],
    qrUrl: configRes.data?.payment_qr_url || null,
    usedHours,
    purchasedHours: enrollment?.purchased_hours || 0,
    schoolId: tokenRow.school_id,
    studentId,
    courseId,
  };
}

export async function submitRenewalSlip(params: {
  schoolId: string;
  studentId: string;
  courseId: string;
  courseName: string;
  selectedHours: number;
  selectedPrice: number;
  file: File;
  token: string;
}): Promise<void> {
  const path = `${params.schoolId}/renewal-${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from("receipts")
    .upload(path, params.file, { contentType: params.file.type });
  if (uploadErr) throw new Error("อัปโหลดไม่สำเร็จ / Upload failed. Please try again.");

  const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);

  const { error: insertErr } = await supabase.from("application_changes").insert({
    student_id: params.studentId,
    type: "renewal",
    status: "pending",
    changes: { course_limits: { [params.courseId]: params.selectedHours } },
    receipt_urls: [urlData?.publicUrl || ""],
    purchased_packages: [{
      course_id: params.courseId,
      course_name: params.courseName,
      hours: params.selectedHours,
      price: params.selectedPrice,
    }],
    total_price: params.selectedPrice,
    school_id: params.schoolId,
  });
  if (insertErr) throw new Error("เกิดข้อผิดพลาด / Something went wrong.");

  await supabase
    .from("renewal_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", params.token);
}
