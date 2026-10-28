"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, ADVOGADOS } from "@/lib/areas";
import { BANCAS } from "./ClientesListView";
import { Pz, STATUS_PEND, primeiroNome, mesmoNome } from "./CasoView";
import type { PendRev } from "./RevisaoView";
import { AreaTag, CliCell, destinoPend } from "./PendenciasView";

type Item = { p: PendRev; data: string; kind: "fatal" | "prazo" | "interno" };
const hojeStr = () => new Date().toISOString().slice(0, 10);
const addD = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const diasAte = (d: string) => Math.ceil((new Date(d + "T12:00:00").getTime() - new Date(hojeStr() + "T12:00:00").getTime()) / 864e5);
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const labelDia = (d: string) => { const x = new Date(d + "T12:00:00"); const n = diasAte(d); return `${DIAS[x.getDay()]} ${x.getDate()}/${String(x.getMonth() + 1).padStart(2, "0")}${n === 0 ? " · hoje" : n === 1 ? " · amanhã" : ""}`; };
const selCls = "px-2.5 py-1.5 rounded text-[11px] border"; const selStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;
const chipCls = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{title}</div>{children}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-6 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Kpi = ({ v, l, c }: { v: React.ReactNode; l: string; c?: string }) => <div className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
const Dist = ({ pairs }: { pairs: [string, number][] }) => { const max = Math.max(1, ...pairs.map(p => p[1])); return pairs.length ? <div className="px-3.5 py-2">{pairs.map(([l, n]) => <div key={l} className="grid gap-2 items-center py-1" style={{ gridTemplateColumns: "1fr 32px" }}><div><div className="text-[11.5px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{l}</div><div className="h-[5px] rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><i className="block h-full" style={{ width: `${n / max * 100}%`, background: "var(--acao)" }} /></div></div><b className="text-right text-xs">{n}</b></div>)}</div> : <Empty t="—" />; };

