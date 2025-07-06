// ─── src/SettingsPage.tsx ───────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useAuth }  from "./AuthContext";
import {
  PlusCircleIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

/* ---------- types ---------- */
interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "staff";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin";

  /* ---------- state ---------- */
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading,  setLoading ] = useState(false);
  const [err,      setErr     ] = useState<string|null>(null);

  /* ---------- invite form ---------- */
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMail, setInviteMail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePw,   setInvitePw  ] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin"|"staff">("staff");
  const [inviting,   setInviting ] = useState(false);

  /* ---------- edit dialog ---------- */
  const [editRow, setEditRow] = useState<Profile|null>(null);
  const [saving,  setSaving ] = useState(false);

  /* ---------- load users ---------- */
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

  /* ---------- invite helper ---------- */
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault(); setInviting(true); setErr(null);

    const { data: authRes, error: authErr } = await supabase
      .auth.admin.createUser({
        email:    inviteMail.trim().toLowerCase(),
        password: invitePw,
        email_confirm: true,
      });

    if (authErr) { setErr(authErr.message); setInviting(false); return; }
    const uid = authRes.user?.id;
    if (!uid)  { setErr("Auth returned no user id"); setInviting(false); return; }

    const { error: profErr } = await supabase
      .from("profiles")
      .insert([{ id: uid, email: inviteMail.trim().toLowerCase(),
                full_name: inviteName.trim() || null, role: inviteRole }]);

    if (profErr) setErr(profErr.message);
    else {
      setInviteMail(""); setInviteName(""); setInvitePw(""); setInviteRole("staff");
      refresh();
    }
    setInviting(false);
  }

  /* ---------- save edits ---------- */
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

  /* ---------- delete ---------- */
  async function remove(p: Profile) {
    if (p.role === "admin") return;
    if (!confirm("Remove this staff account?")) return;
    await supabase.from("profiles").delete().eq("id", p.id);
    refresh();
  }

  /* ---------- UI ---------- */
  return (
    <div className="p-8 space-y-8">

      {/* header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold">Settings</h1>
        {isAdmin && (
          <button onClick={() => setShowInvite(v => !v)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full">
            {showInvite ? <><XMarkIcon className="w-5 h-5"/>Close</>
                        : <><PlusCircleIcon className="w-5 h-5"/>Invite User</>}
          </button>
        )}
      </div>

      {/* invite form */}
      {showInvite && isAdmin && (
        <div className="bg-white shadow rounded-xl p-6 space-y-4 max-w-xl">
          {err && <p className="text-red-600">{err}</p>}
          <form onSubmit={handleInvite} className="grid gap-4 sm:grid-cols-2">
            <input type="email"   required placeholder="Email"
                   value={inviteMail}
                   onChange={e=>setInviteMail(e.target.value)}
                   className="border rounded px-3 py-2" />
            <input type="text"    required placeholder="Full name"
                   value={inviteName}
                   onChange={e=>setInviteName(e.target.value)}
                   className="border rounded px-3 py-2" />
            <input type="password" required placeholder="Temp password"
                   value={invitePw}
                   onChange={e=>setInvitePw(e.target.value)}
                   className="border rounded px-3 py-2" />
            <select value={inviteRole}
                    onChange={e=>setInviteRole(e.target.value as any)}
                    className="border rounded px-3 py-2">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <div className="sm:col-span-2 flex justify-end">
              <button disabled={inviting}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full">
                {inviting ? "Inviting…" : "Send Invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* users */}
      <h2 className="text-2xl font-semibold">Team Members</h2>
      {loading ? (
        <p>Loading…</p>
      ) : profiles.length === 0 ? (
        <p className="text-gray-600">No users.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(p => (
            <div key={p.id}
                 className="bg-white rounded-2xl shadow p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold">{p.full_name ?? "—"}</h3>
                <p className="text-sm text-gray-500 mt-1">{p.email}</p>
                <span className="inline-block mt-2 text-xs font-medium
                                bg-gray-100 px-3 py-1 rounded-full">
                  {p.role}
                </span>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => isAdmin && setEditRow(p)}
                  disabled={!isAdmin}
                  className={`flex-1 flex items-center justify-center gap-1
                              border rounded-full py-2 transition
                              ${isAdmin
                                ? "border-gray-200 hover:bg-gray-50"
                                : "opacity-50 cursor-not-allowed"}`}>
                  <PencilIcon className="w-5 h-5"/>
                  Edit
                </button>
                {isAdmin && p.role === "staff" && (
                  <button onClick={() => remove(p)}
                          className="flex-1 flex items-center justify-center gap-1
                                     border border-red-200 text-red-600
                                     rounded-full py-2 hover:bg-red-50">
                    <TrashIcon className="w-5 h-5"/>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* edit modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-semibold">Edit User</h2>

            <label className="block text-sm">Full name
              <input value={editRow.full_name ?? ""}
                     onChange={e=>setEditRow({...editRow, full_name: e.target.value})}
                     className="w-full border rounded px-3 py-2 mt-1"/>
            </label>

            <label className="block text-sm">E-mail (read-only)
              <input value={editRow.email ?? ""}
                     disabled
                     className="w-full border rounded px-3 py-2 mt-1 bg-gray-100"/>
            </label>

            {user?.id !== editRow.id && (
              <label className="block text-sm">Role
                <select value={editRow.role}
                        onChange={e=>setEditRow({...editRow, role: e.target.value as any})}
                        className="w-full border rounded px-3 py-2 mt-1">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={()=>setEditRow(null)}
                      className="px-4 py-2 rounded-full border hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={saveEdits} disabled={saving}
                      className="bg-blue-600 text-white px-4 py-2 rounded-full disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
