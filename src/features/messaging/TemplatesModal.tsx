import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import type { LineConfig, MessageTemplates } from "./types";
import { LINE_GREEN } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  config: LineConfig | null;
}

export default function TemplatesModal({ open, onClose, config }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [templates, setTemplates] = useState<MessageTemplates | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpen() {
    if (config) setTemplates(config.message_templates || {} as MessageTemplates);
  }

  async function handleSave() {
    if (!config || !templates) return;
    setSaving(true);
    const { error } = await supabase.from("line_config").update({ message_templates: templates }).eq("id", config.id);
    if (error) toast(error.message, "error");
    else { toast(t("saved"), "success"); queryClient.invalidateQueries({ queryKey: ["line_config"] }); }
    setSaving(false);
    onClose();
  }

  const templateFields = [
    { key: "checkin" as const, label: t("autoCheckInNotify"), vars: "{{name}}, {{course}}, {{time}}" },
    { key: "renewal_approaching" as const, label: t("autoLimitNotify"), vars: "{{name}}, {{course}}, {{used}}, {{purchased}}, {{remaining}}" },
    { key: "overlimit" as const, label: t("autoRenewalReminder"), vars: "{{name}}, {{course}}, {{used}}, {{purchased}}" },
    { key: "enrollment" as const, label: t("enrollmentNotify"), vars: "{{name}}, {{course}}, {{purchased}}, {{school}}" },
    { key: "approval" as const, label: t("approvalNotify"), vars: "{{name}}, {{course}}, {{added}}" },
    { key: "link_welcome" as const, label: t("autoLinkNotify"), vars: "{{name}}" },
  ];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-2xl p-5 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
          ref={() => { if (open) handleOpen(); }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: LINE_GREEN }}>{t("editMessageTemplates")}</h2>
            <button onClick={onClose} style={{ minHeight: "auto" }}>
              <XMarkIcon className="w-6 h-6" style={{ color: "#999" }} />
            </button>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "#999" }}>{t("templateHint")}</p>
          {templates && (
            <div className="space-y-4">
              {templateFields.map(tpl => (
                <div key={tpl.key}>
                  <label className="text-xs font-bold block mb-1" style={{ color: POS.textPrimary }}>{tpl.label}</label>
                  <p className="text-[10px] mb-1" style={{ color: "#bbb" }}>{tpl.vars}</p>
                  <textarea
                    value={templates[tpl.key] || ""}
                    onChange={e => setTemplates(prev => prev ? { ...prev, [tpl.key]: e.target.value } : prev)}
                    rows={4}
                    className="w-full border rounded-lg px-3 py-2 text-xs resize-none"
                    style={{ borderColor: "#e0e0e0", lineHeight: 1.5 }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border font-bold text-sm"
              style={{ borderColor: "#e0e0e0", color: "#888" }}>{t("cancel")}</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-50"
              style={{ background: LINE_GREEN }}>
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
