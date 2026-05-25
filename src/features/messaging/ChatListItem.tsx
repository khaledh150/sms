import { POS } from "../../theme";
import { formatTime } from "./utils";
import { useTranslation } from "react-i18next";
import type { StudentBasic, LineMessage, LineConnection } from "./types";
import { LINE_GREEN } from "./types";

interface Props {
  student: StudentBasic;
  lastMessage: LineMessage | undefined;
  connection: LineConnection | undefined;
  onClick: () => void;
}

export default function ChatListItem({ student, lastMessage, connection, onClick }: Props) {
  const { t } = useTranslation();
  const displayName = student.nick_name ? `${student.nick_name} (${student.first_name})` : `${student.first_name} ${student.last_name}`;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
      style={{ borderBottom: "1px solid #f0f0f0" }}>
      {connection?.picture_url ? (
        <img src={connection.picture_url} alt="" className="w-12 h-12 rounded-full flex-shrink-0 object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
          style={{ background: LINE_GREEN }}>
          {(student.nick_name || student.first_name).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <span className="font-semibold text-sm" style={{ color: POS.textPrimary }}>{displayName}</span>
            {connection?.display_name && (
              <span className="text-[11px] ml-1.5" style={{ color: "#999" }}>· {connection.display_name}</span>
            )}
          </div>
          <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: "#a0a0a0" }}>
            {lastMessage ? formatTime(lastMessage.created_at) : ""}
          </span>
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: "#8e8e8e" }}>
          {lastMessage ? lastMessage.content : t("lineLinked")}
        </p>
      </div>
    </button>
  );
}
