import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { Dialog } from "@headlessui/react";
import {
  XMarkIcon, PlusIcon, PencilSquareIcon, TrashIcon,
  ChevronDownIcon, ChevronRightIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationCircleIcon
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

// Pastel backgrounds
const pastelColors = [
  "bg-pink-50", "bg-blue-50", "bg-yellow-50", "bg-purple-50", "bg-green-50", "bg-indigo-50"
];
function getPastel(index: number) {
  return pastelColors[index % pastelColors.length];
}

async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, role: null };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { id: user.id, role: data?.role || null };
}

// --- React Query hooks ---
function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("*").eq("id", id).single();
      return data;
    },
    enabled: !!id,
    staleTime: 300000,
  });
}
function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("name");
      return data || [];
    },
    staleTime: 300000,
  });
}
function useAttendance(id: string | undefined) {
  return useQuery({
    queryKey: ["attendance", id],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
    staleTime: 120000,
  });
}
function useAppChanges(id: string | undefined) {
  return useQuery({
    queryKey: ["appchanges", id],
    queryFn: async () => {
      const { data } = await supabase.from("application_changes").select("*").eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
    staleTime: 120000,
  });
}
function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: getCurrentProfile,
    staleTime: 120000,
  });
}

// --- MAIN PAGE ---
export default function StudentProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile } = useProfile();
  const { data: student, isLoading: loadingStudent } = useStudent(id);
  const { data: courses } = useCourses();
  const { data: attendance } = useAttendance(id);
  const { data: appChanges } = useAppChanges(id);

  // modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addCourse, setAddCourse] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [addTime, setAddTime] = useState<string | null>(null);
  const [addHours, setAddHours] = useState<number>(1);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [renewCourse, setRenewCourse] = useState<string | null>(null);
  const [renewHours, setRenewHours] = useState<number>(1);
  const [renewFile, setRenewFile] = useState<File | null>(null);

  // day/time inline edit
  const [editDay, setEditDay] = useState<{ cid: string; oldDay: string } | null>(null);
  const [editDayValue, setEditDayValue] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<{ cid: string; day: string; oldTime: string } | null>(null);
  const [editTimeValue, setEditTimeValue] = useState<string | null>(null);

  const [viewReceipts, setViewReceipts] = useState<{ urls: string[]; title: string } | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  const courseMap = useMemo(
    () => Object.fromEntries((courses || []).map((c: any) => [c.id, c])),
    [courses]
  );

  function currentCourses() {
    if (!student?.courses) return [];
    return Object.keys(student.courses).map((cid, idx) => {
      const cr = courseMap[cid];
      return {
        cid, idx, course: cr,
        days: student.courses[cid],
        hours: student.course_limits?.[cid] || 0,
        cancelled_at: student.cancelled_at?.[cid] || null,
        cancelled_by: student.cancelled_by?.[cid] || null,
      };
    });
  }
  function getReceipts(cid: string) {
    const arr0 = Array.isArray(student?.payment_receipt_urls) ? student.payment_receipt_urls : [];
    const arr1 = student?.receipts?.[cid] || [];
    const arr2 = (appChanges || [])
      .filter((ac: any) =>
        (ac.changes?.course_limits?.[cid] || ac.changes?.course_changes?.[cid]) &&
        (ac.changes?.receipts?.length || ac.receipt_urls?.length)
      )
      .flatMap((ac: any) =>
        ac.changes?.receipts?.length
          ? ac.changes.receipts
          : ac.receipt_urls?.length
            ? ac.receipt_urls
            : []
      );
    return [...arr0, ...arr1, ...arr2];
  }
  function getAttendanceRows(cid: string) {
    return (attendance || []).filter((a: any) => a.course_id === cid);
  }
  function getHours(cid: string) {
    const used = getAttendanceRows(cid).length;
    const purchased = student?.course_limits?.[cid] || 0;
    return {
      used, purchased,
      left: Math.max(0, purchased - used),
      status: purchased - used > 0 ? t("ongoing") : t("renewalNeeded")
    };
  }

  async function handleEditDay(cid: string, oldDay: string, newDay: string) {
    if (!student?.courses[cid][oldDay] || newDay === oldDay) {
      setEditDay(null);
      return;
    }
    const times = student.courses[cid][oldDay];
    const newCourses = { ...student.courses };
    if (!newCourses[cid][newDay]) newCourses[cid][newDay] = [];
    newCourses[cid][newDay] = Array.from(new Set([...(newCourses[cid][newDay]), ...times]));
    delete newCourses[cid][oldDay];
    await supabase.from("students").update({ courses: newCourses }).eq("id", student.id);
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    setEditDay(null); setEditDayValue(null);
  }
  async function handleEditTime(cid: string, day: string, oldTime: string, newTime: string) {
    if (!student?.courses[cid][day] || newTime === oldTime) {
      setEditTime(null);
      return;
    }
    const newTimes = student.courses[cid][day].map((t: string) => (t === oldTime ? newTime : t));
    const newCourses = { ...student.courses };
    newCourses[cid][day] = Array.from(new Set(newTimes));
    await supabase.from("students").update({ courses: newCourses }).eq("id", student.id);
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    setEditTime(null); setEditTimeValue(null);
  }
  async function handleCancelCourse(cid: string) {
  if (!student || !profile || !profile.id) {
    // Option 1: Show user feedback, or return early
    alert(t("profileMissingError")); // Add this key
    return;
  }
  const cancelled_at = { ...(student.cancelled_at || {}) };
  const cancelled_by = { ...(student.cancelled_by || {}) };
  cancelled_at[cid] = new Date().toISOString();
  cancelled_by[cid] = profile.id;
  await supabase.from("students").update({ cancelled_at, cancelled_by }).eq("id", student.id);
  queryClient.invalidateQueries({ queryKey: ["student", id] });
}
  async function handleRenewSubmit() {
    if (!renewCourse || !renewFile || renewHours < 1) return;
    const file = renewFile;
    const fn = `${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("receipts").upload(fn, file);
    if (uploadError) { alert(uploadError.message); return; }
    const { data: publicUrl } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
    await supabase.from("application_changes").insert([{
      student_id: student.id, type: "renewal", status: "pending",
      changes: {
        course_limits: { [renewCourse]: renewHours },
        receipts: [publicUrl.publicUrl],
      },
    }]);
    setRenewCourse(null); setRenewHours(1); setRenewFile(null);
    alert(t("submitRenewal"));
    queryClient.invalidateQueries({ queryKey: ["appchanges", id] });
  }
  async function handleAddCourse() {
    if (!addCourse || !addDay || !addTime || !addFile || addHours < 1) return;
    const file = addFile;
    const fn = `${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("receipts").upload(fn, file);
    if (uploadError) { alert(uploadError.message); return; }
    const { data: publicUrl } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
    await supabase.from("application_changes").insert([{
      student_id: student.id, type: "edit", status: "pending",
      changes: {
        course_changes: { [addCourse]: { [addDay]: [addTime] } },
        course_limits: { [addCourse]: addHours },
        receipts: [publicUrl.publicUrl],
      },
    }]);
    setAddOpen(false); setAddCourse(null); setAddDay(null); setAddTime(null); setAddFile(null); setAddHours(1);
    alert(t("submitAdd"));
    queryClient.invalidateQueries({ queryKey: ["appchanges", id] });
  }

  function ReceiptsPanel({ urls, title }: { urls: string[]; title: string }) {
    return (
      <Dialog open={!!urls} onClose={() => setViewReceipts(null)} className="fixed z-50 inset-0 flex items-center justify-center bg-black/30">
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
          <button type="button" onClick={() => setViewReceipts(null)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
            <XMarkIcon className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-bold mb-2">{title} {t("receipt")}</h2>
          <div className="space-y-3">
            {urls.map((u) => (
              <div key={u} className="rounded-lg border bg-gray-50 px-3 py-2 flex items-center gap-3">
                <span className="flex-1 truncate">{u.split("/").slice(-1)[0]}</span>
                <button type="button" className="text-blue-600 hover:underline text-sm" onClick={() => window.open(u, "_blank")}>{t("open")}</button>
                <button type="button" className="text-green-600 hover:underline text-sm"
                  onClick={async () => { const res = await fetch(u); const blob = await res.blob();
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                    a.download = u.split("/").slice(-1)[0]; a.click(); }}>
                  {t("download")}
                </button>
                <button type="button" className="text-pink-600 hover:underline text-sm"
                  onClick={() => { const iframe = document.createElement("iframe");
                    iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.top = "0";
                    iframe.style.width = "0"; iframe.style.height = "0"; iframe.src = u;
                    document.body.appendChild(iframe);
                    iframe.onload = () => { iframe.contentWindow?.print();
                      setTimeout(() => document.body.removeChild(iframe), 1000); }; }}>
                  {t("print")}
                </button>
              </div>
            ))}
          </div>
        </Dialog.Panel>
      </Dialog>
    );
  }

  if (loadingStudent || !profile || !courses || !attendance || !appChanges) return (
    <div className="min-h-[300px] flex items-center justify-center">
      <span className="animate-bounce w-5 h-5 rounded-full bg-pink-300 mr-2"></span>
      <span className="animate-bounce w-5 h-5 rounded-full bg-blue-200 mr-2"></span>
      <span className="animate-bounce w-5 h-5 rounded-full bg-yellow-200"></span>
    </div>
  );
  if (!student) return <div className="p-8 text-pink-500">{t("studentNotFound")}</div>;

  return (
    <div className="p-0 min-h-screen" style={{ background: "#f6f6f6" }}>
      <div className="max-w-5xl mx-auto py-8 px-2 sm:px-10 space-y-8">
        <div className="flex justify-end w-full">
  <button
    type="button"
    onClick={async () => {
      if (!window.confirm(t("deleteStudentConfirm"))) return;
      await supabase.from("students").delete().eq("id", student.id);
      nav("/myschool/students");
    }}
    className="rounded-full px-3 py-2 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 flex items-center gap-1"
  >
    <TrashIcon className="w-5 h-5" /> {t("deleteStudent")}
        </button>
        </div>

        <div className="bg-white rounded-2xl px-6 py-4 flex flex-col gap-2 border border-[#ece6fc]">
          <div className="font-bold text-2xl text-[#6654b3] mb-1">
            {student.first_name} {student.last_name}
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-gray-700 text-sm">
            <div><span className="font-semibold text-gray-900">{t("dob")}:</span> {student.dob ? new Date(student.dob).toLocaleDateString("en-GB") : "—"}</div>
            <div><span className="font-semibold text-gray-900">{t("phone")}:</span> {student.parent_phone}</div>
            <div><span className="font-semibold text-gray-900">{t("lineId")}:</span> {student.parent_line_id}</div>
            <div><span className="font-semibold text-gray-900">{t("joined")}:</span> {student.joined_at ? new Date(student.joined_at).toLocaleDateString("en-GB") : "—"}</div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold text-[#6654b3]">{t("enrolledCourses")}</div>
            <button type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-full bg-[#ece6fc] text-[#6654b3] border border-[#6654b3] px-3 py-2 hover:bg-[#e4d8fd] flex items-center gap-1 transition"
            ><PlusIcon className="w-5 h-5" /> {t("addCourse")}</button>
          </div>
          <div className="rounded-3xl overflow-x-auto border border-[#ece6fc] bg-white">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="bg-white">
                  <th className="px-4 py-3 text-left font-semibold text-[#6654b3] rounded-tl-3xl">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#6654b3]">{t("course")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#6654b3]">{t("daysTimes")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#6654b3]">{t("hoursLeft")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#6654b3]">{t("status")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#6654b3]">{t("receipt")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#6654b3]">{t("actions")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#6654b3] rounded-tr-3xl">{t("attendance")}</th>
                </tr>
              </thead>
              <tbody>
                {currentCourses().map(({ cid, idx, course, days, cancelled_at }) => {
                  const pastel = getPastel(idx);
                  const recs = getReceipts(cid);
                  const att = getAttendanceRows(cid);
                  const { purchased, left, status } = getHours(cid);
                  const isCancelled = !!cancelled_at;
                  return (
                    <React.Fragment key={cid}>
                      <tr className={clsx(pastel, "transition", isCancelled ? "bg-red-100/70 text-red-600 opacity-80" : "hover:bg-[#ece6fc]/70")}>
                        <td className="px-4 py-3 text-center">{idx + 1}</td>
                        <td className="px-4 py-3">{course?.name || cid}</td>
                        <td className="px-4 py-3">
                          {Object.entries(days).map(([day, times]) => (
                            <div key={day} className="flex items-center gap-2">
                              {editDay && editDay.cid === cid && editDay.oldDay === day ? (
                                <select
                                  value={editDayValue || day}
                                  onChange={e => setEditDayValue(e.target.value)}
                                  onBlur={() => handleEditDay(cid, day, editDayValue || day)}
                                  className="rounded px-1 py-0.5 border"
                                  autoFocus
                                >
                                  {course?.weekdays?.map((d: string) => <option key={d}>{d}</option>)}
                                </select>
                              ) : (
                                <>
                                  <span className="font-bold">{day}</span>
                                  <button type="button"
                                    className="text-[#6654b3] hover:text-purple-800 p-0.5"
                                    onClick={() => { setEditDay({ cid, oldDay: day }); setEditDayValue(day); }}
                                    title={t("editDay")}
                                  >
                                    <PencilSquareIcon className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {Array.isArray(times) && times.map((t2: string) => (
                                <span key={t2} className="inline-flex items-center ml-2">
                                  {editTime && editTime.cid === cid && editTime.day === day && editTime.oldTime === t2 ? (
                                    <select
                                      value={editTimeValue || t2}
                                      onChange={e => setEditTimeValue(e.target.value)}
                                      onBlur={() => handleEditTime(cid, day, t2, editTimeValue || t2)}
                                      className="rounded px-1 py-0.5 border"
                                      autoFocus
                                    >
                                      {(course?.times?.[day] || []).map((slot: string) => <option key={slot}>{slot}</option>)}
                                    </select>
                                  ) : (
                                    <>
                                      <span>{t2}</span>
                                      <button type="button"
                                        className="text-[#6654b3] hover:text-purple-800 ml-1 p-0.5"
                                        onClick={() => { setEditTime({ cid, day, oldTime: t2 }); setEditTimeValue(t2); }}
                                        title={t("editTime")}
                                      >
                                        <PencilSquareIcon className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </span>
                              ))}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-semibold">{left} / {purchased}</td>
                        <td className="px-4 py-3 text-center">
                          {status === t("ongoing") ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-600 text-xs font-semibold">
                              <CheckCircleIcon className="w-4 h-4" /> {t("ongoing")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-50 text-yellow-600 text-xs font-semibold">
                              <ExclamationCircleIcon className="w-4 h-4" /> {t("renewalNeeded")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {recs.length > 0 ? (
                            <button type="button"
                              className="rounded-full px-2 py-1 bg-[#f6d6ec] text-[#b03580] hover:bg-pink-200 text-xs"
                              onClick={() => setViewReceipts({ urls: recs, title: course?.name })}
                            >{t("viewReceipts", { count: recs.length })}</button>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <button type="button"
                              className={clsx(
                                "rounded-full px-2 py-1 text-xs",
                                "bg-[#ece6fc] text-[#6654b3] hover:bg-purple-100",
                                status !== t("renewalNeeded") && "opacity-50 pointer-events-none"
                              )}
                              onClick={() => setRenewCourse(cid)}
                            >{t("renew")}</button>
                            {!isCancelled && (
                              <button type="button"
                                className="rounded-full px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 text-xs"
                                onClick={() => handleCancelCourse(cid)}
                              >{t("cancelled")}</button>
                            )}
                            {isCancelled && (
                              <span className="block text-xs mt-1 text-red-400">
                                {t("cancelled")}<br />
                                {cancelled_at ? new Date(cancelled_at).toLocaleDateString("en-GB") : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button type="button"
                            className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2 py-1 flex items-center gap-1"
                            onClick={() => setExpandedCourse(expandedCourse === cid ? null : cid)}
                          >
                            {expandedCourse === cid ? (
                              <>
                                <ChevronDownIcon className="w-4 h-4" /> {t("hide")}
                              </>
                            ) : (
                              <>
                                <ChevronRightIcon className="w-4 h-4" /> {t("view")}
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedCourse === cid && (
                        <tr>
                          <td colSpan={8} className="bg-white/90">
                            <div className="px-4 py-2 text-sm">
                              <div className="font-bold text-gray-700 mb-1">{t("attendanceHistory")}</div>
                              <div className="flex flex-col gap-1">
                                {att.map((att: any) => (
                                  <div
                                    key={att.id}
                                    className="flex items-center justify-between border-b last:border-0 border-dashed border-gray-200 py-1 px-2"
                                  >
                                    <span>
                                      {new Date(att.attended_at_ts).toLocaleString("en-GB", {
                                        weekday: "short", year: "numeric", month: "short",
                                        day: "numeric", hour: "2-digit", minute: "2-digit"
                                      })}
                                    </span>
                                    <button type="button"
                                      className="rounded-full px-2 py-0.5 bg-gray-100 text-gray-600 text-xs hover:bg-blue-50"
                                      onClick={() => navigator.clipboard.writeText(att.attended_at_ts)}
                                    >{t("copy")}</button>
                                  </div>
                                ))}
                                {att.length === 0 && <div className="text-gray-400">{t("noRecords")}</div>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* ADD COURSE MODAL */}
        <Dialog open={addOpen} onClose={() => setAddOpen(false)} className="fixed z-50 inset-0 flex items-center justify-center bg-black/30">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <button type="button"
              onClick={() => setAddOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
            ><XMarkIcon className="w-6 h-6" /></button>
            <h2 className="font-bold text-lg mb-3">{t("addNewCourse")}</h2>
            <div className="space-y-2">
              <label className="block">
                <span className="font-semibold">{t("course")}</span>
                <select
                  className="w-full rounded border px-2 py-1"
                  value={addCourse || ""}
                  onChange={e => { setAddCourse(e.target.value); setAddDay(null); setAddTime(null); }}
                >
                  <option value="">{t("select")}</option>
                  {courses.filter((c: any) => !(student.courses || {})[c.id]).map((c: any) => (
                    <option value={c.id} key={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              {addCourse && (
                <label className="block">
                  <span className="font-semibold">{t("day")}</span>
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={addDay || ""}
                    onChange={e => { setAddDay(e.target.value); setAddTime(null); }}
                  >
                    <option value="">{t("select")}</option>
                    {(courseMap[addCourse]?.weekdays || []).map((d: string) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {addDay && addCourse && (
                <label className="block">
                  <span className="font-semibold">{t("timeSlot")}</span>
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={addTime || ""}
                    onChange={e => setAddTime(e.target.value)}
                  >
                    <option value="">{t("select")}</option>
                    {(courseMap[addCourse]?.times?.[addDay] || []).map((t: string) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="font-semibold">{t("hoursToPurchase")}</span>
                <input
                  type="number"
                  className="w-full rounded border px-2 py-1"
                  min={1}
                  value={addHours}
                  onChange={e => setAddHours(Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="font-semibold">{t("uploadReceipt")}</span>
                <input
                  type="file"
                  className="block"
                  accept="image/*,application/pdf"
                  onChange={e => setAddFile(e.target.files ? e.target.files[0] : null)}
                />
                {addFile && (
                  <span className="text-xs text-gray-500">{addFile.name}</span>
                )}
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-full px-4 py-2 border hover:bg-gray-100"
              >{t("cancel")}</button>
              <button type="button"
                onClick={handleAddCourse}
                className="rounded-full px-4 py-2 bg-green-500 text-white hover:bg-green-600 flex items-center gap-1"
              ><ArrowPathIcon className="w-5 h-5" /> {t("submit")}</button>
            </div>
          </Dialog.Panel>
        </Dialog>
        {/* RENEW MODAL */}
        <Dialog open={!!renewCourse} onClose={() => setRenewCourse(null)} className="fixed z-50 inset-0 flex items-center justify-center bg-black/30">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <button type="button"
              onClick={() => setRenewCourse(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
            ><XMarkIcon className="w-6 h-6" /></button>
            <h2 className="font-bold text-lg mb-3">
              {t("submitRenew", { course: courseMap[renewCourse || ""]?.name || "" })}
            </h2>
            <label className="block mb-3">
              <span className="font-semibold">{t("hoursToPurchase")}</span>
              <input
                type="number"
                className="w-full rounded border px-2 py-1"
                min={1}
                value={renewHours}
                onChange={e => setRenewHours(Number(e.target.value))}
              />
            </label>
            <label className="block mb-3">
              <span className="font-semibold">{t("uploadReceipt")}</span>
              <input
                type="file"
                className="block"
                accept="image/*,application/pdf"
                onChange={e => setRenewFile(e.target.files ? e.target.files[0] : null)}
              />
              {renewFile && (
                <span className="text-xs text-gray-500">{renewFile.name}</span>
              )}
            </label>
            <div className="flex justify-end gap-3 mt-2">
              <button type="button"
                onClick={() => setRenewCourse(null)}
                className="rounded-full px-4 py-2 border hover:bg-gray-100"
              >{t("cancel")}</button>
              <button type="button"
                onClick={handleRenewSubmit}
                className="rounded-full px-4 py-2 bg-[#6654b3] text-white hover:bg-purple-700 flex items-center gap-1"
              ><ArrowPathIcon className="w-5 h-5" /> {t("submit")}</button>
            </div>
          </Dialog.Panel>
        </Dialog>
        {/* RECEIPTS PANEL */}
        {viewReceipts && <ReceiptsPanel urls={viewReceipts.urls} title={viewReceipts.title} />}
      </div>
    </div>
  );
}
