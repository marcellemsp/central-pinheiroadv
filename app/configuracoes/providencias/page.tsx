import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import ProvidenciasView from "@/components/ProvidenciasView";
import type { Providencia } from "@/lib/alertes";

export const metadata = { title: "Providências e prazos" };
export const dynamic = "force-dynamic";

export default async function ProvidenciasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const coordenador = (usuario as any)?.papel === "coordenador";
  const { data: itens } = await supabase.from("providencias").select("*").order("ordem").order("nome");
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}><Link href="/configuracoes" style={{ color: "var(--acao)" }}>Configurações</Link> › Providências e prazos</div>
        <h1 className="text-[26px]">Providências e prazos</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>O que pode ser feito a partir de uma publicação e quantos dias cada providência tem. Usado na destinação dos <Link href="/alertes" style={{ color: "var(--acao)" }}>Alertes</Link>. {coordenador ? "Você pode criar, editar e desativar." : "Somente coordenadores editam."}</p>
        <ProvidenciasView itens={(itens ?? []) as Providencia[]} coordenador={coordenador} />
      </div>
    </AppShell>
  );
}
