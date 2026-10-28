"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, Users, FileCheck, Newspaper, Activity, ListChecks, Hourglass, CalendarDays, Receipt, Scale, FileText, ShieldCheck,
  BarChart3, Handshake, Search, Wallet, CalendarOff, Trash2, Settings, KeyRound, Menu, X, LogOut, type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Usuario } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import RaizMark from "./RaizMark";
import { ehCoordenador } from "@/lib/perfil";
import { marcarCoordenador } from "@/lib/guard-exclusao";
import { contarVermelhas } from "@/lib/certidoes";

type Badge = "rev" | "urg" | "dilig" | "alertes" | "excl" | "cert" | "feriados";
type NavItem = { icon: LucideIcon; label: string; href: string; badge?: Badge; tom?: "alerta" | "atencao"; soCoord?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { title: "Navegação", items: [
    { icon: Home, label: "Início", href: "/home" },
    { icon: Users, label: "Clientes", href: "/clientes" },
  ]},
  { title: "Meu trabalho", items: [
    { icon: FileCheck, label: "Revisão", href: "/revisao", badge: "rev", tom: "alerta" },
    { icon: Newspaper, label: "Publicações", href: "/alertes", badge: "alertes", tom: "atencao" },
    { icon: Activity, label: "Acompanhamentos", href: "/acompanhamentos", badge: "urg", tom: "alerta" },
    { icon: ListChecks, label: "Pendências", href: "/pendencias" },
    { icon: Hourglass, label: "Prazos", href: "/prazos" },
    { icon: CalendarDays, label: "Calendário", href: "/calendario" },
    { icon: Receipt, label: "Lançar gasto", href: "/diligencias/lancar" },
  ]},
  { title: "Áreas", items: [
    { icon: Scale, label: "Contencioso", href: "/areas/contencioso" },
    { icon: FileText, label: "Consultoria", href: "/areas/consultoria", soCoord: true },
    { icon: ShieldCheck, label: "Certidões", href: "/certidoes", badge: "cert", tom: "alerta" },
    { icon: BarChart3, label: "Incentivos", href: "/areas/incentivo" },
    { icon: Handshake, label: "Transação", href: "/areas/transacao" },
    { icon: Search, label: "Fiscalização", href: "/areas/fiscalizacao" },
  ]},
  { title: "Coordenação", items: [
    { icon: Wallet, label: "Controle de gastos", href: "/diligencias", badge: "dilig", tom: "atencao", soCoord: true },
    { icon: CalendarOff, label: "Feriados e suspensões", href: "/configuracoes/feriados", badge: "feriados", tom: "atencao", soCoord: true },
    { icon: Trash2, label: "Exclusões", href: "/aprovacoes/exclusoes", badge: "excl", tom: "alerta", soCoord: true },
  ]},
  { title: "Sistema", items: [
    { icon: Settings, label: "Configurações", href: "/configuracoes" },
    { icon: KeyRound, label: "Minha senha", href: "/definir-senha" },
  ]},
];

const BOTTOM: [LucideIcon, string, string][] = [[Home, "Início", "/home"], [Users, "Clientes", "/clientes"], [Hourglass, "Prazos", "/prazos"], [CalendarDays, "Agenda", "/calendario"]];

