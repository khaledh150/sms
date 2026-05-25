import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { POS } from "../../theme";
import type { StudentData, CourseData } from "./types";

interface Props {
  target: { enrollmentId: string; courseId: string } | null;
  onClose: () => void;
  student: StudentData;
  courseMap: Record<string, CourseData>;
  isAdmin: boolean;
  userId: string;
}

export default function CancelCourseModal({ target, onClose, student, courseMap, isAdmin, userId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  const courseName = target ? (courseMap[target.courseId]?.name || target.courseId) : "";

  async function handleConfirm() {
    if (!target) return;
    setCancelling(true);

    if (isAdmin) {
      await supabase.from("enrollments").update({
        status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId || null
      }).eq("id", target.enrollmentId);
      toast(t("courseCancelled", { course: courseName }), "success");
      queryClient.invalidateQueries({ queryKey: ["enrollments", student.id] });
    } else {
      await supabase.from("application_changes").insert({
        student_id: student.id,
        type: "cancel_course",
        status: "pending",
        changes: { enrollment_id: target.enrollmentId, course_id: target.courseId, course_name: courseName },
        submitted_by: userId,
        nickname: student.nick_name || null,
        first_name: student.first_name,
        last_name: student.last_name,
      });
      await supabase.from("notifications").insert({
        student_id: student.id,
        type: "cancel_request",
        payload: { course_name: courseName, student_name: student.nick_name || student.first_name },
      });
      toast(t("cancelRequestSent"), "success");
      queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
    }

    setCancelling(false);
    onClose();
  }

  return (
    <Dialog open={!!target} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-[2rem] p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
          <XMarkIcon className="w-12 h-12 mx-auto mb-4" style={{ color: POS.danger }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: POS.textPrimary }}>
            {t("cancelCourse")}
          </h2>
          <p className="text-sm mb-1 font-semibold" style={{ color: POS.primary }}>
            {courseName}
          </p>
          <p className="text-sm mb-6" style={{ color: POS.textMuted }}>
            {isAdmin ? t("confirmCancelCourseAdmin") : t("confirmCancelCourseStaff")}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleConfirm} disabled={cancelling}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.danger }}>
              {cancelling ? t("loading") : isAdmin ? t("cancelCourse") : t("sendRequest")}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
