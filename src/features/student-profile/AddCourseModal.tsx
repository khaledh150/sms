import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { validateReceiptFile } from "../../hooks/useFileValidation";
import { POS } from "../../theme";
import type { StudentData, CourseData } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  student: StudentData;
  courses: CourseData[];
  enrolledCourseIds: Set<string>;
}

export default function AddCourseModal({ open, onClose, student, courses, enrolledCourseIds }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addCourse, setAddCourse] = useState<string | null>(null);
  const [addDays, setAddDays] = useState<Record<string, string[]>>({});
  const [addHours, setAddHours] = useState(0);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  function handleClose() {
    onClose();
    setAddError("");
  }

  async function handleSubmit() {
    setAddError("");
    if (!addCourse) { setAddError(t("pleaseSelectCourse")); return; }
    if (Object.keys(addDays).length === 0) { setAddError(t("pleaseSelectDay")); return; }
    if (addHours < 1) { setAddError(t("hoursMustBeOne")); return; }

    setSaving(true);
    let receiptUrls: string[] = [];
    if (addFile) {
      const validationErr = validateReceiptFile(addFile);
      if (validationErr) { setAddError(validationErr); setSaving(false); return; }
      const fn = `${Date.now()}-${addFile.name}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, addFile);
      if (ue) { setAddError(t("uploadFailed", { message: ue.message })); setSaving(false); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      receiptUrls = [pu.publicUrl];
    }

    await supabase.from("application_changes").insert([{
      student_id: student.id, type: "edit", status: "pending",
      changes: {
        course_changes: { [addCourse]: addDays },
        course_limits: { [addCourse]: addHours },
        ...(receiptUrls.length > 0 ? { receipts: receiptUrls } : {}),
      },
    }]);
    setSaving(false);
    onClose();
    setAddCourse(null); setAddDays({}); setAddFile(null); setAddHours(0);
    toast(t("submitAdd"), "success");
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  return (
    <Dialog open={open} onClose={handleClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg" style={{ color: POS.primary }}>{t("addNewCourse")}</h2>
          <button onClick={handleClose} aria-label={t("close")} style={{ minHeight: "auto" }}>
            <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
          </button>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("selectCourseLabel")}</label>
            <select className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: !addCourse && addError ? POS.danger : POS.border }}
              value={addCourse || ""} onChange={e => { setAddCourse(e.target.value); setAddDays({}); setAddHours(0); setAddError(""); }}>
              <option value="">{t("chooseCourse")}</option>
              {courses.filter(c => !enrolledCourseIds.has(c.id)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {addCourse && (
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectDayLabel")}</label>
              <div className="space-y-2">
                {(courseMap[addCourse]?.weekdays || []).map((day: string) => {
                  const selected = addDays[day] || [];
                  const timesForDay = courseMap[addCourse]?.times?.[day] || [];
                  return (
                    <div key={day} className="rounded-xl p-3" style={{ background: selected.length > 0 ? `${POS.primary}10` : POS.bgSurface, border: `1px solid ${selected.length > 0 ? POS.primary : POS.border}` }}>
                      <div className="font-bold text-sm mb-1" style={{ color: POS.textPrimary }}>{day}</div>
                      <div className="flex flex-wrap gap-1">
                        {timesForDay.map((time: string) => {
                          const isOn = selected.includes(time);
                          return (
                            <button key={time} type="button" onClick={() => {
                              setAddDays(prev => {
                                const curr = prev[day] || [];
                                const next = isOn ? curr.filter(t => t !== time) : [...curr, time];
                                const copy = { ...prev };
                                if (next.length === 0) delete copy[day]; else copy[day] = next;
                                return copy;
                              });
                              setAddError("");
                            }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={{ background: isOn ? POS.primary : "#fff", color: isOn ? "#fff" : POS.primary, border: `1px solid ${POS.primary}` }}>
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {addCourse && (
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackageLabel")}</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(courseMap[addCourse]?.hour_packages || []).map((pkg: any, i: number) => (
                  <motion.button key={i} type="button" whileTap={{ scale: 0.95 }}
                    onClick={() => { setAddHours(pkg.hours); setAddError(""); }}
                    className="py-3 rounded-xl text-center font-bold transition-all"
                    style={{
                      background: addHours === pkg.hours ? POS.primary : POS.bgSurface,
                      color: addHours === pkg.hours ? "#fff" : POS.primary,
                      border: `2px solid ${addHours === pkg.hours ? POS.primary : POS.border}`,
                    }}>
                    <div>{pkg.hours} {t("hrs")}</div>
                    <div className="text-xs opacity-80">฿{pkg.price?.toLocaleString()}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>
              {t("uploadReceipt")} <span className="font-normal">{t("receiptOptional")}</span>
            </label>
            <input type="file" accept="image/*,application/pdf" className="mt-1"
              onChange={e => setAddFile(e.target.files?.[0] || null)} />
            {!addFile && (
              <p className="text-xs mt-1 px-2 py-1 rounded-lg" style={{ background: POS.warningLight, color: POS.warning }}>
                {t("receiptTip")}
              </p>
            )}
          </div>
        </div>

        {addError && (
          <div className="mt-3 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: POS.dangerLight, color: POS.danger }}>
            {addError}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={handleClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: POS.success }}>{saving ? t("submittingBtn") : t("submit")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
