import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import AreaView, { type CasoArea, type PendResumo, type CertidaoResumo } from "@/components/AreaView";
import { AREAS, type Area } from "@/lib/areas";
import type { Empresa } from "@/components/ClientesListView";
import { podeVerArea } from "@/lib/perfil";
import { fetchAllQuery } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";

export default async function AreaPage({ params }: { params: { area: string } }) {
  const area = params.area as Area;
  if (!AREAS.some(a => a.key === area)) notFound();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca paginada: o PostgREST corta em 1000 linhas por consulta e o Contencioso passa disso. Ver lib/fetch-all.ts.
  const [{ data: usuario }, casos, { data: empresas }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    fetchAllQuery((f, t) => supabase.from("casos").select("*").eq("area", area).order("prazo_proximo", { ascending: true, nullsFirst: false }).order("id").range(f, t)),
    supabase.from("empresas").select("*"),
  ]);
  if (!podeVerArea(usuario?.banca ?? usuario?.nome_completo ?? user.email, area)) redirect("/home");
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  // A lista só recebe os campos que exibe/filtra. O Contencioso tem 1.600+ casos (~1,3 MB completos) e a
  // resposta estourava; o caso completo é buscado pelo AreaView na hora de "Modificar dados".
  const DADOS_LISTA: Partial<Record<Area, string[]>> = { contencioso: ["tribunal", "instancia", "adverso", "valor", "tese", "esfera", "sistema", "tipo_acao"] };
  const keep = DADOS_LISTA[area];
  const enxuga = (c: any) => keep ? { ...c, observacoes: null, dados: Object.fromEntries(keep.filter(k => c.dados?.[k] != null).map(k => [k, c.dados[k]])) } : c;
  const lista: CasoArea[] = (casos ?? []).map((c: any) => { const e = empMap.get(c.empresa_id); return { ...enxuga(c), empresa: e ? { id: e.id, nome: e.nome, nome_exibicao: e.nome_exibicao, banca: e.banca } : null }; });
  const ids = lista.map(c => c.id);

  const idSet = new Set(ids);
  const [pendsAll, { data: docs }] = await Promise.all([
    ids.length ? fetchAllQuery<any>((f, t) => supabase.from("caso_pendencias").select("caso_id, prazo, status, fatal").order("id").range(f, t)) : Promise.resolve([] as any[]),
    area === "incentivo" ? supabase.from("empresa_documentos").select("empresa_id, nome, validade").eq("tipo", "certidao").not("validade", "is", null) : Promise.resolve({ data: [] as any[] }),
  ]);
  const pends = pendsAll.filter((p: any) => idSet.has(p.caso_id));
  // Próximo prazo do caso = menor prazo entre as pendências abertas (o campo casos.prazo_proximo ficava desatualizado).
  const prox = new Map<string, { prazo: string; fatal: boolean }>();
  for (const p of pends as any[]) { if (p.status === "concluida" || !p.prazo) continue; const cur = prox.get(p.caso_id); if (!cur || p.prazo < cur.prazo) prox.set(p.caso_id, { prazo: p.prazo, fatal: !!p.fatal }); }
  for (const c of lista) { const x = prox.get(c.id); c.prazo_proximo = x?.prazo ?? null; (c as any).prazo_fatal = x?.fatal ?? null; }
  const certidoes: CertidaoResumo[] = (docs ?? []).map((d: any) => ({ ...d, empresa_nome: empMap.get(d.empresa_id)?.nome_exibicao || empMap.get(d.empresa_id)?.nome }));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <AreaView area={area} casos={lista} empresas={(empresas ?? []) as Empresa[]} pendencias={(pends ?? []) as PendResumo[]} certidoes={certidoes} />
    </AppShell>
  );
}
