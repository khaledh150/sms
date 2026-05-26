import { supabase } from "../supabaseClient";
import type { Payment, Expense, MonthlySummary } from "../types";

export async function fetchPayments(): Promise<Payment[]> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Payment[];
}

export async function fetchExpenses(): Promise<Expense[]> {
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .limit(50);
  return (data ?? []) as Expense[];
}

export async function fetchMonthlySummary(): Promise<MonthlySummary[]> {
  const { data } = await supabase
    .from("monthly_summary")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(12);
  return (data ?? []) as MonthlySummary[];
}

export async function addPayment(params: {
  amount: number;
  currency: string;
  method: string;
  note: string | null;
  file: File | null;
}): Promise<void> {
  let receiptUrl: string | null = null;

  if (params.file) {
    const fn = `${Date.now()}-${params.file.name}`;
    const { data: uploaded, error: ue } = await supabase.storage
      .from("receipts")
      .upload(fn, params.file);
    if (ue) throw ue;
    const { data: pu } = supabase.storage.from("receipts").getPublicUrl(uploaded.path);
    receiptUrl = pu.publicUrl;
  }

  const { error } = await supabase.from("payments").insert([{
    amount: params.amount,
    currency: params.currency,
    method: params.method,
    note: params.note,
    receipt_url: receiptUrl,
  }]);
  if (error) throw error;
}

export async function addExpense(params: {
  category: string;
  amount: number;
  description: string | null;
  createdBy: string;
}): Promise<void> {
  const { error } = await supabase.from("expenses").insert([{
    category: params.category,
    amount: params.amount,
    description: params.description,
    created_by: params.createdBy,
  }]);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
