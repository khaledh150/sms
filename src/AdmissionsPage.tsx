import React, { useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { POS } from "./theme";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from "@heroicons/react/24/solid";

interface CourseRow { id: string; name: string; weekdays: string[]; times: Record<string, string[]>; capacity: number }

function useCoursesQuery() {
  return useQuery<CourseRow[]>({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id,name,weekdays,times,capacity").order("name");
      return (data ?? []) as CourseRow[];
    },
    staleTime: 300_000,
  });
}

export default function AdmissionsPage({ publicMode = false }: { publicMode?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? null;
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Fields
  const [nick, setNick] = useState(""); const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [dob, setDob] = useState(""); const [lineId, setLineId] = useState(""); const [phone, setPhone] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Record<string, string[]>>({});
  const [hours, setHours] = useState(10);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const { data: courses = [] } = useCoursesQuery();
  const course = courses.find(c => c.id === selectedCourse);

  function toggleDay(day: string, time: string) {
    setSelectedDays(prev => {
      const next = { ...prev };
      if (!next[day]) next[day] = [];
      if (next[day].includes(time)) {
        next[day] = next[day].filter(t => t !== time);
        if (!next[day].length) delete next[day];
      } else {
        next[day] = [...next[day], time];
      }
      return next;
    });
  }

  function validateStep(): boolean {
    setError("");
    if (step === 1) {
      if (!nick.trim()) { setError(t("nicknameRequired")); return false; }
      if (!first.trim()) { setError(t("firstNameRequired")); return false; }
      if (!phone.trim()) { setError(t("phoneRequired")); return false; }
    }
    if (step === 2) {
      if (!selectedCourse) { setError(t("pleaseSelectCourseAdm")); return false; }
      if (Object.keys(selectedDays).length === 0) { setError(t("pleaseSelectDayTime")); return false; }
    }
    if (step === 3) {
      if (hours < 1) { setError(t("hoursMustBeOneAdm")); return false; }
    }
    return true;
  }

  function nextStep() { if (validateStep()) setStep(s => Math.min(s + 1, totalSteps)); }
  function prevStep() { setStep(s => Math.max(s - 1, 1)); setError(""); }

  async function handleSubmit() {
    if (!validateStep()) return;
    setSaving(true); setError("");
    // Upload receipts
    const urls: string[] = [];
    for (const f of files) {
      const fn = `${Date.now()}-${Math.random().toString(36).slice(2)}.${f.name.split(".").pop()}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, f, { cacheControl: "3600" });
      if (ue) { setError(ue.message); setSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      urls.push(pu.publicUrl);
    }
    const slots = selectedCourse ? { [selectedCourse]: selectedDays } : {};
    const limits = selectedCourse ? { [selectedCourse]: hours } : {};

    if (role === "admin") {
      // Direct enroll — create student + enrollments
      const { data: newStudent, error: insErr } = await supabase.from("students").insert([{
        nick_name: nick, first_name: first, last_name: last, dob: dob || null,
        parent_line_id: lineId, parent_phone: phone,
        courses: slots, course_limits: limits,
        payment_receipt_urls: urls, joined_at: new Date().toISOString(), status: "active",
      }]).select().single();
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      // Also insert into enrollments table
      if (newStudent && selectedCourse) {
        const enrollRows = Object.entries(selectedDays).flatMap(([day, times]) =>
          times.map(time => ({
            student_id: newStudent.id, course_id: selectedCourse,
            weekday: day, time_slot: time, purchased_hours: hours, status: "active",
          }))
        );
        if (enrollRows.length) await supabase.from("enrollments").insert(enrollRows);
      }
      setSubmitted(true);
    } else {
      const { error: insErr } = await supabase.from("applications").insert([{
        nick_name: nick, first_name: first, last_name: last, dob: dob || null,
        parent_line_id: lineId, parent_phone: phone,
        courses: slots, course_limits: limits, payment_receipt_urls: urls, status: "pending",
      }]);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setSubmitted(true);
    }
    setSaving(false);
  }

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex flex-col justify-center items-center p-6" style={{ background: POS.bgMain }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl px-8 py-12 max-w-md w-full text-center" style={{ boxShadow: POS.shadowXl }}>
          <CheckCircleIcon className="w-16 h-16 mx-auto mb-4" style={{ color: POS.success }} />
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: POS.primary }}>
            {role === "admin" ? t("studentAdded", { nick }) : t("applicationSubmitted")}
          </h2>
          <p className="text-sm" style={{ color: POS.textSecondary }}>
            {role === "admin" ? t("studentEnrolled") : t("staffWillContact")}
          </p>
          <button onClick={() => { setSubmitted(false); setStep(1); setNick(""); setFirst(""); setLast(""); setDob(""); setPhone(""); setLineId(""); setSelectedCourse(null); setSelectedDays({}); setHours(10); setFiles([]); }}
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
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("studentInfo")}</h2>
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
              <input type="tel" className="w-full border rounded-xl px-4 py-3 mt-1 text-base" style={{ borderColor: POS.border, minHeight: POS.touchComfortable }}
                value={phone} onChange={e => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("lineAppId")}</label>
              <input className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                value={lineId} onChange={e => setLineId(e.target.value)} placeholder="LINE ID" />
            </div>
          </motion.div>
        )}

        {/* STEP 2: Course + Schedule */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl p-5 border space-y-4" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("selectSchedule")}</h2>
            {/* Course buttons */}
            <div className="grid grid-cols-2 gap-2">
              {courses.map(c => (
                <motion.button key={c.id} type="button" whileTap={{ scale: 0.95 }}
                  onClick={() => { setSelectedCourse(c.id); setSelectedDays({}); }}
                  className="py-4 rounded-xl text-center font-bold transition-all"
                  style={{
                    background: selectedCourse === c.id ? POS.primary : POS.bgSurface,
                    color: selectedCourse === c.id ? "#fff" : POS.primary,
                    border: `2px solid ${selectedCourse === c.id ? POS.primary : POS.border}`,
                    minHeight: POS.touchLarge,
                  }}>
                  {c.name}
                </motion.button>
              ))}
            </div>
            {/* Day + Time grid */}
            {course && (
              <div className="space-y-3 pt-2">
                <p className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("tapSlotsYouWant")}</p>
                {course.weekdays.map(day => (
                  <div key={day}>
                    <p className="text-xs font-bold mb-1" style={{ color: POS.textPrimary }}>{day}</p>
                    <div className="flex flex-wrap gap-2">
                      {(course.times[day] || []).map(time => {
                        const isSelected = selectedDays[day]?.includes(time);
                        return (
                          <button key={time} type="button" onClick={() => toggleDay(day, time)}
                            className="px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              background: isSelected ? POS.success : POS.bgSurface,
                              color: isSelected ? "#fff" : POS.textPrimary,
                              border: `2px solid ${isSelected ? POS.success : POS.border}`,
                              minHeight: POS.touchComfortable,
                            }}>
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 3: Package (Hours) */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl p-5 border space-y-4" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("selectPackage")}</h2>
            <p className="text-sm" style={{ color: POS.textSecondary }}>
              {t("howManyHours", { course: course?.name || "" })}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[10, 20, 30].map(h => (
                <motion.button key={h} type="button" whileTap={{ scale: 0.95 }}
                  onClick={() => setHours(h)}
                  className="py-6 rounded-2xl text-center font-extrabold text-xl transition-all"
                  style={{
                    background: hours === h ? POS.primary : POS.bgSurface,
                    color: hours === h ? "#fff" : POS.primary,
                    border: `2px solid ${hours === h ? POS.primary : POS.border}`,
                    minHeight: 100,
                  }}>
                  +{h}
                  <span className="block text-xs font-semibold mt-1">{t("hrs")}</span>
                </motion.button>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("customLabel")}</span>
              <input type="number" min={1} className="flex-1 rounded-xl border px-4 py-3"
                style={{ borderColor: POS.border }} value={hours}
                onChange={e => setHours(Number(e.target.value))} />
            </div>
          </motion.div>
        )}

        {/* STEP 4: Receipt + Submit */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl p-5 border space-y-4" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
            <h2 className="text-lg font-bold" style={{ color: POS.primary }}>{t("reviewSubmit")}</h2>
            {/* Summary */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: POS.bgMain }}>
              <div className="flex justify-between"><span style={{ color: POS.textSecondary }}>Student:</span><span className="font-bold">{nick} ({first} {last})</span></div>
              <div className="flex justify-between"><span style={{ color: POS.textSecondary }}>Phone:</span><span className="font-bold">{phone}</span></div>
              <div className="flex justify-between"><span style={{ color: POS.textSecondary }}>Course:</span><span className="font-bold">{course?.name}</span></div>
              <div className="flex justify-between"><span style={{ color: POS.textSecondary }}>Schedule:</span><span className="font-bold">{Object.entries(selectedDays).map(([d, t]) => `${d}: ${t.join(", ")}`).join(" | ")}</span></div>
              <div className="flex justify-between"><span style={{ color: POS.textSecondary }}>Hours:</span><span className="font-bold text-lg" style={{ color: POS.primary }}>{hours} hrs</span></div>
            </div>
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
            {saving ? t("submittingBtn") : role === "admin" ? t("addStudent") : t("submitApplication")}
          </button>
        )}
      </div>
    </div>
  );
}
