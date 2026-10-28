"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, type Area } from "@/lib/areas";
import { situacao } from "@/lib/acompanhamento";
import { falhouHoje } from "@/lib/push";
import { BANCAS, type Empresa } from "./ClientesListView";
import type { Caso } from "./ClienteView";
import { PainelAcompanhamentos, useEu, useAcomp, useAcaoAcomp } from "./Acompanhamento";
import { PainelPush } from "./Push";
import { PendDrawer, AndDrawer, Pz, FONTES, TagUrgente, primeiroNome, fmtDT, relTempo, type Andamento } from "./CasoView";

type Ref = { caso: { id: string; titulo: string; numero: string | null; area: Area } | null; empresa: { id: string; nome: string; nome_exibicao: string | null; banca: string | null } | null };
export type AndRev = Andamento & Ref;
export type Achado = { id: string; tipo: "tese" | "do"; rodada: string | null; assunto: string | null; empresa_id: string | null; caso_id: string | null; titulo: string; trecho: string | null; resumo: string | null; fonte: string | null; diario: string | null; tipo_pub: string | null; url: string | null; data_pub: string | null; prazo: string | null; relevancia: number | null; match: string | null; status: string; criado_em: string; tratado_em: string | null; tratado_por: string | null } & Ref;
export type Assunto = { id: string; nome: string; ativo: boolean };

const fmt = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hojeStr = () => new Date().toISOString().slice(0, 10);
const addD = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const diasAte = (d: string) => Math.ceil((new Date(d + "T12:00:00").getTime() - new Date(hojeStr() + "T12:00:00").getTime()) / 864e5);
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const labelDia = (d: string) => { const n = diasAte(d); const x = new Date(d + "T12:00:00"); return `${n > 0 ? "Data futura (conferir) · " : n === 0 ? "Hoje · " : n === -1 ? "Ontem · " : ""}${DIAS[x.getDay()]} ${fmt(d)}`; };
const proxSegunda = () => { const x = new Date(); x.setDate(x.getDate() + ((8 - x.getDay()) % 7 || 7)); return x.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); };
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const selCls = "px-2.5 py-1.5 rounded text-[11px] border"; const selStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;
const chipCls = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const btn = "px-2.5 py-1 rounded text-[10.5px] font-medium whitespace-nowrap border";
const bPri = { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }; const bSec = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }; const bOk = { background: "var(--ok)", borderColor: "var(--ok)", color: "var(--on-acao)" }; const bDng = { background: "var(--alerta)", borderColor: "var(--alerta)", color: "var(--on-acao)" };
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{title}</span>{action}</div>{children}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-7 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Kpi = ({ v, l, c }: { v: React.ReactNode; l: string; c?: string }) => <div className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
const AreaTag = ({ a }: { a?: Area | null }) => { const A = AREAS.find(x => x.key === a); return A ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span> : null; };
const Cli = ({ r }: { r: Ref }) => { const B = r.empresa?.banca ? BANCAS[r.empresa.banca] : null; return <><b style={{ color: "var(--text-primary)" }}>{r.empresa?.nome_exibicao || r.empresa?.nome || "—"}</b>{B && <span className="ml-1 text-[9px] font-bold px-1 py-px rounded align-middle" style={{ background: B.bg, color: B.fg }}>{r.empresa!.banca}</span>}{r.caso && <> · {r.caso.titulo}{r.caso.numero ? ` · ${r.caso.numero}` : ""}</>}</>; };
const Rel = ({ n }: { n: number }) => <span className="inline-flex gap-0.5" title={`relevância ${n}/3`}>{[1, 2, 3].map(i => <i key={i} className="inline-block w-2 h-2 rounded-full border" style={i <= n ? { background: "var(--atencao)", borderColor: "var(--atencao)" } : { background: "var(--bg-page)", borderColor: "var(--border)" }} />)}</span>;
const fonteLabel = (f: string) => FONTES.find(x => x[0] === f)?.[1] ?? f;

