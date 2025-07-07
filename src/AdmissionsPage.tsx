import React, { useState, useRef } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

// ---- Types ----
export interface CourseRow {
  id: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
  capacity: number;
}

interface FloatingMessageProps {
  msg: string;
  onClear: () => void;
}

// ---- React Query: fetch courses ----
function useCoursesQuery() {
  return useQuery<CourseRow[]>({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id,name,weekdays,times,capacity")
        .order("name");
      return (data ?? []) as CourseRow[];
    },
    staleTime: 300000,
  });
}

// ---- React Query: fetch/generate public admissions link ----
function usePublicLinkQuery(enabled: boolean) {
  return useQuery<string>({
    queryKey: ["public-admissions-link"],
    queryFn: async () => {
      const { data: links } = await supabase
        .from("application_links")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      let link =
        links && links[0] && new Date(links[0].expires_at) > new Date()
          ? links[0]
          : null;
      if (!link) {
        await supabase
          .from("application_links")
          .update({ expires_at: new Date(Date.now() - 60 * 1000) })
          .neq("expires_at", null);
        const { data: newLink } = await supabase
          .from("application_links")
          .insert([{ expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000) }])
          .select("*")
          .single();
        link = newLink;
      }
      return `${window.location.origin}/apply/${link.id}`;
    },
    enabled,
    refetchOnWindowFocus: false,
  });
}

// ---- Floating notification ----
function FloatingMessage({ msg, onClear }: FloatingMessageProps) {
  React.useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClear, 3500);
    return () => clearTimeout(t);
  }, [msg, onClear]);
  if (!msg) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50 bg-[#6654b3] text-white rounded-2xl px-8 py-3 shadow-xl text-lg font-semibold fade-in">
      {msg}
    </div>
  );
}

