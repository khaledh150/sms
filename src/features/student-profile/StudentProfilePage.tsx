import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PlusIcon, PencilSquareIcon, TrashIcon, CameraIcon } from "@heroicons/react/24/outline";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthContext";
import { useStudent, useStudentEnrollments, useEnrollmentHistory } from "../../hooks/useStudents";
import { useStudentAttendance } from "../../hooks/useAttendance";
import { useCourses } from "../../hooks/useCourses";
import { fetchPendingChangesForStudent } from "../../services/applications";
import { POS } from "../../theme";

import DeleteStudentModal from "./DeleteStudentModal";
import EditStudentModal from "./EditStudentModal";
import AddCourseModal from "./AddCourseModal";
import RenewCourseModal from "./RenewCourseModal";
import LateCheckInModal from "./LateCheckInModal";
import CancelCourseModal from "./CancelCourseModal";
import LineConnectionCard from "./LineConnectionCard";
import CourseEnrollmentCard from "./CourseEnrollmentCard";

export default function StudentProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: student, isLoading } = useStudent(id);
  const { data: enrollments = [] } = useStudentEnrollments(id);
  const { data: attendance = [] } = useStudentAttendance(id);
  const { data: courses = [] } = useCourses();
  const { data: enrollmentHistory = [] } = useEnrollmentHistory(id);

  const { data: pendingChanges = [] } = useQuery({
    queryKey: ["pending_changes_student", id],
    queryFn: () => fetchPendingChangesForStudent(id!),
    enabled: !!id,
  });

  const { data: unlinkedLineUsers = [] } = useQuery({
    queryKey: ["unlinked_line_users"],
    queryFn: async () => {
      const { data } = await supabase.from("unlinked_line_users").select("*").order("created_at", { ascending: false });
      return (data ?? []) as { line_user_id: string; display_name: string | null; picture_url: string | null; created_at: string }[];
    },
    staleTime: 30_000,
  });

  const { data: lineConnection } = useQuery({
    queryKey: ["line_connection", id],
    queryFn: async () => {
      const { data } = await supabase.from("line_connections").select("*").eq("student_id", id!).limit(1).maybeSingle();
      return data as { line_user_id: string; display_name: string | null } | null;
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: lineConfig } = useQuery({
    queryKey: ["line_config"],
    queryFn: async () => {
      const { data } = await supabase.from("line_config").select("auto_link_notify,message_templates").limit(1).maybeSingle();
      return data as { auto_link_notify: boolean; message_templates: Record<string, string> } | null;
    },
    staleTime: 300_000,
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [renewCourse, setRenewCourse] = useState<string | null>(null);
  const [renewMode, setRenewMode] = useState<"renew" | "add">("renew");
  const [lateCheckInCourse, setLateCheckInCourse] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ enrollmentId: string; courseId: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));

  function getPendingForCourse(courseId: string) {
    return pendingChanges.find(c => {
      const limits = c.changes?.course_limits;
      return limits && typeof limits === "object" && courseId in (limits as object);
    });
  }

  function getAttendanceForCourse(courseId: string) {
    return attendance.filter(a => a.course_id === courseId && a.approved_by && !a.cancelled_by);
  }

  function getAllAttendanceForCourse(courseId: string) {
    return attendance.filter(a => a.course_id === courseId && a.approved_by);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${student.id}.${ext}`;
      await supabase.storage.from("student-photos").upload(path, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from("student-photos").getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("students").update({ photo_url: url }).eq("id", student.id);
      queryClient.invalidateQueries({ queryKey: ["student", id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["all_enrolled_students"] });
    } finally { setUploadingPhoto(false); }
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handleDeleteStudent() {
    if (!student) return;
    setDeleting(true);
    await supabase.from("students").delete().eq("id", student.id);
    setDeleting(false);
    setDeleteOpen(false);
    queryClient.invalidateQueries({ queryKey: ["students"] });
    queryClient.invalidateQueries({ queryKey: ["students_inactive"] });
    nav(-1);
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: POS.primaryLight, borderTopColor: POS.primary }} />
    </div>
  );
  if (!student) return (
    <div className="p-8 text-center">
      <p className="text-lg font-semibold" style={{ color: POS.danger }}>{t("studentNotFound")}</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Student Info Card */}
      <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
        <div className="flex items-start gap-4">
          <input type="file" ref={photoInputRef} accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 relative overflow-hidden group"
            style={{ background: POS.primary, minHeight: "auto" }}>
            {student.photo_url ? (
              <img src={student.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (student.nick_name || student.first_name || "?").charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <CameraIcon className="w-5 h-5 text-white" />
            </div>
            {uploadingPhoto && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" style={{ color: POS.textPrimary }}>
              {student.nick_name && <span style={{ color: POS.primary }}>"{student.nick_name}" </span>}
              {student.first_name} {student.last_name}
            </h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm" style={{ color: POS.textSecondary }}>
              {student.dob && <span>{t("dob")}: {new Date(student.dob).toLocaleDateString("en-GB")}</span>}
              {student.parent_phone && <span>{t("phone")}: {student.parent_phone}</span>}
              {lineConnection && <span>LINE: {lineConnection.display_name || t("lineLinked")}</span>}
              {student.joined_at && <span>{t("joined")}: {new Date(student.joined_at).toLocaleDateString("en-GB")}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditOpen(true)}
              aria-label={t("edit")}
              className="p-2 rounded-xl hover:bg-purple-50 transition"
              style={{ color: POS.primary, minHeight: "auto" }}
            >
              <PencilSquareIcon className="w-5 h-5" />
            </button>
            {isAdmin && (
              <button
                onClick={() => setDeleteOpen(true)}
                aria-label={t("deleteStudent")}
                className="p-2 rounded-xl hover:bg-red-50 transition"
                style={{ color: POS.danger, minHeight: "auto" }}
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code + LINE Connection — side by side */}
      <div className="grid grid-cols-2 gap-3">
        {student.qr_code_url && (
          <div className="bg-white rounded-2xl p-4 border flex flex-col items-center justify-between" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
            <img src={student.qr_code_url} alt="QR Code" className="w-24 h-24 rounded-lg mb-2" />
            <div className="font-bold text-xs mb-2" style={{ color: POS.textPrimary }}>{t("studentQrCode")}</div>
            <div className="flex gap-2">
              <a href={student.qr_code_url} download className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: POS.bgSurface, color: POS.primary }} aria-label={t("download")}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
              </a>
              <button onClick={() => {
                const w = window.open("");
                if (w) {
                  const img = w.document.createElement("img");
                  img.src = student.qr_code_url!;
                  img.onload = () => { w.print(); w.close(); };
                  w.document.body.appendChild(img);
                }
              }} className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: POS.bgSurface, color: POS.primary }} aria-label={t("print")}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0118 8.653v4.097A2.25 2.25 0 0115.75 15h-.75v.75c0 .966-.784 1.75-1.75 1.75h-6.5A1.75 1.75 0 015 15.75V15h-.75A2.25 2.25 0 012 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75zm8.5 3.397V2.75a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25v3.397a49.98 49.98 0 017 0zM6.5 12.75v3a.25.25 0 00.25.25h6.5a.25.25 0 00.25-.25v-3H6.5z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        )}

        <LineConnectionCard
          student={student}
          lineConnection={lineConnection}
          unlinkedLineUsers={unlinkedLineUsers}
          lineConfig={lineConfig}
          isAdmin={isAdmin}
        />
      </div>

      {/* Enrolled Courses */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: POS.textPrimary }}>{t("enrolledCourses")}</h2>
          <button onClick={() => setAddOpen(true)}
            aria-label={t("addCourse")}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold"
            style={{ background: POS.bgSurface, color: POS.primary }}>
            <PlusIcon className="w-4 h-4" /> {t("addNewCourse")}
          </button>
        </div>

        {enrollments.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border" style={{ borderColor: POS.border }}>
            <p style={{ color: POS.textMuted }}>{t("noEnrollments")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enrollments.map(enr => (
              <CourseEnrollmentCard
                key={enr.id}
                enrollment={enr}
                course={courseMap[enr.course_id]}
                attendanceRecords={getAttendanceForCourse(enr.course_id)}
                allAttendanceRecords={getAllAttendanceForCourse(enr.course_id)}
                pendingReq={getPendingForCourse(enr.course_id)}
                studentId={student.id}
                userRole={user?.role}
                onRenew={(courseId, mode) => { setRenewCourse(courseId); setRenewMode(mode); }}
                onLateCheckIn={(courseId) => setLateCheckInCourse(courseId)}
                onCancel={(enrollmentId, courseId) => setCancelTarget({ enrollmentId, courseId })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Enrollment History — admin only */}
      {isAdmin && enrollmentHistory.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>{t("enrollmentHistory")}</h2>
          <div className="space-y-2">
            {enrollmentHistory.map(h => (
              <div key={h.id} className="bg-white rounded-xl p-3 border text-sm" style={{ borderColor: POS.borderLight }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold" style={{ color: POS.primary }}>{h.course_name}</span>
                  <span className="text-xs" style={{ color: POS.textMuted }}>
                    {new Date(h.renewed_at).toLocaleDateString("en-GB")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: POS.textSecondary }}>
                  <span>{h.used_hours}/{h.purchased_hours} {t("hrs")}</span>
                  {h.price != null && <span>{t("price")}: ฿{h.price}</span>}
                  {h.book_info && <span>{t("book")}: {h.book_info}</span>}
                  {h.receipt_url && (
                    <a href={h.receipt_url} target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: POS.info }}>{t("viewReceipt")}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      <DeleteStudentModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteStudent}
        deleting={deleting}
        enrollmentCount={enrollments.length}
        attendanceCount={attendance.length}
      />

      {editOpen && (
        <EditStudentModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          student={student}
        />
      )}

      <AddCourseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        student={student}
        courses={courses}
        enrolledCourseIds={enrolledCourseIds}
      />

      <RenewCourseModal
        courseId={renewCourse}
        mode={renewMode}
        onClose={() => setRenewCourse(null)}
        student={student}
        courseMap={courseMap}
      />

      <LateCheckInModal
        courseId={lateCheckInCourse}
        onClose={() => setLateCheckInCourse(null)}
        student={student}
        courseMap={courseMap}
        userId={user?.id || ""}
      />

      <CancelCourseModal
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        student={student}
        courseMap={courseMap}
        isAdmin={isAdmin}
        userId={user?.id || ""}
      />
    </div>
  );
}
