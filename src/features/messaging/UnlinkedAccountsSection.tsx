import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LinkIcon,
  ChevronDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import { supabase, SUPABASE_FUNCTIONS_URL } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import type { UnlinkedUser, StudentBasic, LineConfig } from "./types";
import { LINE_GREEN } from "./types";

interface Props {
  unlinkedUsers: UnlinkedUser[];
  students: StudentBasic[];
  connectedStudentIds: Set<string>;
  config: LineConfig | null;
}

export default function UnlinkedAccountsSection({ unlinkedUsers, students, connectedStudentIds, config }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(false);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function handleLinkAccount(lineUserId: string) {
    const studentId = linkSelections[lineUserId];
    if (!studentId) return;
    setLinkingId(lineUserId);
    try {
      const unlinked = unlinkedUsers.find(u => u.line_user_id === lineUserId);
      const { error: connErr } = await supabase.from("line_connections").upsert({
        student_id: studentId,
        line_user_id: lineUserId,
        display_name: unlinked?.display_name || null,
        picture_url: unlinked?.picture_url || null,
      }, { onConflict: "student_id" });
      if (connErr) { toast(connErr.message, "error"); return; }

      await supabase.from("students").update({ parent_line_id: lineUserId }).eq("id", studentId);
      await supabase.from("unlinked_line_users").delete().eq("line_user_id", lineUserId);

      if (config?.auto_link_notify) {
        const student = students.find(s => s.id === studentId);
        const name = student?.nick_name || student?.first_name || "";
        const tpl = config.message_templates?.link_welcome
          || `Your LINE account has been linked to {{name}}! You will now receive notifications.\n\nบัญชี LINE ของคุณเชื่อมต่อกับ {{name}} เรียบร้อยแล้ว!`;
        const message = tpl.replace(/\{\{name\}\}/g, name);
        await supabase.from("pending_line_notifications").insert({
          student_id: studentId, message_type: "general", message, status: "queued",
        });
      }

      toast(t("accountLinked"), "success");
      queryClient.invalidateQueries({ queryKey: ["unlinked_line_users"] });
      queryClient.invalidateQueries({ queryKey: ["line_connections"] });
      setLinkSelections(prev => { const n = { ...prev }; delete n[lineUserId]; return n; });
    } finally {
      setLinkingId(null);
    }
  }

  async function handleSyncFollowers() {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast("Not authenticated", "error"); return; }
      const res = await fetch(
        `${SUPABASE_FUNCTIONS_URL}/sync-line-followers`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } }
      );
      if (res.status === 403 || res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (body?.error?.includes("not available") || res.status === 403) {
          toast(t("syncFollowersError403"), "warning");
          return;
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body?.error || "Sync failed", "error");
        return;
      }
      const result = await res.json();
      toast(`${t("syncComplete")} — ${result.new_count ?? 0} ${t("newAccountsFound")}`, "success");
      queryClient.invalidateQueries({ queryKey: ["unlinked_line_users"] });
    } catch (err: any) {
      toast(err.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  const availableStudents = students.filter(s => !connectedStudentIds.has(s.id));

  return (
    <div className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left" style={{ background: "#FFF8E1", borderBottom: expanded ? "1px solid #FFE082" : "none" }}>
        <LinkIcon className="w-4 h-4" style={{ color: "#F59E0B" }} />
        <div className="flex-1">
          <span className="text-sm font-bold" style={{ color: "#92400E" }}>{t("unlinkedLineAccounts")}</span>
          {unlinkedUsers.length > 0 && (
            <span className="text-[10px] font-bold ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "#FDE68A", color: "#92400E" }}>
              {unlinkedUsers.length}
            </span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: "#92400E" }} />
      </button>
      {expanded && (
        <div className="flex justify-end px-4 pt-2" style={{ background: "#FFF8E1" }}>
          <button onClick={handleSyncFollowers} disabled={syncing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition hover:opacity-80"
            style={{ background: "#06C755", color: "#fff" }}>
            <ArrowPathIcon className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("syncing") : t("syncFollowers")}
          </button>
        </div>
      )}
      {expanded && unlinkedUsers.length > 0 && (
        <p className="text-[11px] px-4 pt-2 pb-1" style={{ color: "#999" }}>{t("unlinkedLineHint")}</p>
      )}
      {expanded && (<>
        <div className="divide-y" style={{ borderColor: "#f5f5f5" }}>
          {unlinkedUsers.map(u => {
            const selectedSid = linkSelections[u.line_user_id] || "";
            const searchTerm = (searchTerms[u.line_user_id] || "").toLowerCase();
            const isOpen = dropdownOpen === u.line_user_id;
            const filteredOpts = searchTerm
              ? availableStudents.filter(s =>
                  (s.nick_name?.toLowerCase().includes(searchTerm)) ||
                  s.first_name.toLowerCase().includes(searchTerm) ||
                  s.last_name.toLowerCase().includes(searchTerm))
              : availableStudents;

            return (
              <div key={u.line_user_id} className="px-4 py-3 flex items-center gap-3">
                {u.picture_url ? (
                  <img src={u.picture_url} alt="" className="w-10 h-10 rounded-full flex-shrink-0 object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ background: "#B0BEC5" }}>
                    {(u.display_name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold block truncate" style={{ color: POS.textPrimary }}>
                    {u.display_name || "Unknown"}
                  </span>
                  <span className="text-[10px]" style={{ color: "#aaa" }}>
                    {t("followedOn")} {new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>

                  <div className="relative mt-1.5">
                    <button
                      onClick={() => setDropdownOpen(isOpen ? null : u.line_user_id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left"
                      style={{ background: "#f5f5f5", border: "1px solid #e8e8e8" }}>
                      <span style={{ color: selectedSid ? POS.textPrimary : "#aaa" }}>
                        {selectedSid
                          ? (() => { const s = students.find(s => s.id === selectedSid); return s ? (s.nick_name ? `${s.nick_name} (${s.first_name})` : `${s.first_name} ${s.last_name}`) : ""; })()
                          : t("selectStudent")}
                      </span>
                      <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#aaa" }} />
                    </button>

                    {isOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-30 max-h-48 overflow-hidden flex flex-col" style={{ borderColor: "#e0e0e0" }}>
                        <input
                          type="text" autoFocus
                          value={searchTerms[u.line_user_id] || ""}
                          onChange={e => setSearchTerms(prev => ({ ...prev, [u.line_user_id]: e.target.value }))}
                          placeholder={t("searchPlaceholder")}
                          className="px-3 py-2 text-xs border-b outline-none" style={{ borderColor: "#f0f0f0" }} />
                        <div className="overflow-y-auto flex-1">
                          {filteredOpts.length === 0 ? (
                            <p className="text-xs text-center py-3" style={{ color: "#aaa" }}>{t("noStudentsFound")}</p>
                          ) : (
                            filteredOpts.map(s => (
                              <button key={s.id}
                                onClick={() => {
                                  setLinkSelections(prev => ({ ...prev, [u.line_user_id]: s.id }));
                                  setDropdownOpen(null);
                                  setSearchTerms(prev => ({ ...prev, [u.line_user_id]: "" }));
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                                style={{ color: POS.textPrimary }}>
                                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: LINE_GREEN }}>
                                  {(s.nick_name || s.first_name).charAt(0).toUpperCase()}
                                </div>
                                <span className="font-semibold truncate">
                                  {s.nick_name ? `${s.nick_name} (${s.first_name} ${s.last_name})` : `${s.first_name} ${s.last_name}`}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleLinkAccount(u.line_user_id)}
                  disabled={!selectedSid || linkingId === u.line_user_id}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-white flex-shrink-0 disabled:opacity-40"
                  style={{ background: LINE_GREEN }}>
                  {linkingId === u.line_user_id ? t("linking") : t("linkAccount")}
                </motion.button>
              </div>
            );
          })}
        </div>
        {unlinkedUsers.length === 0 && (
          <div className="py-4 text-center">
            <p className="text-xs font-semibold" style={{ color: "#bbb" }}>{t("noUnlinkedAccounts")}</p>
          </div>
        )}
      </>)}
    </div>
  );
}
