import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  UsersIcon, 
  AcademicCapIcon, 
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  QrCodeIcon,
  UserPlusIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/solid";
import Lottie from "lottie-react";
import { useAuth } from "./AuthContext";
import { usePendingReviewCount } from "./hooks/useApplications";
import { useExpectedToday, useStudents } from "./hooks/useStudents";
import { POS, haptic } from "./theme";
import AttendanceQRBox from "./AttendanceQRBox";
import { supabase } from "./supabaseClient";
import { todayStr } from "./services/attendance";
import { useQuery } from "@tanstack/react-query";
import { playDing } from "./utils";

export default function HomePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [lottieData, setLottieData] = useState<any>(null);

  useEffect(() => {
    fetch("https://lottie.host/801a2c91-cb35-43a9-a9a7-8aab698a96e5/6mEwvfM6Dq.json")
      .then(r => r.json()).then(data => setLottieData(data)).catch(e => console.error(e));
  }, []);

  const { data: reviewCount } = usePendingReviewCount(isAdmin);
  const { data: expected = [] } = useExpectedToday();
  const { data: students = [] } = useStudents(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [showCheckedIn, setShowCheckedIn] = useState(false);

  // Today's approved check-ins
  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["home_attendance_today"],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("student_id,approved_by")
        .gte("attended_at_ts", todayStr()).not("approved_by", "is", null);
      return data ?? [];
    },
    staleTime: 5_000, refetchOnWindowFocus: true, refetchInterval: 15_000,
  });

  const checkedInIds = useMemo(() => new Set(todayAttendance.map((a: any) => a.student_id)), [todayAttendance]);
  const checkedInStudents = useMemo(() => students.filter(s => checkedInIds.has(s.id)), [students, checkedInIds]);

  // Group expected by course for preview
  const courseGroups = useMemo(() => {
    const map = new Map<string, { name: string; time: string; total: number; checked: number }>();
    expected.forEach(s => {
      if (!map.has(s.course_id)) map.set(s.course_id, { name: s.course_name, time: s.time_slot, total: 0, checked: 0 });
      const g = map.get(s.course_id)!;
      g.total++;
      if (checkedInIds.has(s.student_id)) g.checked++;
    });
    return Array.from(map.values());
  }, [expected, checkedInIds]);

  // Overlimit students from expected
  const overlimitStudents = useMemo(() =>
    expected.filter(s => s.purchased_hours > 0 && s.hours_remaining <= 0),
    [expected]
  );

  async function onScanQR(raw: string) {
    setScanOpen(false);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data } = await supabase.from("attendance")
      .insert({ student_id: raw.trim(), course_id: null, attended_at_ts: todayStr() }).select();
    if (data) { playDing(); haptic("success"); }
    nav("/attendance");
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: POS.bgMain }}>
      {/* Top Hero Banner */}
      <div className="relative pt-12 pb-16 px-6 overflow-hidden rounded-b-[3rem]" style={{ background: POS.primaryGradient, boxShadow: POS.shadowMd }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full mix-blend-overlay opacity-10 bg-white" />
         <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex-1 flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-6">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[2rem] bg-white text-4xl shadow-xl flex items-center justify-center border-[4px] relative overflow-hidden" 
                 style={{ borderColor: "rgba(255,255,255,0.4)" }}>
              {lottieData ? <Lottie animationData={lottieData} loop={true} /> : <div className="text-4xl text-gray-200">...</div>}
            </div>
            <div className="mt-2 text-white">
              <h1 className="text-4xl sm:text-5xl font-bouncy tracking-tight drop-shadow-md mb-2 flex items-center gap-2">
                {t("goodMorning")}, {user?.email?.split('@')[0] || "Admin"}
              </h1>
              <p className="opacity-90 font-bold text-lg sm:text-xl drop-shadow-sm border border-white/20 bg-black/10 inline-block px-4 py-1.5 rounded-full backdrop-blur-sm">
                {t("haveWonderfulDay")} ✨
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats overlapping the banner */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-20 -mt-10">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <motion.div whileTap={{ scale: 0.95 }} className="glass-card rounded-[2rem] p-6 text-center flex flex-col items-center justify-center btn-gummy-sm"
                      style={{ border: "2px solid #FFE58F", background: "rgba(255, 251, 230, 0.9)" }}>
            <CalendarDaysIcon className="w-10 h-10 mb-3 drop-shadow-sm" style={{ color: "#FAAD14" }} />
            <div className="text-4xl font-bouncy leading-none" style={{ color: "#D48806" }}>{expected.length}</div>
            <div className="text-[12px] font-extrabold mt-2 uppercase tracking-wider" style={{ color: "#FAAD14" }}>{t("expected")}</div>
          </motion.div>
          
          <motion.div whileTap={{ scale: 0.95 }} className="glass-card rounded-[2rem] p-6 text-center flex flex-col items-center justify-center btn-gummy-sm"
                      style={{ border: "2px solid #91D5FF", background: "rgba(230, 247, 255, 0.9)" }}>
            <AcademicCapIcon className="w-10 h-10 mb-3 drop-shadow-sm" style={{ color: "#1890FF" }} />
            <div className="text-4xl font-bouncy leading-none" style={{ color: "#096DD9" }}>{courseGroups.length}</div>
            <div className="text-[12px] font-extrabold mt-2 uppercase tracking-wider" style={{ color: "#1890FF" }}>{t("classes")}</div>
          </motion.div>
          
          <motion.div whileTap={{ scale: 0.95 }} onClick={() => setShowCheckedIn(true)}
            className="glass-card rounded-[2rem] p-6 text-center cursor-pointer flex flex-col items-center justify-center btn-gummy-sm cursor-pointer"
            style={{ border: "2px solid #B7EB8F", background: "rgba(246, 255, 237, 0.9)" }}>
            <UsersIcon className="w-10 h-10 mb-3 drop-shadow-sm" style={{ color: "#52C41A" }} />
            <div className="text-4xl font-bouncy leading-none" style={{ color: "#389E0D" }}>{checkedInIds.size}</div>
            <div className="text-[12px] font-extrabold mt-2 uppercase tracking-wider" style={{ color: "#52C41A" }}>{t("checkedIn")}</div>
          </motion.div>
        </div>

        {/* Main Actions (Gummy Cards) */}
        <div className="grid grid-cols-2 gap-5 mb-8">
          <motion.button onClick={() => nav("/attendance")}
            className="col-span-2 btn-gummy flex items-center p-8 gap-6 text-white overflow-hidden relative shadow-lg"
            style={{ background: POS.success, borderRadius: POS.radius3xl, border: "4px solid rgba(255,255,255,0.3)" }}>
            <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 6 }} className="absolute -right-6 -bottom-6 opacity-20">
              <ClipboardDocumentCheckIcon className="w-64 h-64" />
            </motion.div>
            <div className="w-20 h-20 rounded-[1.5rem] bg-white text-green-500 flex items-center justify-center shrink-0 shadow-lg overflow-hidden border border-green-200">
               <ClipboardDocumentCheckIcon className="w-10 h-10" />
            </div>
            <div className="text-left z-10 flex-1">
              <div className="text-4xl font-bouncy tracking-wide leading-none drop-shadow-md mb-2">{t("takeAttendance")}</div>
              <div className="text-sm font-extrabold text-white bg-black/10 inline-block px-4 py-1.5 rounded-full border border-white/20 backdrop-blur-sm shadow-sm">{t("fastCheckIn")}</div>
            </div>
          </motion.button>

          <motion.button onClick={() => setScanOpen(true)}
            className="btn-gummy flex flex-col items-center justify-center p-6 gap-4 text-white shadow-lg relative overflow-hidden"
            style={{ background: POS.info, borderRadius: POS.radius3xl, border: "4px solid rgba(255,255,255,0.3)" }}>
            <div className="w-16 h-16 rounded-[1.5rem] bg-white flex items-center justify-center shadow-lg border border-blue-200">
               <QrCodeIcon className="w-10 h-10 text-blue-500" />
            </div>
            <span className="font-bouncy text-2xl leading-tight text-center drop-shadow-sm mt-1">{t("scanQr")}</span>
          </motion.button>

          <motion.button onClick={() => nav("/admissions")}
            className="btn-gummy flex flex-col items-center justify-center p-6 gap-4 text-white shadow-lg relative overflow-hidden"
            style={{ background: "#E91E63", borderRadius: POS.radius3xl, border: "4px solid rgba(255,255,255,0.3)" }}>
            <div className="w-16 h-16 rounded-[1.5rem] bg-white flex items-center justify-center shadow-lg border border-pink-200">
               <UserPlusIcon className="w-10 h-10 text-pink-500" />
            </div>
            <span className="font-bouncy text-2xl leading-tight text-center drop-shadow-sm mt-1">{t("newStudent")}</span>
          </motion.button>
        </div>

        {/* Action List Section */}
        <div className="space-y-4">
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => nav("/courses")}
            className="btn-gummy-sm w-full p-5 flex items-center justify-between text-left bg-white"
            style={{ borderRadius: POS.radius2xl, border: `1px solid ${POS.borderLight}` }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center" style={{ background: POS.bgSurface, color: POS.primary }}>
                <ClipboardDocumentCheckIcon className="w-6 h-6" />
              </div>
              <span className="text-xl font-bouncy" style={{ color: POS.textPrimary }}>{t("courses")}</span>
            </div>
            <div className="text-gray-300 font-bold">❯</div>
          </motion.button>

          {/* Pending Reviews */}
          {isAdmin && reviewCount && reviewCount > 0 && (
            <motion.div whileTap={{ scale: 0.98 }} onClick={() => nav("/inbox")}
              className="btn-gummy-sm w-full p-5 flex items-center justify-between cursor-pointer"
              style={{ border: `2px solid ${POS.warning}`, background: POS.warningLight, borderRadius: POS.radius2xl }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white font-bouncy text-2xl shadow-sm" style={{ background: POS.warning }}>
                  {reviewCount}
                </div>
                <div>
                  <span className="font-bouncy text-xl" style={{ color: '#D97706' }}>{t("pendingApprovalsExclaim")}</span>
                  <p className="text-sm font-bold" style={{ color: '#B45309' }}>{t("tapToReviewThem")}</p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-orange-400 flex items-center justify-center text-white font-bold">→</div>
            </motion.div>
          )}

          {/* Overlimit Students */}
          {overlimitStudents.length > 0 && (
            <div className="bg-white p-5 shadow-sm" style={{ border: `1px solid ${POS.borderLight}`, borderRadius: POS.radius3xl }}>
              <div className="flex items-center gap-2 mb-4">
                <ExclamationTriangleIcon className="w-6 h-6" style={{ color: POS.danger }} />
                <h2 className="text-xl font-bouncy" style={{ color: POS.danger }}>{t("needsRenewal")}</h2>
              </div>
              <div className="space-y-3">
                {overlimitStudents.slice(0, 5).map(s => (
                  <motion.div key={s.enrollment_id} whileTap={{ scale: 0.98 }} onClick={() => nav(`/students/${s.student_id}`)}
                    className="flex items-center gap-4 p-4 cursor-pointer btn-gummy-sm"
                    style={{ background: POS.dangerLight, borderRadius: POS.radius2xl, border: `1px solid ${POS.danger}33` }}>
                    <div className="w-10 h-10 rounded-[0.75rem] flex items-center justify-center text-white text-xl font-bouncy" style={{ background: POS.danger }}>!</div>
                    <div className="flex-1">
                      <span className="font-bouncy text-lg leading-tight block" style={{ color: POS.textPrimary }}>{s.nick_name || s.first_name}</span>
                      <span className="font-bold text-sm" style={{ color: POS.danger }}>{s.course_name}</span>
                    </div>
                    <span className="text-sm font-bouncy px-3 py-1 bg-white rounded-[1rem] shadow-sm" style={{ color: POS.danger }}>
                      {s.hours_used}/{s.purchased_hours} hrs
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Classes List */}
          {courseGroups.length > 0 && (
            <section className="bg-white p-5 shadow-sm" style={{ border: `1px solid ${POS.borderLight}`, borderRadius: POS.radius3xl }}>
              <h2 className="text-xl font-bouncy mb-4" style={{ color: POS.textPrimary }}>🎒 {t("scheduledToday")}</h2>
              <div className="space-y-3">
                {courseGroups.map((g, i) => {
                  const colors = [POS.primary, POS.success, POS.info, POS.warning, "#E91E63"];
                  const bgColor = colors[i % colors.length];
                  return (
                    <motion.div key={i} whileTap={{ scale: 0.98 }} onClick={() => nav("/attendance")}
                      className="flex items-center gap-4 p-4 cursor-pointer btn-gummy-sm bg-gray-50 bg-opacity-50"
                      style={{ borderRadius: POS.radius2xl, border: `1px solid ${POS.borderLight}` }}>
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy shadow-sm shrink-0" style={{ background: bgColor }}>
                        {g.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <span className="font-bouncy text-lg block leading-tight" style={{ color: POS.textPrimary }}>{g.name}</span>
                        <span className="font-bold text-xs" style={{ color: POS.textMuted }}>{g.time}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bouncy text-sm mb-1" style={{ color: g.checked === g.total && g.total > 0 ? POS.success : POS.textMuted }}>
                          {g.checked}/{g.total}
                        </span>
                        <div className="w-16 h-2 flex rounded-full overflow-hidden" style={{ background: POS.borderLight }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${g.total ? (g.checked / g.total) * 100 : 0}%`, background: POS.success }} />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      <AnimatePresence>{scanOpen && <AttendanceQRBox key="hs" onScan={onScanQR} onClose={() => setScanOpen(false)} />}</AnimatePresence>

      <AnimatePresence>
        {showCheckedIn && (
          <motion.div key="ci" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowCheckedIn(false)}>
            <motion.div initial={{ y: 200, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 200, scale: 0.9 }} transition={{ type: "spring", bounce: 0.4 }}
              className="bg-white rounded-[2rem] w-full sm:max-w-md max-h-[80vh] overflow-y-auto p-6"
              style={{ boxShadow: POS.shadowXl }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bouncy" style={{ color: POS.primary }}>{t("todaysCheckins")} ({checkedInIds.size})</h3>
                <button onClick={() => setShowCheckedIn(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center btn-gummy-sm text-xl font-bold" style={{ color: POS.textMuted }}>
                  x
                </button>
              </div>
              {checkedInStudents.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-6xl mb-4 block">👀</span>
                  <p className="font-bold text-lg" style={{ color: POS.textMuted }}>{t("nobodyHereYet")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {checkedInStudents.map(s => (
                    <motion.div key={s.id} whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-4 p-4 btn-gummy-sm cursor-pointer"
                      style={{ background: POS.successLight, border: `2px solid ${POS.success}44`, borderRadius: POS.radius2xl }}
                      onClick={() => { setShowCheckedIn(false); nav(`/students/${s.id}`); }}>
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bold shadow-sm" style={{ background: POS.success }}>✓</div>
                      <span className="font-bouncy text-lg flex-1" style={{ color: POS.textPrimary }}>
                        {s.nick_name && <span style={{ color: POS.primary }}>"{s.nick_name}" </span>}
                        {s.first_name} {s.last_name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
