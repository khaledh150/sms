import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, Disclosure } from "@headlessui/react";
import { supabase, SUPABASE_FUNCTIONS_URL } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { PlusCircleIcon, XMarkIcon, PencilIcon, TrashIcon, ClipboardDocumentListIcon, UsersIcon, ChevronDownIcon, ChatBubbleLeftRightIcon, KeyIcon, LinkIcon, BellAlertIcon, QrCodeIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { ClipboardDocumentIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "./hooks/useToast";
import { POS } from "./theme";

import type { Profile, AuditEntry } from "./types";
import { timeAgo } from "./utils/time";

const LINE_GREEN = "#06C755";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.role === "owner" || user?.role === "superadmin";
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMail, setInviteMail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePw, setInvitePw] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");
  const [inviting, setInviting] = useState(false);
  const [editRow, setEditRow] = useState<Profile | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"team" | "log" | "line">("team");
  const queryClient = useQueryClient();

  const [logEntries, setLogEntries] = useState<AuditEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logOffset, setLogOffset] = useState(0);
  const [logHasMore, setLogHasMore] = useState(true);
  const [logFilter, setLogFilter] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const LOG_PAGE = 50;

  const [nameCache, setNameCache] = useState<{ students: Map<string, string>; courses: Map<string, string> }>({ students: new Map(), courses: new Map() });

  // LINE Config state
  const { data: lineConfig, refetch: refetchLineConfig } = useQuery({
    queryKey: ["line_config_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("line_config").select("*").limit(1).maybeSingle();
      return data as { id: string; channel_id: string; secrets_configured: boolean; auto_checkin_notify: boolean; auto_limit_notify: boolean; auto_renewal_reminder: boolean; auto_link_notify: boolean; payment_qr_url: string | null } | null;
    },
    staleTime: 60_000,
  });
  const [lineForm, setLineForm] = useState({ channel_id: "", channel_secret: "", channel_token: "" });
  const [savingLine, setSavingLine] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const fetchLogs = useCallback(async (offset = 0, filter = "") => {
    setLogLoading(true);
    let query = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).range(offset, offset + LOG_PAGE - 1);
    if (filter) query = query.eq("action", filter);
    const { data, error: logErr } = await query;
    if (logErr) { setErr(logErr.message); setLogLoading(false); return; }
    const entries = (data ?? []) as AuditEntry[];

    // Fetch actor names
    const actorIds = [...new Set(entries.map(e => e.actor_id).filter(Boolean))];
    if (actorIds.length > 0) {
      const { data: actorProfiles } = await supabase.from("profiles").select("id,full_name,username").in("id", actorIds);
      const nameMap = new Map((actorProfiles ?? []).map(p => [p.id, p.full_name || p.username || "Unknown"]));
      entries.forEach(e => { e.actor_name = nameMap.get(e.actor_id) || "System"; });
    }

    // Resolve student and course names from metadata
    const studentIds = new Set<string>();
    const courseIds = new Set<string>();
    entries.forEach(e => {
      const m = e.metadata as Record<string, string> | null;
      if (m?.student_id) studentIds.add(m.student_id);
      if (m?.course_id) courseIds.add(m.course_id);
    });
    const newStudents = new Map(nameCache.students);
    const newCourses = new Map(nameCache.courses);
    const unknownStudents = [...studentIds].filter(id => !newStudents.has(id));
    const unknownCourses = [...courseIds].filter(id => !newCourses.has(id));
    if (unknownStudents.length > 0) {
      const { data: s } = await supabase.from("students").select("id,nick_name,first_name,last_name").in("id", unknownStudents);
      (s ?? []).forEach((st: { id: string; nick_name: string | null; first_name: string; last_name: string }) => {
        newStudents.set(st.id, st.nick_name ? `${st.nick_name} (${st.first_name})` : `${st.first_name} ${st.last_name}`);
      });
    }
    if (unknownCourses.length > 0) {
      const { data: c } = await supabase.from("courses").select("id,name").in("id", unknownCourses);
      (c ?? []).forEach((cr: { id: string; name: string }) => { newCourses.set(cr.id, cr.name); });
    }
    setNameCache({ students: newStudents, courses: newCourses });

    if (offset === 0) setLogEntries(entries);
    else setLogEntries(prev => [...prev, ...entries]);
    setLogHasMore(entries.length === LOG_PAGE);
    setLogOffset(offset + entries.length);
    setLogLoading(false);
  }, [nameCache]);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true); setErr(null);
    let query = supabase.from("profiles").select("id,email,full_name,role,username").order("role", { ascending: false });
    if (user?.school_id) query = query.eq("school_id", user.school_id);
    const { data, error } = await query;
    if (error) setErr(error.message);
    else {
      let filtered = (data as Profile[]).filter(p => p.role !== "superadmin");
      if (!isAdmin) filtered = filtered.filter(p => p.id === user?.id);
      else if (!isOwner) filtered = filtered.filter(p => p.role !== "owner");
      setProfiles(filtered);
    }
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault(); setInviting(true); setErr(null);
    const { error } = await supabase.rpc("create_staff_user", {
      p_email: inviteMail.trim().toLowerCase(),
      p_password: invitePw,
      p_full_name: inviteName.trim() || "",
      p_role: inviteRole,
    });
    if (error) setErr(error.message);
    else { setInviteMail(""); setInviteName(""); setInvitePw(""); setInviteRole("staff"); toast(t("userAdded"), "success"); refresh(); }
    setInviting(false);
  }

  async function saveEdits() {
    if (!editRow) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: editRow.full_name, role: editRow.role }).eq("id", editRow.id);
      if (error) { toast(error.message, "error"); return; }

      if (editUsername && editUsername !== (editRow.username || editRow.email?.split("@")[0])) {
        const { error: unErr } = await supabase.rpc("update_staff_username", { p_user_id: editRow.id, p_new_username: editUsername });
        if (unErr) { toast(unErr.message, "error"); return; }
      }

      if (editPassword) {
        const { error: pwErr } = await supabase.rpc("update_staff_password", { p_user_id: editRow.id, p_new_password: editPassword });
        if (pwErr) { toast(pwErr.message, "error"); return; }
      }

      setEditRow(null); setEditUsername(""); setEditPassword("");
      toast(t("userUpdated"), "success"); refresh();
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!deleteTarget || deleteTarget.role === "superadmin") return;
    if (user?.role !== "superadmin" && deleteTarget.role === "owner") return;
    if (!isOwner && deleteTarget.role === "admin") return;
    setDeleting(true);
    await supabase.from("profiles").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    toast(t("userDeleted"), "success");
    refresh();
  }

  function formatMetadata(meta: Record<string, unknown>): { label: string; value: string }[] {
    const items: { label: string; value: string }[] = [];
    if (meta.student_id) {
      items.push({ label: t("student"), value: nameCache.students.get(meta.student_id as string) || (meta.student_id as string).slice(0, 8) });
    }
    if (meta.course_id) {
      items.push({ label: t("course"), value: nameCache.courses.get(meta.course_id as string) || (meta.course_id as string).slice(0, 8) });
    }
    if (meta.attended_at) {
      const d = new Date(meta.attended_at as string);
      items.push({ label: t("date"), value: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) });
      items.push({ label: t("time"), value: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) });
    }
    if (meta.amount !== undefined) {
      items.push({ label: t("amount"), value: `${Number(meta.amount).toLocaleString()} ${t("thb")}` });
    }
    if (meta.old_role || meta.new_role) {
      items.push({ label: t("roleChange"), value: `${meta.old_role || "?"} → ${meta.new_role || "?"}` });
    }
    if (meta.purchased_hours !== undefined) {
      items.push({ label: t("purchasedHours"), value: `${meta.purchased_hours} ${t("hrs")}` });
    }
    return items;
  }

  // LINE config handlers
  async function saveLineConfig() {
    setSavingLine(true);
    try {
      if (lineConfig) {
        await supabase.from("line_config").update({ channel_id: lineForm.channel_id }).eq("id", lineConfig.id);
      } else {
        await supabase.from("line_config").insert([{ channel_id: lineForm.channel_id }]);
      }
      if (lineForm.channel_secret || lineForm.channel_token) {
        const { error: vaultErr } = await supabase.rpc("save_line_secrets", {
          p_channel_secret: lineForm.channel_secret,
          p_channel_token: lineForm.channel_token,
        });
        if (vaultErr) { toast(vaultErr.message, "error"); return; }
      }
      toast(t("lineConfigSaved"), "success");
      refetchLineConfig();
      queryClient.invalidateQueries({ queryKey: ["line_config"] });
    } finally { setSavingLine(false); }
  }

  async function toggleLineNotify(key: string, val: boolean) {
    if (!lineConfig) return;
    await supabase.from("line_config").update({ [key]: val }).eq("id", lineConfig.id);
    refetchLineConfig();
    queryClient.invalidateQueries({ queryKey: ["line_config"] });
  }

  async function handleQrUpload(file: File) {
    if (!lineConfig) return;
    setUploadingQr(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `payment-qr/${lineConfig.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (upErr) { toast(upErr.message, "error"); return; }
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now();
      await supabase.from("line_config").update({ payment_qr_url: publicUrl }).eq("id", lineConfig.id);
      refetchLineConfig();
      toast(t("qrUploaded"), "success");
    } finally { setUploadingQr(false); }
  }

  async function handleQrRemove() {
    if (!lineConfig) return;
    await supabase.from("line_config").update({ payment_qr_url: null }).eq("id", lineConfig.id);
    refetchLineConfig();
    toast(t("qrRemoved"), "success");
  }

  const lineAutoToggles = [
    { key: "auto_checkin_notify", label: t("autoCheckInNotify"), color: POS.success },
    { key: "auto_limit_notify", label: t("autoLimitNotify"), color: POS.warning },
    { key: "auto_renewal_reminder", label: t("autoRenewalReminder"), color: POS.danger },
    { key: "auto_link_notify", label: t("autoLinkNotify"), color: "#06C755" },
  ];

  const actionIcon: Record<string, string> = {
    "attendance.insert": "📥",
    "attendance.cancel": "❌",
    "attendance.delete": "🗑️",
    "enrollment.update": "📝",
    "payment.insert": "💳",
    "payment.delete": "💳",
    "profile.role_change": "👤",
  };

  const actionLabel: Record<string, string> = {
    "attendance.insert": "Check-in / เช็คอิน",
    "attendance.cancel": "Cancel attendance / ยกเลิกเช็คอิน",
    "attendance.delete": "Delete attendance / ลบเช็คอิน",
    "enrollment.update": "Update enrollment / อัปเดตลงทะเบียน",
    "payment.insert": "Add payment / เพิ่มการชำระ",
    "payment.delete": "Delete payment / ลบการชำระ",
    "profile.role_change": "Role change / เปลี่ยนบทบาท",
  };


  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold" style={{ color: POS.textPrimary }}>{t("settingsTitle")}</h1>
        {activeTab === "team" && isAdmin && (
          <button onClick={() => setShowInvite(v => !v)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm transition"
            style={{ background: POS.primary, minHeight: POS.touchComfortable }}>
            {showInvite ? <><XMarkIcon className="w-5 h-5" />{t("closeInvite")}</>
              : <><PlusCircleIcon className="w-5 h-5" />{t("inviteUser")}</>}
          </button>
        )}
      </div>

      {/* Tabs */}
      {isOwner && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("team")}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition"
            style={{
              background: activeTab === "team" ? POS.primary : "white",
              color: activeTab === "team" ? "white" : POS.textSecondary,
              border: `1px solid ${activeTab === "team" ? POS.primary : POS.border}`,
            }}>
            <UsersIcon className="w-5 h-5" />
            {t("teamMembers")}
          </button>
          <button
            onClick={() => { setActiveTab("log"); if (logEntries.length === 0) fetchLogs(0, logFilter); }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition"
            style={{
              background: activeTab === "log" ? POS.primary : "white",
              color: activeTab === "log" ? "white" : POS.textSecondary,
              border: `1px solid ${activeTab === "log" ? POS.primary : POS.border}`,
            }}>
            <ClipboardDocumentListIcon className="w-5 h-5" />
            {t("activityLog")}
          </button>
          <button
            onClick={() => { setActiveTab("line"); setLineForm({ channel_id: lineConfig?.channel_id || "", channel_secret: "", channel_token: "" }); }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition"
            style={{
              background: activeTab === "line" ? LINE_GREEN : "white",
              color: activeTab === "line" ? "white" : POS.textSecondary,
              border: `1px solid ${activeTab === "line" ? LINE_GREEN : POS.border}`,
            }}>
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
            LINE
          </button>
        </div>
      )}

      {err && <p className="mb-4 text-sm font-semibold" style={{ color: POS.danger }}>{err}</p>}

      {/* ===== ACTIVITY LOG TAB ===== */}
      {activeTab === "log" && isOwner && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <select value={logFilter} onChange={e => { setLogFilter(e.target.value); fetchLogs(0, e.target.value); }}
              className="border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }}>
              <option value="">{t("allActions")}</option>
              {Object.keys(actionLabel).map(k => (
                <option key={k} value={k}>{actionLabel[k]}</option>
              ))}
            </select>
          </div>

          {/* Log entries */}
          {logLoading && logEntries.length === 0 ? (
            <div className="space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white animate-pulse" />)}</div>
          ) : logEntries.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3" style={{ color: POS.textMuted }} />
              <p style={{ color: POS.textMuted }}>{t("noActivityLogs")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logEntries.map(entry => (
                <div key={entry.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
                  <button
                    onClick={() => setExpandedLogId(expandedLogId === entry.id ? null : entry.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <span className="text-xl flex-shrink-0">{actionIcon[entry.action] || "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: POS.textPrimary }}>{entry.actor_name || "System"}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: POS.bgSurface, color: POS.textMuted }}>
                          {actionLabel[entry.action] || entry.action}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: POS.textMuted }}>
                        {timeAgo(entry.created_at)} &middot; {entry.target_type}{entry.target_id ? ` #${entry.target_id.slice(0, 8)}` : ""}
                      </p>
                    </div>
                    <ChevronDownIcon className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: POS.textMuted, transform: expandedLogId === entry.id ? "rotate(180deg)" : "none" }} />
                  </button>
                  {expandedLogId === entry.id && entry.metadata && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                        {formatMetadata(entry.metadata as Record<string, unknown>).map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="font-semibold min-w-[70px]" style={{ color: POS.textMuted }}>{item.label}</span>
                            <span className="font-medium" style={{ color: POS.textPrimary }}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] mt-2" style={{ color: POS.textMuted }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {logHasMore && (
                <button
                  onClick={() => fetchLogs(logOffset, logFilter)}
                  disabled={logLoading}
                  className="w-full py-3 rounded-xl border font-semibold text-sm disabled:opacity-50"
                  style={{ borderColor: POS.border, color: POS.primary }}>
                  {logLoading ? t("loading") : t("loadMore")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== LINE CONFIG TAB ===== */}
      {activeTab === "line" && isOwner && (
        <div className="space-y-4 max-w-lg">
          {/* API Credentials */}
          <Disclosure defaultOpen={!lineConfig?.secrets_configured}>
            {({ open: isOpen }) => (
              <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: POS.borderLight }}>
                <Disclosure.Button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <KeyIcon className="w-4 h-4" style={{ color: POS.warning }} />
                    <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("apiCredentials")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {lineConfig?.secrets_configured && <span className="text-[10px] font-semibold" style={{ color: POS.success }}>● {t("connected")}</span>}
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: POS.textMuted }} />
                  </div>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: POS.borderLight }}>
                  <div className="pt-3">
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelId")}</label>
                    <input type="text" value={lineForm.channel_id} onChange={e => setLineForm({ ...lineForm, channel_id: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }} placeholder="1234567890" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelSecret")}</label>
                    <input type="password" value={lineForm.channel_secret} onChange={e => setLineForm({ ...lineForm, channel_secret: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }}
                      placeholder={lineConfig?.secrets_configured ? "••••••••  (leave blank to keep)" : ""} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: POS.textMuted }}>{t("lineChannelToken")}</label>
                    <input type="password" value={lineForm.channel_token} onChange={e => setLineForm({ ...lineForm, channel_token: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.borderLight }}
                      placeholder={lineConfig?.secrets_configured ? "••••••••  (leave blank to keep)" : ""} />
                  </div>
                  <button onClick={saveLineConfig} disabled={savingLine || !lineForm.channel_id}
                    className="w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: LINE_GREEN }}>
                    {savingLine ? t("saving") : t("saveLineConfig")}
                  </button>
                </Disclosure.Panel>
              </div>
            )}
          </Disclosure>

          {/* Webhook URL */}
          {lineConfig && (
            <Disclosure>
              {({ open: isOpen }) => (
                <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: POS.borderLight }}>
                  <Disclosure.Button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-2.5">
                      <LinkIcon className="w-4 h-4" style={{ color: POS.primary }} />
                      <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("webhookUrl")}</span>
                    </div>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: POS.textMuted }} />
                  </Disclosure.Button>
                  <Disclosure.Panel className="px-4 pb-4 border-t" style={{ borderColor: POS.borderLight }}>
                    <p className="text-[10px] mt-3 mb-2" style={{ color: POS.textMuted }}>{t("webhookUrlHint")}</p>
                    <div className="flex gap-2">
                      <input type="text" readOnly
                        value={`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${user?.school_id || ""}`}
                        className="flex-1 border rounded-xl px-3 py-2 text-[11px] font-mono truncate" style={{ borderColor: POS.borderLight, background: POS.bgSurface }} />
                      <button onClick={() => {
                        navigator.clipboard.writeText(`${SUPABASE_FUNCTIONS_URL}/line-webhook?school=${user?.school_id || ""}`);
                        toast(t("copied"), "success");
                      }} className="px-3 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 flex items-center gap-1" style={{ background: LINE_GREEN }}>
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" /> {t("copy")}
                      </button>
                    </div>
                  </Disclosure.Panel>
                </div>
              )}
            </Disclosure>
          )}

          {/* Auto Notifications */}
          {lineConfig && (
            <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: POS.borderLight }}>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: POS.borderLight }}>
                <BellAlertIcon className="w-4 h-4" style={{ color: POS.danger }} />
                <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("autoNotifications")}</span>
              </div>
              <div className="divide-y" style={{ borderColor: POS.borderLight }}>
                {lineAutoToggles.map(opt => (
                  <div key={opt.key} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <CheckCircleIcon className="w-4 h-4 shrink-0" style={{ color: opt.color }} />
                      <span className="text-[13px] font-semibold" style={{ color: POS.textPrimary }}>{opt.label}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                      <input type="checkbox" checked={(lineConfig as any)[opt.key] ?? true}
                        onChange={e => toggleLineNotify(opt.key, e.target.checked)} className="sr-only peer" />
                      <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment QR Code */}
          {lineConfig && (
            <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: POS.borderLight }}>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: POS.borderLight }}>
                <QrCodeIcon className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                <span className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("paymentQrCode")}</span>
              </div>
              <div className="px-4 py-4">
                <p className="text-[10px] mb-3" style={{ color: POS.textMuted }}>{t("paymentQrHint")}</p>
                {lineConfig.payment_qr_url ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={lineConfig.payment_qr_url} alt="Payment QR" className="w-40 h-40 object-contain rounded-xl border" style={{ borderColor: POS.borderLight }} />
                    <div className="flex gap-2">
                      <button onClick={() => qrInputRef.current?.click()}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-gray-50"
                        style={{ borderColor: POS.borderLight, color: POS.textSecondary }}>
                        <PhotoIcon className="w-3.5 h-3.5" /> {t("replace")}
                      </button>
                      <button onClick={handleQrRemove}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-red-50"
                        style={{ borderColor: POS.borderLight, color: POS.danger }}>
                        <TrashIcon className="w-3.5 h-3.5" /> {t("remove")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => qrInputRef.current?.click()} disabled={uploadingQr}
                    className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-1.5 hover:bg-purple-50/50 transition-colors disabled:opacity-50"
                    style={{ borderColor: "#8B5CF680", color: "#8B5CF6" }}>
                    <PhotoIcon className="w-6 h-6" />
                    <span className="text-xs font-bold">{uploadingQr ? t("uploading") : t("uploadQrCode")}</span>
                  </button>
                )}
                <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleQrUpload(f); e.target.value = ""; }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TEAM MEMBERS TAB ===== */}
      {activeTab === "team" && <>

      {/* Invite Form */}
      {showInvite && isAdmin && (
        <div className="bg-white rounded-2xl p-5 mb-6 border" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
          <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-2">
            <input type="text" required placeholder={t("username")} value={inviteMail} onChange={e => setInviteMail(e.target.value)}
              className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }} />
            <div>
              <input type="password" required placeholder={t("tempPassword")} value={invitePw} onChange={e => setInvitePw(e.target.value)}
                className="border rounded-xl px-4 py-3 w-full" style={{ borderColor: POS.border }} />
              <p className="text-xs mt-1" style={{ color: POS.textMuted }}>{t("minPasswordLength")}</p>
            </div>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
              className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }}>
              <option value="staff">{t("roleStaff")}</option>
              {isOwner && <option value="admin">{t("roleAdmin")}</option>}
            </select>
            <div className="flex items-end">
              <button disabled={inviting}
                className="w-full px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.success }}>
                {inviting ? t("inviting") : t("addUser")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users */}
      <h2 className="text-lg font-bold mb-4" style={{ color: POS.textPrimary }}>{t("teamMembers")}</h2>
      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}</div>
      ) : profiles.length === 0 ? (
        <p style={{ color: POS.textMuted }}>{t("noUsers")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(p => (
            <div key={p.id} className="bg-white rounded-2xl p-5 border flex flex-col justify-between"
              style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: (p.role === "owner" || p.role === "admin" || p.role === "superadmin") ? POS.primary : POS.info }}>
                    {(p.full_name || p.username || p.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color: POS.textPrimary }}>{p.full_name || p.username || "—"}</h3>
                    <p className="text-xs" style={{ color: POS.textMuted }}>@{p.username || p.email?.split("@")[0]}</p>
                  </div>
                </div>
                <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: (p.role === "owner" || p.role === "admin" || p.role === "superadmin") ? POS.bgSurface : POS.infoLight, color: (p.role === "owner" || p.role === "admin" || p.role === "superadmin") ? POS.primary : POS.info }}>
                  {t("role_" + p.role)}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => { const canEdit = isAdmin && (user?.role === "superadmin" || isOwner || p.role === "staff" || p.id === user?.id); if (canEdit) { setEditRow(p); setEditUsername(p.username || p.email?.split("@")[0] || ""); setEditPassword(""); } }} disabled={!isAdmin || (user?.role !== "superadmin" && !isOwner && p.role !== "staff" && p.id !== user?.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border font-semibold text-sm transition"
                  style={{ borderColor: POS.border, color: POS.textSecondary, opacity: isAdmin ? 1 : 0.5 }}>
                  <PencilIcon className="w-4 h-4" /> {t("edit")}
                </button>
                {isAdmin && p.role !== "superadmin" && p.id !== user?.id && (user?.role === "superadmin" || (isOwner && p.role !== "owner") || p.role === "staff") && (
                  <button onClick={() => setDeleteTarget(p)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border font-semibold text-sm"
                    style={{ borderColor: POS.danger + "44", color: POS.danger }}>
                    <TrashIcon className="w-4 h-4" /> {t("delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      </>}

      {/* Edit Modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={() => { setEditRow(null); setEditUsername(""); setEditPassword(""); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" style={{ boxShadow: POS.shadowXl }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold" style={{ color: POS.primary }}>{t("editUser")}</h2>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("name")}</span>
              <input value={editRow.full_name ?? ""} onChange={e => setEditRow({ ...editRow, full_name: e.target.value })}
                className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                placeholder={t("optionalName")} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("username")}</span>
              <input value={editUsername} onChange={e => setEditUsername(e.target.value)}
                className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                placeholder={editRow.username || editRow.email?.split("@")[0] || ""} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("newPassword")}</span>
              <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}
                placeholder={t("leaveBlankToKeep")} />
            </label>
            {user?.id !== editRow.id && isOwner && (
              <label className="block">
                <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("role")}</span>
                <select value={editRow.role} onChange={e => setEditRow({ ...editRow, role: e.target.value as any })}
                  className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}>
                  <option value="staff">{t("roleStaff")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                  {user?.role === "superadmin" && <option value="owner">{t("roleOwner")}</option>}
                </select>
              </label>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setEditRow(null); setEditUsername(""); setEditPassword(""); }} className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
              <button onClick={saveEdits} disabled={saving} className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.primary }}>{saving ? t("saving") : t("save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-[2rem] p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <TrashIcon className="w-12 h-12 mx-auto mb-4" style={{ color: POS.danger }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: POS.textPrimary }}>{t("deleteConfirmTitle")}</h2>
            <p className="text-sm mb-6" style={{ color: POS.textMuted }}>{t("confirmRemoveStaff")}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
              <button onClick={remove} disabled={deleting} className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.danger }}>{deleting ? t("loading") : t("delete")}</button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
