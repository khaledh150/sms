import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftIcon,
  Bars3Icon,
  XMarkIcon
} from "@heroicons/react/24/solid";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

const PURPLE = "#6654b3";
const WHITE = "#f6f6f6";
const SIDEBAR_WIDTH = 80;

export default function Sidebar() {
  const { t } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const isHome = loc.pathname === "/dashboard";

  const [open, setOpen] = useState(false);

  const buttons = [
    {
      to: "/dashboard",
      icon: <HomeIcon className="w-8 h-8" />,
      active: loc.pathname === "/dashboard",
      key: "home"
    },
    {
      to: "/reports",
      icon: <DocumentTextIcon className="w-8 h-8" />,
      active: loc.pathname.startsWith("/reports"),
      key: "reports"
    },
    {
      to: "/messaging",
      icon: <ChatBubbleLeftRightIcon className="w-8 h-8" />,
      active: loc.pathname.startsWith("/messaging"),
      key: "messaging"
    },
    {
      to: "/billing",
      icon: <CurrencyDollarIcon className="w-8 h-8" />,
      active: loc.pathname.startsWith("/billing"),
      key: "billing"
    }
  ];

  // Responsive: If small screen, use mobile drawer
  return (
    <>
      {/* Mobile Menu Button */}
      <button
        className="fixed top-3 left-3 z-50 bg-[#6654b3] text-white p-2 rounded-xl shadow-lg md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{ display: open ? "none" : undefined }}
      >
        <Bars3Icon className="w-8 h-8" />
      </button>
      {/* Sidebar (desktop + mobile drawer) */}
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          background: PURPLE,
          color: WHITE,
          borderTopRightRadius: "36px",
          borderBottomRightRadius: "36px",
          minHeight: "100vh",
          boxShadow: "2px 0 20px 0 rgba(102,84,179,0.08)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "32px"
        }}
        className={`fixed top-0 left-0 md:flex ${open ? "flex" : "hidden"} md:!flex`}
      >
        {/* Mobile close button */}
        <button
          className="absolute top-3 right-3 md:hidden bg-white/80 text-[#6654b3] rounded-full p-1 shadow"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <XMarkIcon className="w-7 h-7" />
        </button>
        {/* Reserved space for back button */}
        <div style={{ height: 56, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!isHome && (
            <button
              className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/90 hover:bg-[#edeaf8] text-[#6654b3] shadow transition"
              onClick={() => nav(-1)}
              aria-label={t("back")}
            >
              <ArrowLeftIcon className="w-7 h-7" />
            </button>
          )}
        </div>
        {/* Vertically centered icon stack */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "28px" }}>
          {buttons.map(btn => (
            <Link
              to={btn.to}
              key={btn.key}
              className={`flex items-center justify-center w-12 h-12 rounded-xl transition
                ${btn.active ? "bg-white/80 shadow text-[#6654b3]" : "text-white hover:bg-white/20"}`}
              title={t(btn.key)}
              onClick={() => setOpen(false)}
            >
              {btn.icon}
            </Link>
          ))}
        </div>
        {/* Bottom language switcher */}
        <div className="mb-4">
          <LanguageSwitcher />
        </div>
        {/* Bottom buttons */}
        <div className="flex flex-col items-center gap-4 mb-3">
          <Link
            to="/settings"
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition
              ${loc.pathname === "/settings" ? "bg-white/80 shadow text-[#6654b3]" : "text-white hover:bg-white/20"}`}
            title={t("settings")}
            onClick={() => setOpen(false)}
          >
            <Cog6ToothIcon className="w-8 h-8" />
          </Link>
          <button
            type="button"
            title={t("logout")}
            onClick={() => nav("/logout")}
            className="w-12 h-12 flex items-center justify-center bg-white/90 hover:bg-pink-100 text-[#ec4899] rounded-xl shadow transition"
          >
            <ArrowRightOnRectangleIcon className="w-8 h-8" />
          </button>
        </div>
      </aside>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
