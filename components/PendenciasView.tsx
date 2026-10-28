"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, ADVOGADOS, type Area } from "@/lib/areas";
import { BANCAS, type Empresa } from "./ClientesListView";
import type { Caso } from "./ClienteView";
import { PendDrawer, EnviarDrawer, RevisarDrawer, AcaoPeca, ConcluirJulgamento, InfoJulg, AdiarRolante, InfoRol, AcoesDespacho, marcarPedidoDespacho, AgendarDespacho, ConcluirDespacho, InfoDesp, Pz, prazoPz, STATUS_PEND, TIPOS_PEND, primeiroNome, mesmoNome, relTempo, type Pendencia, type Andamento } from "./CasoView";
import type { PendRev } from "./RevisaoView";

const fmt = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const diasAte = (d?: string | null) => d ? Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5) : null;
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const selCls = "px-2.5 py-1.5 rounded text-[11px] border"; const selStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;
const chipCls = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{title}</div>{children}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Kpi = ({ v, l, c }: { v: React.ReactNode; l: string; c?: string }) => <div className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
const Dist = ({ pairs }: { pairs: [string, number][] }) => { const max = Math.max(1, ...pairs.map(p => p[1])); return pairs.length ? <div className="px-3.5 py-2">{pairs.map(([l, n]) => <div key={l} className="grid gap-2 items-center py-1" style={{ gridTemplateColumns: "1fr 32px" }}><div><div className="text-[11.5px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{l}</div><div className="h-[5px] rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><i className="block h-full" style={{ width: `${n / max * 100}%`, background: "var(--acao)" }} /></div></div><b className="text-right text-xs">{n}</b></div>)}</div> : <Empty t="—" />; };
export const AreaTag = ({ a }: { a?: Area | null }) => { const A = AREAS.find(x => x.key === a); return A ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>; };
export const CliCell = ({ p }: { p: PendRev }) => { const B = p.empresa?.banca ? BANCAS[p.empresa.banca] : null; return <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.empresa?.nome_exibicao || p.empresa?.nome || "—"}{B && <span className="ml-1 text-[9px] font-bold px-1 py-px rounded" style={{ background: B.bg, color: B.fg }}>{p.empresa!.banca}</span>} · {p.caso ? <>{p.caso.titulo}{p.caso.numero ? ` · ${p.caso.numero}` : ""}</> : p.certidao_subtipo ? <span style={{ color: "var(--tag-amber-fg)" }}>certidão · {p.certidao_subtipo}</span> : p.recorrencia ? <span style={{ color: "var(--tag-purple-fg)" }}>rotina do cliente · sem processo</span> : p.tipo === "rolante" ? <span style={{ color: "var(--acao-claro)" }}>↻ tarefa do cliente · sem processo</span> : "sem caso"}</div>; };
/** Para onde vai o clique numa pendência: caso, ou ficha do cliente (certidão) */
export const destinoPend = (p: PendRev) => p.caso ? `/casos/${p.caso.id}` : p.empresa_id ? `/clientes/${p.empresa_id}` : null;
const internoPz = (p: Pendencia) => { if (!p.fatal || !p.prazo_interno) return <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>; const d = diasAte(p.prazo_interno)!; return <Pz t={(d < 0 ? "VENCIDO " : d === 0 ? "HOJE · " : "") + fmt(p.prazo_interno)} cls={d < 0 ? "fatal" : d <= 1 ? "prox" : "mut"} />; };

