import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import type { StudentForGrid } from "./types";

interface Props {
  picker: { stu: StudentForGrid; cid: string } | null;
  onConfirm: (hours: number) => void;
  onClose: () => void;
}

export default function HourPickerModal({ picker, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={onClose}>
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-xs p-6 pb-10 sm:pb-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bouncy text-center mb-1" style={{ color: POS.primaryDark }}>
              {picker.stu.nick_name || picker.stu.first_name}
              {picker.stu.nick_name && picker.stu.first_name && <span className="text-sm block" style={{ color: POS.textMuted }}>'{picker.stu.first_name}'</span>}
            </h3>
            <p className="text-sm text-center mb-5" style={{ color: POS.textMuted }}>{t("howManyHours", { course: "" }).replace("—", "").trim() || "How many hours?"}</p>
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(h => (
                <button key={h} onClick={() => onConfirm(h)}
                  className="py-4 rounded-2xl text-2xl font-bouncy btn-gummy text-white shadow-lg"
                  style={{ background: h === 1 ? POS.success : POS.primary }}>
                  {h}h
                </button>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full mt-4 py-3 rounded-xl text-sm font-bold"
              style={{ color: POS.textMuted }}>
              {t("cancel")}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
