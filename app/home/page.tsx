import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import HomeView from "@/components/HomeView";

export const metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();

  const hoje = new Date();
  const d7 = new Date(hoje); d7.setDate(d7.getDate() + 7);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const d7Str = d7.toISOString().slice(0, 10);

  const [
    totalPendencias, totalProcessos, fataisHoje, fatais7d,
    liminares, decisoesFav, aprovacoesPend, solicitacoesPend,
    minhaRevisao, alertesRecentes, emailsHoje
  ] = await Promise.all([
    supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).neq("status", "concluida"),
    supabase.from("casos").select("*", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).eq("prazo", hojeStr).neq("status", "concluida"),
    supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).gte("prazo", hojeStr).lte("prazo", d7Str).neq("status", "concluida"),
    Promise.resolve({ count: 0 }),
    Promise.resolve({ count: 0 }),
    supabase.from("exclusoes_pendentes").select("*", { count: "exact", head: true }).eq("status", "pendente"),
    Promise.resolve({ count: 0 }),
    (((usuario as any)?.papel === "coordenador") ? supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).eq("status", "revisao_pendente").ilike("revisor", ((usuario?.nome_completo ?? "").trim().split(/\s+/)[0] || "Marcelle") + "%") : supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).eq("status", "devolvida").ilike("responsavel", ((usuario?.nome_completo ?? user.email ?? "").trim().split(/\s+/)[0]) + "%")),
    supabase.from("alertes").select("*", { count: "exact", head: true }).gte("data", d7Str.slice(0,10)),  // placeholder — 7 dias
    Promise.resolve({ count: 0 }),
  ]);

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <HomeView
        usuario={usuario}
        totalPendencias={totalPendencias.count ?? 0}
        totalProcessos={totalProcessos.count ?? 0}
        fataisHoje={fataisHoje.count ?? 0}
        fatais7d={fatais7d.count ?? 0}
        liminares={liminares.count ?? 0}
        decisoesFav={decisoesFav.count ?? 0}
        aprovacoesPend={aprovacoesPend.count ?? 0}
        solicitacoesPend={solicitacoesPend.count ?? 0}
        minhaRevisao={minhaRevisao.count ?? 0}
        alertesRecentes={alertesRecentes.count ?? 0}
        emailsRequeremAcao={emailsHoje.count ?? 0}
      />
    </AppShell>
  );
}
