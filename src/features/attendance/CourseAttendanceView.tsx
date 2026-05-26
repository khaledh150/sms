import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import ConfirmDialog from "../../components/ConfirmDialog";
import type { StudentForGrid } from "./types";

export default function CourseAttendanceView() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [busyKey, setBusy] = useState("");
  const [hourPicker, setHourPicker] = useState<{ stu: StudentForGrid; cid: string } | null>(null);
  const [overlimitConfirm, setOverlimitConfirm] = useState<{ stu: StudentForGrid; cid: string; message: string } | null>(null);

  const { data: allEnrolled = [] } = useAllEnrolledStudents();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [allTimeHours, setAllTimeHours] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchRows = () =>
      supabase.from("attendance").select("id,student_id,course_id,attended_at_ts,approved_by,cancelled_by")
        .eq("course_id", courseId!)
        .gte("attended_at_ts", todayStr())
        .is("cancelled_by", null)
        .then(({ data }) => setRows((data ?? []) as AttendanceRow[]));

    const fetchAllTimeHours = () =>
      supabase.from("student_course_attendance_summary").select("student_id,course_id,total_hours")
        .eq("course_id", courseId!)
        .then(({ data }) => {
          const m = new Map<string, number>();
          (data ?? []).forEach((r: any) => {
            if (!r.course_id) return;
            m.set(`${r.student_id}|${r.course_id}`, r.total_hours);
          });
          setAllTimeHours(m);
        });

    fetchRows();
    fetchAllTimeHours();

    const channel = supabase.channel(`course_attendance_${courseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        fetchRows();
        fetchAllTimeHours();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [courseId]);

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

  const students = useMemo(() => {
    if (!courseId) return [];
    const stuMap = new Map<string, StudentForGrid>();
    allEnrolled.forEach(s => {
      if (s.course_id !== courseId) return;
      if (stuMap.has(s.student_id)) return;
      const isExpected = !!(s.schedule && s.schedule[todayWeekday]?.length > 0);
      stuMap.set(s.student_id, {
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
    const result = Array.from(stuMap.values());
    result.sort((a, b) => {
      if (a.isExpectedToday !== b.isExpectedToday) return a.isExpectedToday ? -1 : 1;
      return 0;
    });
    return result;
  }, [allEnrolled, courseId, todayWeekday]);

  const courseName = useMemo(() => {
    const enrolled = allEnrolled.find(s => s.course_id === courseId);
    return enrolled?.course_name ?? "";
  }, [allEnrolled, courseId]);

  const checkedCount = useMemo(() => {
    if (!courseId) return 0;
    return students.filter(s => isHere(s.student_id, courseId)).length;
  }, [students, courseId, isHere]);

  const handleCheckIn = useCallback((stu: StudentForGrid, cid: string) => {
    const key = `${stu.student_id}|${cid}`;
    if (busyKey === key) return;

    if (!isHere(stu.student_id, cid)) {
      const totalUsed = (allTimeHours.get(`${stu.student_id}|${cid}`) || 0) + (stu.initial_used_hours || 0);
      if (stu.purchased_hours > 0 && totalUsed >= stu.purchased_hours) {
        const name = stu.nick_name || stu.first_name;
        setOverlimitConfirm({ stu, cid, message: t("overlimitConfirm", { name, used: totalUsed, purchased: stu.purchased_hours }) });
        return;
      }
    }

    if (isHere(stu.student_id, cid)) {
      (async () => {
        setBusy(key);
        try {
          const todayRows = rows.filter(r => r.student_id === stu.student_id && r.course_id === cid && r.attended_at_ts.slice(0, 10) === todayStr());
          if (todayRows.length) {
            const ids = todayRows.map(r => r.id);
            await supabase.from("attendance").update({ cancelled_by: user!.id, cancelled_at: new Date().toISOString() }).in("id", ids);
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

  const bulkCheckIn = useCallback(async () => {
    if (!courseId) return;
    const approver = user!.id;
    const unchecked = students.filter(s => !isHere(s.student_id, courseId));
    if (!unchecked.length) return;
    const inserts = unchecked.map(s => ({
      student_id: s.student_id, course_id: courseId, attended_at_ts: new Date().toISOString(), approved_by: approver,
    }));
    const { data, error } = await supabase.from("attendance").insert(inserts).select();
    if (error) return;
    setRows(rs => [...rs, ...(data ?? [])]);
    playDing(); haptic("success");
    setScanResult({ message: t("checkedInBulk", { count: unchecked.length }), type: "success" });
  }, [user, isHere, students, courseId, t]);

  async function onScanQR(raw: string) {
    if (!courseId) return;
    const sid = raw.trim();
    setScanOpen(false);
    const stu = students.find(s => s.student_id === sid);
    if (stu) {
      handleCheckIn(stu, courseId);
      return;
    }
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: sid, course_id: courseId, attended_at_ts: new Date().toISOString(), approved_by: user!.id }).select();
    if (error) { playBeep(); setScanResult({ message: t("scanFailed"), type: "error" }); }
    else { setRows(rs => [...rs, data![0]]); playDing(); haptic("success"); setScanResult({ message: t("checkedInMsg"), type: "success" }); }
  }

  const uncheckedCount = courseId ? students.filter(s => !isHere(s.student_id, courseId)).length : 0;

  if (!courseId) return null;

  return (
    <div className="min-h-screen pb-32" style={{ background: POS.bgMain }}>
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

      <HourPickerModal picker={hourPicker} onConfirm={confirmCheckIn} onClose={() => setHourPicker(null)} />
      <ConfirmDialog
        open={!!overlimitConfirm}
        onClose={() => setOverlimitConfirm(null)}
        onConfirm={() => {
          if (overlimitConfirm) setHourPicker({ stu: overlimitConfirm.stu, cid: overlimitConfirm.cid });
          setOverlimitConfirm(null);
        }}
        title={t("overlimitTitle")}
        message={overlimitConfirm?.message || ""}
        confirmLabel={t("continueCheckIn")}
        variant="warning"
      />

      <div className="px-6 pt-10 pb-6 sticky top-[56px] z-20" style={{ background: "rgba(248, 249, 254, 0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between max-w-4xl mx-auto gap-3">
          <button onClick={() => navigate("/attendance")} aria-label={t("back")}
            className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center btn-gummy-sm shadow-sm shrink-0"
            style={{ color: POS.textPrimary }}>
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bouncy tracking-tight truncate" style={{ color: POS.primaryDark }}>{courseName}</h1>
            <p className="text-sm font-bold" style={{ color: checkedCount > 0 ? POS.success : POS.textMuted }}>
              {checkedCount} / {students.length} {t("checkedIn")}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {uncheckedCount > 0 && (
              <button onClick={bulkCheckIn}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white btn-gummy-sm"
                style={{ background: POS.success }}>
                {t("checkInAll", { count: uncheckedCount })}
              </button>
            )}
            <button onClick={() => setScanOpen(true)} aria-label={t("scanQR")}
              className="w-12 h-12 rounded-2xl text-white btn-gummy flex items-center justify-center"
              style={{ background: POS.primary }}>
              <QrCodeIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4">
        {students.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-4 block">📭</span>
            <p className="text-xl font-bouncy" style={{ color: POS.textMuted }}>{t("noStudentsEnrolled")}</p>
          </div>
        ) : (
          <div className="p-4 bg-white rounded-[2rem] shadow-sm">
            <StudentGrid students={students} courseId={courseId} isHere={isHere} todayUsed={todayUsed} busyKey={busyKey} onCheckIn={handleCheckIn} allTimeHours={allTimeHours} />
          </div>
        )}
      </div>

      <AnimatePresence>{scanOpen && <AttendanceQRBox key="scanner" onScan={onScanQR} onClose={() => setScanOpen(false)} />}</AnimatePresence>
    </div>
  );
}
