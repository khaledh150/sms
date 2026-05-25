import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftIcon, QrCodeIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { supabase } from "../../supabaseClient";
import AttendanceQRBox from "../../AttendanceQRBox";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import { useAllEnrolledStudents } from "../../hooks/useStudents";
import type { AttendanceRow } from "../../services/attendance";
import { todayStr } from "../../services/attendance";
import { playDing, playBeep, haptic } from "./attendanceUtils";
import { useAuth } from "../../AuthContext";
import { getTodayWeekday } from "../../services/courses";

import HourPickerModal from "./HourPickerModal";
import StudentGrid from "./StudentGrid";
import WalkInSearch from "./WalkInSearch";
import CourseGroupSection from "./CourseGroupSection";
import type { StudentForGrid, CourseGroup } from "./types";

export default function AttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [viewCourse, setViewCourse] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [busyKey, setBusy] = useState("");
  const [hourPicker, setHourPicker] = useState<{ stu: StudentForGrid; cid: string } | null>(null);

  const { data: allEnrolled = [] } = useAllEnrolledStudents();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [allTimeHours, setAllTimeHours] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchRows = () =>
      supabase.from("attendance").select("id,student_id,course_id,attended_at_ts,approved_by")
        .gte("attended_at_ts", todayStr())
        .then(({ data }) => setRows((data ?? []) as AttendanceRow[]));

    const fetchAllTimeHours = () =>
      supabase.from("attendance").select("student_id,course_id")
        .not("approved_by", "is", null)
        .then(({ data }) => {
          const m = new Map<string, number>();
          (data ?? []).forEach((r: any) => {
            if (!r.course_id) return;
            const k = `${r.student_id}|${r.course_id}`;
            m.set(k, (m.get(k) || 0) + 1);
          });
          setAllTimeHours(m);
        });

    fetchRows();
    fetchAllTimeHours();

    const channel = supabase.channel("attendance_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        fetchRows();
        fetchAllTimeHours();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!scanResult) return;
    const tmo = setTimeout(() => setScanResult(null), 3000);
    return () => clearTimeout(tmo);
  }, [scanResult]);

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

  const allTimeUsedMap = useMemo(() => {
    const m = new Map<string, number>();
    approvedRows.forEach(r => {
      if (!r.course_id) return;
      const k = `${r.student_id}|${r.course_id}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [approvedRows]);

  const isHere = useCallback((sid: string, cid: string) => checkedInSet.get(cid)?.has(sid) ?? false, [checkedInSet]);
  const todayUsed = useCallback((sid: string, cid: string) => allTimeUsedMap.get(`${sid}|${cid}`) || 0, [allTimeUsedMap]);

  const todayWeekday = useMemo(() => getTodayWeekday(), []);

  const groupedByCourse = useMemo(() => {
    const map = new Map<string, CourseGroup>();
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
      });
    });

    const result = Array.from(map.values());
    result.forEach(g => {
      g.students.sort((a, b) => {
        if (a.isExpectedToday !== b.isExpectedToday) return a.isExpectedToday ? -1 : 1;
        return 0;
      });
    });
    return result.filter(g => g.students.length > 0);
  }, [allEnrolled, todayWeekday]);

  const expectedCount = useMemo(() =>
    groupedByCourse.reduce((n, g) => n + g.students.filter(s => s.isExpectedToday).length, 0),
  [groupedByCourse]);

  const courseGroup = viewCourse ? groupedByCourse.find(g => g.courseId === viewCourse) : null;

  const handleCheckIn = useCallback((stu: StudentForGrid, cid: string) => {
    const key = `${stu.student_id}|${cid}`;
    if (busyKey === key) return;

    if (!isHere(stu.student_id, cid)) {
      const totalUsed = (allTimeHours.get(`${stu.student_id}|${cid}`) || 0) + (stu.initial_used_hours || 0);
      if (stu.purchased_hours > 0 && totalUsed >= stu.purchased_hours) {
        const name = stu.nick_name || stu.first_name;
        if (!confirm(t("overlimitConfirm", { name, used: totalUsed, purchased: stu.purchased_hours }))) return;
      }
    }

    if (isHere(stu.student_id, cid)) {
      (async () => {
        setBusy(key);
        try {
          const todayRows = rows.filter(r => r.student_id === stu.student_id && r.course_id === cid && r.attended_at_ts.slice(0, 10) === todayStr());
          if (todayRows.length) {
            const ids = todayRows.map(r => r.id);
            await supabase.from("attendance").delete().in("id", ids);
            setRows(rs => rs.filter(r => !ids.includes(r.id)));
          }
          playBeep(); haptic("error");
          setScanResult({ message: t("uncheckedStudent", { first: stu.first_name, last: stu.last_name }), type: "error" });
        } finally { setBusy(""); }
      })();
    } else {
      setHourPicker({ stu, cid });
    }
  }, [busyKey, isHere, rows, t, allTimeHours]);

  const confirmCheckIn = useCallback(async (hours: number) => {
    if (!hourPicker) return;
    const { stu, cid } = hourPicker;
    setHourPicker(null);
    const key = `${stu.student_id}|${cid}`;
    setBusy(key);
    const approver = user!.id;
    try {
      const inserts = Array.from({ length: hours }, () => ({
        student_id: stu.student_id, course_id: cid, attended_at_ts: new Date().toISOString(), approved_by: approver,
      }));
      const { data, error } = await supabase.from("attendance").insert(inserts).select();
      if (error) throw error;
      setRows(rs => [...rs, ...(data ?? [])]);
      playDing(); haptic("success");
      const used = todayUsed(stu.student_id, cid) + hours + (stu.initial_used_hours || 0);
      if (stu.purchased_hours > 0 && used >= stu.purchased_hours) {
        setScanResult({ message: t("overlimitCheck", { name: stu.nick_name || stu.first_name, used, purchased: stu.purchased_hours }), type: "error" });
      } else {
        const displayName = stu.nick_name ? `${stu.nick_name} '${stu.first_name}'` : stu.first_name;
        setScanResult({ message: `${displayName} — ${hours}h ${t("checkedIn")}`, type: "success" });
      }
    } finally { setBusy(""); }
  }, [hourPicker, user, todayUsed, t]);

  const bulkCheckIn = useCallback(async (group: CourseGroup) => {
    const approver = user!.id;
    const unchecked = group.students.filter(s => !isHere(s.student_id, group.courseId));
    if (!unchecked.length) return;
    const inserts = unchecked.map(s => ({
      student_id: s.student_id, course_id: group.courseId, attended_at_ts: new Date().toISOString(), approved_by: approver,
    }));
    const { data, error } = await supabase.from("attendance").insert(inserts).select();
    if (error) return;
    setRows(rs => [...rs, ...(data ?? [])]);
    playDing(); haptic("success");
    setScanResult({ message: t("checkedInBulk", { count: unchecked.length }), type: "success" });
  }, [user, isHere, t]);

  async function onScanQR(raw: string) {
    const sid = raw.trim();
    setScanOpen(false);
    if (viewCourse) {
      const stu = courseGroup?.students.find(s => s.student_id === sid);
      if (stu) { await handleCheckIn(stu, viewCourse); return; }
    }
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: sid, course_id: viewCourse || null, attended_at_ts: new Date().toISOString(), ...(viewCourse ? { approved_by: user!.id } : {}) }).select();
    if (error) { playBeep(); setScanResult({ message: t("scanFailed"), type: "error" }); }
    else { setRows(rs => [...rs, data![0]]); playDing(); haptic("success"); setScanResult({ message: viewCourse ? t("checkedInMsg") : t("pendingApprovalMsg"), type: "success" }); }
  }

  const banner = (
    <AnimatePresence>
      {scanResult && (
        <motion.div key="banner" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-md w-[90%] px-5 py-4 rounded-[1.5rem] shadow-xl flex justify-between items-center z-50 btn-gummy-sm"
          style={{ background: scanResult.type === "success" ? POS.success : POS.danger, color: "#fff" }}>
          <span className="font-bouncy text-lg tracking-wide">{scanResult.message}</span>
          <button onClick={() => setScanResult(null)} aria-label={t("close")} className="ml-3 opacity-80">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen pb-32" style={{ background: POS.bgMain }}>
      {banner}

      <HourPickerModal
        picker={hourPicker}
        onConfirm={confirmCheckIn}
        onClose={() => setHourPicker(null)}
      />

      {/* HEADER */}
      <div className="px-6 pt-10 pb-6 sticky top-[56px] z-20" style={{ background: "rgba(248, 249, 254, 0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-4xl font-bouncy tracking-tight" style={{ color: POS.primaryDark }}>{t("takeAttendance")}</h1>
            <p className="text-lg font-bold opacity-80" style={{ color: POS.textMuted }}>
              {t("expectedTodayCount", { count: expectedCount })}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setScanOpen(true)} aria-label={t("scanQR")} className="w-16 h-16 rounded-[1.5rem] text-white btn-gummy flex items-center justify-center" style={{ background: POS.primary }}>
              <QrCodeIcon className="w-8 h-8" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <WalkInSearch onCheckIn={(row) => {
          setRows(rs => [...rs, row]);
          const name = (row as any).nick_name || (row as any).first_name || "Student";
          setScanResult({ message: t("scannedAssignCourse", { name }), type: "success" });
        }} />

        {/* COURSE GROUPS */}
        {groupedByCourse.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-4 block">🏝️</span>
            <p className="text-2xl font-bouncy" style={{ color: POS.textMuted }}>{t("noClassesScheduled")}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByCourse.map((group, i) => (
              <CourseGroupSection
                key={group.courseId}
                group={group}
                index={i}
                isHere={isHere}
                todayUsed={todayUsed}
                busyKey={busyKey}
                onCheckIn={handleCheckIn}
                onBulkCheckIn={bulkCheckIn}
                onExpand={setViewCourse}
                allTimeHours={allTimeHours}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>{scanOpen && <AttendanceQRBox key="scanner" onScan={onScanQR} onClose={() => setScanOpen(false)} />}</AnimatePresence>

      {/* EXPANDED COURSE MODAL */}
      <AnimatePresence>
        {viewCourse && courseGroup && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={() => setViewCourse(null)}>
            {banner}
            <motion.div initial={{ y: 500 }} animate={{ y: 0 }} exit={{ y: 500 }} transition={{ type: "spring", bounce: 0.3 }}
              className="w-full flex flex-col pt-6 pb-20 px-4 sm:px-8 rounded-t-[3rem] h-[85vh] shadow-[0_-10px_40px_rgba(0,0,0,0.2)]"
              style={{ background: POS.bgMain }} onClick={e => e.stopPropagation()}>

              <div className="flex items-center justify-between mb-8">
                <button onClick={() => setViewCourse(null)} aria-label={t("close")} className="w-14 h-14 rounded-[1.5rem] bg-white flex items-center justify-center btn-gummy-sm text-gray-800 shadow-sm">
                  <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <h2 className="text-3xl font-bouncy flex-1 text-center" style={{ color: POS.primary }}>{courseGroup.courseName}</h2>
                <div className="w-14 h-14" />
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pb-20 hide-scrollbar">
                <div className="p-4 bg-white rounded-[2rem] shadow-sm">
                  <StudentGrid students={courseGroup.students} courseId={courseGroup.courseId} isHere={isHere} todayUsed={todayUsed} busyKey={busyKey} onCheckIn={handleCheckIn} allTimeHours={allTimeHours} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
