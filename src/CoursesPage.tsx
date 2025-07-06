import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
];
const HOURS = [];
for (let h = 6; h < 23; ++h) {
  HOURS.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);
}

// --- Hook: Get all courses for filters and management ---
function useCourses() {
  return useQuery({
    queryKey: ["courses_full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,name,weekdays,times,capacity")
        .order("name");
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 120000,
  });
}

// --- Hook: Get minimal course list for filters only ---
function useCourseFilters() {
  return useQuery({
    queryKey: ["courseFilters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,name,weekdays,times")
        .order("name");
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 120000,
  });
}

// --- Hook: Get students by filter ---
function useFilteredStudents(courseId, day, time) {
  return useQuery({
    queryKey: ["students", courseId, day, time],
    queryFn: async () => {
      if (!courseId) return [];
      let { data, error } = await supabase
        .from("students")
        .select("id,first_name,last_name,nick_name,courses");
      if (error) throw new Error(error.message);

      if (!day) {
        return data.filter(s => s.courses?.[courseId]);
      }
      // Accept both "13:00" and "13:00-14:00"
      if (!time) {
        return data.filter(s => s.courses?.[courseId]?.[day]);
      }
      return data.filter(s => {
        const arr = s.courses?.[courseId]?.[day] || [];
        return arr.some(t =>
          t === time ||
          t.startsWith(time.split("-")[0]) // covers if old format is present
        );
      });
    },
    enabled: !!courseId,
    staleTime: 30000,
  });
}

export default function CoursesAdminModal() {
  const [tab, setTab] = useState("check");
  const [courseId, setCourseId] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");

  const { data: courseFilters, isLoading: loadingCourses } = useCourseFilters();
  const { data: filteredStudents, isLoading: loadingStudents } = useFilteredStudents(courseId, day, time);

  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f6f6f6] flex flex-col items-center py-8 px-2">
      <div className="w-full max-w-5xl mx-auto">       
        {/* Tabs */}
        <div className="flex mb-6 border-b border-purple-200">
          <button
            className={`px-5 py-3 font-bold rounded-t-2xl transition ${tab === "check" ? "bg-white text-[#6654b3] border-x border-t border-purple-200 border-b-0 shadow" : "text-gray-400 hover:text-[#6654b3]"}`}
            onClick={() => setTab("check")}
          >
            Check Courses
          </button>
          <button
            className={`ml-3 px-5 py-3 font-bold rounded-t-2xl transition ${tab === "manage" ? "bg-white text-[#6654b3] border-x border-t border-purple-200 border-b-0 shadow" : "text-gray-400 hover:text-[#6654b3]"}`}
            onClick={() => setTab("manage")}
          >
            Manage Courses
          </button>
        </div>
        {tab === "check" ? (
          <CheckCoursesTab
            courseFilters={courseFilters}
            loadingCourses={loadingCourses}
            courseId={courseId}
            setCourseId={setCourseId}
            day={day}
            setDay={setDay}
            time={time}
            setTime={setTime}
            filteredStudents={filteredStudents}
            loadingStudents={loadingStudents}
          />
        ) : (
          <ManageCoursesTab />
        )}
      </div>
    </div>
  );
}

