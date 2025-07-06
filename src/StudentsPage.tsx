import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import {
  ArrowDownTrayIcon,
  PrinterIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";

const SOFT_PURPLE = "#6654b3";
const SOFT_WHITE = "#f6f6f6";

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  parent_phone: string;
  parent_line_id: string;
  joined_at: string;
};

function fetchStudents() {
  return supabase
    .from("students")
    .select(
      "id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at"
    )
    .order("joined_at", { ascending: false });
}

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  // --- React Query fetch ---
  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["students"],
    queryFn: fetchStudents,
    staleTime: 1000 * 60 * 10, // 10min cache
    refetchOnWindowFocus: false,
  });

  const students: Student[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.nick_name || "")
          .toLowerCase()
          .includes(q) ||
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.parent_phone.includes(q) ||
        (s.parent_line_id || "").toLowerCase().includes(q)
    );
  }, [students, search]);

  return (
    <div
      className="min-h-screen flex flex-col items-center py-8 px-2 sm:px-6 font-sans"
      style={{ background: SOFT_WHITE }}
    >
      {/* Header */}
      <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: SOFT_PURPLE }}
          >
            Students
          </h1>
          <span
            className="ml-2 px-3 py-1 rounded-full text-lg font-semibold"
            style={{
              background: "#ebe7f7",
              color: SOFT_PURPLE,
              border: `1px solid #e1def5`
            }}
          >
            {students.length}
          </span>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0">
          <input
            type="text"
            placeholder="Search students…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-2xl border border-[#e1def5] px-4 py-2 bg-white shadow focus:outline-none focus:ring-2 focus:ring-[#6654b3] transition w-56"
            style={{ color: SOFT_PURPLE }}
          />
          <button
            onClick={() => navigate("/admissions")}
            className="flex items-center gap-1 font-semibold px-4 py-2 rounded-2xl transition active:scale-95"
            style={{
              background: SOFT_PURPLE,
              color: "#fff",
              boxShadow: "0 2px 8px 0 rgba(102,84,179,0.06)"
            }}
          >
            <PlusIcon className="w-5 h-5" /> Add a student
          </button>
          <button
            onClick={() => setExportOpen(true)}
            disabled={!selectedRows.size}
            className="flex items-center gap-1 font-semibold px-4 py-2 rounded-2xl transition active:scale-95 disabled:opacity-60"
            style={{
              background: "#ec4899",
              color: "#fff",
              boxShadow: "0 2px 8px 0 rgba(102,84,179,0.02)"
            }}
          >
            <ArrowDownTrayIcon className="w-5 h-5" /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="w-full max-w-6xl mx-auto overflow-x-auto">
        {loading ? (
          <div className="text-center text-[#a7a3c0] py-10">Loading…</div>
        ) : error ? (
          <div className="text-red-500 py-10 text-center">{error.message || error.toString()}</div>
        ) : (
          <table
            className="w-full min-w-[650px] rounded-2xl"
            style={{
              background: "#fff",
              borderCollapse: "separate",
              borderSpacing: 0,
              boxShadow: "0 2px 18px 0 rgba(102,84,179,0.05)",
              border: "1.5px solid #e1def5"
            }}
          >
            <thead
              style={{
                background: "#f6f6f6"
              }}
            >
              <tr>
                <th className="px-2 py-3 rounded-l-2xl">
                  <input
                    type="checkbox"
                    className="accent-[#6654b3]"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((s) => selectedRows.has(s.id))
                    }
                    onChange={(e) => {
                      const all = new Set(selectedRows);
                      if (e.target.checked)
                        filtered.forEach((s) => all.add(s.id));
                      else
                        filtered.forEach((s) => all.delete(s.id));
                      setSelectedRows(all);
                    }}
                  />
                </th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>#</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Nick name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>First name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Last name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Parent Phone</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Line ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[#b0b0b0] py-8">
                    No students found.
                  </td>
                </tr>
              ) : (
                filtered.map((s, idx) => (
                  <tr
                    key={s.id}
                    className="transition"
                    style={{
                      animation: "fadein 0.3s",
                      background: selectedRows.has(s.id) ? "#f6e6fa" : "inherit"
                    }}
                  >
                    <td className="px-2 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        className="accent-[#6654b3]"
                        checked={selectedRows.has(s.id)}
                        onChange={(e) => {
                          const nxt = new Set(selectedRows);
                          e.target.checked ? nxt.add(s.id) : nxt.delete(s.id);
                          setSelectedRows(nxt);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">{idx + 1}</td>
                    <td
                      className="px-2 py-2 align-middle font-semibold"
                      style={{ color: SOFT_PURPLE }}
                    >
                      {s.nick_name || <span className="text-[#d3d3e0]">—</span>}
                    </td>
                    <td
                      className="px-2 py-2 align-middle font-semibold cursor-pointer hover:underline"
                      style={{ color: "#3a38a0" }}
                      onClick={() => navigate(`/myschool/student/${s.id}`)}
                    >
                      {s.first_name}
                    </td>
                    <td className="px-2 py-2 align-middle">{s.last_name}</td>
                    <td className="px-2 py-2 align-middle font-mono">
                      {s.parent_phone}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <span
                        className="rounded-xl px-2 py-1 text-xs font-semibold"
                        style={{
                          background: "#ebe7f7",
                          color: SOFT_PURPLE,
                          border: `1px solid #e1def5`
                        }}
                      >
                        {s.parent_line_id || "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Export modal */}
      {exportOpen && (
        <div className="fixed z-50 inset-0 bg-black/40 flex items-center justify-center">
          <div
            className="rounded-2xl shadow-lg p-6 max-w-md w-full relative"
            style={{ background: "#fff" }}
          >
            <button
              className="absolute right-4 top-4 text-[#c2bce5] hover:text-[#ec4899]"
              onClick={() => setExportOpen(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-bold mb-3" style={{ color: "#ec4899" }}>
              Export Students ({selectedRows.size})
            </h2>
            <div className="flex gap-2 justify-between">
              <button
                onClick={() => {
                  // CSV Export
                  const selected = students.filter((s) => selectedRows.has(s.id));
                  const header = [
                    "No.",
                    "Nick name",
                    "First name",
                    "Last name",
                    "Parent phone",
                    "Line ID",
                  ];
                  const rows = selected.map((s, i) => [
                    i + 1,
                    `"${s.nick_name || ""}"`,
                    `"${s.first_name}"`,
                    `"${s.last_name}"`,
                    `"${s.parent_phone}"`,
                    `"${s.parent_line_id || ""}"`,
                  ]);
                  const csv =
                    [header, ...rows].map((r) => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `students_export_${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setExportOpen(false);
                }}
                className="rounded-xl px-4 py-2 font-semibold flex items-center gap-1"
                style={{
                  background: "#34d399",
                  color: "#fff",
                }}
              >
                <ArrowDownTrayIcon className="w-5 h-5" /> Export CSV
              </button>
              <button
                onClick={() => {
                  window.print();
                  setExportOpen(false);
                }}
                className="rounded-xl px-4 py-2 font-semibold flex items-center gap-1"
                style={{
                  background: SOFT_PURPLE,
                  color: "#fff",
                }}
              >
                <PrinterIcon className="w-5 h-5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadein { from { opacity:0; transform: scale(0.98);} to { opacity:1; transform: scale(1);} }
      `}</style>
    </div>
  );
}
