import { useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { useStudentsWithStatus } from "./hooks/useStudents";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

type Tab = "active" | "notActive" | "finished";

export default function StudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = rawTab === "notActive" || rawTab === "finished" ? rawTab : "active";
  const setTab = useCallback((val: Tab) => setSearchParams(val === "active" ? {} : { tab: val }, { replace: true }), [setSearchParams]);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  const { data: allStudents = [], isLoading } = useStudentsWithStatus();

  const byTab = useMemo(() => {
    const active = allStudents.filter(s => s.tab === "active");
    const notActive = allStudents.filter(s => s.tab === "notActive");
    const finished = allStudents.filter(s => s.tab === "finished");
    return { active, notActive, finished };
  }, [allStudents]);

  const students = byTab[tab];

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

  const visibleStudents = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const loadMore = useCallback(() => setVisibleCount(c => c + 50), []);
  const sentinelRef = useInfiniteScroll(loadMore, hasMore, isLoading);

  const tabs: { key: Tab; label: string; count: number; color: string; activeColor: string }[] = [
    { key: "active", label: t("tabActive"), count: byTab.active.length, color: POS.success, activeColor: POS.success },
    { key: "notActive", label: t("tabNotActive"), count: byTab.notActive.length, color: POS.warning, activeColor: POS.warning },
    { key: "finished", label: t("tabFinished"), count: byTab.finished.length, color: POS.danger, activeColor: POS.danger },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-extrabold" style={{ color: POS.textPrimary }}>
          {t("students")}
        </h1>
      </div>

      <div className="flex gap-2 mb-3">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => { setTab(tb.key); setVisibleCount(50); }}
            className="flex-1 py-2.5 rounded-xl font-bold text-xs transition-all"
            style={{
              background: tab === tb.key ? tb.activeColor : POS.bgCard,
              color: tab === tb.key ? "#fff" : POS.textSecondary,
              border: tab === tb.key ? "none" : `1px solid ${POS.border}`,
              boxShadow: tab === tb.key ? POS.shadowSm : "none",
            }}>
            {tb.label} ({tb.count})
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: POS.textMuted }} />
        <input type="text" placeholder={t("searchStudents")} aria-label={t("searchStudents")}
          value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(50); }}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border focus:outline-none focus:ring-2 text-sm"
          style={{ borderColor: POS.border }} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg" style={{ color: POS.textMuted }}>{t("noStudentsFound")}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleStudents.map((s, idx) => (
            <motion.div key={s.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/students/${s.id}`)}
              className="flex items-center gap-3 p-3 rounded-xl bg-white cursor-pointer hover:shadow-md transition-all"
              style={{ border: `1px solid ${POS.borderLight}`, boxShadow: POS.shadowSm }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden"
                style={{ background: POS.primary }}>
                {s.photo_url ? (
                  <img src={s.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (s.nick_name || s.first_name || "?").charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate" style={{ color: POS.textPrimary }}>
                  {s.nick_name && <span style={{ color: POS.primary }}>"{s.nick_name}" </span>}
                  {s.first_name} {s.last_name}
                </div>
                <div className="text-xs truncate" style={{ color: POS.textMuted }}>
                  {tab === "finished" && s.total_purchased > 0 && (
                    <span style={{ color: POS.danger }}>{s.total_used}/{s.total_purchased} {t("hrs")} </span>
                  )}
                  {tab === "notActive" && s.last_checkin && (
                    <span>{t("lastCheckin")}: {new Date(s.last_checkin).toLocaleDateString("en-GB")} </span>
                  )}
                  {s.parent_phone && `${s.parent_phone}`}
                </div>
              </div>
              {tab === "finished" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: POS.dangerLight, color: POS.danger }}>
                  {t("hoursUp")}
                </span>
              )}
            </motion.div>
          ))}
          <div ref={sentinelRef} className="h-4" />
        </div>
      )}
    </div>
  );
}
