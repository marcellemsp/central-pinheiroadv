import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import PendenciasView from "@/components/PendenciasView";
import type { PendRev } from "@/components/RevisaoView";
import type { Empresa } from "@/components/ClientesListView";
import { podeVerArea } from "@/lib/perfil";

export const metadata = { title: "Pendências" };
export const dynamic = "force-dynamic";

export default async function PendenciasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: pends }, { data: empresas }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("caso_pendencias").select("*").order("prazo", { ascending: true, nullsFirst: false }).limit(2000),
    supabase.from("empresas").select("*"),
  ]);
  const pendencias = (pends ?? []) as PendRev[];
  const casoIds = Array.from(new Set(pendencias.map(p => p.caso_id).filter(Boolean)));
  const { data: casos } = casoIds.length ? await supabase.from("casos").select("id, titulo, numero, area, empresa_id").in("id", casoIds) : { data: [] as any[] };
  const casoMap = new Map((casos ?? []).map((c: any) => [c.id, c]));
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  for (const p of pendencias) { const c = casoMap.get(p.caso_id); p.caso = c ? { id: c.id, titulo: c.titulo, numero: c.numero, area: c.area } : null; const e = empMap.get(p.empresa_id); p.empresa = e ? { id: e.id, nome: e.nome, nome_exibicao: e.nome_exibicao, banca: e.banca } : null; }

  const pendenciasVis = pendencias.filter(p => podeVerArea(usuario?.banca ?? usuario?.nome_completo ?? user.email, p.caso?.area));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <PendenciasView usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0] ?? ""} pendencias={pendenciasVis} empresas={(empresas ?? []) as Empresa[]} />
    </AppShell>
  );
}
