import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import RevisaoView, { type PendRev } from "@/components/RevisaoView";
import type { PendEvento } from "@/components/CasoView";
import { podeVerArea } from "@/lib/perfil";

export const metadata = { title: "Revisão" };
export const dynamic = "force-dynamic";

export default async function RevisaoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: pends }, { data: evs }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("caso_pendencias").select("*").or(`status.in.(revisao_pendente,devolvida,pronta_protocolar),and(status.eq.concluida,concluida_em.gte.${new Date(Date.now() - 30 * 864e5).toISOString()})`).order("prazo_interno", { ascending: true, nullsFirst: false }),
    supabase.from("pendencia_eventos").select("*").order("criado_em", { ascending: false }).limit(15),
  ]);
  // Decisões que EU tomei nos últimos 30 dias (aprovou / devolveu) — alimenta "Você aprovou" e "Você devolveu"
  const meuNome = ((usuario?.nome_completo ?? user.email ?? "").trim().split(/\s+/)[0]) || "";
  const { data: minhasDecisoes } = await supabase.from("pendencia_eventos").select("pendencia_id, acao, obs, criado_em").ilike("autor", meuNome + "%").or("acao.ilike.aprovou%,acao.ilike.devolveu%").gte("criado_em", new Date(Date.now() - 30 * 864e5).toISOString()).order("criado_em", { ascending: false }).limit(200);

  const pendencias = (pends ?? []) as PendRev[];
  const casoIds = Array.from(new Set([...pendencias.map(p => p.caso_id).filter(Boolean), ...(evs ?? []).map((e: any) => e.caso_id).filter(Boolean)]));
  const pendIds = Array.from(new Set((evs ?? []).map((e: any) => e.pendencia_id).filter(Boolean)));
  const [{ data: casos }, { data: pendsEv }] = await Promise.all([
    casoIds.length ? supabase.from("casos").select("id, titulo, numero, area, empresa_id").in("id", casoIds) : Promise.resolve({ data: [] as any[] }),
    pendIds.length ? supabase.from("caso_pendencias").select("id, titulo").in("id", pendIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const empIds = Array.from(new Set((casos ?? []).map((c: any) => c.empresa_id)));
  const { data: empresas } = empIds.length ? await supabase.from("empresas").select("id, nome, nome_exibicao, banca").in("id", empIds) : { data: [] as any[] };

  const casoMap = new Map((casos ?? []).map((c: any) => [c.id, c]));
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  const tituloMap = new Map((pendsEv ?? []).map((p: any) => [p.id, p.titulo]));
  for (const p of pendencias) { const c = casoMap.get(p.caso_id); p.caso = c ? { id: c.id, titulo: c.titulo, numero: c.numero, area: c.area } : null; p.empresa = c ? (empMap.get(c.empresa_id) ?? null) : null; }
  const quem = usuario?.banca ?? usuario?.nome_completo ?? user.email;
  const pendenciasVis = pendencias.filter(p => podeVerArea(quem, p.caso?.area));
  const eventos = ((evs ?? []) as PendEvento[]).filter(e => podeVerArea(quem, e.caso_id ? casoMap.get(e.caso_id)?.area : null)).map(e => ({ ...e, titulo: tituloMap.get(e.pendencia_id) }));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <RevisaoView usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0] ?? ""} pendencias={pendenciasVis} eventos={eventos} decisoes={(minhasDecisoes ?? []) as any} />
    </AppShell>
  );
}
