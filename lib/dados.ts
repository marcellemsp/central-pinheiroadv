import { createClient } from "@/lib/supabase/server";
import type { Caso, Cliente, Pendencia } from "@/lib/types";

const PEND = "*, cliente:clientes(id, nome), caso:casos(id, titulo, numero_processo)";

export async function listarClientesCompleto() {
  const sb = createClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("clientes")
    .select("*, casos(id, status), pendencias(id, bucket)")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as (Cliente & { casos: { id: string; status: string }[]; pendencias: { id: string; bucket: string }[] })[];
}

export async function obterCliente(id: string) {
  const sb = createClient();
  if (!sb) return null;
  const { data } = await sb.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!data) return undefined;
  const [casos, pendencias] = await Promise.all([
    sb.from("casos").select("*").eq("cliente_id", id).order("criado_em", { ascending: false }),
    sb.from("pendencias").select(PEND).eq("cliente_id", id).order("prazo", { ascending: true, nullsFirst: false }),
  ]);
  return {
    cliente: data as Cliente,
    casos: (casos.data ?? []) as Caso[],
    pendencias: (pendencias.data ?? []) as Pendencia[],
  };
}

export async function listarCasos() {
  const sb = createClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("casos")
    .select("*, cliente:clientes(id, nome), pendencias(id, bucket)")
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as (Caso & { cliente: { id: string; nome: string } | null; pendencias: { id: string; bucket: string }[] })[];
}

export async function obterCaso(id: string) {
  const sb = createClient();
  if (!sb) return null;
  const { data } = await sb.from("casos").select("*, cliente:clientes(id, nome)").eq("id", id).maybeSingle();
  if (!data) return undefined;
  const { data: pend } = await sb
    .from("pendencias")
    .select(PEND)
    .eq("caso_id", id)
    .order("prazo", { ascending: true, nullsFirst: false });
  return {
    caso: data as Caso & { cliente: { id: string; nome: string } | null },
    pendencias: (pend ?? []) as Pendencia[],
  };
}

export async function opcoesClientes() {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb.from("clientes").select("id, nome").order("nome");
  return (data ?? []) as { id: string; nome: string }[];
}

export async function opcoesCasos() {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb.from("casos").select("id, titulo, cliente_id").neq("status", "encerrado").order("titulo");
  return (data ?? []) as { id: string; titulo: string; cliente_id: string | null }[];
}

export const AREAS = ["Tributário", "Cível", "Consumidor", "Empresarial", "Trabalhista", "Consultivo", "Família", "Outra"];
export const STATUS_CASO = [
  { id: "ativo", nome: "Ativo" },
  { id: "suspenso", nome: "Suspenso" },
  { id: "encerrado", nome: "Encerrado" },
];
