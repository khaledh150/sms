import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import {
  ArrowDownTrayIcon,
  PrinterIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

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
  status?: string;
};

type Course = {
  id: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
};

function fetchInactiveStudents() {
  return supabase
    .from("students")
    .select(
      "id,first_name,last_name,nick_name,parent_phone,parent_line_id,joined_at,status"
    )
    .not("status", "in", '("active","ongoing")')
    .order("joined_at", { ascending: false });
}

function fetchCourses() {
  return supabase
    .from("courses")
    .select("id,name,weekdays,times")
    .order("name");
}

function RenewModal({ open, onClose, student, onSubmitted }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // State for the form
  const [courseId, setCourseId] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [hours, setHours] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();

  // Fetch courses
  const { data: coursesData } = useQuery({
    queryKey: ["courses", "renewal"],
    queryFn: fetchCourses,
    staleTime: 60_000,
  });
  const courses: Course[] = coursesData?.data || [];
  const selectedCourse = courses.find(c => c.id === courseId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    // Validate
    if (!courseId || !day || !time || !hours || !receiptFile) {
      setError("All fields are required.");
      setSaving(false);
      return;
    }
    // Upload receipt to supabase storage
    const fn = `${Date.now()}-${Math.random().toString(36).slice(2)}.${receiptFile.name.split(".").pop()}`;
    const { data: uploadData, error: uploadError } = await supabase.storage.from("receipts").upload(fn, receiptFile, { cacheControl: "3600" });
    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
    const receiptUrl = urlData.publicUrl;

    if (isAdmin) {
      // Immediate renewal (update student record)
      const { error: updateErr } = await supabase
        .from("students")
        .update({
          // Append or set course/slot/hours purchased; adjust per your schema
          course_limits: { [courseId]: Number(hours) },
          receipts: { [courseId]: [receiptUrl] },
          status: "active",
        })
        .eq("id", student.id);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
    } else {
      // Submit as application for admin to review
      const { error: insErr } = await supabase.from("applications").insert([{
        student_id: student.id,
        courses: { [courseId]: { [day]: [time] } },
        course_limits: { [courseId]: Number(hours) },
        payment_receipt_urls: [receiptUrl],
        status: "pending",
        type: "renewal",
        requested_at: new Date().toISOString(),
      }]);
      if (insErr) {
        setError(insErr.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    queryClient.invalidateQueries(["students", "inactive"]);
    onSubmitted();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed z-50 inset-0 bg-black/40 flex items-center justify-center">
      <form
        className="bg-white rounded-3xl shadow-lg p-6 max-w-md w-full relative"
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="absolute right-4 top-4 text-[#c2bce5] hover:text-[#ec4899]"
          onClick={onClose}
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold mb-3" style={{ color: SOFT_PURPLE }}>
          Renew Enrollment
        </h2>
        <div className="mb-3 text-sm">
          Student: <span className="font-bold">{student.nick_name || student.first_name}</span>
        </div>
        <label className="block mb-2">
          Course
          <select
            className="border rounded px-2 py-1 w-full mt-1"
            value={courseId}
            onChange={e => {
              setCourseId(e.target.value);
              setDay("");
              setTime("");
            }}
            required
          >
            <option value="">Select course</option>
            {courses.map(c => (
              <option value={c.id} key={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {selectedCourse && (
          <>
            <label className="block mb-2">
              Day
              <select
                className="border rounded px-2 py-1 w-full mt-1"
                value={day}
                onChange={e => {
                  setDay(e.target.value);
                  setTime("");
                }}
                required
              >
                <option value="">Select day</option>
                {selectedCourse.weekdays.map(d => (
                  <option value={d} key={d}>{d}</option>
                ))}
              </select>
            </label>
            {day && (
              <label className="block mb-2">
                Time slot
                <select
                  className="border rounded px-2 py-1 w-full mt-1"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  required
                >
                  <option value="">Select time</option>
                  {(selectedCourse.times[day] || []).map(t => (
                    <option value={t} key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <label className="block mb-2">
          Hours purchased
          <input
            type="number"
            min={1}
            className="border rounded px-2 py-1 w-full mt-1"
            value={hours}
            onChange={e => setHours(e.target.value)}
            required
          />
        </label>
        <label className="block mb-2">
          Upload receipt
          <input
            type="file"
            accept="image/*,application/pdf"
            className="block mt-1"
            onChange={e => setReceiptFile(e.target.files?.[0] || null)}
            required
          />
        </label>
        {error && <div className="text-red-600 my-2">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="bg-[#6654b3] hover:bg-[#4b3f8c] text-white font-bold px-6 py-2 rounded-xl mt-2 w-full"
        >
          {saving ? "Submitting…" : isAdmin ? "Renew Now" : "Submit Renewal Request"}
        </button>
      </form>
    </div>
  );
}

export default function StudentsInactivePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [renewingStudent, setRenewingStudent] = useState(null);

  // React Query: Fetch inactive students
  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["students", "inactive"],
    queryFn: fetchInactiveStudents,
    staleTime: 1000 * 60 * 10,
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
            Students (Inactive)
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
                <th className="px-2 py-3 rounded-l-2xl"></th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>#</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Nick name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>First name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Last name</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Parent Phone</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Line ID</th>
                <th className="px-2 py-3 text-left font-semibold" style={{ color: SOFT_PURPLE }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[#b0b0b0] py-8">
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
                    <td className="px-2 py-2 align-middle">
                      <button
                        onClick={() => setRenewingStudent(s)}
                        className="bg-[#6654b3] hover:bg-[#3a38a0] text-white font-bold px-5 py-2 rounded-full transition"
                      >
                        Renew
                      </button>
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

      {/* Renew modal */}
      {renewingStudent && (
        <RenewModal
          open={!!renewingStudent}
          student={renewingStudent}
          onClose={() => setRenewingStudent(null)}
          onSubmitted={refetch}
        />
      )}

      <style>{`
        @keyframes fadein { from { opacity:0; transform: scale(0.98);} to { opacity:1; transform: scale(1);} }
      `}</style>
    </div>
  );
}
