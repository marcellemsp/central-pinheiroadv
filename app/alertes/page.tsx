import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import AlertesView from "@/components/AlertesView";
import type { Alerte, AlerteEvento, Providencia, CasoMin } from "@/lib/alertes";

export const metadata = { title: "Publicações" };
export const dynamic = "force-dynamic";

// Alertes — publicações trazidas pela rotina → destinação (advogado do caso) → aprovação (coordenação) → andamento (+ pendência).
export default async function AlertesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const coordenador = (usuario as any)?.papel === "coordenador";
  const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const [{ data: alertes }, { data: eventos }, { data: providencias }, { data: empresas }] = await Promise.all([
    supabase.from("alertes").select("*").or(`status.in.(novo,proposta,devolvida,segurando),data.gte.${desde}`).order("data", { ascending: false }).limit(1500),
    supabase.from("alerte_eventos").select("*").order("criado_em", { ascending: false }).limit(40),
    supabase.from("providencias").select("*").order("ordem"),
    supabase.from("empresas").select("id, nome, nome_exibicao").range(0, 4999),
  ]);
  // Casos: pagina em blocos de 1000 (limite padrão do PostgREST) até esgotar.
  const casosPage: any[] = [];
  for (let off = 0; ; off += 1000) {
    const { data: p } = await supabase.from("casos").select("id, empresa_id, titulo, numero, orgao, advogado, area, situacao, dados, ativo").eq("ativo", true).order("id").range(off, off + 999);
    if (!p || p.length === 0) break;
    casosPage.push(...p);
    if (p.length < 1000) break;
  }
  // Garante que os casos referenciados pelos alertes estejam presentes, mesmo arquivados.
  const idsAlerte = Array.from(new Set(((alertes ?? []) as any[]).map(a => a.caso_id).filter(Boolean)));
  const faltantes = idsAlerte.filter(id => !casosPage.some(c => c.id === id));
  if (faltantes.length) {
    const { data: extras } = await supabase.from("casos").select("id, empresa_id, titulo, numero, orgao, advogado, area, situacao, dados, ativo").in("id", faltantes);
    if (extras) casosPage.push(...extras);
  }
  const nomeEmp = new Map((empresas ?? []).map((e: any) => [e.id, e.nome_exibicao || e.nome]));
  const casosMin: CasoMin[] = casosPage.map((c: any) => ({ ...c, empresa_nome: nomeEmp.get(c.empresa_id) ?? null }));
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[26px]">Publicações</h1>
            <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--text-secondary)" }}>Publicações dos diários. Nada vira andamento sozinho: o advogado do caso dá a destinação, a coordenação aprova, e só então entra no processo (com a pendência e o prazo, quando for o caso).</p>
          </div>
          {coordenador && <Link href="/configuracoes/providencias" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm text-[12px] font-medium border border-line text-ink hover:border-acao"><span>Providências e prazos</span></Link>}
        </div>
        <AlertesView alertes={(alertes ?? []) as Alerte[]} eventos={(eventos ?? []) as AlerteEvento[]} casos={casosMin} providencias={(providencias ?? []) as Providencia[]} userName={usuario?.nome_completo ?? user.email ?? ""} coordenador={coordenador} />
      </div>
    </AppShell>
  );
}
