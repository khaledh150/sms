import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  UserPlusIcon,
  ClipboardDocumentCheckIcon,
  BookOpenIcon,
  FaceSmileIcon,
  BellAlertIcon,
} from "@heroicons/react/24/solid";
import { useAuth } from "./AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabaseClient";

const PURPLE = "#6654b3";

function TileButton({ label, icon, color, onClick, badge }) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative ${color} text-white font-bold text-lg p-8
                  flex flex-col items-center gap-3 rounded-2xl shadow-lg
                  w-full min-w-[220px] min-h-[150px] transition-all`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      style={{ boxShadow: "0 2px 20px 0 rgba(102,84,179,0.08)" }}
    >
      {icon}
      <span className="mt-2">{label}</span>
      {badge ? (
        <span
  className="absolute top-2 right-4 bg-red-500 text-white rounded-full text-base font-extrabold px-4 py-2 shadow-lg border-2 border-white"
  style={{
    minWidth: 36,
    minHeight: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.25rem", // 20px
    lineHeight: 1
  }}
>
  {badge}
</span>

      ) : null}
    </motion.button>
  );
}

// --- Fast Supabase review count hook (mirrors ReviewHubPage logic) ---
function useReviewCount(enabled) {
  return useQuery({
    queryKey: ["review_count"],
    queryFn: async () => {
      // 1. New student applications (applications)
      // 2. Renewals & course changes (application_changes)
      const [{ data: apps, error: err1 }, { data: changes, error: err2 }] =
        await Promise.all([
          supabase
            .from("applications")
            .select("id", { count: "exact" })
            .eq("status", "pending"),
          supabase
            .from("application_changes")
            .select("id", { count: "exact" })
            .eq("status", "pending"),
        ]);
      if (err1 || err2) throw new Error(err1?.message || err2?.message || "Failed to count reviews");
      return (apps?.length || 0) + (changes?.length || 0);
    },
    staleTime: 10000,
    enabled,
    initialData: 0,
  });
}

export default function HomePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Live review count (mirrors what shows in ReviewHubPage)
  const { data: reviewCount } = useReviewCount(isAdmin);

  const tiles = [
    {
      label: "Add New Student",
      icon: <UserPlusIcon className="w-12 h-12" />,
      color: "bg-green-500 hover:bg-green-600",
      onClick: () => nav("/admissions"),
    },
    {
      label: "Take Attendance",
      icon: <ClipboardDocumentCheckIcon className="w-12 h-12" />,
      color: "bg-blue-500 hover:bg-blue-600",
      onClick: () => nav("/attendance"),
    },
    {
      label: "Students (active)",
      icon: <FaceSmileIcon className="w-14 h-14" />,
      color: "bg-[#6654b3] hover:bg-[#5542a0]",
      onClick: () => nav("/myschool/students"),
    },
    {
      label: "Students (inactive)",
      icon: <FaceSmileIcon className="w-14 h-14" />,
      color: "bg-pink-400 hover:bg-pink-500",
      onClick: () => nav("/myschool/StudentsInactivePage"),
    },
    {
      label: "Courses",
      icon: <BookOpenIcon className="w-12 h-12" />,
      color: "bg-teal-500 hover:bg-teal-600",
      onClick: () => nav("/myschool/courses"),
    },
    ...(isAdmin
      ? [{
          label: "Review",
          icon: <BellAlertIcon className="w-12 h-12" />,
          color: "bg-yellow-500 hover:bg-yellow-600",
          onClick: () => nav("/review"),
          badge: reviewCount > 0 ? reviewCount : null
        }]
      : [])
  ];

  return (
    <main className="min-h-screen flex flex-col bg-[#f6f6f6]">
      <div className="flex flex-col items-center pt-10 pb-6">
        <p className="text-lg text-[#6654b3] font-medium mb-6 text-center">
          Fast, beautiful, mobile-friendly management for your school.
        </p>
      </div>
      <div className="flex-1 flex flex-col items-center w-full">
        <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7 p-5 sm:p-6">
          {tiles.map((t) => (
            <TileButton key={t.label} {...t} />
          ))}
        </div>
      </div>
    </main>
  );
}
