import { useState, memo } from "react";
import {
  PlusIcon, ArrowPathIcon, XMarkIcon, ClockIcon,
  CheckCircleIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthContext";
import { useToast } from "../../hooks/useToast";
import { POS } from "../../theme";
import type { EnrollmentData, CourseData, AttendanceRecord, PendingChange } from "./types";
import ConfirmDialog from "../../components/ConfirmDialog";

interface Props {
  enrollment: EnrollmentData;
  course: CourseData | undefined;
  attendanceRecords: AttendanceRecord[];
  allAttendanceRecords?: AttendanceRecord[];
  pendingReq: PendingChange | undefined;
  studentId: string;
  userRole?: string;
  onRenew: (courseId: string, mode: "renew" | "add") => void;
  onLateCheckIn: (courseId: string) => void;
  onCancel: (enrollmentId: string, courseId: string) => void;
}

export default memo(function CourseEnrollmentCard({
  enrollment, course, attendanceRecords, allAttendanceRecords, pendingReq, studentId,
  userRole, onRenew, onLateCheckIn, onCancel,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [cancelAttendanceId, setCancelAttendanceId] = useState<string | null>(null);
  const isOwner = userRole === "owner" || userRole === "superadmin";
  const displayRecords = allAttendanceRecords || attendanceRecords;

  const used = attendanceRecords.length + (enrollment.initial_used_hours || 0);
  const purchased = enrollment.purchased_hours;
  const remaining = purchased - used;
  const isOverlimit = purchased > 0 && remaining <= 0;
  const isApproaching = purchased > 0 && remaining > 0 && remaining <= 2;

  return (
    <div className="bg-white rounded-2xl border overflow-hidden cursor-pointer"
      style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
      <div className="p-4 flex items-center gap-3" onClick={() => setExpanded(!expanded)}>
        <div className="w-3 h-3 rounded-full shrink-0"
          style={{ background: isOverlimit ? POS.danger : isApproaching ? "#F59E0B" : POS.success }} />
        <div className="flex-1 min-w-0">
          <div className="font-bold" style={{ color: POS.textPrimary }}>
            {course?.name || enrollment.course_id}
          </div>
          <div className="text-xs flex flex-wrap gap-1" style={{ color: POS.textMuted }}>
            {enrollment.schedule && Object.entries(enrollment.schedule).map(([day, times]) => (
              <span key={day}>{day.slice(0, 3)} {(times as string[]).join(", ")}</span>
            ))}
          </div>
          {pendingReq && (
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: POS.warningLight, color: POS.warning }}>
                <ClockIcon className="w-3 h-3" />
                {pendingReq.type === "renewal" ? t("renewalPending") : t("addHoursPending")}
                {" (+"}{ Object.values(pendingReq.changes?.course_limits || {})[0] as number }{" hrs)"}
              </span>
              <button onClick={async (e) => {
                e.stopPropagation();
                await supabase.from("application_changes").delete().eq("id", pendingReq.id);
                toast(t("requestCancelled"), "info");
                queryClient.invalidateQueries({ queryKey: ["pending_changes_student", studentId] });
                queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
              }}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold hover:bg-red-100"
                style={{ color: POS.danger }}>
                {t("cancel")}
              </button>
            </div>
          )}
        </div>
        <div className="text-right mr-2">
          <div className="text-lg font-bold" style={{ color: isOverlimit ? POS.danger : POS.textPrimary }}>
            {used}/{purchased}
          </div>
          <div className="text-xs" style={{ color: POS.textMuted }}>{t("hrs")}</div>
        </div>
        {isOverlimit ? (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
            style={{ background: POS.dangerLight, color: POS.danger }}>
            <ExclamationCircleIcon className="w-3.5 h-3.5" /> {t("renewalNeeded")}
          </span>
        ) : isApproaching ? (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
            style={{ background: POS.warningLight, color: "#D97706" }}>
            <ExclamationCircleIcon className="w-3.5 h-3.5" /> {t("renewalApproaching")}
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
            style={{ background: POS.successLight, color: POS.success }}>
            <CheckCircleIcon className="w-3.5 h-3.5" /> {t("ongoing")}
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          aria-label={expanded ? t("hide") : t("expand")}
          className="p-1" style={{ minHeight: "auto" }}>
          {expanded
            ? <ChevronDownIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
            : <ChevronRightIcon className="w-5 h-5" style={{ color: POS.textMuted }} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: POS.borderLight, background: POS.bgMain }}>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onRenew(enrollment.course_id, "add")}
              disabled={!!pendingReq}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              style={{ background: POS.primary }}>
              <PlusIcon className="w-4 h-4" /> {t("addHours")}
            </button>
            {isOverlimit && (
              <button onClick={() => onRenew(enrollment.course_id, "renew")}
                disabled={!!pendingReq}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                style={{ background: POS.warning }}>
                <ArrowPathIcon className="w-4 h-4" /> {t("renew")}
              </button>
            )}
            <button onClick={() => onLateCheckIn(enrollment.course_id)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: POS.bgSurface, color: POS.primary }}>
              <ClockIcon className="w-4 h-4" /> {t("lateCheckIn")}
            </button>
            <button onClick={() => onCancel(enrollment.id, enrollment.course_id)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: POS.dangerLight, color: POS.danger }}>
              <XMarkIcon className="w-4 h-4" /> {t("cancelCourse")}
            </button>
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: POS.textSecondary }}>
              {t("attendanceHistory")} ({attendanceRecords.length})
            </div>
            {displayRecords.length === 0 ? (
              <p className="text-xs" style={{ color: POS.textMuted }}>{t("noRecords")}</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {displayRecords.map(a => {
                  const isCancelled = !!a.cancelled_by;
                  return (
                    <div key={a.id} className="text-xs py-1.5 px-2 rounded-lg bg-white flex items-center gap-2">
                      <span style={{ textDecoration: isCancelled ? "line-through" : "none", color: isCancelled ? POS.textMuted : POS.textPrimary, flex: 1 }}>
                        {new Date(a.attended_at_ts).toLocaleString("en-GB", {
                          weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                        })}
                        {isCancelled && <span style={{ color: POS.danger, marginLeft: 6 }}>{t("cancelled")}</span>}
                      </span>
                      {!isCancelled && isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancelAttendanceId(a.id);
                          }}
                          className="p-0.5 rounded hover:bg-red-50"
                          title={t("cancelAttendance")}
                        >
                          <XMarkIcon className="w-3.5 h-3.5" style={{ color: POS.danger }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!cancelAttendanceId}
        onClose={() => setCancelAttendanceId(null)}
        onConfirm={async () => {
          if (!cancelAttendanceId) return;
          const { error } = await supabase.from("attendance").update({
            cancelled_by: user!.id, cancelled_at: new Date().toISOString(),
          }).eq("id", cancelAttendanceId);
          setCancelAttendanceId(null);
          if (error) { toast(error.message, "error"); return; }
          toast(t("attendanceCancelled"), "success");
          queryClient.invalidateQueries({ queryKey: ["studentAttendance", studentId] });
        }}
        message={t("confirmCancelAttendance")}
        confirmLabel={t("cancelAttendance")}
        variant="danger"
      />
    </div>
  );
});
