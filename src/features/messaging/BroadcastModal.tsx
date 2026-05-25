import { useState, useMemo } from "react";
import { Dialog } from "@headlessui/react";
import {
  PaperAirplaneIcon,
  UserGroupIcon,
  AcademicCapIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import type { StudentBasic } from "./types";
import { LINE_GREEN } from "./types";

interface CourseBasic {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  connectedStudents: StudentBasic[];
  courses: CourseBasic[];
  enrollments: { student_id: string; course_id: string }[];
  isConfigured: boolean;
}

export default function BroadcastModal({ open, onClose, connectedStudents, courses, enrollments, isConfigured }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [recipientMode, setRecipientMode] = useState<"all" | "course">("all");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const recipientIds = useMemo(() => {
    if (recipientMode === "all") return connectedStudents.map(s => s.id);
    if (!selectedCourse) return [];
    const ids = new Set(enrollments.filter(e => e.course_id === selectedCourse).map(e => e.student_id));
    return connectedStudents.filter(s => ids.has(s.id)).map(s => s.id);
  }, [recipientMode, connectedStudents, selectedCourse, enrollments]);

  async function handleSend() {
    if (!messageText.trim() || recipientIds.length === 0) return;
    setSending(true);
    const { error } = await supabase.rpc("queue_line_message", {
      p_message_type: "general",
      p_content: messageText.trim(),
      p_recipient_student_ids: recipientIds,
    });
    if (error) toast(error.message, "error");
    else {
      toast(t("messageSent"), "success");
      setMessageText("");
      onClose();
      queryClient.invalidateQueries({ queryKey: ["line_messages"] });
    }
    setSending(false);
  }

  function handleClose() {
    onClose();
    setMessageText("");
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex flex-col justify-end sm:items-center sm:justify-center">
        <Dialog.Panel className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: LINE_GREEN }}>
            <button onClick={handleClose} style={{ minHeight: "auto" }}>
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
              {t("recipients")}: {recipientIds.length}
            </div>
            <div className="flex items-end gap-2">
              <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                placeholder={t("writeMessage")} rows={2}
                className="flex-1 rounded-2xl border px-4 py-2.5 text-sm resize-none"
                style={{ borderColor: "#e0e0e0", background: "#f5f5f5" }} />
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend}
                disabled={sending || !messageText.trim() || recipientIds.length === 0 || !isConfigured}
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                style={{ background: LINE_GREEN }}>
                <PaperAirplaneIcon className="w-5 h-5 text-white" />
              </motion.button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
