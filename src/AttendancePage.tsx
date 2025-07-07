import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftIcon, QrCodeIcon, ClockIcon } from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import AttendanceQRBox from "./AttendanceQRBox";
import { useTranslation } from "react-i18next";

// Theme & Palette
const PALETTE = [
  "bg-pink-300", "bg-orange-300", "bg-yellow-300", "bg-lime-300",
  "bg-emerald-300", "bg-cyan-300", "bg-purple-300", "bg-rose-300"
];
const BG_SOFT = "#f6f6f6";
const ACCENT_PURPLE = "#6654b3";

// Types
interface Course { id: string; name: string }
interface Student {
  id: string;
  first_name: string;
  last_name: string;
  courses: Record<string, any>;
  course_limits: Record<string, number>;
  qr_code_url?: string | null;
}
interface AttRow {
  id: string;
  student_id: string;
  course_id: string | null;
  attended_at_ts: string;
  approved_by: string | null;
}

// Helpers
const today = () => new Date().toISOString().slice(0,10);
const ding  = new Audio("/ding.wav");
const beep  = new Audio("/wrongbeep.wav");

export default function AttendancePage() {
  const { t } = useTranslation();
  const nav = useNavigate();

  // UI State
  const [viewCourse,  setViewCourse]  = useState<Course|null>(null);
  const [showPending, setShowPending] = useState(false);
  const [scanOpen,    setScanOpen]    = useState(false);
  const [scanResult,  setScanResult]  = useState<{ message: string; type: "success"|"error" }|null>(null);
  const [qrModalUrl,  setQrModalUrl]   = useState<string|null>(null);

  useEffect(() => {
    if (!scanResult) return;
    const tmo = setTimeout(() => setScanResult(null), 4000);
    return () => clearTimeout(tmo);
  }, [scanResult]);

  // Data State
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [dataLoading,    setDataLoading]    = useState(true);
  const [busyKey,        setBusy]           = useState("");
  const [courses,        setCourses]        = useState<Course[]>([]);
  const [students,       setStudents]       = useState<Student[]>([]);
  const [rows,           setRows]           = useState<AttRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase
        .from("courses")
        .select("id,name")
        .order("name");
      setCourses((c as Course[]) || []);
      setCoursesLoading(false);

      const [sReq, aReq] = await Promise.all([
        supabase.from("students").select("id,first_name,last_name,courses,course_limits,qr_code_url"),
        supabase.from("attendance").select("*").gte("attended_at_ts", today())
      ]);
      setStudents((sReq.data as Student[]) || []);
      setRows((aReq.data as AttRow[]) || []);
      setDataLoading(false);
    })();
  }, []);

  // Attendance logic
  const approvedRows = rows.filter(r => r.approved_by);
  const usedCnt = useMemo(() => {
    const m: Record<string,Record<string,number>> = {};
    approvedRows.forEach(r => {
      if (!r.course_id) return;
      m[r.student_id] ??= {};
      m[r.student_id][r.course_id!] = (m[r.student_id][r.course_id!]||0) + 1;
    });
    return m;
  }, [approvedRows]);
  const todaySet = useMemo(() => {
    const m: Record<string,Set<string>> = {};
    approvedRows.forEach(r => {
      if (r.course_id && r.attended_at_ts.slice(0,10) === today()) {
        m[r.course_id] ??= new Set();
        m[r.course_id]!.add(r.student_id);
      }
    });
    return m;
  }, [approvedRows]);
  const pending = rows.filter(r => !r.approved_by);
  const cnt  = (sid:string,cid:string) => usedCnt[sid]?.[cid] || 0;
  const lim  = (stu:Student,cid:string) => stu.course_limits[cid] || 0;
  const here = (sid:string,cid:string) => todaySet[cid]?.has(sid);

  // Actions
  async function deletePending(row:AttRow) {
    await supabase.from("attendance").delete().eq("id", row.id);
    setRows(rs => rs.filter(r => r.id !== row.id));
  }
  async function write(stu: Student, cid:string) {
    const key = `${stu.id}|${cid}`;
    if (busyKey === key) return;
    setBusy(key);
    const { data:{ user } } = await supabase.auth.getUser();
    const approver = user?.id!;
    try {
      if (here(stu.id,cid)) {
        // un-check only today's record
        const existing = rows.find(r =>
          r.student_id === stu.id &&
          r.course_id   === cid &&
          r.attended_at_ts.slice(0,10) === today()
        );
        if (existing) {
          await supabase.from("attendance").delete().eq("id", existing.id);
          setRows(rs => rs.filter(r => r.id !== existing.id));
        }
        setScanResult({
          message: t("uncheckedStudent", { first: stu.first_name, last: stu.last_name }),
          type: "error"
        });
      } else {
        // limit guard
        if (lim(stu,cid) && cnt(stu.id,cid) >= lim(stu,cid)) {
          setScanResult({
            message: t("overLimit", { first: stu.first_name, last: stu.last_name }),
            type: "error"
          });
          return;
        }
        // manual check-in
        const { data, error } = await supabase.from("attendance")
          .insert({
            student_id:     stu.id,
            course_id:      cid,
            attended_at_ts: today(),
            approved_by:    approver
          }).select();
        if (error) throw error;
        setRows(rs => [...rs, data![0]]);
        setScanResult({
          message: t("checkedInStudent", { first: stu.first_name, last: stu.last_name }),
          type: "success"
        });
      }
    } finally {
      setBusy("");
      setScanOpen(false);
    }
  }
  async function onScanQR(raw:string) {
    const sid = raw.trim();
    const stu = students.find(s => s.id === sid);
    setScanOpen(false);
    if (!stu) {
      beep.pause(); beep.currentTime=0; beep.play();
      setScanResult({ message: t("unknownCode"), type: "error" });
      return;
    }
    if (rows.some(r =>
      r.student_id === sid &&
      r.attended_at_ts.slice(0,10) === today()
    )) {
      beep.pause(); beep.currentTime=0; beep.play();
      setScanResult({
        message: t("alreadyScanned", { first: stu.first_name, last: stu.last_name }),
        type: "error"
      });
      return;
    }
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: sid, course_id: null, attended_at_ts: today() })
      .select();
    if (error) {
      beep.pause(); beep.currentTime=0; beep.play();
      setScanResult({ message: t("scanFailed"), type: "error" });
    } else {
      setRows(rs => [...rs, data![0]]);
      ding.pause(); ding.currentTime=0; ding.play();
      setScanResult({
        message: t("pendingStudent", { first: stu.first_name, last: stu.last_name }),
        type: "success"
      });
    }
  }
  async function approvePending(row:AttRow, selected:string[]) {
    if (!selected.length) return;
    const { data:{ user } } = await supabase.auth.getUser();
    const approver = user?.id!;
    const stu = students.find(s => s.id === row.student_id)!;
    await supabase.from("attendance")
      .update({ course_id: selected[0], approved_by: approver })
      .eq("id", row.id);
    // extras
    if (selected.length > 1) {
      const extras = selected.slice(1).map(cid => ({
        student_id:     row.student_id,
        course_id:      cid,
        attended_at_ts: row.attended_at_ts,
        approved_by:    approver
      }));
      await supabase.from("attendance").insert(extras);
    }
    setRows(rs => {
      const kept    = rs.filter(r => r.id !== row.id);
      const updated = { ...row, course_id: selected[0], approved_by: approver };
      const all     = [ ...kept, updated ];
      if (selected.length > 1) {
        selected.slice(1).forEach(cid =>
          all.push({
            ...row,
            id:             crypto.randomUUID(),
            course_id:      cid,
            approved_by:    approver
          })
        );
      }
      return all;
    });
    ding.pause(); ding.currentTime=0; ding.play();
    setScanResult({
      message: t("checkedInStudent", { first: stu.first_name, last: stu.last_name }),
      type: "success"
    });
  }

  // Banner
  const scanBanner = (
    <AnimatePresence>
      {scanResult && (
        <motion.div
          key="banner"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ type:"spring", stiffness:300 }}
          className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 
                      max-w-md w-full px-4 py-3 rounded-xl shadow-lg flex 
                      justify-between items-center z-50 ${
                        scanResult.type==="success"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
        >
          <span>{scanResult.message}</span>
          <button
            onClick={()=>setScanResult(null)}
            className="text-xl font-bold leading-none"
          >×</button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Pending Tab
  if (showPending) {
    if (dataLoading) return <div className="p-6 text-center">{t("loadingPending")}</div>;
    return (
      <>
        {scanBanner}
        <main style={{ background: BG_SOFT }} className="min-h-screen p-6">
          <header className="flex items-center gap-4 mb-4">
            <button onClick={()=>setShowPending(false)}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 shadow">
              <ArrowLeftIcon className="w-6 h-6 text-gray-700"/>
            </button>
            <h2 className="text-2xl font-bold" style={{ color: ACCENT_PURPLE }}>{t("pendingCheckins")}</h2>
          </header>
          {pending.length === 0 ? (
            <p className="text-gray-500">{t("noPendingCheckins")}</p>
          ) : pending.map(pr => {
            const stu = students.find(s => s.id === pr.student_id);
            if (!stu) return null;
            return (
              <PendingRow
                key={pr.id}
                row={pr}
                student={stu}
                courses={courses}
                onApprove={approvePending}
                onDelete={deletePending}
              />
            );
          })}
        </main>
      </>
    );
  }

  // Grid & Detail
  return (
    <div style={{ background: BG_SOFT }} className="min-h-screen">
      {scanBanner}
      <AnimatePresence mode="wait">
        {viewCourse == null ? (
          <main className="min-h-screen p-6 flex flex-col items-center gap-8" style={{ background: BG_SOFT }}>
            <div className="w-full max-w-5xl flex justify-between items-center mb-6">
                          <h1 className="text-3xl font-extrabold" style={{ color: ACCENT_PURPLE }}>
                {t("takeAttendance")}
              </h1>
              <div className="flex gap-3">
                <button onClick={()=>setShowPending(true)}
                  className="relative p-2 bg-yellow-400 text-white rounded-full shadow">
                  <ClockIcon className="w-5 h-5"/>
                  {pending.length>0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-[10px] px-1 rounded-full">
                      {pending.length}
                    </span>
                  )}
                </button>
                <motion.button whileTap={{ scale:0.92 }}
                  onClick={()=>setScanOpen(true)}
                  className="p-2"
                  style={{
                    background: ACCENT_PURPLE,
                    color: "#fff",
                    borderRadius: "9999px",
                    boxShadow: "0 2px 8px 0 rgba(102,84,179,0.12)"
                  }}
                >
                  <QrCodeIcon className="w-6 h-6"/>
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-7 w-full max-w-4xl">
              {coursesLoading
                ? Array(6).fill(0).map((_,i)=>(
                    <motion.div key={i}
                      initial={{ opacity:0.3 }}
                      animate={{ opacity:1 }}
                      className="w-32 h-32 bg-gray-200 rounded-2xl"
                    />
                  ))
                : courses.map((c,i)=>(
                    <motion.button key={c.id}
                      whileHover={{ scale:1.06 }}
                      whileTap={{ scale:0.95 }}
                      onClick={()=>setViewCourse(c)}
                      className={`${PALETTE[i%PALETTE.length]} w-32 h-32 md:w-40 md:h-40 rounded-2xl shadow-lg
                                 flex items-center justify-center text-white font-bold text-lg transition-all duration-150`}
                      style={{ boxShadow:"0 3px 16px 0 rgba(102,84,179,0.06)" }}
                    >
                      {c.name}
                    </motion.button>
                  ))
              }
            </div>

            <AnimatePresence>
              {scanOpen && (
                <AttendanceQRBox
                  key="scanner-grid"
                  onScan={onScanQR}
                  onClose={()=>setScanOpen(false)}
                />
              )}
            </AnimatePresence>
          </main>
        ) : dataLoading ? (
          <div className="p-6 text-center">{t("loadingStudents")}</div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 space-y-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <button onClick={()=>setViewCourse(null)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 shadow">
                <ArrowLeftIcon className="w-6 h-6 text-gray-700"/>
              </button>
              <h2 className="text-2xl font-bold" style={{ color: ACCENT_PURPLE }}>{viewCourse!.name}</h2>
              <motion.button whileTap={{ scale:0.92 }}
                onClick={()=>setScanOpen(true)}
                className="ml-auto p-2"
                style={{
                  background: ACCENT_PURPLE,
                  color: "#fff",
                  borderRadius: "9999px",
                  boxShadow: "0 2px 8px 0 rgba(102,84,179,0.12)"
                }}
              >
                <QrCodeIcon className="w-6 h-6"/>
              </motion.button>
            </div>

            <table className="min-w-full bg-white rounded-xl shadow" style={{ boxShadow:"0 2px 12px 0 rgba(102,84,179,0.05)" }}>
              <thead style={{ background: "#ede9fe" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: ACCENT_PURPLE }}>{t("student")}</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: ACCENT_PURPLE }}>{t("slots")}</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: ACCENT_PURPLE }}>{t("usedLimit")}</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: ACCENT_PURPLE }}>{t("check")}</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: ACCENT_PURPLE }}>QR</th>
                </tr>
              </thead>
              <tbody>
                {students
                  .filter(s => !!s.courses[viewCourse!.id])
                  .map(stu => {
                    const u = cnt(stu.id, viewCourse!.id);
                    const cap = lim(stu, viewCourse!.id);
                    const inToday = here(stu.id, viewCourse!.id);
                    const dis = busyKey === `${stu.id}|${viewCourse!.id}`;
                    return (
                      <motion.tr key={stu.id}
                        whileHover={{ backgroundColor: "#f3f4f6" }}
                        className="border-t transition"
                      >
                        <td onClick={()=>nav(`/myschool/student/${stu.id}`)}
                          className="px-3 py-1 text-blue-700 font-semibold hover:underline cursor-pointer">
                          {stu.first_name} {stu.last_name}
                        </td>
                        <td className="px-3 py-1 text-gray-700">
                          {Object.entries(stu.courses[viewCourse!.id])
                            .flatMap(([d,t]) => (t as string[]).map(tt=>`${d} ${tt}`))
                            .join(", ")
                          }
                        </td>
                        <td className="px-3 py-1 text-center">{u}/{cap||t("unlimited")}</td>
                        <td className="px-3 py-1 text-center">
                          <motion.button whileTap={{ scale:0.82 }}
                            disabled={dis}
                            onClick={()=>write(stu, viewCourse!.id)}
                            className={`w-9 h-9 rounded-full transition font-bold ${
                              inToday
                                ? "bg-green-500 text-white"
                                : cap&&u>=cap
                                  ? "bg-gray-200 text-gray-400"
                                  : "bg-gray-300 text-gray-700 hover:bg-gray-400"
                            }`}>
                            ✓
                          </motion.button>
                        </td>
                        <td className="px-3 py-1 text-center">
                          <button onClick={()=>setQrModalUrl(stu.qr_code_url!)}
                            disabled={!stu.qr_code_url}
                            className="px-3 py-1 bg-purple-100 hover:bg-purple-200 rounded-full text-xs text-[#6654b3] font-bold disabled:opacity-50">
                            QR
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
              </tbody>
            </table>

            <AnimatePresence>
              {scanOpen && (
                <AttendanceQRBox
                  key="scanner-detail"
                  onScan={raw => {
                    const sid = raw.trim();
                    const stu = students.find(s => s.id === sid);
                    if (stu) write(stu, viewCourse!.id);
                  }}
                  onClose={()=>setScanOpen(false)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {qrModalUrl && (
          <motion.div
            key="qrModal"
            initial={{ scale:0.9, opacity:0 }}
            animate={{ scale:1, opacity:1 }}
            exit={{ scale:0.9, opacity:0 }}
            transition={{ type:"spring", damping:20 }}
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ y:-20 }}
              animate={{ y:0 }}
              exit={{ y:20 }}
              className="bg-white p-6 rounded-xl shadow-lg text-center"
            >
              <h3 className="text-lg font-bold mb-4" style={{ color: ACCENT_PURPLE }}>{t("studentQrCode")}</h3>
              <img src={qrModalUrl} alt="QR" className="mx-auto max-w-xs mb-4"/>
              <div className="flex justify-center gap-4">
                <a href={qrModalUrl} download className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-lg">
                  {t("download")}
                </a>
                <button onClick={()=>{
                  const w = window.open("");
                  if (w) {
                    w.document.write(
                      `<img src="${qrModalUrl}" onload="window.print();window.close()" />`
                    );
                    w.document.close();
                  }
                }} className="px-4 py-2 bg-green-100 hover:bg-green-200 rounded-lg">
                  {t("print")}
                </button>
                <button onClick={()=>setQrModalUrl(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                  {t("close")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PendingRow({
  row, student, courses, onApprove, onDelete
}: {
  row: AttRow;
  student: Student;
  courses: Course[];
  onApprove: (r:AttRow,sel:string[]) => Promise<void>;
  onDelete: (r:AttRow) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const choices = Object.keys(student.courses);
  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, y:16 }}
      className="border border-gray-100 bg-white p-4 mb-4 rounded-2xl shadow"
      style={{ boxShadow:"0 2px 10px 0 rgba(102,84,179,0.04)" }}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-[#6654b3]">
          {student.first_name} {student.last_name}
        </h3>
        <button onClick={()=>onDelete(row)} className="text-gray-400 hover:text-red-500 text-lg px-2 font-bold">×</button>
      </div>
      <div className="flex flex-wrap gap-3 mb-3">
        {choices.map(cid=>(
          <label key={cid} className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-[#ede9fe] text-[#6654b3] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(cid)}
              onChange={e=>
                setSelected(sel=>
                  e.target.checked
                    ? [...sel,cid]
                    : sel.filter(x=>x!==cid)
                )
              }
              className="accent-[#6654b3]"
            />
            {courses.find(c=>c.id===cid)?.name}
          </label>
        ))}
      </div>
      <button
        disabled={!selected.length}
        onClick={()=>onApprove(row, selected)}
        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-bold disabled:opacity-50 transition"
      >
        {t("approve")}
      </button>
    </motion.div>
  );
}
