import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import FeriadosView, { DiaNaoUtil } from "@/components/FeriadosView";

export const metadata = { title: "Feriados e suspensões" };
export const dynamic = "force-dynamic";

export default async function FeriadosPage({ searchParams }: { searchParams?: { aba?: string; ano?: string; busca?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const anoIni = new Date().getFullYear() - 1;
  const { data: dias } = await supabase.from("dias_nao_uteis").select("*").gte("data", `${anoIni}-01-01`).order("data", { ascending: true }).limit(2000);
  const coordenador = (usuario as any)?.papel === "coordenador";
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}><Link href="/configuracoes" style={{ color: "var(--acao)" }}>Configurações</Link> › Feriados e suspensões</div>
        <h1 className="text-[26px]">Feriados e suspensões de prazo</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>Base da calculadora de prazos, do prazo interno (D-4) e das pendências recorrentes. {coordenador ? "Você pode confirmar, rejeitar e incluir dias." : "Somente coordenadores confirmam ou rejeitam; você pode sugerir um dia, que entra como pendente."}</p>
        <FeriadosView dias={(dias ?? []) as DiaNaoUtil[]} coordenador={coordenador} userEmail={user.email ?? ""} params={searchParams} />
      </div>
    </AppShell>
  );
}
