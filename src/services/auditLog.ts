import { supabase } from "../supabaseClient";
import type { AuditEntry } from "../types";

const LOG_PAGE = 50;

export async function fetchAuditLogs(params: {
  offset?: number;
  filter?: string;
}): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const { offset = 0, filter = "" } = params;

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + LOG_PAGE - 1);
  if (filter) query = query.eq("action", filter);

  const { data, error } = await query;
  if (error) throw error;
  const entries = (data ?? []) as AuditEntry[];

  const actorIds = [...new Set(entries.map(e => e.actor_id).filter(Boolean))];
  if (actorIds.length > 0) {
    const { data: actorProfiles } = await supabase
      .from("profiles")
      .select("id,full_name,username")
      .in("id", actorIds);
    const nameMap = new Map(
      (actorProfiles ?? []).map((p: any) => [p.id, p.full_name || p.username || "Unknown"])
    );
    entries.forEach(e => {
      e.actor_name = nameMap.get(e.actor_id) || "System";
    });
  }

  return { entries, hasMore: entries.length === LOG_PAGE };
}
