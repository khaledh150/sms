import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftIcon, QrCodeIcon, ClockIcon, CheckIcon } from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import AttendanceQRBox from "./AttendanceQRBox";
import { useTranslation } from "react-i18next";
import { POS, haptic } from "./theme";
import { useExpectedToday } from "./hooks/useStudents";
import { useCourses } from "./hooks/useCourses";
import type { AttendanceRow } from "./services/attendance";
import { todayStr } from "./services/attendance";
import { playDing, playBeep } from "./utils";
import type { ExpectedStudent } from "./services/students";

export default function AttendancePage() {
  const { t } = useTranslation();
  const [viewCourse, setViewCourse] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [busyKey, setBusy] = useState("");

  const { data: expected = [] } = useExpectedToday();
  const { data: courses = [] } = useCourses();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Load today's attendance
  useEffect(() => {
    supabase.from("attendance").select("id,student_id,course_id,attended_at_ts,approved_by")
      .gte("attended_at_ts", todayStr())
      .then(({ data }) => setRows((data ?? []) as AttendanceRow[]));
  }, []);

  useEffect(() => {
    if (!scanResult) return;
    const tmo = setTimeout(() => setScanResult(null), 3000);
    return () => clearTimeout(tmo);
  }, [scanResult]);

  const approvedRows = useMemo(() => rows.filter(r => r.approved_by), [rows]);
  const pending = useMemo(() => rows.filter(r => !r.approved_by), [rows]);

  const checkedInSet = useMemo(() => {
    const m = new Map<string, Set<string>>();
    approvedRows.forEach(r => {
      if (!r.course_id) return;
      if (!m.has(r.course_id)) m.set(r.course_id, new Set());
      m.get(r.course_id)!.add(r.student_id);
    });
    return m;
  }, [approvedRows]);

  const usedCntMap = useMemo(() => {
    const m = new Map<string, number>();
    approvedRows.forEach(r => {
      if (!r.course_id) return;
      const k = `${r.student_id}|${r.course_id}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [approvedRows]);

  const isHere = (sid: string, cid: string) => checkedInSet.get(cid)?.has(sid) ?? false;
  const usedCnt = (sid: string, cid: string) => usedCntMap.get(`${sid}|${cid}`) || 0;

  // Group expected students by course
  const groupedByCourse = useMemo(() => {
    const map = new Map<string, { courseName: string; courseId: string; timeSlot: string; students: ExpectedStudent[] }>();
    expected.forEach(s => {
      const key = s.course_id;
      if (!map.has(key)) map.set(key, { courseName: s.course_name, courseId: s.course_id, timeSlot: s.time_slot, students: [] });
      const group = map.get(key)!;
      if (!group.students.some(x => x.student_id === s.student_id)) {
        group.students.push(s);
      }
    });
    return Array.from(map.values());
  }, [expected]);

  const courseGroup = viewCourse ? groupedByCourse.find(g => g.courseId === viewCourse) : null;

  async function handleCheckIn(stu: { student_id: string; first_name: string; last_name: string; nick_name: string | null; purchased_hours: number }, cid: string) {
    const key = `${stu.student_id}|${cid}`;
    if (busyKey === key) return;
    setBusy(key);
    const { data: { user } } = await supabase.auth.getUser();
    const approver = user?.id!;
    try {
      if (isHere(stu.student_id, cid)) {
        const existing = rows.find(r => r.student_id === stu.student_id && r.course_id === cid && r.attended_at_ts.slice(0, 10) === todayStr());
        if (existing) {
          await supabase.from("attendance").delete().eq("id", existing.id);
          setRows(rs => rs.filter(r => r.id !== existing.id));
        }
        playBeep(); haptic("error");
        setScanResult({ message: t("uncheckedStudent", { first: stu.first_name, last: stu.last_name }), type: "error" });
      } else {
        const { data, error } = await supabase.from("attendance")
          .insert({ student_id: stu.student_id, course_id: cid, attended_at_ts: todayStr(), approved_by: approver }).select();
        if (error) throw error;
        setRows(rs => [...rs, data![0]]);
        playDing(); haptic("success");
        const used = usedCnt(stu.student_id, cid) + 1;
        if (stu.purchased_hours > 0 && used >= stu.purchased_hours) {
          setScanResult({ message: t("overlimitCheck", { name: stu.nick_name || stu.first_name, used, purchased: stu.purchased_hours }), type: "error" });
        } else {
          setScanResult({ message: t("checkedInStudent", { first: stu.first_name, last: stu.last_name }), type: "success" });
        }
      }
    } finally { setBusy(""); }
  }

  async function bulkCheckIn(group: typeof groupedByCourse[0]) {
    const { data: { user } } = await supabase.auth.getUser();
    const approver = user?.id!;
    const unchecked = group.students.filter(s => !isHere(s.student_id, group.courseId));
    if (!unchecked.length) return;
    const inserts = unchecked.map(s => ({
      student_id: s.student_id, course_id: group.courseId, attended_at_ts: todayStr(), approved_by: approver,
    }));
    const { data, error } = await supabase.from("attendance").insert(inserts).select();
    if (error) return;
    setRows(rs => [...rs, ...(data ?? [])]);
    playDing(); haptic("success");
    setScanResult({ message: t("checkedInBulk", { count: unchecked.length }), type: "success" });
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase.from("students")
      .select("id,first_name,last_name,nick_name,qr_code_url")
      .or(`nick_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(10);
    setSearchResults(data ?? []);
  }

  async function walkInCheckIn(studentId: string, studentName: string) {
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: studentId, course_id: null, attended_at_ts: todayStr() }).select();
    if (!error && data) {
      setRows(rs => [...rs, data[0]]);
      playDing(); haptic("success");
      setScanResult({ message: t("scannedAssignCourse", { name: studentName }), type: "success" });
    }
    setShowSearch(false); setSearchQuery(""); setSearchResults([]);
  }

  async function onScanQR(raw: string) {
    const sid = raw.trim();
    setScanOpen(false);
    if (viewCourse) {
      const stu = courseGroup?.students.find(s => s.student_id === sid);
      if (stu) { await handleCheckIn(stu, viewCourse); return; }
    }
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: sid, course_id: viewCourse || null, attended_at_ts: todayStr(), ...(viewCourse ? { approved_by: (await supabase.auth.getUser()).data.user?.id } : {}) }).select();
    if (error) { playBeep(); setScanResult({ message: t("scanFailed"), type: "error" }); }
    else { setRows(rs => [...rs, data![0]]); playDing(); haptic("success"); setScanResult({ message: viewCourse ? t("checkedInMsg") : t("pendingApprovalMsg"), type: "success" }); }
  }

  async function deletePending(row: AttendanceRow) {
    await supabase.from("attendance").delete().eq("id", row.id);
    setRows(rs => rs.filter(r => r.id !== row.id));
  }

  async function approvePending(row: AttendanceRow, courseId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("attendance").update({ course_id: courseId, approved_by: user?.id }).eq("id", row.id);
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, course_id: courseId, approved_by: user?.id! } : r));
    playDing(); haptic("success");
  }

  const banner = (
    <AnimatePresence>
      {scanResult && (
        <motion.div key="banner" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-md w-[90%] px-5 py-4 rounded-[1.5rem] shadow-xl flex justify-between items-center z-50 btn-gummy-sm"
          style={{ background: scanResult.type === "success" ? POS.success : POS.danger, color: "#fff" }}>
          <span className="font-bouncy text-lg tracking-wide">{scanResult.message}</span>
          <button onClick={() => setScanResult(null)} className="text-xl font-bold ml-3 opacity-80">x</button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // === PENDING / COURSE DETAIL SLIDE UP ===
  const SlideUpModal = ({ title, onClose, content, bg }: any) => (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      {banner}
      <motion.div initial={{ y: 500 }} animate={{ y: 0 }} exit={{ y: 500 }} transition={{ type: "spring", bounce: 0.3 }}
        className="w-full flex flex-col pt-6 pb-20 px-4 sm:px-8 rounded-t-[3rem] h-[85vh] shadow-[0_-10px_40px_rgba(0,0,0,0.2)]"
        style={{ background: bg || POS.bgMain }} onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-8">
          <button onClick={onClose} className="w-14 h-14 rounded-[1.5rem] bg-white flex items-center justify-center btn-gummy-sm text-gray-800 shadow-sm">
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h2 className="text-3xl font-bouncy flex-1 text-center" style={{ color: POS.primary }}>{title}</h2>
          <div className="w-14 h-14" /> {/* Spacer */}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-20 hide-scrollbar">
          {content}
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen pb-32" style={{ background: POS.bgMain }}>
      {banner}

      {/* HEADER */}
      <div className="px-6 pt-10 pb-6 sticky top-[56px] z-30" style={{ background: "rgba(248, 249, 254, 0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-4xl font-bouncy tracking-tight" style={{ color: POS.primaryDark }}>{t("takeAttendance")}</h1>
            <p className="text-lg font-bold opacity-80" style={{ color: POS.textMuted }}>
              {t("expectedTodayCount", { count: expected.length })}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowPending(true)} className="relative w-16 h-16 rounded-[1.5rem] bg-white btn-gummy flex items-center justify-center">
              <ClockIcon className="w-8 h-8" style={{ color: POS.warning }} />
              {pending.length > 0 && <span className="absolute -top-2 -right-2 text-white text-lg font-bouncy rounded-full h-8 w-8 flex items-center justify-center shadow-md animate-pulse" style={{ background: POS.danger }}>{pending.length}</span>}
            </button>
            <button onClick={() => setScanOpen(true)} className="w-16 h-16 rounded-[1.5rem] text-white btn-gummy flex items-center justify-center" style={{ background: POS.primary }}>
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
            {showSearch ? "x " + t("closeSearchBtn") : "🔍 " + t("walkInSearchBtn")}
          </button>

          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
                <input type="text" placeholder={t("searchPlaceholder")} value={searchQuery}
                  onChange={e => handleSearch(e.target.value)} autoFocus
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

        {/* EXPECTED CLASSES */}
        {groupedByCourse.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-4 block">🏝️</span>
            <p className="text-2xl font-bouncy" style={{ color: POS.textMuted }}>{t("noClassesScheduled")}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByCourse.map((group, i) => {
              const checkedCount = group.students.filter(s => isHere(s.student_id, group.courseId)).length;
              const uncheckedCount = group.students.length - checkedCount;
              const colors = [POS.primary, POS.info, POS.warning, "#E91E63", POS.success];
              const sectionColor = colors[i % colors.length];

              return (
                <section key={group.courseId} className="bg-white p-5 rounded-[2rem] shadow-sm border-2" style={{ borderColor: POS.borderPurple }}>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy btn-gummy-sm shrinking-0" style={{ background: sectionColor }}>
                        {group.courseName.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bouncy leading-tight" style={{ color: POS.textPrimary }}>{group.courseName}</h2>
                        <div className="flex gap-2 text-sm font-bold opacity-80" style={{ color: POS.textMuted }}>
                          <span>{group.timeSlot}</span>
                          <span>•</span>
                          <span style={{ color: checkedCount === group.students.length ? POS.success : "inherit" }}>
                            {t("checkedInCount", { checked: checkedCount, total: group.students.length })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {uncheckedCount > 0 && (
                        <button onClick={() => bulkCheckIn(group)} className="flex-1 sm:flex-none px-5 py-3 rounded-[1.5rem] text-sm font-bouncy text-white btn-gummy" style={{ background: POS.success }}>
                          {t("checkInAll", { count: uncheckedCount })}
                        </button>
                      )}
                      <button onClick={() => setViewCourse(group.courseId)} className="flex-1 sm:flex-none px-5 py-3 rounded-[1.5rem] text-sm font-bouncy btn-gummy-sm bg-gray-100 text-gray-700">
                        {t("expand")}
                      </button>
                    </div>
                  </div>

                  <StudentGrid students={group.students} courseId={group.courseId} isHere={isHere} usedCnt={usedCnt} busyKey={busyKey} onCheckIn={handleCheckIn} />
                </section>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>{scanOpen && <AttendanceQRBox key="scanner" onScan={onScanQR} onClose={() => setScanOpen(false)} />}</AnimatePresence>

      {/* MODALS */}
      <AnimatePresence>
        {showPending && (
          <SlideUpModal title={t("pendingActions")} onClose={() => setShowPending(false)} bg="#FFF8E7"
            content={pending.length === 0 ? <p className="text-center font-bouncy text-xl py-10" style={{ color: POS.warning }}>{t("allClear")}</p>
              : pending.map(pr => <PendingCard key={pr.id} row={pr} courses={courses} onApprove={approvePending} onDelete={deletePending} />)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewCourse && courseGroup && (
          <SlideUpModal title={courseGroup.courseName} onClose={() => setViewCourse(null)} bg={POS.bgMain}
            content={
              <div className="p-4 bg-white rounded-[2rem] shadow-sm">
                <StudentGrid students={courseGroup.students} courseId={courseGroup.courseId} isHere={isHere} usedCnt={usedCnt} busyKey={busyKey} onCheckIn={handleCheckIn} />
              </div>
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// === Student Card Grid Component ===
function StudentGrid({ students, courseId, isHere, usedCnt, busyKey, onCheckIn }: any) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
      {students.map((stu: any) => {
        const checked = isHere(stu.student_id, courseId);
        const used = usedCnt(stu.student_id, courseId);
        const purchased = stu.purchased_hours;
        const remaining = purchased - used;
        const isOverlimit = purchased > 0 && remaining <= 0;
        const isLow = purchased > 0 && remaining > 0 && remaining <= 3;
        const isBusy = busyKey === `${stu.student_id}|${courseId}`;

        let borderColor = "transparent";
        let bgColor = "rgba(255, 255, 255, 0.8)";
        
        if (checked) { borderColor = "#34D399"; bgColor = "rgba(246, 255, 237, 0.95)"; }
        else if (isOverlimit) { borderColor = "#F87171"; bgColor = "rgba(254, 242, 242, 0.95)"; }
        else if (isLow) { borderColor = "#FBBF24"; bgColor = "rgba(255, 251, 230, 0.95)"; }

        return (
          <motion.button key={stu.student_id} whileTap={{ scale: 0.92, rotate: (Math.random() - 0.5) * 4 }} disabled={isBusy}
            onClick={() => onCheckIn(stu, courseId)}
            className={`btn-gummy flex flex-col items-center justify-start overflow-hidden relative shadow-lg ${isOverlimit ? "pulse-danger" : ""}`}
            style={{ 
              borderRadius: "2rem", 
              border: `2px solid ${borderColor}`,
              width: '100%', 
              background: bgColor,
              aspectRatio: "3/4",
              opacity: isBusy ? 0.6 : 1,
            }}>
            
            {/* Top Photo Area (Takes up 65% of card) */}
            <div className="w-full h-[65%] shrink-0 flex items-center justify-center relative overflow-hidden bg-[#EBF0FF]">
               {checked && (
                 <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md bg-green-500/30">
                   <span className="text-white text-6xl drop-shadow-xl font-extrabold">✓</span>
                 </motion.div>
               )}
               {stu.qr_code_url ? (
                  <img src={stu.qr_code_url} alt="" className="w-full h-full object-cover" />
               ) : (
                  <div className="text-white text-[5rem] font-bold opacity-80 drop-shadow-lg" style={{ color: POS.primaryLight }}>
                    {(stu.nick_name || stu.first_name || "?").charAt(0).toUpperCase()}
                  </div>
               )}
            </div>
            
            {/* Bottom Info Area (Takes up 35% of card) */}
            <div className="flex flex-col items-center justify-center w-full h-[35%] bg-white/95 px-2 glass-card">
              <div className="text-xl font-bouncy leading-tight truncate w-full text-center" style={{ color: POS.textPrimary }}>
                {stu.nick_name || stu.first_name}
              </div>
              <div className="text-[12px] font-extrabold mt-1 px-3 py-1 rounded-full shadow-inner tracking-wider"
                style={{ 
                  background: isOverlimit ? "rgba(248, 113, 113, 0.15)" : isLow ? "rgba(251, 191, 36, 0.2)" : "rgba(0,0,0,0.04)", 
                  color: isOverlimit ? "#EF4444" : isLow ? "#D97706" : POS.textSecondary 
                }}>
                {used} / {purchased || "∞"} hrs
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// === Pending Card ===
function PendingCard({ row, courses, onApprove, onDelete }: any) {
  const [studentName, setStudentName] = useState("");
  useEffect(() => {
    supabase.from("students").select("first_name,last_name,nick_name").eq("id", row.student_id).single()
      .then(({ data }) => { if (data) setStudentName(data.nick_name || `${data.first_name} ${data.last_name}`); });
  }, [row.student_id]);

  return (
    <div className="bg-white rounded-[2rem] p-5 mb-4 shadow-sm border-2 btn-gummy-sm" style={{ borderColor: POS.warning }}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bouncy" style={{ color: POS.textPrimary }}>{studentName || "Loading..."}</h3>
        <button onClick={() => onDelete(row)} className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 font-bold hover:bg-red-100 hover:text-red-500 transition-colors">x</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {courses.map((c: any) => (
          <button key={c.id} onClick={() => onApprove(row, c.id)} className="px-4 py-3 rounded-[1rem] font-bold text-sm text-white btn-gummy" style={{ background: POS.success }}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
