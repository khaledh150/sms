// ─── src/NotificationsPage.tsx (final) ───────────────────────────────────────
import React, {
  useState, useEffect, useRef, MouseEvent, Fragment,
} from "react";
import { useNavigate } from "react-router-dom";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { BellIcon, CheckIcon } from "@heroicons/react/24/solid";

/* ---------- types ---------- */
export interface Noti {
  id: string;
  student_id: string | null;
  type: string;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
}

/* ---------- helpers ---------- */
function pretty(n: Noti) {
  switch (n.type) {
    case "new_application":
      return `New application · ${n.payload.name || `${n.payload.first} ${n.payload.last}`}`;
    case "course_limit":
      return `Course limit reached · ${n.payload.student_name}`;
    case "edit_request":
      return `Edit request from ${n.payload.student_name}`;
    default:
      return n.type.replaceAll("_", " ");
  }
}

function dedupe(list: Noti[]) {
  const seen = new Set<string>();
  const out: Noti[] = [];
  for (const n of list) {
    const key = `${n.type}_${n.payload.application_id ?? ""}_${n.created_at}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────── */
export default function NotificationsPage() {
  const nav                     = useNavigate();
  const [rows, setRows]         = useState<Noti[]>([]);
  const [loading, setLoading]   = useState(true);
  const realtimeRef             = useRef<RealtimeChannel | null>(null);

  /* ── initial load ──────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) console.error(error);
      else setRows(dedupe(data as Noti[]));
      setLoading(false);
    })();
  }, []);

  /* ── realtime channel (single-instance) ────────────────────────────────── */
  useEffect(() => {
    if (realtimeRef.current) return;   // nothing to do

    realtimeRef.current = supabase
      .channel("notifications_live")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        ({ new: newRow }) =>
          setRows((prev) => dedupe([newRow as Noti, ...prev])),
      )
      .subscribe();

    return () => {
      if (import.meta.env.PROD && realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, []);

  /* ── mark-read helper ──────────────────────────────────────────────────── */
  const markRead = async (n: Noti, e?: MouseEvent) => {
    e?.stopPropagation();
    if (n.read) return;
    setRows((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
  };

  /* ── click-through routing ─────────────────────────────────────────────── */
  const go = (n: Noti) => {
    switch (n.type) {
      case "new_application":
        nav(`/admissions?view=review&app=${n.payload.application_id}`);
        break;
      case "course_limit":
      case "edit_request":
        nav(`/myschool/student/${n.student_id}`);
        break;
      default:
        return; // no route
    }
    markRead(n);
  };

  /* ── render ────────────────────────────────────────────────────────────── */
  if (loading) return <p className="p-8">Loading…</p>;

  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-2">
        <BellIcon className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold">
          Notifications {unread > 0 && <span className="text-blue-600">({unread})</span>}
        </h1>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-600">No notifications.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((n) => (
            <li
              key={n.id}
              onClick={() => go(n)}
              className={`border rounded-xl p-4 cursor-pointer hover:bg-gray-50 transition
                          ${n.read ? "bg-white" : "bg-blue-50"}`}
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-medium">{pretty(n)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>

                {!n.read && (
                  <button
                    onClick={(e) => markRead(n, e)}
                    className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                  >
                    <CheckIcon className="w-4 h-4" /> Read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