// ---- Main Component ----
export default function AdmissionsPage({ publicMode = false }: { publicMode?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? null;
  // Student fields
  const [nick, setNick] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState("");
  const [mail, setMail] = useState("");
  const [phone, setPhone] = useState("");
  // Courses state
  const [slots, setSlots] = useState<Record<string, Record<string, string[]>>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  // Files state
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Misc state
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [floatMsg, setFloatMsg] = useState("");
  const [error, setError] = useState("");
  // Link
  const [showLink, setShowLink] = useState(false);

  const {
    data: publicLink,
    refetch: refetchPublicLink,
  } = usePublicLinkQuery(showLink && (role === "admin" || role === "staff"));

  const { data: courses = [], isLoading: loadingC } = useCoursesQuery();

  function toggleCourse(cid: string) {
    setSlots((s) => {
      const next = { ...s };
      if (next[cid]) {
        delete next[cid];
        setLimits((l) => {
          const { [cid]: _, ...rest } = l;
          return rest;
        });
      } else {
        next[cid] = {};
      }
      return next;
    });
  }
  function toggleDay(cid: string, day: string) {
    setSlots((s) => {
      const next = { ...s };
      const days = { ...(next[cid] || {}) };
      if (days[day]) delete days[day];
      else days[day] = [];
      if (Object.keys(days).length) next[cid] = days;
      else delete next[cid];
      return next;
    });
  }
  function addTime(cid: string, day: string, t: string) {
    setSlots((s) => {
      const next = { ...s };
      next[cid] = next[cid] || {};
      next[cid][day] = next[cid][day] || [];
      if (!next[cid][day].includes(t)) next[cid][day].push(t);
      return next;
    });
  }
  function removeTime(cid: string, day: string, i: number) {
    setSlots((s) => {
      const next = { ...s };
      next[cid][day].splice(i, 1);
      if (!next[cid][day].length) delete next[cid][day];
      if (!Object.keys(next[cid]).length) delete next[cid];
      return next;
    });
  }
  const addFiles = (f: File[]) => setFiles((p) => [...p, ...f]);
  const rmFile = (i: number) => setFiles((p) => p.filter((_, idx) => idx !== i));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!Object.keys(slots).length) return setError(t("selectCourseError"));
    if (!nick.trim()) return setError(t("enterNickError"));
    setSaving(true);
    const urls: string[] = [];
    for (const f of files) {
      const fn = `${Date.now()}-${Math.random().toString(36).slice(2)}.${f.name.split(".").pop()}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, f, { cacheControl: "3600" });
      if (ue) { setError(ue.message); setSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      urls.push(pu.publicUrl);
    }
    if (role === "admin") {
      const { error: insErr } = await supabase.from("students").insert([{
        nick_name: nick,
        first_name: first,
        last_name: last,
        dob,
        parent_line_id: mail,
        parent_phone: phone,
        courses: slots,
        course_limits: limits,
        payment_receipt_urls: urls,
        joined_at: new Date().toISOString(),
      }]);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setFloatMsg(t("studentAdded", { nick }));
      setSubmitted(true);
    } else {
      const { error: insErr } = await supabase.from("applications").insert([{
        nick_name: nick,
        first_name: first,
        last_name: last,
        dob,
        parent_line_id: mail,
        parent_phone: phone,
        courses: slots,
        course_limits: limits,
        payment_receipt_urls: urls,
        status: "pending",
      }]);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setFloatMsg(t("applicationSubmitted"));
      setSubmitted(true);
    }
    setSaving(false);
  }

  React.useEffect(() => {
    if (!publicMode && submitted) {
      const timer = setTimeout(() => setSubmitted(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [publicMode, submitted]);

  if (publicMode && submitted) {
    // Public link thank you
    return (
      <div className="min-h-[60vh] flex flex-col justify-center items-center bg-[#f6f6f6]">
        <div className="bg-gradient-to-br from-blue-50 via-green-50 to-yellow-50 shadow-xl rounded-3xl px-8 py-12 max-w-md w-full flex flex-col items-center">
          <div className="text-3xl font-extrabold mb-3 text-[#6654b3]">{t("thankYou")}</div>
          <div className="text-lg text-gray-700 mb-4 text-center">
            {t("applicationReceived")}<br />
            {t("staffWillContact")}<br />
            {t("youMayClose")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-10 px-2 sm:px-6 max-w-3xl mx-auto" style={{ background: "#f6f6f6" }}>
      <header className="mb-4">
        <h1 className="text-3xl font-extrabold text-[#6654b3]">{t("admissionsTitle")}</h1>
        <p className="text-lg text-[#6654b3] mt-2">
          {t("admissionsIntro", { staffMsg: t(role === "admin" ? "enrollInstant" : "contactToConfirm") })}
        </p>
      </header>
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Student Info */}
        <div className="bg-white border border-[#ece6fc] p-6 rounded-2xl shadow transition-all">
          <h2 className="text-xl font-bold text-[#6654b3] mb-2">{t("studentInfo")}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#6654b3]">{t("nickName")}</span>
              <input required className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                     value={nick}
                     onChange={e => setNick(e.target.value)}
                     maxLength={40}
                     pattern=".*" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#6654b3]">{t("firstName")}</span>
              <input required className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                     value={first}
                     onChange={e => setFirst(e.target.value)}
                     maxLength={40}
                     pattern=".*" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#6654b3]">{t("lastName")}</span>
              <input required className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                     value={last}
                     onChange={e => setLast(e.target.value)}
                     maxLength={40}
                     pattern=".*" />
            </label>
          </div>
          <label className="flex flex-col gap-1 mt-4 w-full md:w-1/2">
            <span className="font-semibold text-[#6654b3]">{t("dob")}</span>
            <input required type="date" className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                   value={dob} onChange={e => setDob(e.target.value)} />
          </label>
        </div>
        {/* Guardian */}
        <div className="bg-white border border-[#ece6fc] p-6 rounded-2xl shadow transition-all">
          <h2 className="text-xl font-bold text-[#6654b3] mb-2">{t("guardian")}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#6654b3]">{t("lineAppId")}</span>
              <input required className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                     value={mail} onChange={e => setMail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#6654b3]">{t("phone")}</span>
              <input required className="border border-[#ece6fc] bg-purple-50 rounded-xl px-4 py-2"
                     value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
          </div>
        </div>
        {/* Courses */}
        <div className="bg-white border border-[#ece6fc] p-6 rounded-2xl shadow transition-all">
          <h2 className="text-xl font-bold text-[#6654b3] mb-2">{t("courses")}</h2>
          {loadingC ? <div className="text-gray-400">{t("loadingCourses")}</div> : (courses.length === 0 ?
            <div className="text-gray-400">{t("noCourses")}</div>
            : courses.map(c => (
              <div key={c.id} className={`mb-2 border ${slots[c.id] ? "border-[#6654b3] bg-purple-50" : "border-gray-200 bg-white"} rounded-xl p-3 transition-all`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!slots[c.id]} onChange={() => toggleCourse(c.id)} />
                  <span className="text-lg">{c.name}</span>
                  <span className="text-xs text-gray-400">{t("seats", { count: c.capacity })}</span>
                </label>
                {slots[c.id] && (
                  <div className="ml-8 mt-2 mb-2">
                    {c.weekdays.map((d) => (
                      <div key={d} className="mb-1">
                        <label className="font-semibold mr-2">
                          <input
                            type="checkbox"
                            className="mr-1"
                            checked={!!slots[c.id]?.[d]}
                            onChange={() => toggleDay(c.id, d)}
                          />
                          {d}
                        </label>
                        {!!slots[c.id]?.[d] && (
                          <>
                            {slots[c.id][d].map((t, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center bg-[#ece6fc] rounded-full px-3 py-0.5 text-xs mr-2 mt-1"
                              >
                                {t}
                                <button type="button" className="ml-1 text-red-500 font-bold" onClick={() => removeTime(c.id, d, i)}>✕</button>
                              </span>
                            ))}
                            <select
                              className="border rounded px-2 py-1 text-sm ml-2"
                              defaultValue=""
                              onChange={e => {
                                if (e.target.value) {
                                  addTime(c.id, d, e.target.value);
                                  e.target.value = "";
                                }
                              }}
                            >
                              <option value="">{t("addTime")}</option>
                              {(c.times[d] || []).filter(ti => !slots[c.id][d]?.includes(ti)).map((ti) => (
                                <option key={ti}>{ti}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="mt-2">
                      <label className="flex items-center gap-2">
                        <span className="font-semibold text-[#6654b3]">{t("hoursPurchased")}</span>
                        <input
                          type="number"
                          min={1}
                          className="w-20 border rounded px-2 py-1 bg-purple-50"
                          value={limits[c.id] ?? ""}
                          onChange={e => setLimits((l) => ({ ...l, [c.id]: Number(e.target.value) }))}
                          required={!!slots[c.id]}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {/* Payment */}
        <div className="bg-white border border-[#ece6fc] p-6 rounded-2xl shadow transition-all">
          <h2 className="text-xl font-bold text-[#6654b3] mb-2">{t("paymentReceipt")}</h2>
          <div className="flex flex-col gap-2">
            <button type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-[#ece6fc] bg-purple-50 text-[#6654b3] px-5 py-2 font-semibold hover:bg-purple-100 transition"
            >
              {t("chooseFiles")}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center bg-[#ece6fc] rounded-full px-3 py-1 text-sm">
                    <span className="truncate max-w-[180px]">{f.name}</span>
                    <button type="button" className="ml-2 text-red-500 font-bold" onClick={() => rmFile(i)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {/* Error + Floating Msg */}
        <FloatingMessage msg={floatMsg || error} onClear={() => { setFloatMsg(""); setError(""); }} />
        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#6654b3] hover:bg-purple-700 text-white font-bold px-8 py-3 rounded-xl shadow disabled:opacity-50 transition"
          >
            {role === "admin" ? (saving ? t("adding") : t("addStudent"))
              : (saving ? t("submitting") : t("submitApplication"))}
          </button>
        </div>
        {/* Public link for admin/staff only */}
        {(!publicMode && (role === "admin" || role === "staff")) && (
          <div className="mt-12 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowLink(true); refetchPublicLink(); }}
              className="px-5 py-2 rounded-full font-semibold border bg-[#f6f6f6] text-[#6654b3] border-[#ece6fc] hover:bg-[#ece6fc] transition"
            >
              {publicLink ? t("refreshPublicAdmissionsLink") : t("showPublicAdmissionsLink")}
            </button>
            {showLink && publicLink &&
              <div className="flex items-center gap-2 mt-2 bg-[#ece6fc] px-4 py-2 rounded-xl w-full max-w-lg">
                <input readOnly className="flex-1 bg-transparent outline-none" value={publicLink} />
                <button onClick={() => navigator.clipboard.writeText(publicLink)}
                  className="text-[#6654b3] hover:underline font-bold px-2">{t("copy")}</button>
              </div>
            }
          </div>
        )}
      </form>
    </div>
  );
}
