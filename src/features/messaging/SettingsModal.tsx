import { useState, useRef } from "react";
import { Dialog, Disclosure } from "@headlessui/react";
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  KeyIcon,
  LinkIcon,
  BellAlertIcon,
  DocumentTextIcon,
  QrCodeIcon,
  PhotoIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_FUNCTIONS_URL } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import { useAuth } from "../../AuthContext";
import type { LineConfig } from "./types";
import { LINE_GREEN } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  config: LineConfig | null;
  schoolId: string;
  onOpenTemplates: () => void;
}

export default function SettingsModal({ open, onClose, config, schoolId, onOpenTemplates }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner" || user?.role === "superadmin";

  const isConfigured = config?.secrets_configured ?? false;
  const [configForm, setConfigForm] = useState({ channel_id: config?.channel_id || "", channel_secret: "", channel_token: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setConfigForm({ channel_id: config?.channel_id || "", channel_secret: "", channel_token: "" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (config) {
        const { error } = await supabase.from("line_config").update({ channel_id: configForm.channel_id }).eq("id", config.id);
        if (error) { toast(error.message, "error"); return; }
      } else {
        const { error } = await supabase.from("line_config").insert([{ channel_id: configForm.channel_id }]);
        if (error) { toast(error.message, "error"); return; }
      }
      if (configForm.channel_secret || configForm.channel_token) {
        const { error: vaultErr } = await supabase.rpc("save_line_secrets", {
          p_channel_secret: configForm.channel_secret,
          p_channel_token: configForm.channel_token,
        });
        if (vaultErr) { toast(vaultErr.message, "error"); return; }
      }
      toast(t("lineConfigSaved"), "success");
      queryClient.invalidateQueries({ queryKey: ["line_config"] });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  async function toggleAutoNotify(key: string, val: boolean) {
    if (!config) return;
    await supabase.from("line_config").update({ [key]: val }).eq("id", config.id);
    queryClient.invalidateQueries({ queryKey: ["line_config"] });
  }

  async function handleQrUpload(file: File) {
    if (!config) return;
    setUploadingQr(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `payment-qr/${config.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (upErr) { toast(upErr.message, "error"); return; }
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now();
      await supabase.from("line_config").update({ payment_qr_url: publicUrl }).eq("id", config.id);
      queryClient.invalidateQueries({ queryKey: ["line_config"] });
      toast(t("qrUploaded"), "success");
    } finally {
      setUploadingQr(false);
    }
  }

  async function handleQrRemove() {
    if (!config) return;
    await supabase.from("line_config").update({ payment_qr_url: null }).eq("id", config.id);
    queryClient.invalidateQueries({ queryKey: ["line_config"] });
    toast(t("qrRemoved"), "success");
  }

  const autoToggles = [
    { key: "auto_checkin_notify", label: t("autoCheckInNotify"), desc: t("autoCheckInNotifyDesc"), color: POS.success, icon: "✅" },
    { key: "auto_limit_notify", label: t("autoLimitNotify"), desc: t("autoLimitNotifyDesc"), color: POS.warning, icon: "⚠️" },
    { key: "auto_renewal_reminder", label: t("autoRenewalReminder"), desc: t("autoRenewalReminderDesc"), color: POS.danger, icon: "🔴" },
    { key: "auto_link_notify", label: t("autoLinkNotify"), desc: t("autoLinkNotifyDesc"), color: "#06C755", icon: "💚" },
  ];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-3xl max-w-md w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          ref={() => { if (open) handleOpen(); }}>

          {/* Header */}
          <div className="sticky top-0 bg-white rounded-t-3xl px-5 pt-5 pb-3 border-b z-10" style={{ borderColor: POS.borderLight }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${LINE_GREEN}15` }}>
                  <ChatBubbleLeftRightIcon className="w-5 h-5" style={{ color: LINE_GREEN }} />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: POS.textPrimary }}>LINE OA {t("settings")}</h2>
                  <span className="text-[10px] font-semibold" style={{ color: isConfigured ? POS.success : POS.textMuted }}>
                    {isConfigured ? "● " + t("connected") : "○ " + t("notConfigured")}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100" style={{ minHeight: "auto" }}>
                <XMarkIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">

            {/* Section 1: API Credentials — owner/superadmin only */}
            {isOwner && <Disclosure defaultOpen={!isConfigured}>
              {({ open: isOpen }) => (
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight }}>
                  <Disclosure.Button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <KeyIcon className="w-4 h-4" style={{ color: POS.warning }} />
                      <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("apiCredentials")}</span>
                    </div>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: POS.textMuted }} />
                  </Disclosure.Button>
                  <Disclosure.Panel className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: POS.borderLight }}>
                    <div className="pt-3">
                      <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelId")}</label>
                      <input type="text" value={configForm.channel_id} onChange={e => setConfigForm({ ...configForm, channel_id: e.target.value })}
                        className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }} placeholder="1234567890" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelSecret")}</label>
                      <input type="password" value={configForm.channel_secret} onChange={e => setConfigForm({ ...configForm, channel_secret: e.target.value })}
                        className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }}
                        placeholder={isConfigured ? "••••••••  (leave blank to keep)" : ""} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelToken")}</label>
                      <input type="password" value={configForm.channel_token} onChange={e => setConfigForm({ ...configForm, channel_token: e.target.value })}
                        className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }}
                        placeholder={isConfigured ? "••••••••  (leave blank to keep)" : ""} />
                    </div>
                  </Disclosure.Panel>
                </div>
              )}
            </Disclosure>}

            {/* Section 2: Webhook URL — owner/superadmin only */}
            {isOwner && config && (
              <Disclosure>
                {({ open: isOpen }) => (
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight }}>
                    <Disclosure.Button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <LinkIcon className="w-4 h-4" style={{ color: POS.primary }} />
                        <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("webhookUrl")}</span>
                      </div>
                      <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: POS.textMuted }} />
                    </Disclosure.Button>
                    <Disclosure.Panel className="px-4 pb-4 border-t" style={{ borderColor: POS.borderLight }}>
                      <p className="text-[10px] mt-3 mb-2" style={{ color: POS.textMuted }}>{t("webhookUrlHint")}</p>
                      <div className="flex gap-2">
                        <input type="text" readOnly
                          value={`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${schoolId}`}
                          className="flex-1 border rounded-xl px-3 py-2 text-[11px] font-mono truncate" style={{ borderColor: POS.borderLight, background: POS.bgSurface }} />
                        <button onClick={() => {
                          navigator.clipboard.writeText(`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${schoolId}`);
                          toast(t("copied"), "success");
                        }} className="px-3 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 flex items-center gap-1" style={{ background: LINE_GREEN }}>
                          <ClipboardDocumentIcon className="w-3.5 h-3.5" /> {t("copy")}
                        </button>
                      </div>
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            )}

            {/* Section 3: Auto Notifications — always visible */}
            {config && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight }}>
                <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: POS.borderLight }}>
                  <BellAlertIcon className="w-4 h-4" style={{ color: POS.danger }} />
                  <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("autoNotifications")}</span>
                </div>
                <div className="divide-y" style={{ borderColor: POS.borderLight }}>
                  {autoToggles.map(opt => (
                    <div key={opt.key} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <CheckCircleIcon className="w-4 h-4 shrink-0" style={{ color: opt.color }} />
                        <span className="text-[13px] font-semibold" style={{ color: POS.textPrimary }}>{opt.label}</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                        <input type="checkbox" checked={(config as any)[opt.key] ?? true}
                          onChange={e => toggleAutoNotify(opt.key, e.target.checked)} className="sr-only peer" />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Payment QR Code — owner only */}
            {config && isOwner && (
              <Disclosure>
                {({ open: isOpen }) => (
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight }}>
                    <Disclosure.Button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <QrCodeIcon className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                        <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("paymentQrCode")}</span>
                      </div>
                      <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: POS.textMuted }} />
                    </Disclosure.Button>
                    <Disclosure.Panel className="px-4 pb-4 border-t" style={{ borderColor: POS.borderLight }}>
                      <p className="text-[10px] mt-3 mb-3" style={{ color: POS.textMuted }}>{t("paymentQrHint")}</p>
                      {config.payment_qr_url ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={config.payment_qr_url} alt="Payment QR" className="w-40 h-40 object-contain rounded-xl border" style={{ borderColor: POS.borderLight }} />
                          <div className="flex gap-2">
                            <button onClick={() => qrInputRef.current?.click()}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-gray-50"
                              style={{ borderColor: POS.borderLight, color: POS.textSecondary }}>
                              <PhotoIcon className="w-3.5 h-3.5" /> {t("replace")}
                            </button>
                            <button onClick={handleQrRemove}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-red-50"
                              style={{ borderColor: POS.borderLight, color: POS.danger }}>
                              <TrashIcon className="w-3.5 h-3.5" /> {t("remove")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => qrInputRef.current?.click()} disabled={uploadingQr}
                          className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-1.5 hover:bg-purple-50/50 transition-colors disabled:opacity-50"
                          style={{ borderColor: "#8B5CF680", color: "#8B5CF6" }}>
                          <PhotoIcon className="w-6 h-6" />
                          <span className="text-xs font-bold">{uploadingQr ? t("uploading") : t("uploadQrCode")}</span>
                        </button>
                      )}
                      <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleQrUpload(f); e.target.value = ""; }} />
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            )}

            {/* Section 5: Message Templates button */}
            {config && (
              <button onClick={() => { onOpenTemplates(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border-2 border-dashed hover:bg-green-50 transition-colors"
                style={{ borderColor: `${LINE_GREEN}66`, color: LINE_GREEN }}>
                <DocumentTextIcon className="w-4 h-4" />
                {t("editMessageTemplates")}
              </button>
            )}
          </div>

          {/* Footer actions — sticky */}
          <div className="sticky bottom-0 bg-white rounded-b-3xl px-5 py-4 border-t flex gap-3" style={{ borderColor: POS.borderLight }}>
            <button onClick={onClose} className={`${isOwner ? "flex-1" : "w-full"} py-2.5 rounded-xl border font-bold text-sm hover:bg-gray-50`}
              style={{ borderColor: POS.borderLight, color: POS.textMuted }}>{isOwner ? t("cancel") : t("close")}</button>
            {isOwner && <button onClick={handleSave} disabled={saving || !configForm.channel_id}
              className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: LINE_GREEN }}>
              {saving ? t("saving") : t("saveLineConfig")}
            </button>}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