export default function AcompanhamentosView({ usuarioNome, andamentos, achados, assuntos, empresas }: { usuarioNome: string; andamentos: AndRev[]; achados: Achado[]; assuntos: Assunto[]; empresas: Empresa[] }) {
  const router = useRouter(); const supabase = createClient();
  const refresh = useRefreshDebounced(router);
  const eu = primeiroNome(usuarioNome) || "—";
  const [tab, setTab] = useState<"acomp" | "humanos" | "push" | "and" | "teses" | "do">("acomp");
  const euAc = useEu(); const [contAc, setContAc] = useState<{ total: number; atras: number }>({ total: 0, atras: 0 });
  const acPush = useAcomp({ incluirSugestoes: false }); const acaoPush = useAcaoAcomp(euAc, acPush.reload); const nPush = acPush.itens.filter(i => i.modo === "push").length;
  const resumo = useMemo(() => {
    const ativos = acPush.itens.filter(i => i.status === "ativo");
    const hum = ativos.filter(i => i.modo !== "push");
    const pushi = ativos.filter(i => i.modo === "push");
    const atras = (arr: any[]) => arr.filter(i => { try { return situacao(i as any, (i as any).regs ?? [], acPush.feriados).atraso > 0; } catch { return false; } });
    const humAtras = atras(hum); const pushAtras = atras(pushi);
    const pushErros = pushi.filter(i => { try { return falhouHoje(i as any); } catch { return false; } });
    const porR: Record<string, number> = {};
    [...humAtras, ...pushAtras].forEach(i => { const r = (i as any).responsavel || "—"; porR[r] = (porR[r] || 0) + 1; });
    return { hum: hum.length, push: pushi.length, humAtras: humAtras.length, pushAtras: pushAtras.length, pushErros: pushErros.length, porResp: Object.entries(porR).sort((a, b) => b[1] - a[1]) as [string, number][] };
  }, [acPush.itens, acPush.feriados]);
  const nProblemas = resumo.humAtras + resumo.pushAtras + resumo.pushErros;
  const [hor, setHor] = useState<7 | 15 | 30>(7); const [fFonte, setFFonte] = useState("todas"); const [fBanca, setFBanca] = useState("todas"); const [fArea, setFArea] = useState("todas"); const [soUrg, setSoUrg] = useState(false);
  const [fTese, setFTese] = useState("novo"); const [fAss, setFAss] = useState("todos"); const [fRodT, setFRodT] = useState("todas");
  const [fDo, setFDo] = useState("triar"); const [fDiario, setFDiario] = useState("todos"); const [fCliDo, setFCliDo] = useState("todos"); const [fRodD, setFRodD] = useState("todas");
  const [dr, setDr] = useState<null | { k: "pend" | "and"; caso: Caso; ands: Andamento[]; origem?: Andamento; achado?: Achado }>(null);
  const [escolha, setEscolha] = useState<null | { fim: "and" | "vincular"; achado?: Achado; empresaId: string; casoId: string; casos: Caso[] }>(null);
  const [novoAss, setNovoAss] = useState(""); const [editAss, setEditAss] = useState(false);

  useEffect(() => {
    const ch = supabase.channel("acomp-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_andamentos" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "achados" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── dados derivados ── */
  const urgentes = andamentos.filter(a => a.urgente && !a.urgente_tratado_em).sort((a, b) => b.data.localeCompare(a.data));
  const desde = addD(hojeStr(), -hor);
  const feed = useMemo(() => andamentos.filter(a => a.data >= desde).filter(a => fFonte === "todas" || (fFonte === "oficial" ? a.fonte !== "manual" : fFonte === "manual" ? a.fonte === "manual" : a.fonte === fFonte)).filter(a => fBanca === "todas" || a.empresa?.banca === fBanca).filter(a => fArea === "todas" || a.caso?.area === fArea).filter(a => !soUrg || a.urgente).sort((a, b) => { const h = hojeStr(); const ka = a.data > h ? h : a.data, kb = b.data > h ? h : b.data; return kb.localeCompare(ka) || b.criado_em.localeCompare(a.criado_em); }), [andamentos, desde, fFonte, fBanca, fArea, soUrg]); // datas futuras (erro de digitação) não passam na frente do que é de hoje
  const dias = Array.from(new Set(feed.map(a => a.data)));
  const teses = achados.filter(a => a.tipo === "tese"); const dos = achados.filter(a => a.tipo === "do");
  const rodadasT = Array.from(new Set(teses.map(t => t.rodada).filter(Boolean))) as string[]; const rodadasD = Array.from(new Set(dos.map(t => t.rodada).filter(Boolean))) as string[];
  const assuntosT = Array.from(new Set(teses.map(t => t.assunto).filter(Boolean))) as string[]; const diarios = Array.from(new Set(dos.map(t => t.diario).filter(Boolean))) as string[];
  const listaT = teses.filter(t => fTese === "todos" ? t.status !== "descartado" : fTese === "casos" ? !!t.caso_id && t.status !== "descartado" : t.status === fTese).filter(t => fAss === "todos" || t.assunto === fAss).filter(t => fRodT === "todas" || t.rodada === fRodT).sort((a, b) => (b.relevancia ?? 0) - (a.relevancia ?? 0) || (b.data_pub ?? "").localeCompare(a.data_pub ?? ""));
  const listaD = dos.filter(d => fDo === "triar" ? (d.status === "novo" || d.status === "urgente") : d.status === fDo).filter(d => fDiario === "todos" || d.diario === fDiario).filter(d => fCliDo === "todos" || d.empresa_id === fCliDo).filter(d => fRodD === "todas" || d.rodada === fRodD).sort((a, b) => (a.status === "urgente" ? 0 : 1) - (b.status === "urgente" ? 0 : 1) || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
  const ultT = rodadasT.sort().slice(-1)[0]; const ultD = rodadasD.sort().slice(-1)[0];
  const cont = (arr: Achado[], st: string) => arr.filter(x => x.status === st).length;

  /* ── ações ── */
  async function tratar(a: AndRev) { await supabase.from("caso_andamentos").update({ urgente_tratado_em: new Date().toISOString(), urgente_tratado_por: eu }).eq("id", a.id); router.refresh(); }
  async function carregarCaso(casoId: string) { const [{ data: caso }, { data: ands }] = await Promise.all([supabase.from("casos").select("*").eq("id", casoId).maybeSingle(), supabase.from("caso_andamentos").select("*").eq("caso_id", casoId).order("data", { ascending: false }).limit(30)]); return caso ? { caso: caso as Caso, ands: (ands ?? []) as Andamento[] } : null; }
  async function pendDe(a: AndRev) { const r = await carregarCaso(a.caso_id); if (r) setDr({ k: "pend", ...r, origem: a }); }
  async function escolherEmpresa(id: string) { const { data } = await supabase.from("casos").select("*").eq("empresa_id", id).eq("ativo", true).order("titulo"); setEscolha(e => e ? { ...e, empresaId: id, casoId: "", casos: (data ?? []) as Caso[] } : e); }
  async function continuarEscolha() {
    if (!escolha?.casoId) return; const caso = escolha.casos.find(c => c.id === escolha.casoId)!;
    if (escolha.fim === "vincular" && escolha.achado) { await supabase.from("achados").update({ caso_id: caso.id, empresa_id: caso.empresa_id }).eq("id", escolha.achado.id); setEscolha(null); await gerarAndamento({ ...escolha.achado, caso_id: caso.id, empresa_id: caso.empresa_id, caso: { id: caso.id, titulo: caso.titulo, numero: caso.numero, area: caso.area as Area }, empresa: null }, false); return; }
    const r = await carregarCaso(caso.id); setEscolha(null); if (r) setDr({ k: "and", ...r });
  }
  async function gerarAndamento(ach: Achado, comPend: boolean) {
    if (!ach.caso_id) { setEscolha({ fim: "vincular", achado: ach, empresaId: ach.empresa_id ?? "", casoId: "", casos: [] }); if (ach.empresa_id) escolherEmpresa(ach.empresa_id); return; }
    const isDo = ach.tipo === "do"; const urg = ach.status === "urgente";
    const descricao = isDo ? `${ach.tipo_pub ?? "Publicação"} · ${ach.diario ?? "D.O."}: ${ach.trecho ?? ach.titulo}` : `Tese: ${ach.titulo}${ach.resumo ? ` — ${ach.resumo}` : ""}`;
    const { data: novo } = await supabase.from("caso_andamentos").insert({ caso_id: ach.caso_id, empresa_id: ach.empresa_id, data: ach.data_pub ?? hojeStr(), descricao, fonte: isDo ? "do" : "tese", anexo_url: ach.url, urgente: urg, urgente_motivo: urg ? (ach.prazo ? `prazo ${fmt(ach.prazo)}` : "achado marcado como urgente") : null }).select().single();
    await supabase.from("achados").update({ status: isDo ? "andamento" : "vinculado", tratado_em: new Date().toISOString(), tratado_por: eu }).eq("id", ach.id);
    if (comPend && novo) { const r = await carregarCaso(ach.caso_id); if (r) { setDr({ k: "pend", ...r, origem: novo as Andamento }); return; } }
    router.refresh();
  }
  async function statusAchado(ach: Achado, status: string) { await supabase.from("achados").update({ status, tratado_em: new Date().toISOString(), tratado_por: eu }).eq("id", ach.id); router.refresh(); }
  async function addAssunto() { const n = novoAss.trim(); if (!n) return; await supabase.from("assuntos_monitorados").upsert({ nome: n, ativo: true }, { onConflict: "nome" }); setNovoAss(""); router.refresh(); }
  async function delAssunto(a: Assunto) { await supabase.from("assuntos_monitorados").delete().eq("id", a.id); router.refresh(); }

  const Tab = ({ k, l, n }: { k: typeof tab; l: string; n: number }) => <button onClick={() => setTab(k)} className="px-3 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 border-b-2 -mb-px" style={{ color: tab === k ? "var(--acao)" : "var(--text-secondary)", borderColor: tab === k ? "var(--acao)" : "transparent", fontWeight: tab === k ? 600 : 500 }}>{l}<span className="text-[10px] px-1.5 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: tab === k ? "var(--acao)" : "var(--text-muted)" }}>{n}</span></button>;
  const abrirCaso = (r: Ref) => r.caso && router.push(`/casos/${r.caso.id}`);

  return (
    <div className="px-6 pt-4 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-[26px]">Acompanhamentos</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>O que aconteceu e o que foi encontrado, em todos os casos: acompanhamentos diários e semanais, capturas da rotina eproc (push), últimos andamentos, busca de teses e achados do Diário Oficial — lançados à mão e pelas rotinas semanais do Cowork.</p></div>
        <button onClick={() => setEscolha({ fim: "and", empresaId: "", casoId: "", casos: [] })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao whitespace-nowrap" style={{ background: "var(--acao)" }}>+ Andamento</button>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={urgentes.length} l="exigem atitude imediata" c={urgentes.length ? "var(--alerta)" : undefined} /><Kpi v={andamentos.filter(a => a.data >= addD(hojeStr(), -7)).length} l="andamentos · últimos 7 dias" /><Kpi v={cont(teses, "novo")} l="achados de teses · a triar" c={cont(teses, "novo") ? "var(--acao)" : undefined} /><Kpi v={cont(dos, "novo") + cont(dos, "urgente")} l="achados do D.O. · a triar" c={cont(dos, "novo") + cont(dos, "urgente") ? "var(--atencao)" : undefined} /></div>

      {/* ── bloco urgente ── */}
      <div className="rounded-md border mt-4 overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--alerta)" }}>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b text-[11px] font-bold uppercase tracking-widest" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>Atenção imediata<span className="ml-auto font-medium normal-case tracking-normal text-[11px]" style={{ color: "var(--text-secondary)" }}>andamentos com a tag <b>atitude imediata</b> — somem daqui ao marcar como tratado</span></div>
        {urgentes.length === 0 ? <Empty t="Nada exigindo atitude imediata. " /> : urgentes.map(a => (
          <div key={a.id} className="grid gap-3.5 px-3.5 py-3 border-b last:border-b-0 items-start" style={{ gridTemplateColumns: "1fr auto", borderColor: "var(--border)" }}>
            <div><div className="text-[13px]"><Cli r={a} /> <span className="ml-1"><AreaTag a={a.caso?.area} /></span></div><div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{fmt(a.data)}{a.hora ? ` ${a.hora}` : ""} · {fonteLabel(a.fonte)} · {relTempo(a.criado_em)}{a.urgente_motivo && <> · <span style={{ color: "var(--tag-red-fg)" }}>{a.urgente_motivo}</span></>}</div><div className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: "var(--text-primary)" }}>{a.descricao}</div>{a.anexo_url && <a href={a.anexo_url} target="_blank" rel="noreferrer" className="text-[11px]" style={{ color: "var(--acao)" }}>publicação / anexo ↗</a>}</div>
            <div className="flex gap-1.5 flex-wrap justify-end"><button onClick={() => pendDe(a)} className={btn} style={bPri}>+ Pendência</button><button onClick={() => abrirCaso(a)} className={btn} style={bSec}>Abrir caso</button><button onClick={() => tratar(a)} className={btn} style={bOk}>✓ Tratado</button></div>
          </div>))}
      </div>

      <div className="flex flex-wrap gap-0.5 mt-4 border-b" style={{ borderColor: "var(--border)" }}><Tab k="acomp" l="Resumo" n={nProblemas} /><Tab k="humanos" l={"Humanos" + (resumo.humAtras ? " · " + resumo.humAtras : "")} n={resumo.hum} /><Tab k="push" l="Push eproc" n={nPush} /><Tab k="and" l="Últimos andamentos" n={feed.length} /><Tab k="teses" l="Busca de teses" n={teses.filter(t => t.status !== "descartado").length} /><Tab k="do" l="Achados do D.O." n={dos.filter(d => d.status !== "descartado").length} /></div>

      {tab === "humanos" && <PainelAcompanhamentos eu={euAc} onContagem={setContAc} />}
      {tab === "acomp" && (
        <div className="mt-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <button onClick={() => setTab("humanos")} className="text-left rounded-lg border p-4 hover:brightness-110 transition" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Humanos · equipe</div>
              <div className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{resumo.hum}</div>
              <div className="text-xs mt-1" style={{ color: resumo.humAtras ? "var(--alerta)" : "var(--text-muted)" }}>{resumo.humAtras} atrasado{resumo.humAtras !== 1 ? "s" : ""}</div>
            </button>
            <button onClick={() => setTab("push")} className="text-left rounded-lg border p-4 hover:brightness-110 transition" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Push eproc · robô</div>
              <div className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{resumo.push}</div>
              <div className="text-xs mt-1 flex gap-3 flex-wrap">
                <span style={{ color: resumo.pushAtras ? "var(--alerta)" : "var(--text-muted)" }}>{resumo.pushAtras} atrasado{resumo.pushAtras !== 1 ? "s" : ""}</span>
                <span style={{ color: resumo.pushErros ? "var(--alerta)" : "var(--text-muted)" }}>{resumo.pushErros} erro{resumo.pushErros !== 1 ? "s" : ""} hoje</span>
              </div>
            </button>
          </div>
          {resumo.porResp.length > 0 && (
            <div className="rounded-lg border mt-4 overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)", background: "var(--bg-page)" }}>Atrasados por responsável</div>
              {resumo.porResp.map(([r, n]) => <div key={r} className="flex justify-between items-center px-3.5 py-2 border-t text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}><span>{r}</span><b style={{ color: "var(--alerta)" }}>{n}</b></div>)}
            </div>
          )}
          <div className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>Clique num cartão para abrir a lista. <b style={{ color: "var(--text-secondary)" }}>Humanos</b> = a equipe consulta; <b style={{ color: "var(--text-secondary)" }}>Push eproc</b> = o robô consulta e você decide. Atrasado = sem consulta ok dentro da frequência; erro = a rotina falhou hoje.</div>
        </div>
      )}
{tab === "push" && <><PainelPush eu={euAc} itens={acPush.itens} carregando={acPush.carregando} reload={acPush.reload} onHist={acaoPush.acoes.hist} onIncluir={() => acaoPush.acoes.incluir(undefined, "página Acompanhamentos (push)")} />{acaoPush.drawers}</>}
      {tab !== "acomp" && tab !== "humanos" && tab !== "push" && <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: "1fr 290px" }}>
        <div>
          {tab === "and" && (<>
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <div className="flex gap-1.5">{([7, 15, 30] as const).map(h => <button key={h} onClick={() => setHor(h)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(hor === h)}>{h} dias</button>)}</div>
              <select value={fFonte} onChange={e => setFFonte(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as fontes</option><option value="oficial">Oficiais</option><option value="manual">Manuais</option>{FONTES.filter(f => f[0] !== "manual").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <select value={fBanca} onChange={e => setFBanca(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as carteiras</option>{Object.keys(BANCAS).map(b => <option key={b} value={b}>Carteira {b}</option>)}</select>
              <select value={fArea} onChange={e => setFArea(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as áreas</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
              <button onClick={() => setSoUrg(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chipCls(soUrg)}>só urgentes</button>
            </div>
            <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {feed.length === 0 ? <Empty t={`Nenhum andamento nos últimos ${hor} dias com esses filtros.`} /> : dias.map(d => (<div key={d}>
                <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{labelDia(d)}</div>
                {feed.filter(a => a.data === d).map(a => (
                  <div key={a.id} className="grid gap-3 px-3.5 py-2.5 border-b last:border-b-0 items-start" style={{ gridTemplateColumns: "12px 1fr auto", borderColor: "var(--border)" }}>
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={a.urgente && !a.urgente_tratado_em ? { background: "var(--alerta)", outline: "2px solid var(--alerta)", outlineOffset: 1 } : { background: a.fonte === "manual" ? "var(--acao)" : "var(--text-muted)" }} />
                    <div className="min-w-0"><div className="text-[11px] mb-0.5" style={{ color: "var(--text-muted)" }}><Cli r={a} /> <span className="ml-1"><AreaTag a={a.caso?.area} /></span></div><div className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>{a.descricao}<span className="ml-1.5 text-[9px] font-bold px-1.5 py-px rounded uppercase tracking-wider border align-middle" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-muted)" }}>{fonteLabel(a.fonte)}</span>{a.urgente && <span className="ml-1.5"><TagUrgente tratado={!!a.urgente_tratado_em} /></span>}</div>{a.anexo_url && <a href={a.anexo_url} target="_blank" rel="noreferrer" className="text-[10.5px]" style={{ color: "var(--acao)" }}>anexo ↗</a>}</div>
                    <div className="flex gap-1.5"><button onClick={() => abrirCaso(a)} className={btn} style={bSec}>Abrir</button><button onClick={() => pendDe(a)} className={btn} style={bSec}>+ Pend.</button></div>
                  </div>))}
              </div>))}
            </div>
            <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>Feed único de todos os casos, agrupado por dia. Ponto vermelho = tag <b>atitude imediata</b>, marcada por quem registra o andamento ou pela rotina do D.O.; fica no bloco de cima e no contador da sidebar até ser tratada.</div>
          </>)}

          {tab === "teses" && (<>
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <div className="flex gap-1.5 flex-wrap">{([["novo", "Novos", cont(teses, "novo")], ["casos", "Ligados a casos", teses.filter(t => t.caso_id && t.status !== "descartado").length], ["vinculado", "Vinculados", cont(teses, "vinculado")], ["salvo", "Salvos", cont(teses, "salvo")], ["descartado", "Descartados", cont(teses, "descartado")], ["todos", "Todos", teses.filter(t => t.status !== "descartado").length]] as [string, string, number][]).map(([k, l, n]) => <button key={k} onClick={() => setFTese(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(fTese === k)}>{l} <span className="opacity-70">{n}</span></button>)}</div>
              <select value={fAss} onChange={e => setFAss(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os assuntos</option>{assuntosT.map(a => <option key={a}>{a}</option>)}</select>
              <select value={fRodT} onChange={e => setFRodT(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as rodadas</option>{rodadasT.sort().reverse().map(r => <option key={r} value={r}>Rodada {fmt(r)}</option>)}</select>
            </div>
            <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-[12.5px]"><thead><tr style={{ background: "var(--bg-page)" }}>{["Achado", "Tipo · origem", "Relev.", "Caso relacionado", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "42%" : undefined }}>{h}</th>)}</tr></thead>
                <tbody>{listaT.length === 0 && <tr><td colSpan={5}><Empty t="Nenhum achado de tese aqui. A rotina semanal do Cowork grava os resultados nesta lista." /></td></tr>}
                  {listaT.map(t => (<tr key={t.id} className="border-b last:border-b-0 align-top" style={{ borderColor: "var(--border)", opacity: t.status === "descartado" ? 0.55 : 1 }}>
                    <td className="px-3 py-2.5"><div className="font-semibold" style={{ color: "var(--text-primary)" }}>{t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: "var(--text-primary)" }}>{t.titulo} ↗</a> : t.titulo}</div>{t.resumo && <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t.resumo}</div>}<div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{t.assunto && <>assunto: <b>{t.assunto}</b> · </>}{fmt(t.data_pub)}{t.rodada && <> · rodada {fmt(t.rodada)}</>}</div></td>
                    <td className="px-3 py-2.5"><Pz t={t.tipo_pub ?? "achado"} cls={/legisla/i.test(t.tipo_pub ?? "") ? "rev" : /repetitiv|súmula|sumula/i.test(t.tipo_pub ?? "") ? "prox" : "gray"} />{t.fonte && <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{t.fonte}</div>}</td>
                    <td className="px-3 py-2.5"><Rel n={t.relevancia ?? 1} /></td>
                    <td className="px-3 py-2.5 text-[11.5px]">{t.caso ? <button onClick={() => abrirCaso(t)} className="text-left" style={{ color: "var(--text-secondary)" }}><Cli r={t} /></button> : <span style={{ color: "var(--text-muted)" }}>— sem caso</span>}</td>
                    <td className="px-2 py-2.5 text-right"><div className="flex flex-col gap-1 items-end">{t.status === "vinculado" ? <Pz t="vinculado" cls="ok" /> : t.status === "salvo" ? <Pz t="salvo" cls="rev" /> : t.status === "descartado" ? <button onClick={() => statusAchado(t, "novo")} className={btn} style={bSec}>Restaurar</button> : <><button onClick={() => gerarAndamento(t, false)} className={btn} style={bPri}>{t.caso_id ? "Vincular ao caso" : "Vincular a caso"}</button><button onClick={() => statusAchado(t, "salvo")} className={btn} style={bSec}>Salvar em Inteligência</button><button onClick={() => statusAchado(t, "descartado")} className={btn} style={bSec}>Descartar</button></>}</div></td>
                  </tr>))}</tbody></table>
            </div>
            <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>Resultado da rotina semanal: busca por <b>assunto monitorado</b> (lista ao lado) e pela tese de cada caso ativo. <b>Vincular</b> gera um andamento "Tese: …" no caso com o link; <b>Salvar</b> guarda para referência; <b>Descartar</b> tira da lista.</div>
          </>)}

          {tab === "do" && (<>
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <div className="flex gap-1.5 flex-wrap">{([["triar", "A triar", cont(dos, "novo") + cont(dos, "urgente")], ["urgente", "Urgentes", cont(dos, "urgente")], ["andamento", "Virou andamento", cont(dos, "andamento")], ["descartado", "Descartados", cont(dos, "descartado")]] as [string, string, number][]).map(([k, l, n]) => <button key={k} onClick={() => setFDo(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chipCls(fDo === k)}>{l} <span className="opacity-70">{n}</span></button>)}</div>
              <select value={fDiario} onChange={e => setFDiario(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os diários</option>{diarios.map(d => <option key={d}>{d}</option>)}</select>
              <select value={fCliDo} onChange={e => setFCliDo(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os clientes</option>{empresas.filter(e => dos.some(d => d.empresa_id === e.id)).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select>
              <select value={fRodD} onChange={e => setFRodD(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as rodadas</option>{rodadasD.sort().reverse().map(r => <option key={r} value={r}>Rodada {fmt(r)}</option>)}</select>
            </div>
            <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-[12.5px]"><thead><tr style={{ background: "var(--bg-page)" }}>{["Cliente · caso", "Diário", "Trecho encontrado", "Prazo detectado", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 2 ? "38%" : undefined }}>{h}</th>)}</tr></thead>
                <tbody>{listaD.length === 0 && <tr><td colSpan={5}><Empty t="Nenhum achado do D.O. aqui. A rotina semanal varre os diários por nº de processo, CNPJ e assuntos." /></td></tr>}
                  {listaD.map(d => { const pd = d.prazo ? diasAte(d.prazo) : null; return (<tr key={d.id} className="border-b last:border-b-0 align-top" style={{ borderColor: "var(--border)", background: d.status === "urgente" ? "var(--tag-red-bg)" : undefined, opacity: d.status === "descartado" ? 0.55 : 1 }}>
                    <td className="px-3 py-2.5 text-[11.5px]"><button onClick={() => abrirCaso(d)} className="text-left" style={{ color: "var(--text-secondary)" }}><Cli r={d} /></button>{!d.caso && <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>sem caso ligado</div>}<div className="mt-1"><AreaTag a={d.caso?.area} /></div>{d.match && <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>match: {d.match}</div>}</td>
                    <td className="px-3 py-2.5"><b className="text-xs" style={{ color: "var(--text-primary)" }}>{d.diario ?? "—"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{fmt(d.data_pub)}</div>{d.tipo_pub && <div className="mt-1"><Pz t={d.tipo_pub} cls={/decis|intima/i.test(d.tipo_pub) ? "rev" : /edital/i.test(d.tipo_pub) ? "fatal" : "gray"} /></div>}</td>
                    <td className="px-3 py-2.5"><div className="text-xs italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.trecho ?? d.titulo}</div>{d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[10.5px]" style={{ color: "var(--acao)" }}>ver publicação ↗</a>}{d.status === "urgente" && <div className="mt-1.5"><TagUrgente /></div>}</td>
                    <td className="px-3 py-2.5">{d.prazo ? <Pz t={fmt(d.prazo)} cls={pd! <= 2 ? "fatal" : pd! <= 7 ? "prox" : "mut"} /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td className="px-2 py-2.5 text-right"><div className="flex flex-col gap-1 items-end">{d.status === "andamento" ? <Pz t="virou andamento" cls="ok" /> : d.status === "descartado" ? <button onClick={() => statusAchado(d, "novo")} className={btn} style={bSec}>Restaurar</button> : <>{d.caso_id ? <><button onClick={() => gerarAndamento(d, false)} className={btn} style={bPri}>Gerar andamento</button><button onClick={() => gerarAndamento(d, true)} className={btn} style={bSec}>Andamento + pendência</button></> : <button onClick={() => gerarAndamento(d, false)} className={btn} style={bPri}>Vincular a caso</button>}{d.status !== "urgente" && <button onClick={() => statusAchado(d, "urgente")} className={btn} style={bDng}>Urgente</button>}<button onClick={() => statusAchado(d, "descartado")} className={btn} style={bSec}>Descartar</button></>}</div></td>
                  </tr>); })}</tbody></table>
            </div>
            <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>A rotina varre os diários por <b>nº de processo</b>, <b>CNPJ</b> e <b>assuntos monitorados</b>. Aqui você tria: gerar andamento (fonte D.O., com trecho e link), já com pendência, marcar urgente ou descartar. Achado urgente vira andamento com a tag <b>atitude imediata</b>.</div>
          </>)}
        </div>

        <div className="space-y-4">
          <Card title="Rotinas semanais · Cowork">
            <div className="px-3.5 py-2.5 border-b text-xs" style={{ borderColor: "var(--border)" }}><div className="font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}><i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: ultT ? "var(--ok)" : "var(--text-muted)" }} />Busca de teses</div><div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>Segundas · por assunto e por caso ativo<br />Última: <b style={{ color: "var(--text-secondary)" }}>{ultT ? fmt(ultT) : "ainda não rodou"}</b>{ultT && <> · {teses.filter(t => t.rodada === ultT).length} achados</>}<br />Próxima: {proxSegunda()}</div></div>
            <div className="px-3.5 py-2.5 text-xs"><div className="font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}><i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: ultD ? "var(--ok)" : "var(--text-muted)" }} />Varredura dos Diários Oficiais</div><div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>Segundas · nº de processo, CNPJ e assuntos<br />Última: <b style={{ color: "var(--text-secondary)" }}>{ultD ? fmt(ultD) : "ainda não rodou"}</b>{ultD && <> · {dos.filter(t => t.rodada === ultD).length} achados · {dos.filter(t => t.rodada === ultD && t.status === "urgente").length} urgentes</>}<br />Próxima: {proxSegunda()}</div></div>
          </Card>
          <Card title="Assuntos monitorados" action={<button onClick={() => setEditAss(v => !v)} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>{editAss ? "concluir" : "✎ editar"}</button>}>
            <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5">{assuntos.length === 0 && <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Nenhum assunto ainda — adicione os temas que as rotinas devem buscar.</span>}{assuntos.map(a => <span key={a.id} className="text-[10.5px] px-2 py-1 rounded-full border inline-flex items-center gap-1" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{a.nome}{editAss && <button onClick={() => delAssunto(a)} className="ml-0.5" style={{ color: "var(--alerta)" }} title="remover">✕</button>}</span>)}</div>
            <div className="px-3.5 pb-3 flex gap-1.5"><input value={novoAss} onChange={e => setNovoAss(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addAssunto(); }} placeholder="+ assunto (Enter)" className={inputCls + " !py-1.5 !text-[11.5px]"} style={inputStyle} /><button onClick={addAssunto} disabled={!novoAss.trim()} className={btn + " disabled:opacity-50"} style={bPri}>Adicionar</button></div>
          </Card>
          <Card title="Casos monitorados"><div className="px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>Por <b>nº de processo</b>: todos os casos ativos com número.<br />Por <b>CNPJ</b>: raiz do CNPJ de cada cliente ativo.<br />Casos "em preparação" (sem número) entram pelo CNPJ e pelo assunto.</div></Card>
        </div>
      </div>}

      {escolha && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setEscolha(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{escolha.fim === "and" ? "Novo andamento — em qual caso?" : "Vincular achado — a qual caso?"}</h3>
          {escolha.achado && <p className="text-xs mt-1 italic" style={{ color: "var(--text-secondary)" }}>{escolha.achado.titulo}</p>}
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 mt-3" style={{ color: "var(--text-secondary)" }}>Cliente</label>
          <select autoFocus value={escolha.empresaId} onChange={e => escolherEmpresa(e.target.value)} className={inputCls} style={inputStyle}><option value="">— escolher cliente</option>{empresas.filter(e => e.ativo).sort((a, b) => (a.nome_exibicao || a.nome).localeCompare(b.nome_exibicao || b.nome)).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}{e.banca ? ` · Carteira ${e.banca}` : ""}</option>)}</select>
          {escolha.empresaId && <><label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 mt-3" style={{ color: "var(--text-secondary)" }}>Caso</label><select value={escolha.casoId} onChange={e => setEscolha({ ...escolha, casoId: e.target.value })} className={inputCls} style={inputStyle}><option value="">— escolher caso</option>{escolha.casos.map(c => <option key={c.id} value={c.id}>{AREAS.find(a => a.key === c.area)?.icon} {c.titulo}{c.numero ? ` · ${c.numero}` : ""}</option>)}</select>{escolha.casos.length === 0 && <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>Este cliente não tem casos ativos.</div>}</>}
          <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEscolha(null)} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button disabled={!escolha.casoId} onClick={continuarEscolha} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>Continuar →</button></div>
        </div>
      </>)}

      {dr?.k === "and" && <AndDrawer caso={dr.caso} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onCriarPend={a => setDr({ k: "pend", caso: dr.caso, ands: dr.ands, origem: a })} supabase={supabase} />}
      {dr?.k === "pend" && <PendDrawer key={dr.origem?.id ?? "nova"} caso={dr.caso} origem={dr.origem} andamentos={dr.ands} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
    </div>
  );
}
