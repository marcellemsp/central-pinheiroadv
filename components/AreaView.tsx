"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, ADVOGADOS, type Area } from "@/lib/areas";
import { CasoDrawer, type Caso, type Documento } from "./ClienteView";
import { BANCAS, type Empresa } from "./ClientesListView";
import { Pz } from "./CasoView";
import { DrawerIncluir, useEu } from "./Acompanhamento";

export type CasoArea = Caso & { empresa: Pick<Empresa, "id" | "nome" | "nome_exibicao" | "banca"> | null; prazo_fatal?: boolean | null };
export type PendResumo = { caso_id: string; prazo: string | null; status: string; fatal: boolean };
export type CertidaoResumo = { empresa_id: string; nome: string; validade: string | null; empresa_nome?: string };

const fmt = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const diasAte = (d?: string | null) => d ? Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5) : null;
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const money = (s: any) => { const n = parseFloat(String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const fmtMoney = (n: number) => n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{title}</span>{action}</div>{children}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Kpi = ({ v, l, c }: { v: React.ReactNode; l: string; c?: string }) => <div className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
const Dist = ({ pairs }: { pairs: [string, number][] }) => { const max = Math.max(1, ...pairs.map(p => p[1])); return pairs.length ? <div className="px-3.5 py-2">{pairs.map(([l, n]) => <div key={l} className="grid gap-2 items-center py-1" style={{ gridTemplateColumns: "1fr 32px" }}><div><div className="text-[11.5px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{l}</div><div className="h-[5px] rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><i className="block h-full" style={{ width: `${n / max * 100}%`, background: "var(--acao)" }} /></div></div><b className="text-right text-xs">{n}</b></div>)}</div> : <Empty t="—" />; };
const Steps = ({ n, total, fail }: { n: number; total: number; fail?: string }) => <span className="inline-flex gap-0.5" title={fail}>{Array.from({ length: total }).map((_, i) => <i key={i} className="inline-block w-3.5 h-[5px] rounded-sm border" style={fail ? { background: "var(--alerta)", borderColor: "var(--alerta)" } : i < n ? { background: "var(--ok)", borderColor: "var(--ok)" } : i === n ? { background: "var(--acao)", borderColor: "var(--acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)" }} />)}</span>;
function cell(v: any, first: boolean) {
  if (v && typeof v === "object" && "pz" in v) return <Pz t={v.pz} cls={v.cls || "mut"} />;
  if (v && typeof v === "object" && "steps" in v) return <Steps n={v.steps} total={6} fail={v.fail} />;
  if (v && typeof v === "object" && "bar" in v) return <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[70px] h-[5px] rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><i className="block h-full" style={{ width: `${v.bar * 100}%`, background: "var(--ok)" }} /></span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.label}</span></span>;
  const s = String(v ?? "—"); const [a, b] = s.split("\n");
  return first ? <><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{a}</div>{b && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b}</div>}</> : <span style={{ color: "var(--text-secondary)" }}>{a}{b && <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>{b}</span>}</span>;
}
const CliCell = ({ e }: { e: CasoArea["empresa"] }) => { const B = e?.banca ? BANCAS[e.banca] : null; return <div className="text-xs font-semibold leading-tight break-words" style={{ color: "var(--text-primary)" }}>{e?.nome_exibicao || e?.nome || "—"}{B && <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: B.bg, color: B.fg }}>{e!.banca}</span>}</div>; };

const SIST_CANON = (raw: any): string | null => {
  const x = String(raw ?? "").toLowerCase().trim(); if (!x) return null;
  if (/e-?proc|eproc/.test(x)) return "e-Proc";
  if (/pje/.test(x)) return "PJe";
  if (/e-?saj|esaj/.test(x)) return "e-SAJ";
  if (/\bsei\b|admin/.test(x)) return "SEI / admin";
  return "Outro";
};
const TIPO_DERIVA = (tit: any): string | null => {
  const x = String(tit ?? "").toLowerCase();
  if (/mandado de seguran/.test(x)) return "Mandado de Segurança";
  if (/embargos/.test(x)) return "Embargos à Execução";
  if (/execu[çc][ãa]o fiscal/.test(x)) return "Execução Fiscal (defesa)";
  if (/anulat[óo]ria/.test(x)) return "Ação Anulatória";
  if (/declarat[óo]ria/.test(x)) return "Ação Declaratória";
  if (/impugna|recurso admin/.test(x)) return "Impugnação / Recurso admin.";
  return null;
};
const tipoDe = (c: CasoArea): string | null => (c.dados?.tipo_acao as string) || TIPO_DERIVA(c.titulo);
const sistemaDe = (c: CasoArea): string | null => SIST_CANON(c.dados?.sistema);

