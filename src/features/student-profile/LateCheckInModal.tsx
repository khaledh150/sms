import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { POS } from "../../theme";
import type { StudentData, CourseData } from "./types";

interface Props {
  courseId: string | null;
  onClose: () => void;
  student: StudentData;
  courseMap: Record<string, CourseData>;
  userId: string;
}

export default function LateCheckInModal({ courseId, onClose, student, courseMap, userId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [date, setDate] = useState("");
  const [hours, setHours] = useState(1);

  async function handleSubmit() {
    if (!courseId || !date || !userId) return;
    const selected = new Date(date);
    if (selected > new Date()) { toast(t("lateCheckInMaxDays"), "error"); return; }

    const ts = `${date}T09:00:00`;
    const inserts = Array.from({ length: hours }, () => ({
      student_id: student.id, course_id: courseId,
      attended_at_ts: ts, approved_by: userId,
    }));
    const { error } = await supabase.from("attendance").insert(inserts);
    if (error) { toast(error.message, "error"); return; }
    toast(t("lateCheckInSuccess"), "success");
    onClose();
    setHours(1);
    queryClient.invalidateQueries({ queryKey: ["attendance", student.id] });
  }

  return (
    <Dialog open={!!courseId} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg" style={{ color: POS.primary }}>
            {t("lateCheckIn")} — {courseMap[courseId || ""]?.name}
          </h2>
          <button onClick={onClose} aria-label={t("close")} style={{ minHeight: "auto" }}>
            <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
          </button>
        </div>
        <p className="text-sm mb-3" style={{ color: POS.textSecondary }}>{t("lateCheckInDesc")}</p>
        <input type="date" className="w-full rounded-xl border px-3 py-3" style={{ borderColor: POS.border }}
          value={date} onChange={e => setDate(e.target.value)}
          max={new Date().toISOString().split("T")[0]} />
        <div className="mt-3">
          <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("hours")}</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: hours === h ? POS.primary : POS.bgSurface, color: hours === h ? "#fff" : POS.textPrimary }}>
                {h}h
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={handleSubmit} disabled={!date}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: POS.primary }}>{t("checkIn")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
