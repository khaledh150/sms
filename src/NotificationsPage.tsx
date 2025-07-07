import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { BellIcon, CheckIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";

export interface Noti {
  id: string;
  student_id: string | null;
  type: string;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
}

function pretty(n: Noti, t: (k: string, p?: any) => string) {
  switch (n.type) {
    case "new_application":
      return t("newApplication", { name: n.payload.name || `${n.payload.first} ${n.payload.last}` });
    case "course_limit":
      return t("courseLimitReached", { name: n.payload.student_name });
    case "edit_request":
      return t("editRequestFrom", { name: n.payload.student_name });
    default:
      return t(n.type.replace(/_/g, ""), n.payload) || n.type.replace(/_/g, " ");
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

export default function NotificationsPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [rows, setRows] = useState<Noti[]>([]);
  const [loading, setLoading] = useState(true);
  const realtimeRef = useRef<RealtimeChannel | null>(null);

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

  useEffect(() => {
    if (realtimeRef.current) return;
    realtimeRef.current = supabase
      .channel("notifications_live")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        ({ new: newRow }) => setRows((prev) => dedupe([newRow as Noti, ...prev]))
      )
      .subscribe();
    return () => {
      if (import.meta.env.PROD && realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, []);

  // MouseEvent must be type-only import, not value import
  const markRead = async (n: Noti, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (n.read) return;
    setRows((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
  };

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
        return;
    }
    markRead(n);
  };

  if (loading) return <p className="p-8">{t("loading")}</p>;

  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <BellIcon className="w-6 h-6 text-[#6654b3]" />
        <h1 className="text-2xl font-bold text-[#6654b3]">
          {t("notifications")}{" "}
          {unread > 0 && <span className="text-[#ec4899]">({unread})</span>}
        </h1>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-600">{t("noNotifications")}</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((n) => (
            <li
              key={n.id}
              onClick={() => go(n)}
              className={`border rounded-xl p-4 cursor-pointer hover:bg-[#ede9fe] transition
                          ${n.read ? "bg-white" : "bg-purple-50"}`}
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-medium">{pretty(n, t)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={(e) => markRead(n, e)}
                    className="text-[#6654b3] hover:underline text-xs flex items-center gap-1"
                  >
                    <CheckIcon className="w-4 h-4" /> {t("markRead")}
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
