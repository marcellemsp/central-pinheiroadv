import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import ClienteView, { type Caso, type Documento, type UltimoAnd, type PendResumo } from "@/components/ClienteView";
import type { Empresa } from "@/components/ClientesListView";
import { areasVisiveis, podeVerArea } from "@/lib/perfil";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: empresa }, { data: casos }, { data: documentos }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("empresas").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("casos").select("*").eq("empresa_id", params.id).order("criado_em", { ascending: false }),
    supabase.from("empresa_documentos").select("*").eq("empresa_id", params.id).order("validade", { ascending: true, nullsFirst: false }),
  ]);
  if (!empresa) notFound();

  // Buscar grupo pai da empresa (para breadcrumb Clientes > Grupo > Empresa)
  let grupo: { id: string; nome: string } | null = null;
  if (empresa.grupo_id) {
    const { data: g } = await supabase.from("grupos").select("id, nome").eq("id", empresa.grupo_id).maybeSingle();
    grupo = (g ?? null) as { id: string; nome: string } | null;
  }

  // Último andamento e pendências abertas por caso (para os cards da visão geral)
  const [{ data: ands }, { data: pends }] = await Promise.all([
    supabase.from("caso_andamentos").select("caso_id, data, descricao, criado_em").eq("empresa_id", params.id).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(2000),
    supabase.from("caso_pendencias").select("caso_id, status, prazo, fatal").eq("empresa_id", params.id).neq("status", "concluida"),
  ]);
  const ultimos: Record<string, UltimoAnd> = {};
  for (const a of (ands ?? []) as { caso_id: string; data: string; descricao: string }[]) if (!ultimos[a.caso_id]) ultimos[a.caso_id] = { data: a.data, descricao: a.descricao };
  const pendResumo: Record<string, PendResumo> = {};
  for (const p of (pends ?? []) as { caso_id: string; status: string }[]) { const r = (pendResumo[p.caso_id] ??= { abertas: 0, revisao: 0 }); r.abertas++; if (p.status === "revisao_pendente") r.revisao++; }
  // Próximo prazo do caso = menor prazo entre as pendências abertas (o campo guardado ficava desatualizado).
  const prox = new Map<string, { prazo: string; fatal: boolean }>();
  for (const p of (pends ?? []) as any[]) { if (!p.prazo) continue; const cur = prox.get(p.caso_id); if (!cur || p.prazo < cur.prazo) prox.set(p.caso_id, { prazo: p.prazo, fatal: !!p.fatal }); }
  for (const c of (casos ?? []) as any[]) { const x = prox.get(c.id); c.prazo_proximo = x?.prazo ?? null; c.prazo_fatal = x?.fatal ?? null; }

  const quem = usuario?.banca ?? usuario?.nome_completo ?? user.email;
  const visiveis = ((casos ?? []) as Caso[]).filter(c => podeVerArea(quem, c.area));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <ClienteView empresa={empresa as Empresa} casos={visiveis} documentos={(documentos ?? []) as Documento[]} areasPermitidas={areasVisiveis(quem).map(a => a.key)} grupo={grupo} ultimos={ultimos} pendResumo={pendResumo} />
    </AppShell>
  );
}
