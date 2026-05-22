import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { useStudents, useInactiveStudents } from "./hooks/useStudents";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

type Tab = "active" | "inactive";

export default function StudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const { data: activeStudents = [], isLoading: loadingActive } = useStudents(true);
  const { data: inactiveStudents = [], isLoading: loadingInactive } = useInactiveStudents();

  const students = tab === "active" ? activeStudents : inactiveStudents;
  const loading = tab === "active" ? loadingActive : loadingInactive;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      (s.nick_name || "").toLowerCase().includes(q) ||
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      (s.parent_phone || "").includes(q)
    );
  }, [students, search]);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold" style={{ color: POS.textPrimary }}>
          {t("students")}
          <span className="ml-2 text-base font-semibold px-3 py-1 rounded-full"
            style={{ background: POS.bgSurface, color: POS.primary }}>
            {students.length}
          </span>
        </h1>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("/admissions")}
          className="flex items-center gap-1 px-4 py-3 rounded-xl text-white font-bold text-sm"
          style={{ background: POS.primary, minHeight: POS.touchComfortable }}
        >
          <PlusIcon className="w-5 h-5" /> {t("addStudent")}
        </motion.button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        {(["active", "inactive"] as Tab[]).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: tab === tabKey ? POS.primary : POS.bgCard,
              color: tab === tabKey ? POS.textOnPrimary : POS.textSecondary,
              border: tab === tabKey ? "none" : `1px solid ${POS.border}`,
              boxShadow: tab === tabKey ? POS.shadowSm : "none",
            }}
          >
            {tabKey === "active" ? t("studentsActive") : t("studentsInactive")}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <MagnifyingGlassIcon
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
          style={{ color: POS.textMuted }}
        />
        <input
          type="text"
          placeholder={t("searchStudents")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border focus:outline-none focus:ring-2 text-base"
          style={{
            borderColor: POS.border,
            minHeight: POS.touchComfortable,
          }}
        />
      </div>

      {/* Student List */}
      {loading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg" style={{ color: POS.textMuted }}>{t("noStudentsFound")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s, idx) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/students/${s.id}`)}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white cursor-pointer hover:shadow-md transition-all"
              style={{
                border: `1px solid ${POS.borderLight}`,
                boxShadow: POS.shadowSm,
                minHeight: POS.touchXl,
              }}
            >
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                style={{ background: POS.primary }}
              >
                {(s.nick_name || s.first_name || "?").charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base truncate" style={{ color: POS.textPrimary }}>
                  {s.nick_name && (
                    <span style={{ color: POS.primary }}>"{s.nick_name}" </span>
                  )}
                  {s.first_name} {s.last_name}
                </div>
                <div className="text-xs truncate" style={{ color: POS.textMuted }}>
                  {s.parent_phone && `${t("phone")}: ${s.parent_phone}`}
                  {s.parent_line_id && ` | LINE: ${s.parent_line_id}`}
                </div>
              </div>

              {/* Status badge */}
              {tab === "inactive" && (
                <span className="px-2 py-1 rounded-full text-xs font-bold"
                  style={{ background: POS.dangerLight, color: POS.danger }}>
                  {t("inactive")}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
