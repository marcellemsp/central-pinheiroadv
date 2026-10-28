"use client";
// Acompanhamento Push · eproc (v53): a rotina consulta, o advogado decide (Ciente / + Pendência / + Prazo).
// Peças: TagModo (linhas), HomePush (bloco da Home), PainelPush (aba da página Acompanhamentos), CardRotinaHoje.
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AREAS } from "@/lib/areas";
import { PendDrawer, type Andamento } from "./CasoView";
import type { Caso } from "./ClienteView";
import { type AcompItem, type Eu, fmtData, fmtHora, labelFreq, norm, primeiro } from "@/lib/acompanhamento";
import { type PushItem, enriquecerPush, decidirPush, falhouHoje } from "@/lib/push";

type SB = ReturnType<typeof createClient>;
const btn = "px-2.5 py-1 rounded text-[10.5px] font-medium whitespace-nowrap border";
const bPri = { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }; const bSec = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };
const bOk = { background: "var(--ok)", borderColor: "var(--ok)", color: "var(--on-acao)" };
const chip = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const Empty = ({ t }: { t: string }) => <div className="px-4 py-6 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const AreaTag = ({ a }: { a?: string | null }) => { const A = AREAS.find(x => x.key === a); return A ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span> : null; };
const nomeCli = (it: AcompItem) => it.empresa?.nome_exibicao || it.empresa?.nome || "—";
const nomeCaso = (it: AcompItem) => it.caso ? `${it.caso.titulo}${it.caso.numero ? ` · ${it.caso.numero}` : ""}` : "—";

/** Etiqueta do modo: Push (azul) ou Humano (cinza). */
export const TagModo = ({ modo }: { modo?: string | null }) => modo === "push"
  ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" }}>Push</span>
  : <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-gray-bg)", color: "var(--tag-gray-fg)" }}>Humano</span>;

const Bot = ({ children, tom = "azul" }: { children: React.ReactNode; tom?: "azul" | "verde" | "vermelho" | "cinza" }) => {
  const s = tom === "verde" ? { color: "var(--tag-green-fg)", background: "var(--tag-green-bg)", borderColor: "var(--ok)" } : tom === "vermelho" ? { color: "var(--tag-red-fg)", background: "var(--tag-red-bg)", borderColor: "var(--alerta)" } : tom === "cinza" ? { color: "var(--text-muted)", background: "transparent", borderColor: "var(--border)" } : { color: "var(--tag-blue-fg)", background: "var(--tag-blue-bg)", borderColor: "var(--acao)" };
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap" style={s}>{children}</span>;
};

