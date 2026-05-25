import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  XMarkIcon, PencilIcon, UsersIcon, AcademicCapIcon, BuildingOffice2Icon,
  CheckCircleIcon, ExclamationTriangleIcon, ArchiveBoxIcon,
  TrashIcon, KeyIcon, ShieldCheckIcon, ClockIcon, PlusCircleIcon,
  CheckIcon, XCircleIcon, EyeIcon,
} from "@heroicons/react/24/solid";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient";
import { POS } from "../../theme";
import { useTranslation } from "react-i18next";
import { useToast } from "../../hooks/useToast";
import { useNavigate } from "react-router-dom";

interface SchoolHealth {
  school_id: string;
  name: string;
  status: string;
  plan: string;
  owner_id: string | null;
  created_at: string;
  max_students: number;
  max_staff: number;
  feature_flags: Record<string, boolean>;
  setup_checklist: Record<string, boolean>;
  active_students: number;
  total_students: number;
  staff_count: number;
  admin_count: number;
  course_count: number;
  checkins_30d: number;
  line_messages_30d: number;
  owner_last_login?: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
  owner_name: string | null;
  owner_email: string | null;
}

interface Props {
  school: SchoolHealth;
  onClose: () => void;
  onStatusChange: (status: string) => void;
}

type Tab = "overview" | "staff" | "activity" | "setup";

interface StaffMember {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  role: string;
  last_sign_in_at?: string | null;
}

