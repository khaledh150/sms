import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  ArrowLeftIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { formatChatTime, formatChatDate } from "./utils";
import type { LineMessage, LineConnection, StudentBasic } from "./types";
import { LINE_GREEN, CHAT_BG } from "./types";

interface Props {
  studentId: string;
  student: StudentBasic;
  messages: LineMessage[];
  connections: LineConnection[];
  isConfigured: boolean;
  onBack: () => void;
}

export default function ChatView({ studentId, student, messages, connections, isConfigured, onBack }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const displayName = student.nick_name ? `${student.nick_name} (${student.first_name})` : `${student.first_name} ${student.last_name}`;

  const chatMessages = useMemo(() =>
    messages
      .filter(m => m.recipient_student_ids?.includes(studentId))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  [messages, studentId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  const grouped: { date: string; msgs: LineMessage[] }[] = [];
  chatMessages.forEach(msg => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = grouped[grouped.length - 1];
    if (last && last.date === dateKey) last.msgs.push(msg);
    else grouped.push({ date: dateKey, msgs: [msg] });
  });

  async function handleSend() {
    if (!messageText.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc("queue_line_message", {
      p_message_type: "general",
      p_content: messageText.trim(),
      p_recipient_student_ids: [studentId],
    });
    if (error) toast(error.message, "error");
    else {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["line_messages"] });
    }
    setSending(false);
  }

  const conn = connections.find(c => c.student_id === studentId);

  return (
    <div className="flex flex-col max-w-2xl mx-auto" style={{ height: "calc(100dvh - 130px)" }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-3 py-2.5 flex-shrink-0" style={{ background: LINE_GREEN }}>
        <button onClick={() => { onBack(); setMessageText(""); setEditingName(false); }} className="p-1.5 rounded-full hover:bg-white/10" style={{ minHeight: "auto" }}>
          <ArrowLeftIcon className="w-5 h-5 text-white" />
        </button>
        {conn?.picture_url ? (
          <img src={conn.picture_url} alt="" className="w-9 h-9 rounded-full flex-shrink-0 object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {(student.nick_name || student.first_name).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={() => { sessionStorage.setItem("messaging_returnToChat", studentId); nav(`/students/${studentId}`); }}
            className="font-bold text-white text-sm block truncate hover:underline text-left" style={{ minHeight: "auto", background: "none", padding: 0 }}>
            {displayName}
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
              <div className="flex justify-center my-4">
                <span className="text-[10px] font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.15)", color: "rgba(255,255,255,0.8)" }}>
                  {formatChatDate(group.msgs[0].created_at)}
                </span>
              </div>
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
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t("writeMessage")} rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm resize-none outline-none border-none"
          style={{ background: "#fff", maxHeight: 100 }}
          onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 100) + "px"; }} />
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend}
          disabled={sending || !messageText.trim() || !isConfigured}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 mb-0.5"
          style={{ background: LINE_GREEN }}>
          <PaperAirplaneIcon className="w-5 h-5 text-white" />
        </motion.button>
      </div>
    </div>
  );
}
