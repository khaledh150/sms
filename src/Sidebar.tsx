import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/solid";

const PURPLE = "#6654b3";
const WHITE = "#f6f6f6";
const SIDEBAR_WIDTH = 80;

export default function Sidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const isHome = loc.pathname === "/dashboard";

  // Middle icon stack
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

  // Always keep 1 empty space above icon stack for the back button
  return (
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
      className="fixed top-0 left-0"
    >
      {/* Reserved space for back button */}
      <div style={{ height: 56, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {!isHome && (
          <button
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/90 hover:bg-[#edeaf8] text-[#6654b3] shadow transition"
            onClick={() => nav(-1)}
            aria-label="Back"
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
          >
            {btn.icon}
          </Link>
        ))}
      </div>
      {/* Bottom buttons */}
      <div className="flex flex-col items-center gap-4 mb-3">
        <Link
          to="/settings"
          className={`flex items-center justify-center w-12 h-12 rounded-xl transition
            ${loc.pathname === "/settings" ? "bg-white/80 shadow text-[#6654b3]" : "text-white hover:bg-white/20"}`}
        >
          <Cog6ToothIcon className="w-8 h-8" />
        </Link>
        <button
          title="Logout"
          onClick={() => nav("/logout")}
          className="w-12 h-12 flex items-center justify-center bg-white/90 hover:bg-pink-100 text-[#ec4899] rounded-xl shadow transition"
        >
          <ArrowRightOnRectangleIcon className="w-8 h-8" />
        </button>
      </div>
    </aside>
  );
}
