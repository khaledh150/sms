import { Dialog } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { POS } from "../theme";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel, cancelLabel, variant = "warning", loading,
}: Props) {
  const { t } = useTranslation();

  const colors = {
    danger: { bg: POS.dangerLight, fg: POS.danger },
    warning: { bg: POS.warningLight, fg: POS.warning },
    info: { bg: POS.infoLight, fg: POS.info },
  }[variant];

  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: colors.bg }}>
            <ExclamationTriangleIcon className="w-7 h-7" style={{ color: colors.fg }} />
          </div>
          {title && <h2 className="text-lg font-bold mb-2" style={{ color: POS.textPrimary }}>{title}</h2>}
          <p className="text-sm mb-5" style={{ color: POS.textSecondary }}>{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>
            {cancelLabel || t("cancel")}
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: colors.fg }}>
            {loading ? t("loading") : confirmLabel || t("confirm")}
          </button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
