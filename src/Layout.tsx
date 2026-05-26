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
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import { usePendingReviewCount } from "./hooks/useApplications";
import OfflineBanner from "./OfflineBanner";
import { INACTIVITY_TIMEOUT_MS, INACTIVITY_THROTTLE_MS } from "./constants";
import { validateImageFile } from "./hooks/useFileValidation";
import { useToast } from "./hooks/useToast";
import type { Notification } from "./types";
import { timeAgo } from "./utils/time";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "./services/notifications";

function HeaderClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col items-center mx-auto">
      <span className="text-xs font-extrabold uppercase tracking-widest text-[#7C8DB0] md:hidden">
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <span className="text-xl font-bouncy tracking-wide hidden md:block" style={{ color: POS.primaryDark }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8DB0] hidden md:block">
        {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}

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
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
  const { data: pendingReviewCount = 0 } = usePendingReviewCount(isAdmin);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileUrl, setProfileUrl] = useState(`${import.meta.env.BASE_URL}avatar.png`);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);

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


  function notificationLabel(n: Notification): string {
    const nick = n.student_name || "";
    const first = n.payload?.first_name || "";
    const name = nick && first ? `${nick} '${first}'` : nick || first || n.payload?.student_name || "";
    switch (n.type) {
      case "new_application": return t("newApplication", { name: name || n.payload?.name || "—" });
      case "renewal_request": {
        const courses = n.payload?.purchased_packages?.map((p: any) => p.course_name).join(", ") || "";
        return name ? `${name} — ${t("renew")}${courses ? `: ${courses}` : ""}` : t("renewalNeeded");
      }
      case "overlimit": return t("courseLimitReached", { name: name || "—" });
      case "renewal_approaching": {
        const course = n.payload?.course_name || "";
        const rem = n.payload?.remaining || "";
        return `${name || "—"} — ${t("renewalApproaching")}${course ? ` (${course})` : ""}${rem ? ` · ${rem} ${t("hrsLeft")}` : ""}`;
      }
      case "edit_request": return t("editRequestFrom", { name: name || "—" });
      case "checkin": {
        const course = n.payload?.course_name || "";
        return `${name || "—"} ${t("checkedIn")}${course ? ` — ${course}` : ""}`;
      }
      default: return n.type ? `${n.type}${name ? ` — ${name}` : ""}` : t("newNotification");
    }
  }

  // Notifications via Supabase Realtime
  useEffect(() => {
    const refresh = async () => {
      const { notifications: items, count } = await fetchNotifications();
      setUnreadCount(count);
      setNotifications(items);
    };
    refresh();
    const channel = supabase
      .channel("notifications_unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Close notification dropdown on outside click
  useEffect(() => {
    if (!showNotifications) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifications]);

  async function markRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(c => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications([]);
    setUnreadCount(0);
    toast(t("markedAllRead"), "success");
  }

  // Auto-timeout with throttled reset
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastReset = 0;
    const reset = () => {
      const now = Date.now();
      if (now - lastReset < INACTIVITY_THROTTLE_MS) return;
      lastReset = now;
      clearTimeout(timer);
      timer = setTimeout(async () => { await supabase.auth.signOut(); nav("/login"); }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ["touchstart", "click", "keydown"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [nav]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    const validationError = validateImageFile(file);
    if (validationError) { toast(validationError, "error"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}-${Date.now()}.${ext}`;
      await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      setProfileUrl(urlData.publicUrl);
      setShowProfileModal(false);
    } catch (err: any) { toast(t("uploadFailed", { message: err.message }), "error"); }
    setUploading(false);
  }

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  // Hide bottom nav when virtual keyboard is open
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let initialHeight = vv.height;
    const onResize = () => {
      if (vv.height > initialHeight) initialHeight = vv.height;
      const isKb = vv.height < initialHeight * 0.85;
      setKeyboardOpen(isKb);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const visibleTabs = TABS.filter(t => t.key !== "inbox" || isAdmin);
  const activeTab = visibleTabs.find(t => loc.pathname.startsWith(t.path))?.key || "home";

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-x-hidden" style={{ background: "transparent" }}>
      {/* Floating Interactive Background Objects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full floating-blob blue-blob" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full floating-blob pink-blob" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full floating-blob light-blue-blob" style={{ animationDelay: "5s" }} />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <OfflineBanner />
        {localStorage.getItem("sa_original_school_id") && (
          <div className="w-full flex items-center justify-center gap-3 px-4 py-2 text-sm font-bold text-white"
            style={{ background: POS.warning, zIndex: 50 }}>
            <span>{t("saImpersonating")}</span>
            <button onClick={async () => {
              const originalSchoolId = localStorage.getItem("sa_original_school_id");
              const uid = localStorage.getItem("sa_impersonate_uid");
              if (uid && originalSchoolId) {
                await supabase.from("profiles").update({ school_id: originalSchoolId }).eq("id", uid);
              }
              localStorage.removeItem("sa_original_school_id");
              localStorage.removeItem("sa_impersonate_uid");
              window.location.href = "/admin";
            }}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-white" style={{ color: POS.warning }}>
              {t("saReturnToAdmin")}
            </button>
          </div>
        )}
        {/* TOP HEADER */}
        <header className="w-full flex items-center px-3 sm:px-6 py-2 glass sticky top-0 z-40 shadow-sm"
          style={{ borderBottom: `1px solid rgba(255,255,255,0.4)`, minHeight: 64 }}>
          {/* Left: Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav("/dashboard")}>
            <img src="/logo.webp" alt="Wonder Kids" className="w-10 h-10 rounded-[1rem] object-contain btn-gummy-sm shadow-sm" />
            <span className="text-2xl sm:text-3xl font-bouncy tracking-tight select-none hidden sm:block" style={{ color: POS.primaryDark }}>
              Wonder Kids
            </span>
          </div>

          <HeaderClock />

          {/* Right: Lang, Bell, Fullscreen, Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 z-10">
            <LanguageSwitcher />

            {/* Bell with notifications dropdown */}
            <div ref={bellRef} className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-[1rem] transition hover:bg-white hover:shadow-sm btn-gummy-sm min-w-[48px] min-h-[48px] flex items-center justify-center" aria-label="Notifications">
                <BellSolid className="w-6 h-6" style={{ color: POS.primary }} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center" style={{ background: POS.danger }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="fixed right-3 sm:absolute sm:right-0 top-16 sm:top-12 w-[calc(100vw-24px)] sm:w-72 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-2xl border"
                  style={{ borderColor: POS.borderLight, zIndex: 9999 }}>
                  <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between rounded-t-2xl" style={{ borderColor: POS.borderLight }}>
                    <span className="font-bold text-sm" style={{ color: POS.textPrimary }}>{t("notifications")}</span>
                    {notifications.length > 0 && (
                      <button onClick={markAllRead} className="text-[11px] font-bold px-2 py-1 rounded-lg hover:bg-gray-50"
                        style={{ color: POS.primary }}>
                        {t("markAllRead")}
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <BellOutline className="w-10 h-10 mx-auto mb-2" style={{ color: "#d0d0d0" }} />
                      <p className="text-sm" style={{ color: POS.textMuted }}>{t("noNotifications")}</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {notifications.map(n => {
                        const ago = timeAgo(n.created_at);
                        const typeColor = n.type === "overlimit" ? POS.danger : n.type === "renewal_approaching" ? "#D97706" : n.type === "renewal_request" ? POS.warning : n.type === "checkin" ? POS.success : POS.primary;
                        const typeLabel = n.type === "new_application" ? t("newStudentBadge") : n.type === "renewal_request" ? t("renew") : n.type === "overlimit" ? t("needsRenewal") : n.type === "renewal_approaching" ? t("renewalApproaching") : n.type === "checkin" ? t("checkIn") : n.type || "";
                        const handleClick = () => {
                          markRead(n.id);
                          setShowNotifications(false);
                          if (n.type === "new_application") nav("/inbox");
                          else if (n.student_id) nav(`/students/${n.student_id}`);
                        };
                        return (
                        <div key={n.id} className="p-3 rounded-xl cursor-pointer transition-colors hover:shadow-sm"
                          style={{ background: POS.bgSurface, border: `1px solid ${POS.borderLight}` }}
                          onClick={handleClick}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: typeColor + "18", color: typeColor }}>{typeLabel}</span>
                            <span className="text-[10px] font-medium flex-shrink-0" style={{ color: POS.textMuted }}>{ago}</span>
                          </div>
                          <p className="text-[13px] font-semibold leading-snug" style={{ color: POS.textPrimary }}>{notificationLabel(n)}</p>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={toggleFullscreen} className="p-2 rounded-[1rem] hover:bg-white hover:shadow-sm transition-all btn-gummy-sm min-w-[48px] min-h-[48px] flex items-center justify-center" style={{ color: POS.textSecondary }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {isFullscreen ? <ArrowsPointingInIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <ArrowsPointingOutIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            <button onClick={() => setShowProfileModal(true)} className="p-0 rounded-[1.2rem] overflow-hidden min-w-[48px] min-h-[48px] flex items-center justify-center" style={{ background: "none" }} aria-label="Profile">
              <img src={profileUrl || `${import.meta.env.BASE_URL}avatar.png`} alt="Profile"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-[1.2rem] border-2 shadow-sm object-cover transition-transform hover:scale-105"
                style={{ borderColor: "#fff" }}
                onError={() => setProfileUrl(`${import.meta.env.BASE_URL}avatar.png`)} />
            </button>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 w-full" style={{ paddingBottom: keyboardOpen ? 0 : 58 }}><Outlet /></main>

        {/* BOTTOM TAB BAR — hidden when keyboard is open */}
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 glass border-t shadow-[0_-10px_20px_rgba(0,0,0,0.03)] flex items-stretch justify-around px-2 pb-safe transition-transform duration-200"
          style={{ transform: keyboardOpen ? "translateY(100%)" : "translateY(0)", borderTopColor: "rgba(255,255,255,0.4)", minHeight: 52, paddingBottom: "max(env(safe-area-inset-bottom), 4px)", paddingTop: 2 }}>
          {visibleTabs.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = isActive ? tab.iconActive : tab.icon;
          const showBadge = tab.key === "inbox" && pendingReviewCount > 0;
          return (
            <button key={tab.key} onClick={() => nav(tab.path)}
              className="flex flex-col items-center justify-center flex-1 py-1 mx-1 transition-all relative rounded-[1.2rem]"
              style={{
                color: isActive ? "#fff" : POS.textTertiary,
                background: isActive ? POS.primaryGradient : "transparent",
                fontWeight: isActive ? 800 : 500,
                boxShadow: isActive ? "0 4px 12px rgba(108, 92, 231, 0.2)" : "none"
              }}>
              <Icon className="w-6 h-6 mb-0.5" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">{t(tab.label)}</span>
              {showBadge && (
                <span className="absolute -top-0.5 right-[calc(50%-18px)] text-white text-[9px] font-bold rounded-full h-5 w-5 flex items-center justify-center" style={{ background: POS.danger }}>
                  {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
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
              <input ref={fileInput as React.RefObject<HTMLInputElement>} type="file" accept="image/*" className="mb-4 text-sm font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" onChange={handleUpload} disabled={uploading} />

              <div className="w-full mb-4">
                <label className="text-xs font-bold mb-1 block text-center" style={{ color: POS.textMuted }}>{t("displayName")}</label>
                <input type="text" defaultValue={user?.full_name || ""}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val !== (user?.full_name || "")) {
                      await supabase.from("profiles").update({ full_name: val }).eq("id", user!.id);
                      setUser({ ...user!, full_name: val });
                      toast(t("saved"), "success");
                    }
                  }}
                  className="w-full rounded-xl px-4 py-3 text-center font-bold border"
                  style={{ borderColor: POS.borderLight, color: POS.textPrimary }}
                  placeholder={user?.username || user?.email?.split("@")[0] || ""} />
              </div>

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
