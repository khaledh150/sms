import { useState, useRef } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon, CameraIcon } from "@heroicons/react/24/outline";
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
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
    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${student.id}.${ext}`;
      await supabase.storage.from("student-photos").upload(path, photoFile, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from("student-photos").getPublicUrl(path);
      await supabase.from("students").update({ photo_url: `${publicUrl}?t=${Date.now()}` }).eq("id", student.id);
    }
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
    setPhotoFile(null);
    setPhotoPreview(null);
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
          <div className="flex items-center gap-3">
            <input type="file" ref={photoRef} accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }} />
            <button type="button" onClick={() => photoRef.current?.click()}
              className="w-14 h-14 rounded-full flex items-center justify-center relative overflow-hidden group flex-shrink-0"
              style={{ background: POS.bgSurface, border: `2px dashed ${POS.border}`, minHeight: "auto" }}>
              {(photoPreview || student.photo_url) ? (
                <img src={photoPreview || student.photo_url!} alt="" className="w-full h-full object-cover" />
              ) : (
                <CameraIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <CameraIcon className="w-4 h-4 text-white" />
              </div>
            </button>
            <span className="text-xs" style={{ color: POS.textMuted }}>{t("changePhoto")}</span>
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("nickName")} *</label>
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
            <label className="text-xs font-semibold" style={{ color: POS.textSecondary }}>{t("phone")} *</label>
            <input type="tel" inputMode="numeric" pattern="[0-9]*" className="w-full rounded-xl border px-3 py-3 mt-1" style={{ borderColor: POS.border }}
              value={form.parent_phone} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setForm(f => ({ ...f, parent_phone: v })); }} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
          <button onClick={handleSave} disabled={saving || !form.nick_name || !form.first_name || !form.last_name || !form.parent_phone}
            className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ background: POS.primary }}>{saving ? t("loading") : t("save")}</button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