export default function PrazosView({ usuarioNome, pendencias }: { usuarioNome: string; pendencias: PendRev[] }) {
const router = useRouter(); const supabase = createClient();
const refresh = useRefreshDebounced(router);
const eu = primeiroNome(usuarioNome);
const [horizonte, setHorizonte] = useState<7 | 15 | 30>(7); const [soFatais, setSoFatais] = useState(false); const [internos, setInternos] = useState(true); const [minhas, setMinhas] = useState(false);
const [fBanca, setFBanca] = useState("todas"); const [fArea, setFArea] = useState("todas"); const [fResp, setFResp] = useState("todos");

useEffect(() => {
const ch = supabase.channel("prazos-live").on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, refresh).subscribe();
return () => { supabase.removeChannel(ch); };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const hoje = hojeStr(); const fim = addD(hoje, horizonte * 2);
const abertas = pendencias.filter(p => p.status !== "concluida");
const itens = useMemo<Item[]>(() => {
const out: Item[] = [];
abertas.filter(p => fBanca === "todas" || p.empresa?.banca === fBanca).filter(p => fArea === "todas" || p.caso?.area === fArea).filter(p => fResp === "todos" || p.responsavel === fResp).filter(p => !minhas || mesmoNome(p.responsavel, eu) || mesmoNome(p.revisor, eu)).filter(p => !soFatais || p.fatal)
.forEach(p => { if (p.prazo) out.push({ p, data: p.prazo, kind: p.fatal ? "fatal" : "prazo" }); if (internos && p.fatal && p.prazo_interno && p.status !== "pronta_protocolar" && p.status !== "revisao_pendente") out.push({ p, data: p.prazo_interno, kind: "interno" }); });
return out.sort((a, b) => a.data.localeCompare(b.data) || (a.kind === "interno" ? 1 : 0) - (b.kind === "interno" ? 1 : 0));
}, [abertas, fBanca, fArea, fResp, minhas, soFatais, internos, eu]);

const vencidos = itens.filter(i => i.data < hoje);
const janela = itens.filter(i => i.data >= hoje && i.data <= fim);
const depois = itens.filter(i => i.data > fim);
const dias: string[] = []; for (let i = 0; dias.length <= horizonte; i++) { const d = addD(hoje, i); const w = new Date(d + "T12:00:00").getDay(); if (w !== 0 && w !== 6) dias.push(d); }
const semPrazo = abertas.filter(p => !p.prazo).length;

const kHoje = itens.filter(i => i.data === hoje && i.kind !== "interno").length;
const k7 = itens.filter(i => i.data >= hoje && i.data <= addD(hoje, 7) && i.kind !== "interno").length;
const k30 = itens.filter(i => i.data >= hoje && i.data <= addD(hoje, 30) && i.kind !== "interno").length;
const porResp: [string, number][] = (Object.entries(janela.filter(i => i.kind !== "interno").reduce((m: Record<string, number>, i) => { const k = i.p.responsavel ?? "—"; m[k] = (m[k] ?? 0) + 1; return m; }, {})) as [string, number][]).sort((a, b) => b[1] - a[1]);
const porArea: [string, number][] = AREAS.map(a => [a.label, janela.filter(i => i.kind !== "interno" && i.p.caso?.area === a.key).length] as [string, number]).filter(x => x[1] > 0);
const resps = Array.from(new Set([...ADVOGADOS, ...pendencias.map(p => p.responsavel).filter(Boolean) as string[]]));

const Linha = ({ i }: { i: Item }) => { const s = STATUS_PEND[i.p.status] ?? { l: i.p.status, cls: "mut" }; const d = diasAte(i.data); return (
<div onClick={() => { const d = destinoPend(i.p); if (d) router.push(d); }} className="flex flex-wrap md:grid gap-2 md:gap-3 items-center px-3.5 py-2.5 md:py-2 border-b last:border-b-0 cursor-pointer hover:brightness-110" style={{ gridTemplateColumns: "118px 1fr auto auto auto", borderColor: "var(--border)", border: `1px solid ${i.kind === "interno" ? "var(--acao)" : d < 0 ? "var(--alerta)" : i.kind === "fatal" ? (d <= 2 ? "var(--alerta)" : "var(--atencao)") : "var(--text-muted)"}` }}>
<div>{i.kind === "interno" ? <Pz t="interno · D-4" cls="rev" /> : i.kind === "fatal" ? <Pz t={d < 0 ? "VENCIDO" : "FATAL"} cls={d < 0 || d <= 2 ? "fatal" : "prox"} /> : <Pz t={d < 0 ? "VENCIDO" : "prazo"} cls={d < 0 ? "fatal" : "mut"} />}{i.kind === "interno" && i.p.prazo && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>fatal {fmt(i.p.prazo)}</div>}</div>
<div className="min-w-0 basis-full md:basis-auto order-first md:order-none"><div className="text-[12.5px] font-semibold uppercase tracking-wide md:truncate" style={{ color: "var(--text-primary)" }}>{i.p.titulo}</div><CliCell p={i.p} /></div>
{i.p.caso ? <AreaTag a={i.p.caso.area} /> : i.p.certidao_subtipo ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>Certidão</span> : <span />}
<span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{i.p.responsavel ?? "—"}</span>
<Pz t={s.l} cls={s.cls} />
</div>); };

return (
<div className="px-6 pt-4 pb-10">
<div className="flex items-start justify-between gap-4 flex-wrap">
<div><h1 className="text-[26px]">Prazos </h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Agenda de prazos das pendências abertas, de todos os casos. Prazo fatal em vermelho/âmbar; prazo interno (D-4, entrega pra revisão) em azul.</p></div>
<div className="flex gap-1.5 flex-wrap">{([7, 15, 30] as const).map(h => <button key={h} onClick={() => setHorizonte(h)} className="px-3 py-1.5 rounded text-[11px] font-medium border" style={chipCls(horizonte === h)}>{h} dias</button>)}<Link href="/prazos/calculadora" className="px-3 py-1.5 rounded text-[11px] font-medium text-on-acao" style={{ background: "var(--acao)" }}>Calculadora</Link></div>
</div>
<div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={vencidos.filter(i => i.kind !== "interno").length} l="vencidos" c={vencidos.length ? "var(--alerta)" : undefined} /><Kpi v={kHoje} l="vencem hoje" c={kHoje ? "var(--alerta)" : undefined} /><Kpi v={k7} l="próximos 7 dias" c={k7 ? "var(--atencao)" : undefined} /><Kpi v={k30} l="próximos 30 dias" /></div>

<div className="grid gap-4 mt-4 grid-cols-1 md:grid-cols-[1fr_280px]">
<div>
<div className="flex flex-wrap gap-2 items-center mb-3">
<select value={fBanca} onChange={e => setFBanca(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as carteiras</option>{Object.keys(BANCAS).map(b => <option key={b} value={b}>Carteira {b}</option>)}</select>
<select value={fArea} onChange={e => setFArea(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as áreas</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
<select value={fResp} onChange={e => setFResp(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
<button onClick={() => setSoFatais(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(soFatais)}>Só fatais</button>
<button onClick={() => setInternos(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(internos)}>Mostrar internos (D-4)</button>
<button onClick={() => setMinhas(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(minhas)}>Meus</button>
</div>

{vencidos.length > 0 && <><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--alerta)" }}>Vencidos <span className="px-1.5 rounded-full border text-[10px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>{vencidos.length}</span></div><div className="rounded-md border mb-4" style={{ background: "var(--bg-surface)", borderColor: "var(--alerta)" }}>{vencidos.map((i, k) => <Linha key={k} i={i} />)}</div></>}

<div className="space-y-2">
{dias.map(d => { const its = janela.filter(i => i.data === d); const fimDeSemana = [0, 6].includes(new Date(d + "T12:00:00").getDay()); if (its.length === 0 && horizonte > 7) return null; return (
<div key={d} className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: d === hoje ? "var(--acao)" : "var(--border)", opacity: its.length === 0 ? 0.7 : 1 }}>
<div className="flex justify-between items-baseline px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-widest" style={{ color: d === hoje ? "var(--acao)" : fimDeSemana ? "var(--text-muted)" : "var(--text-secondary)", borderBottom: its.length ? "1px solid var(--border)" : "none" }}><span>{labelDia(d)}</span><span>{its.length || "—"}</span></div>
{its.map((i, k) => <Linha key={k} i={i} />)}
</div>); })}
{janela.length === 0 && <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><Empty t={`Nenhum prazo nos próximos ${horizonte} dias.`} /></div>}
</div>
{depois.length > 0 && <div className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>+ {depois.length} prazo{depois.length > 1 ? "s" : ""} depois de {fmt(fim)} — aumente o horizonte para ver.</div>}
<div className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>Linha azul = prazo interno (D-4), entrega da peça pra revisão; some quando a peça já está em revisão ou aprovada. Clique para abrir o caso. {semPrazo > 0 && <><b style={{ color: "var(--text-primary)" }}>{semPrazo}</b> pendência{semPrazo > 1 ? "s" : ""} aberta{semPrazo > 1 ? "s" : ""} sem prazo — <Link href="/pendencias" style={{ color: "var(--acao)" }}>ver em Pendências</Link>.</>}</div>
</div>
<div className="space-y-4">
<Card title={`Por responsável · ${horizonte} dias`}><Dist pairs={porResp} /></Card>
<Card title={`Por área · ${horizonte} dias`}><Dist pairs={porArea} /></Card>
<Card title="Legenda"><div className="px-3.5 py-2.5 space-y-1.5 text-[11.5px]" style={{ color: "var(--text-secondary)" }}><div><Pz t="FATAL" cls="fatal" /> prazo fatal em ≤2 dias ou vencido</div><div><Pz t="FATAL" cls="prox" /> prazo fatal em 3–7 dias</div><div><Pz t="prazo" cls="mut" /> prazo não fatal (acordado, renegociável)</div><div><Pz t="interno · D-4" cls="rev" /> entrega pra revisão, 4 dias úteis antes</div></div></Card>
</div>
</div>
</div>
);
}
