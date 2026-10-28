import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const { count: pendentes } = await supabase.from("dias_nao_uteis").select("id", { count: "exact", head: true }).eq("status", "pendente").gte("data", new Date().toISOString().slice(0, 10));
  const coordenador = (usuario as any)?.papel === "coordenador";
  const cards: { href?: string; icon: string; titulo: string; desc: string; badge?: number; breve?: boolean }[] = [
    { href: "/configuracoes/feriados", icon: "", titulo: "Feriados e suspensões", desc: "Dias não úteis usados pela calculadora de prazos e pelo D-4. Confirmação dos atos de tribunal trazidos pela rotina semanal.", badge: pendentes ?? 0 },
    { href: "/configuracoes/providencias", icon: "", titulo: "Providências e prazos", desc: "O que pode ser feito a partir de uma publicação e quantos dias cada providência tem. Usado na destinação dos Alertes." },
    { icon: "", titulo: "Minha conta", desc: "Nome, banca, OAB, preferências de tema e notificações.", breve: true },
    { icon: "", titulo: "Equipe", desc: "Usuários, papéis (coordenador/advogado) e acesso.", breve: true },
    { icon: "", titulo: "Listas do sistema", desc: "Tribunais, teses, rótulos, situações — tudo que hoje é lista fixa no código.", breve: true },
    { icon: "", titulo: "Log de auditoria", desc: "Quem alterou o quê e quando, por caso e pendência.", breve: true },
  ];
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <div className="px-4 md:px-6 pt-4 pb-10">
        <h1 className="text-[26px]">Configurações</h1>
        <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--text-secondary)" }}>{coordenador ? "Você é coordenador(a): pode alterar tudo o que estiver disponível aqui." : "Algumas ações são restritas a coordenadores."}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-[1100px]">
          {cards.map(c => {
            const inner = (
              <div className="rounded-lg border p-4 h-full flex flex-col gap-1.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", opacity: c.breve ? 0.6 : 1 }}>
                <div className="flex items-center gap-2"><span className="text-[18px]">{c.icon}</span><span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{c.titulo}</span>
                  {c.badge ? <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full text-on-acao" style={{ background: "var(--atencao)" }}>{c.badge} pendente{c.badge > 1 ? "s" : ""}</span> : null}
                  {c.breve && <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>em breve</span>}
                </div>
                <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{c.desc}</div>
              </div>
            );
            return c.href ? <Link key={c.titulo} href={c.href} className="block hover:opacity-90">{inner}</Link> : <div key={c.titulo}>{inner}</div>;
          })}
        </div>
      </div>
    </AppShell>
  );
}
