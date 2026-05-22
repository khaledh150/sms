import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  HomeIcon,
  QrCodeIcon,
  UsersIcon,
  BellIcon as BellSolid,
  Bars3BottomRightIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/solid";
import {
  HomeIcon as HomeOutline,
  QrCodeIcon as QrOutline,
  UsersIcon as UsersOutline,
  BellIcon as BellOutline,
  Bars3BottomRightIcon as MoreOutline,
} from "@heroicons/react/24/outline";
import { BellIcon } from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import { usePendingReviewCount } from "./hooks/useApplications";
import OfflineBanner from "./OfflineBanner";

const TABS = [
  { key: "home", path: "/dashboard", icon: HomeOutline, iconActive: HomeIcon, label: "home" },
  { key: "checkin", path: "/attendance", icon: QrOutline, iconActive: QrCodeIcon, label: "checkIn" },
  { key: "students", path: "/students", icon: UsersOutline, iconActive: UsersIcon, label: "students" },
  { key: "inbox", path: "/inbox", icon: BellOutline, iconActive: BellSolid, label: "inbox" },
  { key: "more", path: "/more", icon: MoreOutline, iconActive: Bars3BottomRightIcon, label: "more" },
] as const;

export default function Layout() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const { data: pendingReviewCount = 0 } = usePendingReviewCount(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileUrl, setProfileUrl] = useState(`${import.meta.env.BASE_URL}avatar.png`);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.log(e));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (!user?.id) return setProfileUrl(`${import.meta.env.BASE_URL}avatar.png`);
    supabase.from("profiles").select("avatar_url").eq("id", user.id).single()
      .then(({ data }) => setProfileUrl(data?.avatar_url || `${import.meta.env.BASE_URL}avatar.png`));
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  // Lightweight unread count - single query, no realtime subscription overhead
  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase
        .from("notifications").select("*", { head: true, count: "exact" }).eq("read", false);
      setUnreadCount(count || 0);
    };
    refresh();
    // Poll every 30s instead of realtime subscription (much lighter)
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-timeout 15 min
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await supabase.auth.signOut(); nav("/login"); }, 15 * 60 * 1000);
    };
    const events = ["touchstart", "click", "keydown"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [nav]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}-${Date.now()}.${ext}`;
      await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      setProfileUrl(urlData.publicUrl);
      setShowProfileModal(false);
    } catch (err: any) { alert(t("uploadFailed", { message: err.message })); }
    setUploading(false);
  }

  const activeTab = TABS.find(t => loc.pathname.startsWith(t.path))?.key || "home";

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "transparent" }}>
      {/* Floating Interactive Background Objects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full floating-blob blue-blob" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full floating-blob pink-blob" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full floating-blob light-blue-blob" style={{ animationDelay: "5s" }} />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <OfflineBanner />
        {/* TOP HEADER */}
        <header className="w-full flex items-center px-4 sm:px-6 py-2 glass sticky top-0 z-30 shadow-sm"
          style={{ borderBottom: `1px solid rgba(255,255,255,0.4)`, minHeight: 64 }}>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => nav("/dashboard")}>
            <div className="w-10 h-10 rounded-[1rem] flex items-center justify-center text-white text-xl font-bold btn-gummy-sm shadow-sm" style={{ background: POS.primaryGradient }}>
              WK
            </div>
            <span className="text-2xl sm:text-3xl font-bouncy tracking-tight select-none hidden sm:block" style={{ color: POS.primaryDark }}>
              Wonder Kids
            </span>
          </div>

          {/* Center: Live Clock */}
          <div className="hidden md:flex flex-col items-center mx-auto absolute left-1/2 -translate-x-1/2">
            <span className="text-xl font-bouncy tracking-wide" style={{ color: POS.primaryDark }}>
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8DB0]">
              {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto z-10">
            <button onClick={toggleFullscreen} className="p-2 sm:p-2.5 rounded-[1rem] text-[#7C8DB0] hover:bg-white hover:shadow-sm transition-all btn-gummy-sm mr-1">
              {isFullscreen ? <ArrowsPointingInIcon className="w-6 h-6" /> : <ArrowsPointingOutIcon className="w-6 h-6" />}
            </button>
            <LanguageSwitcher />
            <button onClick={() => nav("/inbox")} className="relative p-2 rounded-[1rem] transition hover:bg-white hover:shadow-sm btn-gummy-sm" aria-label="Notifications">
            <BellIcon className="w-6 h-6" style={{ color: POS.primary }} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center" style={{ background: POS.danger }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            </button>
            <button onClick={() => setShowProfileModal(true)} className="ml-1 p-0 rounded-[1.2rem] overflow-hidden" style={{ background: "none", minHeight: "auto" }}>
              <img src={profileUrl || `${import.meta.env.BASE_URL}avatar.png`} alt="Profile"
                className="w-10 h-10 rounded-[1.2rem] border-2 shadow-sm object-cover transition-transform hover:scale-105"
                style={{ borderColor: "#fff" }} />
            </button>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 w-full" style={{ paddingBottom: 84 }}><Outlet /></main>

        {/* BOTTOM TAB BAR */}
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 glass border-t shadow-[0_-10px_20px_rgba(0,0,0,0.03)] flex items-stretch justify-around px-2 pb-safe"
          style={{ borderTopColor: "rgba(255,255,255,0.4)", minHeight: 80, paddingBottom: "max(env(safe-area-inset-bottom), 12px)", paddingTop: 8 }}>
          {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = isActive ? tab.iconActive : tab.icon;
          const showBadge = tab.key === "inbox" && pendingReviewCount > 0;
          return (
            <button key={tab.key} onClick={() => nav(tab.path)}
              className="flex flex-col items-center justify-center flex-1 py-2 mx-1 transition-all relative rounded-[1.5rem]"
              style={{ 
                color: isActive ? "#fff" : "#7C8DB0", 
                background: isActive ? POS.primaryGradient : "transparent", 
                fontWeight: isActive ? 800 : 500, 
                boxShadow: isActive ? "0 4px 12px rgba(108, 92, 231, 0.2)" : "none" 
              }}>
              <Icon className="w-7 h-7 mb-1" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">{t(tab.label)}</span>
              {showBadge && (
                <span className="absolute top-1 right-[calc(50%-14px)] text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center" style={{ background: POS.danger }}>
                  {pendingReviewCount > 9 ? "9+" : pendingReviewCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

          {/* PROFILE MODAL (Ultra Soft) */}
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(12px)" }}
            onClick={() => setShowProfileModal(false)}>
            <div className="bg-white/80 rounded-[3rem] shadow-2xl p-10 max-w-sm w-full mx-4 flex flex-col items-center glass-card border border-white/50"
              onClick={e => e.stopPropagation()}>
              <img src={profileUrl} alt="Profile" className="w-32 h-32 rounded-[2rem] mb-6 shadow-xl object-cover border-4 border-white" />
              <input ref={fileInput as React.RefObject<HTMLInputElement>} type="file" accept="image/*" className="mb-6 text-sm font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" onChange={handleUpload} disabled={uploading} />
              
              <button onClick={() => nav("/login")} className="w-full btn-gummy-sm py-4 rounded-[1.5rem] font-bold text-[15px] mb-3 text-red-500 bg-red-50" disabled={uploading}>
                {t("signOut")}
              </button>

              <button onClick={() => setShowProfileModal(false)} className="btn-gummy px-8 py-4 w-full rounded-[1.5rem] text-white font-bouncy text-xl shadow-lg" style={{ background: POS.primaryGradient }} disabled={uploading}>
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
