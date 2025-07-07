import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabaseClient";
import {
  XMarkIcon, CheckIcon, XCircleIcon,
  DocumentArrowDownIcon, PrinterIcon, UserCircleIcon,
  ChevronDownIcon, ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Dialog } from "@headlessui/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

// Soft purple & white
const SOFT_PURPLE = "#6654b3";
const SOFT_WHITE = "#f6f6f6";

const groupMeta = {
  new_application: { labelKey: "newApplications", color: SOFT_PURPLE, text: "#fff" },
  renewal:         { labelKey: "renewals",         color: "#e6e1f7",   text: SOFT_PURPLE },
  edit:            { labelKey: "courseChanges",    color: "#edeaf7",   text: SOFT_PURPLE }
};

function ReceiptsPanel({ urls, open, onClose }: { urls: string[], open: boolean, onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center bg-black/30">
      <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-[#6654b3]">
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-bold mb-2" style={{ color: SOFT_PURPLE }}>{t("receipts")}</h2>
        <div className="space-y-3">
          {urls.map((u) => (
            <div key={u} className="rounded-lg border border-[#e1def5] bg-[#f6f6f6] px-3 py-2 flex items-center gap-3">
              <span className="flex-1 truncate" style={{ color: SOFT_PURPLE }}>{decodeURIComponent(u.split("/").slice(-1)[0])}</span>
              <button
                className="hover:underline text-xs font-bold"
                style={{ color: SOFT_PURPLE }}
                onClick={() => window.open(u, "_blank")}
              >{t("open")}</button>
              <button
                className="hover:underline text-xs font-bold flex items-center gap-1"
                style={{ color: SOFT_PURPLE }}
                onClick={async () => {
                  const res = await fetch(u); const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob); a.download = u.split("/").slice(-1)[0]; a.click();
                }}
              ><DocumentArrowDownIcon className="w-4 h-4 inline" /> {t("download")}</button>
              <button
                className="hover:underline text-xs font-bold flex items-center gap-1"
                style={{ color: SOFT_PURPLE }}
                onClick={() => {
                  const iframe = document.createElement("iframe");
                  iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.top = "0";
                  iframe.style.width = "0"; iframe.style.height = "0"; iframe.src = u; document.body.appendChild(iframe);
                  iframe.onload = () => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); };
                }}
              ><PrinterIcon className="w-4 h-4 inline" /> {t("print")}</button>
            </div>
          ))}
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, cur) => {
    const key = keyFn(cur);
    (acc[key] ||= []).push(cur);
    return acc;
  }, {} as Record<string, T[]>);
}

