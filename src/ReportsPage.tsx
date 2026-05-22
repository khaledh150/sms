import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChartBarIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useStudents } from "./hooks/useStudents";
import { useCourses } from "./hooks/useCourses";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

function useAttendanceStats() {
  return useQuery({
    queryKey: ["attendance_stats"],
    queryFn: async () => {
      // Get all attendance with approved_by (completed check-ins)
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, course_id, attended_at_ts")
        .not("approved_by", "is", null)
        .order("attended_at_ts", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });
}

function useEnrollmentStats() {
  return useQuery({
    queryKey: ["enrollment_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id, status")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: attendanceData = [] } = useAttendanceStats();
  const { data: enrollments = [] } = useEnrollmentStats();

  // Per-course enrollment count
  const courseEnrollmentMap = useMemo(() => {
    const m: Record<string, number> = {};
    enrollments.forEach(e => { m[e.course_id] = (m[e.course_id] || 0) + 1; });
    return m;
  }, [enrollments]);

  // Per-course attendance count (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const recentAttendance = useMemo(() =>
    attendanceData.filter(a => a.attended_at_ts >= thirtyDaysAgo),
    [attendanceData, thirtyDaysAgo]
  );

  const courseAttendanceMap = useMemo(() => {
    const m: Record<string, number> = {};
    recentAttendance.forEach(a => {
      if (a.course_id) m[a.course_id] = (m[a.course_id] || 0) + 1;
    });
    return m;
  }, [recentAttendance]);

  // Unique students who attended in last 30 days
  const activeStudentCount = new Set(recentAttendance.map(a => a.student_id)).size;

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-6" style={{ color: POS.textPrimary }}>
        <ChartBarIcon className="w-7 h-7 inline mr-2" style={{ color: POS.info }} />
        {t("reports")}
      </h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: <UsersIcon className="w-6 h-6" />, value: students.length, label: t("totalStudents"), color: POS.primary },
          { icon: <AcademicCapIcon className="w-6 h-6" />, value: courses.length, label: t("courses"), color: POS.info },
          { icon: <ClipboardDocumentCheckIcon className="w-6 h-6" />, value: recentAttendance.length, label: t("checkIns30d"), color: POS.success },
          { icon: <UsersIcon className="w-6 h-6" />, value: activeStudentCount, label: t("active30d"), color: POS.warning },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4 bg-white text-center" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
            <div className="mx-auto mb-1" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: POS.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Course Utilization */}
      <section className="mb-6">
        <h2 className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
          {t("courseUtilization")}
        </h2>
        <div className="space-y-2">
          {courses.map(c => {
            const enrolled = courseEnrollmentMap[c.id] || 0;
            const capacity = c.capacity || 0;
            const utilPct = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
            const checkIns = courseAttendanceMap[c.id] || 0;

            return (
              <div key={c.id} className="bg-white rounded-xl p-4 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold" style={{ color: POS.textPrimary }}>{c.name}</span>
                  <span className="text-sm" style={{ color: POS.textMuted }}>
                    {t("enrolledCapacity", { enrolled, capacity: capacity || "∞" })}
                  </span>
                </div>
                {/* Progress bar */}
                {capacity > 0 && (
                  <div className="w-full h-3 rounded-full overflow-hidden mb-2" style={{ background: POS.bgSurface }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(utilPct, 100)}%`,
                        background: utilPct > 90 ? POS.danger : utilPct > 70 ? POS.warning : POS.success,
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-4 text-xs" style={{ color: POS.textMuted }}>
                  <span>{t("capacityUsed", { pct: utilPct })}</span>
                  <span>{t("checkIns30dCount", { count: checkIns })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Attendance */}
      <section>
        <h2 className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
          {t("recentAttendance")}
        </h2>
        {recentAttendance.length === 0 ? (
          <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noAttendanceData")}</p>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight }}>
            <div className="max-h-80 overflow-y-auto">
              {recentAttendance.slice(0, 30).map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 border-b last:border-0"
                  style={{ borderColor: POS.borderLight }}>
                  <div className="text-sm" style={{ color: POS.textPrimary }}>
                    {courseMap[a.course_id]?.name || "—"}
                  </div>
                  <div className="text-xs" style={{ color: POS.textMuted }}>
                    {new Date(a.attended_at_ts).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
