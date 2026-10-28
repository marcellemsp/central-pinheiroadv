import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import DiligenciasView from "@/components/DiligenciasView";

export const metadata = { title: "Controle de gastos" };
export const dynamic = "force-dynamic";

export default async function DiligenciasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  if ((usuario as any)?.papel !== "coordenador") redirect("/diligencias/lancar");
  const [{ data: despesas }, { data: lotes }, { data: caixa }, { data: empresas }, { data: usuarios }] = await Promise.all([
    supabase.from("despesas").select("*").order("data", { ascending: false }).limit(3000),
    supabase.from("reembolso_lotes").select("*").order("numero", { ascending: false }),
    supabase.from("caixa_movimentos").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }),
    supabase.from("empresas").select("id, nome, nome_exibicao").order("nome").limit(2000),
    supabase.from("usuarios").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <h1 className="text-[26px]">Gastos de diligências</h1>
        <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--text-secondary)" }}>Transporte, alimentação e cópias em diligências externas. Quem gastou lança pelo celular; aqui a coordenação confere, paga em lote pela caixinha e gera o recibo.</p>
        <DiligenciasView despesas={(despesas ?? []) as any} lotes={(lotes ?? []) as any} caixa={(caixa ?? []) as any} userName={usuario?.nome_completo ?? user.email ?? ""}
          empresas={(empresas ?? []).map((e: any) => ({ id: e.id, nome: e.nome_exibicao || e.nome }))} usuarios={(usuarios ?? []).map((u: any) => ({ id: u.id, nome: u.nome_completo }))} />
      </div>
    </AppShell>
  );
}
