import React, { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { PlusCircleIcon, XMarkIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";
import { useToast } from "./hooks/useToast";
import { POS } from "./theme";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "staff";
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

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
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCreateSchool, setShowCreateSchool] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolAdminEmail, setSchoolAdminEmail] = useState("");
  const [schoolAdminPw, setSchoolAdminPw] = useState("");
  const [schoolAdminName, setSchoolAdminName] = useState("");
  const [creatingSchool, setCreatingSchool] = useState(false);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.from("profiles").select("*").order("role", { ascending: false });
    if (error) setErr(error.message);
    else setProfiles(isAdmin ? (data as Profile[]) : (data as Profile[]).filter(p => p.id === user?.id));
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
    const { error } = await supabase.from("profiles").update({ full_name: editRow.full_name, role: editRow.role }).eq("id", editRow.id);
    if (error) toast(error.message, "error");
    else { setEditRow(null); toast(t("userUpdated"), "success"); refresh(); }
    setSaving(false);
  }

  async function handleCreateSchool(e: React.FormEvent) {
    e.preventDefault(); setCreatingSchool(true); setErr(null);
    const { error } = await supabase.rpc("create_school", {
      p_school_name: schoolName.trim(),
      p_admin_email: schoolAdminEmail.trim().toLowerCase(),
      p_admin_password: schoolAdminPw,
      p_admin_name: schoolAdminName.trim(),
    });
    if (error) setErr(error.message);
    else {
      setSchoolName(""); setSchoolAdminEmail(""); setSchoolAdminPw(""); setSchoolAdminName("");
      setShowCreateSchool(false);
      toast(t("schoolCreated"), "success");
    }
    setCreatingSchool(false);
  }

  async function remove() {
    if (!deleteTarget || deleteTarget.role === "admin") return;
    setDeleting(true);
    await supabase.from("profiles").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    toast(t("userDeleted"), "success");
    refresh();
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold" style={{ color: POS.textPrimary }}>{t("settingsTitle")}</h1>
        {isAdmin && (
          <button onClick={() => setShowInvite(v => !v)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm transition"
            style={{ background: POS.primary, minHeight: POS.touchComfortable }}>
            {showInvite ? <><XMarkIcon className="w-5 h-5" />{t("closeInvite")}</>
              : <><PlusCircleIcon className="w-5 h-5" />{t("inviteUser")}</>}
          </button>
        )}
      </div>

      {err && <p className="mb-4 text-sm font-semibold" style={{ color: POS.danger }}>{err}</p>}

      {/* Invite Form */}
      {showInvite && isAdmin && (
        <div className="bg-white rounded-2xl p-5 mb-6 border" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
          <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-2">
            <input type="email" required placeholder={t("email")} value={inviteMail} onChange={e => setInviteMail(e.target.value)}
              className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }} />
            <input type="text" required placeholder={t("name")} value={inviteName} onChange={e => setInviteName(e.target.value)}
              className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }} />
            <div>
              <input type="password" required placeholder={t("tempPassword")} value={invitePw} onChange={e => setInvitePw(e.target.value)}
                className="border rounded-xl px-4 py-3 w-full" style={{ borderColor: POS.border }} />
              <p className="text-xs mt-1" style={{ color: POS.textMuted }}>{t("minPasswordLength")}</p>
            </div>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
              className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }}>
              <option value="staff">{t("roleStaff")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
            <div className="sm:col-span-2 flex justify-end">
              <button disabled={inviting}
                className="px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.success }}>
                {inviting ? t("inviting") : t("sendInvite")}
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
                    style={{ background: p.role === "admin" ? POS.primary : POS.info }}>
                    {(p.full_name || p.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color: POS.textPrimary }}>{p.full_name ?? "—"}</h3>
                    <p className="text-xs" style={{ color: POS.textMuted }}>{p.email}</p>
                  </div>
                </div>
                <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: p.role === "admin" ? POS.bgSurface : POS.infoLight, color: p.role === "admin" ? POS.primary : POS.info }}>
                  {t("role_" + p.role)}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => isAdmin && setEditRow(p)} disabled={!isAdmin}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border font-semibold text-sm transition"
                  style={{ borderColor: POS.border, color: POS.textSecondary, opacity: isAdmin ? 1 : 0.5 }}>
                  <PencilIcon className="w-4 h-4" /> {t("edit")}
                </button>
                {isAdmin && p.role === "staff" && (
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

      {/* Edit Modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={() => setEditRow(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" style={{ boxShadow: POS.shadowXl }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold" style={{ color: POS.primary }}>{t("editUser")}</h2>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("name")}</span>
              <input value={editRow.full_name ?? ""} onChange={e => setEditRow({ ...editRow, full_name: e.target.value })}
                className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("emailReadOnly")}</span>
              <input value={editRow.email ?? ""} disabled className="w-full border rounded-xl px-4 py-3 mt-1 bg-gray-50" style={{ borderColor: POS.border }} />
            </label>
            {user?.id !== editRow.id && (
              <label className="block">
                <span className="text-sm font-semibold" style={{ color: POS.textSecondary }}>{t("role")}</span>
                <select value={editRow.role} onChange={e => setEditRow({ ...editRow, role: e.target.value as any })}
                  className="w-full border rounded-xl px-4 py-3 mt-1" style={{ borderColor: POS.border }}>
                  <option value="staff">{t("roleStaff")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                </select>
              </label>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditRow(null)} className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
              <button onClick={saveEdits} disabled={saving} className="flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: POS.primary }}>{saving ? t("saving") : t("save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create School Section */}
      {isAdmin && (
        <>
          <div className="flex justify-between items-center mt-10 mb-4">
            <h2 className="text-lg font-bold" style={{ color: POS.textPrimary }}>{t("createSchool")}</h2>
            <button onClick={() => setShowCreateSchool(v => !v)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm transition"
              style={{ background: POS.info, minHeight: POS.touchComfortable }}>
              {showCreateSchool ? <><XMarkIcon className="w-5 h-5" />{t("close")}</>
                : <><PlusCircleIcon className="w-5 h-5" />{t("createSchool")}</>}
            </button>
          </div>
          <p className="text-sm mb-4" style={{ color: POS.textMuted }}>{t("createSchoolDesc")}</p>
          {showCreateSchool && (
            <div className="bg-white rounded-2xl p-5 mb-6 border" style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
              <form onSubmit={handleCreateSchool} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <input type="text" required placeholder={t("schoolName")} value={schoolName} onChange={e => setSchoolName(e.target.value)}
                    className="border rounded-xl px-4 py-3 w-full" style={{ borderColor: POS.border }} />
                </div>
                <input type="text" required placeholder={t("schoolAdminName")} value={schoolAdminName} onChange={e => setSchoolAdminName(e.target.value)}
                  className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }} />
                <input type="email" required placeholder={t("schoolAdminEmail")} value={schoolAdminEmail} onChange={e => setSchoolAdminEmail(e.target.value)}
                  className="border rounded-xl px-4 py-3" style={{ borderColor: POS.border }} />
                <div>
                  <input type="password" required placeholder={t("schoolAdminPassword")} value={schoolAdminPw} onChange={e => setSchoolAdminPw(e.target.value)}
                    className="border rounded-xl px-4 py-3 w-full" style={{ borderColor: POS.border }} />
                  <p className="text-xs mt-1" style={{ color: POS.textMuted }}>{t("minPasswordLength")}</p>
                </div>
                <div className="flex items-end">
                  <button disabled={creatingSchool}
                    className="w-full px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50"
                    style={{ background: POS.info }}>
                    {creatingSchool ? t("loading") : t("createSchool")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
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
