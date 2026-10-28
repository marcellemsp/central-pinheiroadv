import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import CalculadoraPrazo from "@/components/CalculadoraPrazo";

export const metadata = { title: "Calculadora de prazos" };
export const dynamic = "force-dynamic";

export default async function CalculadoraPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-6 pt-4 pb-10">
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}><Link href="/prazos" style={{ color: "var(--acao)" }}>Prazos</Link> › Calculadora</div>
        <h1 className="text-[26px]">Calculadora de prazos</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>Simula a contagem dia a dia com os feriados e suspensões do tribunal. Dentro de um caso, use o botão ao lado do prazo da pendência — lá o tribunal já vem preenchido e o resultado vira o prazo com a memória de cálculo.</p>
        <CalculadoraPrazo />
      </div>
    </AppShell>
  );
}
