import { useState, useMemo } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Dialog } from "@headlessui/react";
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { POS } from "./theme";
import { useToast } from "./hooks/useToast";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS: string[] = [];
for (let h = 6; h < 23; ++h) HOURS.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);

import type { HourPackage } from "./types";
type Course = { id?: string; name: string; weekdays: string[]; times: Record<string, string[]>; capacity: number; hour_packages: HourPackage[]; book_price: number };

function useFetchCourses() {
  return useQuery<Course[]>({
    queryKey: ["courses_full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,name,weekdays,times,capacity,hour_packages,book_price").order("name");
      if (error) throw error;
      return (data || []) as Course[];
    },
    staleTime: 120_000,
  });
}

function useStudentsForCourseEnrollments(courseId: string) {
  return useQuery({
    queryKey: ["students_by_course", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const { data } = await supabase
        .from("enrollments")
        .select("student_id, students(id, first_name, last_name, nick_name)")
        .eq("course_id", courseId).eq("status", "active");
      // Deduplicate by student_id
      const seen = new Set<string>();
      return (data || []).map((e: any) => e.students).filter((s: any) => {
        if (!s || seen.has(s.id)) return false;
        seen.add(s.id); return true;
      });
    },
    enabled: !!courseId,
    staleTime: 60_000,
  });
}

export default function CoursesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"check" | "manage">("check");
  const [courseId, setCourseId] = useState("");

  const { data: courses = [], isLoading } = useFetchCourses();
  const { data: filteredStudents = [], isLoading: loadingStudents } = useStudentsForCourseEnrollments(courseId);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bouncy mb-4" style={{ color: POS.textPrimary }}>{t("courses")}</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(["check", "manage"] as const).map(key => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: tab === key ? POS.primary : POS.bgCard,
              color: tab === key ? "#fff" : POS.textSecondary,
              border: tab === key ? "none" : `1px solid ${POS.border}`,
              boxShadow: tab === key ? POS.shadowSm : "none",
            }}>
            {key === "check" ? t("checkCourses") : t("manageCourses")}
          </button>
        ))}
      </div>

      {tab === "check" ? (
        <CheckTab courses={courses} courseId={courseId} setCourseId={setCourseId}
          students={filteredStudents} loading={loadingStudents} />
      ) : (
        <ManageTab courses={courses} isLoading={isLoading} />
      )}
    </div>
  );
}

