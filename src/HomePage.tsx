import { useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  UsersIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
} from "@heroicons/react/24/solid";
import { useAuth } from "./AuthContext";
import { usePendingReviewCount } from "./hooks/useApplications";
import { useExpectedToday, useStudents } from "./hooks/useStudents";
import { POS } from "./theme";
import { supabase } from "./supabaseClient";
import { todayStr } from "./services/attendance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./hooks/useToast";

export default function HomePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const { data: school } = useQuery({
    queryKey: ["my_school"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("name").limit(1).single();
      return data;
    },
    staleTime: 300_000,
  });

  const { data: reviewCount } = usePendingReviewCount(isAdmin);
  const { data: expected = [] } = useExpectedToday();
  const { data: students = [] } = useStudents();
  const queryClient = useQueryClient();

  // Today's approved check-ins with full details for the feed
  const { data: todayAttendance = [] } = useQuery<any[]>({
    queryKey: ["home_attendance_today"],
    queryFn: async () => {
      const { data } = await supabase.from("attendance")
        .select("id,student_id,course_id,attended_at_ts,approved_by")
        .gte("attended_at_ts", todayStr())
        .not("approved_by", "is", null)
        .order("attended_at_ts", { ascending: false });
      return data ?? [];
    },
    staleTime: 5_000, refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("home_attendance_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        queryClient.invalidateQueries({ queryKey: ["home_attendance_today"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const checkedInIds = useMemo(() => new Set(todayAttendance.map((a: any) => a.student_id)), [todayAttendance]);

  // Course groups for stat count
  const courseGroups = useMemo(() => {
    const map = new Map<string, { name: string; total: number; checked: number }>();
    expected.forEach(s => {
      if (!map.has(s.course_id)) map.set(s.course_id, { name: s.course_name, total: 0, checked: 0 });
      const g = map.get(s.course_id)!;
      g.total++;
      if (checkedInIds.has(s.student_id)) g.checked++;
    });
    return Array.from(map.values());
  }, [expected, checkedInIds]);

  // Overlimit students
  const overlimitStudents = useMemo(() =>
    expected.filter(s => s.purchased_hours > 0 && s.hours_remaining <= 0),
    [expected]
  );

  // Approaching renewal (2 hours or fewer remaining)
  const approachingStudents = useMemo(() =>
    expected.filter(s => s.purchased_hours > 0 && s.hours_remaining > 0 && s.hours_remaining <= 2),
    [expected]
  );

  // Daily check-in feed grouped by course
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const courseNameMap = useMemo(() => {
    const m = new Map<string, string>();
    expected.forEach(e => m.set(e.course_id, e.course_name));
    return m;
  }, [expected]);

  const feedByCourse = useMemo(() => {
    const map = new Map<string, { courseName: string; entries: { studentName: string; time: string; studentId: string }[] }>();
    todayAttendance.forEach((a: any) => {
      if (!a.course_id) return;
      const cName = courseNameMap.get(a.course_id) || "Unknown Course";
      if (!map.has(a.course_id)) map.set(a.course_id, { courseName: cName, entries: [] });
      const stu = studentMap.get(a.student_id);
      const name = stu ? (stu.nick_name && stu.first_name ? `${stu.nick_name} '${stu.first_name}'` : stu.nick_name || `${stu.first_name} ${stu.last_name}`) : a.student_id;
      map.get(a.course_id)!.entries.push({ studentName: name, time: "", studentId: a.student_id });
    });
    return Array.from(map.values());
  }, [todayAttendance, studentMap, courseNameMap]);

  function buildFeedText() {
    let text = `${t("dailyCheckinFeed")} - ${new Date().toLocaleDateString()}\n\n`;
    feedByCourse.forEach(group => {
      text += `📚 ${group.courseName}\n`;
      group.entries.forEach(e => {
        text += `  • ${e.studentName}\n`;
      });
      text += "\n";
    });
    return text;
  }

  function handleCopyFeed() {
    navigator.clipboard.writeText(buildFeedText());
    toast(t("copiedToClipboard"), "success");
  }

  function handlePrintFeed() {
    const w = window.open("");
    if (w) {
      const pre = w.document.createElement("pre");
      pre.style.fontFamily = "sans-serif";
      pre.style.fontSize = "14px";
      pre.textContent = buildFeedText();
      w.document.body.appendChild(pre);
      w.document.close();
      w.print();
    }
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: POS.bgMain }}>
      {/* Top Hero Banner */}
      <div className="relative pt-5 pb-10 px-6 overflow-hidden rounded-b-[2.5rem]" style={{ background: POS.primaryGradient, boxShadow: POS.shadowMd }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -right-20 w-52 h-52 rounded-full mix-blend-overlay opacity-10 bg-white" />
        <div className="relative z-10 text-center">
          <p className="text-white/70 text-xs font-extrabold tracking-[0.2em] uppercase mb-1">{school?.name || "Wonder Kids"}</p>
          <h1 className="text-2xl sm:text-3xl font-bouncy tracking-tight text-white drop-shadow-md">
            {t("goodMorning")}, {user?.full_name || user?.username || user?.email?.split("@")[0] || "Admin"}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-20 -mt-10">
        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <motion.button onClick={() => nav("/admissions")} whileTap={{ scale: 0.95 }}
            className="btn-gummy-sm flex items-center justify-center p-5 gap-3 rounded-[1.5rem] bg-white shadow-md"
            style={{ border: `2px solid ${POS.borderLight}` }}>
            <UserPlusIcon className="w-8 h-8" style={{ color: "#E91E63" }} />
            <span className="text-sm font-bouncy leading-tight" style={{ color: POS.textPrimary }}>{t("newStudent")}</span>
          </motion.button>

          <motion.button onClick={() => nav("/admissions?mode=existing")} whileTap={{ scale: 0.95 }}
            className="btn-gummy-sm flex items-center justify-center p-5 gap-3 rounded-[1.5rem] bg-white shadow-md"
            style={{ border: `2px solid ${POS.borderLight}` }}>
            <UsersIcon className="w-8 h-8" style={{ color: POS.info }} />
            <span className="text-sm font-bouncy leading-tight" style={{ color: POS.textPrimary }}>{t("addExistingStudent")}</span>
          </motion.button>
        </div>

        <motion.button onClick={() => nav("/attendance")} whileTap={{ scale: 0.96 }}
          className="w-full btn-gummy flex items-center justify-center p-6 gap-5 text-white overflow-hidden relative shadow-lg mb-6"
          style={{ background: POS.success, borderRadius: POS.radius3xl, border: "4px solid rgba(255,255,255,0.3)" }}>
          <ClipboardDocumentCheckIcon className="w-10 h-10 drop-shadow-md" />
          <div className="text-3xl font-bouncy tracking-wide leading-none drop-shadow-md">{t("takeAttendance")}</div>
        </motion.button>

        {/* Daily Check-in Feed */}
        <div className="bg-white p-5 shadow-sm mb-6" style={{ border: `1px solid ${POS.borderLight}`, borderRadius: POS.radius3xl }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bouncy" style={{ color: POS.textPrimary }}>{t("dailyCheckinFeed")}</h2>
            {feedByCourse.length > 0 && (
              <div className="flex gap-2">
                <button onClick={handleCopyFeed} className="p-2 rounded-lg" aria-label={t("copyList")}
                  style={{ background: POS.bgSurface, color: POS.primary }}>
                  <ClipboardDocumentIcon className="w-5 h-5" />
                </button>
                <button onClick={handlePrintFeed} className="p-2 rounded-lg" aria-label={t("printList")}
                  style={{ background: POS.bgSurface, color: POS.primary }}>
                  <PrinterIcon className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          {feedByCourse.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl mb-2 block">👀</span>
              <p className="font-bold text-sm" style={{ color: POS.textMuted }}>{t("noCheckInsToday")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedByCourse.map((group, i) => {
                const colors = [POS.primary, POS.success, POS.info, POS.warning, "#E91E63"];
                const color = colors[i % colors.length];
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: color }}>
                        {group.courseName.charAt(0)}
                      </div>
                      <span className="font-bouncy text-lg" style={{ color: POS.textPrimary }}>{group.courseName}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
                        {group.entries.length}
                      </span>
                    </div>
                    <div className="space-y-1 ml-10">
                      {group.entries.map((entry, j) => (
                        <div key={j} className="flex items-center justify-between py-1.5 px-3 rounded-lg text-sm"
                          style={{ background: POS.bgSurface }}
                          onClick={() => nav(`/students/${entry.studentId}`)}
                          role="button">
                          <span className="font-bold" style={{ color: POS.textPrimary }}>{entry.studentName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Needs Renewal + Approaching Renewal */}
        {(overlimitStudents.length > 0 || approachingStudents.length > 0) && (
          <div className="bg-white p-5 shadow-sm mb-6" style={{ border: `1px solid ${POS.borderLight}`, borderRadius: POS.radius3xl }}>
            {overlimitStudents.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ExclamationTriangleIcon className="w-6 h-6" style={{ color: POS.danger }} />
                  <h2 className="text-lg font-bouncy" style={{ color: POS.danger }}>{t("needsRenewal")}</h2>
                </div>
                <div className="space-y-2 mb-4">
                  {overlimitStudents.slice(0, 5).map(s => (
                    <motion.div key={s.enrollment_id} whileTap={{ scale: 0.98 }} onClick={() => nav(`/students/${s.student_id}`)}
                      className="flex items-center gap-3 p-3 cursor-pointer btn-gummy-sm"
                      style={{ background: POS.dangerLight, borderRadius: POS.radius2xl, border: `1px solid ${POS.danger}33` }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg font-bouncy" style={{ background: POS.danger }}>!</div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bouncy text-base leading-tight block truncate" style={{ color: POS.textPrimary }}>
                          {s.nick_name || s.first_name}{s.nick_name && s.first_name ? ` '${s.first_name}'` : ""}
                        </span>
                        <span className="font-bold text-xs" style={{ color: POS.danger }}>{s.course_name}</span>
                      </div>
                      <span className="text-xs font-bouncy px-2 py-1 bg-white rounded-lg shadow-sm" style={{ color: POS.danger }}>
                        {s.hours_used}/{s.purchased_hours} hrs
                      </span>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
            {approachingStudents.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ExclamationTriangleIcon className="w-5 h-5" style={{ color: "#D97706" }} />
                  <h2 className="text-base font-bouncy" style={{ color: "#D97706" }}>{t("renewalApproaching")}</h2>
                </div>
                <div className="space-y-2">
                  {approachingStudents.slice(0, 5).map(s => (
                    <motion.div key={s.enrollment_id} whileTap={{ scale: 0.98 }} onClick={() => nav(`/students/${s.student_id}`)}
                      className="flex items-center gap-3 p-3 cursor-pointer btn-gummy-sm"
                      style={{ background: POS.warningLight, borderRadius: POS.radius2xl, border: `1px solid #F59E0B33` }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg font-bouncy" style={{ background: "#F59E0B" }}>⏳</div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bouncy text-base leading-tight block truncate" style={{ color: POS.textPrimary }}>
                          {s.nick_name || s.first_name}{s.nick_name && s.first_name ? ` '${s.first_name}'` : ""}
                        </span>
                        <span className="font-bold text-xs" style={{ color: "#D97706" }}>{s.course_name} — {s.hours_remaining} {t("hrsLeft")}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Pending Reviews — admin only, below feed */}
        {isAdmin && (reviewCount ?? 0) > 0 && (
          <motion.div whileTap={{ scale: 0.98 }} onClick={() => nav("/inbox")}
            className="btn-gummy-sm w-full p-5 flex items-center justify-between cursor-pointer mb-6"
            style={{ border: `2px solid ${POS.warning}`, background: POS.warningLight, borderRadius: POS.radius2xl }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white font-bouncy text-2xl shadow-sm" style={{ background: POS.warning }}>
                {reviewCount}
              </div>
              <div>
                <span className="font-bouncy text-xl" style={{ color: "#D97706" }}>{t("pendingApprovalsExclaim")}</span>
                <p className="text-sm font-bold" style={{ color: "#B45309" }}>{t("tapToReviewThem")}</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-orange-400 flex items-center justify-center text-white font-bold">→</div>
          </motion.div>
        )}

        {/* Stats Cards — at the bottom */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card rounded-[2rem] p-5 text-center flex flex-col items-center justify-center"
            style={{ border: "2px solid #FFE58F", background: "rgba(255, 251, 230, 0.9)" }}>
            <CalendarDaysIcon className="w-8 h-8 mb-2 drop-shadow-sm" style={{ color: "#FAAD14" }} />
            <div className="text-3xl font-bouncy leading-none" style={{ color: "#D48806" }}>{expected.length}</div>
            <div className="text-[10px] font-extrabold mt-1 uppercase tracking-wider" style={{ color: "#FAAD14" }}>{t("expected")}</div>
          </div>

          <div className="glass-card rounded-[2rem] p-5 text-center flex flex-col items-center justify-center"
            style={{ border: "2px solid #91D5FF", background: "rgba(230, 247, 255, 0.9)" }}>
            <AcademicCapIcon className="w-8 h-8 mb-2 drop-shadow-sm" style={{ color: "#1890FF" }} />
            <div className="text-3xl font-bouncy leading-none" style={{ color: "#096DD9" }}>{courseGroups.length}</div>
            <div className="text-[10px] font-extrabold mt-1 uppercase tracking-wider" style={{ color: "#1890FF" }}>{t("classes")}</div>
          </div>

          <div className="glass-card rounded-[2rem] p-5 text-center flex flex-col items-center justify-center"
            style={{ border: "2px solid #B7EB8F", background: "rgba(246, 255, 237, 0.9)" }}>
            <UsersIcon className="w-8 h-8 mb-2 drop-shadow-sm" style={{ color: "#52C41A" }} />
            <div className="text-3xl font-bouncy leading-none" style={{ color: "#389E0D" }}>{checkedInIds.size}</div>
            <div className="text-[10px] font-extrabold mt-1 uppercase tracking-wider" style={{ color: "#52C41A" }}>{t("checkedIn")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
