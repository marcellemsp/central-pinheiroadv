import { createClient } from "@/lib/supabase/server";
import type { Cliente, Pendencia } from "@/lib/types";

const SELECT = "*, cliente:clientes(id, nome)";

export async function listarPendencias(opcoes: { incluirConcluidas?: boolean } = {}) {
  const supabase = createClient();
  if (!supabase) return null;
  let q = supabase.from("pendencias").select(SELECT).order("ordem", { ascending: true });
  if (!opcoes.incluirConcluidas) {
    // Concluídas só aparecem se foram fechadas nos últimos 14 dias.
    const corte = new Date(Date.now() - 14 * 86400000).toISOString();
    q = q.or(`bucket.neq.concluido,concluido_em.gte.${corte}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Pendencia[];
}

export async function listarClientes() {
  const supabase = createClient();
  if (!supabase) return [];
  const { data } = await supabase.from("clientes").select("id, nome").order("nome");
  return (data ?? []) as Pick<Cliente, "id" | "nome">[];
}

/** Data de hoje em São Paulo, no formato AAAA-MM-DD. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDias(isoData: string, dias: number): string {
  const d = new Date(isoData + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function formatarData(isoData: string): string {
  const [a, m, d] = isoData.split("-");
  return `${d}/${m}/${a}`;
}
