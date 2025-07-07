import { useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const WEEKDAYS: string[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
];
const HOURS: string[] = [];
for (let h = 6; h < 23; ++h) {
  HOURS.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);
}

type Course = {
  id?: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
  capacity: number;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  nick_name: string;
  courses: Record<string, Record<string, string[]>>;
};

type CourseFilter = {
  id: string;
  name: string;
  weekdays: string[];
  times: Record<string, string[]>;
};

function useCourses() {
  return useQuery<Course[]>({
    queryKey: ["courses_full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,name,weekdays,times,capacity")
        .order("name");
      if (error) throw new Error(error.message);
      return (data || []) as Course[];
    },
    staleTime: 120000,
  });
}

function useCourseFilters() {
  return useQuery<CourseFilter[]>({
    queryKey: ["courseFilters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,name,weekdays,times")
        .order("name");
      if (error) throw new Error(error.message);
      return (data || []) as CourseFilter[];
    },
    staleTime: 120000,
  });
}

function useFilteredStudents(courseId: string, day: string, time: string) {
  return useQuery<Student[]>({
    queryKey: ["students", courseId, day, time],
    queryFn: async () => {
      if (!courseId) return [];
      const { data, error } = await supabase
        .from("students")
        .select("id,first_name,last_name,nick_name,courses");
      if (error) throw new Error(error.message);
      if (!data) return [];
      if (!day) {
        return data.filter((s: Student) => s.courses?.[courseId]);
      }
      if (!time) {
        return data.filter((s: Student) => s.courses?.[courseId]?.[day]);
      }
      return data.filter((s: Student) => {
        const arr = s.courses?.[courseId]?.[day] || [];
        return arr.some((t: string) =>
          t === time || t.startsWith(time.split("-")[0])
        );
      });
    },
    enabled: !!courseId,
    staleTime: 30000,
  });
}