interface SchoolActivity {
  id: string;
  type: "checkin" | "enrollment" | "student_added" | "line_message" | "staff_change" | "audit";
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

const SETUP_ITEMS: { key: string; labelKey: string }[] = [
  { key: "has_logo", labelKey: "saSetupLogo" },
  { key: "has_line_config", labelKey: "saSetupLine" },
  { key: "has_students", labelKey: "saSetupStudents" },
  { key: "has_courses", labelKey: "saSetupCourses" },
  { key: "has_checkin", labelKey: "saSetupCheckin" },
  { key: "has_staff", labelKey: "saSetupStaff" },
];

export default function SchoolDetailModal({ school, onClose, onStatusChange }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: school.name, plan: school.plan || "basic",
    max_students: school.max_students?.toString() || "",
    max_staff: school.max_staff?.toString() || "",
    contact_email: school.contact_email || "",
    contact_phone: school.contact_phone || "",
    address: school.address || "",
    notes: school.notes || "",
  });
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffUsername, setStaffUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "staff">("staff");
  const [staffSaving, setStaffSaving] = useState(false);

  const { data: staff = [] } = useQuery({
    queryKey: ["sa_staff", school.school_id],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,username,role")
        .eq("school_id", school.school_id)
        .neq("role", "superadmin")
        .order("role", { ascending: false });
      if (error) throw error;
      const ids = profiles.map((p: any) => p.id);
      const { data: logins } = await supabase.rpc("get_users_last_login", { user_ids: ids });
      const loginMap: Record<string, string> = {};
      if (logins) for (const u of logins) loginMap[u.id] = u.last_sign_in_at;
      return profiles.map((p: any) => ({ ...p, last_sign_in_at: loginMap[p.id] || null })) as StaffMember[];
    },
  });

  const ownerCount = staff.filter(s => s.role === "owner").length;
  const adminCount = staff.filter(s => s.role === "admin").length;
  const staffOnlyCount = staff.filter(s => s.role === "staff").length;

  const { data: schoolActivity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["sa_school_activity", school.school_id],
    queryFn: async () => {
      const activities: SchoolActivity[] = [];
      const since = new Date(Date.now() - 30 * 86400000).toISOString();

      const [
        { data: checkins },
        { data: enrollments },
        { data: recentStudents },
        { data: lineMessages },
        { data: auditLogs },
      ] = await Promise.all([
        supabase.from("attendance").select("id,attended_at_ts,hours")
          .eq("school_id", school.school_id).gte("attended_at_ts", since)
          .order("attended_at_ts", { ascending: false }).limit(20),
        supabase.from("enrollments").select("id,created_at,status")
          .eq("school_id", school.school_id).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(15),
        supabase.from("students").select("id,created_at,nick_name,first_name")
          .eq("school_id", school.school_id).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("line_messages").select("id,created_at,type")
          .eq("school_id", school.school_id).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("audit_log").select("id,action,created_at,metadata")
          .eq("school_id", school.school_id)
          .order("created_at", { ascending: false }).limit(15),
      ]);

      if (checkins) for (const c of checkins) {
        activities.push({
          id: `checkin-${c.id}`, type: "checkin",
          description: `Check-in: ${c.hours || 1}h`,
          timestamp: c.attended_at_ts,
        });
      }
      if (enrollments) for (const e of enrollments) {
        activities.push({
          id: `enroll-${e.id}`, type: "enrollment",
          description: `New enrollment (${e.status})`,
          timestamp: e.created_at,
        });
      }
      if (recentStudents) for (const s of recentStudents) {
        activities.push({
          id: `student-${s.id}`, type: "student_added",
          description: `Student added: ${s.nick_name || s.first_name || "—"}`,
          timestamp: s.created_at,
        });
      }
      if (lineMessages) for (const m of lineMessages) {
        activities.push({
          id: `line-${m.id}`, type: "line_message",
          description: `LINE message (${m.type || "message"})`,
          timestamp: m.created_at,
        });
      }
      if (auditLogs) for (const a of auditLogs) {
        activities.push({
          id: `audit-${a.id}`, type: "audit",
          description: a.action.replace(/_/g, " "),
          timestamp: a.created_at, metadata: a.metadata,
        });
      }

      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return activities.slice(0, 50);
    },
    enabled: tab === "activity",
  });

  const { data: weeklyCheckins = [] } = useQuery({
    queryKey: ["sa_weekly", school.school_id],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data } = await supabase.from("attendance").select("attended_at_ts")
        .eq("school_id", school.school_id).gte("attended_at_ts", since).order("attended_at_ts");
      if (!data) return [];
      const byDay: Record<string, number> = {};
      for (const a of data) {
        const day = new Date(a.attended_at_ts).toLocaleDateString([], { weekday: "short", day: "numeric" });
        byDay[day] = (byDay[day] || 0) + 1;
      }
      return Object.entries(byDay).map(([day, count]) => ({ day, count }));
    },
    enabled: tab === "overview",
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schools").update({
        name: editForm.name, plan: editForm.plan,
        max_students: editForm.max_students ? parseInt(editForm.max_students) : 100,
        max_staff: editForm.max_staff ? parseInt(editForm.max_staff) : 5,
        contact_email: editForm.contact_email || null,
        contact_phone: editForm.contact_phone || null,
        address: editForm.address || null,
        notes: editForm.notes || null,
        updated_at: new Date().toISOString(),
      }).eq("id", school.school_id);
      if (error) throw error;
    },
    onSuccess: () => { toast(t("saved"), "success"); setEditing(false); qc.invalidateQueries({ queryKey: ["superadmin_schools"] }); },
  });

  const removeStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      await supabase.from("profiles").delete().eq("id", staffId);
      await supabase.from("audit_log").insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        school_id: school.school_id, action: "staff_removed",
        target_type: "profile", target_id: staffId,
      });
    },
    onSuccess: () => {
      toast(t("userDeleted"), "success");
      qc.invalidateQueries({ queryKey: ["sa_staff", school.school_id] });
      qc.invalidateQueries({ queryKey: ["superadmin_schools"] });
    },
  });

  async function saveStaffEdits() {
    if (!editingStaff) return;
    setStaffSaving(true);
    try {
      await supabase.from("profiles").update({ role: staffRole }).eq("id", editingStaff.id);
      if (staffUsername && staffUsername !== editingStaff.username) {
        const { error } = await supabase.rpc("update_staff_username", { p_user_id: editingStaff.id, p_new_username: staffUsername });
        if (error) { toast(error.message, "error"); return; }
      }
      if (staffPassword) {
        const { error } = await supabase.rpc("update_staff_password", { p_user_id: editingStaff.id, p_new_password: staffPassword });
        if (error) { toast(error.message, "error"); return; }
      }
      await supabase.from("audit_log").insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        school_id: school.school_id, action: "staff_updated",
        target_type: "profile", target_id: editingStaff.id,
      });
      setEditingStaff(null);
      toast(t("userUpdated"), "success");
      qc.invalidateQueries({ queryKey: ["sa_staff", school.school_id] });
    } finally { setStaffSaving(false); }
  }

  async function handleViewAsSchool() {
    const { data: { user: me } } = await supabase.auth.getUser();
    if (!me) return;
    const { data: myProfile } = await supabase.from("profiles").select("school_id").eq("id", me.id).single();
    if (!myProfile) return;
    localStorage.setItem("sa_original_school_id", myProfile.school_id);
    localStorage.setItem("sa_impersonate_uid", me.id);
    const { error } = await supabase.from("profiles").update({ school_id: school.school_id }).eq("id", me.id);
    if (error) { toast(error.message, "error"); return; }
    onClose();
    navigate("/");
    window.location.reload();
  }

  // Add team member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "staff">("staff");
  const [addingMember, setAddingMember] = useState(false);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    try {
      const raw = newMemberEmail.trim().toLowerCase();
      const email = raw.includes("@") ? raw : `${raw}@school.local`;
      const username = raw.includes("@") ? raw.split("@")[0] : raw;

      const { error: rpcErr } = await supabase.rpc("create_staff_user", {
        p_email: email,
        p_password: newMemberPassword,
        p_full_name: newMemberName.trim() || "",
        p_role: newMemberRole,
      });
      if (rpcErr) { toast(rpcErr.message, "error"); return; }

      // Update the profile to point to the correct school
      const { data: newProfiles } = await supabase.from("profiles").select("id").eq("email", email).limit(1);
      if (newProfiles && newProfiles[0]) {
        const { error: profileErr } = await supabase.from("profiles").update({
          school_id: school.school_id,
          username,
        }).eq("id", newProfiles[0].id);
        if (profileErr) { toast(profileErr.message, "error"); return; }
        await supabase.from("audit_log").insert({
          actor_id: (await supabase.auth.getUser()).data.user?.id,
          school_id: school.school_id, action: "staff_added",
          target_type: "profile", target_id: newProfiles[0].id,
          metadata: { email, username, role: newMemberRole },
        });
      }
      toast(t("userAdded"), "success");
      setShowAddMember(false);
      setNewMemberEmail(""); setNewMemberName(""); setNewMemberPassword(""); setNewMemberRole("staff");
      qc.invalidateQueries({ queryKey: ["sa_staff", school.school_id] });
      qc.invalidateQueries({ queryKey: ["superadmin_schools"] });
    } finally { setAddingMember(false); }
  }

  const timeAgo = (d: string | null) => {
    if (!d) return t("saNeverLoggedIn");
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const statusColor = (s: string) => s === "active" ? POS.success : s === "suspended" ? POS.warning : POS.textMuted;
  const isOwner = (id: string) => id === school.owner_id;

  const activityTypeColor = (type: SchoolActivity["type"]) => {
    switch (type) {
      case "checkin": return POS.success;
      case "enrollment": return POS.primary;
      case "student_added": return POS.info;
      case "line_message": return "#06C755";
      case "staff_change": return POS.warning;
      case "audit": return POS.textMuted;
    }
  };

  const activityTypeIcon = (type: SchoolActivity["type"]) => {
    switch (type) {
      case "checkin": return "C";
      case "enrollment": return "E";
      case "student_added": return "S";
      case "line_message": return "L";
      case "staff_change": return "U";
      case "audit": return "A";
    }
  };

  const checklist = school.setup_checklist || {};
  const setupDone = Object.values(checklist).filter(Boolean).length;
  const setupTotal = SETUP_ITEMS.length;

  const healthScore = Math.min(100, Math.round(
    (school.owner_last_login ? 25 : 0) +
    (school.active_students > 0 ? 20 : 0) +
    (school.checkins_30d > 0 ? 20 : 0) +
    (school.course_count > 0 ? 15 : 0) +
    (school.line_messages_30d > 0 ? 10 : 0) +
    (setupDone >= setupTotal ? 10 : (setupDone / setupTotal) * 10)
  ));

  const healthColor = healthScore >= 70 ? POS.success : healthScore >= 40 ? POS.warning : POS.danger;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: POS.shadowXl }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: POS.borderLight }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: POS.primaryGradient }}>
              {school.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-extrabold" style={{ color: POS.textPrimary }}>{school.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: statusColor(school.status) + "20", color: statusColor(school.status) }}>
                  {t(`sa_${school.status}`)}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: healthColor + "20", color: healthColor }}>
                  {t("saHealthScore")}: {healthScore}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleViewAsSchool}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition hover:bg-gray-50"
              style={{ borderColor: POS.primary, color: POS.primary }}>
              <EyeIcon className="w-3.5 h-3.5" />
              {t("saViewAsSchool")}
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
              <XMarkIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4" style={{ borderColor: POS.borderLight }}>
          {([
            { key: "overview" as Tab, label: t("overview"), icon: <BuildingOffice2Icon className="w-4 h-4" /> },
            { key: "staff" as Tab, label: `${t("saTeam")} (${staff.length})`, icon: <UsersIcon className="w-4 h-4" /> },
            { key: "activity" as Tab, label: t("saSchoolActivity"), icon: <ClockIcon className="w-4 h-4" /> },
            { key: "setup" as Tab, label: `${t("saSetup")} (${setupDone}/${setupTotal})`, icon: <CheckCircleIcon className="w-4 h-4" /> },
          ]).map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className="flex items-center gap-1 px-3 py-2.5 text-xs font-bold border-b-2"
              style={{ borderColor: tab === tb.key ? POS.primary : "transparent", color: tab === tb.key ? POS.primary : POS.textMuted }}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "overview" && (
            <div className="space-y-4">
              {editing ? (
                <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3">
                  <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm font-bold" style={{ borderColor: POS.border }} />
                  <div className="grid grid-cols-3 gap-2">
                    <select value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                      className="border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }}>
                      <option value="free">Free</option><option value="basic">Basic</option>
                      <option value="pro">Pro</option><option value="enterprise">Enterprise</option>
                    </select>
                    <input type="number" value={editForm.max_students} onChange={(e) => setEditForm({ ...editForm, max_students: e.target.value })}
                      className="border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }} placeholder={t("saMaxStudents")} />
                    <input type="number" value={editForm.max_staff} onChange={(e) => setEditForm({ ...editForm, max_staff: e.target.value })}
                      className="border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }} placeholder={t("saMaxStaff")} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="email" value={editForm.contact_email} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                      className="border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }} placeholder={t("saContactEmail")} />
                    <input type="tel" value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                      className="border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }} placeholder={t("saContactPhone")} />
                  </div>
                  <input type="text" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full border rounded-xl px-3 py-3 text-sm" style={{ borderColor: POS.border }} placeholder={t("saAddress")} />
                  <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                    className="w-full border rounded-xl px-3 py-3 text-sm resize-none" style={{ borderColor: POS.border }} placeholder={t("notes")} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={updateMutation.isPending} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: POS.primary }}>{t("save")}</button>
                    <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-xl border text-sm font-bold" style={{ borderColor: POS.border }}>{t("cancel")}</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <MiniStat label={t("students")} value={school.active_students} max={school.max_students} color={POS.success} />
                    <MiniStat label={t("saOwner")} value={ownerCount} color={POS.primary} />
                    <MiniStat label={t("staff")} value={staffOnlyCount} color={POS.info} />
                    <MiniStat label={t("saTeamTotal")} value={staff.length} max={school.max_staff} color={POS.warning} />
                    <MiniStat label={t("saCheckins")} value={school.checkins_30d} color="#06C755" />
                    <MiniStat label={t("saLineMsgs")} value={school.line_messages_30d} color={POS.danger} />
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <InfoItem label={t("saPlan")} value={school.plan} />
                    <InfoItem label={t("saOwner")} value={school.owner_name || "—"} />
                    <InfoItem label={t("saLastLogin")}
                      value={timeAgo(school.owner_last_login)}
                      color={school.owner_last_login ? POS.success : POS.danger} />
                    <InfoItem label={t("saContactEmail")} value={school.contact_email || "—"} />
                    <InfoItem label={t("saContactPhone")} value={school.contact_phone || "—"} />
                    <InfoItem label={t("saCreated")} value={new Date(school.created_at).toLocaleDateString()} />
                  </div>

                  {/* Weekly chart */}
                  {weeklyCheckins.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase mb-1" style={{ color: POS.textMuted }}>{t("saWeeklyCheckins")}</h4>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={weeklyCheckins}>
                          <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={20} />
                          <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11, border: "none" }} />
                          <Bar dataKey="count" fill={POS.primary} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: POS.borderLight }}>
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl border"
                      style={{ borderColor: POS.border, color: POS.primary }}>
                      <PencilIcon className="w-3.5 h-3.5" /> {t("edit")}
                    </button>
                    <div className="flex gap-2">
                      {school.status !== "active" && (
                        <button onClick={() => onStatusChange("active")} className="text-xs font-bold px-3 py-2 rounded-xl text-white" style={{ background: POS.success }}>
                          <CheckCircleIcon className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />{t("saActivate")}
                        </button>
                      )}
                      {school.status !== "suspended" && (
                        <button onClick={() => onStatusChange("suspended")} className="text-xs font-bold px-3 py-2 rounded-xl text-white" style={{ background: POS.warning }}>
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />{t("saSuspend")}
                        </button>
                      )}
                      {school.status !== "archived" && (
                        <button onClick={() => onStatusChange("archived")} className="text-xs font-bold px-3 py-2 rounded-xl border" style={{ borderColor: POS.border, color: POS.textMuted }}>
                          <ArchiveBoxIcon className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />{t("saArchive")}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "staff" && (
            <div className="space-y-2">
              {/* Header with counts + add button */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-3 text-xs">
                  <span className="font-bold px-2 py-1 rounded-lg" style={{ background: POS.bgSurface, color: POS.primary }}>
                    {ownerCount} {t("roleOwner")}
                  </span>
                  <span className="font-bold px-2 py-1 rounded-lg" style={{ background: POS.bgSurface, color: POS.primary }}>
                    {adminCount} {t("roleAdmin")}
                  </span>
                  <span className="font-bold px-2 py-1 rounded-lg" style={{ background: POS.infoLight, color: POS.info }}>
                    {staffOnlyCount} {t("roleStaff")}
                  </span>
                </div>
                <button onClick={() => setShowAddMember(true)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: POS.primary }}>
                  <PlusCircleIcon className="w-4 h-4" /> {t("addUser")}
                </button>
              </div>

              {/* Add member form */}
              {showAddMember && (
                <form onSubmit={handleAddMember} className="p-3 rounded-xl border space-y-2 mb-2" style={{ borderColor: POS.primary + "40", background: POS.bgSurface }}>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder={t("name")} className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.border }} />
                    <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value as any)}
                      className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.border }}>
                      <option value="staff">{t("roleStaff")}</option>
                      <option value="admin">{t("roleAdmin")}</option>
                      <option value="owner">{t("roleOwner")}</option>
                    </select>
                  </div>
                  <input type="text" required value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder={t("username") + " *"} className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.border }} />
                  <input type="password" required minLength={6} value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)}
                    placeholder={t("tempPassword") + " *"} className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: POS.border }} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={addingMember} className="flex-1 py-2 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: POS.primary }}>
                      {addingMember ? t("saving") : t("addUser")}
                    </button>
                    <button type="button" onClick={() => setShowAddMember(false)} className="px-4 py-2 rounded-xl border text-sm font-bold" style={{ borderColor: POS.border }}>
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              )}

              {staff.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: POS.textMuted }}>{t("noUsers")}</p>
              ) : staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: POS.borderLight }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: s.role === "owner" || s.role === "admin" ? POS.primary : POS.info }}>
                      {(s.full_name || s.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="font-bold text-sm truncate" style={{ color: POS.textPrimary }}>{s.full_name || s.username || "—"}</p>
                        {isOwner(s.id) && (
                          <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" style={{ color: POS.primary }} title={t("saOwner")} />
                        )}
                      </div>
                      <p className="text-[11px]" style={{ color: POS.textMuted }}>
                        @{s.username || s.email?.split("@")[0]} ·{" "}
                        <span className="font-semibold" style={{ color: s.role === "owner" || s.role === "admin" ? POS.primary : POS.info }}>{t("role_" + s.role)}</span>
                        {" · "}
                        <span style={{ color: s.last_sign_in_at ? POS.success : POS.danger }}>{timeAgo(s.last_sign_in_at)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => {
                      setEditingStaff(s); setStaffUsername(s.username || ""); setStaffPassword(""); setStaffRole(s.role as any);
                    }} className="p-1.5 rounded-lg hover:bg-gray-100">
                      <PencilIcon className="w-3.5 h-3.5" style={{ color: POS.primary }} />
                    </button>
                    {!isOwner(s.id) && (
                      <button onClick={() => { if (confirm(t("confirmRemoveStaff"))) removeStaffMutation.mutate(s.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-50">
                        <TrashIcon className="w-3.5 h-3.5" style={{ color: POS.danger }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase mb-2" style={{ color: POS.textMuted }}>
                {t("saSchoolActivityDesc")}
              </p>
              {activityLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}</div>
              ) : schoolActivity.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: POS.textMuted }}>{t("saNoActivity")}</p>
              ) : schoolActivity.map((a) => (
                <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                    style={{ background: activityTypeColor(a.type) }}>
                    {activityTypeIcon(a.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: POS.textPrimary }}>{a.description}</p>
                    <p className="text-[10px]" style={{ color: POS.textMuted }}>{new Date(a.timestamp).toLocaleString()}</p>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: activityTypeColor(a.type) + "20", color: activityTypeColor(a.type) }}>
                    {a.type.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === "setup" && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-bold" style={{ color: POS.textPrimary }}>{t("saSetupProgress")}</h4>
                  <span className="text-sm font-extrabold" style={{ color: setupDone === setupTotal ? POS.success : POS.warning }}>
                    {setupDone}/{setupTotal}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${(setupDone / setupTotal) * 100}%`,
                    background: setupDone === setupTotal ? POS.success : POS.warning,
                  }} />
                </div>
              </div>

              {/* Checklist items */}
              <div className="space-y-2">
                {SETUP_ITEMS.map((item) => {
                  const done = checklist[item.key] || false;
                  return (
                    <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl border"
                      style={{ borderColor: done ? POS.success + "40" : POS.borderLight, background: done ? POS.successLight : "white" }}>
                      {done ? (
                        <CheckIcon className="w-5 h-5 shrink-0" style={{ color: POS.success }} />
                      ) : (
                        <XCircleIcon className="w-5 h-5 shrink-0" style={{ color: POS.textMuted }} />
                      )}
                      <span className="text-sm font-semibold" style={{ color: done ? POS.success : POS.textSecondary }}>
                        {t(item.labelKey)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {setupDone < setupTotal && (
                <p className="text-xs" style={{ color: POS.textMuted }}>
                  {t("saSetupHint")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Edit Staff Modal */}
        {editingStaff && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30" onClick={() => setEditingStaff(null)}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" style={{ boxShadow: POS.shadowXl }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold flex items-center gap-2" style={{ color: POS.primary }}>
                <KeyIcon className="w-4 h-4" /> {editingStaff.full_name || editingStaff.username}
              </h2>
              <div>
                <label className="text-[10px] font-bold uppercase block mb-0.5" style={{ color: POS.textMuted }}>{t("username")}</label>
                <input value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm" style={{ borderColor: POS.border }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase block mb-0.5" style={{ color: POS.textMuted }}>{t("newPassword")}</label>
                <input type="password" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm" style={{ borderColor: POS.border }} placeholder={t("leaveBlankToKeep")} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase block mb-0.5" style={{ color: POS.textMuted }}>{t("role")}</label>
                <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm" style={{ borderColor: POS.border }}>
                  <option value="owner">{t("roleOwner")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                  <option value="staff">{t("roleStaff")}</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingStaff(null)} className="flex-1 py-2.5 rounded-xl border font-bold text-sm" style={{ borderColor: POS.border }}>{t("cancel")}</button>
                <button onClick={saveStaffEdits} disabled={staffSaving} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: POS.primary }}>
                  {staffSaving ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function MiniStat({ label, value, max, color }: { label: string; value: number; max?: number | null; color: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : null;
  return (
    <div className="rounded-xl p-2.5 border" style={{ borderColor: POS.borderLight }}>
      <p className="text-lg font-extrabold" style={{ color: POS.textPrimary }}>
        {value}{max != null && <span className="text-[10px] font-normal" style={{ color: POS.textMuted }}>/{max}</span>}
      </p>
      <p className="text-[9px] font-bold uppercase" style={{ color: POS.textMuted }}>{label}</p>
      {pct !== null && (
        <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? POS.danger : color }} />
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase block" style={{ color: POS.textMuted }}>{label}</span>
      <span className="font-semibold text-sm" style={{ color: color || POS.textPrimary }}>{value}</span>
    </div>
  );
}
