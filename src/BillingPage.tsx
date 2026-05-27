import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Dialog } from "@headlessui/react";
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useAuth } from "./AuthContext";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";
import { useToast } from "./hooks/useToast";
import type { Expense } from "./types";
import { fetchPayments, fetchExpenses, fetchMonthlySummary, addPayment, addExpense, deleteExpense } from "./services/billing";

function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: fetchPayments,
    staleTime: 60_000,
  });
}

function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: fetchExpenses,
    staleTime: 60_000,
  });
}

function useMonthlySummary() {
  return useQuery({
    queryKey: ["monthly_summary"],
    queryFn: fetchMonthlySummary,
    staleTime: 120_000,
  });
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "income" | "expenses">("overview");
  const { data: payments = [], error: paymentsError } = usePayments();
  const { data: expenses = [], error: expensesError } = useExpenses();
  const { data: summaries = [], error: summariesError } = useMonthlySummary();

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expCategory, setExpCategory] = useState("supplies");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");

  // Expense deletion state
  const [deleteExpenseItem, setDeleteExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState(false);

  // Payment recording state
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("THB");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);

  // Date range filter state — default last 30 days
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Filtered data
  const filteredPayments = useMemo(() => {
    let result = payments;
    if (dateFrom) result = result.filter(p => p.received_at >= dateFrom);
    if (dateTo) result = result.filter(p => p.received_at <= dateTo + "T23:59:59");
    return result;
  }, [payments, dateFrom, dateTo]);

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (dateFrom) result = result.filter(e => e.date >= dateFrom);
    if (dateTo) result = result.filter(e => e.date <= dateTo);
    return result;
  }, [expenses, dateFrom, dateTo]);

  const totalIncome = useMemo(() => {
    const paymentIncome = filteredPayments.reduce((s, p) => s + Number(p.amount), 0);
    if (paymentIncome > 0) return paymentIncome;
    const now = new Date();
    const currentMonth = summaries.find(s => s.month === now.getMonth() + 1 && s.year === now.getFullYear());
    return currentMonth ? Number(currentMonth.income) : 0;
  }, [filteredPayments, summaries]);
  const totalExpenses = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount), 0), [filteredExpenses]);

  async function handleAddExpense() {
    if (!expAmount || !user?.id) return;
    try {
      await addExpense({ category: expCategory, amount: Number(expAmount), description: expDesc || null, createdBy: user.id });
      toast(t("expenseAdded"), "success");
      setAddExpenseOpen(false);
      setExpAmount("");
      setExpDesc("");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function handleDeleteExpense() {
    if (!deleteExpenseItem) return;
    setDeletingExpense(true);
    try {
      await deleteExpense(deleteExpenseItem.id);
      toast(t("expenseDeleted"), "success");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) { toast(e.message, "error"); }
    setDeleteExpense(null);
    setDeletingExpense(false);
  }

  async function handleAddPayment() {
    if (!payAmount || !user?.id) return;
    try {
      await addPayment({ amount: Number(payAmount), currency: payCurrency, method: payMethod, note: payNote || null, file: payFile });
      toast(t("paymentRecorded"), "success");
      setAddPaymentOpen(false);
      setPayAmount(""); setPayNote(""); setPayFile(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    } catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bouncy mb-4" style={{ color: POS.textPrimary }}>
        <CurrencyDollarIcon className="w-7 h-7 inline mr-2" style={{ color: POS.warning }} />
        {t("billing")}
      </h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl p-4 bg-white text-center" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
          <ArrowTrendingUpIcon className="w-6 h-6 mx-auto mb-1" style={{ color: POS.success }} />
          <div className="text-xl font-bold" style={{ color: POS.success }}>
            {totalIncome.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: POS.textMuted }}>{t("incomeTHB")}</div>
        </div>
        <div className="rounded-2xl p-4 bg-white text-center" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
          <ArrowTrendingDownIcon className="w-6 h-6 mx-auto mb-1" style={{ color: POS.danger }} />
          <div className="text-xl font-bold" style={{ color: POS.danger }}>
            {totalExpenses.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: POS.textMuted }}>{t("expensesTHB")}</div>
        </div>
        <div className="rounded-2xl p-4 bg-white text-center" style={{ boxShadow: POS.shadowSm, border: `1px solid ${POS.borderLight}` }}>
          <CurrencyDollarIcon className="w-6 h-6 mx-auto mb-1" style={{ color: POS.primary }} />
          <div className="text-xl font-bold" style={{ color: totalIncome - totalExpenses >= 0 ? POS.success : POS.danger }}>
            {(totalIncome - totalExpenses).toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: POS.textMuted }}>{t("netTHB")}</div>
        </div>
      </div>

      {/* Date Range — Quick Presets + Custom */}
      <div className="bg-white rounded-2xl p-4 mb-4 border space-y-3" style={{ borderColor: POS.borderLight }}>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
            { label: t("all"), days: 0 },
          ].map(preset => {
            const presetFrom = preset.days > 0 ? new Date(Date.now() - preset.days * 86400000).toISOString().slice(0, 10) : "";
            const presetTo = preset.days > 0 ? new Date().toISOString().slice(0, 10) : "";
            const isActive = dateFrom === presetFrom && dateTo === presetTo;
            return (
              <button key={preset.label} onClick={() => { setDateFrom(presetFrom); setDateTo(presetTo); }}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: isActive ? POS.primary : POS.bgSurface,
                  color: isActive ? "#fff" : POS.textSecondary,
                }}>
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm flex-1" style={{ borderColor: POS.border }} />
          <span className="text-sm font-bold" style={{ color: POS.textMuted }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm flex-1" style={{ borderColor: POS.border }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["overview", "income", "expenses"] as const).map(key => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: tab === key ? POS.primary : POS.bgCard,
              color: tab === key ? "#fff" : POS.textSecondary,
              border: tab === key ? "none" : `1px solid ${POS.border}`,
            }}>
            {t(key)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-3">
          <h3 className="font-bold" style={{ color: POS.textPrimary }}>{t("monthlySummary")}</h3>
          {summariesError ? (
            <p className="text-center py-8" style={{ color: POS.danger }}>{t("errorLoadingData")}</p>
          ) : summaries.length === 0 ? (
            <p style={{ color: POS.textMuted }}>{t("noMonthlyData")}</p>
          ) : summaries.map(s => (
            <div key={s.id} className="bg-white rounded-xl p-4 flex items-center justify-between border"
              style={{ borderColor: POS.borderLight }}>
              <span className="font-semibold" style={{ color: POS.textPrimary }}>
                {s.month}/{s.year}
              </span>
              <div className="flex gap-6 text-sm">
                <span style={{ color: POS.success }}>+{Number(s.income).toLocaleString()}</span>
                <span style={{ color: POS.danger }}>-{Number(s.expenses).toLocaleString()}</span>
                <span className="font-bold" style={{ color: Number(s.profit) >= 0 ? POS.success : POS.danger }}>
                  = {Number(s.profit).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Income Tab */}
      {tab === "income" && (
        <div className="space-y-2">
          <button onClick={() => setAddPaymentOpen(true)}
            aria-label={t("recordPayment")}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary }}>
            <PlusIcon className="w-5 h-5" /> {t("recordPayment")}
          </button>

          {addPaymentOpen && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-4 border space-y-3"
              style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder={t("amount")} value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="rounded-xl border px-3 py-3" style={{ borderColor: POS.border }} />
                <input type="text" placeholder={t("currency")} value={payCurrency}
                  onChange={e => setPayCurrency(e.target.value)}
                  className="rounded-xl border px-3 py-3" style={{ borderColor: POS.border }} />
              </div>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                className="w-full rounded-xl border px-3 py-3" style={{ borderColor: POS.border }}>
                <option value="cash">{t("cash")}</option>
                <option value="transfer">{t("transfer")}</option>
                <option value="promptpay">{t("promptpay")}</option>
              </select>
              <input type="text" placeholder={t("note")} value={payNote}
                onChange={e => setPayNote(e.target.value)}
                className="w-full rounded-xl border px-3 py-3" style={{ borderColor: POS.border }} />
              <input type="file" accept="image/*,application/pdf"
                onChange={e => setPayFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm" />
              <div className="flex gap-2">
                <button onClick={() => { setAddPaymentOpen(false); setPayAmount(""); setPayNote(""); setPayFile(null); }}
                  aria-label={t("cancel")}
                  className="flex-1 py-3 rounded-xl border font-bold"
                  style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
                <button onClick={handleAddPayment}
                  aria-label={t("save")}
                  className="flex-1 py-3 rounded-xl text-white font-bold"
                  style={{ background: POS.success }}>{t("save")}</button>
              </div>
            </motion.div>
          )}

          {paymentsError ? (
            <p className="text-center py-8" style={{ color: POS.danger }}>{t("errorLoadingData")}</p>
          ) : filteredPayments.length === 0 ? (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noPaymentsRecorded")}</p>
          ) : filteredPayments.map(p => (
            <div key={p.id} className="bg-white rounded-xl p-3 flex items-center gap-3 border"
              style={{ borderColor: POS.borderLight }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: POS.successLight }}>
                <ArrowTrendingUpIcon className="w-5 h-5" style={{ color: POS.success }} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm" style={{ color: POS.textPrimary }}>
                  {Number(p.amount).toLocaleString()} {p.currency}
                </div>
                <div className="text-xs" style={{ color: POS.textMuted }}>
                  {new Date(p.received_at).toLocaleDateString()} {p.method && `| ${p.method}`}
                </div>
              </div>
              {p.receipt_url && (
                <button onClick={() => window.open(p.receipt_url!, "_blank")}
                  aria-label={t("receipt")}
                  className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ background: POS.bgSurface, color: POS.primary }}>
                  {t("receipt")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Expenses Tab */}
      {tab === "expenses" && (
        <div className="space-y-3">
          <button onClick={() => setAddExpenseOpen(true)}
            aria-label={t("addExpense")}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary }}>
            <PlusIcon className="w-5 h-5" /> {t("addExpense")}
          </button>

          {expensesError ? (
            <p className="text-center py-8" style={{ color: POS.danger }}>{t("errorLoadingData")}</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noExpensesRecorded")}</p>
          ) : filteredExpenses.map(e => (
            <div key={e.id} className="bg-white rounded-xl p-3 flex items-center gap-3 border"
              style={{ borderColor: POS.borderLight }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: POS.dangerLight }}>
                <ArrowTrendingDownIcon className="w-5 h-5" style={{ color: POS.danger }} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm" style={{ color: POS.textPrimary }}>
                  {Number(e.amount).toLocaleString()} THB — {e.category}
                </div>
                <div className="text-xs" style={{ color: POS.textMuted }}>
                  {new Date(e.date).toLocaleDateString()}
                  {e.description && ` | ${e.description}`}
                </div>
              </div>
              <button onClick={() => setDeleteExpense(e)}
                aria-label={t("delete")}
                className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                style={{ color: POS.danger }}>
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add Expense Inline */}
          {addExpenseOpen && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-4 border space-y-3"
              style={{ borderColor: POS.borderPurple, boxShadow: POS.shadowMd }}>
              <div className="grid grid-cols-2 gap-3">
                <select value={expCategory} onChange={e => setExpCategory(e.target.value)}
                  className="rounded-xl border px-3 py-3" style={{ borderColor: POS.border }}>
                  <option value="supplies">{t("supplies")}</option>
                  <option value="rent">{t("rent")}</option>
                  <option value="salary">{t("salary")}</option>
                  <option value="utilities">{t("utilities")}</option>
                  <option value="other">{t("other")}</option>
                </select>
                <input type="number" placeholder={t("amountTHB")} value={expAmount}
                  onChange={e => setExpAmount(e.target.value)}
                  className="rounded-xl border px-3 py-3" style={{ borderColor: POS.border }} />
              </div>
              <input type="text" placeholder={t("descriptionOptional")} value={expDesc}
                onChange={e => setExpDesc(e.target.value)}
                className="w-full rounded-xl border px-3 py-3" style={{ borderColor: POS.border }} />
              <div className="flex gap-2">
                <button onClick={() => setAddExpenseOpen(false)}
                  aria-label={t("cancel")}
                  className="flex-1 py-3 rounded-xl border font-bold"
                  style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
                <button onClick={handleAddExpense}
                  aria-label={t("save")}
                  className="flex-1 py-3 rounded-xl text-white font-bold"
                  style={{ background: POS.success }}>{t("save")}</button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Delete Expense Confirmation Dialog */}
      <Dialog open={!!deleteExpenseItem} onClose={() => setDeleteExpense(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4"
            style={{ boxShadow: POS.shadowLg }}>
            <Dialog.Title className="text-lg font-bold" style={{ color: POS.textPrimary }}>
              {t("confirmDelete")}
            </Dialog.Title>
            <p className="text-sm" style={{ color: POS.textSecondary }}>
              {t("confirmDeleteExpense")}
            </p>
            {deleteExpenseItem && (
              <div className="text-sm font-semibold" style={{ color: POS.danger }}>
                {Number(deleteExpenseItem.amount).toLocaleString()} THB — {deleteExpenseItem.category}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setDeleteExpense(null)}
                className="flex-1 py-3 rounded-xl border font-bold"
                style={{ borderColor: POS.border, color: POS.textSecondary }}>
                {t("cancel")}
              </button>
              <button onClick={handleDeleteExpense} disabled={deletingExpense}
                className="flex-1 py-3 rounded-xl text-white font-bold"
                style={{ background: POS.danger, opacity: deletingExpense ? 0.6 : 1 }}>
                {deletingExpense ? "..." : t("delete")}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
