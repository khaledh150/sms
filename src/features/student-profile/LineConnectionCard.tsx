import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { POS } from "../../theme";
import type { StudentData, LineConnectionData, UnlinkedLineUser, LineConfigData } from "./types";

interface Props {
  student: StudentData;
  lineConnection: LineConnectionData | null | undefined;
  unlinkedLineUsers: UnlinkedLineUser[];
  lineConfig: LineConfigData | null | undefined;
  isAdmin: boolean;
}

export default function LineConnectionCard({ student, lineConnection, unlinkedLineUsers, lineConfig, isAdmin }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [linkingLine, setLinkingLine] = useState(false);
  const [lineDropdownOpen, setLineDropdownOpen] = useState(false);
  const [lineSearchTerm, setLineSearchTerm] = useState("");
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState("");

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["line_connection", student.id] });
    queryClient.invalidateQueries({ queryKey: ["student", student.id] });
    queryClient.invalidateQueries({ queryKey: ["line_connections"] });
    queryClient.invalidateQueries({ queryKey: ["unlinked_line_users"] });
  }

  if (lineConnection) {
    return (
      <div className="flex items-center gap-3">
        {lineConnection.picture_url ? (
          <img src={lineConnection.picture_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: "#06C755" }}>L</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate" style={{ color: POS.textPrimary }}>
            {lineConnection.display_name || "LINE User"}
          </div>
          <div className="text-[10px] font-semibold" style={{ color: "#06C755" }}>{t("lineLinked")}</div>
        </div>
        {isAdmin && (
          <button onClick={async () => {
            await supabase.from("line_connections").delete().eq("student_id", student.id);
            await supabase.from("students").update({ parent_line_id: null }).eq("id", student.id);
            toast(t("lineUnlinked"), "info");
            invalidateAll();
          }}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex-shrink-0"
            style={{ background: POS.dangerLight, color: POS.danger }}>
            {t("unlinkLine")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 relative">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: POS.textMuted }}>L</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold" style={{ color: POS.textMuted }}>{t("lineNotLinked")}</div>
        {unlinkedLineUsers.length > 0 ? (
          <div className="relative mt-1">
            <button
              onClick={() => setLineDropdownOpen(!lineDropdownOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] text-left"
              style={{ background: "#f5f5f5", border: "1px solid #e8e8e8" }}>
              <span style={{ color: selectedUnlinkedId ? POS.textPrimary : "#aaa" }}>
                {selectedUnlinkedId
                  ? (unlinkedLineUsers.find(u => u.line_user_id === selectedUnlinkedId)?.display_name || "LINE User")
                  : t("selectStudent")}
              </span>
              <ChevronDownIcon className="w-3 h-3 flex-shrink-0" style={{ color: "#aaa" }} />
            </button>
            {lineDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-30 max-h-48 overflow-hidden flex flex-col" style={{ borderColor: "#e0e0e0" }}>
                <input type="text" autoFocus value={lineSearchTerm}
                  onChange={e => setLineSearchTerm(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="px-3 py-2 text-xs border-b outline-none" style={{ borderColor: "#f0f0f0" }} />
                <div className="overflow-y-auto flex-1">
                  {unlinkedLineUsers
                    .filter(u => !lineSearchTerm || (u.display_name?.toLowerCase().includes(lineSearchTerm.toLowerCase())))
                    .map(u => (
                      <button key={u.line_user_id}
                        onClick={() => { setSelectedUnlinkedId(u.line_user_id); setLineDropdownOpen(false); setLineSearchTerm(""); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                        {u.picture_url
                          ? <img src={u.picture_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                          : <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: "#B0BEC5" }}>{(u.display_name || "?").charAt(0)}</div>
                        }
                        <span className="font-semibold truncate" style={{ color: POS.textPrimary }}>{u.display_name || "Unknown"}</span>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] mt-0.5" style={{ color: "#aaa" }}>{t("noUnlinkedAccounts")}</p>
        )}
      </div>
      {unlinkedLineUsers.length > 0 && (
        <button disabled={!selectedUnlinkedId || linkingLine}
          onClick={async () => {
            if (!selectedUnlinkedId) return;
            setLinkingLine(true);
            const u = unlinkedLineUsers.find(x => x.line_user_id === selectedUnlinkedId);
            const name = student.nick_name || student.first_name || "";
            let welcomeMessage: string | null = null;
            if (lineConfig?.auto_link_notify !== false) {
              const tpl = lineConfig?.message_templates?.link_welcome
                || `Your LINE account has been linked to {{name}}!\n\nบัญชี LINE ของคุณเชื่อมต่อกับ {{name}} เรียบร้อยแล้ว!`;
              welcomeMessage = tpl.replace(/\{\{name\}\}/g, name);
            }
            const { error } = await supabase.rpc("link_line_account", {
              p_student_id: student.id,
              p_line_user_id: selectedUnlinkedId,
              p_display_name: u?.display_name || null,
              p_picture_url: u?.picture_url || null,
              p_send_welcome: !!welcomeMessage,
              p_welcome_message: welcomeMessage,
            });
            if (error) { toast(error.message, "error"); setLinkingLine(false); return; }
            toast(t("lineLinkedSuccess"), "success");
            setSelectedUnlinkedId("");
            invalidateAll();
            setLinkingLine(false);
          }}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50 flex-shrink-0"
          style={{ background: "#06C755" }}>
          {linkingLine ? t("linking") : t("linkLine")}
        </button>
      )}
    </div>
  );
}
