import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import {
  PlusCircleIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";

const WHITE = "#f6f6f6";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "staff";
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
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

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("role", { ascending: false });
    if (error) setErr(error.message);
    else {
      const list = data as Profile[];
      setProfiles(isAdmin ? list : list.filter(p => p.id === user?.id));
    }
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault(); setInviting(true); setErr(null);

    const { data: authRes, error: authErr } = await supabase
      .auth.admin.createUser({
        email: inviteMail.trim().toLowerCase(),
        password: invitePw,
        email_confirm: true,
      });

    if (authErr) { setErr(authErr.message); setInviting(false); return; }
    const uid = authRes.user?.id;
    if (!uid) { setErr(t("noUserIdError")); setInviting(false); return; }

    const { error: profErr } = await supabase
      .from("profiles")
      .insert([{
        id: uid, email: inviteMail.trim().toLowerCase(),
        full_name: inviteName.trim() || null, role: inviteRole
      }]);

    if (profErr) setErr(profErr.message);
    else {
      setInviteMail(""); setInviteName(""); setInvitePw(""); setInviteRole("staff");
      refresh();
    }
    setInviting(false);
  }

  async function saveEdits() {
    if (!editRow) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editRow.full_name, role: editRow.role })
      .eq("id", editRow.id);
    if (error) alert(error.message);
    else { setEditRow(null); refresh(); }
    setSaving(false);
  }

  async function remove(p: Profile) {
    if (p.role === "admin") return;
    if (!window.confirm(t("confirmRemoveStaff"))) return;
    await supabase.from("profiles").delete().eq("id", p.id);
    refresh();
  }

  return (
    <div className="py-8 px-2 min-h-screen" style={{ background: WHITE }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#6654b3]">{t("settingsTitle")}</h1>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(v => !v)}
            className="flex items-center gap-2 bg-[#6654b3] hover:bg-[#5542a0] text-white px-5 py-2 rounded-full transition font-semibold shadow"
          >
            {showInvite ? (
              <>
                <XMarkIcon className="w-5 h-5" />
                {t("closeInvite")}
              </>
            ) : (
              <>
                <PlusCircleIcon className="w-5 h-5" />
                {t("inviteUser")}
              </>
            )}
          </button>
        )}
      </div>

      {/* Invite Form */}
      {showInvite && isAdmin && (
        <div className="bg-white shadow rounded-2xl p-6 max-w-xl mx-auto mb-8 border border-purple-100">
          {err && <p className="text-red-600 mb-3">{err}</p>}
          <form onSubmit={handleInvite} className="grid gap-4 sm:grid-cols-2">
            <input type="email" required placeholder={t("email")}
              value={inviteMail}
              onChange={e => setInviteMail(e.target.value)}
              className="border rounded px-3 py-2"
              autoFocus
            />
            <input type="text" required placeholder={t("fullName")}
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <input type="password" required placeholder={t("tempPassword")}
              value={invitePw}
              onChange={e => setInvitePw(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <select value={inviteRole}
              onChange={e => setInviteRole(e.target.value as any)}
              className="border rounded px-3 py-2">
              <option value="staff">{t("roleStaff")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
            <div className="sm:col-span-2 flex justify-end mt-2">
              <button
                disabled={inviting}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-full font-bold transition disabled:opacity-60"
              >
                {inviting ? t("inviting") : t("sendInvite")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-[#6654b3] mb-5">{t("teamMembers")}</h2>
        {loading ? (
          <p>{t("loading")}</p>
        ) : profiles.length === 0 ? (
          <p className="text-gray-500">{t("noUsers")}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map(p => (
              <div key={p.id}
                className="bg-white rounded-2xl border border-purple-100 shadow p-6 flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-[#6654b3]">{p.full_name ?? "—"}</h3>
                  <p className="text-sm text-gray-500 mt-1">{p.email}</p>
                  <span className="inline-block mt-2 text-xs font-medium bg-[#f6f6f6] px-3 py-1 rounded-full text-[#6654b3] border border-purple-100">
                    {t("role_" + p.role)}
                  </span>
                </div>
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => isAdmin && setEditRow(p)}
                    disabled={!isAdmin}
                    className={`flex-1 flex items-center justify-center gap-1 border rounded-full py-2 transition font-semibold
                      ${isAdmin ? "border-purple-200 hover:bg-[#f6f6f6]" : "opacity-50 cursor-not-allowed"}`}
                  >
                    <PencilIcon className="w-5 h-5" />
                    {t("edit")}
                  </button>
                  {isAdmin && p.role === "staff" && (
                    <button onClick={() => remove(p)}
                      className="flex-1 flex items-center justify-center gap-1 border border-red-200 text-red-600 rounded-full py-2 hover:bg-red-50 font-semibold"
                    >
                      <TrashIcon className="w-5 h-5" />
                      {t("delete")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 border border-purple-100">
            <h2 className="text-xl font-bold text-[#6654b3]">{t("editUser")}</h2>
            <label className="block text-sm font-semibold text-[#6654b3]">
              {t("fullName")}
              <input value={editRow.full_name ?? ""}
                onChange={e => setEditRow({ ...editRow, full_name: e.target.value })}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>
            <label className="block text-sm font-semibold text-[#6654b3]">
              {t("emailReadOnly")}
              <input value={editRow.email ?? ""}
                disabled
                className="w-full border rounded px-3 py-2 mt-1 bg-gray-100"
              />
            </label>
            {user?.id !== editRow.id && (
              <label className="block text-sm font-semibold text-[#6654b3]">
                {t("role")}
                <select value={editRow.role}
                  onChange={e => setEditRow({ ...editRow, role: e.target.value as any })}
                  className="w-full border rounded px-3 py-2 mt-1">
                  <option value="staff">{t("roleStaff")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                </select>
              </label>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setEditRow(null)}
                className="px-4 py-2 rounded-full border border-purple-200 hover:bg-[#f6f6f6] text-[#6654b3] font-semibold">
                {t("cancel")}
              </button>
              <button onClick={saveEdits} disabled={saving}
                className="bg-[#6654b3] text-white px-4 py-2 rounded-full font-semibold disabled:opacity-50">
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
