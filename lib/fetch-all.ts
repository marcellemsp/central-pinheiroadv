// Helper pra puxar TODAS as linhas de uma query (sem limite de 1000 do PostgREST)
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchAll<T = any>(
  supabase: SupabaseClient,
  table: string,
  opts: { columns?: string; orderBy?: { column: string; ascending?: boolean; nullsFirst?: boolean }; chunkSize?: number } = {}
): Promise<T[]> {
  const { columns = "*", orderBy, chunkSize = 1000 } = opts;
  const all: T[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + chunkSize - 1);
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true, nullsFirst: orderBy.nullsFirst });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}


// Variante com filtros: recebe um builder que monta a query e aplica .range(from, to).
// Ex.: fetchAllQuery((f, t) => supabase.from("casos").select("*").eq("area", area).order("prazo_proximo").range(f, t))
export async function fetchAllQuery<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  chunkSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += chunkSize) {
    const { data, error } = await build(from, from + chunkSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < chunkSize) break;
  }
  return all;
}
