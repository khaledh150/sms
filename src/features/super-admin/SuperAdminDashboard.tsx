import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BuildingOffice2Icon,
  PlusCircleIcon,
  UsersIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  KeyIcon,
} from "@heroicons/react/24/solid";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from "recharts";
import { supabase } from "../../supabaseClient";
import { POS } from "../../theme";
import { useTranslation } from "react-i18next";
import { useToast } from "../../hooks/useToast";
import SchoolDetailModal from "./SchoolDetailModal";

import type { SchoolHealth, SuperAdminAuditEntry as AuditEntry } from "./types";
import { timeAgo as sharedTimeAgo } from "../../utils/time";
import { useAuth } from "../../AuthContext";
import { Dialog } from "@headlessui/react";

interface SchoolForm {
  name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  plan: string;
  max_students: string;
  max_staff: string;
  notes: string;
  admin_email: string;
  admin_password: string;
  admin_name: string;
}

const EMPTY_FORM: SchoolForm = {
  name: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  plan: "basic",
  max_students: "50",
  max_staff: "5",
  notes: "",
  admin_email: "",
  admin_password: "",
  admin_name: "",
};

const CHART_COLORS = [POS.primary, POS.success, POS.info, POS.warning, POS.danger, "#06C755"];

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<SchoolForm>(EMPTY_FORM);
  const [detailSchool, setDetailSchool] = useState<SchoolHealth | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "archived">("all");
  const { user } = useAuth();
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [acctUsername, setAcctUsername] = useState("");
  const [acctPassword, setAcctPassword] = useState("");
  const [acctSaving, setAcctSaving] = useState(false);

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["superadmin_schools"],
    queryFn: async () => {
      const [{ data: healthData, error }, { data: logins }] = await Promise.all([
        supabase.from("school_health").select("*"),
        supabase.rpc("get_school_owner_logins"),
      ]);
      if (error) throw error;
      const loginMap: Record<string, string> = {};
      if (logins) for (const l of logins) loginMap[l.school_id] = l.owner_last_login;
      return (healthData || []).map((s: any) => ({
        ...s,
        owner_last_login: loginMap[s.school_id] || null,
      })) as SchoolHealth[];
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["superadmin_activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,action,target_type,target_id,metadata,created_at,actor_id,school_id")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AuditEntry[];
    },
  });

  const { data: attendanceTrend = [] } = useQuery({
    queryKey: ["superadmin_attendance_trend"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_platform_attendance_trend");
      if (error) {
        const { data: fallback } = await supabase
          .from("attendance")
          .select("attended_at_ts")
          .gte("attended_at_ts", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        if (!fallback) return [];
        const byDay: Record<string, number> = {};
        for (const a of fallback) {
          const day = new Date(a.attended_at_ts).toLocaleDateString([], { month: "short", day: "numeric" });
          byDay[day] = (byDay[day] || 0) + 1;
        }
        return Object.entries(byDay).map(([date, count]) => ({ date, count })).slice(-14);
      }
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (f: SchoolForm) => {
      const { data: school, error: schoolErr } = await supabase
        .from("schools")
        .insert({
          name: f.name,
          contact_email: f.contact_email || null,
          contact_phone: f.contact_phone || null,
          address: f.address || null,
          plan: f.plan || "basic",
          max_students: f.max_students ? parseInt(f.max_students) : 50,
          max_staff: f.max_staff ? parseInt(f.max_staff) : 5,
          notes: f.notes || null,
        })
        .select()
        .single();
      if (schoolErr) throw schoolErr;

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: f.admin_email,
        password: f.admin_password,
      });
      if (authErr) throw authErr;

      if (authData.user) {
        const { error: profileErr } = await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: f.admin_email,
          full_name: f.admin_name,
          role: "owner",
          school_id: school.id,
          username: f.admin_email.split("@")[0],
        });
        if (profileErr) throw profileErr;

        await supabase.from("schools").update({ owner_id: authData.user.id }).eq("id", school.id);

        await supabase.from("audit_log").insert({
          actor_id: (await supabase.auth.getUser()).data.user?.id,
          school_id: school.id,
          action: "school_created",
          target_type: "school",
          target_id: school.id,
          metadata: { school_name: f.name, owner_email: f.admin_email },
        });
      }

      return school;
    },
    onSuccess: () => {
      toast(t("schoolCreated"), "success");
      setShowCreate(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["superadmin_schools"] });
      qc.invalidateQueries({ queryKey: ["superadmin_activity"] });
    },
    onError: (err: any) => {
      toast(err.message || "Error creating school", "error");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("schools").update({ status }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        school_id: id,
        action: `school_${status}`,
        target_type: "school",
        target_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadmin_schools"] });
      qc.invalidateQueries({ queryKey: ["superadmin_activity"] });
      toast(t("saved"), "success");
    },
  });

  const filtered = schools.filter((s) => {
    const matchesSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.owner_email || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totals = {
    schools: schools.filter((s) => s.status === "active").length,
    students: schools.reduce((a, s) => a + (s.active_students || 0), 0),
    staff: schools.reduce((a, s) => a + (s.staff_count || 0), 0),
    courses: schools.reduce((a, s) => a + (s.course_count || 0), 0),
    checkins30d: schools.reduce((a, s) => a + (s.checkins_30d || 0), 0),
    lineMessages30d: schools.reduce((a, s) => a + (s.line_messages_30d || 0), 0),
  };

  const studentDistribution = schools
    .filter((s) => s.active_students > 0)
    .map((s) => ({ name: s.name, value: s.active_students }));

  const statusColor = (s: string) =>
    s === "active" ? POS.success : s === "suspended" ? POS.warning : POS.textMuted;

  const setupPct = (checklist: Record<string, boolean>) => {
    const items = Object.values(checklist || {});
    if (items.length === 0) return 0;
    return Math.round((items.filter(Boolean).length / items.length) * 100);
  };

  async function handleSaveAccount() {
    if (!user?.id) return;
    setAcctSaving(true);
    try {
      if (acctUsername) {
        const { error } = await supabase.rpc("update_staff_username", { p_user_id: user.id, p_new_username: acctUsername });
        if (error) { toast(error.message, "error"); return; }
      }
      if (acctPassword) {
        const { error } = await supabase.rpc("update_staff_password", { p_user_id: user.id, p_new_password: acctPassword });
        if (error) { toast(error.message, "error"); return; }
      }
      toast(t("accountUpdated"), "success");
      setShowAccountSettings(false);
      setAcctPassword("");
    } catch (e: any) { toast(e.message, "error"); }
    finally { setAcctSaving(false); }
  }

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return t("saNeverLoggedIn");
    return sharedTimeAgo(dateStr);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: POS.textPrimary }}>
            {t("superAdminDashboard")}
          </h1>
          <p className="text-sm mt-1" style={{ color: POS.textMuted }}>{t("superAdminDesc")}</p>
        </div>
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setAcctUsername(user?.username || ""); setAcctPassword(""); setShowAccountSettings(true); }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm border"
            style={{ borderColor: POS.border, color: POS.textSecondary, minHeight: POS.touchComfortable }}>
            <Cog6ToothIcon className="w-5 h-5" />
            {t("account")}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary, minHeight: POS.touchComfortable }}>
            <PlusCircleIcon className="w-5 h-5" />
            {t("createSchool")}
          </motion.button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: t("saSchools"), value: totals.schools, icon: <BuildingOffice2Icon className="w-5 h-5" />, color: POS.primary },
          { label: t("totalStudents"), value: totals.students, icon: <UsersIcon className="w-5 h-5" />, color: POS.success },
          { label: t("staff"), value: totals.staff, icon: <UsersIcon className="w-5 h-5" />, color: POS.info },
          { label: t("courses"), value: totals.courses, icon: <AcademicCapIcon className="w-5 h-5" />, color: POS.warning },
          { label: t("saCheckins30d"), value: totals.checkins30d, icon: <ClockIcon className="w-5 h-5" />, color: "#06C755" },
          { label: t("saLineMessages"), value: totals.lineMessages30d, icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />, color: POS.danger },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-3 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white mb-2" style={{ background: stat.color }}>
              {stat.icon}
            </div>
            <p className="text-xl font-extrabold" style={{ color: POS.textPrimary }}>{stat.value}</p>
            <p className="text-[10px] font-bold uppercase" style={{ color: POS.textMuted }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Attendance Trend */}
        <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: POS.textPrimary }}>
            <ChartBarIcon className="w-4 h-4" style={{ color: POS.primary }} />
            {t("saAttendanceTrend")}
          </h3>
          {attendanceTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={attendanceTrend}>
                <defs>
                  <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={POS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={POS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: POS.shadowMd }} />
                <Area type="monotone" dataKey="count" stroke={POS.primary} fill="url(#colorCheckins)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: POS.textMuted }}>{t("noDataForRange")}</p>
          )}
        </div>

        {/* Student Distribution */}
        <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: POS.textPrimary }}>
            <UsersIcon className="w-4 h-4" style={{ color: POS.success }} />
            {t("saStudentDistribution")}
          </h3>
          {studentDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={studentDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                  {studentDistribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: POS.shadowMd }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: POS.textMuted }}>{t("noDataForRange")}</p>
          )}
        </div>
      </div>

      {/* School Comparison Bar Chart */}
      {schools.length > 1 && (
        <div className="bg-white rounded-2xl p-4 border mb-6" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: POS.textPrimary }}>
            <BuildingOffice2Icon className="w-4 h-4" style={{ color: POS.info }} />
            {t("saSchoolComparison")}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={schools.map(s => ({
              name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
              students: s.active_students,
              checkins: s.checkins_30d,
              staff: s.staff_count,
            }))}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: POS.shadowMd }} />
              <Bar dataKey="students" fill={POS.success} radius={[4, 4, 0, 0]} name={t("students")} />
              <Bar dataKey="checkins" fill={POS.primary} radius={[4, 4, 0, 0]} name={t("saCheckins30d")} />
              <Bar dataKey="staff" fill={POS.info} radius={[4, 4, 0, 0]} name={t("staff")} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Activity + Schools side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Recent Activity Feed */}
        <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: POS.textPrimary }}>{t("saRecentActivity")}</h3>
          {recentActivity.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: POS.textMuted }}>{t("saNoActivity")}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: a.action.includes("created") ? POS.success : a.action.includes("suspended") ? POS.warning : POS.primary }}>
                    {a.action.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: POS.textPrimary }}>
                      {a.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px]" style={{ color: POS.textMuted }}>
                      {timeAgo(a.created_at)}
                      {a.metadata?.school_name && ` · ${a.metadata.school_name}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schools List */}
        <div className="lg:col-span-2">
          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: POS.textMuted }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("saSearchSchools")}
                className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm" style={{ borderColor: POS.border }} />
            </div>
            <div className="flex gap-2">
              {(["all", "active", "suspended", "archived"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    background: statusFilter === s ? POS.primary : "white",
                    color: statusFilter === s ? "white" : POS.textSecondary,
                    borderColor: statusFilter === s ? POS.primary : POS.border,
                  }}>
                  {t(`sa_${s}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Schools Cards */}
          {isLoading ? (
            <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border" style={{ borderColor: POS.borderLight }}>
              <BuildingOffice2Icon className="w-12 h-12 mx-auto mb-3" style={{ color: POS.textMuted }} />
              <p className="font-semibold" style={{ color: POS.textMuted }}>{t("saNoSchools")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((school) => (
                <motion.div key={school.school_id} whileTap={{ scale: 0.99 }}
                  className="bg-white rounded-2xl p-4 border cursor-pointer transition-all hover:shadow-md"
                  style={{ borderColor: POS.borderLight, boxShadow: POS.shadowSm }}
                  onClick={() => setDetailSchool(school)}>

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                        style={{ background: POS.primaryGradient }}>
                        {school.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate" style={{ color: POS.textPrimary }}>{school.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: statusColor(school.status) + "20", color: statusColor(school.status) }}>
                            {school.status === "active" && <CheckCircleIcon className="w-3 h-3" />}
                            {school.status === "suspended" && <ExclamationTriangleIcon className="w-3 h-3" />}
                            {school.status === "archived" && <ArchiveBoxIcon className="w-3 h-3" />}
                            {t(`sa_${school.status}`)}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: POS.bgSurface, color: POS.primary }}>
                            {school.plan}
                          </span>
                          {setupPct(school.setup_checklist) < 100 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: POS.warningLight, color: POS.warning }}>
                              {t("saSetup")} {setupPct(school.setup_checklist)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="hidden sm:flex items-center gap-3 text-center shrink-0">
                      <div>
                        <p className="text-base font-bold" style={{ color: POS.textPrimary }}>{school.active_students}</p>
                        <p className="text-[9px] font-bold uppercase" style={{ color: POS.textMuted }}>{t("students")}</p>
                      </div>
                      <div>
                        <p className="text-base font-bold" style={{ color: POS.textPrimary }}>
                          {(school.admin_count || 0) + (school.staff_count || 0)}
                          <span className="text-[9px] font-normal" style={{ color: POS.textMuted }}>/{school.max_staff}</span>
                        </p>
                        <p className="text-[9px] font-bold uppercase" style={{ color: POS.textMuted }}>{t("saTeam")}</p>
                      </div>
                      <div>
                        <p className="text-base font-bold" style={{ color: POS.textPrimary }}>{school.checkins_30d}</p>
                        <p className="text-[9px] font-bold uppercase" style={{ color: POS.textMuted }}>{t("saCheckins")}</p>
                      </div>
                      <div>
                        <p className="text-base font-bold" style={{ color: POS.textPrimary }}>{school.line_messages_30d}</p>
                        <p className="text-[9px] font-bold uppercase" style={{ color: POS.textMuted }}>{t("saLineMsgs")}</p>
                      </div>
                    </div>
                  </div>

                  {/* Owner + Last Login */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: POS.borderLight }}>
                    <p className="text-xs" style={{ color: POS.textMuted }}>
                      {t("saOwner")}: <span className="font-semibold" style={{ color: POS.textSecondary }}>{school.owner_name || "—"}</span>
                      {school.owner_email && <span> · {school.owner_email}</span>}
                    </p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: !school.owner_last_login ? POS.dangerLight : POS.successLight,
                        color: !school.owner_last_login ? POS.danger : POS.success,
                      }}>
                      <ClockIcon className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                      {timeAgo(school.owner_last_login ?? "")}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Account Settings Modal */}
      <Dialog open={showAccountSettings} onClose={() => setShowAccountSettings(false)} className="fixed z-50 inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: POS.shadowXl }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: POS.primaryLight }}>
              <KeyIcon className="w-5 h-5" style={{ color: POS.primary }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: POS.textPrimary }}>{t("accountSettings")}</h2>
              <p className="text-xs" style={{ color: POS.textMuted }}>{user?.email}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("username")}</label>
              <input value={acctUsername} onChange={e => setAcctUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: POS.border }}
                placeholder={t("username")} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("newPassword")}</label>
              <input type="password" value={acctPassword} onChange={e => setAcctPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: POS.border }}
                placeholder={t("leaveBlankToKeep")} />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowAccountSettings(false)} className="flex-1 py-3 rounded-xl border font-bold"
              style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
            <button onClick={handleSaveAccount} disabled={acctSaving || (!acctUsername && !acctPassword)}
              className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: POS.primary }}>{acctSaving ? t("loading") : t("save")}</button>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* Create School Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: POS.shadowXl }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-extrabold" style={{ color: POS.textPrimary }}>{t("createSchool")}</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl hover:bg-gray-100">
                <XMarkIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: POS.textMuted }}>{t("createSchoolDesc")}</p>

            <form onSubmit={(e) => { e.preventDefault(); if (!form.name || !form.admin_email || !form.admin_password) return; createMutation.mutate(form); }}
              className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("schoolName")} *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saContactEmail")}</label>
                  <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saContactPhone")}</label>
                  <input type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saAddress")}</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saPlan")}</label>
                  <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }}>
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saMaxStudents")}</label>
                  <input type="number" value={form.max_students} onChange={(e) => setForm({ ...form, max_students: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("saMaxStaff")}</label>
                  <input type="number" value={form.max_staff} onChange={(e) => setForm({ ...form, max_staff: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("notes")}</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border rounded-xl px-4 py-3 text-sm resize-none" style={{ borderColor: POS.border }} />
              </div>

              <div className="border-t pt-4" style={{ borderColor: POS.borderLight }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: POS.textPrimary }}>{t("saSchoolOwnerAccount")}</h3>
                <p className="text-xs mb-3" style={{ color: POS.textMuted }}>{t("saSchoolOwnerDesc")}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("schoolAdminName")} *</label>
                    <input type="text" required value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                      className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("schoolAdminEmail")} *</label>
                    <input type="email" required value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                      className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold mb-1 block" style={{ color: POS.textSecondary }}>{t("schoolAdminPassword")} *</label>
                    <input type="password" required minLength={6} value={form.admin_password}
                      onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                      className="w-full border rounded-xl px-4 py-3 text-sm" style={{ borderColor: POS.border }} />
                    <p className="text-xs mt-1" style={{ color: POS.textMuted }}>{t("minPasswordLength")}</p>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={createMutation.isPending}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                style={{ background: POS.primary }}>
                {createMutation.isPending ? t("saving") : t("createSchool")}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Detail Modal */}
      {detailSchool && (
        <SchoolDetailModal
          school={detailSchool}
          onClose={() => { setDetailSchool(null); qc.invalidateQueries({ queryKey: ["superadmin_schools"] }); }}
          onStatusChange={(status) => {
            updateStatusMutation.mutate({ id: detailSchool.school_id, status });
            setDetailSchool({ ...detailSchool, status });
          }}
        />
      )}
    </div>
  );
}