export default function ReviewHubPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [receipts, setReceipts] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    new_application: false, renewal: false, edit: false
  });

  // Fetch courses
  const { data: courses = [] } = useQuery({
    queryKey: ["courses", "names"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id,name");
      return data || [];
    },
    staleTime: 5 * 60 * 1000
  });

  // Fetch applications & changes
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["reviewHub", "pending"],
    queryFn: async () => {
      const [apps, changes] = await Promise.all([
        supabase.from("applications").select("*").eq("status", "pending").order("created_at", { ascending: true }),
        supabase.from("application_changes").select("*").eq("status", "pending").order("created_at", { ascending: true }),
      ]);
      return [
        ...(apps.data || []).map(a => ({ ...a, group: "new_application" })),
        ...(changes.data || []).map(a => ({ ...a, group: a.type }))
      ];
    },
    staleTime: 20 * 1000,
  });

  // Fetch submitters
  const submitterIds = useMemo(
    () => Array.from(new Set((allItems || []).map(r => r.submitted_by).filter(Boolean))),
    [allItems]
  );
  const { data: submitters = {} } = useQuery({
    queryKey: ["submitters", ...submitterIds],
    queryFn: async () => {
      const map: Record<string, any> = {};
      await Promise.all(
        submitterIds.map(async id => {
          const { data } = await supabase.from("profiles").select("full_name,email").eq("id", id).single();
          if (data) map[id] = data;
        })
      );
      return map;
    },
    enabled: submitterIds.length > 0
  });

  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c.name])), [courses]);
  const groups = useMemo(() => groupBy(allItems, r => r.group), [allItems]);

  function toggleSelect(group: string, id: string) {
    setSelected(s => ({
      ...s,
      [group]: new Set([...Array.from(s[group] || []), ...(s[group]?.has(id) ? [] : [id])].filter(i => i !== id || !s[group]?.has(id)))
    }));
  }
  function toggleSelectAll(group: string) {
    const all = new Set(groups[group]?.map(r => r.id) || []);
    setSelected(s => ({
      ...s,
      [group]: s[group]?.size === all.size ? new Set() : all
    }));
  }

  async function handleApprove(group: string) {
    const ids = Array.from(selected[group] || []);
    if (!ids.length) return;
    if (!window.confirm(t("approveConfirm", { count: ids.length }))) return;
    let update;
    if (group === "new_application") {
      update = supabase.from("applications").update({ status: "approved" }).in("id", ids);
    } else {
      update = supabase.from("application_changes").update({ status: "approved", reviewed_at: new Date().toISOString() }).in("id", ids);
    }
    await update;
    queryClient.invalidateQueries({ queryKey: ["reviewHub", "pending"] });
    setSelected(s => ({ ...s, [group]: new Set() }));
  }
  async function handleReject(group: string) {
    const ids = Array.from(selected[group] || []);
    if (!ids.length) return;
    if (!window.confirm(t("rejectConfirm", { count: ids.length }))) return;
    if (group === "new_application") {
      await supabase.from("applications").delete().in("id", ids);
    } else {
      await supabase.from("application_changes").delete().in("id", ids);
    }
    queryClient.invalidateQueries({ queryKey: ["reviewHub", "pending"] });
    setSelected(s => ({ ...s, [group]: new Set() }));
  }

  if (isLoading)
    return (
      <div className="p-10 flex items-center justify-center" style={{ background: SOFT_WHITE, minHeight: "100vh" }}>
        <span className="animate-bounce w-5 h-5 rounded-full" style={{ background: SOFT_PURPLE, marginRight: 8 }} />
        <span className="animate-bounce w-5 h-5 rounded-full" style={{ background: "#e6e1f7", marginRight: 8 }} />
        <span className="animate-bounce w-5 h-5 rounded-full" style={{ background: "#edeaf7" }} />
      </div>
    );

  return (
    <div
      className="min-h-screen flex flex-col items-center py-8 px-2 sm:px-6 font-sans"
      style={{ background: SOFT_WHITE }}
    >
      <div className="w-full max-w-5xl space-y-8">
        {Object.entries(groupMeta).map(([group, meta]) => (
          <div
            key={group}
            className="mb-4 border rounded-2xl shadow-sm"
            style={{
              borderColor: "#e1def5",
              background: "#fff"
            }}
          >
            <button
              className="w-full flex items-center justify-between px-6 py-4 text-lg font-bold focus:outline-none rounded-t-2xl transition-all"
              style={{
                background: meta.color,
                color: meta.text,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16
              }}
              onClick={() => setExpanded(e => ({ ...e, [group]: !e[group] }))}
            >
              <div className="flex items-center gap-2">
                {expanded[group] ? <ChevronDownIcon className="w-6 h-6" /> : <ChevronRightIcon className="w-6 h-6" />}
                {t(meta.labelKey)}
                <span
                  className="ml-2 rounded-full px-3 py-1 text-base font-bold border"
                  style={{
                    background: "#fff",
                    color: SOFT_PURPLE,
                    borderColor: "#e1def5"
                  }}
                >
                  {groups[group]?.length || 0}
                </span>
              </div>
            </button>
            {expanded[group] && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex flex-wrap gap-2 items-center my-3">
                  <button
                    className="rounded-full px-3 py-1 border text-xs font-bold transition"
                    style={{
                      borderColor: SOFT_PURPLE,
                      color: SOFT_PURPLE,
                      background: "#f6f6f6"
                    }}
                    onClick={() => toggleSelectAll(group)}
                  >
                    {selected[group]?.size === (groups[group]?.length || 0)
                      ? t("unselectAll") : t("selectAll")}
                  </button>
                  <button
                    className="px-3 py-1 rounded-full font-bold text-xs transition"
                    style={{
                      background: SOFT_PURPLE,
                      color: "#fff",
                      opacity: !(selected[group]?.size) ? 0.5 : 1
                    }}
                    disabled={!(selected[group]?.size)}
                    onClick={() => handleApprove(group)}
                  ><CheckIcon className="w-4 h-4 inline" /> {t("approve")}</button>
                  <button
                    className="px-3 py-1 rounded-full font-bold text-xs transition"
                    style={{
                      background: "#ec4899",
                      color: "#fff",
                      opacity: !(selected[group]?.size) ? 0.5 : 1
                    }}
                    disabled={!(selected[group]?.size)}
                    onClick={() => handleReject(group)}
                  ><XCircleIcon className="w-4 h-4 inline" /> {t("reject")}</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(groups[group] || []).map(row => {
                    const receipts: string[] =
                      row.group === "new_application"
                        ? (row.payment_receipt_urls || [])
                        : (row.changes?.receipts || row.receipt_urls || []);
                    const nickname = row.nickname || row.nick_name || row.nick || "";
                    const first = row.first_name || row.first || "";
                    const last = row.last_name || row.last || "";
                    const submitter = row.submitted_by ? (submitters[row.submitted_by]?.full_name || row.submitted_by) : "-";
                    let courseRows: any[] = [];
                    if (row.group === "new_application") {
                      courseRows = Object.entries(row.courses || {}).map(([cid, days]: any) => ({
                        cid, days, hours: row.course_limits?.[cid] || 0
                      }));
                    } else if (row.type === "edit") {
                      courseRows = Object.entries(row.changes?.course_changes || {}).map(([cid, days]: any) => ({
                        cid, days, hours: row.changes.course_limits?.[cid] || 0
                      }));
                    } else if (row.type === "renewal") {
                      courseRows = Object.entries(row.changes?.course_limits || {}).map(([cid, hours]: any) => ({
                        cid, days: null, hours
                      }));
                    }
                    return (
                      <div
                        key={row.id}
                        className={clsx(
                          "rounded-2xl border p-4 space-y-2 flex flex-col relative transition",
                          selected[group]?.has(row.id) && "ring-2"
                        )}
                        style={{
                          borderColor: "#edeaf7",
                          background: "#fff",
                          boxShadow: "0 2px 8px 0 rgba(102,84,179,0.03)",
                          ...(selected[group]?.has(row.id) ? { boxShadow: `0 0 0 3px ${SOFT_PURPLE}40` } : {}
                          )
                        }}
                      >
                        <label className="absolute top-3 left-3">
                          <input type="checkbox"
                            checked={selected[group]?.has(row.id)}
                            onChange={() => toggleSelect(group, row.id)}
                            className="accent-[#6654b3] w-5 h-5"
                          />
                        </label>
                        <div className="pl-8">
                          <div className="flex items-center gap-2 mb-1">
                            <UserCircleIcon className="w-8 h-8" style={{ color: SOFT_PURPLE }} />
                            <div>
                              <div className="font-bold text-base" style={{ color: SOFT_PURPLE }}>
                                {nickname ? `"${nickname}"` : ""} {first} {last}
                              </div>
                              <div className="text-xs text-gray-500">
                                <span>{t("submittedBy")}: </span>
                                <span>{submitter}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {row.parent_phone && <>{t("phone")}: {row.parent_phone} </>}
                                {row.parent_line_id && <>{t("lineId")}: {row.parent_line_id} </>}
                                {row.dob && <>{t("dob")}: {new Date(row.dob).toLocaleDateString("en-GB")}</>}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {t("submittedAt")}: {new Date(row.created_at).toLocaleString("en-GB")}
                          </div>
                          <div className="my-2">
                            {courseRows.map((cr) => (
                              <div key={cr.cid} className="mb-1">
                                <div className="font-semibold" style={{ color: SOFT_PURPLE }}>
                                  {t("course")}: {courseMap[cr.cid] || cr.cid}
                                </div>
                                {cr.days && Object.entries(cr.days).map(([day, times]: any) =>
                                  <div key={day} className="ml-2 text-sm">
                                    <span className="font-semibold">{day}:</span>{" "}
                                    {(Array.isArray(times) ? times : []).join(", ")}
                                  </div>
                                )}
                                <div className="ml-2 text-sm">
                                  <span className="font-semibold">{t("hours")}:</span> {cr.hours}
                                </div>
                              </div>
                            ))}
                          </div>
                          {receipts && receipts.length > 0 && <div className="mb-2" />}
                          {receipts && receipts.length > 0 && (
                            <button
                              className="rounded-full px-3 py-1 text-xs font-bold"
                              style={{
                                background: "#e6e1f7",
                                color: SOFT_PURPLE
                              }}
                              onClick={() => setReceipts(receipts)}
                            >{t("viewReceipts", { count: receipts.length })}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {receipts && <ReceiptsPanel urls={receipts} open={!!receipts} onClose={() => setReceipts(null)} />}
      <style>{`
        @keyframes fadein { from { opacity:0; transform: scale(0.98);} to { opacity:1; transform: scale(1);} }
      `}</style>
    </div>
  );
}