export default function CoursesAdminModal() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"check" | "manage">("check");
  const [courseId, setCourseId] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [time, setTime] = useState<string>("");

  const { data: courseFilters = [], isLoading: loadingCourses } = useCourseFilters();
  const { data: filteredStudents = [], isLoading: loadingStudents } = useFilteredStudents(courseId, day, time);

  return (
    <div className="min-h-screen bg-[#f6f6f6] flex flex-col items-center py-8 px-2">
      <div className="w-full max-w-5xl mx-auto">
        <div className="flex mb-6 border-b border-purple-200">
          <button
            className={`px-5 py-3 font-bold rounded-t-2xl transition ${tab === "check" ? "bg-white text-[#6654b3] border-x border-t border-purple-200 border-b-0 shadow" : "text-gray-400 hover:text-[#6654b3]"}`}
            onClick={() => setTab("check")}
          >
            {t("checkCourses")}
          </button>
          <button
            className={`ml-3 px-5 py-3 font-bold rounded-t-2xl transition ${tab === "manage" ? "bg-white text-[#6654b3] border-x border-t border-purple-200 border-b-0 shadow" : "text-gray-400 hover:text-[#6654b3]"}`}
            onClick={() => setTab("manage")}
          >
            {t("manageCourses")}
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

type CheckCoursesTabProps = {
  courseFilters: CourseFilter[];
  loadingCourses: boolean;
  courseId: string;
  setCourseId: (id: string) => void;
  day: string;
  setDay: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  filteredStudents: Student[];
  loadingStudents: boolean;
};

function CheckCoursesTab({
  courseFilters,
  courseId,
  setCourseId,
  day,
  setDay,
  time,
  setTime,
  filteredStudents,
  loadingStudents,
}: CheckCoursesTabProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const course = courseFilters?.find((c) => c.id === courseId);
  const daysAvailable: string[] = course?.weekdays || [];
  let timesAvailable: string[] = [];
  if (course && day && course.times && course.times[day]) {
    const raw = course.times[day] || [];
    const normalized = raw.map((t: string) => {
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
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            setCourseId(e.target.value);
            setDay("");
            setTime("");
          }}
        >
          <option value="">{t("selectCourse")}</option>
          {courseFilters?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="px-4 py-2 rounded-xl border border-purple-200 text-[#6654b3] bg-white"
          value={day}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            setDay(e.target.value);
            setTime("");
          }}
          disabled={!courseId}
        >
          <option value="">{t("selectDay")}</option>
          {daysAvailable.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          className="px-4 py-2 rounded-xl border border-purple-200 text-[#6654b3] bg-white"
          value={time}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setTime(e.target.value)}
          disabled={!courseId || !day}
        >
          <option value="">{t("selectTime")}</option>
          {timesAvailable.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        {!courseId ? (
          <div className="text-center text-gray-400 py-8">{t("Choose a course to see students")}</div>
        ) : loadingStudents ? (
          <div className="text-center text-gray-400 py-8">{t("loadingStudents")}</div>
        ) : (
          <table className="w-full bg-white border border-purple-200 rounded-2xl">
            <thead>
              <tr>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">#</th>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">{t("nickName")}</th>
                <th className="py-3 px-2 text-left font-semibold text-[#6654b3]">{t("fullName")}</th>
              </tr>
            </thead>
            <tbody>
              {!filteredStudents || filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-gray-300 py-8">{t("noStudentsFound")}</td>
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

function ManageCoursesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: courses = [], isLoading } = useCourses();

  const [editing, setEditing] = useState<Course | null>(null);
  const [error, setError] = useState<string>("");

  const saveMutation = useMutation<void, any, Course>({
    mutationFn: async (course: Course) => {
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
      queryClient.invalidateQueries({ queryKey: ["courses_full"] });
    },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation<void, any, string>({
    mutationFn: async (id: string) => {
      if (!window.confirm(t("deleteCourseConfirm"))) return;
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses_full"] });
    },
    onError: (err: any) => setError(err.message),
  });

  function startEdit(course: Course | null) {
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
  function toggleDay(day: string) {
    setEditing((c) => {
      if (!c) return c;
      const days = c.weekdays.includes(day)
        ? c.weekdays.filter((d) => d !== day)
        : [...c.weekdays, day];
      const times = { ...c.times };
      if (!days.includes(day)) delete times[day];
      return { ...c, weekdays: days, times };
    });
  }
  function addTime(day: string, t: string) {
    setEditing((c) => {
      if (!c) return c;
      return {
        ...c,
        times: {
          ...c.times,
          [day]: [...(c.times[day] || []), t],
        },
      };
    });
  }
  function removeTime(day: string, idx: number) {
    setEditing((c) => {
      if (!c) return c;
      return {
        ...c,
        times: {
          ...c.times,
          [day]: c.times[day].filter((_: string, i: number) => i !== idx),
        },
      };
    });
  }
  function saveCourse() {
    if (!editing || !editing.name) return setError(t("enterCourseName"));
    saveMutation.mutate(editing);
  }
  function deleteCourse(id: string) {
    deleteMutation.mutate(id);
  }

  return (
    <div className="relative bg-white rounded-3xl p-6">
      <h2 className="text-xl font-bold mb-4 text-[#6654b3]">{t("manageCourses")}</h2>
      {isLoading ? (
        <p>{t("loadingCourses")}</p>
      ) : (
        <>
          <table className="w-full mb-4 border border-purple-200 rounded-lg">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-[#6654b3]">{t("course")}</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">{t("days")}</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">{t("times")}</th>
                <th className="px-4 py-2 text-left text-[#6654b3]">{t("capacity")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {courses.map((c: Course) => (
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
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => deleteCourse(c.id!)}
                      className="bg-gray-100 hover:bg-gray-200 text-red-600 px-3 py-1 rounded-full text-sm"
                    >
                      {t("delete")}
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
            {t("addCourse")}
          </button>
        </>
      )}
      {editing && (
        <div className="absolute inset-0 bg-white bg-opacity-95 rounded-3xl flex flex-col p-6 overflow-y-auto">
          <h3 className="text-lg font-bold mb-3 text-[#6654b3]">
            {editing.id ? t("editCourse") : t("newCourse")}
          </h3>
          <label className="block mb-2">
            {t("courseName")}
            <input
              className="border rounded px-2 py-1 ml-2 w-full"
              value={editing.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setEditing((c) => c ? { ...c, name: e.target.value } : c)
              }
            />
          </label>
          <label className="block mb-2">
            {t("capacity")}
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 ml-2 w-24"
              value={editing.capacity || 0}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setEditing((c) => c ? { ...c, capacity: Number(e.target.value) } : c)
              }
            />
          </label>
          <div className="mb-2">
            <span className="font-semibold">{t("days")}:</span>
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
              <span className="font-semibold">{t("timesForDay", { day })}</span>
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
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    if (e.target.value) {
                      addTime(day, e.target.value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">{t("addTime")}</option>
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
              disabled={saveMutation.status === "pending"}
            >
              {t("save")}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
