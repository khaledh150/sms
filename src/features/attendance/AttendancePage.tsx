import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { supabase } from "../../supabaseClient";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import { useAllEnrolledStudents } from "../../hooks/useStudents";
import { useCourses } from "../../hooks/useCourses";
import type { AttendanceRow } from "../../services/attendance";
import { todayStr } from "../../services/attendance";
import { getTodayWeekday } from "../../services/courses";
import type { CourseGroup } from "./types";

const TILE_COLORS = [POS.primary, POS.info, POS.warning, "#E91E63", POS.success, "#8B5CF6", "#0EA5E9", "#F97316"];

export default function AttendancePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: allEnrolled = [] } = useAllEnrolledStudents();
  const { data: allCourses = [] } = useCourses();
  const [rows, setRows] = useState<AttendanceRow[]>([]);

  useEffect(() => {
    const fetchRows = () =>
      supabase.from("attendance").select("id,student_id,course_id,attended_at_ts,approved_by,cancelled_by")
        .gte("attended_at_ts", todayStr())
        .is("cancelled_by", null)
        .then(({ data }) => setRows((data ?? []) as AttendanceRow[]));

    fetchRows();

    const channel = supabase.channel("attendance_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        fetchRows();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const approvedRows = useMemo(() => rows.filter(r => r.approved_by), [rows]);

  const checkedInSet = useMemo(() => {
    const m = new Map<string, Set<string>>();
    approvedRows.forEach(r => {
      if (!r.course_id) return;
      if (!m.has(r.course_id)) m.set(r.course_id, new Set());
      m.get(r.course_id)!.add(r.student_id);
    });
    return m;
  }, [approvedRows]);

  const todayWeekday = useMemo(() => getTodayWeekday(), []);

  const groupedByCourse = useMemo(() => {
    const map = new Map<string, CourseGroup>();
    allCourses.forEach(c => {
      if (c.id) map.set(c.id, { courseName: c.name, courseId: c.id, students: [] });
    });
    allEnrolled.forEach(s => {
      const key = s.course_id;
      if (!map.has(key)) map.set(key, { courseName: s.course_name, courseId: s.course_id, students: [] });
      const group = map.get(key)!;
      if (group.students.some(x => x.student_id === s.student_id)) return;

      const isExpected = !!(s.schedule && s.schedule[todayWeekday]?.length > 0);
      group.students.push({
        student_id: s.student_id,
        first_name: s.first_name,
        last_name: s.last_name,
        nick_name: s.nick_name,
        purchased_hours: s.purchased_hours,
        initial_used_hours: s.initial_used_hours ?? 0,
        isExpectedToday: isExpected,
        photo_url: s.photo_url ?? null,
      });
    });
    return Array.from(map.values());
  }, [allEnrolled, allCourses, todayWeekday]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groupedByCourse;
    const q = search.toLowerCase();
    return groupedByCourse.filter(g => g.courseName.toLowerCase().includes(q));
  }, [groupedByCourse, search]);

  return (
    <div className="min-h-screen pb-32" style={{ background: POS.bgMain }}>
      <div className="px-6 pt-10 pb-4 sticky top-[56px] z-20" style={{ background: "rgba(248, 249, 254, 0.9)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bouncy tracking-tight mb-4" style={{ color: POS.primaryDark }}>{t("takeAttendance")}</h1>
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: POS.textMuted }} />
            <input
              type="text"
              placeholder={t("searchCourses")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl text-base font-semibold focus:outline-none"
              style={{ border: `2px solid ${POS.borderPurple}`, background: "#fff" }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: POS.textMuted }}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-2">
        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-4 block">🏝️</span>
            <p className="text-2xl font-bouncy" style={{ color: POS.textMuted }}>
              {search ? t("noCoursesFound") : t("noClassesScheduled")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filtered.map((group, i) => {
              const color = TILE_COLORS[i % TILE_COLORS.length];
              const checkedSet = checkedInSet.get(group.courseId);
              const checkedCount = checkedSet?.size ?? 0;
              const totalStudents = group.students.length;

              return (
                <motion.button
                  key={group.courseId}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/attendance/${group.courseId}`)}
                  className="btn-gummy flex flex-col items-center justify-center p-5 rounded-[2rem] bg-white shadow-md border-2 relative overflow-hidden"
                  style={{ borderColor: color + "33", aspectRatio: "1/1" }}
                >
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white text-3xl sm:text-4xl font-bouncy mb-3 shadow-lg"
                    style={{ background: color }}
                  >
                    {group.courseName.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="text-base sm:text-lg font-bouncy leading-tight text-center line-clamp-2 mb-2" style={{ color: POS.textPrimary }}>
                    {group.courseName}
                  </h3>
                  <div
                    className="text-sm font-extrabold px-3 py-1 rounded-full"
                    style={{
                      background: checkedCount > 0 ? "rgba(52, 211, 153, 0.15)" : "rgba(0,0,0,0.04)",
                      color: checkedCount > 0 ? POS.success : POS.textMuted,
                    }}
                  >
                    {checkedCount} / {totalStudents}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
