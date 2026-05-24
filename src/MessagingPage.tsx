import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@headlessui/react";
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  AcademicCapIcon,
  Cog6ToothIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
  LinkIcon,
  ChevronDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import { supabase, SUPABASE_FUNCTIONS_URL } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { useCourses } from "./hooks/useCourses";
import { useStudents } from "./hooks/useStudents";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import { useToast } from "./hooks/useToast";

interface MessageTemplates {
  checkin: string;
  renewal_approaching: string;
  overlimit: string;
  enrollment: string;
  approval: string;
  link_welcome: string;
}

interface LineConfig {
  id: string;
  channel_id: string;
  secrets_configured: boolean;
  auto_checkin_notify: boolean;
  auto_limit_notify: boolean;
  auto_renewal_notify: boolean;
  auto_link_notify: boolean;
  message_templates: MessageTemplates;
}

interface LineMessage {
  id: string;
  message_type: string;
  content: string;
  recipient_count: number;
  recipient_student_ids: string[] | null;
  status: string;
  created_at: string;
}

interface LineConnection {
  id: string;
  student_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
}

function useLineConfig() {
  return useQuery({
    queryKey: ["line_config"],
    queryFn: async () => {
      const { data } = await supabase.from("line_config").select("*").limit(1).single();
      return data as LineConfig | null;
    },
    staleTime: 300_000,
  });
}

function useLineMessages() {
  return useQuery({
    queryKey: ["line_messages"],
    queryFn: async () => {
      const { data } = await supabase.from("line_messages").select("*").order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as LineMessage[];
    },
    staleTime: 30_000,
  });
}

function useLineConnections() {
  return useQuery({
    queryKey: ["line_connections"],
    queryFn: async () => {
      const { data } = await supabase.from("line_connections").select("*");
      return (data ?? []) as LineConnection[];
    },
    staleTime: 60_000,
  });
}

function useEnrollments() {
  return useQuery({
    queryKey: ["enrollments_active"],
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("student_id, course_id").eq("status", "active");
      return (data ?? []) as { student_id: string; course_id: string }[];
    },
    staleTime: 120_000,
  });
}

interface UnlinkedUser {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  created_at: string;
}

