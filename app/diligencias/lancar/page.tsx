import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import LancarGastoView from "@/components/LancarGastoView";

export const metadata = { title: "Lançar gasto" };
export const dynamic = "force-dynamic";

export default async function LancarGastoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const coordenador = (usuario as any)?.papel === "coordenador";
  const [{ data: empresas }, { data: usuarios }, { data: minhas }] = await Promise.all([
    supabase.from("empresas").select("id, nome, nome_exibicao").order("nome").limit(2000),
    coordenador ? supabase.from("usuarios").select("id, nome_completo").eq("ativo", true).order("nome_completo") : Promise.resolve({ data: [] as any[] }),
    supabase.from("despesas").select("*").order("data", { ascending: false }).limit(coordenador ? 60 : 300),
  ]);
  const nome = usuario?.nome_completo ?? user.email ?? "";
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{coordenador ? <><Link href="/diligencias" style={{ color: "var(--acao)" }}>Diligências</Link> › Lançar gasto</> : "Diligências › Lançar gasto"}</div>
        <h1 className="text-[26px]">Lançar gasto de diligência</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>Lance na hora, com a foto do comprovante. Passagem de ida e de volta são lançamentos separados. O reembolso sai da caixinha da coordenação em lotes.</p>
        <LancarGastoView userId={user.id} userName={nome} coordenador={coordenador}
          empresas={(empresas ?? []).map((e: any) => ({ id: e.id, nome: e.nome_exibicao || e.nome }))}
          usuarios={(usuarios ?? []).map((u: any) => ({ id: u.id, nome: u.nome_completo }))}
          minhas={(minhas ?? []) as any} />
      </div>
    </AppShell>
  );
}
