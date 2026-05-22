import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

interface Payment {
  id: string;
  student_id: string;
  amount: number;
  currency: string;
  method: string | null;
  received_at: string;
  course_id: string | null;
  note: string | null;
  receipt_url: string | null;
}

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
}

interface MonthlySummary {
  id: string;
  month: number;
  year: number;
  income: number;
  expenses: number;
  profit: number;
}

function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").order("received_at", { ascending: false }).limit(50);
      return (data ?? []) as Payment[];
    },
    staleTime: 60_000,
  });
}

function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false }).limit(50);
      return (data ?? []) as Expense[];
    },
    staleTime: 60_000,
  });
}

function useMonthlySummary() {
  return useQuery({
    queryKey: ["monthly_summary"],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_summary").select("*").order("year", { ascending: false }).order("month", { ascending: false }).limit(12);
      return (data ?? []) as MonthlySummary[];
    },
    staleTime: 120_000,
  });
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "income" | "expenses">("overview");
  const { data: payments = [] } = usePayments();
  const { data: expenses = [] } = useExpenses();
  const { data: summaries = [] } = useMonthlySummary();

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expCategory, setExpCategory] = useState("supplies");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");

  const totalIncome = useMemo(() => payments.reduce((s, p) => s + Number(p.amount), 0), [payments]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  async function handleAddExpense() {
    if (!expAmount || !user?.id) return;
    await supabase.from("expenses").insert([{
      category: expCategory,
      amount: Number(expAmount),
      description: expDesc || null,
      created_by: user.id,
    }]);
    setAddExpenseOpen(false);
    setExpAmount("");
    setExpDesc("");
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4" style={{ color: POS.textPrimary }}>
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
          {summaries.length === 0 ? (
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
          {payments.length === 0 ? (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noPaymentsRecorded")}</p>
          ) : payments.map(p => (
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
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: POS.primary }}>
            <PlusIcon className="w-5 h-5" /> {t("addExpense")}
          </button>

          {expenses.length === 0 ? (
            <p className="text-center py-8" style={{ color: POS.textMuted }}>{t("noExpensesRecorded")}</p>
          ) : expenses.map(e => (
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
                  className="flex-1 py-3 rounded-xl border font-bold"
                  style={{ borderColor: POS.border, color: POS.textSecondary }}>{t("cancel")}</button>
                <button onClick={handleAddExpense}
                  className="flex-1 py-3 rounded-xl text-white font-bold"
                  style={{ background: POS.success }}>{t("save")}</button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