/** Carrega os itens Push enriquecidos (registro de hoje, capturados, alerte do dia). */
export function usePush(itens: AcompItem[]) {
  const [lista, setLista] = useState<PushItem[]>([]); const [carregando, setCarregando] = useState(true);
  // A chave precisa enxergar a decisão (ciente/pendência) — ela muda o registro sem mudar a contagem.
  const chave = itens.map(i => `${i.id}:${i.regs.length}:${i.modo}:${i.regs.filter((r: any) => r.decisao).length}`).join("|");
  useEffect(() => { let on = true; setCarregando(true); enriquecerPush(createClient(), itens).then(r => { if (on) { setLista(r); setCarregando(false); } }); return () => { on = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return { lista, carregando };
}

function StatusPush({ p }: { p: PushItem }) {
  const r = p.regHoje; const v = p.visita;
  if (p.estado === "aguardando") return <Bot tom="cinza">aguardando a rotina de hoje</Bot>;
  if (p.estado === "falhou") return <Bot tom="vermelho">falhou {r ? fmtHora(r.criado_em) : ""} · {(v?.resultado ?? "erro").replace("falhou:", "")}</Bot>;
  if (p.estado === "fila") return <Bot tom="cinza">não consultado · fila {r ? fmtHora(r.criado_em) : ""}</Bot>;
if (p.estado === "lido") return <Bot tom="cinza">consultado {r ? fmtHora(r.criado_em) : ""} · cópia na fila</Bot>;
if (p.estado === "sem_novidade") return <Bot tom="cinza">consultado {r ? fmtHora(r.criado_em) : ""} · sem novidade</Bot>;
  const n = p.capturados.length || v?.eventos_novos?.length || 0;
  if (p.estado === "decidido") return <Bot tom="verde">✓ {r?.decisao === "ciente" ? "Ciente" : r?.decisao === "prazo" ? "Prazo criado" : "Pendência criada"} · {r?.decidido_por ?? ""} {r?.decidido_em ? fmtHora(r.decidido_em) : ""}</Bot>;
  return <Bot>{n} andamento{n === 1 ? "" : "s"} novo{n === 1 ? "" : "s"} · {r ? fmtHora(r.criado_em) : ""}</Bot>;
}

/** Linha de um caso Push (Home e página). */
export function LinhaPush({ p, eu, onDecidir, onPend, onHist, onIncluirManual }: { p: PushItem; eu: Eu | null; onDecidir: (p: PushItem) => void; onPend: (p: PushItem, prazo: boolean) => void; onHist: (it: AcompItem) => void; onIncluirManual?: (it: AcompItem) => void }) {
  const aDecidir = p.estado === "decidir"; const adv = !!eu && !eu.coord;
  const capt = p.capturados.length ? p.capturados.map(a => ({ k: a.id, d: a.data, t: a.descricao, urg: !!a.urgente })) : (p.visita?.eventos_novos ?? []).map(e => ({ k: String(e.seq), d: e.data, t: e.evento, urg: false }));
  const previa = !p.capturados.length && !!(p.visita?.eventos_novos?.length);
  const seq = (p.caso as any)?.eproc_ultimo_seq as number | null | undefined;
  const al = p.alerteHoje;
  return (
    <div className="px-3.5 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)", background: p.capturados.some(a => a.urgente) ? "var(--tag-red-bg)" : undefined, opacity: p.estado === "decidido" || p.estado === "sem_novidade" ? 0.75 : 1 }}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
          <div className="text-[12.5px] break-words"><b style={{ color: "var(--text-primary)" }}>{nomeCli(p)}</b> · <Link href={`/casos/${p.caso_id}`} style={{ color: "var(--text-primary)" }}>{nomeCaso(p)}</Link> <span className="ml-1 inline-flex gap-1 flex-wrap align-middle"><TagModo modo="push" /><span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: "var(--tag-purple-bg)", color: "var(--tag-purple-fg)" }}>{labelFreq(p).replace("", "")}</span><AreaTag a={p.caso?.area} /></span></div>
          <div className="text-[11px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{!adv && <><b style={{ color: "var(--text-secondary)" }}>{p.responsavel}</b> decide · </>}{p.onde ? `${p.onde} · ` : ""}{seq != null ? `íntegra até o evento ${seq}` : "sem íntegra ainda"}{p.visita?.trib_ultimo_seq != null ? ` · tribunal no ${p.visita.trib_ultimo_seq}` : ""}</div>
          {p.o_que && <div className="text-[11.5px] mt-1 break-words" style={{ color: "var(--text-primary)" }}>{p.o_que}</div>}
          {al && <div className="text-[11px] mt-1 font-semibold" style={{ color: al.status === "novo" ? "var(--tag-amber-fg)" : "var(--tag-purple-fg)" }}>publicação hoje{al.status === "novo" ? " · ainda sem destinação — o prazo nasce lá" : ` · destinada${al.proposto_por ? ` por ${primeiro(al.proposto_por)}` : ""}${al.proposta?.prazo ? ` · prazo ${fmtData(al.proposta.prazo)}` : ""}`}</div>}
        </div>
        <div className="shrink-0"><StatusPush p={p} />{p.estado === "falhou" && <div className="text-[10.5px] mt-1" style={{ color: "var(--tag-red-fg)" }}>{p.se_falhar === "avisar" ? "só aviso" : "hoje vira consulta manual (lista da equipe)"}</div>}</div>
        <div className="flex gap-1.5 flex-wrap shrink-0">
          {aDecidir && <><button onClick={() => onDecidir(p)} className={btn} style={bOk}>✓ Ciente</button><button onClick={() => onPend(p, false)} className={btn} style={bPri}>+ Pendência</button><button onClick={() => onPend(p, true)} className={btn} style={bSec}>+ Prazo</button></>}
          {p.estado === "falhou" && onIncluirManual && <button onClick={() => onIncluirManual(p)} className={btn} style={bSec}>Consultar à mão</button>}
          <button onClick={() => onHist(p)} className={btn} style={bSec}>Histórico</button>
        </div>
      </div>
      {(aDecidir || p.estado === "decidido") && capt.length > 0 && (
        <div className="mt-2 rounded border" style={{ borderColor: "var(--border)", border: "1px solid var(--acao)", background: "var(--bg-page)" }}>
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--text-muted)" }}>Capturado da íntegra{p.visita?.eventos ? ` · eventos ${p.visita.eventos}` : ""}{previa && <span className="normal-case tracking-normal font-medium" style={{ color: "var(--tag-amber-fg)" }}>· prévia (a Rotina A ainda não gravou os andamentos)</span>}</div>
          {capt.slice(0, 8).map(c => <div key={c.k} className="grid gap-2.5 px-3 py-1.5 border-t text-[12px]" style={{ gridTemplateColumns: "74px minmax(0,1fr)", borderColor: "var(--border)", background: c.urg ? "var(--tag-red-bg)" : undefined }}><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{fmtData(c.d)}</div><div style={{ color: "var(--text-primary)" }}>{c.urg && <span className="mr-1.5 text-[9.5px] font-bold uppercase" style={{ color: "var(--tag-red-fg)" }}>urgente</span>}{c.t}</div></div>)}
          {capt.length > 8 && <div className="px-3 py-1.5 border-t text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>+ {capt.length - 8} · <Link href={`/casos/${p.caso_id}`} style={{ color: "var(--acao)" }}>ver no caso</Link></div>}
        </div>
      )}
    </div>
  );
}

