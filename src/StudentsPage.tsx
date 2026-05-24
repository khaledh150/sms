import { useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { ArrowUpTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Dialog } from "@headlessui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudents, useInactiveStudents } from "./hooks/useStudents";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";
import { supabase } from "./supabaseClient";
import { useToast } from "./hooks/useToast";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

type Tab = "active" | "inactive";

function parseCSV(text: string) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] || ""; });
    rows.push({
      nick_name: row.nick_name || row.nickname || "",
      first_name: row.first_name || row.firstname || "",
      last_name: row.last_name || row.lastname || "",
      parent_phone: row.parent_phone || row.phone || "",
      parent_line_id: row.parent_line_id || row.line_id || row.line || "",
    });
  }
  return rows;
}

export default function StudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "inactive" ? "inactive" : "active") as Tab;
  const setTab = useCallback((t: Tab) => setSearchParams(t === "active" ? {} : { tab: t }, { replace: true }), [setSearchParams]);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [importOpen, setImportOpen] = useState(false);
  const [csvData, setCsvData] = useState<Array<{nick_name: string; first_name: string; last_name: string; parent_phone: string; parent_line_id: string}>>([]);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

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

  const visibleStudents = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const loadMore = useCallback(() => setVisibleCount(c => c + 50), []);
  const sentinelRef = useInfiniteScroll(loadMore, hasMore, loading);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvData(parseCSV(text));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (csvData.length === 0) return;
    setImporting(true);
    const toInsert = csvData.filter(r => r.first_name).map(r => ({
      first_name: r.first_name,
      last_name: r.last_name,
      nick_name: r.nick_name || null,
      parent_phone: r.parent_phone || null,
      parent_line_id: r.parent_line_id || null,
      status: "active" as const,
    }));
    const { error } = await supabase.from("students").insert(toInsert);
    if (error) {
      toast(error.message, "error");
    } else {
      toast(t("studentsImported", { count: toInsert.length }), "success");
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setImportOpen(false);
      setCsvData([]);
      setImportFile(null);
    }
    setImporting(false);
  }

  function downloadTemplate() {
    const csv = "nick_name,first_name,last_name,parent_phone,parent_line_id\nPloy,Somchai,Jaidee,0812345678,@somchai";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setImportOpen(true)}
            aria-label={t("importCSV")}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-bold text-xs"
            style={{
              background: POS.bgSurface,
              color: POS.textMuted,
              border: `1px solid ${POS.border}`,
            }}
          >
            <ArrowUpTrayIcon className="w-4 h-4" /> {t("importCSV")}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/admissions")}
            aria-label={t("addStudent")}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary }}
          >
            <PlusIcon className="w-4 h-4" /> {t("addStudent")}
          </motion.button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("active")}
          className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
          style={{
            background: tab === "active" ? POS.primary : POS.bgCard,
            color: tab === "active" ? "#fff" : POS.textSecondary,
            border: tab === "active" ? "none" : `1px solid ${POS.border}`,
            boxShadow: tab === "active" ? POS.shadowSm : "none",
          }}
        >
          {t("studentsActive")} ({activeStudents.length})
        </button>
        <button
          onClick={() => setTab("inactive")}
          className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
          style={{
            background: tab === "inactive" ? POS.danger : POS.bgCard,
            color: tab === "inactive" ? "#fff" : POS.textMuted,
            border: tab === "inactive" ? "none" : `1px solid ${POS.border}`,
            boxShadow: tab === "inactive" ? POS.shadowSm : "none",
          }}
        >
          {t("studentsInactive")} ({inactiveStudents.length})
        </button>
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
          aria-label={t("searchStudents")}
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(50); }}
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
          {visibleStudents.map((s: any, idx: number) => (
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
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
        </div>
      )}

      {/* CSV Import Modal */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel
            className="bg-white rounded-2xl p-6 w-full max-w-lg mx-auto"
            style={{ boxShadow: POS.shadowXl }}
          >
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-bold" style={{ color: POS.textPrimary }}>
                {t("importStudents")}
              </Dialog.Title>
              <button onClick={() => setImportOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <XMarkIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
              </button>
            </div>

            {/* CSV format hint */}
            <p className="text-xs mb-3 font-mono px-3 py-2 rounded-lg" style={{ background: POS.bgSurface, color: POS.textSecondary }}>
              {t("csvFormatHint")}
            </p>

            {/* Download template + File input */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={downloadTemplate}
                className="px-3 py-2 rounded-xl text-sm font-bold"
                style={{ background: POS.bgSurface, color: POS.primary, border: `1px solid ${POS.borderPurple}` }}
              >
                {t("downloadTemplate")}
              </button>
              <label
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer"
                style={{ background: POS.bgSurface, border: `1px solid ${POS.border}`, color: POS.textSecondary }}
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                {importFile ? importFile.name : t("importCSV")}
                <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {/* Preview table */}
            {csvData.length > 0 ? (
              <>
                <p className="text-sm font-bold mb-2" style={{ color: POS.textPrimary }}>
                  {t("preview")} ({csvData.length})
                </p>
                <div className="max-h-60 overflow-y-auto rounded-xl border" style={{ borderColor: POS.border }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: POS.bgSurface }}>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>#</th>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>{t("nickName")}</th>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>{t("firstName")}</th>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>{t("lastName")}</th>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>{t("phone")}</th>
                        <th className="px-2 py-2 text-left font-bold" style={{ color: POS.textSecondary }}>LINE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.map((row, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: POS.borderLight }}>
                          <td className="px-2 py-1.5" style={{ color: POS.textMuted }}>{i + 1}</td>
                          <td className="px-2 py-1.5" style={{ color: POS.textPrimary }}>{row.nick_name}</td>
                          <td className="px-2 py-1.5" style={{ color: POS.textPrimary }}>{row.first_name}</td>
                          <td className="px-2 py-1.5" style={{ color: POS.textPrimary }}>{row.last_name}</td>
                          <td className="px-2 py-1.5" style={{ color: POS.textMuted }}>{row.parent_phone}</td>
                          <td className="px-2 py-1.5" style={{ color: POS.textMuted }}>{row.parent_line_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : importFile ? (
              <p className="text-sm text-center py-4" style={{ color: POS.textMuted }}>{t("noDataInFile")}</p>
            ) : null}

            {/* Footer */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setImportOpen(false); setCsvData([]); setImportFile(null); }}
                className="px-4 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: POS.bgSurface, color: POS.textSecondary }}
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleImport}
                disabled={csvData.filter(r => r.first_name).length === 0 || importing}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: POS.primary }}
              >
                {importing ? t("loading") : t("importBtn", { count: csvData.filter(r => r.first_name).length })}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
