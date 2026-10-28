import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import ExclusoesView, { type Exclusao } from "@/components/ExclusoesView";

export const metadata = { title: "Exclusões" };
export const dynamic = "force-dynamic";

// Aprovações › Exclusões — pedidos de exclusão feitos pela equipe, aprovados/devolvidos pela coordenação.
export default async function ExclusoesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const coordenador = (usuario as any)?.papel === "coordenador";
  const { data: pedidos } = await supabase.from("exclusoes_pendentes").select("*").order("pedido_em", { ascending: false }).limit(500);
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}><Link href="/home" style={{ color: "var(--acao)" }}>Home</Link> › Aprovações › Exclusões</div>
        <h1 className="text-[26px]">Pedidos de exclusão</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>{coordenador ? "A equipe pede exclusão de itens (pendências, andamentos, casos, alertes, diligências, etc.) — você aprova (apaga de vez) ou devolve (item volta ao normal)." : "Aqui ficam os pedidos de exclusão feitos por você e pelo time. Enquanto estão pendentes, o item some do fluxo normal. Você pode cancelar seu próprio pedido."}</p>
        <ExclusoesView pedidos={(pedidos ?? []) as Exclusao[]} userName={usuario?.nome_completo ?? user.email ?? ""} coordenador={coordenador} />
      </div>
    </AppShell>
  );
}
