import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import PrazosView from "@/components/PrazosView";
import type { PendRev } from "@/components/RevisaoView";
import { podeVerArea } from "@/lib/perfil";

export const metadata = { title: "Prazos" };
export const dynamic = "force-dynamic";

export default async function PrazosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: pends }, { data: empresas }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("caso_pendencias").select("*").neq("status", "concluida").order("prazo", { ascending: true, nullsFirst: false }).limit(2000),
    supabase.from("empresas").select("id, nome, nome_exibicao, banca"),
  ]);
  const pendencias = (pends ?? []) as PendRev[];
  const casoIds = Array.from(new Set(pendencias.map(p => p.caso_id).filter(Boolean)));
  const { data: casos } = casoIds.length ? await supabase.from("casos").select("id, titulo, numero, area, empresa_id").in("id", casoIds) : { data: [] as any[] };
  const casoMap = new Map((casos ?? []).map((c: any) => [c.id, c]));
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  for (const p of pendencias) { const c = casoMap.get(p.caso_id); p.caso = c ? { id: c.id, titulo: c.titulo, numero: c.numero, area: c.area } : null; p.empresa = empMap.get(p.empresa_id) ?? null; }

  const pendenciasVis = pendencias.filter(p => podeVerArea(usuario?.banca ?? usuario?.nome_completo ?? user.email, p.caso?.area));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <PrazosView usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0] ?? ""} pendencias={pendenciasVis} />
    </AppShell>
  );
}
