import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpenIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  GlobeAltIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { POS } from "./theme";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

export default function MorePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const isSuperAdmin = user?.role === "superadmin";

  const items = [
    { label: t("addExistingStudent"), icon: <UsersIcon className="w-6 h-6" />, path: "/admissions?mode=existing", color: POS.info },
    { label: t("courses"), icon: <BookOpenIcon className="w-6 h-6" />, path: "/courses", color: POS.primary },
    ...(isAdmin ? [
      { label: t("reports"), icon: <ChartBarIcon className="w-6 h-6" />, path: "/reports", color: POS.info },
      { label: t("billing"), icon: <CurrencyDollarIcon className="w-6 h-6" />, path: "/billing", color: POS.warning },
      { label: t("lineOa"), icon: <ChatBubbleLeftRightIcon className="w-6 h-6" />, path: "/messaging", color: "#06C755" },
      { label: t("settings"), icon: <Cog6ToothIcon className="w-6 h-6" />, path: "/settings", color: POS.textSecondary },
    ] : []),
    ...(isSuperAdmin ? [
      { label: t("superAdmin"), icon: <ShieldCheckIcon className="w-6 h-6" />, path: "/admin", color: POS.primaryDark },
    ] : []),
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: POS.primary }}>{t("more")}</h1>
      <div className="space-y-3">
        {items.map((item, i) => (
          <motion.button key={i} whileTap={{ scale: 0.98 }} onClick={() => nav(item.path)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white border transition-all hover:shadow-md"
            style={{ borderColor: POS.border, boxShadow: POS.shadowSm, minHeight: POS.touchLarge }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: item.color }}>{item.icon}</div>
            <span className="text-lg font-semibold" style={{ color: POS.textPrimary }}>{item.label}</span>
          </motion.button>
        ))}
        <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white border"
          style={{ borderColor: POS.border, boxShadow: POS.shadowSm, minHeight: POS.touchLarge }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: POS.primaryLight }}>
            <GlobeAltIcon className="w-6 h-6" />
          </div>
          <span className="text-lg font-semibold flex-1" style={{ color: POS.textPrimary }}>{t("language")}</span>
          <LanguageSwitcher />
        </div>
        <motion.button whileTap={{ scale: 0.98 }}
          onClick={async () => { await supabase.auth.signOut(); nav("/login"); }}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all mt-6"
          style={{ background: POS.dangerLight, borderColor: POS.danger + "33", minHeight: POS.touchLarge }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: POS.danger }}>
            <ArrowRightOnRectangleIcon className="w-6 h-6" />
          </div>
          <span className="text-lg font-semibold" style={{ color: POS.danger }}>{t("logout")}</span>
        </motion.button>
      </div>
    </div>
  );
}
