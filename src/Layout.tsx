import React, { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { BellIcon } from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

const PURPLE = "#6654b3";
const WHITE = "#f6f6f6";
const SIDEBAR_WIDTH = 80;

export default function Layout() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const fileInput = useRef();

  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { head: true, count: "exact" })
        .eq("read", false);
      setUnreadCount(count || 0);
    };
    refresh();
    const ch = supabase
      .channel(`notifications_feed_${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh)
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  useEffect(() => {
    setProfileUrl(user?.photoURL || "/avatar.png");
  }, [user]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `avatars/${user.id}-${Date.now()}.${file.name.split(".").pop()}`;
    let { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      alert("Upload failed: " + error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setProfileUrl(data.publicUrl);
    setShowProfileModal(false);
    setUploading(false);
  }

  // Only show slogan on homepage
  const isHome = loc.pathname === "/dashboard";

  return (
    <div className="min-h-screen bg-[#f6f6f6] flex">
      <Sidebar />
      <div
        className="flex flex-col flex-1 min-h-screen"
        style={{
          marginLeft: SIDEBAR_WIDTH,
          transition: "margin .2s cubic-bezier(.4,0,.2,1)",
        }}
      >
        {/* Header */}
        <header
          className="w-full flex items-center px-8 py-3 shadow-sm"
          style={{
            background: WHITE,
            borderBottom: "1.5px solid #edeaf8",
            minHeight: "64px",
            zIndex: 10,
          }}
        >
          <div className="flex-1 text-center cursor-pointer" onClick={() => nav("/dashboard")}>
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#6654b3] select-none">
              Wonder Kids
            </span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => nav("/notifications")}
              className="relative p-2 rounded-xl hover:bg-[#edeaf8] transition"
              aria-label="Notifications"
              style={{ marginLeft: "auto" }}
            >
              <BellIcon className="w-7 h-7 text-[#6654b3]" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-1 bg-[#ec4899] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-extrabold shadow">
                  {unreadCount}
                </span>
              )}
            </button>
            {/* Profile Pic */}
            <button
              className="ml-1"
              style={{ background: "none" }}
              onClick={() => setShowProfileModal(true)}
              aria-label="Change profile"
            >
              <img
                src={profileUrl}
                alt="Profile"
                className="w-10 h-10 rounded-full border-2 border-[#c5bdf4] shadow object-cover hover:scale-105 transition"
              />
            </button>
          </div>
        </header>
        {/* Slogan only on homepage */}
        
        {/* Profile Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col items-center">
              <img
                src={profileUrl}
                alt="Profile preview"
                className="w-20 h-20 rounded-full mb-4 border-2 border-[#c5bdf4] shadow object-cover"
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="mb-4"
                onChange={handleUpload}
                disabled={uploading}
              />
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-5 py-2 rounded-lg bg-[#6654b3] text-white font-bold hover:bg-[#5542a0] transition"
                disabled={uploading}
              >
                Close
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 p-0 bg-[#f6f6f6] min-h-[calc(100vh-64px)] transition-all duration-200">
          <div className="h-full w-full transition-all">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
