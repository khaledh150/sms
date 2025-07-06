import React, {
  useState,
  ChangeEvent,
  FormEvent,
  useEffect,
  useCallback
} from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabaseClient";

/* ─────────── types & constants ─────────── */
type View = "form" | "review";

type AppRow = {
  id: string;
  first_name: string;
  last_name: string;
  parent_email: string;
  parent_phone: string;
  courses: string[];
  status: "pending" | "approved" | "waitlist" | "rejected";
};

const COURSE_CATALOG = [
  { id: "phonics",   name: "Phonics" },
  { id: "englishA1", name: "English A1" },
  { id: "englishB1", name: "English B1" },
  { id: "mathFun",   name: "Fun Math" },
  { id: "artCraft",  name: "Art & Craft" }
];

/* ─────────── component ─────────── */
export default function AdmissionsPage() {
  /* tab state */
  const [view, setView] = useState<View>("form");

  /* query param → auto-open review tab */
  const [params] = useSearchParams();
  useEffect(() => {
    if (params.get("view") === "review") setView("review");
  }, [params]);

  /* form state */
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [dob,       setDob]       = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [selectedCourses, setSelected] = useState<string[]>([]);
  const [receiptFile, setReceipt] = useState<File | null>(null);

  /* review state */
  const [reviewRows,    setReviewRows]    = useState<AppRow[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);

  /* UX flags */
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  /* helpers */
  const toggleCourse = (id: string) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleFile = (e: ChangeEvent<HTMLInputElement>) =>
    setReceipt(e.target.files ? e.target.files[0] : null);

  /* ─────────── submit new application ─────────── */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (!selectedCourses.length) {
      setErrorMsg("Please choose at least one course.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("applications").insert([
      {
        first_name: firstName,
        last_name:  lastName,
        dob,
        parent_email:  parentEmail,
        parent_phone:  parentPhone,
        courses:       selectedCourses,
        payment_receipt_url: null,
        status: "pending"
      }
    ]);

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccess(true);
    /* reset form */
    setFirstName("");
    setLastName("");
    setDob("");
    setParentEmail("");
    setParentPhone("");
    setSelected([]);
    setReceipt(null);
  }

  /* ─────────── review queue helpers ─────────── */
  const loadReview = useCallback(async () => {
    setReviewLoading(true);
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setReviewRows(data as AppRow[]);
    setReviewLoading(false);
  }, []);

  useEffect(() => {
    if (view === "review") {
      setSuccess(false);          // hide success banner if we switch tabs
      loadReview();
    }
  }, [view, loadReview]);

  async function updateStatus(id: string, newStatus: AppRow["status"]) {
    if (!window.confirm(`Mark this application as "${newStatus}"?`)) return;
    const { error } = await supabase
      .from("applications")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) alert(error.message);
    else loadReview();
  }

  const Chip = ({ s }: { s: AppRow["status"] }) => {
    const map = {
      pending:  "bg-yellow-100 text-yellow-700",
      approved: "bg-green-100  text-green-700",
      waitlist: "bg-blue-100   text-blue-700",
      rejected: "bg-red-100    text-red-700"
    } as const;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${map[s]}`}>
        {s}
      </span>
    );
  };

  /* ─────────── render ─────────── */
  return (
    <div className="flex flex-col gap-8 p-8">
      <h1 className="text-3xl font-extrabold text-blue-700">
        Admissions &amp; Enrollment
      </h1>

      {/* tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("form")}
          className={`px-4 py-2 rounded-full font-semibold ${
            view === "form"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
          }`}
        >
          New Application
        </button>
        <button
          onClick={() => setView("review")}
          className={`px-4 py-2 rounded-full font-semibold ${
            view === "review"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
          }`}
        >
          Review Queue
        </button>
      </div>

      {/* banners */}
      {success && view === "form" && (
        <div className="bg-green-100 border border-green-300 rounded-xl p-4 text-green-800 font-medium shadow-sm">
          Application submitted! An admin will review it shortly.
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-800 font-medium shadow-sm">
          {errorMsg}
        </div>
      )}

      {/* ───── FORM TAB ───── */}
      {view === "form" && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow p-8 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {/* student info */}
          <div className="col-span-full">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">Student Info</h2>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">First Name</span>
            <input
              required
              className="border rounded-xl px-4 py-2"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Last Name</span>
            <input
              required
              className="border rounded-xl px-4 py-2"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 col-span-full md:col-span-1">
            <span className="font-semibold">Date of Birth</span>
            <input
              required
              type="date"
              className="border rounded-xl px-4 py-2"
              value={dob}
              onChange={e => setDob(e.target.value)}
            />
          </label>

          {/* parent info */}
          <div className="col-span-full">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">Parent / Guardian</h2>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Email</span>
            <input
              required
              type="email"
              className="border rounded-xl px-4 py-2"
              value={parentEmail}
              onChange={e => setParentEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Phone</span>
            <input
              required
              className="border rounded-xl px-4 py-2"
              value={parentPhone}
              onChange={e => setParentPhone(e.target.value)}
            />
          </label>

          {/* courses */}
          <div className="col-span-full">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">Courses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COURSE_CATALOG.map(c => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 border rounded-xl p-3 cursor-pointer ${
                    selectedCourses.includes(c.id)
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCourses.includes(c.id)}
                    onChange={() => toggleCourse(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {/* payment receipt */}
          <div className="col-span-full">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">Payment</h2>
          </div>
          <label className="flex flex-col gap-1 col-span-full">
            <span className="font-semibold">
              Upload payment receipt&nbsp;
              <span className="text-sm text-gray-500">(optional)</span>
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFile}
            />
            {receiptFile && (
              <span className="text-sm text-gray-600 mt-1">
                Selected: {receiptFile.name}
              </span>
            )}
          </label>

          {/* submit */}
          <div className="col-span-full flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-3 rounded-xl shadow transition disabled:opacity-50"
            >
              {saving ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </form>
      )}

      {/* ───── REVIEW TAB ───── */}
      {view === "review" && (
        reviewLoading ? (
          <p className="text-gray-600">Loading…</p>
        ) : reviewRows.length === 0 ? (
          <p className="text-gray-600">No applications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-2xl shadow">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Parent</th>
                  <th className="px-4 py-3 text-left font-semibold">Courses</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.parent_email}</div>
                      <div className="text-sm text-gray-500">{r.parent_phone}</div>
                    </td>
                    <td className="px-4 py-3">{r.courses.join(", ") || "—"}</td>
                    <td className="px-4 py-3"><Chip s={r.status} /></td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => updateStatus(r.id, "approved")}
                        disabled={r.status === "approved"}
                        className="px-3 py-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-30 text-white text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, "waitlist")}
                        disabled={r.status === "waitlist"}
                        className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white text-sm"
                      >
                        Waitlist
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, "rejected")}
                        disabled={r.status === "rejected"}
                        className="px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-30 text-white text-sm"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