function CheckTab({ courses, courseId, setCourseId, students, loading }: {
  courses: Course[]; courseId: string; setCourseId: (id: string) => void;
  students: any[]; loading: boolean;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [dayFilter, setDayFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");

  const selectedCourse = courses.find(c => c.id === courseId);

  const availableDays = useMemo(() => {
    if (!selectedCourse) return [];
    const days = new Set<string>();
    selectedCourse.weekdays?.forEach(d => days.add(d));
    if (selectedCourse.times) Object.keys(selectedCourse.times).forEach(d => days.add(d));
    return WEEKDAYS.filter(d => days.has(d));
  }, [selectedCourse]);

  const availableTimes = useMemo(() => {
    if (!selectedCourse?.times) return [];
    const times = new Set<string>();
    if (dayFilter) {
      selectedCourse.times[dayFilter]?.forEach(t => times.add(t));
    } else {
      Object.values(selectedCourse.times).forEach(slots => slots.forEach(t => times.add(t)));
    }
    return HOURS.filter(h => times.has(h));
  }, [selectedCourse, dayFilter]);

  return (
    <div>
      <select value={courseId} onChange={(e: ChangeEvent<HTMLSelectElement>) => { setCourseId(e.target.value); setDayFilter(""); setTimeFilter(""); }}
        className="w-full rounded-xl border px-4 py-3 mb-3 text-base"
        style={{ borderColor: POS.border, minHeight: POS.touchComfortable }}>
        <option value="">{t("selectCourse")}</option>
        {courses.map(c => <option key={c.id} value={c.id!}>{c.name}</option>)}
      </select>

      {courseId && (
        <div className="flex gap-2 mb-4">
          <select value={dayFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => { setDayFilter(e.target.value); setTimeFilter(""); }}
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: POS.border }}>
            <option value="">{t("allDays") || t("selectDay")}</option>
            {availableDays.map(d => <option key={d} value={d}>{t(d.toLowerCase())}</option>)}
          </select>
          <select value={timeFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTimeFilter(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: POS.border }}>
            <option value="">{t("allTimes") || t("selectTime")}</option>
            {availableTimes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {!courseId ? (
        <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("selectCoursePrompt")}</p>
      ) : loading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white animate-pulse" />)}</div>
      ) : students.length === 0 ? (
        <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noStudentsFound")}</p>
      ) : (
        <div className="space-y-2">
          {students.map((s: any, idx: number) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav(`/students/${s.id}`)}
              className="flex items-center gap-3 p-3 rounded-xl bg-white cursor-pointer hover:shadow-md transition"
              style={{ border: `1px solid ${POS.borderLight}`, boxShadow: POS.shadowSm }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: POS.primary }}>
                {(s.nick_name || s.first_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-bold text-sm" style={{ color: POS.textPrimary }}>
                  {s.nick_name && <span style={{ color: POS.primary }}>"{s.nick_name}" </span>}
                  {s.first_name} {s.last_name}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageTab({ courses, isLoading }: { courses: Course[]; isLoading: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Course | null>(null);
  const [, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; message: string } | null>(null);

  const saveMutation = useMutation<void, any, Course>({
    mutationFn: async (course) => {
      const up = { name: course.name, weekdays: course.weekdays, times: course.times, capacity: course.capacity, hour_packages: course.hour_packages || [], book_price: course.book_price || 0 };
      if (course.id) { const { error } = await supabase.from("courses").update(up).eq("id", course.id); if (error) throw error; }
      else { const { error } = await supabase.from("courses").insert([up]); if (error) throw error; }
    },
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["courses_full"] }); queryClient.invalidateQueries({ queryKey: ["courses"] }); toast(t("courseSaved"), "success"); },
    onError: (err: any) => { setError(err.message); toast(err.message, "error"); },
  });

  const deleteMutation = useMutation<void, any, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses_full"] }); queryClient.invalidateQueries({ queryKey: ["courses"] }); toast(t("courseDeleted"), "success"); },
    onError: (err: any) => toast(err.message, "error"),
  });

  function startEdit(course: Course | null) {
    setEditing(course || { name: "", weekdays: [], times: {}, capacity: 0, hour_packages: [], book_price: 0 });
    setError("");
  }

  return (
    <div>
      {isLoading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}</div>
      ) : (
        <>
          <div className="space-y-3 mb-4">
            {courses.map(c => (
              <div key={c.id} className="bg-white rounded-2xl p-4 border flex items-start gap-3"
                style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                <div className="flex-1">
                  <div className="font-bold" style={{ color: POS.textPrimary }}>{c.name}</div>
                  <div className="text-xs mt-1" style={{ color: POS.textMuted }}>
                    {(c.weekdays || []).join(", ")} | {t("capacityLabel", { capacity: c.capacity || "∞" })}
                  </div>
                  {Object.entries(c.times || {}).map(([d, arr]) => arr.length > 0 && (
                    <div key={d} className="text-xs mt-0.5" style={{ color: POS.textSecondary }}>
                      {d}: {arr.join(", ")}
                    </div>
                  ))}
                  {(c.hour_packages?.length > 0 || c.book_price > 0) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(c.hour_packages || []).map((pkg, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${POS.primary}15`, color: POS.primary }}>
                          {pkg.hours}hrs — ฿{pkg.price?.toLocaleString()}
                        </span>
                      ))}
                      {c.book_price > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: POS.warningLight, color: "#B45309" }}>
                          📕 ฿{c.book_price?.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(c)} aria-label={t("editCourse")} className="p-2 rounded-xl hover:bg-gray-100" style={{ minHeight: "auto" }}>
                    <PencilIcon className="w-4 h-4" style={{ color: POS.info }} />
                  </button>
                  <button onClick={() => setConfirmAction({
                    message: t("deleteThisCourse"),
                    action: async () => { deleteMutation.mutate(c.id!); },
                  })} aria-label={t("deleteCourse")} className="p-2 rounded-xl hover:bg-red-50" style={{ minHeight: "auto" }}>
                    <TrashIcon className="w-4 h-4" style={{ color: POS.danger }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => startEdit(null)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary }}>
            <PlusIcon className="w-5 h-5" /> {t("addCourse")}
          </button>
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmAction !== null} onClose={() => setConfirmAction(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 w-full max-w-sm mx-auto" style={{ boxShadow: POS.shadowXl }}>
            <Dialog.Title className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
              {t("confirm")}
            </Dialog.Title>
            <p className="text-sm mb-6" style={{ color: POS.textSecondary }}>
              {confirmAction?.message}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>
                {t("cancel")}
              </button>
              <button onClick={async () => {
                if (confirmAction) {
                  await confirmAction.action();
                  setConfirmAction(null);
                }
              }}
                className="flex-1 py-3 rounded-xl text-white font-bold"
                style={{ background: POS.danger }}>
                {t("confirm")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Step-by-step Edit Modal */}
      {editing && <CourseWizard course={editing} onSave={(c) => saveMutation.mutate(c)} onClose={() => setEditing(null)} saving={saveMutation.status === "pending"} />}
    </div>
  );
}

function CourseWizard({ course, onSave, onClose, saving }: { course: Course; onSave: (c: Course) => void; onClose: () => void; saving: boolean }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Course>({ ...course, hour_packages: course.hour_packages || [], book_price: course.book_price || 0 });
  const [error, setError] = useState("");
  const totalSteps = 3;

  function toggleDay(day: string) {
    setData(c => {
      const days = c.weekdays.includes(day) ? c.weekdays.filter(d => d !== day) : [...c.weekdays, day];
      const times = { ...c.times };
      if (!days.includes(day)) delete times[day];
      return { ...c, weekdays: days, times };
    });
  }

  function nextStep() {
    setError("");
    if (step === 1 && !data.name.trim()) { setError(t("enterName")); return; }
    if (step === 2 && data.weekdays.length === 0) { setError(t("pleaseSelectDay")); return; }
    if (step < totalSteps) setStep(s => s + 1);
    else {
      const cleanPkgs = data.hour_packages.filter(p => p.hours > 0 && p.price > 0);
      onSave({ ...data, hour_packages: cleanPkgs });
    }
  }

  const stepLabels = [t("courseInfo"), t("schedule"), t("packagesAndPricing")];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ boxShadow: POS.shadowXl }}
        onClick={e => e.stopPropagation()}>
        {/* Header with steps */}
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold" style={{ color: POS.primary }}>
            {data.id ? t("editCourse") : t("newCourse")}
          </h3>
          <button onClick={onClose} style={{ minHeight: "auto" }}>
            <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex-1">
              <div className="h-1.5 rounded-full transition-all" style={{ background: i + 1 <= step ? POS.primary : POS.bgSurface }} />
              <div className="text-[10px] font-bold mt-1 text-center" style={{ color: i + 1 <= step ? POS.primary : POS.textMuted }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Name & Capacity */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("name")} *</span>
              <input className="w-full border rounded-xl px-4 py-3 mt-1 text-lg" style={{ borderColor: POS.border }}
                value={data.name} autoFocus
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setData(c => ({ ...c, name: e.target.value })); setError(""); }} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("capacity")}</span>
              <input type="number" min={0} className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                value={data.capacity || 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setData(c => ({ ...c, capacity: Number(e.target.value) }))} />
              <span className="text-xs mt-1 block" style={{ color: POS.textMuted }}>0 = {t("unlimited") || "unlimited"}</span>
            </label>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("days")} *</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEEKDAYS.map(d => (
                  <button key={d} type="button" onClick={() => { toggleDay(d); setError(""); }}
                    className="px-4 py-3 rounded-xl text-sm font-bold transition"
                    style={{
                      background: data.weekdays.includes(d) ? POS.primary : POS.bgSurface,
                      color: data.weekdays.includes(d) ? "#fff" : POS.primary,
                      border: `2px solid ${data.weekdays.includes(d) ? POS.primary : POS.border}`,
                    }}>
                    {t(`short${d}`, d.slice(0, 3))}
                  </button>
                ))}
              </div>
            </div>

            {data.weekdays.map(day => (
              <div key={day} className="rounded-xl p-3" style={{ background: POS.bgSurface, border: `1px solid ${POS.border}` }}>
                <span className="text-xs font-bold block mb-2" style={{ color: POS.textSecondary }}>{day}</span>
                <div className="flex flex-wrap gap-2">
                  {HOURS.map(h => {
                    const isOn = (data.times[day] || []).includes(h);
                    return (
                      <button key={h} type="button" onClick={() => {
                        setData(c => {
                          const curr = c.times[day] || [];
                          const next = isOn ? curr.filter(t => t !== h) : [...curr, h];
                          return { ...c, times: { ...c.times, [day]: next } };
                        });
                      }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
                        style={{ background: isOn ? POS.primary : "#fff", color: isOn ? "#fff" : POS.primary, border: `1px solid ${POS.primary}` }}>
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Packages & Pricing */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("hourPackages")}</span>
              <div className="space-y-2 mt-2">
                {(data.hour_packages || []).map((pkg, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: POS.bgSurface }}>
                    <div className="flex-1 flex items-center gap-2">
                      <input type="number" min={1} placeholder={t("hours")} className="w-20 border rounded-lg px-3 py-2 text-sm font-bold" style={{ borderColor: POS.border }}
                        value={pkg.hours || ""} onChange={(e: ChangeEvent<HTMLInputElement>) => setData(c => {
                          const pkgs = [...(c.hour_packages || [])];
                          pkgs[i] = { ...pkgs[i], hours: Number(e.target.value) };
                          return { ...c, hour_packages: pkgs };
                        })} />
                      <span className="text-xs font-bold" style={{ color: POS.textMuted }}>{t("hrs")}</span>
                      <span className="text-lg" style={{ color: POS.textMuted }}>—</span>
                      <span className="text-sm font-bold" style={{ color: POS.textMuted }}>฿</span>
                      <input type="number" min={0} placeholder={t("price")} className="w-28 border rounded-lg px-3 py-2 text-sm font-bold" style={{ borderColor: POS.border }}
                        value={pkg.price || ""} onChange={(e: ChangeEvent<HTMLInputElement>) => setData(c => {
                          const pkgs = [...(c.hour_packages || [])];
                          pkgs[i] = { ...pkgs[i], price: Number(e.target.value) };
                          return { ...c, hour_packages: pkgs };
                        })} />
                    </div>
                    <button onClick={() => setData(c => ({ ...c, hour_packages: (c.hour_packages || []).filter((_, idx) => idx !== i) }))}
                      className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: POS.danger, minHeight: "auto" }}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setData(c => ({ ...c, hour_packages: [...(c.hour_packages || []), { hours: 0, price: 0 }] }))}
                  className="w-full flex items-center justify-center gap-1 px-3 py-3 rounded-xl text-sm font-bold"
                  style={{ background: POS.bgSurface, color: POS.primary, border: `2px dashed ${POS.primary}` }}>
                  <PlusIcon className="w-5 h-5" /> {t("addPackage")}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("bookPrice")} (฿)</span>
              <input type="number" min={0} className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                value={data.book_price || ""}
                placeholder="0"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setData(c => ({ ...c, book_price: Number(e.target.value) || 0 }))} />
              <span className="text-xs mt-1 block" style={{ color: POS.textMuted }}>{t("bookPriceHint")}</span>
            </label>
          </div>
        )}

        {error && <p className="text-sm mt-3 px-3 py-2 rounded-xl font-bold" style={{ color: POS.danger, background: POS.dangerLight }}>{error}</p>}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("back")}</button>
          ) : (
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          )}
          <button onClick={nextStep} disabled={saving}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: step === totalSteps ? POS.success : POS.primary }}>
            {step === totalSteps ? (saving ? t("loading") : t("save")) : t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}
