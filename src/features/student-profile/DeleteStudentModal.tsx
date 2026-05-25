import { Dialog } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  enrollmentCount: number;
  attendanceCount: number;
}

export default function DeleteStudentModal({ open, onClose, onConfirm, deleting, enrollmentCount, attendanceCount }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: POS.dangerLight }}>
            <TrashIcon className="w-8 h-8" style={{ color: POS.danger }} />
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color: POS.textPrimary }}>{t("deleteConfirmTitle")}</h2>
          <p className="text-sm mb-3" style={{ color: POS.textSecondary }}>{t("deleteStudentConfirm")}</p>
          <div className="mt-3 p-3 rounded-xl text-left text-sm space-y-1 mb-4" style={{ background: POS.warningLight }}>
            <p style={{ color: POS.warning }} className="font-bold">{t("deleteWillRemove")}</p>
            <p style={{ color: POS.textSecondary }}>• {enrollmentCount} {t("enrolledCourses").toLowerCase()}</p>
            <p style={{ color: POS.textSecondary }}>• {attendanceCount} {t("attendanceHistory").toLowerCase()}</p>
            <p style={{ color: POS.textSecondary }}>• {t("allFinancialRecords")}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: POS.danger }}>{deleting ? t("loading") : t("delete")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
