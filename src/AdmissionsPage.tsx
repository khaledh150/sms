import React, { useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { POS } from "./theme";
import { useToast } from "./hooks/useToast";
import { validateReceiptFile } from "./hooks/useFileValidation";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from "@heroicons/react/24/solid";

import type { HourPackage } from "./types";
interface CourseRow { id: string; name: string; weekdays: string[]; times: Record<string, string[]>; capacity: number; hour_packages: HourPackage[]; book_price: number }

interface CourseSelection {
  days: Record<string, string[]>;
  packageIdx: number;
  includeBook: boolean;
}

function useCoursesQuery() {
  return useQuery<CourseRow[]>({
    queryKey: ["courses", "admissions"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id,name,weekdays,times,capacity,hour_packages,book_price").order("name");
      return (data ?? []) as CourseRow[];
    },
    staleTime: 300_000,
  });
}

export default function AdmissionsPage(_props: { publicMode?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const isExistingMode = searchParams.get("mode") === "existing";
  const role = user?.role ?? null;
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const [nick, setNick] = useState(""); const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [dob, setDob] = useState(""); const [phone, setPhone] = useState("");
  // courseId -> { days, packageIdx }
  const [selections, setSelections] = useState<Record<string, CourseSelection>>({});
  const [hoursRemaining, setHoursRemaining] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const { data: courses = [] } = useCoursesQuery();

  function toggleCourse(courseId: string) {
    setSelections(prev => {
      if (prev[courseId]) {
        const next = { ...prev };
        delete next[courseId];
        return next;
      }
      const c = courses.find(x => x.id === courseId);
      const hasTimes = c && Object.values(c.times || {}).some((arr: any) => arr.length > 0);
      const autoDays: Record<string, string[]> = {};
      if (!hasTimes && c?.weekdays) {
        c.weekdays.forEach(d => { autoDays[d] = []; });
      }
      return { ...prev, [courseId]: { days: autoDays, packageIdx: 0, includeBook: false } };
    });
  }

  function toggleDay(courseId: string, day: string, time: string) {
    setSelections(prev => {
      const sel = prev[courseId];
      if (!sel) return prev;
      const days = { ...sel.days };
      if (!days[day]) days[day] = [];
      if (days[day].includes(time)) {
        days[day] = days[day].filter(t => t !== time);
        if (!days[day].length) delete days[day];
      } else {
        days[day] = [...days[day], time];
      }
      return { ...prev, [courseId]: { ...sel, days } };
    });
  }

  function setPackage(courseId: string, pkgIdx: number) {
    setSelections(prev => {
      const sel = prev[courseId];
      if (!sel) return prev;
      return { ...prev, [courseId]: { ...sel, packageIdx: pkgIdx } };
    });
  }

  const selectedCourseIds = Object.keys(selections);

  function validateStep(): boolean {
    setError("");
    if (step === 1) {
      if (!nick.trim()) { setError(t("nicknameRequired")); return false; }
      if (!first.trim()) { setError(t("firstNameRequired")); return false; }
      if (!phone.trim()) { setError(t("phoneRequired")); return false; }
    }
    if (step === 2) {
      if (selectedCourseIds.length === 0) { setError(t("pleaseSelectCourseAdm")); return false; }
      for (const cid of selectedCourseIds) {
        const sel = selections[cid];
        const c = courses.find(x => x.id === cid);
        const hasTimes = c && Object.values(c.times || {}).some((arr: any) => arr.length > 0);
        if (hasTimes && Object.keys(sel.days).length === 0) {
          setError(t("pleaseSelectDayTime") + (c ? ` (${c.name})` : ""));
          return false;
        }
        if (isExistingMode && (hoursRemaining[cid] === undefined || hoursRemaining[cid] < 0)) {
          setError(t("hoursRemainingRequired") + (c ? ` (${c.name})` : ""));
          return false;
        }
      }
    }
    return true;
  }

  function nextStep() { if (validateStep()) setStep(s => Math.min(s + 1, totalSteps)); }
  function prevStep() { setStep(s => Math.max(s - 1, 1)); setError(""); }

  async function handleSubmit() {
    if (!validateStep()) return;
    setSaving(true); setError("");
    const urls: string[] = [];
    for (const f of files) {
      const validationErr = validateReceiptFile(f);
      if (validationErr) { toast(validationErr, "error"); setSaving(false); return; }
      const fn = `${Date.now()}-${Math.random().toString(36).slice(2)}.${f.name.split(".").pop()}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, f, { cacheControl: "3600" });
      if (ue) { toast(ue.message, "error"); setSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      urls.push(pu.publicUrl);
    }

    const slots: Record<string, Record<string, string[]>> = {};
    const limits: Record<string, number> = {};
    for (const cid of selectedCourseIds) {
      const sel = selections[cid];
      const c = courses.find(x => x.id === cid);
      const pkg = c?.hour_packages?.[sel.packageIdx];
      slots[cid] = sel.days;
      limits[cid] = pkg?.hours ?? 10;
    }

    if (role === "owner" || role === "admin" || role === "superadmin") {
      const { data: newStudent, error: insErr } = await supabase.from("students").insert([{
        nick_name: nick, first_name: first, last_name: last, dob: dob || null,
        parent_phone: phone,
        courses: slots, course_limits: limits,
        payment_receipt_urls: urls, joined_at: new Date().toISOString(), status: "active",
      }]).select().single();
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      if (newStudent) {
        const enrollRows = selectedCourseIds.map(cid => {
          const sel = selections[cid];
          const c = courses.find(x => x.id === cid);
          const pkg = c?.hour_packages?.[sel.packageIdx];
          const purchasedHrs = pkg?.hours ?? 10;
          const remaining = hoursRemaining[cid];
          const initialUsed = isExistingMode && remaining !== undefined && remaining >= 0
            ? Math.max(0, purchasedHrs - remaining)
            : 0;
          return {
            student_id: newStudent.id, course_id: cid,
            schedule: sel.days, purchased_hours: purchasedHrs, initial_used_hours: initialUsed, status: "active",
          };
        });
        if (enrollRows.length) await supabase.from("enrollments").insert(enrollRows);
        await supabase.from("notifications").insert([{
          type: "new_application",
          student_id: newStudent.id,
          payload: { name: nick, first_name: first, student_name: nick },
          read: false,
        }]);
      }
      setSubmitted(true);
    } else {
      const { error: insErr } = await supabase.from("applications").insert([{
        nick_name: nick, first_name: first, last_name: last, dob: dob || null,
        parent_phone: phone,
        courses: slots, course_limits: limits, payment_receipt_urls: urls, status: "pending",
      }]);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setSubmitted(true);
    }
    setSaving(false);
  }

  function totalPrice() {
    let total = 0;
    for (const cid of selectedCourseIds) {
      const sel = selections[cid];
      const c = courses.find(x => x.id === cid);
      const pkg = c?.hour_packages?.[sel.packageIdx];
      total += pkg?.price ?? 0;
      if (sel.includeBook && c?.book_price) total += c.book_price;
    }
    return total;
  }

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex flex-col justify-center items-center p-6" style={{ background: POS.bgMain }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl px-8 py-12 max-w-md w-full text-center" style={{ boxShadow: POS.shadowXl }}>
          <CheckCircleIcon className="w-16 h-16 mx-auto mb-4" style={{ color: POS.success }} />
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: POS.primary }}>
            {(role === "owner" || role === "admin" || role === "superadmin") ? (isExistingMode ? t("existingStudentAdded", { nick }) : t("studentAdded", { nick })) : t("applicationSubmitted")}
          </h2>
          <p className="text-sm" style={{ color: POS.textSecondary }}>
            {(role === "owner" || role === "admin" || role === "superadmin") ? t("studentEnrolled") : t("staffWillContact")}
          </p>
          <button onClick={() => { setSubmitted(false); setStep(1); setNick(""); setFirst(""); setLast(""); setDob(""); setPhone(""); setSelections({}); setFiles([]); setHoursRemaining({}); }}
            className="mt-6 px-6 py-3 rounded-xl text-white font-bold" style={{ background: POS.primary }}>
            {t("addAnother")}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
          <React.Fragment key={s}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
              style={{
                background: step >= s ? POS.primary : POS.bgSurface,
                color: step >= s ? "#fff" : POS.textMuted,
              }}>
              {step > s ? "✓" : s}
            </div>
            {s < totalSteps && <div className="flex-1 h-1 rounded-full" style={{ background: step > s ? POS.primary : POS.border }} />}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1: Student + Guardian Info */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl p-5 border space-y-4" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>
              {isExistingMode ? t("existingStudentInfo") : t("studentInfo")}
            </h2>
            {isExistingMode && (
              <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#B45309" }}>
                {t("existingStudentHint")}
              </p>
            )}
            {[
              { label: t("nickName") + " *", value: nick, set: setNick, placeholder: t("nicknamePlaceholder") },
              { label: t("firstName") + " *", value: first, set: setFirst, placeholder: t("firstNamePlaceholder") },
              { label: t("lastName"), value: last, set: setLast, placeholder: t("lastNamePlaceholder") },
            ].map((f, i) => (
              <div key={i}>
                <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{f.label}</label>
                <input className="w-full border rounded-xl px-4 py-3 mt-1 text-base" style={{ borderColor: POS.border, minHeight: POS.touchComfortable }}
                  value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("dob")}</label>
              <input type="date" className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }} value={dob} onChange={e => setDob(e.target.value)} />
            </div>
            <h3 className="text-base font-bold pt-2" style={{ color: POS.primary }}>{t("guardian")}</h3>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("phone")} *</label>
              <input type="tel" inputMode="numeric" className="w-full border rounded-xl px-4 py-3 mt-1 text-base" style={{ borderColor: POS.border, minHeight: POS.touchComfortable }}
                value={phone} onChange={e => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" />
            </div>
          </motion.div>
        )}

        {/* STEP 2: Courses — select, pick days/times, pick package */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="space-y-4">
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("selectSchedule")}</h2>

            {courses.map(course => {
              const isSelected = !!selections[course.id];
              const sel = selections[course.id];
              const packages: HourPackage[] = course.hour_packages || [];
              const hasTimes = course.weekdays.length > 0 && Object.keys(course.times || {}).length > 0;

              return (
                <div key={course.id} className="bg-white rounded-2xl border overflow-hidden transition-all"
                  style={{ borderColor: isSelected ? POS.primary : POS.borderLight, boxShadow: isSelected ? POS.shadowMd : POS.shadowSm }}>

                  {/* Course header — tap to select/deselect */}
                  <button onClick={() => toggleCourse(course.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                    style={{ background: isSelected ? POS.primary : "transparent", minHeight: "auto" }}>
                    <span className="font-bold text-base" style={{ color: isSelected ? "#fff" : POS.textPrimary }}>
                      {course.name}
                    </span>
                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: isSelected ? "#fff" : POS.border, background: isSelected ? "#fff" : "transparent" }}>
                      {isSelected && <CheckCircleIcon className="w-5 h-5" style={{ color: POS.primary }} />}
                    </div>
                  </button>

                  {/* Expanded: days/times + package */}
                  {isSelected && (
                    <div className="px-5 pb-5 space-y-4">
                      {/* Days + Times */}
                      {hasTimes && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs font-bold" style={{ color: POS.textSecondary }}>{t("tapSlotsYouWant")}</p>
                          {course.weekdays.map(day => {
                            const times = (course.times[day] || []).filter(t => t.trim() !== "");
                            if (times.length === 0) return null;
                            return (
                              <div key={day}>
                                <p className="text-xs font-bold mb-1" style={{ color: POS.textPrimary }}>{day}</p>
                                <div className="flex flex-wrap gap-2">
                                  {times.map(time => {
                                    const active = sel.days[day]?.includes(time);
                                    return (
                                      <button key={time} type="button" onClick={() => toggleDay(course.id, day, time)}
                                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                                        style={{
                                          background: active ? POS.success : POS.bgSurface,
                                          color: active ? "#fff" : POS.textPrimary,
                                          border: `2px solid ${active ? POS.success : POS.border}`,
                                        }}>
                                        {time}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Packages */}
                      {packages.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold" style={{ color: POS.textSecondary }}>{t("selectPackage")}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {packages.map((pkg, idx) => {
                              const active = sel.packageIdx === idx;
                              return (
                                <button key={idx} type="button" onClick={() => setPackage(course.id, idx)}
                                  className="py-3 rounded-xl text-center transition-all"
                                  style={{
                                    background: active ? POS.primary : POS.bgSurface,
                                    color: active ? "#fff" : POS.textPrimary,
                                    border: `2px solid ${active ? POS.primary : POS.border}`,
                                  }}>
                                  <div className="font-extrabold text-lg">{pkg.hours} {t("hrs")}</div>
                                  <div className="text-sm font-bold" style={{ color: active ? "rgba(255,255,255,0.85)" : POS.success }}>
                                    ฿{pkg.price.toLocaleString()}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Hours Remaining — existing student mode only */}
                      {isExistingMode && packages.length > 0 && (
                        <div className="rounded-xl p-3" style={{ background: "#FFFBEB", border: `2px solid #F59E0B` }}>
                          <label className="text-xs font-bold block mb-2" style={{ color: "#B45309" }}>
                            {t("hoursRemainingLabel")} *
                          </label>
                          <p className="text-[11px] mb-2" style={{ color: "#92400E" }}>
                            {t("hoursRemainingHint")}
                          </p>
                          <input type="number" min={0} max={packages[sel.packageIdx]?.hours || 999}
                            className="w-full border rounded-xl px-4 py-3 text-lg font-bold text-center"
                            style={{ borderColor: "#F59E0B" }}
                            inputMode="numeric"
                            placeholder="0"
                            value={hoursRemaining[course.id] ?? ""}
                            onChange={e => setHoursRemaining(prev => ({ ...prev, [course.id]: Number(e.target.value) }))} />
                        </div>
                      )}

                      {/* Book price checkbox */}
                      {(course.book_price ?? 0) > 0 && (
                        <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                          style={{ background: sel.includeBook ? POS.warningLight : POS.bgSurface, border: `2px solid ${sel.includeBook ? POS.warning : POS.border}` }}>
                          <input type="checkbox" checked={sel.includeBook}
                            onChange={() => setSelections(prev => ({
                              ...prev, [course.id]: { ...prev[course.id], includeBook: !prev[course.id].includeBook }
                            }))}
                            className="w-5 h-5 rounded accent-amber-500" />
                          <div className="flex-1">
                            <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("includeBook")}</span>
                          </div>
                          <span className="text-sm font-extrabold" style={{ color: "#B45309" }}>฿{course.book_price.toLocaleString()}</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}

        {/* STEP 3: Review + Receipt + Submit */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl p-5 border space-y-4" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("reviewSubmit")}</h2>

            {/* Student summary */}
            <div className="rounded-xl p-4 space-y-1" style={{ background: POS.bgMain }}>
              <div className="flex justify-between text-sm"><span style={{ color: POS.textSecondary }}>{t("nickName")}:</span><span className="font-bold">{nick} ({first} {last})</span></div>
              <div className="flex justify-between text-sm"><span style={{ color: POS.textSecondary }}>{t("phone")}:</span><span className="font-bold">{phone}</span></div>
            </div>

            {/* Course summaries */}
            {selectedCourseIds.map(cid => {
              const c = courses.find(x => x.id === cid)!;
              const sel = selections[cid];
              const pkg = c.hour_packages?.[sel.packageIdx];
              return (
                <div key={cid} className="rounded-xl p-4 border" style={{ borderColor: POS.borderLight }}>
                  <div className="font-bold" style={{ color: POS.primary }}>{c.name}</div>
                  <div className="text-xs mt-1" style={{ color: POS.textMuted }}>
                    {Object.entries(sel.days).map(([d, times]) => times.length > 0 ? `${d}: ${times.join(", ")}` : d).join(" | ") || t("noSchedule")}
                  </div>
                  {pkg && (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm font-bold" style={{ color: POS.primary }}>{pkg.hours} {t("hrs")}</span>
                      <span className="text-sm font-bold" style={{ color: POS.success }}>฿{pkg.price.toLocaleString()}</span>
                    </div>
                  )}
                  {isExistingMode && hoursRemaining[cid] !== undefined && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold" style={{ color: "#B45309" }}>
                        {t("hoursRemainingLabel")}: {hoursRemaining[cid]} / {pkg?.hours ?? 0}
                      </span>
                    </div>
                  )}
                  {sel.includeBook && c.book_price > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold" style={{ color: "#B45309" }}>+ {t("book")}: ฿{c.book_price.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total */}
            {totalPrice() > 0 && (
              <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: POS.successLight }}>
                <span className="font-bold" style={{ color: POS.textPrimary }}>{t("total")}</span>
                <span className="text-xl font-extrabold" style={{ color: POS.success }}>฿{totalPrice().toLocaleString()}</span>
              </div>
            )}

            {/* Receipt upload */}
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>
                {t("paymentReceiptOptional")}
              </label>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full mt-1 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-semibold text-center transition"
                style={{ borderColor: POS.border, color: POS.primary }}>
                {files.length ? t("filesSelected", { count: files.length }) : t("tapToAttachReceipt")}
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={e => e.target.files && setFiles(Array.from(e.target.files))} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mt-3 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: POS.dangerLight, color: POS.danger }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-5">
        {step > 1 && (
          <button onClick={prevStep} className="flex-1 py-4 rounded-xl border font-bold flex items-center justify-center gap-2"
            style={{ borderColor: POS.border, color: POS.textSecondary, minHeight: POS.touchLarge }}>
            <ArrowLeftIcon className="w-5 h-5" /> {t("backBtn")}
          </button>
        )}
        {step < totalSteps ? (
          <button onClick={nextStep} className="flex-1 py-4 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ background: POS.primaryGradient, minHeight: POS.touchLarge }}>
            {t("nextBtn")} <ArrowRightIcon className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-4 rounded-xl text-white font-bold text-lg disabled:opacity-50"
            style={{ background: POS.success, minHeight: POS.touchLarge }}>
            {saving ? t("submittingBtn") : (role === "owner" || role === "admin" || role === "superadmin") ? t("addStudent") : t("submitApplication")}
          </button>
        )}
      </div>
    </div>
  );
}
