import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@headlessui/react";
import {
  CheckIcon, XMarkIcon, ClipboardDocumentCheckIcon,
  DocumentIcon, ArrowPathIcon, PencilSquareIcon, UserPlusIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { usePendingApplications, usePendingChanges } from "./hooks/useApplications";
import { useCourses } from "./hooks/useCourses";
import {
  approveApplications, approveChanges, rejectApplications, rejectChanges,
} from "./services/applications";
import type { ApplicationChange } from "./services/applications";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import { parseCourseLimit } from "./utils";
import { useToast } from "./hooks/useToast";

function useStudentNames(studentIds: string[]) {
  return useQuery({
    queryKey: ["student_names", ...studentIds],
    queryFn: async () => {
      if (!studentIds.length) return {};
      const { data } = await supabase.from("students")
        .select("id,first_name,last_name,nick_name").in("id", studentIds);
      const map: Record<string, { first_name: string; last_name: string; nick_name: string | null }> = {};
      (data ?? []).forEach((s: any) => { map[s.id] = s; });
      return map;
    },
    enabled: studentIds.length > 0,
    staleTime: 300_000,
  });
}

export default function InboxPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; message: string } | null>(null);

  const { data: pendingApps = [] } = usePendingApplications();
  const { data: pendingChanges = [] } = usePendingChanges();
  const { data: courses = [] } = useCourses();
  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c.name])), [courses]);

  const changeStudentIds = useMemo(() =>
    [...new Set(pendingChanges.map(c => c.student_id).filter(Boolean))], [pendingChanges]);
  const { data: studentNameMap = {} } = useStudentNames(changeStudentIds);

  async function handleApproveApps(ids: string[]) {
    setConfirmAction({
      message: t("approveConfirm", { count: ids.length }),
      action: async () => {
        await approveApplications(ids);
        queryClient.invalidateQueries({ queryKey: ["applications", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["review_count"] });
        toast(t("approved"), "success");
      },
    });
  }
  async function handleApproveChanges(ids: string[]) {
    setConfirmAction({
      message: t("approveConfirm", { count: ids.length }),
      action: async () => {
        await approveChanges(ids);
        queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["review_count"] });
        toast(t("approved"), "success");
      },
    });
  }
  async function handleRejectApps(ids: string[]) {
    setConfirmAction({
      message: t("rejectConfirm", { count: ids.length }),
      action: async () => {
        await rejectApplications(ids);
        queryClient.invalidateQueries({ queryKey: ["applications", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["review_count"] });
        toast(t("rejected"), "success");
      },
    });
  }
  async function handleRejectChanges(ids: string[]) {
    setConfirmAction({
      message: t("rejectConfirm", { count: ids.length }),
      action: async () => {
        await rejectChanges(ids);
        queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["review_count"] });
        toast(t("rejected"), "success");
      },
    });
  }

  const totalPending = pendingApps.length + pendingChanges.length;

  function getChangeDetails(ch: ApplicationChange) {
    const details: { course: string; days: string; hours: number }[] = [];
    const changes = (ch.changes || {}) as Record<string, any>;
    if (ch.type === "edit" && changes.course_changes) {
      Object.entries(changes.course_changes).forEach(([cid, days]: any) => {
        const dayStr = Object.entries(days).map(([d, times]: any) =>
          `${d}: ${(Array.isArray(times) ? times : []).join(", ")}`
        ).join(" | ");
        details.push({ course: courseMap[cid] || cid, days: dayStr, hours: parseCourseLimit(changes.course_limits?.[cid]) });
      });
    } else if (ch.type === "renewal" && changes.course_limits) {
      Object.entries(changes.course_limits).forEach(([cid, hrs]: any) => {
        details.push({ course: courseMap[cid] || cid, days: "", hours: parseCourseLimit(hrs) });
      });
    }
    return details;
  }

  function getReceipts(ch: Record<string, any>): string[] {
    return ch.changes?.receipts || ch.receipt_urls || ch.payment_receipt_urls || [];
  }

  function getStudentName(ch: Record<string, any>): string {
    if (ch.nickname || ch.first_name) return `${ch.nickname || ""} ${ch.first_name || ""} ${ch.last_name || ""}`.trim();
    const s = studentNameMap[ch.student_id];
    if (s) return `${s.nick_name ? `"${s.nick_name}" ` : ""}${s.first_name} ${s.last_name}`;
    return "Unknown Student";
  }

  const typeConfig: Record<string, { icon: React.ElementType; label: string; bg: string; color: string }> = {
    edit: { icon: PencilSquareIcon, label: t("addCourseType"), bg: POS.infoLight, color: POS.info },
    renewal: { icon: ArrowPathIcon, label: t("renewalType"), bg: POS.warningLight, color: POS.warning },
    cancel: { icon: XMarkIcon, label: t("cancellationType"), bg: POS.dangerLight, color: POS.danger },
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bouncy mb-5 flex items-center gap-2" style={{ color: POS.textPrimary }}>
        <ClipboardDocumentCheckIcon className="w-7 h-7" style={{ color: POS.primary }} />
        {t("approvals")}
        {totalPending > 0 && (
          <span className="ml-2 px-3 py-1 rounded-full text-sm font-bold text-white" style={{ background: POS.danger }}>
            {totalPending}
          </span>
        )}
      </h1>

      <div className="space-y-4">
        {/* NEW APPLICATIONS */}
        {pendingApps.length > 0 && (
          <section>
            <h3 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: POS.primary }}>
              <UserPlusIcon className="w-5 h-5" /> {t("newApplications")} ({pendingApps.length})
            </h3>
            <div className="space-y-3">
              {pendingApps.map(app => {
                const receipts = app.payment_receipt_urls || [];
                return (
                  <div key={app.id} className="rounded-2xl bg-white border overflow-hidden"
                    style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowSm }}>
                    <div className="p-4 pb-2">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ background: POS.primary }}>
                          {(app.nick_name || app.first_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold" style={{ color: POS.textPrimary }}>
                            {app.nick_name ? `"${app.nick_name}" ` : ""}{app.first_name} {app.last_name}
                          </div>
                          <div className="text-xs" style={{ color: POS.textMuted }}>
                            {app.parent_phone ? t("phonePrefixed", { phone: app.parent_phone }) : ""}
                            {app.dob ? ` | ${t("dobPrefixed", { dob: new Date(app.dob).toLocaleDateString("en-GB") })}` : ""}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: POS.successLight, color: POS.success }}>
                          {t("newStudentBadge")}
                        </span>
                      </div>

                      <div className="space-y-1 mb-2">
                        {Object.entries(app.courses || {}).map(([cid, days]: any) => (
                          <div key={cid} className="rounded-lg p-2" style={{ background: POS.bgMain }}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm" style={{ color: POS.primary }}>{courseMap[cid] || cid}</span>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: POS.bgSurface, color: POS.primary }}>
                                {parseCourseLimit(app.course_limits?.[cid])} hrs
                              </span>
                            </div>
                            {days && typeof days === "object" && Object.entries(days).map(([day, times]: any) => (
                              <div key={day} className="text-xs mt-0.5" style={{ color: POS.textSecondary }}>
                                {day}: {(Array.isArray(times) ? times : []).join(", ")}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      {receipts.length > 0 && (
                        <div className="flex gap-2 mb-2 overflow-x-auto">
                          {receipts.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border flex items-center justify-center"
                              style={{ borderColor: POS.border, background: POS.bgMain }}>
                              {url.match(/\.(jpg|jpeg|png|gif|webp)/i)
                                ? <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                                : <DocumentIcon className="w-6 h-6" style={{ color: POS.textMuted }} />}
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="text-xs" style={{ color: POS.textMuted }}>
                        {t("submittedDate", { date: new Date(app.created_at).toLocaleString() })}
                      </div>
                    </div>

                    <div className="flex border-t" style={{ borderColor: POS.borderLight }}>
                      <button onClick={() => handleApproveApps([app.id])}
                        aria-label={t("approve")}
                        className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                        style={{ color: POS.success, minHeight: POS.touchComfortable }}>
                        <CheckIcon className="w-5 h-5" /> {t("approve")}
                      </button>
                      <div className="w-px" style={{ background: POS.borderLight }} />
                      <button onClick={() => handleRejectApps([app.id])}
                        aria-label={t("reject")}
                        className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                        style={{ color: POS.danger, minHeight: POS.touchComfortable }}>
                        <XMarkIcon className="w-5 h-5" /> {t("reject")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* CHANGES (Renewals, Course Edits) */}
        {pendingChanges.length > 0 && (
          <section>
            <h3 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: POS.primary }}>
              <ArrowPathIcon className="w-5 h-5" /> {t("renewals")} & {t("courseChanges")} ({pendingChanges.length})
            </h3>
            <div className="space-y-3">
              {pendingChanges.map(ch => {
                const tc = typeConfig[ch.type] || typeConfig.edit;
                const TypeIcon = tc.icon;
                const details = getChangeDetails(ch);
                const receipts = getReceipts(ch);
                const studentName = getStudentName(ch);

                return (
                  <div key={ch.id} className="rounded-2xl bg-white border overflow-hidden"
                    style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowSm }}>
                    <div className="p-4 pb-2">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tc.bg }}>
                          <TypeIcon className="w-5 h-5" style={{ color: tc.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold" style={{ color: POS.textPrimary }}>{studentName}</div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.color }}>
                            {tc.label}
                          </span>
                        </div>
                      </div>

                      {details.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {details.map((d, i) => (
                            <div key={i} className="rounded-lg p-2" style={{ background: POS.bgMain }}>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm" style={{ color: POS.primary }}>{d.course}</span>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: POS.bgSurface, color: POS.primary }}>
                                  {d.hours} hrs
                                </span>
                              </div>
                              {d.days && <div className="text-xs mt-0.5" style={{ color: POS.textSecondary }}>{d.days}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {receipts.length > 0 && (
                        <div className="flex gap-2 mb-2 overflow-x-auto">
                          {receipts.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border flex items-center justify-center"
                              style={{ borderColor: POS.border, background: POS.bgMain }}>
                              {url.match(/\.(jpg|jpeg|png|gif|webp)/i)
                                ? <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                                : <DocumentIcon className="w-6 h-6" style={{ color: POS.textMuted }} />}
                            </a>
                          ))}
                        </div>
                      )}
                      {receipts.length === 0 && (
                        <div className="flex items-center gap-1 mb-2 text-xs px-2 py-1 rounded-lg" style={{ background: POS.warningLight, color: POS.warning }}>
                          <PhotoIcon className="w-4 h-4" /> {t("noReceiptAttached")}
                        </div>
                      )}

                      <div className="text-xs" style={{ color: POS.textMuted }}>
                        {t("submittedDate", { date: new Date(ch.created_at).toLocaleString() })}
                      </div>
                    </div>

                    <div className="flex border-t" style={{ borderColor: POS.borderLight }}>
                      <button onClick={() => handleApproveChanges([ch.id])}
                        aria-label={t("approve")}
                        className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                        style={{ color: POS.success, minHeight: POS.touchComfortable }}>
                        <CheckIcon className="w-5 h-5" /> {t("approve")}
                      </button>
                      <div className="w-px" style={{ background: POS.borderLight }} />
                      <button onClick={() => handleRejectChanges([ch.id])}
                        aria-label={t("reject")}
                        className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                        style={{ color: POS.danger, minHeight: POS.touchComfortable }}>
                        <XMarkIcon className="w-5 h-5" /> {t("reject")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {totalPending === 0 && (
          <div className="text-center py-16">
            <ClipboardDocumentCheckIcon className="w-16 h-16 mx-auto mb-4" style={{ color: POS.primaryLight }} />
            <p className="text-lg font-semibold" style={{ color: POS.textSecondary }}>{t("allCaughtUpApprovals")}</p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmAction !== null} onClose={() => setConfirmAction(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 w-full max-w-sm mx-auto" style={{ boxShadow: POS.shadowXl }}>
            <Dialog.Title className="text-lg font-bold mb-3" style={{ color: POS.textPrimary }}>
              {t("confirm")}
            </Dialog.Title>
            <p className="text-sm mb-6" style={{ color: POS.textSecondary }}>
              {confirmAction?.message}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>
                {t("cancel")}
              </button>
              <button onClick={async () => {
                if (confirmAction) {
                  await confirmAction.action();
                  setConfirmAction(null);
                }
              }}
                className="flex-1 py-3 rounded-xl text-white font-bold"
                style={{ background: POS.primary }}>
                {t("confirm")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
