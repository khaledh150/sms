import { useState } from "react";
import { Dialog } from "@headlessui/react";
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_FUNCTIONS_URL } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
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
  const queryClient = useQueryClient();

  const isConfigured = config?.secrets_configured ?? false;
  const [configForm, setConfigForm] = useState({ channel_id: config?.channel_id || "", channel_secret: "", channel_token: "" });
  const [saving, setSaving] = useState(false);

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

  const autoToggles = [
    { key: "auto_checkin_notify", label: t("autoCheckInNotify"), color: POS.success },
    { key: "auto_limit_notify", label: t("autoLimitNotify"), color: POS.warning },
    { key: "auto_renewal_notify", label: t("autoRenewalReminder"), color: POS.danger },
    { key: "auto_link_notify", label: t("autoLinkNotify"), color: "#06C755" },
  ];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-2xl p-5 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto"
          ref={() => { if (open) handleOpen(); }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: LINE_GREEN }}>
              <ChatBubbleLeftRightIcon className="w-5 h-5 inline mr-2" />
              LINE OA {t("settings")}
            </h2>
            <button onClick={onClose} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: "#999" }} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#666" }}>{t("lineChannelId")}</label>
              <input type="text" value={configForm.channel_id} onChange={e => setConfigForm({ ...configForm, channel_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: "#e0e0e0" }} placeholder="1234567890" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#666" }}>{t("lineChannelSecret")}</label>
              <input type="password" value={configForm.channel_secret} onChange={e => setConfigForm({ ...configForm, channel_secret: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: "#e0e0e0" }}
                placeholder={isConfigured ? "••••••••  (leave blank to keep)" : ""} />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#666" }}>{t("lineChannelToken")}</label>
              <input type="password" value={configForm.channel_token} onChange={e => setConfigForm({ ...configForm, channel_token: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: "#e0e0e0" }}
                placeholder={isConfigured ? "••••••••  (leave blank to keep)" : ""} />
            </div>
          </div>
          {config && (
            <div className="mt-5 pt-4 border-t space-y-3" style={{ borderColor: "#f0f0f0" }}>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#666" }}>{t("webhookUrl")}</label>
                <p className="text-[10px] mb-1.5" style={{ color: "#999" }}>{t("webhookUrlHint")}</p>
                <div className="flex gap-2">
                  <input type="text" readOnly
                    value={`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${schoolId}`}
                    className="flex-1 border rounded-lg px-3 py-2 text-[11px] font-mono truncate" style={{ borderColor: "#e0e0e0", background: "#f9f9f9" }} />
                  <button onClick={() => {
                    navigator.clipboard.writeText(`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${schoolId}`);
                    toast(t("copied"), "success");
                  }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ background: LINE_GREEN }}>
                    {t("copy")}
                  </button>
                </div>
              </div>
              <span className="text-xs font-bold block" style={{ color: "#666" }}>{t("autoNotifications")}</span>
              {autoToggles.map(opt => (
                <div key={opt.key} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: "#f8f8f8" }}>
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4" style={{ color: opt.color }} />
                    <span className="text-sm" style={{ color: POS.textPrimary }}>{opt.label}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={(config as any)[opt.key] ?? true}
                      onChange={e => toggleAutoNotify(opt.key, e.target.checked)} className="sr-only peer" />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                  </label>
                </div>
              ))}
            </div>
          )}
          {config && (
            <button onClick={() => { onOpenTemplates(); onClose(); }}
              className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold border"
              style={{ borderColor: LINE_GREEN, color: LINE_GREEN }}>
              {t("editMessageTemplates")}
            </button>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border font-bold text-sm"
              style={{ borderColor: "#e0e0e0", color: "#888" }}>{t("cancel")}</button>
            <button onClick={handleSave} disabled={saving || !configForm.channel_id || !configForm.channel_token}
              className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-50"
              style={{ background: LINE_GREEN }}>
              {saving ? t("saving") : t("saveLineConfig")}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