export default function PendenciasView({ usuarioNome, pendencias, empresas }: { usuarioNome: string; pendencias: PendRev[]; empresas: Empresa[] }) {
  const router = useRouter(); const supabase = createClient();
  const refresh = useRefreshDebounced(router);
  const eu = primeiroNome(usuarioNome);
  const [q, setQ] = useState(""); const [fCli, setFCli] = useState("todos"); const [fBanca, setFBanca] = useState("todas"); const [fArea, setFArea] = useState("todas"); const [fResp, setFResp] = useState("todos"); const [fTipo, setFTipo] = useState("todos"); const [fStatus, setFStatus] = useState("abertas"); const [minhas, setMinhas] = useState(false); const [soRot, setSoRot] = useState(false); const [soJulg, setSoJulg] = useState(false); const [soRol, setSoRol] = useState(false); const [soDesp, setSoDesp] = useState(false); const [despC, setDespC] = useState<PendRev | null>(null); const [agendar, setAgendar] = useState<PendRev | null>(null); const [adiar, setAdiar] = useState<PendRev | null>(null); const [julg, setJulg] = useState<PendRev | null>(null);
  const [dr, setDr] = useState<null | { k: "pend" | "enviar" | "revisar"; p?: PendRev; caso?: Caso; andamentos?: Andamento[]; preset?: Record<string, any> }>(null);
  const [novo, setNovo] = useState<null | { empresaId: string; casoId: string; casos: Caso[] }>(null);

  useEffect(() => {
    supabase.rpc("pa_rolar_pendencias").then(({ data }) => { if (data) refresh(); }); // garante o rolamento das rolantes mesmo se a agenda da madrugada falhar
const ch = supabase.channel("pendencias-live").on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, refresh).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abertas = pendencias.filter(p => p.status !== "concluida");
  const lista = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pendencias
      .filter(p => fStatus === "todas" ? true : fStatus === "abertas" ? p.status !== "concluida" : fStatus === "vencidas" ? (p.status !== "concluida" && p.prazo && (diasAte(p.prazo) ?? 1) < 0) : p.status === fStatus)
      .filter(p => !soRot || !!p.recorrencia)
.filter(p => !soJulg || p.tipo === "julgamento")
.filter(p => !soRol || p.tipo === "rolante")
.filter(p => !soDesp || p.tipo === "despacho")
      .filter(p => !minhas || mesmoNome(p.responsavel, eu) || (p.status === "revisao_pendente" && mesmoNome(p.revisor, eu)))
      .filter(p => fCli === "todos" || p.empresa_id === fCli).filter(p => fBanca === "todas" || p.empresa?.banca === fBanca).filter(p => fArea === "todas" || p.caso?.area === fArea).filter(p => fResp === "todos" || p.responsavel === fResp).filter(p => fTipo === "todos" || p.tipo === fTipo)
      .filter(p => !qq || [p.titulo, p.descricao, p.caso?.titulo, p.caso?.numero, p.empresa?.nome, p.empresa?.nome_exibicao, p.responsavel].filter(Boolean).some(s => String(s).toLowerCase().includes(qq)))
      .sort((a, b) => (a.status === "concluida" ? 2 : a.status === "aguardando" ? 1 : 0) - (b.status === "concluida" ? 2 : b.status === "aguardando" ? 1 : 0) || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || (a.prazo_interno ?? "9999").localeCompare(b.prazo_interno ?? "9999"));
  }, [pendencias, q, fCli, fBanca, fArea, fResp, fTipo, fStatus, minhas, soRot, soJulg, soRol, soDesp, eu]);

  const vencidas = abertas.filter(p => p.prazo && (diasAte(p.prazo) ?? 1) < 0).length;
  const sete = abertas.filter(p => p.prazo && (diasAte(p.prazo) ?? 99) >= 0 && (diasAte(p.prazo) ?? 99) <= 7).length;
  const emRev = abertas.filter(p => p.status === "revisao_pendente").length;
  const porStatus: [string, number][] = Object.entries(STATUS_PEND).filter(([k]) => k !== "concluida").map(([k, s]) => [s.l, abertas.filter(p => p.status === k).length] as [string, number]).filter(x => x[1] > 0);
  const porResp: [string, number][] = (Object.entries(abertas.reduce((m: Record<string, number>, p) => { const k = p.responsavel ?? "—"; m[k] = (m[k] ?? 0) + 1; return m; }, {})) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const porArea: [string, number][] = AREAS.map(a => [a.label, abertas.filter(p => p.caso?.area === a.key).length] as [string, number]).filter(x => x[1] > 0);
  const resps = Array.from(new Set([...ADVOGADOS, ...pendencias.map(p => p.responsavel).filter(Boolean) as string[]]));
  const empsCom = empresas.filter(e => pendencias.some(p => p.empresa_id === e.id));
  const ctx = (p: PendRev) => `${p.empresa?.nome_exibicao || p.empresa?.nome || "—"} · ${p.caso ? p.caso.titulo + (p.caso.numero ? ` · ${p.caso.numero}` : "") : p.certidao_subtipo ? "certidão " + p.certidao_subtipo : ""}`;

  async function abrirEdicao(p: PendRev) {
if (!p.caso_id && p.tipo === "rolante") { setDr({ k: "pend", p, caso: { id: null, empresa_id: p.empresa_id, titulo: "", numero: null, dados: {}, orgao: null, advogado: null } as any, andamentos: [] }); return; } // rolante sem processo: edita aqui mesmo
    if (!p.caso_id) { router.push(`/clientes/${p.empresa_id}`); return; } // pendência de certidão: edita pela ficha do cliente
    const [{ data: caso }, { data: ands }] = await Promise.all([supabase.from("casos").select("*").eq("id", p.caso_id).maybeSingle(), supabase.from("caso_andamentos").select("*").eq("caso_id", p.caso_id).order("data", { ascending: false }).limit(30)]);
    if (!caso) return; setDr({ k: "pend", p, caso: caso as Caso, andamentos: (ands ?? []) as Andamento[] });
  }
  async function toggleConcluir(p: PendRev) {
if (p.tipo === "julgamento" && p.status !== "concluida") { setJulg(p); return; }
if (p.tipo === "despacho" && p.status !== "concluida") { setDespC(p); return; } // julgamento: pergunta o que aconteceu
    const done = p.status !== "concluida";
    const { error: errC } = await supabase.from("caso_pendencias").update({ status: done ? "concluida" : "a_fazer", concluida_em: done ? new Date().toISOString() : null }).eq("id", p.id);
    if (errC) { alert(errC.message.includes("link") ? errC.message + " Use “✓ Concluir” em Rotinas do cliente (página do cliente) para informar o link." : "Erro: " + errC.message); return; }
    if (done && p.tipo === "peca" && p.caso_id) { await supabase.from("caso_andamentos").insert({ caso_id: p.caso_id, empresa_id: p.empresa_id, data: new Date().toISOString().slice(0, 10), descricao: `Concluída: ${p.titulo}${p.responsavel ? ` (${p.responsavel})` : ""}${p.versao ? ` · v${p.versao}` : ""}`, fonte: "manual" }); await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: eu || null, acao: p.status === "pronta_protocolar" ? "protocolou · concluída" : "concluiu" }); }
    router.refresh();
  }
  async function escolherEmpresa(id: string) { const { data } = await supabase.from("casos").select("*").eq("empresa_id", id).eq("ativo", true).order("titulo"); setNovo({ empresaId: id, casoId: "", casos: (data ?? []) as Caso[] }); }
  async function abrirNova() { if (!novo?.casoId) return; if (novo.casoId === "__sem") { const emp = novo.empresaId; setNovo(null); setDr({ k: "pend", caso: { id: null, empresa_id: emp, titulo: "", numero: null, dados: {}, orgao: null, advogado: null } as any, andamentos: [], preset: { tipo: "rolante", fatal: false, revisor: "", detalhes: { rola: "util", avisar_apos: 3 } } }); return; } const caso = novo.casos.find(c => c.id === novo.casoId)!; const { data: ands } = await supabase.from("caso_andamentos").select("*").eq("caso_id", caso.id).order("data", { ascending: false }).limit(30); setNovo(null); setDr({ k: "pend", caso, andamentos: (ands ?? []) as Andamento[] }); }

  return (
    <div className="px-6 pt-4 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-[26px]">Pendências</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Todas as pendências e diligências, de todos os casos e clientes. Cada uma pertence a um caso — clique na linha para abri-lo.</p></div>
        <button onClick={() => setNovo({ empresaId: "", casoId: "", casos: [] })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao whitespace-nowrap" style={{ background: "var(--acao)" }}>+ Pendência</button>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={abertas.length} l="abertas" /><Kpi v={vencidas} l="com prazo vencido" c={vencidas ? "var(--alerta)" : undefined} /><Kpi v={sete} l="prazos nos próximos 7 dias" c={sete ? "var(--atencao)" : undefined} /><Kpi v={emRev} l="em revisão" c={emRev ? "var(--acao)" : undefined} /></div>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 280px" }}>
        <div>
          <div className="flex flex-wrap gap-2 items-center mb-2.5">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por pendência, cliente, caso, responsável…" className="flex-1 bg-transparent outline-none text-xs" style={{ color: "var(--text-primary)" }} /></div>
            <select value={fCli} onChange={e => setFCli(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os clientes</option>{empsCom.map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select>
            <select value={fBanca} onChange={e => setFBanca(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as carteiras</option>{Object.keys(BANCAS).map(b => <option key={b} value={b}>Carteira {b}</option>)}</select>
            <select value={fArea} onChange={e => setFArea(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as áreas</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
            <select value={fResp} onChange={e => setFResp(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os tipos</option>{TIPOS_PEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button onClick={() => setMinhas(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(minhas)}>Minhas</button>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {([["abertas", "Abertas", abertas.length], ["vencidas", "Vencidas", vencidas], ...Object.entries(STATUS_PEND).filter(([k]) => k !== "concluida").map(([k, s]) => [k, s.l, abertas.filter(p => p.status === k).length] as [string, string, number]), ["concluida", "Concluídas", pendencias.length - abertas.length], ["todas", "Todas", pendencias.length]] as [string, string, number][]).map(([k, l, n]) => <button key={k} onClick={() => setFStatus(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(fStatus === k)}>{l} <span className="opacity-70">{n}</span></button>)}
          <button onClick={() => setSoRot(v => !v)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(soRot)} title="Só tarefas recorrentes (com e sem processo)">Rotinas <span className="opacity-70">{abertas.filter(p => p.recorrencia).length}</span></button>
<button onClick={() => setSoJulg(v => !v)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(soJulg)} title="Só sessões de julgamento">Julgamentos <span className="opacity-70">{abertas.filter(p => p.tipo === "julgamento").length}</span></button>
<button onClick={() => setSoRol(v => !v)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(soRol)} title="Só pendências que passam para frente sozinhas">↻ Rolantes <span className="opacity-70">{abertas.filter(p => p.tipo === "rolante").length}</span></button>
<button onClick={() => setSoDesp(v => !v)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(soDesp)} title="Só despachos com o gabinete">Despachos <span className="opacity-70">{abertas.filter(p => p.tipo === "despacho").length}</span></button>
          </div>
          <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <table className="w-full text-[12.5px]">
              <thead><tr style={{ background: "var(--bg-page)" }}>{["", "Pendência", "Área", "Tipo", "Responsável", "Status", "Interno", "Prazo", "Revisor", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? 36 : undefined }}>{h}</th>)}</tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={10}><Empty t="Nenhuma pendência com esses filtros." /></td></tr>}
                {lista.map(p => { const done = p.status === "concluida"; const s = STATUS_PEND[p.status] ?? { l: p.status, cls: "mut" }; return (
                  <tr key={p.id} className="border-b last:border-b-0 hover:brightness-110" style={{ borderColor: "var(--border)", opacity: done ? 0.55 : 1 }}>
                    <td className="px-3 py-2.5"><button onClick={() => toggleConcluir(p)} className="w-4 h-4 rounded border block" style={{ background: done ? "var(--ok)" : "transparent", borderColor: done ? "var(--ok)" : "var(--border-strong, var(--text-secondary))" }} title={done ? "Reabrir" : "Concluir"} /></td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => { if (!p.caso_id && p.tipo === "rolante") { abrirEdicao(p); return; } const d = destinoPend(p); if (d) router.push(d); }}><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>{p.titulo}</div><CliCell p={p} /><InfoJulg p={p} compacto /><InfoDesp p={p} /><InfoRol p={p} />{p.arquivo_url && <a href={p.arquivo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[11px]" style={{ color: "var(--acao)" }}>v{p.versao ?? 1} · abrir peça ↗</a>}</td>
                    <td className="px-3 py-2.5">{p.caso ? <AreaTag a={p.caso.area} /> : p.certidao_subtipo ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>Certidão</span> : p.recorrencia ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-purple-bg)", color: "var(--tag-purple-fg)" }}>Rotina</span> : null}</td>
                    <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>{TIPOS_PEND.find(t => t[0] === p.tipo)?.[1] ?? p.tipo}</td>
                    <td className="px-3 py-2.5">{p.responsavel ?? "—"}</td>
                    <td className="px-3 py-2.5"><Pz t={s.l} cls={s.cls} />{p.status === "revisao_pendente" && p.revisor && <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>com {p.revisor}{p.enviado_em ? ` · ${relTempo(p.enviado_em)}` : ""}</div>}{p.status === "devolvida" && p.devolucao_obs && <div className="text-[10.5px] mt-1 px-2 py-1 rounded-sm max-w-[240px]" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{p.revisor}:</b> {p.devolucao_obs}</div>}</td>
                    <td className="px-3 py-2.5">{internoPz(p)}</td>
                    <td className="px-3 py-2.5">{prazoPz(p)}</td>
                    <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{p.revisor ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><AcoesDespacho p={p} onPedido={async () => { await marcarPedidoDespacho(supabase, p, eu || "—"); router.refresh(); }} onAgendar={() => setAgendar(p)} onConcluir={() => setDespC(p)} />{p.tipo === "rolante" && p.status !== "concluida" && <button onClick={() => setAdiar(p)} className="px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Adiar para…</button>}<AcaoPeca p={p} eu={eu} onEnviar={() => setDr({ k: "enviar", p })} onRevisar={() => setDr({ k: "revisar", p })} onProtocolei={() => toggleConcluir(p)} /><button onClick={() => abrirEdicao(p)} className="w-8 h-8 rounded-md text-lg leading-none" style={{ color: "var(--text-secondary)" }} title="Modificar">⋯</button></span></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>Mostrando <b style={{ color: "var(--text-primary)" }}>{lista.length}</b> · ordem: prazo mais próximo primeiro, concluídas por último. Os mesmos botões da página do caso (enviar, revisar, ✓ protocolei) funcionam aqui. "Minhas" = sou responsável ou revisor.</div>
        </div>
        <div className="space-y-4">
          <Card title="Por status"><Dist pairs={porStatus} /></Card>
          <Card title="Por responsável"><Dist pairs={porResp} /></Card>
          <Card title="Por área"><Dist pairs={porArea} /></Card>
        </div>
      </div>

      {novo && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setNovo(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Nova pendência — em qual caso?</h3>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--text-secondary)" }}>Toda pendência pertence a um caso. Escolha o cliente e o caso; depois abre o formulário normal.</p>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-secondary)" }}>Cliente</label>
          <select autoFocus value={novo.empresaId} onChange={e => escolherEmpresa(e.target.value)} className={inputCls} style={inputStyle}><option value="">— escolher cliente</option>{empresas.filter(e => e.ativo).sort((a, b) => (a.nome_exibicao || a.nome).localeCompare(b.nome_exibicao || b.nome)).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}{e.banca ? ` · Carteira ${e.banca}` : ""}</option>)}</select>
          {novo.empresaId && <><label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 mt-3" style={{ color: "var(--text-secondary)" }}>Caso</label>
            <select value={novo.casoId} onChange={e => setNovo({ ...novo, casoId: e.target.value })} className={inputCls} style={inputStyle}><option value="">— escolher caso</option><option value="__sem">↻ sem processo (tarefa rolante do cliente)</option>{novo.casos.map(c => <option key={c.id} value={c.id}>{AREAS.find(a => a.key === c.area)?.icon} {c.titulo}{c.numero ? ` · ${c.numero}` : ""}</option>)}</select>
            {novo.casos.length === 0 && <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>Este cliente não tem casos ativos — crie o caso primeiro na página do cliente.</div>}</>}
          <div className="flex justify-end gap-2 mt-4"><button onClick={() => setNovo(null)} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button disabled={!novo.casoId} onClick={abrirNova} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>Continuar →</button></div>
        </div>
      </>)}

      {despC && <ConcluirDespacho p={despC} usuario={eu || "—"} supabase={supabase} onClose={() => setDespC(null)} onSaved={() => { setDespC(null); router.refresh(); }} />}
{agendar && <AgendarDespacho p={agendar} usuario={eu || "—"} supabase={supabase} onClose={() => setAgendar(null)} onSaved={() => { setAgendar(null); router.refresh(); }} />}
{adiar && <AdiarRolante p={adiar} usuario={eu || "—"} supabase={supabase} onClose={() => setAdiar(null)} onSaved={() => { setAdiar(null); router.refresh(); }} />}
{julg && <ConcluirJulgamento p={julg} usuario={eu || "—"} supabase={supabase} onClose={() => setJulg(null)} onSaved={() => { setJulg(null); router.refresh(); }} />}
{dr?.k === "pend" && dr.caso && <PendDrawer key={dr.p?.id ?? "nova"} caso={dr.caso} inicial={dr.p} preset={dr.preset} usuario={eu || "—"} andamentos={dr.andamentos ?? []} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "enviar" && dr.p && <EnviarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "revisar" && dr.p && <RevisarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
    </div>
  );
}
