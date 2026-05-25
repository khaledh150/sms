import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { POS } from "../../theme";
import type { StudentData } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  student: StudentData;
}

export default function EditStudentModal({ open, onClose, student }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nick_name: student.nick_name || "",
    first_name: student.first_name || "",
    last_name: student.last_name || "",
    dob: student.dob || "",
    parent_phone: student.parent_phone || "",
  });

  function handleOpen() {
    setForm({
      nick_name: student.nick_name || "",
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      dob: student.dob || "",
      parent_phone: student.parent_phone || "",
    });
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("students").update({
      nick_name: form.nick_name || null,
      first_name: form.first_name,
      last_name: form.last_name,
      dob: form.dob || null,
      parent_phone: form.parent_phone || null,
    }).eq("id", student.id);
    if (error) toast(error.message, "error");
    else { toast(t("studentUpdated"), "success"); queryClient.invalidateQueries({ queryKey: ["student", student.id] }); onClose(); }
    setSaving(false);
  }

  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" style={{ boxShadow: POS.shadowXl }}
        ref={() => { if (open) handleOpen(); }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg" style={{ color: POS.primary }}>{t("editStudent")}</h2>
          <button onClick={onClose} aria-label={t("close")} style={{ minHeight: "auto" }}>
            <XMarkIcon className="w-6 h-6" style={{ color: POS.textMuted }} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("nickName")}</label>
            <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.nick_name} onChange={e => setForm(f => ({ ...f, nick_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("firstName")} *</label>
            <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("lastName")} *</label>
            <input type="text" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("dob")}</label>
            <input type="date" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("phone")}</label>
            <input type="tel" inputMode="numeric" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.parent_phone} onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={handleSave} disabled={saving || !form.first_name || !form.last_name}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: POS.primary }}>{saving ? t("loading") : t("save")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