/** Estado e drawers das ações Push (Ciente / Pendência / Prazo). */
export function useAcaoPush(eu: Eu | null, reload: () => void) {
  const supabase = createClient();
  const [pend, setPend] = useState<null | { p: PushItem; caso: Caso; ands: Andamento[]; prazo: boolean }>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  async function ciente(p: PushItem) {
    const { error } = await decidirPush(supabase, p, "ciente", eu?.primeiro ?? null);
    setAviso(error ? "Erro: " + error.message : `Ciente · ${nomeCli(p)}. Fica no histórico quem decidiu e quando.`); reload();
  }
  async function abrirPend(p: PushItem, prazo: boolean) {
    const [{ data: caso }, { data: ands }] = await Promise.all([supabase.from("casos").select("*").eq("id", p.caso_id).maybeSingle(), supabase.from("caso_andamentos").select("*").eq("caso_id", p.caso_id).order("data", { ascending: false }).limit(30)]);
    if (!caso) { setAviso("Erro: caso não encontrado."); return; }
    setPend({ p, caso: caso as Caso, ands: (ands ?? []) as Andamento[], prazo });
  }
  const drawers = (<>
    {pend && <PendDrawer key={pend.p.id + (pend.prazo ? "p" : "d")} caso={pend.caso} origem={pend.p.capturados[0] as unknown as Andamento | undefined} andamentos={pend.ands} preset={pend.prazo ? { fatal: true } : undefined} onClose={() => setPend(null)} onSaved={async () => { await decidirPush(supabase, pend.p, pend.prazo ? "prazo" : "pendencia", eu?.primeiro ?? null); setPend(null); setAviso(`${pend.prazo ? "Prazo" : "Pendência"} criad${pend.prazo ? "o" : "a"} · decisão registrada.`); reload(); }} supabase={supabase} />}
    {aviso && <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-md text-xs font-medium text-on-acao shadow-2xl max-w-[92vw]" style={{ background: aviso.startsWith("Erro") ? "var(--alerta)" : "var(--ok)" }}>{aviso}</div>}
  </>);
  return { ciente, abrirPend, drawers };
}

/** Bloco da Home: "Acompanhamento push · eproc" — só o que exige decisão; o resto recolhido. */
export function HomePush({ eu, itens, reload, onHist }: { eu: Eu | null; itens: AcompItem[]; reload: () => void; onHist: (it: AcompItem) => void }) {
  const adv = !!eu && !eu.coord;
  const { lista, carregando } = usePush(itens);
  const { ciente, abrirPend, drawers } = useAcaoPush(eu, reload);
  const [mostrar, setMostrar] = useState(false);
  if (!itens.some(i => i.modo === "push")) return null;
  const dec = lista.filter(p => p.estado === "decidir"), feitos = lista.filter(p => p.estado === "decidido"), sem = lista.filter(p => p.estado === "sem_novidade"), fal = lista.filter(p => p.estado === "falhou"), agu = lista.filter(p => p.estado === "aguardando");
  const ultima = lista.map(p => p.regHoje?.criado_em).filter(Boolean).sort().slice(-1)[0];
  return (
    <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--acao)" }}>
      <div className="px-3.5 py-2.5 border-b flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--acao)", color: "var(--tag-blue-fg)", background: "var(--tag-blue-bg)" }}><span>Acompanhamento push · eproc{adv ? " · seus" : ""}</span><span className="ml-auto normal-case tracking-normal font-medium text-[11px]" style={{ color: "var(--text-secondary)" }}><b style={{ color: dec.length ? "var(--tag-blue-fg)" : undefined }}>{dec.length} a decidir</b> · {feitos.length} decidida{feitos.length === 1 ? "" : "s"} · {sem.length} sem novidade{fal.length ? <> · <b style={{ color: "var(--tag-red-fg)" }}>{fal.length} falhou</b></> : null}{ultima ? ` · rotina ${fmtHora(ultima)}` : agu.length ? " · aguardando a rotina" : ""} · <Link href="/acompanhamentos" style={{ color: "var(--acao)" }}>ver todas →</Link></span></div>
      {carregando ? <Empty t="Carregando…" /> : dec.length === 0 ? <Empty t={agu.length && !ultima ? "A rotina ainda não rodou hoje (11h e 12h)." : "Nada a decidir no push. "} /> : dec.map(p => <LinhaPush key={p.id} p={p} eu={eu} onDecidir={ciente} onPend={abrirPend} onHist={onHist} />)}
      {(feitos.length + sem.length + fal.length) > 0 && <div className="px-3.5 py-2 text-[11px] border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        {feitos.slice(0, 3).map(p => <span key={p.id} className="mr-3">✓ <b style={{ color: "var(--text-secondary)" }}>{nomeCli(p)}</b> · {p.regHoje?.decisao === "ciente" ? "ciente" : p.regHoje?.decisao} · {primeiro(p.regHoje?.decidido_por)}</span>)}
        {sem.length > 0 && <span className="mr-3"><b style={{ color: "var(--text-secondary)" }}>{sem.length}</b> sem novidade</span>}
        {fal.length > 0 && <span className="mr-3" style={{ color: "var(--tag-red-fg)" }}>{fal.map(p => nomeCli(p)).join(", ")} — rotina falhou; {fal.some(p => p.se_falhar !== "avisar") ? "foi para a lista da equipe hoje" : "só aviso"}</span>}
        <button onClick={() => setMostrar(v => !v)} style={{ color: "var(--acao)" }}>{mostrar ? "recolher" : "mostrar"}</button>
      </div>}
      {mostrar && [...feitos, ...fal, ...sem].map(p => <LinhaPush key={p.id} p={p} eu={eu} onDecidir={ciente} onPend={abrirPend} onHist={onHist} />)}
      {drawers}
    </div>
  );
}