export default function AreaView({ area, casos, empresas, pendencias, certidoes }: { area: Area; casos: CasoArea[]; empresas: Empresa[]; pendencias: PendResumo[]; certidoes: CertidaoResumo[] }) {
  const router = useRouter(); const supabase = createClient();
  const refresh = useRefreshDebounced(router);
  const A = AREAS.find(a => a.key === area)!;
  const [q, setQ] = useState(""); const [fCli, setFCli] = useState("todos"); const [fBanca, setFBanca] = useState("todas"); const [fAdv, setFAdv] = useState("todos"); const [fSit, setFSit] = useState("todas"); const [arquivados, setArquivados] = useState(false);
  const [fTipo, setFTipo] = useState("todos"); const [fSistema, setFSistema] = useState("todos"); const [acomp, setAcomp] = useState<string | null>(null); const eu = useEu();
  const [dr, setDr] = useState<null | { k: "novo" | "caso"; c?: CasoArea; empresaId?: string; docs?: Documento[] }>(null);
  const [escolhaEmp, setEscolhaEmp] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ c: CasoArea; x: number; y: number } | null>(null);
  const [excluir, setExcluir] = useState<CasoArea | null>(null); const [senha, setSenha] = useState(""); const [erroSenha, setErroSenha] = useState<string | null>(null); const [apagando, setApagando] = useState(false);

  useEffect(() => {
    const ch = supabase.channel(`area-${area}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "casos" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const ativos = casos.filter(c => c.ativo);
  const lista = useMemo(() => {
    const base = arquivados ? casos.filter(c => !c.ativo) : ativos; const qq = q.trim().toLowerCase();
    return base.filter(c => fCli === "todos" || c.empresa_id === fCli).filter(c => fBanca === "todas" || c.empresa?.banca === fBanca).filter(c => fAdv === "todos" || c.advogado === fAdv).filter(c => fSit === "todas" || c.situacao === fSit).filter(c => fTipo === "todos" || (fTipo === "__sem" ? !tipoDe(c) : tipoDe(c) === fTipo)).filter(c => fSistema === "todos" || (fSistema === "__sem" ? !sistemaDe(c) : sistemaDe(c) === fSistema))
      .filter(c => !qq || [c.titulo, c.numero, c.orgao, c.empresa?.nome, c.empresa?.nome_exibicao, c.dados?.adverso, ...(Array.isArray(c.dados?.tese) ? c.dados.tese : []), c.dados?.programa, c.dados?.auditor].filter(Boolean).some((s: any) => String(s).toLowerCase().includes(qq)))
      .sort((a, b) => (a.prazo_proximo ?? "9999").localeCompare(b.prazo_proximo ?? "9999") || a.titulo.localeCompare(b.titulo));
  }, [casos, ativos, arquivados, q, fCli, fBanca, fAdv, fSit, fTipo, fSistema]);

  const idsAtivos = new Set(ativos.map(c => c.id));
  const pendAb = pendencias.filter(p => idsAtivos.has(p.caso_id) && p.status !== "concluida");
  const prazos7 = pendAb.filter(p => p.prazo && (diasAte(p.prazo) ?? 99) <= 7).length;
  const emRev = pendAb.filter(p => p.status === "revisao_pendente").length;
  const kpi4: [React.ReactNode, string, string | undefined] =
    area === "contencioso" ? [fmtMoney(ativos.reduce((s, c) => s + money(c.dados?.valor), 0)), "valor em discussão", undefined]
    : area === "consultoria" ? [ativos.filter(c => c.situacao === "Aguardando cliente").length, "aguardando cliente", "var(--atencao)"]
    : area === "incentivo" ? [ativos.filter(c => c.situacao === "Vigente").length, "incentivos vigentes", "var(--ok)"]
    : area === "transacao" ? [ativos.filter(c => c.situacao === "Em cumprimento").length, "em cumprimento", "var(--ok)"]
    : [ativos.filter(c => c.situacao === "Encerrada sem AI").length, "encerradas sem AI", "var(--ok)"];

  const porSit: [string, number][] = A.fluxo.map(s => [s, ativos.filter(c => c.situacao === s).length] as [string, number]).filter(p => p[1] > 0);
  const porAdv: [string, number][] = Object.entries(ativos.reduce((m: Record<string, number>, c) => { const k = c.advogado ?? "—"; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]) as [string, number][];
  const teses: [string, number][] = Object.entries(ativos.reduce((m: Record<string, number>, c) => { (Array.isArray(c.dados?.tese) ? c.dados.tese : []).forEach((t: string) => { m[t] = (m[t] ?? 0) + 1; }); return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8) as [string, number][];
  const proximos = ativos.filter(c => c.prazo_proximo).sort((a, b) => a.prazo_proximo!.localeCompare(b.prazo_proximo!)).slice(0, 6);
  const certVenc = certidoes.filter(d => d.validade && (diasAte(d.validade) ?? 99) <= 30).sort((a, b) => a.validade!.localeCompare(b.validade!)).slice(0, 8);
  const advs = Array.from(new Set([...ADVOGADOS, ...casos.map(c => c.advogado).filter(Boolean) as string[]]));
  const tipoOpts = (A.fields.find(f => f.k === "tipo_acao")?.opts as string[] | undefined) ?? null; const sistemaOpts = (A.fields.find(f => f.k === "sistema")?.opts as string[] | undefined) ?? null;
  const empsDaArea = empresas.filter(e => casos.some(c => c.empresa_id === e.id));

  async function arquivar(c: CasoArea) { await supabase.from("casos").update({ ativo: !c.ativo }).eq("id", c.id); router.refresh(); }
  async function confirmarExclusao() {
    if (!excluir || !senha) return; setApagando(true); setErroSenha(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setApagando(false); setErroSenha("Sessão inválida."); return; }
    const { error: aErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (aErr) { setApagando(false); setErroSenha("Senha incorreta."); return; }
    const { error } = await supabase.from("casos").delete().eq("id", excluir.id);
    setApagando(false); if (error) { setErroSenha(error.message); return; }
    setExcluir(null); setSenha(""); router.refresh();
  }
  async function abrirNovo(empresaId: string) {
    const { data: docs } = await supabase.from("empresa_documentos").select("*").eq("empresa_id", empresaId);
    setEscolhaEmp(null); setDr({ k: "novo", empresaId, docs: (docs ?? []) as Documento[] });
  }
  const tagOpts = Array.from(new Set(casos.flatMap(c => Array.isArray(c.dados?.tese) ? c.dados.tese : [])));
  const chipCls = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };

  return (
    <div className="px-6 pt-4 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-[26px] flex items-center gap-2.5"><span className="text-[9.5px] font-bold px-2 py-0.5 roundedst" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span>{A.label}</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Tod{A.artigo === "a" ? "as as" : "os os"} {A.sing}s de todos os clientes — mesmos dados das abas de cada cliente.</p></div>
        <button onClick={() => setEscolhaEmp("")} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao whitespace-nowrap" style={{ background: "var(--acao)" }}>+ Nov{A.artigo} {A.sing}</button>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={ativos.length} l={`${A.sing}s ativ${A.artigo}s`} /><Kpi v={prazos7} l="prazos ≤7d (pendências)" c={prazos7 ? "var(--alerta)" : undefined} /><Kpi v={emRev} l="peças em revisão" c={emRev ? "var(--acao)" : undefined} /><Kpi v={kpi4[0]} l={kpi4[1]} c={kpi4[2]} /></div>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 290px" }}>
        <div>
          <div className="flex flex-wrap gap-2 items-center mb-2.5">
            <div className="flex-1 min-w-[220px] flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar por cliente, título, número, ${area === "contencioso" ? "adverso, tese" : area === "incentivo" ? "programa" : area === "fiscalizacao" ? "auditor" : "órgão"}…`} className="flex-1 bg-transparent outline-none text-xs" style={{ color: "var(--text-primary)" }} /></div>
            <select value={fCli} onChange={e => setFCli(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todos">Todos os clientes</option>{empsDaArea.map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select>
            <select value={fBanca} onChange={e => setFBanca(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todas">Todas as carteiras</option>{Object.keys(BANCAS).map(b => <option key={b} value={b}>Carteira {b}</option>)}</select>
            <select value={fAdv} onChange={e => setFAdv(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todos">Todos os advogados</option>{advs.map(a => <option key={a}>{a}</option>)}</select>
            {tipoOpts && <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todos">Todos os tipos</option>{tipoOpts.map(o => <option key={o} value={o}>{o}</option>)}<option value="__sem">(sem tipo)</option></select>}
{sistemaOpts && <select value={fSistema} onChange={e => setFSistema(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todos">Todos os sistemas</option>{sistemaOpts.map(o => <option key={o} value={o}>{o}</option>)}<option value="__sem">(sem sistema)</option></select>}
<button onClick={() => setArquivados(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(arquivados)}>Arquivados</button>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button onClick={() => setFSit("todas")} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(fSit === "todas")}>Todas <span className="opacity-70">{(arquivados ? casos.filter(c => !c.ativo) : ativos).length}</span></button>
            {A.fluxo.map(s => { const n = (arquivados ? casos.filter(c => !c.ativo) : ativos).filter(c => c.situacao === s).length; return <button key={s} onClick={() => setFSit(s)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(fSit === s)}>{s} <span className="opacity-70">{n}</span></button>; })}
          </div>
          <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Mostrando <b style={{ color: "var(--text-primary)" }}>{lista.length}</b> · ordenado por próximo prazo</div>
          <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <table className="w-full text-[12.5px] table-fixed min-w-[980px]">
              <thead><tr style={{ background: "var(--bg-page)" }}><th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: "14%" }}>Cliente</th>{A.cols.map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: h.w }}>{h.h}</th>)}<th className="border-b" style={{ borderColor: "var(--border)", width: 44 }} /></tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={A.cols.length + 2}><Empty t={`Nenhum${A.artigo === "a" ? "a" : ""} ${A.sing} ${arquivados ? "arquivad" + A.artigo : "com esses filtros"}.`} /></td></tr>}
                {lista.map(c => <tr key={c.id} className="border-b last:border-b-0 hover:brightness-110 cursor-pointer" style={{ borderColor: "var(--border)", opacity: c.ativo ? 1 : 0.6 }} onClick={() => router.push(`/casos/${c.id}`)}>
                  <td className="px-3 py-2.5"><CliCell e={c.empresa} /></td>
                  {A.row(c).map((v, i) => <td key={i} className="px-3 py-2.5 break-words" data-label={i === 0 ? undefined : A.cols[i]?.h}>{cell(v, i === 0)}</td>)}
                  <td className="px-2 py-2.5 text-right"><button onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ c, x: r.right, y: r.bottom }); }} className="w-8 h-8 rounded-md text-lg leading-none" style={{ color: "var(--text-secondary)" }}>⋯</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{A.hint}</div>
        </div>

        <div className="space-y-4">
          <Card title="Próximos prazos">{proximos.length === 0 ? <Empty t="Sem prazos registrados." /> : proximos.map(c => { const d = diasAte(c.prazo_proximo)!; return <div key={c.id} className="px-3.5 py-2 border-b last:border-b-0 cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => router.push(`/casos/${c.id}`)}><div className="flex justify-between items-center gap-2"><Pz t={(d <= 2 ? "FATAL " : "") + fmt(c.prazo_proximo)} cls={d <= 2 ? "fatal" : d <= 7 ? "prox" : "mut"} /><span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{c.advogado ?? ""}</span></div><div className="text-xs mt-1" style={{ color: "var(--text-primary)" }}>{c.titulo}</div><div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{c.empresa?.nome_exibicao || c.empresa?.nome}</div></div>; })}</Card>
          {area === "incentivo" && <Card title="Certidões vencendo · 30 dias">{certVenc.length === 0 ? <Empty t="Nenhuma certidão vencendo." /> : certVenc.map((d, i) => { const dd = diasAte(d.validade)!; return <div key={i} className="px-3.5 py-2 border-b last:border-b-0 flex justify-between items-center gap-2 text-xs" style={{ borderColor: "var(--border)" }}><div><div style={{ color: "var(--text-primary)" }}>{d.nome}</div><div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{d.empresa_nome}</div></div><Pz t={(dd < 0 ? "venceu " : "vence ") + fmt(d.validade)} cls={dd < 0 ? "fatal" : "prox"} /></div>; })}</Card>}
          <Card title="Por situação"><Dist pairs={porSit} /></Card>
          {area === "contencioso" && <Card title="Teses mais frequentes"><Dist pairs={teses} /></Card>}
          <Card title="Por advogado"><Dist pairs={porAdv} /></Card>
        </div>
      </div>

      {menu && (<>
        <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
        <div className="fixed z-40 w-48 rounded-md border shadow-2xl py-1 text-xs" style={{ top: menu.y + 4, left: menu.x - 192, background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <button onClick={() => { router.push(`/casos/${menu.c.id}`); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}>↗</span>Abrir caso</button>
          <button onClick={async () => { const c = menu.c; setMenu(null); const { data } = await supabase.from("casos").select("*").eq("id", c.id).maybeSingle(); setDr({ k: "caso", c: data ? { ...c, ...(data as any) } : c }); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}>✎</span>Modificar dados</button>
          <button onClick={() => { const c = menu.c; setMenu(null); setAcomp(c.id); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}></span>Marcar acompanhamento</button>
<button onClick={() => { const c = menu.c; setMenu(null); arquivar(c); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}></span>{menu.c.ativo ? "Arquivar" : "Desarquivar"}</button>
          <button onClick={() => { const c = menu.c; setMenu(null); setSenha(""); setErroSenha(null); setExcluir(c); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--alerta)" }}><span></span>Excluir</button>
        </div>
      </>)}

      {escolhaEmp !== null && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setEscolhaEmp(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Nov{A.artigo} {A.sing} — de qual cliente?</h3>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--text-secondary)" }}>Depois abre o mesmo formulário da aba {A.label} do cliente.</p>
          <select autoFocus value={escolhaEmp} onChange={e => setEscolhaEmp(e.target.value)} className={inputCls} style={inputStyle}><option value="">— escolher cliente</option>{empresas.filter(e => e.ativo).sort((a, b) => (a.nome_exibicao || a.nome).localeCompare(b.nome_exibicao || b.nome)).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}{e.banca ? ` · Carteira ${e.banca}` : ""}</option>)}</select>
          <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEscolhaEmp(null)} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button disabled={!escolhaEmp} onClick={() => abrirNovo(escolhaEmp!)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>Continuar →</button></div>
        </div>
      </>)}

      {dr?.k === "novo" && dr.empresaId && <CasoDrawer empresaId={dr.empresaId} area={area} docs={dr.docs ?? []} tagOpts={tagOpts} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onExcluir={() => {}} supabase={supabase} />}
      {dr?.k === "caso" && dr.c && <CasoDrawer key={dr.c.id} empresaId={dr.c.empresa_id} area={area} inicial={dr.c} docs={[]} tagOpts={tagOpts} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onExcluir={c => { setDr(null); setSenha(""); setErroSenha(null); setExcluir(c as CasoArea); }} supabase={supabase} />}

      {acomp && <DrawerIncluir casoId={acomp} origem={area} eu={eu} onClose={() => setAcomp(null)} onDone={() => { setAcomp(null); router.refresh(); }} />}

{excluir && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !apagando && setExcluir(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--alerta-tint)", color: "var(--alerta)" }}></div>
            <div className="flex-1"><h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Excluir {A.sing}?</h3>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{excluir.titulo}</strong> será removid{A.artigo} permanentemente, com andamentos e pendências.</p>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 mt-4" style={{ color: "var(--text-secondary)" }}>Confirme com sua senha de acesso</label>
              <input type="password" autoFocus value={senha} onChange={e => { setSenha(e.target.value); setErroSenha(null); }} onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }} placeholder="Senha do login" className={inputCls} style={inputStyle} />
              {erroSenha && <div className="text-[11px] mt-1.5" style={{ color: "var(--alerta)" }}>{erroSenha}</div>}</div></div>
          <div className="flex justify-end gap-2 mt-5"><button onClick={() => { setExcluir(null); setSenha(""); }} disabled={apagando} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={confirmarExclusao} disabled={apagando || !senha} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{apagando ? "Excluindo…" : "Excluir permanentemente"}</button></div>
        </div>
      </>)}
    </div>
  );
}
