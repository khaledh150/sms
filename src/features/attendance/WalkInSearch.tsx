import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { useDebounce } from "../../hooks/useDebounce";
import { playDing, haptic } from "./attendanceUtils";
import { POS } from "../../theme";
import type { AttendanceRow } from "../../services/attendance";

interface Props {
  onCheckIn: (row: AttendanceRow) => void;
}

export default function WalkInSearch({ onCheckIn }: Props) {
  const { t } = useTranslation();
  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (debouncedSearch.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    supabase.from("students")
      .select("id,first_name,last_name,nick_name,qr_code_url")
      .eq("status", "active")
      .or(`nick_name.ilike.%${debouncedSearch}%,first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%`)
      .limit(10)
      .then(({ data }) => { if (!cancelled) setSearchResults(data ?? []); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  async function walkInCheckIn(studentId: string, studentName: string) {
    const { data, error } = await supabase.from("attendance")
      .insert({ student_id: studentId, course_id: null, attended_at_ts: new Date().toISOString() }).select();
    if (!error && data) {
      onCheckIn(data[0]);
      playDing(); haptic("success");
    }
    setShowSearch(false); setSearchInput(""); setSearchResults([]);
  }

  return (
    <div className="mb-8">
      <button onClick={() => setShowSearch(!showSearch)}
        className="w-full py-4 rounded-[2rem] text-xl font-bouncy transition-all flex items-center justify-center gap-3 btn-gummy-sm"
        style={{ background: showSearch ? POS.primary : "white", color: showSearch ? "#fff" : POS.primary, boxShadow: POS.shadowSm }}>
        {showSearch ? <><XMarkIcon className="w-6 h-6 inline-block" /> {t("closeSearchBtn")}</> : <><span>🔍</span> {t("walkInSearchBtn")}</>}
      </button>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
            <input type="text" placeholder={t("searchPlaceholder")} value={searchInput}
              onChange={e => setSearchInput(e.target.value)} autoFocus
              className="w-full rounded-[2rem] px-6 py-5 text-xl font-bold shadow-inner focus:outline-none"
              style={{ border: `3px solid ${POS.borderPurple}`, background: "#fff" }} />

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map(s => (
                  <button key={s.id} onClick={() => walkInCheckIn(s.id, s.nick_name || s.first_name)}
                    className="w-full flex items-center gap-4 p-4 rounded-[1.5rem] bg-white text-left btn-gummy-sm"
                    style={{ border: `2px solid ${POS.borderLight}` }}>
                    <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy shadow-sm" style={{ background: POS.primary }}>
                      {(s.nick_name || s.first_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bouncy text-xl" style={{ color: POS.textPrimary }}>
                      {s.nick_name && <span style={{ color: POS.primary }}>"{s.nick_name}" </span>}{s.first_name} {s.last_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