/** Card lateral: a rotina hoje. */
export function CardRotinaHoje({ lista }: { lista: PushItem[] }) {
  const regs = lista.map(p => p.regHoje).filter(Boolean) as NonNullable<PushItem["regHoje"]>[];
  const horas = Array.from(new Set(regs.map(r => fmtHora(r.criado_em).slice(0, 2) + "h"))).sort();
  const n = (e: PushItem["estado"]) => lista.filter(p => p.estado === e).length;
  const buildup = lista.filter(p => p.integra_completa_pendente).length;
  return (
    <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-3.5 py-2.5 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Rotina eproc · hoje</div>
      <div className="px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {regs.length ? <>Rodou às <b style={{ color: "var(--text-primary)" }}>{horas.join(" e ")}</b> · próxima amanhã 11h<br /></> : <>Ainda não rodou hoje (11h e 12h, conta estagiários).<br /></>}
        {lista.length} em push · {regs.length} visitados · {n("decidir") + n("decidido")} capturados · {n("sem_novidade")} sem novidade · {n("falhou")} falhou · {n("decidido")} decididos
        {buildup > 0 && <><br /><span style={{ color: "var(--text-muted)" }}>Build-up: {buildup} caso{buildup === 1 ? "" : "s"} ainda sem íntegra completa (~{Math.ceil(buildup / 15)} dia{buildup > 15 ? "s" : ""})</span></>}
      </div>
    </div>
  );
}

