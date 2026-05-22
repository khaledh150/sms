import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Dialog } from "@headlessui/react";
import {
  TrashIcon, PlusIcon, ArrowPathIcon, XMarkIcon,
  CheckCircleIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronRightIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { useStudent, useStudentEnrollments, useStudentNotes } from "./hooks/useStudents";
import { useStudentAttendance } from "./hooks/useAttendance";
import { useCourses } from "./hooks/useCourses";
import { addStudentNote } from "./services/students";
import { POS } from "./theme";

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
  const { data: notes = [] } = useStudentNotes(id);

  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renewCourse, setRenewCourse] = useState<string | null>(null);
  const [renewHours, setRenewHours] = useState(1);
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add course modal state
  const [addCourse, setAddCourse] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [addTime, setAddTime] = useState<string | null>(null);
  const [addHours, setAddHours] = useState(1);
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
    alert(t("submitRenewal"));
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [renewError, setRenewError] = useState("");

  async function handleAddCourse() {
    setAddError("");
    if (!addCourse) { setAddError(t("pleaseSelectCourse")); return; }
    if (!addDay) { setAddError(t("pleaseSelectDay")); return; }
    if (!addTime) { setAddError(t("pleaseSelectTime")); return; }
    if (addHours < 1) { setAddError(t("hoursMustBeOne")); return; }

    setAddSaving(true);
    let receiptUrls: string[] = [];
    if (addFile) {
      const fn = `${Date.now()}-${addFile.name}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, addFile);
      if (ue) { setAddError(t("uploadFailed", { message: ue.message })); setAddSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      receiptUrls = [pu.publicUrl];
    }

    await supabase.from("application_changes").insert([{
      student_id: student!.id, type: "edit", status: "pending",
      changes: {
        course_changes: { [addCourse]: { [addDay]: [addTime] } },
        course_limits: { [addCourse]: addHours },
        ...(receiptUrls.length > 0 ? { receipts: receiptUrls } : {}),
      },
    }]);
    setAddSaving(false);
    setAddOpen(false); setAddCourse(null); setAddDay(null); setAddTime(null); setAddFile(null); setAddHours(1);
    alert(t("submitAdd"));
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  async function handleAddNote() {
    if (!noteText.trim() || !user?.id || !id) return;
    await addStudentNote(id, user.id, noteText.trim(), noteCategory);
    setNoteText("");
    queryClient.invalidateQueries({ queryKey: ["student_notes", id] });
  }

  async function handleDeleteStudent() {
    if (!student) return;
    setDeleting(true);
    await supabase.from("students").delete().eq("id", student.id);
    setDeleting(false);
    setDeleteOpen(false);
    queryClient.invalidateQueries({ queryKey: ["students"] });
    nav("/students");
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
              {student.parent_line_id && <span>LINE: {student.parent_line_id}</span>}
              {student.joined_at && <span>{t("joined")}: {new Date(student.joined_at).toLocaleDateString("en-GB")}</span>}
            </div>
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-2 rounded-xl hover:bg-red-50 transition"
            style={{ color: POS.danger, minHeight: "auto" }}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* QR Code */}
      {(student as any).qr_code_url && (
        <div className="bg-white rounded-2xl p-4 border flex items-center gap-4" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <img src={(student as any).qr_code_url} alt="QR Code" className="w-20 h-20 rounded-lg" />
          <div className="flex-1">
            <div className="font-bold text-sm mb-1" style={{ color: POS.textPrimary }}>{t("studentQrCode")}</div>
            <div className="text-xs mb-2" style={{ color: POS.textMuted }}>{t("scanToCheckIn")}</div>
            <div className="flex gap-2">
              <a href={(student as any).qr_code_url} download className="px-3 py-1 rounded-lg text-xs font-bold"
                style={{ background: POS.bgSurface, color: POS.primary }}>{t("download")}</a>
              <button onClick={() => {
                const w = window.open("");
                if (w) { w.document.write(`<img src="${(student as any).qr_code_url}" onload="window.print();window.close()" />`); w.document.close(); }
              }} className="px-3 py-1 rounded-lg text-xs font-bold"
                style={{ background: POS.bgSurface, color: POS.primary }}>{t("print")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Enrolled Courses */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: POS.textPrimary }}>{t("enrolledCourses")}</h2>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold"
            style={{ background: POS.bgSurface, color: POS.primary }}>
            <PlusIcon className="w-4 h-4" /> {t("addCourse")}
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
              const used = att.length;
              const purchased = enr.purchased_hours;
              const remaining = purchased - used;
              const isOverlimit = purchased > 0 && remaining <= 0;
              const isExpanded = expandedCourse === enr.id;

              return (
                <div key={enr.id} className="bg-white rounded-2xl border overflow-hidden"
                  style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                  <div className="p-4 flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: isOverlimit ? POS.danger : POS.success }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold" style={{ color: POS.textPrimary }}>
                        {course?.name || enr.course_id}
                      </div>
                      <div className="text-xs" style={{ color: POS.textMuted }}>
                        {enr.weekday && `${enr.weekday}`}
                        {enr.time_slot && ` ${enr.time_slot}`}
                      </div>
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
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: POS.successLight, color: POS.success }}>
                        <CheckCircleIcon className="w-3.5 h-3.5" /> {t("ongoing")}
                      </span>
                    )}
                    <button onClick={() => setExpandedCourse(isExpanded ? null : enr.id)}
                      className="p-1" style={{ minHeight: "auto" }}>
                      {isExpanded
                        ? <ChevronDownIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
                        : <ChevronRightIcon className="w-5 h-5" style={{ color: POS.textMuted }} />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: POS.borderLight, background: POS.bgMain }}>
                      <div className="flex gap-2">
                        {isOverlimit && (
                          <button onClick={() => setRenewCourse(enr.course_id)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white"
                            style={{ background: POS.primary }}>
                            <ArrowPathIcon className="w-4 h-4" /> {t("renew")}
                          </button>
                        )}
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

      {/* Student Notes */}
      <section>
        <h2 className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
          <PencilSquareIcon className="w-5 h-5 inline mr-1" />
          {t("notes")}
        </h2>
        <div className="bg-white rounded-2xl p-4 border space-y-3" style={{ borderColor: POS.border, boxShadow: POS.shadowSm }}>
          <div className="flex gap-2">
            <select
              value={noteCategory}
              onChange={e => setNoteCategory(e.target.value)}
              className="rounded-xl px-3 py-2 border text-sm"
              style={{ borderColor: POS.border }}
            >
              <option value="general">{t("general")}</option>
              <option value="behavior">{t("behavior")}</option>
              <option value="health">{t("health")}</option>
              <option value="payment">{t("payment")}</option>
              <option value="academic">{t("academic")}</option>
            </select>
            <input
              type="text"
              placeholder={t("addNotePlaceholder")}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddNote()}
              className="flex-1 rounded-xl px-3 py-2 border text-sm"
              style={{ borderColor: POS.border }}
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim()}
              className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              style={{ background: POS.primary }}
            >
              {t("addNoteBtn")}
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm" style={{ color: POS.textMuted }}>{t("noNotesYet")}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notes.map((n: any) => (
                <div key={n.id} className="p-3 rounded-xl" style={{ background: POS.bgMain }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        background: n.category === "payment" ? POS.warningLight
                          : n.category === "health" ? POS.dangerLight
                            : n.category === "behavior" ? POS.infoLight
                              : POS.bgSurface,
                        color: n.category === "payment" ? POS.warning
                          : n.category === "health" ? POS.danger
                            : n.category === "behavior" ? POS.info
                              : POS.primary,
                      }}>
                      {t(n.category)}
                    </span>
                    <span className="text-xs" style={{ color: POS.textMuted }}>
                      {n.profiles?.full_name || t("staff")} - {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: POS.textPrimary }}>{n.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: POS.dangerLight }}>
              <TrashIcon className="w-8 h-8" style={{ color: POS.danger }} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: POS.textPrimary }}>{t("deleteConfirmTitle")}</h2>
            <p className="text-sm mb-6" style={{ color: POS.textSecondary }}>{t("deleteStudentConfirm")}</p>
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

      {/* ADD COURSE MODAL */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setAddError(""); }} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg" style={{ color: POS.primary }}>{t("addNewCourse")}</h2>
            <button onClick={() => { setAddOpen(false); setAddError(""); }} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            {[{ key: "stepCourse", done: !!addCourse }, { key: "stepDay", done: !!addDay }, { key: "stepTime", done: !!addTime }, { key: "stepHours", done: addHours >= 1 }].map((step, i) => (
              <div key={step.key} className="flex items-center gap-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: step.done ? POS.success : POS.bgSurface, color: step.done ? "#fff" : POS.textMuted }}>
                  {step.done ? "✓" : i + 1}
                </div>
                <span className="text-xs" style={{ color: step.done ? POS.success : POS.textMuted }}>{t(step.key)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("selectCourseLabel")}</label>
              <select className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: !addCourse && addError ? POS.danger : POS.border }}
                value={addCourse || ""} onChange={e => { setAddCourse(e.target.value); setAddDay(null); setAddTime(null); setAddError(""); }}>
                <option value="">{t("chooseCourse")}</option>
                {courses.filter(c => !enrolledCourseIds.has(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {addCourse && (
              <div>
                <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("selectDayLabel")}</label>
                <select className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: !addDay && addError ? POS.danger : POS.border }}
                  value={addDay || ""} onChange={e => { setAddDay(e.target.value); setAddTime(null); setAddError(""); }}>
                  <option value="">{t("chooseDay")}</option>
                  {(courseMap[addCourse]?.weekdays || []).map((d: string) => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}

            {addDay && addCourse && (
              <div>
                <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("selectTimeLabel")}</label>
                <select className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: !addTime && addError ? POS.danger : POS.border }}
                  value={addTime || ""} onChange={e => { setAddTime(e.target.value); setAddError(""); }}>
                  <option value="">{t("chooseTime")}</option>
                  {(courseMap[addCourse]?.times?.[addDay] || []).map((tt: string) => <option key={tt}>{tt}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackageLabel")}</label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[10, 20, 30].map(h => (
                  <motion.button key={h} type="button" whileTap={{ scale: 0.95 }}
                    onClick={() => { setAddHours(h); setAddError(""); }}
                    className="py-3 rounded-xl text-center font-bold transition-all"
                    style={{
                      background: addHours === h ? POS.primary : POS.bgSurface,
                      color: addHours === h ? "#fff" : POS.primary,
                      border: `2px solid ${addHours === h ? POS.primary : POS.border}`,
                    }}>
                    +{h} {t("hrs")}
                  </motion.button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: POS.textSecondary }}>{t("customLabel")}</span>
                <input type="number" min={1} className="flex-1 rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: POS.border }} value={addHours}
                  onChange={e => { setAddHours(Number(e.target.value)); setAddError(""); }} />
              </div>
            </div>

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
              {t("submitRenew", { course: courseMap[renewCourse || ""]?.name || "" })}
            </h2>
            <button onClick={() => { setRenewCourse(null); setRenewError(""); }} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackage")} *</label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[10, 20, 30].map(h => (
                  <motion.button key={h} type="button" whileTap={{ scale: 0.95 }}
                    onClick={() => { setRenewHours(h); setRenewError(""); }}
                    className="py-4 rounded-xl text-center font-bold text-lg transition-all"
                    style={{
                      background: renewHours === h ? POS.primary : POS.bgSurface,
                      color: renewHours === h ? "#fff" : POS.primary,
                      border: `2px solid ${renewHours === h ? POS.primary : POS.border}`,
                      minHeight: POS.touchLarge,
                    }}>
                    +{h} {t("hrs")}
                  </motion.button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("customLabel")}</span>
                <input type="number" min={1} className="flex-1 rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: POS.border }} value={renewHours}
                  onChange={e => { setRenewHours(Number(e.target.value)); setRenewError(""); }}
                  onFocus={() => setRenewHours(0)} />
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
    </div>
  );
}