function useUnlinkedLineUsers() {
  return useQuery({
    queryKey: ["unlinked_line_users"],
    queryFn: async () => {
      const { data } = await supabase.from("unlinked_line_users").select("*").order("created_at", { ascending: false });
      return (data ?? []) as UnlinkedUser[];
    },
    staleTime: 30_000,
  });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatChatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatChatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

const LINE_GREEN = "#06C755";
const LINE_BG = "#f7f8fa";
const CHAT_BG = "#7494A5";

export default function MessagingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";

  const { data: config } = useLineConfig();
  const { data: messages = [] } = useLineMessages();
  const { data: connections = [] } = useLineConnections();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useStudents(false);
  const { data: enrollments = [] } = useEnrollments();

  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editTemplates, setEditTemplates] = useState<MessageTemplates | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [chatStudentId, setChatStudentId] = useState<string | null>(null);

  const [recipientMode, setRecipientMode] = useState<"all" | "course">("all");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const [configForm, setConfigForm] = useState({ channel_id: "", channel_secret: "", channel_token: "" });
  const [savingConfig, setSavingConfig] = useState(false);

  const { data: unlinkedUsers = [] } = useUnlinkedLineUsers();
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [unlinkedSearch, setUnlinkedSearch] = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("messaging_returnToChat");
    if (saved) {
      setChatStudentId(saved);
      sessionStorage.removeItem("messaging_returnToChat");
    }
  }, []);

  const isConfigured = config?.secrets_configured ?? false;
  const connectedStudentIds = useMemo(() => new Set(connections.map(c => c.student_id)), [connections]);

  const connectedStudents = useMemo(() =>
    students.filter(s => connectedStudentIds.has(s.id)),
  [students, connectedStudentIds]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return connectedStudents;
    const q = search.toLowerCase();
    return connectedStudents.filter(s =>
      (s.nick_name?.toLowerCase().includes(q)) ||
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q)
    );
  }, [connectedStudents, search]);

  const lastMessageMap = useMemo(() => {
    const m = new Map<string, LineMessage>();
    messages.forEach(msg => {
      if (!msg.recipient_student_ids) return;
      msg.recipient_student_ids.forEach(sid => {
        if (!m.has(sid) || new Date(msg.created_at) > new Date(m.get(sid)!.created_at)) {
          m.set(sid, msg);
        }
      });
    });
    return m;
  }, [messages]);

  const chatStudent = useMemo(() => {
    if (!chatStudentId) return null;
    return students.find(s => s.id === chatStudentId) ?? null;
  }, [chatStudentId, students]);

  const chatDisplayName = useMemo(() => {
    if (!chatStudent) return "";
    return chatStudent.nick_name ? `${chatStudent.nick_name} (${chatStudent.first_name})` : `${chatStudent.first_name} ${chatStudent.last_name}`;
  }, [chatStudent]);

  const chatMessages = useMemo(() => {
    if (!chatStudentId) return [];
    return messages
      .filter(m => m.recipient_student_ids?.includes(chatStudentId))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, chatStudentId]);

  // Scroll to bottom when chat opens or new messages
  useEffect(() => {
    if (chatStudentId) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatStudentId, chatMessages.length]);

  const broadcastRecipientIds = useMemo(() => {
    if (recipientMode === "all") return connectedStudents.map(s => s.id);
    if (!selectedCourse) return [];
    const ids = new Set(enrollments.filter(e => e.course_id === selectedCourse).map(e => e.student_id));
    return connectedStudents.filter(s => ids.has(s.id)).map(s => s.id);
  }, [recipientMode, connectedStudents, selectedCourse, enrollments]);

  async function handleSendChat() {
    if (!messageText.trim() || !chatStudentId) return;
    setSending(true);
    const { error } = await supabase.rpc("queue_line_message", {
      p_message_type: "general",
      p_content: messageText.trim(),
      p_recipient_student_ids: [chatStudentId],
    });
    if (error) toast(error.message, "error");
    else {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["line_messages"] });
    }
    setSending(false);
  }

  async function sendBroadcast() {
    if (!messageText.trim() || broadcastRecipientIds.length === 0) return;
    setSending(true);
    const { error } = await supabase.rpc("queue_line_message", {
      p_message_type: "general",
      p_content: messageText.trim(),
      p_recipient_student_ids: broadcastRecipientIds,
    });
    if (error) toast(error.message, "error");
    else {
      toast(t("messageSent"), "success");
      setMessageText("");
      setBroadcastOpen(false);
      queryClient.invalidateQueries({ queryKey: ["line_messages"] });
    }
    setSending(false);
  }

  async function toggleAutoNotify(key: string, val: boolean) {
    if (!config) return;
    await supabase.from("line_config").update({ [key]: val }).eq("id", config.id);
    queryClient.invalidateQueries({ queryKey: ["line_config"] });
  }

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
          student_id: studentId,
          message_type: "general",
          message,
          status: "queued",
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

  function openSettings() {
    setConfigForm({ channel_id: config?.channel_id || "", channel_secret: "", channel_token: "" });
    setSettingsOpen(true);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
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
      setSavingConfig(false);
      setSettingsOpen(false);
    }
  }

  const autoToggles = [
    { key: "auto_checkin_notify", label: t("autoCheckInNotify"), color: POS.success },
    { key: "auto_limit_notify", label: t("autoLimitNotify"), color: POS.warning },
    { key: "auto_renewal_notify", label: t("autoRenewalReminder"), color: POS.danger },
    { key: "auto_link_notify", label: t("autoLinkNotify"), color: "#06C755" },
  ];

  async function handleSaveTemplates() {
    if (!config || !editTemplates) return;
    setSavingTemplates(true);
    const { error } = await supabase.from("line_config").update({ message_templates: editTemplates }).eq("id", config.id);
    if (error) toast(error.message, "error");
    else { toast(t("saved"), "success"); queryClient.invalidateQueries({ queryKey: ["line_config"] }); }
    setSavingTemplates(false);
    setTemplatesOpen(false);
  }

  // ─── CHAT VIEW ───
  if (chatStudentId && chatStudent) {
    // Group messages by date
    const grouped: { date: string; msgs: LineMessage[] }[] = [];
    chatMessages.forEach(msg => {
      const dateKey = new Date(msg.created_at).toDateString();
      const last = grouped[grouped.length - 1];
      if (last && last.date === dateKey) last.msgs.push(msg);
      else grouped.push({ date: dateKey, msgs: [msg] });
    });

    return (
      <div className="flex flex-col max-w-2xl mx-auto" style={{ height: "calc(100dvh - 130px)" }}>
        {/* Chat header */}
        {(() => {
          const conn = connections.find(c => c.student_id === chatStudentId);
          return (
            <div className="flex items-center gap-3 px-3 py-2.5 flex-shrink-0" style={{ background: LINE_GREEN }}>
              <button onClick={() => { setChatStudentId(null); setMessageText(""); setEditingName(false); }} className="p-1.5 rounded-full hover:bg-white/10" style={{ minHeight: "auto" }}>
                <ArrowLeftIcon className="w-5 h-5 text-white" />
              </button>
              {conn?.picture_url ? (
                <img src={conn.picture_url} alt="" className="w-9 h-9 rounded-full flex-shrink-0 object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {(chatStudent.nick_name || chatStudent.first_name).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <button onClick={() => { sessionStorage.setItem("messaging_returnToChat", chatStudentId!); nav(`/students/${chatStudentId}`); }}
                  className="font-bold text-white text-sm block truncate hover:underline text-left" style={{ minHeight: "auto", background: "none", padding: 0 }}>
                  {chatDisplayName}
                </button>
                <div className="flex items-center gap-1">
                  {editingName ? (
                    <input type="text" value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      onBlur={async () => {
                        if (conn && editNameValue.trim() && editNameValue.trim() !== conn.display_name) {
                          await supabase.from("line_connections").update({ display_name: editNameValue.trim() }).eq("id", conn.id);
                          queryClient.invalidateQueries({ queryKey: ["line_connections"] });
                        }
                        setEditingName(false);
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      autoFocus
                      className="text-[11px] bg-white/20 text-white rounded px-1.5 py-0.5 outline-none w-32"
                      style={{ minHeight: "auto" }} />
                  ) : (
                    <>
                      <span className="text-[10px] text-white/70 truncate">{conn?.display_name || ""}</span>
                      {conn && (
                        <button onClick={() => { setEditingName(true); setEditNameValue(conn.display_name || ""); }}
                          className="p-0.5 rounded hover:bg-white/10" style={{ minHeight: "auto" }}>
                          <PencilSquareIcon className="w-3 h-3 text-white/50" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Chat body */}
        <div className="flex-1 overflow-y-auto px-3 py-4" style={{ background: `linear-gradient(180deg, ${CHAT_BG} 0%, #6B8C9E 100%)` }}>
          {chatMessages.length === 0 ? (
            <div className="text-center py-16">
              <ChatBubbleLeftRightIcon className="w-14 h-14 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.3)" }} />
              <p className="text-sm font-semibold text-white/50">{t("noMessages")}</p>
              <p className="text-xs text-white/40 mt-1">Send a message via LINE</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex justify-center my-4">
                  <span className="text-[10px] font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.15)", color: "rgba(255,255,255,0.8)" }}>
                    {formatChatDate(group.msgs[0].created_at)}
                  </span>
                </div>
                {/* Messages */}
                {group.msgs.map(msg => (
                  <div key={msg.id} className="flex justify-end mb-2">
                    <div className="max-w-[75%] flex items-end gap-1">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] text-white/50">
                          {msg.status === "sent" ? "Read" : msg.status === "queued" ? "Sent" : msg.status}
                        </span>
                        <span className="text-[10px] text-white/50">{formatChatTime(msg.created_at)}</span>
                      </div>
                      <div className="px-3 py-2 rounded-xl rounded-br-sm text-sm text-white shadow-sm" style={{ background: LINE_GREEN }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input bar */}
        <div className="flex items-end gap-2 px-3 py-2 flex-shrink-0" style={{ background: "#f0f0f0", borderTop: "1px solid #ddd" }}>
          <textarea value={messageText}
            onChange={e => setMessageText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
            placeholder={t("writeMessage")} rows={1}
            className="flex-1 rounded-2xl px-4 py-2.5 text-sm resize-none outline-none border-none"
            style={{ background: "#fff", maxHeight: 100 }}
            onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 100) + "px"; }} />
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSendChat}
            disabled={sending || !messageText.trim() || !isConfigured}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 mb-0.5"
            style={{ background: LINE_GREEN }}>
            <PaperAirplaneIcon className="w-5 h-5 text-white" />
          </motion.button>
        </div>
      </div>
    );
  }

  // ─── CHAT LIST VIEW ───
  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto" style={{ background: LINE_BG }}>
      {/* Header */}
      <div className="sticky top-16 z-20 px-4 py-3 flex items-center justify-between" style={{ background: LINE_GREEN }}>
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-6 h-6 text-white" />
          <span className="text-lg font-bold text-white">{t("lineOa")}</span>
          {connections.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
              {connections.length}
            </span>
          )}
        </div>
        {isAdmin && (
          <button onClick={openSettings} className="p-2 rounded-full hover:bg-white/10 transition" style={{ minHeight: "auto" }}>
            <Cog6ToothIcon className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ background: "#fff", borderBottom: "1px solid #e8e8e8" }}>
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border-none outline-none"
            style={{ background: "#f0f0f0" }} />
        </div>
      </div>

      {/* Setup warning */}
      {(!config || !isConfigured) && (
        <div className="mx-3 mt-3 p-3 rounded-xl flex items-center gap-2" style={{ background: "#FFF3CD", border: "1px solid #FFD97D" }}>
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" style={{ color: "#B8860B" }} />
          <span className="text-xs font-semibold" style={{ color: "#B8860B" }}>{t("lineSetupRequired")}</span>
        </div>
      )}

      {/* Unlinked LINE Accounts */}
      {isAdmin && (
        <div className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
          <button onClick={() => setUnlinkedExpanded(!unlinkedExpanded)}
            className="w-full px-4 py-3 flex items-center gap-2 text-left" style={{ background: "#FFF8E1", borderBottom: unlinkedExpanded ? "1px solid #FFE082" : "none" }}>
            <LinkIcon className="w-4 h-4" style={{ color: "#F59E0B" }} />
            <div className="flex-1">
              <span className="text-sm font-bold" style={{ color: "#92400E" }}>{t("unlinkedLineAccounts")}</span>
              {unlinkedUsers.length > 0 && (
                <span className="text-[10px] font-bold ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "#FDE68A", color: "#92400E" }}>
                  {unlinkedUsers.length}
                </span>
              )}
            </div>
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${unlinkedExpanded ? "rotate-180" : ""}`} style={{ color: "#92400E" }} />
          </button>
          {unlinkedExpanded && (
            <div className="flex justify-end px-4 pt-2" style={{ background: "#FFF8E1" }}>
              <button onClick={handleSyncFollowers} disabled={syncing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition hover:opacity-80"
                style={{ background: "#06C755", color: "#fff" }}>
                <ArrowPathIcon className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? t("syncing") : t("syncFollowers")}
              </button>
            </div>
          )}
          {unlinkedExpanded && unlinkedUsers.length > 0 && (
            <p className="text-[11px] px-4 pt-2 pb-1" style={{ color: "#999" }}>{t("unlinkedLineHint")}</p>
          )}
          {unlinkedExpanded && (<>
          <div className="divide-y" style={{ borderColor: "#f5f5f5" }}>
            {unlinkedUsers.map(u => {
              const selectedSid = linkSelections[u.line_user_id] || "";
              const searchTerm = (unlinkedSearch[u.line_user_id] || "").toLowerCase();
              const isOpen = dropdownOpen === u.line_user_id;
              const availableStudents = students.filter(s => !connectedStudentIds.has(s.id));
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

                    {/* Searchable student dropdown */}
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
                            type="text"
                            autoFocus
                            value={unlinkedSearch[u.line_user_id] || ""}
                            onChange={e => setUnlinkedSearch(prev => ({ ...prev, [u.line_user_id]: e.target.value }))}
                            placeholder={t("searchPlaceholder")}
                            className="px-3 py-2 text-xs border-b outline-none"
                            style={{ borderColor: "#f0f0f0" }}
                          />
                          <div className="overflow-y-auto flex-1">
                            {filteredOpts.length === 0 ? (
                              <p className="text-xs text-center py-3" style={{ color: "#aaa" }}>{t("noStudentsFound")}</p>
                            ) : (
                              filteredOpts.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    setLinkSelections(prev => ({ ...prev, [u.line_user_id]: s.id }));
                                    setDropdownOpen(null);
                                    setUnlinkedSearch(prev => ({ ...prev, [u.line_user_id]: "" }));
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
      )}

      {/* Student chat list */}
      <div className="flex-1 overflow-y-auto">
        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <ChatBubbleLeftRightIcon className="w-16 h-16 mb-3" style={{ color: "#d0d0d0" }} />
            <p className="text-sm font-semibold" style={{ color: "#a0a0a0" }}>
              {search.trim() ? t("noStudentsFound") : t("noLineLinked")}
            </p>
          </div>
        ) : (
          filteredStudents.map(s => {
            const lastMsg = lastMessageMap.get(s.id);
            const displayName = s.nick_name ? `${s.nick_name} (${s.first_name})` : `${s.first_name} ${s.last_name}`;
            const conn = connections.find(c => c.student_id === s.id);

            return (
              <button key={s.id}
                onClick={() => { setChatStudentId(s.id); setMessageText(""); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                style={{ borderBottom: "1px solid #f0f0f0" }}>
                {conn?.picture_url ? (
                  <img src={conn.picture_url} alt="" className="w-12 h-12 rounded-full flex-shrink-0 object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
                    style={{ background: LINE_GREEN }}>
                    {(s.nick_name || s.first_name).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="truncate">
                      <span className="font-semibold text-sm" style={{ color: POS.textPrimary }}>{displayName}</span>
                      {conn?.display_name && (
                        <span className="text-[11px] ml-1.5" style={{ color: "#999" }}>· {conn.display_name}</span>
                      )}
                    </div>
                    <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: "#a0a0a0" }}>
                      {lastMsg ? formatTime(lastMsg.created_at) : ""}
                    </span>
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: "#8e8e8e" }}>
                    {lastMsg ? lastMsg.content : t("lineLinked")}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* FAB for broadcast */}
      <motion.button whileTap={{ scale: 0.9 }}
        onClick={() => { setBroadcastOpen(true); setMessageText(""); }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-30"
        style={{ background: LINE_GREEN, boxShadow: "0 4px 16px rgba(6, 199, 85, 0.4)" }}
        aria-label={t("sendMessage")}>
        <PencilSquareIcon className="w-6 h-6 text-white" />
      </motion.button>

      {/* Broadcast Modal */}
      <Dialog open={broadcastOpen} onClose={() => { setBroadcastOpen(false); setMessageText(""); }} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex flex-col justify-end sm:items-center sm:justify-center">
          <Dialog.Panel className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: LINE_GREEN }}>
              <button onClick={() => setBroadcastOpen(false)} style={{ minHeight: "auto" }}>
                <XMarkIcon className="w-6 h-6 text-white" />
              </button>
              <span className="font-bold text-white">{t("sendMessage")}</span>
              <div className="w-6" />
            </div>
            <div className="p-4 space-y-4">
              <div>
                <span className="text-xs font-semibold block mb-2" style={{ color: POS.textSecondary }}>{t("selectRecipients")}</span>
                <div className="flex gap-2">
                  {([
                    { key: "all" as const, icon: UserGroupIcon, label: t("allParents") },
                    { key: "course" as const, icon: AcademicCapIcon, label: t("byCourse") },
                  ]).map(opt => (
                    <button key={opt.key} onClick={() => setRecipientMode(opt.key)}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] font-bold transition-all"
                      style={{ background: recipientMode === opt.key ? LINE_GREEN : "#f5f5f5", color: recipientMode === opt.key ? "#fff" : "#888" }}>
                      <opt.icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {recipientMode === "course" && (
                <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: "#e0e0e0" }}>
                  <option value="">{t("selectCourse")}</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: LINE_GREEN }}>
                <UserGroupIcon className="w-3.5 h-3.5" />
                {t("recipients")}: {broadcastRecipientIds.length}
              </div>
              <div className="flex items-end gap-2">
                <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                  placeholder={t("writeMessage")} rows={2}
                  className="flex-1 rounded-2xl border px-4 py-2.5 text-sm resize-none"
                  style={{ borderColor: "#e0e0e0", background: "#f5f5f5" }} />
                <motion.button whileTap={{ scale: 0.9 }} onClick={sendBroadcast}
                  disabled={sending || !messageText.trim() || broadcastRecipientIds.length === 0 || !isConfigured}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  style={{ background: LINE_GREEN }}>
                  <PaperAirplaneIcon className="w-5 h-5 text-white" />
                </motion.button>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-5 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: LINE_GREEN }}>
                <ChatBubbleLeftRightIcon className="w-5 h-5 inline mr-2" />
                LINE OA {t("settings")}
              </h2>
              <button onClick={() => setSettingsOpen(false)} style={{ minHeight: "auto" }}>
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
                {/* Webhook URL */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#666" }}>{t("webhookUrl")}</label>
                  <p className="text-[10px] mb-1.5" style={{ color: "#999" }}>{t("webhookUrlHint")}</p>
                  <div className="flex gap-2">
                    <input type="text" readOnly
                      value={`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${user?.school_id || ""}`}
                      className="flex-1 border rounded-lg px-3 py-2 text-[11px] font-mono truncate" style={{ borderColor: "#e0e0e0", background: "#f9f9f9" }} />
                    <button onClick={() => {
                      navigator.clipboard.writeText(`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${user?.school_id || ""}`);
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
              <button onClick={() => { setEditTemplates(config.message_templates || {} as MessageTemplates); setTemplatesOpen(true); setSettingsOpen(false); }}
                className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold border"
                style={{ borderColor: LINE_GREEN, color: LINE_GREEN }}>
                {t("editMessageTemplates")}
              </button>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSettingsOpen(false)} className="flex-1 py-2.5 rounded-lg border font-bold text-sm"
                style={{ borderColor: "#e0e0e0", color: "#888" }}>{t("cancel")}</button>
              <button onClick={handleSaveConfig} disabled={savingConfig || !configForm.channel_id || !configForm.channel_token}
                className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-50"
                style={{ background: LINE_GREEN }}>
                {savingConfig ? t("saving") : t("saveLineConfig")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Message Templates Modal */}
      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-5 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: LINE_GREEN }}>{t("editMessageTemplates")}</h2>
              <button onClick={() => setTemplatesOpen(false)} style={{ minHeight: "auto" }}>
                <XMarkIcon className="w-6 h-6" style={{ color: "#999" }} />
              </button>
            </div>
            <p className="text-[11px] mb-4" style={{ color: "#999" }}>{t("templateHint")}</p>
            {editTemplates && (
              <div className="space-y-4">
                {([
                  { key: "checkin" as const, label: t("autoCheckInNotify"), vars: "{{name}}, {{course}}, {{time}}" },
                  { key: "renewal_approaching" as const, label: t("autoLimitNotify"), vars: "{{name}}, {{course}}, {{used}}, {{purchased}}, {{remaining}}" },
                  { key: "overlimit" as const, label: t("autoRenewalReminder"), vars: "{{name}}, {{course}}, {{used}}, {{purchased}}" },
                  { key: "enrollment" as const, label: t("enrollmentNotify"), vars: "{{name}}, {{course}}, {{purchased}}, {{school}}" },
                  { key: "approval" as const, label: t("approvalNotify"), vars: "{{name}}, {{course}}, {{added}}" },
                  { key: "link_welcome" as const, label: t("autoLinkNotify"), vars: "{{name}}" },
                ]).map(tpl => (
                  <div key={tpl.key}>
                    <label className="text-xs font-bold block mb-1" style={{ color: POS.textPrimary }}>{tpl.label}</label>
                    <p className="text-[10px] mb-1" style={{ color: "#bbb" }}>{tpl.vars}</p>
                    <textarea
                      value={editTemplates[tpl.key] || ""}
                      onChange={e => setEditTemplates(prev => prev ? { ...prev, [tpl.key]: e.target.value } : prev)}
                      rows={4}
                      className="w-full border rounded-lg px-3 py-2 text-xs resize-none"
                      style={{ borderColor: "#e0e0e0", lineHeight: 1.5 }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setTemplatesOpen(false)} className="flex-1 py-2.5 rounded-lg border font-bold text-sm"
                style={{ borderColor: "#e0e0e0", color: "#888" }}>{t("cancel")}</button>
              <button onClick={handleSaveTemplates} disabled={savingTemplates}
                className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-50"
                style={{ background: LINE_GREEN }}>
                {savingTemplates ? t("saving") : t("save")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
