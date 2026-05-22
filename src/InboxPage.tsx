import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon, XMarkIcon, BellIcon, ClipboardDocumentCheckIcon,
  DocumentIcon, ArrowPathIcon, PencilSquareIcon, UserPlusIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { usePendingApplications, usePendingChanges } from "./hooks/useApplications";
import { useCourses } from "./hooks/useCourses";
import {
  approveApplications, approveChanges, rejectApplications, rejectChanges,
} from "./services/applications";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import { parseCourseLimit } from "./utils";

interface Noti {
  id: string; student_id: string | null; type: string;
  payload: Record<string, any>; read: boolean; created_at: string;
}

function prettyNoti(n: Noti, t: (k: string, p?: any) => string) {
  switch (n.type) {
    case "new_application": return t("newApplication", { name: n.payload.name || `${n.payload.first} ${n.payload.last}` });
    case "course_limit": case "renewal_needed": return t("courseLimitReached", { name: n.payload.student_name || "Student" });
    case "overlimit": return t("overlimitNoti", { used: n.payload.used, purchased: n.payload.purchased });
    case "edit_request": return t("editRequestFrom", { name: n.payload.student_name || "Student" });
    default: return n.type.replace(/_/g, " ");
  }
}

// Fetch student names for change requests that don't have them inline
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
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"approvals" | "notifications">("approvals");

  const { data: pendingApps = [] } = usePendingApplications();
  const { data: pendingChanges = [] } = usePendingChanges();
  const { data: courses = [] } = useCourses();
  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c.name])), [courses]);

  // Resolve student names for changes
  const changeStudentIds = useMemo(() =>
    [...new Set(pendingChanges.map(c => c.student_id).filter(Boolean))], [pendingChanges]);
  const { data: studentNameMap = {} } = useStudentNames(changeStudentIds);

  const [notifs, setNotifs] = useState<Noti[]>([]);
  const [notiLoading, setNotiLoading] = useState(true);

  useEffect(() => {
    supabase.from("notifications").select("id,student_id,type,payload,read,created_at")
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { setNotifs((data ?? []) as Noti[]); setNotiLoading(false); });
  }, []);

  const markRead = async (n: Noti) => {
    if (n.read) return;
    setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x));
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
  };

  async function handleApproveApps(ids: string[]) {
    if (!confirm(t("approveConfirm", { count: ids.length }))) return;
    await approveApplications(ids);
    queryClient.invalidateQueries({ queryKey: ["applications", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["review_count"] });
  }
  async function handleApproveChanges(ids: string[]) {
    if (!confirm(t("approveConfirm", { count: ids.length }))) return;
    await approveChanges(ids);
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["review_count"] });
  }
  async function handleRejectApps(ids: string[]) {
    if (!confirm(t("rejectConfirm", { count: ids.length }))) return;
    await rejectApplications(ids);
    queryClient.invalidateQueries({ queryKey: ["applications", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["review_count"] });
  }
  async function handleRejectChanges(ids: string[]) {
    if (!confirm(t("rejectConfirm", { count: ids.length }))) return;
    await rejectChanges(ids);
    queryClient.invalidateQueries({ queryKey: ["application_changes", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["review_count"] });
  }

  const totalPending = pendingApps.length + pendingChanges.length;
  const unreadNotifs = notifs.filter(n => !n.read).length;

  // Helper to extract change details
  function getChangeDetails(ch: any) {
    const details: { course: string; days: string; hours: number }[] = [];
    const changes = ch.changes || {};
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

  function getReceipts(ch: any): string[] {
    return ch.changes?.receipts || ch.receipt_urls || ch.payment_receipt_urls || [];
  }

  function getStudentName(ch: any): string {
    if (ch.nickname || ch.first_name) return `${ch.nickname || ""} ${ch.first_name || ""} ${ch.last_name || ""}`.trim();
    const s = studentNameMap[ch.student_id];
    if (s) return `${s.nick_name ? `"${s.nick_name}" ` : ""}${s.first_name} ${s.last_name}`;
    return "Unknown Student";
  }

  const typeConfig: Record<string, { icon: any; label: string; bg: string; color: string }> = {
    edit: { icon: PencilSquareIcon, label: t("addCourseType"), bg: POS.infoLight, color: POS.info },
    renewal: { icon: ArrowPathIcon, label: t("renewalType"), bg: POS.warningLight, color: POS.warning },
    cancel: { icon: XMarkIcon, label: t("cancellationType"), bg: POS.dangerLight, color: POS.danger },
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "approvals" as const, icon: ClipboardDocumentCheckIcon, label: t("approvals"), count: totalPending },
          { key: "notifications" as const, icon: BellIcon, label: t("notifications"), count: unreadNotifs },
        ].map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-base transition-all"
            style={{
              background: tab === tb.key ? POS.primary : POS.bgCard,
              color: tab === tb.key ? POS.textOnPrimary : POS.textSecondary,
              boxShadow: tab === tb.key ? POS.shadowMd : "none",
              border: tab === tb.key ? "none" : `1px solid ${POS.border}`,
            }}>
            <tb.icon className="w-5 h-5" />
            {tb.label}
            {tb.count > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: tab === tb.key ? "rgba(255,255,255,0.3)" : POS.danger, color: "#fff" }}>
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "approvals" ? (
          <motion.div key="approvals" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">

            {/* === NEW APPLICATIONS === */}
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
                        {/* Header */}
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

                          {/* Courses requested */}
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

                          {/* Receipts */}
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

                        {/* Actions */}
                        <div className="flex border-t" style={{ borderColor: POS.borderLight }}>
                          <button onClick={() => handleApproveApps([app.id])}
                            className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                            style={{ color: POS.success, minHeight: POS.touchComfortable }}>
                            <CheckIcon className="w-5 h-5" /> {t("approve")}
                          </button>
                          <div className="w-px" style={{ background: POS.borderLight }} />
                          <button onClick={() => handleRejectApps([app.id])}
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

            {/* === CHANGES (Renewals, Course Edits) === */}
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
                          {/* Type badge + student name */}
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

                          {/* Change details */}
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

                          {/* Receipts */}
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

                        {/* Actions */}
                        <div className="flex border-t" style={{ borderColor: POS.borderLight }}>
                          <button onClick={() => handleApproveChanges([ch.id])}
                            className="flex-1 py-3 text-center font-bold text-sm flex items-center justify-center gap-1"
                            style={{ color: POS.success, minHeight: POS.touchComfortable }}>
                            <CheckIcon className="w-5 h-5" /> {t("approve")}
                          </button>
                          <div className="w-px" style={{ background: POS.borderLight }} />
                          <button onClick={() => handleRejectChanges([ch.id])}
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
          </motion.div>
        ) : (
          <motion.div key="notifications" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
            {notiLoading ? <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("loading")}</p>
              : notifs.filter(n => !n.read).length === 0 && notifs.length === 0 ? (
                <div className="text-center py-16">
                  <BellIcon className="w-16 h-16 mx-auto mb-4" style={{ color: POS.primaryLight }} />
                  <p className="text-lg font-semibold" style={{ color: POS.textSecondary }}>{t("noNotifications")}</p>
                </div>
              ) : (<>
                {/* Actions */}
                {notifs.some(n => !n.read) && (
                  <button onClick={async () => {
                    const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
                    setNotifs(p => p.map(n => ({ ...n, read: true })));
                    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
                  }} className="mb-3 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: POS.bgSurface, color: POS.primary }}>
                    {t("markAllRead")}
                  </button>
                )}
                {notifs.some(n => n.read) && (
                  <button onClick={async () => {
                    const readIds = notifs.filter(n => n.read).map(n => n.id);
                    setNotifs(p => p.filter(n => !n.read));
                    await supabase.from("notifications").delete().in("id", readIds);
                  }} className="mb-3 ml-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: POS.dangerLight, color: POS.danger }}>
                    {t("clearRead")}
                  </button>
                )}
                {notifs.filter(n => !n.read).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm" style={{ color: POS.textMuted }}>{t("allCaughtUpRead")}</p>
                  </div>
                ) : null}
              {notifs.filter(n => !n.read).map(n => (
                <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-4 cursor-pointer transition-all"
                  style={{ background: POS.bgSurface, border: `1px solid ${POS.borderPurple}`, boxShadow: POS.shadowSm }}
                  onClick={() => { markRead(n); if (n.student_id) nav(`/students/${n.student_id}`); }}>
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: POS.textPrimary }}>{prettyNoti(n, t)}</p>
                      <p className="text-xs mt-1" style={{ color: POS.textMuted }}>{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); markRead(n); }}
                      className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: POS.bgSurface, color: POS.primary }}>
                      {t("markRead")}
                    </button>
                  </div>
                </motion.div>
              ))}
              </>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
