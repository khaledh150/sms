import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import type { StudentForGrid } from "./types";

const INITIAL_SHOW = 8;

interface Props {
  students: StudentForGrid[];
  courseId: string;
  isHere: (sid: string, cid: string) => boolean;
  todayUsed: (sid: string, cid: string) => number;
  busyKey: string;
  onCheckIn: (stu: StudentForGrid, cid: string) => void;
  allTimeHours: Map<string, number>;
  collapsed?: boolean;
}

export default function StudentGrid({ students, courseId, isHere, todayUsed, busyKey, onCheckIn, allTimeHours, collapsed }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const showAll = expanded || !collapsed;
  const visible = showAll ? students : students.slice(0, INITIAL_SHOW);
  const hasMore = collapsed && !expanded && students.length > INITIAL_SHOW;

  return (
    <>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-5">
      {visible.map((stu: StudentForGrid) => {
        const checked = isHere(stu.student_id, courseId);
        const todayHrs = todayUsed(stu.student_id, courseId);
        const totalUsed = (allTimeHours.get(`${stu.student_id}|${courseId}`) || 0) + (stu.initial_used_hours || 0);
        const purchased = stu.purchased_hours;
        const remaining = purchased - totalUsed;
        const isOverlimit = purchased > 0 && remaining <= 0;
        const isApproaching = purchased > 0 && remaining > 0 && remaining <= 2;
        const isLow = purchased > 0 && remaining > 0 && remaining <= 3;
        const isBusy = busyKey === `${stu.student_id}|${courseId}`;

        let borderColor = "transparent";
        let bgColor = "rgba(255, 255, 255, 0.8)";

        if (checked && isOverlimit) { borderColor = "#EF4444"; bgColor = "rgba(254, 226, 226, 0.95)"; }
        else if (checked) { borderColor = "#34D399"; bgColor = "rgba(246, 255, 237, 0.95)"; }
        else if (isOverlimit) { borderColor = "#EF4444"; bgColor = "rgba(254, 226, 226, 0.95)"; }
        else if (isApproaching) { borderColor = "#F59E0B"; bgColor = "rgba(255, 251, 230, 0.95)"; }
        else if (isLow) { borderColor = "#FBBF24"; bgColor = "rgba(255, 251, 230, 0.95)"; }

        return (
          <motion.button key={stu.student_id} whileTap={{ scale: 0.92, rotate: (Math.random() - 0.5) * 4 }} disabled={isBusy}
            onClick={() => onCheckIn(stu, courseId)}
            className={`btn-gummy flex flex-col items-center justify-start overflow-hidden relative shadow-lg ${isOverlimit && !checked ? "pulse-danger" : ""}`}
            style={{
              borderRadius: "2rem",
              border: `2px solid ${borderColor}`,
              width: '100%',
              background: bgColor,
              aspectRatio: "3/4",
              opacity: isBusy ? 0.6 : stu.isExpectedToday ? 1 : 0.7,
            }}>

            <div className="w-full h-[55%] shrink-0 flex items-center justify-center relative overflow-hidden bg-[#EBF0FF]">
               {checked && (
                 <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                   className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md ${isOverlimit ? "bg-red-500/30" : "bg-green-500/30"}`}>
                   <span className="text-white text-5xl drop-shadow-xl font-extrabold">✓ {todayHrs > 1 ? todayHrs + "h" : ""}</span>
                 </motion.div>
               )}
               <div className="text-[5rem] font-bold opacity-80 drop-shadow-lg" style={{ color: POS.primaryLight }}>
                    {(stu.nick_name || stu.first_name || "?").charAt(0).toUpperCase()}
                  </div>
            </div>

            <div className="flex flex-col items-center justify-center w-full h-[45%] bg-white/95 px-2 glass-card">
              <div className="font-bouncy leading-tight truncate w-full text-center cursor-pointer hover:underline"
                style={{ color: isOverlimit ? POS.danger : isApproaching ? "#D97706" : POS.primary, fontSize: "0.95rem" }}
                onClick={(e) => { e.stopPropagation(); navigate(`/students/${stu.student_id}`); }}>
                {stu.nick_name || stu.first_name}{stu.nick_name && stu.first_name ? ` '${stu.first_name}'` : ""}
              </div>

              <div className="text-[11px] font-extrabold mt-1 px-3 py-1 rounded-full shadow-inner tracking-wider"
                style={{
                  background: isOverlimit ? "rgba(248, 113, 113, 0.15)" : isLow ? "rgba(251, 191, 36, 0.2)" : "rgba(0,0,0,0.04)",
                  color: isOverlimit ? "#EF4444" : isLow ? "#D97706" : POS.textSecondary
                }}>
                {totalUsed} / {purchased || "∞"} hrs
              </div>

              {isOverlimit && (
                <div className="text-[9px] font-extrabold mt-1 px-2 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#DC2626" }}>
                  {t("renewalNeeded")}
                </div>
              )}
              {isApproaching && !isOverlimit && (
                <div className="text-[9px] font-extrabold mt-1 px-2 py-0.5 rounded-full" style={{ background: "#FFF7CD", color: "#D97706" }}>
                  {t("renewalApproaching")}
                </div>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
    {hasMore && (
      <button onClick={() => setExpanded(true)}
        className="w-full mt-4 py-3 rounded-2xl text-sm font-bold btn-gummy-sm"
        style={{ background: POS.bgSurface, color: POS.primary, border: `2px dashed ${POS.primary}44` }}>
        {t("seeMore")} (+{students.length - INITIAL_SHOW})
      </button>
    )}
    {collapsed && expanded && students.length > INITIAL_SHOW && (
      <button onClick={() => setExpanded(false)}
        className="w-full mt-4 py-3 rounded-2xl text-sm font-bold btn-gummy-sm"
        style={{ background: POS.bgSurface, color: POS.textMuted }}>
        {t("showLess")}
      </button>
    )}
    </>
  );
}
