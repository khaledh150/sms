import { ArrowsPointingOutIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";
import { POS } from "../../theme";
import StudentGrid from "./StudentGrid";
import type { CourseGroup, StudentForGrid } from "./types";

const SECTION_COLORS = [POS.primary, POS.info, POS.warning, "#E91E63", POS.success];

interface Props {
  group: CourseGroup;
  index: number;
  isHere: (sid: string, cid: string) => boolean;
  todayUsed: (sid: string, cid: string) => number;
  busyKey: string;
  onCheckIn: (stu: StudentForGrid, cid: string) => void;
  onBulkCheckIn: (group: CourseGroup) => void;
  onExpand: (courseId: string) => void;
  allTimeHours: Map<string, number>;
}

export default function CourseGroupSection({
  group, index, isHere, todayUsed, busyKey, onCheckIn, onBulkCheckIn, onExpand, allTimeHours,
}: Props) {
  const { t } = useTranslation();
  const checkedCount = group.students.filter(s => isHere(s.student_id, group.courseId)).length;
  const uncheckedAll = group.students.filter(s => !isHere(s.student_id, group.courseId)).length;
  const sectionColor = SECTION_COLORS[index % SECTION_COLORS.length];

  return (
    <section className="bg-white p-5 rounded-[2rem] shadow-sm border-2 relative" style={{ borderColor: POS.borderPurple }}>
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {uncheckedAll > 0 && (
          <button onClick={() => onBulkCheckIn(group)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white btn-gummy-sm" style={{ background: POS.success }}>
            {t("checkInAll", { count: uncheckedAll })}
          </button>
        )}
        <button onClick={() => onExpand(group.courseId)} aria-label={t("expand") + " " + group.courseName}
          className="w-9 h-9 rounded-xl flex items-center justify-center btn-gummy-sm hover:bg-gray-100 transition-colors"
          style={{ color: POS.textMuted }}>
          <ArrowsPointingOutIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="mb-5 pr-36 sm:pr-48">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-white text-xl font-bouncy btn-gummy-sm shrink-0" style={{ background: sectionColor }}>
            {group.courseName.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bouncy leading-tight" style={{ color: POS.textPrimary }}>{group.courseName}</h2>
            <div className="text-base font-bold" style={{ color: checkedCount > 0 ? POS.success : POS.textMuted }}>
              {checkedCount} {t("checkedIn")}
            </div>
          </div>
        </div>
      </div>

      <StudentGrid students={group.students} courseId={group.courseId} isHere={isHere} todayUsed={todayUsed} busyKey={busyKey} onCheckIn={onCheckIn} allTimeHours={allTimeHours} collapsed />
    </section>
  );
}
