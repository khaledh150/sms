import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftIcon, QrCodeIcon, XMarkIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import AttendanceQRBox from "./AttendanceQRBox";
import { useTranslation } from "react-i18next";
import { POS, haptic } from "./theme";
import { useAllEnrolledStudents } from "./hooks/useStudents";
import type { AttendanceRow } from "./services/attendance";
import { todayStr } from "./services/attendance";
import { playDing, playBeep } from "./utils";
import { useDebounce } from "./hooks/useDebounce";
import { useAuth } from "./AuthContext";
import { getTodayWeekday } from "./services/courses";

interface StudentForGrid {
  student_id: string;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  purchased_hours: number;
  initial_used_hours: number;
  isExpectedToday: boolean;
}

export default function AttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewCourse, setViewCourse] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [busyKey, setBusy] = useState("");
  const [hourPicker, setHourPicker] = useState<{ stu: StudentForGrid; cid: string } | null>(null);

  const { data: allEnrolled = [] } = useAllEnrolledStudents();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [allTimeHours, setAllTimeHours] = useState<Map<string, number>>(new Map());
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

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
    const map = new Map<string, { courseName: string; courseId: string; students: StudentForGrid[] }>();
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

    // Check overlimit before check-in
    if (!isHere(stu.student_id, cid)) {
      const totalUsed = (allTimeHours.get(`${stu.student_id}|${cid}`) || 0) + (stu.initial_used_hours || 0);
      if (stu.purchased_hours > 0 && totalUsed >= stu.purchased_hours) {
        const name = stu.nick_name || stu.first_name;
        if (!confirm(t("overlimitConfirm", { name, used: totalUsed, purchased: stu.purchased_hours }))) return;
      }
    }

    if (isHere(stu.student_id, cid)) {
      // Undo: remove ALL of today's records for this student+course
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

  const bulkCheckIn = useCallback(async (group: typeof groupedByCourse[0]) => {
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

  useEffect(() => {
    if (debouncedSearch.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    supabase.from("students")
      .select("id,first_name,last_name,nick_name,qr_code_url")
      .eq("status", "active")
      .or(`nick_name.ilike.%${debouncedSearch}%,first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%`)
      .limit(10)
      .then(({ data }) => { if (!cancelled) setSearchResults(data ?? []); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  async function walkInCheckIn(studentId: string, studentName: string) {
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: studentId, course_id: null, attended_at_ts: new Date().toISOString() }).select();
    if (!error && data) {
      setRows(rs => [...rs, data[0]]);
      playDing(); haptic("success");
      setScanResult({ message: t("scannedAssignCourse", { name: studentName }), type: "success" });
    }
    setShowSearch(false); setSearchInput(""); setSearchResults([]);
  }

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

      {/* Hour Picker Popup */}
      <AnimatePresence>
        {hourPicker && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setHourPicker(null)}>
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-xs p-6 pb-10 sm:pb-6 shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bouncy text-center mb-1" style={{ color: POS.primaryDark }}>
                {hourPicker.stu.nick_name || hourPicker.stu.first_name}
                {hourPicker.stu.nick_name && hourPicker.stu.first_name && <span className="text-sm block" style={{ color: POS.textMuted }}>'{hourPicker.stu.first_name}'</span>}
              </h3>
              <p className="text-sm text-center mb-5" style={{ color: POS.textMuted }}>{t("howManyHours", { course: "" }).replace("—", "").trim() || "How many hours?"}</p>
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(h => (
                  <button key={h} onClick={() => confirmCheckIn(h)}
                    className="py-4 rounded-2xl text-2xl font-bouncy btn-gummy text-white shadow-lg"
                    style={{ background: h === 1 ? POS.success : POS.primary }}>
                    {h}h
                  </button>
                ))}
              </div>
              <button onClick={() => setHourPicker(null)}
                className="w-full mt-4 py-3 rounded-xl text-sm font-bold"
                style={{ color: POS.textMuted }}>
                {t("cancel")}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        {/* WALK-IN SEARCH */}
        <div className="mb-8">
          <button onClick={() => setShowSearch(!showSearch)}
            className="w-full py-4 rounded-[2rem] text-xl font-bouncy transition-all flex items-center justify-center gap-3 btn-gummy-sm"
            style={{ background: showSearch ? POS.primary : "white", color: showSearch ? "#fff" : POS.primary, boxShadow: POS.shadowSm }}>
            {showSearch ? <><XMarkIcon className="w-6 h-6 inline-block" /> {t("closeSearchBtn")}</> : <><span>🔍</span> {t("walkInSearchBtn")}</>}
          </button>

          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
                <input type="text" placeholder={t("searchPlaceholder")} value={searchInput}
                  onChange={e => setSearchInput(e.target.value)} autoFocus
                  className="w-full rounded-[2rem] px-6 py-5 text-xl font-bold shadow-inner focus:outline-none"
                  style={{ border: `3px solid ${POS.borderPurple}`, background: "#fff" }} />

                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {searchResults.map(s => (
                      <button key={s.id} onClick={() => walkInCheckIn(s.id, s.nick_name || s.first_name)}
                        className="w-full flex items-center gap-4 p-4 rounded-[1.5rem] bg-white text-left btn-gummy-sm"
                        style={{ border: `2px solid ${POS.borderLight}` }}>
                        <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy shadow-sm" style={{ background: POS.primary }}>
                          {(s.nick_name || s.first_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bouncy text-xl" style={{ color: POS.textPrimary }}>
                          {s.nick_name && <span style={{ color: POS.primary }}>"{s.nick_name}" </span>}{s.first_name} {s.last_name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* COURSE GROUPS */}
        {groupedByCourse.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-4 block">🏝️</span>
            <p className="text-2xl font-bouncy" style={{ color: POS.textMuted }}>{t("noClassesScheduled")}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByCourse.map((group, i) => {
              const checkedCount = group.students.filter(s => isHere(s.student_id, group.courseId)).length;
              const colors = [POS.primary, POS.info, POS.warning, "#E91E63", POS.success];
              const sectionColor = colors[i % colors.length];

              const uncheckedAll = group.students.filter(s => !isHere(s.student_id, group.courseId)).length;

              return (
                <section key={group.courseId} className="bg-white p-5 rounded-[2rem] shadow-sm border-2 relative" style={{ borderColor: POS.borderPurple }}>
                  {/* Top right: Check In All + Expand icon */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    {uncheckedAll > 0 && (
                      <button onClick={() => bulkCheckIn(group)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white btn-gummy-sm" style={{ background: POS.success }}>
                        {t("checkInAll", { count: uncheckedAll })}
                      </button>
                    )}
                    <button onClick={() => setViewCourse(group.courseId)} aria-label={t("expand") + " " + group.courseName}
                      className="w-9 h-9 rounded-xl flex items-center justify-center btn-gummy-sm hover:bg-gray-100 transition-colors"
                      style={{ color: POS.textMuted }}>
                      <ArrowsPointingOutIcon className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="mb-5 pr-36 sm:pr-48">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy btn-gummy-sm shrink-0" style={{ background: sectionColor }}>
                        {group.courseName.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bouncy leading-tight" style={{ color: POS.textPrimary }}>{group.courseName}</h2>
                        <div className="text-base font-bold" style={{ color: checkedCount > 0 ? POS.success : POS.textMuted }}>
                          {checkedCount} {t("checkedIn")}
                        </div>
                      </div>
                    </div>
                  </div>

                  <StudentGrid students={group.students} courseId={group.courseId} isHere={isHere} todayUsed={todayUsed} busyKey={busyKey} onCheckIn={handleCheckIn} allTimeHours={allTimeHours} t={t} collapsed navigate={navigate} />
                </section>
              );
            })}
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
                  <StudentGrid students={courseGroup.students} courseId={courseGroup.courseId} isHere={isHere} todayUsed={todayUsed} busyKey={busyKey} onCheckIn={handleCheckIn} allTimeHours={allTimeHours} t={t} navigate={navigate} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const INITIAL_SHOW = 8;

function StudentGrid({ students, courseId, isHere, todayUsed, busyKey, onCheckIn, allTimeHours, t, collapsed, navigate }: any) {
  const [expanded, setExpanded] = useState(false);

  const showAll = expanded || !collapsed;
  const visible = showAll ? students : students.slice(0, INITIAL_SHOW);
  const hasMore = collapsed && !expanded && students.length > INITIAL_SHOW;

  return (
    <>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-5">
      {visible.map((stu: StudentForGrid) => {
        const checked = isHere(stu.student_id, courseId);
        const todayHrs = todayUsed(stu.student_id, courseId);
        const totalUsed = (allTimeHours.get(`${stu.student_id}|${courseId}`) || 0) + (stu.initial_used_hours || 0);
        const purchased = stu.purchased_hours;
        const remaining = purchased - totalUsed;
        const isOverlimit = purchased > 0 && remaining <= 0;
        const isApproaching = purchased > 0 && remaining > 0 && remaining <= 2;
        const isLow = purchased > 0 && remaining > 0 && remaining <= 3;
        const isBusy = busyKey === `${stu.student_id}|${courseId}`;

        let borderColor = "transparent";
        let bgColor = "rgba(255, 255, 255, 0.8)";

        if (checked && isOverlimit) { borderColor = "#EF4444"; bgColor = "rgba(254, 226, 226, 0.95)"; }
        else if (checked) { borderColor = "#34D399"; bgColor = "rgba(246, 255, 237, 0.95)"; }
        else if (isOverlimit) { borderColor = "#EF4444"; bgColor = "rgba(254, 226, 226, 0.95)"; }
        else if (isApproaching) { borderColor = "#F59E0B"; bgColor = "rgba(255, 251, 230, 0.95)"; }
        else if (isLow) { borderColor = "#FBBF24"; bgColor = "rgba(255, 251, 230, 0.95)"; }

        return (
          <motion.button key={stu.student_id} whileTap={{ scale: 0.92, rotate: (Math.random() - 0.5) * 4 }} disabled={isBusy}
            onClick={() => onCheckIn(stu, courseId)}
            className={`btn-gummy flex flex-col items-center justify-start overflow-hidden relative shadow-lg ${isOverlimit && !checked ? "pulse-danger" : ""}`}
            style={{
              borderRadius: "2rem",
              border: `2px solid ${borderColor}`,
              width: '100%',
              background: bgColor,
              aspectRatio: "3/4",
              opacity: isBusy ? 0.6 : stu.isExpectedToday ? 1 : 0.7,
            }}>

            {/* Top Photo Area */}
            <div className="w-full h-[55%] shrink-0 flex items-center justify-center relative overflow-hidden bg-[#EBF0FF]">
               {checked && (
                 <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                   className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md ${isOverlimit ? "bg-red-500/30" : "bg-green-500/30"}`}>
                   <span className="text-white text-5xl drop-shadow-xl font-extrabold">✓ {todayHrs > 1 ? todayHrs + "h" : ""}</span>
                 </motion.div>
               )}
               <div className="text-[5rem] font-bold opacity-80 drop-shadow-lg" style={{ color: POS.primaryLight }}>
                    {(stu.nick_name || stu.first_name || "?").charAt(0).toUpperCase()}
                  </div>
            </div>

            {/* Bottom Info Area */}
            <div className="flex flex-col items-center justify-center w-full h-[45%] bg-white/95 px-2 glass-card">
              <div className="font-bouncy leading-tight truncate w-full text-center cursor-pointer hover:underline"
                style={{ color: isOverlimit ? POS.danger : isApproaching ? "#D97706" : POS.primary, fontSize: "0.95rem" }}
                onClick={(e) => { e.stopPropagation(); navigate(`/students/${stu.student_id}`); }}>
                {stu.nick_name || stu.first_name}{stu.nick_name && stu.first_name ? ` '${stu.first_name}'` : ""}
              </div>

              <div className="text-[11px] font-extrabold mt-1 px-3 py-1 rounded-full shadow-inner tracking-wider"
                style={{
                  background: isOverlimit ? "rgba(248, 113, 113, 0.15)" : isLow ? "rgba(251, 191, 36, 0.2)" : "rgba(0,0,0,0.04)",
                  color: isOverlimit ? "#EF4444" : isLow ? "#D97706" : POS.textSecondary
                }}>
                {totalUsed} / {purchased || "∞"} hrs
              </div>

              {isOverlimit && (
                <div className="text-[9px] font-extrabold mt-1 px-2 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#DC2626" }}>
                  {t("renewalNeeded")}
                </div>
              )}
              {isApproaching && !isOverlimit && (
                <div className="text-[9px] font-extrabold mt-1 px-2 py-0.5 rounded-full" style={{ background: "#FFF7CD", color: "#D97706" }}>
                  {t("renewalApproaching")}
                </div>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
    {hasMore && (
      <button onClick={() => setExpanded(true)}
        className="w-full mt-4 py-3 rounded-2xl text-sm font-bold btn-gummy-sm"
        style={{ background: POS.bgSurface, color: POS.primary, border: `2px dashed ${POS.primary}44` }}>
        {t("seeMore")} (+{students.length - INITIAL_SHOW})
      </button>
    )}
    {collapsed && expanded && students.length > INITIAL_SHOW && (
      <button onClick={() => setExpanded(false)}
        className="w-full mt-4 py-3 rounded-2xl text-sm font-bold btn-gummy-sm"
        style={{ background: POS.bgSurface, color: POS.textMuted }}>
        {t("showLess")}
      </button>
    )}
    </>
  );
}
