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
  courseId: string | null;
  mode: "renew" | "add";
  onClose: () => void;
  student: StudentData;
  courseMap: Record<string, CourseData>;
}

export default function RenewCourseModal({ courseId, mode, onClose, student, courseMap }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [hours, setHours] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  function handleClose() {
    onClose();
    setError("");
  }

  async function handleSubmit() {
    setError("");
    if (!courseId) return;
    if (hours < 1) { setError(t("hoursMustBeOne")); return; }
    if (!file) { setError(t("receiptRequiredError")); return; }

    let receiptUrls: string[] = [];
    if (file) {
      const validationErr = validateReceiptFile(file);
      if (validationErr) { setError(validationErr); return; }
      const fn = `${Date.now()}-${file.name}`;
      const { data: u, error: ue } = await supabase.storage.from("receipts").upload(fn, file);
      if (ue) { setError(t("uploadFailed", { message: ue.message })); return; }
      const { data: pu } = supabase.storage.from("receipts").getPublicUrl(u.path);
      receiptUrls = [pu.publicUrl];
    }

    await supabase.from("application_changes").insert([{
      student_id: student.id, type: "renewal", status: "pending",
      changes: {
        course_limits: { [courseId]: hours },
        ...(receiptUrls.length > 0 ? { receipts: receiptUrls } : {}),
      },
    }]);
    onClose();
    setHours(1); setFile(null);
    toast(t("submitRenewal"), "success");
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
  }

  const courseName = courseMap[courseId || ""]?.name || "";

  return (
    <Dialog open={!!courseId} onClose={handleClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg" style={{ color: POS.primary }}>
            {mode === "add" ? t("addHoursTitle", { course: courseName }) : t("submitRenew", { course: courseName })}
          </h2>
          <button onClick={handleClose} aria-label={t("close")} style={{ minHeight: "auto" }}>
            <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-2 block" style={{ color: POS.textSecondary }}>{t("selectPackage")} *</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {(courseMap[courseId || ""]?.hour_packages || []).map((pkg: any, i: number) => (
                <motion.button key={i} type="button" whileTap={{ scale: 0.95 }}
                  onClick={() => { setHours(pkg.hours); setError(""); }}
                  className="py-4 rounded-xl text-center font-bold transition-all"
                  style={{
                    background: hours === pkg.hours ? POS.primary : POS.bgSurface,
                    color: hours === pkg.hours ? "#fff" : POS.primary,
                    border: `2px solid ${hours === pkg.hours ? POS.primary : POS.border}`,
                    minHeight: POS.touchLarge,
                  }}>
                  <div className="text-lg">+{pkg.hours} {t("hrs")}</div>
                  <div className="text-xs opacity-80">฿{pkg.price?.toLocaleString()}</div>
                </motion.button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>
              {t("uploadReceipt")} <span className="font-normal text-red-500">*</span>
            </label>
            <input type="file" accept="image/*,application/pdf" className="mt-1"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        {error && (
          <div className="mt-3 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: POS.dangerLight, color: POS.danger }}>
            {error}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <button onClick={handleClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl text-white font-bold"
            style={{ background: POS.primary }}>{t("submit")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
