import { useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { POS } from "./theme";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS: string[] = [];
for (let h = 6; h < 23; ++h) HOURS.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);

type Course = { id?: string; name: string; weekdays: string[]; times: Record<string, string[]>; capacity: number };

function useFetchCourses() {
  return useQuery<Course[]>({
    queryKey: ["courses_full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,name,weekdays,times,capacity").order("name");
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
      <h1 className="text-2xl font-extrabold mb-4" style={{ color: POS.textPrimary }}>{t("courses")}</h1>

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

  return (
    <div>
      <select value={courseId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCourseId(e.target.value)}
        className="w-full rounded-xl border px-4 py-3 mb-4 text-base"
        style={{ borderColor: POS.border, minHeight: POS.touchComfortable }}>
        <option value="">{t("selectCourse")}</option>
        {courses.map(c => <option key={c.id} value={c.id!}>{c.name}</option>)}
      </select>

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
  const [editing, setEditing] = useState<Course | null>(null);
  const [error, setError] = useState("");

  const saveMutation = useMutation<void, any, Course>({
    mutationFn: async (course) => {
      const up = { name: course.name, weekdays: course.weekdays, times: course.times, capacity: course.capacity };
      if (course.id) { const { error } = await supabase.from("courses").update(up).eq("id", course.id); if (error) throw error; }
      else { const { error } = await supabase.from("courses").insert([up]); if (error) throw error; }
    },
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["courses_full"] }); queryClient.invalidateQueries({ queryKey: ["courses"] }); },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation<void, any, string>({
    mutationFn: async (id) => {
      if (!confirm(t("deleteThisCourse"))) return;
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses_full"] }); queryClient.invalidateQueries({ queryKey: ["courses"] }); },
  });

  function startEdit(course: Course | null) {
    setEditing(course || { name: "", weekdays: [], times: {}, capacity: 0 });
    setError("");
  }

  function toggleDay(day: string) {
    setEditing(c => {
      if (!c) return c;
      const days = c.weekdays.includes(day) ? c.weekdays.filter(d => d !== day) : [...c.weekdays, day];
      const times = { ...c.times };
      if (!days.includes(day)) delete times[day];
      return { ...c, weekdays: days, times };
    });
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
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(c)} className="p-2 rounded-xl hover:bg-gray-100" style={{ minHeight: "auto" }}>
                    <PencilIcon className="w-4 h-4" style={{ color: POS.info }} />
                  </button>
                  <button onClick={() => deleteMutation.mutate(c.id!)} className="p-2 rounded-xl hover:bg-red-50" style={{ minHeight: "auto" }}>
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

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ boxShadow: POS.shadowXl }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold" style={{ color: POS.primary }}>
                {editing.id ? t("editCourse") : t("newCourse")}
              </h3>
              <button onClick={() => setEditing(null)} style={{ minHeight: "auto" }}>
                <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
              </button>
            </div>

            <label className="block mb-3">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("name")}</span>
              <input className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editing.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditing(c => c ? { ...c, name: e.target.value } : c)} />
            </label>
            <label className="block mb-3">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("capacity")}</span>
              <input type="number" min={0} className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                value={editing.capacity || 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditing(c => c ? { ...c, capacity: Number(e.target.value) } : c)} />
            </label>

            <div className="mb-3">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("days")}</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEEKDAYS.map(d => (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className="px-3 py-2 rounded-xl text-sm font-semibold transition"
                    style={{
                      background: editing.weekdays.includes(d) ? POS.primary : POS.bgSurface,
                      color: editing.weekdays.includes(d) ? "#fff" : POS.primary,
                    }}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {editing.weekdays.map(day => (
              <div key={day} className="mb-3 ml-2">
                <span className="text-xs font-bold" style={{ color: POS.textSecondary }}>{t("dayTimes", { day })}</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(editing.times[day] || []).map((tt, i) => (
                    <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ background: POS.bgSurface, color: POS.primary }}>
                      {tt}
                      <button onClick={() => setEditing(c => c ? { ...c, times: { ...c.times, [day]: c.times[day].filter((_: string, idx: number) => idx !== i) } } : c)}
                        className="ml-1 font-bold" style={{ color: POS.danger, minHeight: "auto" }}>x</button>
                    </span>
                  ))}
                  <select className="border rounded-xl px-2 py-1 text-sm" style={{ borderColor: POS.border }} defaultValue=""
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      if (e.target.value) {
                        setEditing(c => c ? { ...c, times: { ...c.times, [day]: [...(c.times[day] || []), e.target.value] } } : c);
                        e.target.value = "";
                      }
                    }}>
                    <option value="">{t("addTime")}</option>
                    {HOURS.filter(h => !(editing.times[day] || []).includes(h)).map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            ))}

            {error && <p className="text-sm mb-2" style={{ color: POS.danger }}>{error}</p>}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditing(null)} className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
              <button onClick={() => { if (!editing.name) { setError(t("enterName")); return; } saveMutation.mutate(editing); }}
                disabled={saveMutation.status === "pending"}
                className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.success }}>{t("save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