/** Aba "Push eproc" da página Acompanhamentos. */
export function PainelPush({ eu, itens, carregando: carregandoItens, reload, onHist, onIncluir }: { eu: Eu | null; itens: AcompItem[]; carregando: boolean; reload: () => void; onHist: (it: AcompItem) => void; onIncluir: () => void }) {
  const { lista, carregando } = usePush(itens);
  const { ciente, abrirPend, drawers } = useAcaoPush(eu, reload);
  const [f, setF] = useState<"decidir" | "decidido" | "sem_novidade" | "falhou" | "diario" | "semanal" | "todos">("decidir"); const [fResp, setFResp] = useState("todos");
  const resp = Array.from(new Set(lista.map(i => primeiro(i.responsavel)))).sort();
  const n = (e: PushItem["estado"]) => lista.filter(p => p.estado === e).length;
  const vis = lista.filter(p => f === "todos" || (f === "diario" || f === "semanal" ? p.frequencia === f : p.estado === f)).filter(p => fResp === "todos" || norm(p.responsavel) === norm(fResp));
  const ordem: Record<PushItem["estado"], number> = { decidir: 0, falhou: 1, fila: 2, aguardando: 2, decidido: 3, lido: 4, sem_novidade: 4 };
  vis.sort((a, b) => ordem[a.estado] - ordem[b.estado] || nomeCli(a).localeCompare(nomeCli(b)));
  return (
    <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: "minmax(0,1fr) 290px" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="flex gap-1.5 flex-wrap">{([["decidir", "A decidir", n("decidir")], ["decidido", "Decididos hoje", n("decidido")], ["sem_novidade", "Sem novidade", n("sem_novidade")], ["falhou", "Falhou", n("falhou")], ["diario", "Diários", lista.filter(p => p.frequencia === "diario").length], ["semanal", "Semanais", lista.filter(p => p.frequencia === "semanal").length], ["todos", "Todos", lista.length]] as [typeof f, string, number][]).map(([k, l, c]) => <button key={k} onClick={() => setF(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chip(f === k)}>{l} <span className="opacity-70">{c}</span></button>)}</div>
          <select value={fResp} onChange={e => setFResp(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={bSec}><option value="todos">Todos os responsáveis</option>{resp.map(r => <option key={r}>{r}</option>)}</select>
          {eu?.coord && <button onClick={onIncluir} className="ml-auto px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Acompanhamento push</button>}
        </div>
        <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {carregandoItens || carregando ? <Empty t="Carregando…" /> : vis.length === 0 ? <Empty t={lista.length ? (f === "decidir" ? "Nada a decidir. " : "Nenhum caso com esse filtro.") : "Nenhum caso em modo Push ainda. Edite um acompanhamento eproc e marque “Push”, ou use “+ Acompanhamento push”."} /> : vis.map(p => <LinhaPush key={p.id} p={p} eu={eu} onDecidir={ciente} onPend={abrirPend} onHist={onHist} />)}
        </div>
        <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}><b>Push</b> = a rotina eproc (11h e 12h) abre o processo, baixa só o que a Central não tem e a Rotina A grava os andamentos; aqui o advogado <b>decide</b>: Ciente, + Pendência ou + Prazo. <b>Sem novidade</b> registra a consulta do dia sozinho. Se a rotina <b>falhar</b> (429, 2FA, sigilo), o caso volta a ser consulta manual naquele dia, na aba ao lado. O prazo de uma publicação continua nascendo no Alerte — o push só mostra o cruzamento.</div>
      </div>
      <div className="space-y-4">
        <CardRotinaHoje lista={lista} />
        <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Como entra aqui</div><div className="px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>No cadastro do acompanhamento, <b style={{ color: "var(--text-primary)" }}>Modo = Push</b> (sugerido quando o processo está em eproc). A rotina visita os diários todo dia útil, os semanais no dia marcado e qualquer um com publicação no Alerte hoje.</div></div>
      </div>
      {drawers}
    </div>
  );
}

export { falhouHoje };
