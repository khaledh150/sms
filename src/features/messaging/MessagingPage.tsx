import { useState, useMemo, useEffect } from "react";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import { useAuth } from "../../AuthContext";
import { useCourses } from "../../hooks/useCourses";
import { useStudents } from "../../hooks/useStudents";
import { useTranslation } from "react-i18next";

import { useLineConfig, useLineMessages, useLineConnections, useEnrollments, useUnlinkedLineUsers } from "./hooks";
import ChatView from "./ChatView";
import ChatListItem from "./ChatListItem";
import UnlinkedAccountsSection from "./UnlinkedAccountsSection";
import BroadcastModal from "./BroadcastModal";
import SettingsModal from "./SettingsModal";
import TemplatesModal from "./TemplatesModal";
import { LINE_GREEN, LINE_BG } from "./types";

export default function MessagingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const { data: config } = useLineConfig();
  const { data: messages = [] } = useLineMessages();
  const { data: connections = [] } = useLineConnections();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useStudents(false);
  const { data: enrollments = [] } = useEnrollments();
  const { data: unlinkedUsers = [] } = useUnlinkedLineUsers();

  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [chatStudentId, setChatStudentId] = useState<string | null>(null);

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
    const m = new Map<string, typeof messages[0]>();
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

  // Chat view
  if (chatStudentId && chatStudent) {
    return (
      <ChatView
        studentId={chatStudentId}
        student={chatStudent}
        messages={messages}
        connections={connections}
        isConfigured={isConfigured}
        onBack={() => setChatStudentId(null)}
      />
    );
  }

  // Chat list view
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
          <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-full hover:bg-white/10 transition" style={{ minHeight: "auto" }}>
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
        <UnlinkedAccountsSection
          unlinkedUsers={unlinkedUsers}
          students={students}
          connectedStudentIds={connectedStudentIds}
          config={config ?? null}
        />
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
          filteredStudents.map(s => (
            <ChatListItem
              key={s.id}
              student={s}
              lastMessage={lastMessageMap.get(s.id)}
              connection={connections.find(c => c.student_id === s.id)}
              onClick={() => setChatStudentId(s.id)}
            />
          ))
        )}
      </div>

      {/* FAB for broadcast */}
      <motion.button whileTap={{ scale: 0.9 }}
        onClick={() => setBroadcastOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-30"
        style={{ background: LINE_GREEN, boxShadow: "0 4px 16px rgba(6, 199, 85, 0.4)" }}
        aria-label={t("sendMessage")}>
        <PencilSquareIcon className="w-6 h-6 text-white" />
      </motion.button>

      {/* Modals */}
      <BroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        connectedStudents={connectedStudents}
        courses={courses}
        enrollments={enrollments}
        isConfigured={isConfigured}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config ?? null}
        schoolId={user?.school_id || ""}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />

      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        config={config ?? null}
      />
    </div>
  );
}
