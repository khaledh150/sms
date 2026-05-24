import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Dialog } from "@headlessui/react";
import {
  TrashIcon, PlusIcon, ArrowPathIcon, XMarkIcon, ClockIcon,
  CheckCircleIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronRightIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { useStudent, useStudentEnrollments, useStudentNotes } from "./hooks/useStudents";
import { useStudentAttendance } from "./hooks/useAttendance";
import { useCourses } from "./hooks/useCourses";
// addStudentNote removed — unused
import { fetchPendingChangesForStudent } from "./services/applications";
import { useToast } from "./hooks/useToast";
import { validateReceiptFile } from "./hooks/useFileValidation";
import { POS } from "./theme";

export default function StudentProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: student, isLoading } = useStudent(id);
  const { data: enrollments = [] } = useStudentEnrollments(id);
  const { data: attendance = [] } = useStudentAttendance(id);
  const { data: courses = [] } = useCourses();
  useStudentNotes(id);
  const { data: pendingChanges = [] } = useQuery({
    queryKey: ["pending_changes_student", id],
    queryFn: () => fetchPendingChangesForStudent(id!),
    enabled: !!id,
  });

  function getPendingForCourse(courseId: string) {
    return pendingChanges.find(c => {
      const limits = c.changes?.course_limits;
      return limits && courseId in limits;
    });
  }

  const [linkingLine, setLinkingLine] = useState(false);
  const [lineDropdownOpen, setLineDropdownOpen] = useState(false);
  const [lineSearchTerm, setLineSearchTerm] = useState("");
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState("");
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

  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renewCourse, setRenewCourse] = useState<string | null>(null);
  const [renewHours, setRenewHours] = useState(1);
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nick_name: "", first_name: "", last_name: "", dob: "", parent_phone: "" });
  const [editSaving, setEditSaving] = useState(false);
  const isAdmin = user?.role === "admin";

  // Add course modal state
  const [addCourse, setAddCourse] = useState<string | null>(null);
  const [addDays, setAddDays] = useState<Record<string, string[]>>({});
  const [addHours, setAddHours] = useState(0);
  const [addFile, setAddFile] = useState<File | null>(null);

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  function getAttendanceForCourse(courseId: string) {
    return attendance.filter(a => a.course_id === courseId && a.approved_by);
  }

  async function handleRenewSubmit() {
    setRenewError("");
    if (!renewCourse) return;
    if (renewHours < 1) { setRenewError(t("hoursMustBeOne")); return; }

    let receiptUrls: string[] = [];
    if (renewFile) {
      const validationErr = validateReceiptFile(renewFile);
      if (validationErr) { setRenewError(validationErr); return; }
      const fn = `${Date.now()}-${renewFile.name}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, renewFile);
      if (ue) { setRenewError(t("uploadFailed", { message: ue.message })); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      receiptUrls = [pu.publicUrl];
    }

    await supabase.from("application_changes").insert([{
      student_id: student!.id, type: "renewal", status: "pending",
      changes: {
        course_limits: { [renewCourse]: renewHours },
        ...(receiptUrls.length > 0 ? { receipts: receiptUrls } : {}),
      },
    }]);
    setRenewCourse(null); setRenewHours(1); setRenewFile(null);
    toast(t("submitRenewal"), "success");
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [renewError, setRenewError] = useState("");
  const [renewMode, setRenewMode] = useState<"renew" | "add">("renew");
  const [lateCheckInCourse, setLateCheckInCourse] = useState<string | null>(null);
  const [lateCheckInDate, setLateCheckInDate] = useState("");
  const [lateCheckInHours, setLateCheckInHours] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<{ enrollmentId: string; courseId: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleAddCourse() {
    setAddError("");
    if (!addCourse) { setAddError(t("pleaseSelectCourse")); return; }
    if (Object.keys(addDays).length === 0) { setAddError(t("pleaseSelectDay")); return; }
    if (addHours < 1) { setAddError(t("hoursMustBeOne")); return; }

    setAddSaving(true);
    let receiptUrls: string[] = [];
    if (addFile) {
      const validationErr = validateReceiptFile(addFile);
      if (validationErr) { setAddError(validationErr); setAddSaving(false); return; }
      const fn = `${Date.now()}-${addFile.name}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, addFile);
      if (ue) { setAddError(t("uploadFailed", { message: ue.message })); setAddSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      receiptUrls = [pu.publicUrl];
    }

    await supabase.from("application_changes").insert([{
      student_id: student!.id, type: "edit", status: "pending",
      changes: {
        course_changes: { [addCourse]: addDays },
        course_limits: { [addCourse]: addHours },
        ...(receiptUrls.length > 0 ? { receipts: receiptUrls } : {}),
      },
    }]);
    setAddSaving(false);
    setAddOpen(false); setAddCourse(null); setAddDays({}); setAddFile(null); setAddHours(0);
    toast(t("submitAdd"), "success");
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  async function handleCancelCourse() {
    if (!cancelTarget) return;
    const { enrollmentId, courseId } = cancelTarget;
    const courseName = courseMap[courseId]?.name || courseId;
    setCancelling(true);

    if (isAdmin) {
      await supabase.from("enrollments").update({
        status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id || null
      }).eq("id", enrollmentId);
      toast(t("courseCancelled", { course: courseName }), "success");
      queryClient.invalidateQueries({ queryKey: ["enrollments", id] });
    } else {
      await supabase.from("application_changes").insert({
        student_id: student!.id,
        type: "cancel_course",
        status: "pending",
        changes: { enrollment_id: enrollmentId, course_id: courseId, course_name: courseName },
        submitted_by: user?.id,
        nickname: student!.nick_name || null,
        first_name: student!.first_name,
        last_name: student!.last_name,
      });
      await supabase.from("notifications").insert({
        student_id: student!.id,
        type: "cancel_request",
        payload: { course_name: courseName, student_name: student!.nick_name || student!.first_name },
      });
      toast(t("cancelRequestSent"), "success");
      queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
    }

    setCancelling(false);
    setCancelTarget(null);
  }

  async function handleLateCheckIn() {
    if (!lateCheckInCourse || !lateCheckInDate || !user?.id) return;
    const selected = new Date(lateCheckInDate);
    if (selected > new Date()) { toast(t("lateCheckInMaxDays"), "error"); return; }

    const ts = `${lateCheckInDate}T09:00:00`;
    const inserts = Array.from({ length: lateCheckInHours }, () => ({
      student_id: student!.id, course_id: lateCheckInCourse,
      attended_at_ts: ts, approved_by: user.id,
    }));
    const { error } = await supabase.from("attendance").insert(inserts);
    if (error) { toast(error.message, "error"); return; }
    toast(t("lateCheckInSuccess"), "success");
    setLateCheckInCourse(null); setLateCheckInHours(1);
    queryClient.invalidateQueries({ queryKey: ["attendance", id] });
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

  async function handleEditStudent() {
    if (!student) return;
    setEditSaving(true);
    const { error } = await supabase.from("students").update({
      nick_name: editForm.nick_name || null,
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      dob: editForm.dob || null,
      parent_phone: editForm.parent_phone || null,
    }).eq("id", student.id);
    if (error) toast(error.message, "error");
    else { toast(t("studentUpdated"), "success"); queryClient.invalidateQueries({ queryKey: ["student", id] }); setEditOpen(false); }
    setEditSaving(false);
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

  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Student Info Card */}
      <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0"
            style={{ background: POS.primary }}>
            {(student.nick_name || student.first_name || "?").charAt(0).toUpperCase()}
          </div>
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
              onClick={() => { setEditForm({ nick_name: student.nick_name || "", first_name: student.first_name || "", last_name: student.last_name || "", dob: student.dob || "", parent_phone: student.parent_phone || "" }); setEditOpen(true); }}
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
        {/* QR Code */}
        {(student as any).qr_code_url && (
          <div className="bg-white rounded-2xl p-4 border flex flex-col items-center justify-between" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
            <img src={(student as any).qr_code_url} alt="QR Code" className="w-24 h-24 rounded-lg mb-2" />
            <div className="font-bold text-xs mb-2" style={{ color: POS.textPrimary }}>{t("studentQrCode")}</div>
            <div className="flex gap-2">
              <a href={(student as any).qr_code_url} download className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: POS.bgSurface, color: POS.primary }} aria-label={t("download")}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
              </a>
              <button onClick={() => {
                const w = window.open("");
                if (w) { w.document.write(`<img src="${(student as any).qr_code_url}" onload="window.print();window.close()" />`); w.document.close(); }
              }} className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: POS.bgSurface, color: POS.primary }} aria-label={t("print")}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0118 8.653v4.097A2.25 2.25 0 0115.75 15h-.75v.75c0 .966-.784 1.75-1.75 1.75h-6.5A1.75 1.75 0 015 15.75V15h-.75A2.25 2.25 0 012 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75zm8.5 3.397V2.75a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25v3.397a49.98 49.98 0 017 0zM6.5 12.75v3a.25.25 0 00.25.25h6.5a.25.25 0 00.25-.25v-3H6.5z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* LINE Connection */}
        <div className="bg-white rounded-2xl p-4 border flex flex-col items-center justify-between" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold mb-2"
            style={{ background: lineConnection ? "#06C755" : POS.textMuted }}>
            L
          </div>
          <div className="font-bold text-xs text-center mb-2" style={{ color: POS.textPrimary }}>
            {lineConnection ? t("lineLinked") : t("lineNotLinked")}
          </div>
          {lineConnection ? (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="text-[11px] truncate w-full text-center font-semibold" style={{ color: POS.textMuted }}>
                {lineConnection.display_name || "LINE User"}
              </div>
              {isAdmin && (
                <button onClick={async () => {
                  await supabase.from("line_connections").delete().eq("student_id", student.id);
                  await supabase.from("students").update({ parent_line_id: null }).eq("id", student.id);
                  toast(t("lineUnlinked"), "info");
                  queryClient.invalidateQueries({ queryKey: ["line_connection", id] });
                  queryClient.invalidateQueries({ queryKey: ["student", id] });
                  queryClient.invalidateQueries({ queryKey: ["line_connections"] });
                  queryClient.invalidateQueries({ queryKey: ["unlinked_line_users"] });
                }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{ background: POS.dangerLight, color: POS.danger }}>
                  {t("unlinkLine")}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full relative">
              {unlinkedLineUsers.length > 0 ? (
                <>
                  <button
                    onClick={() => setLineDropdownOpen(!lineDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left"
                    style={{ background: "#f5f5f5", border: "1px solid #e8e8e8" }}>
                    <span style={{ color: selectedUnlinkedId ? POS.textPrimary : "#aaa" }}>
                      {selectedUnlinkedId
                        ? (unlinkedLineUsers.find(u => u.line_user_id === selectedUnlinkedId)?.display_name || "LINE User")
                        : t("selectStudent")}
                    </span>
                    <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#aaa" }} />
                  </button>
                  {lineDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-30 max-h-48 overflow-hidden flex flex-col" style={{ borderColor: "#e0e0e0" }}>
                      <input type="text" autoFocus value={lineSearchTerm}
                        onChange={e => setLineSearchTerm(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="px-3 py-2 text-xs border-b outline-none" style={{ borderColor: "#f0f0f0" }} />
                      <div className="overflow-y-auto flex-1">
                        {unlinkedLineUsers
                          .filter(u => !lineSearchTerm || (u.display_name?.toLowerCase().includes(lineSearchTerm.toLowerCase())))
                          .map(u => (
                            <button key={u.line_user_id}
                              onClick={() => { setSelectedUnlinkedId(u.line_user_id); setLineDropdownOpen(false); setLineSearchTerm(""); }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                              {u.picture_url
                                ? <img src={u.picture_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                : <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: "#B0BEC5" }}>{(u.display_name || "?").charAt(0)}</div>
                              }
                              <span className="font-semibold truncate" style={{ color: POS.textPrimary }}>{u.display_name || "Unknown"}</span>
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                  <button disabled={!selectedUnlinkedId || linkingLine}
                    onClick={async () => {
                      if (!selectedUnlinkedId || !id) return;
                      setLinkingLine(true);
                      const u = unlinkedLineUsers.find(x => x.line_user_id === selectedUnlinkedId);
                      await supabase.from("line_connections").upsert({
                        student_id: id, line_user_id: selectedUnlinkedId,
                        display_name: u?.display_name || null,
                      }, { onConflict: "student_id" });
                      await supabase.from("students").update({ parent_line_id: selectedUnlinkedId }).eq("id", id);
                      await supabase.from("unlinked_line_users").delete().eq("line_user_id", selectedUnlinkedId);
                      const name = student.nick_name || student.first_name || "";
                      await supabase.from("pending_line_notifications").insert({
                        student_id: id, message_type: "general",
                        message: `Your LINE account has been linked to ${name}!\nYou will now receive notifications about your child's attendance and enrollment.\n\nบัญชี LINE ของคุณเชื่อมต่อกับ ${name} เรียบร้อยแล้ว!\nคุณจะได้รับแจ้งเตือนเกี่ยวกับการเข้าเรียนและการลงทะเบียน`,
                        status: "queued",
                      });
                      toast(t("lineLinkedSuccess"), "success");
                      setSelectedUnlinkedId("");
                      queryClient.invalidateQueries({ queryKey: ["line_connection", id] });
                      queryClient.invalidateQueries({ queryKey: ["student", id] });
                      queryClient.invalidateQueries({ queryKey: ["line_connections"] });
                      queryClient.invalidateQueries({ queryKey: ["unlinked_line_users"] });
                      setLinkingLine(false);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 w-full"
                    style={{ background: "#06C755" }}>
                    {linkingLine ? t("linking") : t("linkLine")}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-center" style={{ color: "#aaa" }}>{t("noUnlinkedAccounts")}</p>
              )}
            </div>
          )}
        </div>
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
            {enrollments.map(enr => {
              const course = courseMap[enr.course_id];
              const att = getAttendanceForCourse(enr.course_id);
              const used = att.length + (enr.initial_used_hours || 0);
              const purchased = enr.purchased_hours;
              const remaining = purchased - used;
              const isOverlimit = purchased > 0 && remaining <= 0;
              const isApproaching = purchased > 0 && remaining > 0 && remaining <= 2;
              const isExpanded = expandedCourse === enr.id;
              const pendingReq = getPendingForCourse(enr.course_id);

              return (
                <div key={enr.id} className="bg-white rounded-2xl border overflow-hidden cursor-pointer"
                  style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                  <div className="p-4 flex items-center gap-3" onClick={() => setExpandedCourse(isExpanded ? null : enr.id)}>
                    <div className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: isOverlimit ? POS.danger : isApproaching ? "#F59E0B" : POS.success }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold" style={{ color: POS.textPrimary }}>
                        {course?.name || enr.course_id}
                      </div>
                      <div className="text-xs flex flex-wrap gap-1" style={{ color: POS.textMuted }}>
                        {enr.schedule && Object.entries(enr.schedule).map(([day, times]) => (
                          <span key={day}>{day.slice(0, 3)} {(times as string[]).join(", ")}</span>
                        ))}
                      </div>
                      {pendingReq && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: POS.warningLight, color: POS.warning }}>
                            <ClockIcon className="w-3 h-3" />
                            {pendingReq.type === "renewal" ? t("renewalPending") : t("addHoursPending")}
                            {" (+"}{ Object.values(pendingReq.changes?.course_limits || {})[0] as number }{" hrs)"}
                          </span>
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            await supabase.from("application_changes").delete().eq("id", pendingReq.id);
                            toast(t("requestCancelled"), "info");
                            queryClient.invalidateQueries({ queryKey: ["pending_changes_student", id] });
                            queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
                          }}
                            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold hover:bg-red-100"
                            style={{ color: POS.danger }}>
                            {t("cancel")}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-right mr-2">
                      <div className="text-lg font-bold" style={{ color: isOverlimit ? POS.danger : POS.textPrimary }}>
                        {remaining}/{purchased}
                      </div>
                      <div className="text-xs" style={{ color: POS.textMuted }}>{t("hrsLeft")}</div>
                    </div>
                    {isOverlimit ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: POS.dangerLight, color: POS.danger }}>
                        <ExclamationCircleIcon className="w-3.5 h-3.5" /> {t("renewalNeeded")}
                      </span>
                    ) : isApproaching ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: POS.warningLight, color: "#D97706" }}>
                        <ExclamationCircleIcon className="w-3.5 h-3.5" /> {t("renewalApproaching")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: POS.successLight, color: POS.success }}>
                        <CheckCircleIcon className="w-3.5 h-3.5" /> {t("ongoing")}
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setExpandedCourse(isExpanded ? null : enr.id); }}
                      aria-label={isExpanded ? t("hide") : t("expand")}
                      className="p-1" style={{ minHeight: "auto" }}>
                      {isExpanded
                        ? <ChevronDownIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
                        : <ChevronRightIcon className="w-5 h-5" style={{ color: POS.textMuted }} />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: POS.borderLight, background: POS.bgMain }}>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setRenewCourse(enr.course_id); setRenewMode("add"); }}
                          disabled={!!pendingReq}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: POS.primary }}>
                          <PlusIcon className="w-4 h-4" /> {t("addHours")}
                        </button>
                        {isOverlimit && (
                          <button onClick={() => { setRenewCourse(enr.course_id); setRenewMode("renew"); }}
                            disabled={!!pendingReq}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                            style={{ background: POS.warning }}>
                            <ArrowPathIcon className="w-4 h-4" /> {t("renew")}
                          </button>
                        )}
                        <button onClick={() => { setLateCheckInCourse(enr.course_id); setLateCheckInDate(""); }}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold"
                          style={{ background: POS.bgSurface, color: POS.primary }}>
                          <ClockIcon className="w-4 h-4" /> {t("lateCheckIn")}
                        </button>
                        <button onClick={() => setCancelTarget({ enrollmentId: enr.id, courseId: enr.course_id })}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold"
                          style={{ background: POS.dangerLight, color: POS.danger }}>
                          <XMarkIcon className="w-4 h-4" /> {t("cancelCourse")}
                        </button>
                      </div>
                      <div>
                        <div className="text-xs font-bold mb-1" style={{ color: POS.textSecondary }}>
                          {t("attendanceHistory")} ({att.length})
                        </div>
                        {att.length === 0 ? (
                          <p className="text-xs" style={{ color: POS.textMuted }}>{t("noRecords")}</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {att.slice(0, 20).map(a => (
                              <div key={a.id} className="text-xs py-1 px-2 rounded-lg bg-white">
                                {new Date(a.attended_at_ts).toLocaleString("en-GB", {
                                  weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>


      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: POS.dangerLight }}>
              <TrashIcon className="w-8 h-8" style={{ color: POS.danger }} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: POS.textPrimary }}>{t("deleteConfirmTitle")}</h2>
            <p className="text-sm mb-3" style={{ color: POS.textSecondary }}>{t("deleteStudentConfirm")}</p>
            <div className="mt-3 p-3 rounded-xl text-left text-sm space-y-1 mb-4" style={{ background: POS.warningLight }}>
              <p style={{ color: POS.warning }} className="font-bold">{t("deleteWillRemove")}</p>
              <p style={{ color: POS.textSecondary }}>• {enrollments.length} {t("enrolledCourses").toLowerCase()}</p>
              <p style={{ color: POS.textSecondary }}>• {attendance.length} {t("attendanceHistory").toLowerCase()}</p>
              <p style={{ color: POS.textSecondary }}>• {t("allFinancialRecords")}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleDeleteStudent} disabled={deleting}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.danger }}>{deleting ? t("loading") : t("delete")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* EDIT STUDENT MODAL */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg" style={{ color: POS.primary }}>{t("editStudent")}</h2>
            <button onClick={() => setEditOpen(false)} aria-label={t("close")} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("nickName")}</label>
              <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editForm.nick_name} onChange={e => setEditForm(f => ({ ...f, nick_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("firstName")} *</label>
              <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("lastName")} *</label>
              <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("dob")}</label>
              <input type="date" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editForm.dob} onChange={e => setEditForm(f => ({ ...f, dob: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("phone")}</label>
              <input type="tel" inputMode="numeric" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editForm.parent_phone} onChange={e => setEditForm(f => ({ ...f, parent_phone: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setEditOpen(false)} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleEditStudent} disabled={editSaving || !editForm.first_name || !editForm.last_name}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.primary }}>{editSaving ? t("loading") : t("save")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* ADD COURSE MODAL */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setAddError(""); }} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg" style={{ color: POS.primary }}>{t("addNewCourse")}</h2>
            <button onClick={() => { setAddOpen(false); setAddError(""); }} aria-label={t("close")} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("selectCourseLabel")}</label>
              <select className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: !addCourse && addError ? POS.danger : POS.border }}
                value={addCourse || ""} onChange={e => { setAddCourse(e.target.value); setAddDays({}); setAddHours(0); setAddError(""); }}>
                <option value="">{t("chooseCourse")}</option>
                {courses.filter(c => !enrolledCourseIds.has(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {addCourse && (
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectDayLabel")}</label>
                <div className="space-y-2">
                  {(courseMap[addCourse]?.weekdays || []).map((day: string) => {
                    const selected = addDays[day] || [];
                    const timesForDay = courseMap[addCourse]?.times?.[day] || [];
                    return (
                      <div key={day} className="rounded-xl p-3" style={{ background: selected.length > 0 ? `${POS.primary}10` : POS.bgSurface, border: `1px solid ${selected.length > 0 ? POS.primary : POS.border}` }}>
                        <div className="font-bold text-sm mb-1" style={{ color: POS.textPrimary }}>{day}</div>
                        <div className="flex flex-wrap gap-1">
                          {timesForDay.map((time: string) => {
                            const isOn = selected.includes(time);
                            return (
                              <button key={time} type="button" onClick={() => {
                                setAddDays(prev => {
                                  const curr = prev[day] || [];
                                  const next = isOn ? curr.filter(t => t !== time) : [...curr, time];
                                  const copy = { ...prev };
                                  if (next.length === 0) delete copy[day]; else copy[day] = next;
                                  return copy;
                                });
                                setAddError("");
                              }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                style={{ background: isOn ? POS.primary : "#fff", color: isOn ? "#fff" : POS.primary, border: `1px solid ${POS.primary}` }}>
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {addCourse && (
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackageLabel")}</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(courseMap[addCourse]?.hour_packages || []).map((pkg: any, i: number) => (
                    <motion.button key={i} type="button" whileTap={{ scale: 0.95 }}
                      onClick={() => { setAddHours(pkg.hours); setAddError(""); }}
                      className="py-3 rounded-xl text-center font-bold transition-all"
                      style={{
                        background: addHours === pkg.hours ? POS.primary : POS.bgSurface,
                        color: addHours === pkg.hours ? "#fff" : POS.primary,
                        border: `2px solid ${addHours === pkg.hours ? POS.primary : POS.border}`,
                      }}>
                      <div>{pkg.hours} {t("hrs")}</div>
                      <div className="text-xs opacity-80">฿{pkg.price?.toLocaleString()}</div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>
                {t("uploadReceipt")} <span className="font-normal">{t("receiptOptional")}</span>
              </label>
              <input type="file" accept="image/*,application/pdf" className="mt-1"
                onChange={e => setAddFile(e.target.files?.[0] || null)} />
              {!addFile && (
                <p className="text-xs mt-1 px-2 py-1 rounded-lg" style={{ background: POS.warningLight, color: POS.warning }}>
                  {t("receiptTip")}
                </p>
              )}
            </div>
          </div>

          {addError && (
            <div className="mt-3 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: POS.dangerLight, color: POS.danger }}>
              {addError}
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button onClick={() => { setAddOpen(false); setAddError(""); }} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleAddCourse} disabled={addSaving}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.success }}>{addSaving ? t("submittingBtn") : t("submit")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* RENEW MODAL */}
      <Dialog open={!!renewCourse} onClose={() => { setRenewCourse(null); setRenewError(""); }} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg" style={{ color: POS.primary }}>
              {renewMode === "add" ? t("addHoursTitle", { course: courseMap[renewCourse || ""]?.name || "" }) : t("submitRenew", { course: courseMap[renewCourse || ""]?.name || "" })}
            </h2>
            <button onClick={() => { setRenewCourse(null); setRenewError(""); }} aria-label={t("close")} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackage")} *</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(courseMap[renewCourse || ""]?.hour_packages || []).map((pkg: any, i: number) => (
                  <motion.button key={i} type="button" whileTap={{ scale: 0.95 }}
                    onClick={() => { setRenewHours(pkg.hours); setRenewError(""); }}
                    className="py-4 rounded-xl text-center font-bold transition-all"
                    style={{
                      background: renewHours === pkg.hours ? POS.primary : POS.bgSurface,
                      color: renewHours === pkg.hours ? "#fff" : POS.primary,
                      border: `2px solid ${renewHours === pkg.hours ? POS.primary : POS.border}`,
                      minHeight: POS.touchLarge,
                    }}>
                    <div className="text-lg">+{pkg.hours} {t("hrs")}</div>
                    <div className="text-xs opacity-80">฿{pkg.price?.toLocaleString()}</div>
                  </motion.button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>
                {t("uploadReceipt")} <span className="font-normal">{t("receiptOptional")}</span>
              </label>
              <input type="file" accept="image/*,application/pdf" className="mt-1"
                onChange={e => setRenewFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          {renewError && (
            <div className="mt-3 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: POS.dangerLight, color: POS.danger }}>
              {renewError}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={() => { setRenewCourse(null); setRenewError(""); }} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleRenewSubmit}
              className="flex-1 py-3 rounded-xl text-white font-bold"
              style={{ background: POS.primary }}>{t("submit")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* CANCEL COURSE MODAL */}
      <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-[2rem] p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <XMarkIcon className="w-12 h-12 mx-auto mb-4" style={{ color: POS.danger }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: POS.textPrimary }}>
              {t("cancelCourse")}
            </h2>
            <p className="text-sm mb-1 font-semibold" style={{ color: POS.primary }}>
              {cancelTarget ? courseMap[cancelTarget.courseId]?.name : ""}
            </p>
            <p className="text-sm mb-6" style={{ color: POS.textMuted }}>
              {isAdmin ? t("confirmCancelCourseAdmin") : t("confirmCancelCourseStaff")}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
              <button onClick={handleCancelCourse} disabled={cancelling}
                className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.danger }}>
                {cancelling ? t("loading") : isAdmin ? t("cancelCourse") : t("sendRequest")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* LATE CHECK-IN MODAL */}
      <Dialog open={!!lateCheckInCourse} onClose={() => setLateCheckInCourse(null)} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg" style={{ color: POS.primary }}>
              {t("lateCheckIn")} — {courseMap[lateCheckInCourse || ""]?.name}
            </h2>
            <button onClick={() => setLateCheckInCourse(null)} aria-label={t("close")} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>
          <p className="text-sm mb-3" style={{ color: POS.textSecondary }}>{t("lateCheckInDesc")}</p>
          <input type="date" className="w-full rounded-xl border px-3 py-3" style={{ borderColor: POS.border }}
            value={lateCheckInDate} onChange={e => setLateCheckInDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]} />
          <div className="mt-3">
            <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("hours")}</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(h => (
                <button key={h} onClick={() => setLateCheckInHours(h)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold"
                  style={{ background: lateCheckInHours === h ? POS.primary : POS.bgSurface, color: lateCheckInHours === h ? "#fff" : POS.textPrimary }}>
                  {h}h
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setLateCheckInCourse(null)} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleLateCheckIn} disabled={!lateCheckInDate}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.primary }}>{t("checkIn")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>
    </div>
  );
}
