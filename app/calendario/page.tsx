import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import CalendarioView from "@/components/CalendarioView";
import type { PendRev } from "@/components/RevisaoView";
import { podeVerArea } from "@/lib/perfil";

export const metadata = { title: "Calendário" };
export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: pends }, { data: empresas }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("caso_pendencias").select("*").neq("status", "concluida").or("prazo.not.is.null,prazo_interno.not.is.null").limit(3000),
    supabase.from("empresas").select("id, nome, nome_exibicao, banca"),
  ]);
  const pendencias = (pends ?? []) as PendRev[];
  const casoIds = Array.from(new Set(pendencias.map(p => p.caso_id).filter(Boolean)));
  const { data: casos } = casoIds.length ? await supabase.from("casos").select("id, titulo, numero, area, empresa_id").in("id", casoIds) : { data: [] as any[] };
  const casoMap = new Map((casos ?? []).map((c: any) => [c.id, c]));
  const empMap = new Map((empresas ?? []).map((e: any) => [e.id, e]));
  for (const p of pendencias) { const c = casoMap.get(p.caso_id); p.caso = c ? { id: c.id, titulo: c.titulo, numero: c.numero, area: c.area } : null; p.empresa = empMap.get(p.empresa_id) ?? null; }
  const quem = usuario?.banca ?? usuario?.nome_completo ?? user.email;
  const visiveis = pendencias.filter(p => podeVerArea(quem, p.caso?.area));

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <CalendarioView usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0] ?? ""} pendencias={visiveis} />
    </AppShell>
  );
}
