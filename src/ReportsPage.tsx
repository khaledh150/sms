import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChartBarIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useStudents } from "./hooks/useStudents";
import { useCourses } from "./hooks/useCourses";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

const CHART_COLORS = ["#6C5CE7", "#00C853", "#2196F3", "#FFB300", "#E91E63", "#FF5252", "#00BCD4", "#9C27B0"];

function useAttendanceStats30d() {
  return useQuery({
    queryKey: ["attendance_stats_30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_stats_30d")
        .select("total_checkins, unique_students, active_days, school_id")
        .single();
      if (error) throw error;
      return data ?? { total_checkins: 0, unique_students: 0, active_days: 0 };
    },
    staleTime: 120_000,
  });
}

function useCourseUtilization() {
  return useQuery({
    queryKey: ["course_utilization"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_utilization")
        .select("course_id, course_name, capacity, enrolled, checkins_30d, school_id");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });
}

function useAttendanceRecords(dateFrom: string, dateTo: string, courseFilter: string) {
  return useQuery({
    queryKey: ["attendance_records", dateFrom, dateTo, courseFilter],
    queryFn: async () => {
      let query = supabase
        .from("attendance")
        .select("student_id, course_id, attended_at_ts")
        .not("approved_by", "is", null)
        .is("cancelled_by", null)
        .order("attended_at_ts", { ascending: false })
        .limit(200);
      if (dateFrom) query = query.gte("attended_at_ts", dateFrom);
      if (dateTo) query = query.lte("attended_at_ts", dateTo + "T23:59:59");
      if (courseFilter) query = query.eq("course_id", courseFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function useAttendanceByDay() {
  return useQuery({
    queryKey: ["attendance_by_day"],
    queryFn: async () => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 30);
      const thirtyDaysAgo = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("attendance")
        .select("attended_at_ts")
        .not("approved_by", "is", null)
        .gte("attended_at_ts", thirtyDaysAgo);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach(a => {
        const day = a.attended_at_ts.slice(0, 10);
        counts[day] = (counts[day] || 0) + 1;
      });
      // Fill in missing days
      const result = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const dd = new Date(now);
        dd.setDate(dd.getDate() - i);
        const key = dd.toISOString().slice(0, 10);
        result.push({ date: key.slice(5), count: counts[key] || 0 });
      }
      return result;
    },
    staleTime: 120_000,
  });
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: attendanceStats } = useAttendanceStats30d();
  const { data: courseUtil = [] } = useCourseUtilization();
  const { data: attendanceByDay = [] } = useAttendanceByDay();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recordCourse, setRecordCourse] = useState("");
  const { data: attendanceRecords = [] } = useAttendanceRecords(recordDate, recordDate, recordCourse);

  const totalCheckIns = attendanceStats?.total_checkins ?? 0;
  const activeStudentCount = attendanceStats?.unique_students ?? 0;

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  // Pie chart data from course utilization
  const pieData = courseUtil.map(c => ({ name: c.course_name, value: c.enrolled || 0 }));

  const studentMap = useMemo(() => {
    const m: Record<string, { first_name: string; last_name: string; nick_name: string | null }> = {};
    students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  const groupedRecords = useMemo(() => {
    const map = new Map<string, { courseName: string; entries: { name: string; studentId: string; time: string }[] }>();
    attendanceRecords.forEach(a => {
      const cName = courseMap[a.course_id]?.name || "Unknown";
      if (!map.has(a.course_id)) map.set(a.course_id, { courseName: cName, entries: [] });
      const stu = studentMap[a.student_id];
      const name = stu ? (stu.nick_name ? `${stu.nick_name} '${stu.first_name}'` : `${stu.first_name} ${stu.last_name}`) : a.student_id.slice(0, 8);
      const time = new Date(a.attended_at_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      map.get(a.course_id)!.entries.push({ name, studentId: a.student_id, time });
    });
    return Array.from(map.values());
  }, [attendanceRecords, courseMap, studentMap]);

  function exportCSV() {
    const headers = ["Date", "Course", "Student", "Time"];
    const rows = attendanceRecords.map(a => {
      const stu = studentMap[a.student_id];
      const name = stu ? (stu.nick_name || stu.first_name) : a.student_id;
      return [
        new Date(a.attended_at_ts).toLocaleDateString(),
        courseMap[a.course_id]?.name || a.course_id,
        name,
        new Date(a.attended_at_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ];
    });
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bouncy mb-6" style={{ color: POS.textPrimary }}>
        <ChartBarIcon className="w-7 h-7 inline mr-2" style={{ color: POS.info }} />
        {t("reports")}
      </h1>

      {/* 1. Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: <UsersIcon className="w-6 h-6" />, value: students.length, label: t("totalStudents"), color: POS.primary },
          { icon: <AcademicCapIcon className="w-6 h-6" />, value: courses.length, label: t("courses"), color: POS.info },
          { icon: <ClipboardDocumentCheckIcon className="w-6 h-6" />, value: totalCheckIns, label: t("checkIns30d"), color: POS.success },
          { icon: <UsersIcon className="w-6 h-6" />, value: activeStudentCount, label: t("active30d"), color: POS.warning },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4 bg-white text-center" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
            <div className="mx-auto mb-1" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: POS.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 2. Date Filter Bar + Export */}
      <div className="bg-white rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
        <FunnelIcon className="w-5 h-5 flex-shrink-0" style={{ color: POS.textMuted }} />
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: POS.textSecondary }}>{t("dateFrom")}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: POS.border, color: POS.textPrimary }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: POS.textSecondary }}>{t("dateTo")}</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: POS.border, color: POS.textPrimary }}
          />
        </div>
        {hasDateFilter && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-lg"
            style={{ color: POS.danger, background: POS.dangerLight }}
          >
            <XMarkIcon className="w-4 h-4" />
            {t("clearFilter")}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-all active:scale-95"
          style={{ background: POS.primary }}
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {t("exportCSV")}
        </button>
      </div>

      {/* 3. Check-ins Over Time Line Chart */}
      <section className="mb-6">
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: POS.textPrimary }}>
            {t("checkInsOverTime")}
          </h2>
          {attendanceByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={attendanceByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={POS.borderLight} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: POS.textMuted }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: POS.textMuted }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${POS.borderLight}`,
                    boxShadow: POS.shadowMd,
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={POS.primary}
                  strokeWidth={2.5}
                  dot={{ fill: POS.primary, r: 3 }}
                  activeDot={{ r: 5, fill: POS.primary }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noAttendanceData")}</p>
          )}
        </div>
      </section>

      {/* 4. Enrollment Distribution Pie Chart */}
      <section className="mb-6">
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: POS.textPrimary }}>
            {t("enrollmentDistribution")}
          </h2>
          {pieData.length > 0 && pieData.some(d => d.value > 0) ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={(props: any) => {
                      const pct = (props.percent || 0) * 100;
                      if (pct < 5) return null;
                      return `${props.name || ""} (${pct.toFixed(0)}%)`;
                    }}
                    labelLine={(props: any) => {
                      if ((props.percent || 0) * 100 < 5) return <line key={props.key} />;
                      return (
                        <line
                          key={props.key}
                          x1={props.points?.[0]?.x} y1={props.points?.[0]?.y}
                          x2={props.points?.[1]?.x} y2={props.points?.[1]?.y}
                          stroke={POS.textMuted} strokeWidth={1}
                        />
                      );
                    }}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: `1px solid ${POS.borderLight}`,
                      boxShadow: POS.shadowMd,
                      fontSize: 13,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noAttendanceData")}</p>
          )}
        </div>
      </section>

      {/* 5. Course Utilization */}
      <section className="mb-6">
        <h2 className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
          {t("courseUtilization")}
        </h2>
        <div className="space-y-2">
          {courseUtil.map(c => {
            const enrolled = c.enrolled || 0;
            const capacity = c.capacity || 0;
            const utilPct = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
            const checkIns = c.checkins_30d || 0;

            return (
              <div key={c.course_id} className="bg-white rounded-xl p-4 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold" style={{ color: POS.textPrimary }}>{c.course_name}</span>
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

      {/* 6. Attendance Record — full daily report */}
      <section>
        <h2 className="text-lg font-bouncy mb-3" style={{ color: POS.textPrimary }}>
          {t("attendanceRecord")}
        </h2>
        <div className="bg-white rounded-2xl p-4 mb-3 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm flex-1 min-w-[140px]" style={{ borderColor: POS.border }} />
            <select value={recordCourse} onChange={e => setRecordCourse(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm flex-1 min-w-[140px]" style={{ borderColor: POS.border }}>
              <option value="">{t("allCourses")}</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex gap-1">
              <button onClick={() => {
                const d = new Date(recordDate);
                d.setDate(d.getDate() - 1);
                setRecordDate(d.toISOString().slice(0, 10));
              }} className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: POS.bgSurface, color: POS.textSecondary }}>←</button>
              <button onClick={() => setRecordDate(new Date().toISOString().slice(0, 10))}
                className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: POS.bgSurface, color: POS.primary }}>
                {t("today")}
              </button>
              <button onClick={() => {
                const d = new Date(recordDate);
                d.setDate(d.getDate() + 1);
                setRecordDate(d.toISOString().slice(0, 10));
              }} className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: POS.bgSurface, color: POS.textSecondary }}>→</button>
            </div>
          </div>
          <div className="mt-2 text-xs font-bold" style={{ color: POS.textMuted }}>
            {new Date(recordDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" — "}{attendanceRecords.length} {t("checkIn").toLowerCase()}(s)
          </div>
        </div>

        {groupedRecords.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border" style={{ borderColor: POS.borderLight }}>
            <ClipboardDocumentCheckIcon className="w-10 h-10 mx-auto mb-2" style={{ color: "#d0d0d0" }} />
            <p className="text-sm font-bold" style={{ color: POS.textMuted }}>{t("noAttendanceData")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedRecords.map((group, i) => {
              const colors = [POS.primary, POS.success, POS.info, POS.warning, "#E91E63"];
              const color = colors[i % colors.length];
              return (
                <div key={i} className="bg-white rounded-2xl p-4 border" style={{ borderColor: POS.borderLight }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: color }}>
                      {group.courseName.charAt(0)}
                    </div>
                    <span className="font-bouncy text-base" style={{ color: POS.textPrimary }}>{group.courseName}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
                      {group.entries.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.entries.map((entry, j) => (
                      <div key={j} className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm"
                        style={{ background: POS.bgSurface }}>
                        <span className="text-xs font-bold w-5 text-center" style={{ color: POS.textMuted }}>{j + 1}</span>
                        <span className="font-bold flex-1" style={{ color: POS.textPrimary }}>{entry.name}</span>
                        <span className="text-xs font-semibold" style={{ color: POS.textMuted }}>{entry.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