// --- CHECK COURSES TAB ---
function CheckCoursesTab({
  courseFilters, loadingCourses,
  courseId, setCourseId,
  day, setDay,
  time, setTime,
  filteredStudents, loadingStudents,
}) {
  const nav = useNavigate();

  const course = courseFilters?.find(c => c.id === courseId);
  const daysAvailable = course?.weekdays || [];

  // Collect ALL time slots for selected day and course (unique), supporting both old and new formats
  let timesAvailable = [];
  if (course && day && course.times && course.times[day]) {
    const raw = course.times[day] || [];
    // Map "13:00" to "13:00-14:00" for filtering
    const normalized = raw.map(t => {
      if (t.includes("-")) return t;
      const h = Number(t.slice(0, 2));
      if (!isNaN(h) && h >= 6 && h < 23) return `${t}-${String(h + 1).padStart(2, "0")}:00`;
      return t;
    });
    timesAvailable = Array.from(new Set(normalized)).sort();
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          className="px-4 py-2 rounded-xl border border-purple-200 text-[#6654b3] bg-white"
          value={courseId}
          onChange={e => {
            setCourseId(e.target.value);
            setDay("");
            setTime("");
          }}
        >
          <option value="">Select Course</option>
          {courseFilters?.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="px-4 py-2 rounded-xl border border-purple-200 text-[#6654b3] bg-white"
          value={day}
          onChange={e => {
            setDay(e.target.value);
            setTime("");
          }}
          disabled={!courseId}
        >
          <option value="">Select Day</option>
          {daysAvailable.map(d => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          className="px-4 py-2 rounded-xl border border-purple-200 text-[#6654b3] bg-white"
          value={time}
          onChange={e => setTime(e.target.value)}
          disabled={!courseId || !day}
        >
          <option value="">Select Time</option>
          {timesAvailable.map(t => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        {!courseId ? (
          <div className="text-center text-gray-400 py-8">Choose a course to see students.</div>
        ) : loadingStudents ? (
          <div className="text-center text-gray-400 py-8">Loading…</div>
        ) : (
          <table className="w-full bg-white border border-purple-200 rounded-2xl">
            <thead>
              <tr>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">#</th>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">Nick name</th>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">Full name</th>
              </tr>
            </thead>
            <tbody>
              {!filteredStudents || filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-gray-300 py-8">No students found.</td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-purple-50 transition">
                    <td className="py-2 px-2">{idx + 1}</td>
                    <td className="py-2 px-2 text-[#6654b3] font-bold">{s.nick_name || "—"}</td>
                    <td
                      className="py-2 px-2 text-blue-700 font-semibold cursor-pointer hover:underline"
                      onClick={() => nav(`/myschool/student/${s.id}`)}
                    >
                      {s.first_name} {s.last_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- MANAGE COURSES TAB ---
function ManageCoursesTab() {
  const queryClient = useQueryClient();
  const { data: courses = [], isLoading, refetch } = useCourses();

  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  // Insert or update
  const saveMutation = useMutation({
    mutationFn: async (course) => {
      const up = {
        name: course.name,
        weekdays: course.weekdays,
        times: course.times,
        capacity: course.capacity,
      };
      if (course.id) {
        const { error } = await supabase.from("courses").update(up).eq("id", course.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert([up]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries(["courses_full"]);
    },
    onError: err => setError(err.message),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (!window.confirm("Delete this course?")) return;
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["courses_full"]);
    },
    onError: err => setError(err.message),
  });

  function startEdit(course) {
    setEditing(
      course || {
        name: "",
        weekdays: [],
        times: {},
        capacity: 0,
      }
    );
    setError("");
  }
  function toggleDay(day) {
    setEditing((c) => {
      const days = c.weekdays.includes(day)
        ? c.weekdays.filter((d) => d !== day)
        : [...c.weekdays, day];
      const times = { ...c.times };
      if (!days.includes(day)) delete times[day];
      return { ...c, weekdays: days, times };
    });
  }
  function addTime(day, t) {
    setEditing((c) => ({
      ...c,
      times: {
        ...c.times,
        [day]: [...(c.times[day] || []), t],
      },
    }));
  }
  function removeTime(day, idx) {
    setEditing((c) => ({
      ...c,
      times: {
        ...c.times,
        [day]: c.times[day].filter((_, i) => i !== idx),
      },
    }));
  }
  function saveCourse() {
    if (!editing.name) return setError("Enter a name");
    saveMutation.mutate(editing);
  }
  function deleteCourse(id) {
    deleteMutation.mutate(id);
  }

  return (
    <div className="relative bg-white rounded-3xl p-6">
      <h2 className="text-xl font-bold mb-4 text-[#6654b3]">Manage Courses</h2>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <table className="w-full mb-4 border border-purple-200 rounded-lg">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-[#6654b3]">Course</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">Days</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">Times</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">Capacity</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-purple-50 transition">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{(c.weekdays || []).join(", ")}</td>
                  <td className="px-4 py-2">
                    {Object.entries(c.times || {})
                      .map(([d, arr]) =>
                        arr.length ? (
                          <div key={d}>
                            {d}: {arr.join(", ")}
                          </div>
                        ) : null
                      )}
                  </td>
                  <td className="px-4 py-2">{c.capacity}</td>
                  <td className="px-4 py-2 space-x-2">
                    <button
                      onClick={() => startEdit(c)}
                      className="bg-gray-100 hover:bg-gray-200 text-blue-600 px-3 py-1 rounded-full text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCourse(c.id)}
                      className="bg-gray-100 hover:bg-gray-200 text-red-600 px-3 py-1 rounded-full text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => startEdit(null)}
            className="bg-[#6654b3] hover:bg-purple-700 text-white px-4 py-2 rounded-full"
          >
            + Add Course
          </button>
        </>
      )}
      {/* Edit modal */}
      {editing && (
        <div className="absolute inset-0 bg-white bg-opacity-95 rounded-3xl flex flex-col p-6 overflow-y-auto">
          <h3 className="text-lg font-bold mb-3 text-[#6654b3]">
            {editing.id ? "Edit Course" : "New Course"}
          </h3>
          <label className="block mb-2">
            Name
            <input
              className="border rounded px-2 py-1 ml-2 w-full"
              value={editing.name}
              onChange={(e) =>
                setEditing((c) => ({ ...c, name: e.target.value }))
              }
            />
          </label>
          <label className="block mb-2">
            Capacity
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 ml-2 w-24"
              value={editing.capacity || 0}
              onChange={(e) =>
                setEditing((c) => ({
                  ...c,
                  capacity: Number(e.target.value),
                }))
              }
            />
          </label>
          <div className="mb-2">
            <span className="font-semibold">Days:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAYS.map((d) => (
                <label
                  key={d}
                  className={`border rounded-full px-3 py-1 cursor-pointer ${
                    editing.weekdays.includes(d)
                      ? "bg-[#6654b3] text-white border-[#6654b3]"
                      : "border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={editing.weekdays.includes(d)}
                    onChange={() => toggleDay(d)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
          {editing.weekdays.map((day) => (
            <div key={day} className="mb-2 ml-4">
              <span className="font-semibold">{day} Times:</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {(editing.times[day] || []).map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center bg-gray-200 rounded-full px-3 py-1 mr-2"
                  >
                    {t}
                    <button
                      onClick={() => removeTime(day, i)}
                      className="ml-1 text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <select
                  className="border rounded px-2 py-1 max-h-40 overflow-y-auto"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addTime(day, e.target.value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Add Time</option>
                  {HOURS
                    .filter(
                      (t) => !(editing.times[day] || []).includes(t)
                    )
                    .map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                </select>
              </div>
            </div>
          ))}
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveCourse}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full"
              disabled={saveMutation.isLoading}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(null)}
              className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