export default function AppShell({ userEmail, userName, children }: { userEmail: string; userName?: string | null; children: React.ReactNode }) {
  const supabase = createClient();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [pathname, setPathname] = useState("");
  const [cont, setCont] = useState<Record<Badge, number>>({ rev: 0, urg: 0, dilig: 0, alertes: 0, excl: 0, cert: 0, feriados: 0 });
  const [mais, setMais] = useState(false);

  useEffect(() => {
    setPathname(window.location.pathname);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: u } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
      if (u) setUsuario(u as Usuario);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nome = usuario?.nome_completo ?? userName ?? userEmail.split("@")[0];
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  const coord = (usuario as any)?.papel === "coordenador" || ehCoordenador(usuario?.nome_completo ?? userName ?? null);

  useEffect(() => {
    if (!primeiro) return;
    marcarCoordenador(coord);
    const set = (k: Badge, n: number | null | undefined) => setCont(c => ({ ...c, [k]: n ?? 0 }));
    const contar = async () => {
      const q = coord
        ? supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).eq("status", "revisao_pendente").ilike("revisor", primeiro + "%")
        : supabase.from("caso_pendencias").select("*", { count: "exact", head: true }).eq("status", "devolvida").ilike("responsavel", primeiro + "%");
      set("rev", (await q).count);
    };
    const contarUrg = async () => set("urg", (await supabase.from("caso_andamentos").select("*", { count: "exact", head: true }).eq("urgente", true).is("urgente_tratado_em", null)).count);
    const contarDilig = async () => set("dilig", (await supabase.from("despesas").select("*", { count: "exact", head: true }).eq("status", "aguardando")).count);
    const contarAlertes = async () => set("alertes", (coord
      ? await supabase.from("alertes").select("*", { count: "exact", head: true }).in("status", ["novo", "proposta"])
      : await supabase.from("alertes").select("*", { count: "exact", head: true }).in("status", ["novo", "devolvida"])).count);
    const contarExcl = async () => set("excl", coord ? (await supabase.from("exclusoes_pendentes").select("*", { count: "exact", head: true }).eq("status", "pendente")).count : 0);
    const contarCert = async () => { try { set("cert", await contarVermelhas(supabase, coord ? undefined : primeiro)); } catch { set("cert", 0); } };
    const contarFeriados = async () => set("feriados", coord ? (await supabase.from("dias_nao_uteis").select("*", { count: "exact", head: true }).eq("status", "pendente").gte("data", new Date().toISOString().slice(0, 10))).count : 0);
    contar(); contarUrg(); contarDilig(); contarAlertes(); contarExcl(); contarCert(); contarFeriados();
    const ch = supabase.channel("shell-contagens")
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, contar)
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_andamentos" }, contarUrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "despesas" }, contarDilig)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, contarAlertes)
      .on("postgres_changes", { event: "*", schema: "public", table: "exclusoes_pendentes" }, contarExcl)
      .on("postgres_changes", { event: "*", schema: "public", table: "empresa_documentos" }, contarCert)
      .on("postgres_changes", { event: "*", schema: "public", table: "certidao_config" }, contarCert)
      .on("postgres_changes", { event: "*", schema: "public", table: "dias_nao_uteis" }, contarFeriados)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeiro, coord]);

  async function sair() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const ativo = (href: string) => pathname === href || (href !== "/home" && pathname.startsWith(href + "/"));

  const navList = (
    <nav aria-label="Principal">
      {NAV_GROUPS.map((group, gi) => {
        const itens = group.items.filter(item => !item.soCoord || coord);
        if (!itens.length) return null;
        return (
          <div key={group.title} className={gi > 0 ? "mt-3 pt-3 border-t border-line" : ""}>
            <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-bordo">{group.title}</div>
            {itens.map(item => {
              const on = ativo(item.href);
              const n = item.badge ? cont[item.badge] : 0;
              const Icone = item.icon;
              return (
                <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-2.5 px-4 py-2 text-[13px] border-l-2 ${on ? "border-petroleo bg-surface-mist text-ink-heading font-semibold" : "border-transparent text-ink-muted hover:text-ink"}`}>
                  <Icone size={15} strokeWidth={1.8} aria-hidden />
                  <span>{item.label}</span>
                  {n > 0 && <span className={`ml-auto min-w-[18px] px-1.5 text-center text-[10px] font-semibold rounded-sm text-on-brand ${item.tom === "atencao" ? "bg-atencao" : "bg-bordo"}`}>{n}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const avisosMais = cont.rev + cont.urg;

  return (
    <div className="flex flex-col" style={{ background: "var(--bg-page)", height: "100dvh" }}>
      <div className="bg-petroleo shrink-0" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="h-[3px] bg-bordo shrink-0" />
      <header className="shrink-0 bg-petroleo text-on-brand">
        <div className="px-3 md:px-4 h-12 flex items-center gap-3">
          <button onClick={() => setMais(true)} className="md:hidden -ml-1 p-2 text-on-brand" aria-label="Abrir menu"><Menu size={20} /></button>
          <Link href="/home" className="flex items-center gap-2.5 text-on-brand no-underline">
            <RaizMark size={26} sobre="petroleo" />
            <span className="flex items-baseline gap-2 leading-none">
              <span className="font-serif text-[17px] font-semibold">Central</span>
              <span className="hidden sm:inline text-[10px] tracking-[0.3em] text-on-brand-muted">PINHEIROADV</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:block"><ThemeToggle /></div>
            <span className="hidden md:inline text-xs text-on-brand-muted">{nome}</span>
            <button onClick={sair} className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[12px] text-on-brand-muted hover:text-on-brand" title="Sair">
              <LogOut size={14} /> Sair
            </button>
          </div>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden md:block shrink-0 overflow-y-auto py-4 bg-surface-200 border-r border-line" style={{ width: 228 }}>
          {navList}
        </aside>
        <main className="flex-1 overflow-y-auto pb-[84px] md:pb-0">{children}</main>
      </div>

      {/* Celular: barra inferior + painel "Mais" */}
      <nav aria-label="Atalhos" className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 px-1 pt-1.5 bg-surface-200 border-t border-line" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        {BOTTOM.map(([Icone, l, h]) => {
          const on = pathname === h || (h !== "/home" && pathname.startsWith(h));
          return (
            <Link key={h} href={h} className={`flex flex-col items-center gap-1 py-1 text-[10.5px] ${on ? "text-petroleo font-semibold" : "text-ink-muted"}`}>
              <Icone size={21} strokeWidth={on ? 2 : 1.6} aria-hidden />{l}
            </Link>
          );
        })}
        <button onClick={() => setMais(true)} className={`relative flex flex-col items-center gap-1 py-1 text-[10.5px] ${mais ? "text-petroleo font-semibold" : "text-ink-muted"}`}>
          <Menu size={21} strokeWidth={1.6} aria-hidden />Mais
          {avisosMais > 0 && <span className="absolute top-0 right-3 px-1 min-w-[16px] text-[9px] font-semibold rounded-sm bg-bordo text-on-brand">{avisosMais}</span>}
        </button>
      </nav>
      {mais && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMais(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />
          <div className="relative w-[300px] max-w-[85vw] h-full overflow-y-auto flex flex-col bg-surface-200" onClick={e => e.stopPropagation()}>
            <div className="bg-petroleo" style={{ height: "env(safe-area-inset-top)" }} />
            <div className="px-4 py-3 mb-2 flex items-center gap-3 border-b border-line">
              <RaizMark size={30} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate text-ink">{nome}</div>
                <div className="text-[11px] truncate text-ink-muted">{coord ? "coordenação" : userEmail}</div>
              </div>
              <button onClick={() => setMais(false)} className="ml-auto p-2 text-ink-muted" aria-label="Fechar menu"><X size={18} /></button>
            </div>
            <div onClick={() => setMais(false)}>{navList}</div>
            <div className="px-4 pt-3 pb-6 mt-auto flex items-center gap-2 border-t border-line" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
              <ThemeToggle claro />
              <button onClick={sair} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border border-line text-ink"><LogOut size={14} /> Sair</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
