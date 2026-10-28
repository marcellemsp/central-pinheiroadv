import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import AcompanhamentosView, { type AndRev, type Achado, type Assunto } from "@/components/AcompanhamentosView";
import type { Empresa } from "@/components/ClientesListView";
import { podeVerArea } from "@/lib/perfil";

export const metadata = { title: "Acompanhamentos" };
export const dynamic = "force-dynamic";

export default async function AcompanhamentosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const desde = new Date(); desde.setDate(desde.getDate() - 30);
  const desdeStr = desde.toISOString().slice(0, 10);
  const [{ data: usuario }, { data: recentes }, { data: urgentes }, { data: achados }, { data: assuntos }, { data: empresas }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("caso_andamentos").select("*").gte("data", desdeStr).order("data", { ascending: false }).limit(500),
    supabase.from("caso_andamentos").select("*").eq("urgente", true).is("urgente_tratado_em", null).order("data", { ascending: false }),
    supabase.from("achados").select("*").order("criado_em", { ascending: false }).limit(500),
    supabase.from("assuntos_monitorados").select("*").eq("ativo", true).order("nome"),
    supabase.from("empresas").select("*"),
  ]);
  const mapa = new Map<string, any>(); [...(recentes ?? []), ...(urgentes ?? [])].forEach((a: any) => mapa.set(a.id, a));
  const andamentos = Array.from(mapa.values()) as AndRev[];
  const ach = (achados ?? []) as Achado[];
  const casoIds = Array.from(new Set([...andamentos.map(a => a.caso_id), ...ach.map(a => a.caso_id).filter(Boolean) as string[]]));
  const { data: casos } = casoIds.length ? await supabase.from("casos").select("id, titulo, numero, area, empresa_id").in("id", casoIds) : { data: [] as any[] };
  const casoMap = new Map((casos ?? []).map((c: any) => [c.id, c]));
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  const ref = (casoId: string | null, empId: string | null) => { const c = casoId ? casoMap.get(casoId) : null; const e = empMap.get(empId ?? c?.empresa_id); return { caso: c ? { id: c.id, titulo: c.titulo, numero: c.numero, area: c.area } : null, empresa: e ? { id: e.id, nome: e.nome, nome_exibicao: e.nome_exibicao, banca: e.banca } : null }; };
  for (const a of andamentos) Object.assign(a, ref(a.caso_id, a.empresa_id));
  for (const a of ach) Object.assign(a, ref(a.caso_id, a.empresa_id));

  const quem = usuario?.banca ?? usuario?.nome_completo ?? user.email;
  const andVis = andamentos.filter(a => podeVerArea(quem, a.caso?.area));
  const achVis = ach.filter(a => podeVerArea(quem, a.caso?.area));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <AcompanhamentosView usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0] ?? ""} andamentos={andVis} achados={achVis} assuntos={(assuntos ?? []) as Assunto[]} empresas={(empresas ?? []) as Empresa[]} />
    </AppShell>
  );
}
