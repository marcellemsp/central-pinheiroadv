"use client";
import { ADVOGADOS } from "@/lib/equipe";
// Acompanhamento diário / semanal de processos (v49) — peças usadas em Acompanhamentos, página do caso, Home e Novo andamento.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AREAS } from "@/lib/areas";
import { AndDrawer } from "./CasoView";
import type { Caso } from "./ClienteView";
import { BlocoCertidoesHome } from "./Certidoes";
import {
  type Acomp, type AcompItem, type Registro, type Eu, type CasoMin,
  carregarAcomp, carregarEu, cumprimento, registrar, situacao, hojeISO, addDias, fmtCurto, fmtData, fmtHora, labelFreq, ondePadrao,
  ORDEM_ST, DIAS_SEM, primeiro, norm, proxUtil, semConsultaOk,
} from "@/lib/acompanhamento";
import { TagModo, HomePush } from "./Push";
import { ehEproc, falhouHoje, PALAVRAS_URGENTE_PADRAO, rotuloVisita, rodadaVisita } from "@/lib/push";

type SB = ReturnType<typeof createClient>;
const ADVS = ADVOGADOS;

/* ───────── estilos (mesmos do site) ───────── */
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const btn = "px-2.5 py-1 rounded text-[10.5px] font-medium whitespace-nowrap border";
const bPri = { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }; const bSec = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };
const bOk = { background: "var(--ok)", borderColor: "var(--ok)", color: "var(--on-acao)" }; const bDng = { background: "var(--alerta)", borderColor: "var(--alerta)", color: "var(--on-acao)" };
const chip = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const L = ({ t, req }: { t: string; req?: boolean }) => <label className={labelCls} style={{ color: "var(--text-secondary)" }}>{t}{req && <span style={{ color: "var(--alerta)" }}> *</span>}</label>;
const Sec = ({ t }: { t: string }) => <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{t}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-7 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Card = ({ title, action, children, red }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; red?: boolean }) => <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: red ? "var(--alerta)" : "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: red ? "var(--alerta)" : "var(--border)", color: red ? "var(--tag-red-fg)" : "var(--text-muted)", background: red ? "var(--tag-red-bg)" : undefined }}><span>{title}</span>{action && <span className="ml-auto normal-case tracking-normal font-medium text-[11px]">{action}</span>}</div>{children}</div>;
const AreaTag = ({ a }: { a?: string | null }) => { const A = AREAS.find(x => x.key === a); return A ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span> : null; };
export const TagFreq = ({ a }: { a: Pick<Acomp, "frequencia" | "dia_semana"> }) => <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={a.frequencia === "diario" ? { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" } : { background: "var(--tag-purple-bg)", color: "var(--tag-purple-fg)" }}>{labelFreq(a)}</span>;
const nomeCli = (it: AcompItem) => it.empresa?.nome_exibicao || it.empresa?.nome || "—";
const nomeCaso = (it: AcompItem) => it.caso ? `${it.caso.titulo}${it.caso.numero ? ` · ${it.caso.numero}` : ""}` : "—";

export function StatusSit({ it }: { it: AcompItem }) {
  const s = it.sit;
  if (s.st === "atras") return <div><span className="text-[10.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>atrasado há {s.atraso} dia{s.atraso > 1 ? "s" : ""} út{s.atraso > 1 ? "eis" : "il"}</span><div className="text-[10.5px] mt-1" style={{ color: "var(--tag-red-fg)" }}>não consultado: {s.abertos.slice(-4).map(fmtCurto).join(", ")}{s.devidoHoje ? " · hoje" : ""}</div></div>;
  if (s.st === "feito") return <span className="text-[10.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" }}>✓ consultado hoje</span>;
  if (s.st === "pend") return <span className="text-[10.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>a consultar hoje</span>;
  if (s.st === "pausado") return <span className="text-[10.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-gray-bg)", color: "var(--tag-gray-fg)" }}>pausado</span>;
  if (s.st === "sugerido") return <span className="text-[10.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>sugestão · aguardando aprovação</span>;
  return <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>próxima: {fmtCurto(s.prox)}</span>;
}
const ultTxt = (it: AcompItem) => { const u = it.sit.ultConsulta; if (!u) return "ainda sem consulta"; return `${u.data_ref === hojeISO() ? "hoje" : fmtCurto(u.data_ref)} · ${u.resultado === "teve_andamento" ? "teve andamento" : `sem novidade${u.data_ultimo_andamento ? ` · último andamento no tribunal: ${fmtData(u.data_ultimo_andamento).slice(0, 5)}` : ""}`}`; };

/* ───────── drawer base ───────── */
function Drawer({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (<>
    <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
    <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[560px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-5 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: "var(--border)" }}><div className="min-w-0"><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>{sub && <div className="text-[11px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{sub}</div>}</div><button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button></div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      <div className="px-5 py-3 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>{footer}</div>
    </aside>
  </>);
}
const Seg = ({ opts, v, set }: { opts: [string, string][]; v: string; set: (k: string) => void }) => <div className="flex gap-1.5 flex-wrap">{opts.map(([k, l]) => <button key={k} type="button" onClick={() => set(k)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={v === k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>)}</div>;
const Erro = ({ e }: { e: string | null }) => e ? <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{e}</div> : null;

/* ───────── dados ───────── */
export function useEu() {
  const [eu, setEu] = useState<Eu | null>(null);
  useEffect(() => { let on = true; carregarEu(createClient()).then(e => { if (on) setEu(e); }); return () => { on = false; }; }, []);
  return eu;
}
export function useAcomp(f: { casoId?: string; responsavel?: string; incluirSugestoes?: boolean; desligado?: boolean } = {}) {
  const [st, setSt] = useState<{ itens: AcompItem[]; feriados: Set<string>; carregando: boolean }>({ itens: [], feriados: new Set(), carregando: true });
  const chave = `${f.casoId ?? ""}|${f.responsavel ?? ""}|${f.incluirSugestoes ?? ""}|${f.desligado ? 1 : 0}`;
  const reload = useCallback(async () => {
    if (f.desligado) return;
    const r = await carregarAcomp(createClient(), f); setSt({ ...r, carregando: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => {
    reload(); if (f.desligado) return;
    const supabase = createClient();
    const ch = supabase.channel(`acomp-${chave}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "acompanhamentos" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "acompanhamento_registros" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return { ...st, reload };
}
async function carregarCasoCompleto(supabase: SB, casoId: string) { const { data } = await supabase.from("casos").select("*").eq("id", casoId).maybeSingle(); return data as Caso | null; }

/* ───────── ações de uma linha: Sem novidade · Teve andamento · Cobrar · Histórico ───────── */
function SemNovidadeBox({ it, eu, onClose, onDone }: { it: AcompItem; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient();
  const [d, setD] = useState(""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const ult = it.ultAndamento; const hoje = hojeISO();
  const maisNova = !!d && (!ult || d > ult); const futura = !!d && d > hoje;
  async function ok() {
    if (!d) { setErro("Informe a data do último andamento que aparece no sistema do tribunal."); return; }
    if (futura) { setErro("A data não pode ser futura."); return; }
    if (maisNova) { setErro(ult ? `Essa data é mais recente que o último andamento registrado aqui (${fmtData(ult)}). Então teve andamento: use “Teve andamento”.` : "Este caso ainda não tem nenhum andamento registrado na Central. Registre o último andamento em “Teve andamento”."); return; }
    setSaving(true); setErro(null);
    const { error } = await registrar(supabase, it, { tipo: "consulta", resultado: "sem_novidade", data_ultimo_andamento: d, autor: eu?.primeiro ?? null });
    setSaving(false); if (error) { setErro(error.message); return; }
    onDone(it.sit.abertos.length ? `Consulta registrada. Os dias ${it.sit.abertos.map(fmtCurto).join(", ")} continuam no histórico como não consultados.` : "Sem novidade · data do último andamento guardada no histórico.");
  }
  return (
    <div className="mt-2 px-3 py-2.5 rounded border text-xs" style={{ borderColor: "var(--border-strong, var(--text-secondary))", background: "var(--bg-page)" }}>
      <L t={`Data do último andamento que aparece no ${it.onde || "sistema"}`} req />
      <div className="flex flex-wrap gap-2 items-center"><input type="date" max={hoje} value={d} onChange={e => { setD(e.target.value); setErro(null); }} className={inputCls + " !w-auto"} style={inputStyle} autoFocus /><span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>Obrigatório. É o que mostra que o processo foi aberto. Último andamento registrado aqui: <b>{ult ? fmtData(ult) : "nenhum"}</b>.</span></div>
      {d && !futura && (maisNova ? <div className="mt-1.5 text-[11px]" style={{ color: "var(--tag-red-fg)" }}>Mais recente que o último andamento da Central — então teve andamento.</div> : <div className="mt-1.5 text-[11px]" style={{ color: "var(--ok)" }}>✓ Bate com o último andamento do sistema.</div>)}
      <Erro e={erro} />
      <div className="flex gap-2 justify-end mt-2"><button onClick={onClose} className={btn} style={bSec}>Cancelar</button><button onClick={ok} disabled={saving || maisNova || futura} className={btn + " disabled:opacity-50"} style={bOk}>{saving ? "Gravando…" : "✓ Confirmar sem novidade"}</button></div>
    </div>
  );
}

export function DrawerCobrar({ it, eu, onClose, onDone }: { it: AcompItem; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient();
  const perd = it.sit.abertos.map(fmtCurto).join(", ");
  const [msg, setMsg] = useState(`${primeiro(it.responsavel)}, a consulta de ${nomeCli(it)} · ${nomeCaso(it)} está atrasada há ${it.sit.atraso} dia${it.sit.atraso > 1 ? "s" : ""} út${it.sit.atraso > 1 ? "eis" : "il"} (${perd}). Consulte hoje${it.onde ? ` no ${it.onde}` : ""} e registre na Central.`);
  const [email, setEmail] = useState(true); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  async function enviar() {
    setSaving(true); setErro(null);
    const { data: us } = await supabase.from("usuarios").select("id, email, nome_completo");
    const dest = (us ?? []).find((u: any) => norm(u.nome_completo) === norm(it.responsavel)) as any;
    if (dest) await supabase.from("notificacoes").insert({ usuario_id: dest.id, tipo: "acompanhamento", titulo: `Consulta atrasada · ${nomeCli(it)}`, mensagem: msg });
    const { error } = await registrar(supabase, it, { tipo: "cobranca", autor: eu?.primeiro ?? null, obs: msg });
    setSaving(false); if (error) { setErro(error.message); return; }
    if (email && dest?.email) window.open(`mailto:${dest.email}?subject=${encodeURIComponent(`Consulta atrasada · ${nomeCli(it)} · ${it.caso?.numero ?? it.caso?.titulo ?? ""}`)}&body=${encodeURIComponent(msg + `\n\n${location.origin}/casos/${it.caso_id}`)}`, "_blank");
    onDone(`${primeiro(it.responsavel)} recebeu no sino${email && dest?.email ? " e o e-mail abriu pronto no seu e-mail" : ""}. Registrado no histórico.${dest ? "" : " (usuário não encontrado — só o histórico foi gravado)"}`);
  }
  return (
    <Drawer title="Cobrar consulta atrasada" sub={`${nomeCli(it)} · ${nomeCaso(it)}`} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Pode cobrar de novo amanhã se continuar atrasado.</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Cancelar</button><button onClick={enviar} disabled={saving || msg.trim().length < 5} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{saving ? "Enviando…" : "Enviar cobrança"}</button></div></>}>
      <div className="px-3 py-2 rounded border text-[12px] mb-3" style={{ borderColor: "var(--alerta)", background: "var(--tag-red-bg)", color: "var(--text-primary)" }}><b>{it.sit.atraso} dia{it.sit.atraso > 1 ? "s" : ""} út{it.sit.atraso > 1 ? "eis" : "il"} de atraso</b> · não consultado: {perd}{it.sit.cobrancaHoje ? <> · já cobrado hoje às <b>{fmtHora(it.sit.cobrancaHoje.criado_em)}</b></> : null}</div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Para" /><input className={inputCls} style={inputStyle} value={it.responsavel} readOnly /></div>
        <div><L t="Por onde" /><div className="flex flex-wrap gap-3 text-[12px] py-2" style={{ color: "var(--text-primary)" }}><label className="inline-flex items-center gap-1.5 opacity-80"><input type="checkbox" checked readOnly /> Sino</label><label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> E-mail</label></div></div>
      </div>
      <div className="mb-2.5"><L t="Mensagem" /><textarea className={inputCls + " min-h-[90px] resize-y"} style={inputStyle} value={msg} onChange={e => setMsg(e.target.value)} /></div>
      <Sec t="O que acontece ao enviar" />
      <div className="text-[11.5px] space-y-1" style={{ color: "var(--text-secondary)" }}>
        <div><b>1.</b> {primeiro(it.responsavel)} recebe a mensagem no sino da Central{email ? "; o e-mail abre pronto no seu e-mail para você enviar" : ""}.</div>
        <div><b>2.</b> Na Home dele, o item passa a mostrar “cobrado por {eu?.primeiro ?? "você"} às hh:mm”.</div>
        <div><b>3.</b> O histórico do acompanhamento registra a cobrança e ela conta em <b>Cumprimento</b>.</div>
        <div><b>4.</b> Não cria pendência e não muda prazo: o item segue atrasado até ele registrar a consulta.</div>
      </div>
      <Erro e={erro} />
    </Drawer>
  );
}

/** Linha do tempo: registros + dias não consultados (derivados). */
function linhaDoTempo(it: AcompItem) {
  const ev: { d: string; ts: string; ic: string; t: string; w: string; miss?: boolean }[] = [];
  it.regs.forEach(r => {
    const w = [r.autor, fmtHora(r.criado_em)].filter(Boolean).join(" · ");
if (r.tipo === "base_recebida") { ev.push({ d: r.data_ref, ts: r.criado_em, ic: "", t: r.obs || "Íntegra de base recebida", w: "Rotina A gravou a íntegra de base · sai da fila da cópia de base" }); return; }
// Rotina eproc (26/10/2026): rótulo pela visita do robô e todas as visitas do dia (hora/rodada · resultado)
if (r.origem === "rotina" && (r.tipo === "consulta" || r.tipo === "rotina_falhou" || r.tipo === "nao_consultado")) {
const vs = (Array.isArray(r.visitas) && r.visitas.length ? r.visitas : r.visita ? [r.visita] : []) as any[];
const rot = rotuloVisita(r.visita as any); const nov = r.tipo === "consulta" && r.resultado === "teve_andamento";
const t = "Rotina eproc: " + (nov ? `novidade${r.obs ? ` → ${r.obs}` : ""}${r.decisao ? ` · ${r.decisao === "ciente" ? "ciente" : r.decisao} por ${r.decidido_por ?? "?"}` : " · aguardando decisão"}` : rot.t) + (r.tipo === "rotina_falhou" ? " — consulta manual no dia" : "");
const det = vs.map(v => [rodadaVisita(v), rotuloVisita(v).t].filter(Boolean).join(" ")).join(" · ");
ev.push({ d: r.data_ref, ts: r.criado_em, ic: rot.ok ? "" : "", t, w: vs.length > 1 ? `${vs.length} visitas: ${det}` : det || w, miss: !rot.ok });
return;
}
    if (r.tipo === "consulta") ev.push({ d: r.data_ref, ts: r.criado_em, ic: r.origem === "rotina" ? "" : r.resultado === "teve_andamento" ? "" : "✓", t: r.resultado === "teve_andamento" ? `${r.origem === "rotina" ? "Rotina eproc: andamentos novos" : "Teve andamento"}${r.obs ? ` → ${r.obs}` : ""}${r.origem === "rotina" ? (r.decisao ? ` · ${r.decisao === "ciente" ? "ciente" : r.decisao} por ${r.decidido_por ?? "?"}` : " · aguardando decisão") : ""}` : `Sem novidade${r.data_ultimo_andamento ? ` · último andamento no tribunal: ${fmtData(r.data_ultimo_andamento).slice(0, 5)}` : ""}`, w });
    else ev.push({ d: r.data_ref, ts: r.criado_em, ic: { cobranca: "", criado: "", sugerido: "", aprovado: "✓", rejeitado: "✕", frequencia: "⇄", pausado: "", retomado: "▶", encerrado: "", editado: "✎", consulta: "✓", rotina_falhou: "", nao_consultado: "", base_recebida: "" }[r.tipo] ?? "•", t: ({ cobranca: "Cobrado", criado: "Acompanhamento criado", sugerido: "Sugestão enviada", aprovado: "Sugestão aprovada", rejeitado: "Sugestão rejeitada", frequencia: "Frequência alterada", pausado: "Pausado", retomado: "Retomado", encerrado: "Encerrado", editado: "Configuração alterada", rotina_falhou: "Rotina eproc falhou — consulta manual no dia" } as Record<string, string>)[r.tipo] + (r.obs && r.tipo !== "cobranca" ? ` · ${r.obs}` : ""), w: r.tipo === "cobranca" && r.obs ? `${w} · “${r.obs.slice(0, 90)}${r.obs.length > 90 ? "…" : ""}”` : w });
  });
  it.sit.perdidos.forEach(d => ev.push({ d, ts: d + "T23:59:00", ic: "✕", t: "Não consultado", w: "ninguém registrou a consulta no dia", miss: true }));
  if (it.sit.devidoHoje && it.sit.st !== "feito") ev.push({ d: hojeISO(), ts: hojeISO() + "T23:58:00", ic: "…", t: "A consultar hoje", w: "vira “não consultado” se ninguém registrar até o fim do dia", miss: true });
  return ev.sort((a, b) => (b.d + b.ts).localeCompare(a.d + a.ts));
}
export function Historico({ it }: { it: AcompItem }) {
  const ev = linhaDoTempo(it);
  if (!ev.length) return <div className="text-[11px] italic py-2" style={{ color: "var(--text-muted)" }}>Sem registros ainda.</div>;
  return <div>{ev.slice(0, 60).map((e, i) => <div key={i} className="grid gap-2 py-1.5 border-b last:border-b-0 text-[12px]" style={{ gridTemplateColumns: "74px 18px minmax(0,1fr)", borderColor: "var(--border)" }}><div className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>{fmtCurto(e.d)}</div><div className="text-center">{e.ic}</div><div className="min-w-0"><div style={{ color: e.miss ? "var(--tag-red-fg)" : "var(--text-primary)", fontWeight: e.miss ? 600 : 400 }}>{e.t}</div>{e.w && <div className="text-[10.5px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{e.w}</div>}</div></div>)}</div>;
}

/** Configuração + ações de coordenação (trocar frequência, responsável, pausar, encerrar). */
function Configuracao({ it, eu, onChanged, onEditar }: { it: AcompItem; eu: Eu | null; onChanged: (msg: string) => void; onEditar: () => void }) {
  const supabase = createClient(); const coord = !!eu?.coord;
  async function upd(patch: Partial<Acomp>, tipo: Registro["tipo"], obs: string, msg: string) {
    const { error } = await supabase.from("acompanhamentos").update({ ...patch, atualizado_em: new Date().toISOString() }).eq("id", it.id);
    if (error) { onChanged("Erro: " + error.message); return; }
    await registrar(supabase, it, { tipo, autor: eu?.primeiro ?? null, obs }); onChanged(msg);
  }
  const trocar = () => it.frequencia === "diario" ? upd({ frequencia: "semanal", dia_semana: it.dia_semana ?? 1 }, "frequencia", `diário → semanal (${DIAS_SEM[it.dia_semana ?? 1].toLowerCase()})`, "Agora é semanal.") : upd({ frequencia: "diario" }, "frequencia", "semanal → diário", "Agora é diário.");
  const rows: [string, React.ReactNode][] = [
    ["Frequência", <span key="f"><TagFreq a={it} /> <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{it.frequencia === "diario" ? "dias úteis" : ""} · desde {fmtData(it.inicio)}</span></span>],
    ["Quem consulta · onde", `${it.responsavel}${it.onde ? ` · ${it.onde}` : ""}`],
    ["O que olhar", it.o_que || "—"],
    ["Motivo · origem", `${it.motivo || "—"}${it.criado_por ? ` · criado por ${it.criado_por}` : ""}${it.sugerido_por ? ` · sugerido por ${it.sugerido_por}` : ""}${it.origem ? ` (${it.origem})` : ""}`],
    ["Até quando", it.ate ? `até ${fmtData(it.ate)}` : "até encerrar"],
  ];
  return (
    <Card title="Configuração" action={coord ? <button onClick={onEditar} style={{ color: "var(--acao)" }}>✎ editar</button> : undefined}>
      {rows.map(([k, v]) => <div key={k} className="px-3.5 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{k}</div><div className="text-xs mt-0.5 break-words" style={{ color: "var(--text-primary)" }}>{v}</div></div>)}
      {coord && it.status !== "sugerido" && <div className="px-3.5 py-2.5 flex flex-wrap gap-1.5 border-t" style={{ borderColor: "var(--border)" }}>
        <button onClick={trocar} className={btn} style={bSec}>{it.frequencia === "diario" ? "→ Semanal" : "→ Diário"}</button>
        {it.status === "pausado" ? <button onClick={() => upd({ status: "ativo" }, "retomado", "", "Acompanhamento retomado.")} className={btn} style={bSec}>▶ Retomar</button> : <button onClick={() => upd({ status: "pausado" }, "pausado", "", "Acompanhamento pausado.")} className={btn} style={bSec}>Pausar</button>}
        <button onClick={() => { if (window.confirm("Encerrar este acompanhamento? O histórico fica guardado.")) upd({ status: "encerrado" }, "encerrado", "", "Acompanhamento encerrado."); }} className={btn} style={bSec}>Encerrar</button>
      </div>}
    </Card>
  );
}

export function DrawerHistorico({ it, eu, onClose, onChanged, onEditar }: { it: AcompItem; eu: Eu | null; onClose: () => void; onChanged: (msg: string) => void; onEditar: () => void }) {
  return (
    <Drawer title="Histórico do acompanhamento" sub={`${nomeCli(it)} · ${nomeCaso(it)}`} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Cada dia fica registrado, com ou sem andamento.</div><Link href={`/casos/${it.caso_id}`} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Abrir caso ↗</Link></>}>
      <div className="flex flex-wrap gap-1.5 items-center mb-2"><TagFreq a={it} /><AreaTag a={it.caso?.area} /><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>resp. {it.responsavel}{it.onde ? ` · onde: ${it.onde}` : ""}</span></div>
      {it.o_que && <div className="text-[12px] mb-3" style={{ color: "var(--text-primary)" }}>{it.o_que}</div>}
      <div className="mb-3"><StatusSit it={it} /></div>
      <Sec t="Linha do tempo · inclusive dias sem novidade" />
      <Historico it={it} />
      <div className="mt-4"><Configuracao it={it} eu={eu} onChanged={onChanged} onEditar={onEditar} /></div>
    </Drawer>
  );
}

/* ───────── Incluir / sugerir / ajustar / editar acompanhamento ───────── */
export type IncluirModo = "criar" | "sugerir" | "ajustar" | "editar";
export function DrawerIncluir({ casoId, inicial, origem, eu, onClose, onDone }: { casoId?: string; inicial?: AcompItem; origem?: string; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient(); const coord = !!eu?.coord;
  const modo: IncluirModo = inicial ? (inicial.status === "sugerido" && coord ? "ajustar" : "editar") : coord ? "criar" : "sugerir";
  const [caso, setCaso] = useState<CasoMin | null>(inicial?.caso ?? null);
  const [emps, setEmps] = useState<{ id: string; nome: string; nome_exibicao: string | null }[]>([]); const [empId, setEmpId] = useState(""); const [casosEmp, setCasosEmp] = useState<CasoMin[]>([]);
  const [d, setD] = useState<Record<string, any>>(() => inicial ? { frequencia: inicial.frequencia, dia_semana: inicial.dia_semana ?? 1, responsavel: inicial.responsavel, onde: inicial.onde ?? "", o_que: inicial.o_que ?? "", motivo: inicial.motivo ?? "", ate: inicial.ate ?? "", comeca: "hoje", modo: inicial.modo ?? "humano", furar: inicial.furar_fila_alerte ?? true, palavras: (inicial.palavras_urgente ?? []).join(", "), integra: inicial.integra_completa_pendente === false ? "tenho" : "baixar", se_falhar: inicial.se_falhar ?? "manual", link: inicial.link_consulta ?? "" } : { frequencia: "diario", dia_semana: 1, responsavel: "", onde: "", o_que: "", motivo: "", ate: "", comeca: "amanha", modo: "humano", furar: true, palavras: "", integra: "baixar", se_falhar: "manual", link: "" });
  const set = (k: string, v: any) => setD(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (casoId && !caso) supabase.from("casos").select("id, titulo, numero, area, empresa_id, advogado, orgao, dados").eq("id", casoId).maybeSingle().then(({ data }) => { if (data) { setCaso(data as CasoMin); setD(p => ({ ...p, responsavel: p.responsavel || (data as any).advogado || (coord ? "" : eu?.primeiro ?? ""), onde: p.onde || ondePadrao(data as CasoMin), modo: inicial ? p.modo : (ehEproc(p.onde || ondePadrao(data as CasoMin), (data as any).numero) ? "push" : "humano") })); } });
    if (!casoId && !inicial) supabase.from("empresas").select("id, nome, nome_exibicao").eq("ativo", true).order("nome").then(({ data }) => setEmps((data ?? []) as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);
  useEffect(() => { if (!coord && eu && !d.responsavel) set("responsavel", eu.primeiro); /* advogado sugere para si */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eu]);
  async function escolherEmp(id: string) { setEmpId(id); setCaso(null); const { data } = await supabase.from("casos").select("id, titulo, numero, area, empresa_id, advogado, orgao, dados").eq("empresa_id", id).eq("ativo", true).order("titulo"); setCasosEmp((data ?? []) as CasoMin[]); }
  const podePush = ehEproc(d.onde, caso?.numero); const push = podePush && d.modo === "push";
  const ok = !!caso && !!d.responsavel && (d.frequencia === "diario" || !!d.dia_semana);
  async function salvar() {
    if (!ok || !caso) return; setSaving(true); setErro(null);
    const hoje = hojeISO();
    const inicio = d.comeca === "hoje" ? hoje : addDias(hoje, 1);
    const base = { frequencia: d.frequencia, dia_semana: d.frequencia === "semanal" ? Number(d.dia_semana) : null, responsavel: d.responsavel, onde: d.onde.trim() || null, o_que: d.o_que.trim() || null, motivo: d.motivo.trim() || (d.frequencia === "diario" ? null : "atualização da base"), ate: d.ate || null, modo: push ? "push" : "humano", furar_fila_alerte: !!d.furar, palavras_urgente: String(d.palavras ?? "").split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean), integra_completa_pendente: d.integra !== "tenho", se_falhar: d.se_falhar === "avisar" ? "avisar" : "manual", link_consulta: String(d.link ?? "").trim() || null };
    let res: any; let msg = "";
    if (modo === "editar" && inicial) {
      res = await supabase.from("acompanhamentos").update({ ...base, atualizado_em: new Date().toISOString() }).eq("id", inicial.id).select().single();
      if (!res.error) await registrar(supabase, inicial, { tipo: inicial.status === "sugerido" ? "sugerido" : "editado", autor: eu?.primeiro ?? null, obs: labelFreq(base as any) });
      msg = "Configuração salva.";
    } else if (modo === "ajustar" && inicial) {
      res = await supabase.from("acompanhamentos").update({ ...base, status: "ativo", inicio, aprovado_por: eu?.primeiro ?? null, aprovado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", inicial.id).select().single();
      if (!res.error) await registrar(supabase, inicial, { tipo: "aprovado", autor: eu?.primeiro ?? null, obs: `ajustado · ${labelFreq(base as any)}` });
      msg = `Acompanhamento criado a partir da sugestão de ${inicial.sugerido_por ?? "advogado"}.`;
    } else {
      res = await supabase.from("acompanhamentos").insert({ ...base, caso_id: caso.id, empresa_id: caso.empresa_id, origem: origem ?? null, inicio, status: modo === "sugerir" ? "sugerido" : "ativo", criado_por: modo === "criar" ? eu?.primeiro ?? null : null, sugerido_por: modo === "sugerir" ? eu?.primeiro ?? null : null }).select().single();
      if (!res.error) await registrar(supabase, res.data, { tipo: modo === "sugerir" ? "sugerido" : "criado", autor: eu?.primeiro ?? null, obs: `${labelFreq(base as any)}${origem ? ` · a partir de ${origem}` : ""}` });
      msg = modo === "sugerir" ? "Sugestão enviada. A coordenação aprova em Aprovações." : `Acompanhamento criado. Aparece para ${d.responsavel} a partir de ${d.comeca === "hoje" ? "hoje" : "amanhã"}.`;
    }
    setSaving(false);
    if (res.error) { setErro(/duplicate|unique/i.test(res.error.message) ? "Este processo já tem acompanhamento (ou sugestão) em aberto." : res.error.message); return; }
    onDone(msg);
  }
  const titulo = { criar: "Incluir no acompanhamento", sugerir: "Sugerir acompanhamento", ajustar: "Ajustar sugestão e aceitar", editar: "Editar acompanhamento" }[modo];
  const sub = { criar: `Coordenação cria direto${origem ? ` · a partir de ${origem}` : ""}`, sugerir: "Você sugere · a coordenação aprova em Aprovações", ajustar: `Sugestão de ${inicial?.sugerido_por ?? "advogado"}`, editar: caso ? `${caso.titulo}${caso.numero ? ` · ${caso.numero}` : ""}` : "" }[modo];
  return (
    <Drawer title={titulo} sub={sub} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{modo === "sugerir" ? "Vai para Aprovações da coordenação." : "* obrigatórios"}</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Cancelar</button><button onClick={salvar} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Salvando…" : modo === "sugerir" ? "Enviar sugestão" : modo === "ajustar" ? "✓ Aceitar" : "Salvar"}</button></div></>}>
      {!casoId && !inicial ? (<div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Cliente" req /><select className={inputCls} style={inputStyle} value={empId} onChange={e => escolherEmp(e.target.value)} autoFocus><option value="">— escolher cliente</option>{emps.map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select></div>
        <div><L t="Caso" req /><select className={inputCls} style={inputStyle} value={caso?.id ?? ""} onChange={e => { const c = casosEmp.find(x => x.id === e.target.value) ?? null; setCaso(c); if (c) setD(p => ({ ...p, responsavel: p.responsavel || c.advogado || "", onde: p.onde || ondePadrao(c), modo: ehEproc(p.onde || ondePadrao(c), c.numero) ? "push" : "humano" })); }} disabled={!empId}><option value="">— escolher caso</option>{casosEmp.map(c => <option key={c.id} value={c.id}>{AREAS.find(a => a.key === c.area)?.icon} {c.titulo}{c.numero ? ` · ${c.numero}` : ""}</option>)}</select></div>
      </div>) : <div className="mb-2.5"><L t="Caso" /><div className="text-[12.5px] py-1" style={{ color: "var(--text-primary)" }}>{caso ? <>{caso.titulo}{caso.numero ? ` · ${caso.numero}` : ""} <AreaTag a={caso.area} /></> : "Carregando…"}</div></div>}
      <div className="mb-2.5"><L t="Modo" req />
<div className="grid grid-cols-2 gap-2">
{([["push", "Push — a rotina consulta", "A rotina eproc visita o processo, baixa os eventos novos e a Central grava os andamentos. O advogado só decide: Ciente, + Pendência ou + Prazo."], ["humano", "Humano — a pessoa consulta", "O advogado abre o processo na frequência marcada e registra Sem novidade / Teve andamento. A máquina não faz nada aqui."]] as const).map(([k, tt, s]) => { const off = k === "push" && !podePush; const on = (podePush ? d.modo : "humano") === k; return <button key={k} type="button" disabled={off} onClick={() => set("modo", k)} className="text-left rounded border px-3 py-2 disabled:opacity-50" style={{ background: "var(--bg-page)", borderColor: on ? "var(--acao)" : "var(--border)", boxShadow: on ? "0 0 0 2px var(--acao-tint)" : undefined }}><div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{tt}</div><div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{s}</div>{off && <div className="text-[10.5px] mt-1" style={{ color: "var(--tag-amber-fg)" }}>Só para processos em eproc{d.onde ? ` — “${d.onde}” não tem rotina` : " — preencha “Onde consultar”"}.</div>}</button>; })}
</div>
<div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>{podePush ? "Sugerido Push porque o processo está em eproc. Humano continua possível (ex.: processo sigiloso que a rotina não acessa)." : "Push liga sozinho quando houver rotina para este sistema (hoje: só eproc)."}</div>
</div>
<div className="mb-2.5"><L t="Frequência" req /><Seg opts={[["diario", "Diário"], ["semanal", "Semanal"]]} v={d.frequencia} set={v => set("frequencia", v)} /><div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>{d.frequencia === "diario" ? "Todo dia útil (usa os feriados de Configurações). Para risco ou espera: liminar, bloqueio, decisão iminente." : "Uma vez por semana, no dia escolhido. Para manter a base atualizada."}</div></div>
      {d.frequencia === "semanal" && <div className="mb-2.5"><L t="Dia da semana" req /><Seg opts={[["1", "Segunda"], ["2", "Terça"], ["3", "Quarta"], ["4", "Quinta"], ["5", "Sexta"]]} v={String(d.dia_semana)} set={v => set("dia_semana", Number(v))} /></div>}
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t={push ? "Quem decide" : "Quem consulta"} req />{coord ? <select className={inputCls} style={inputStyle} value={d.responsavel} onChange={e => set("responsavel", e.target.value)}><option value="">—</option>{ADVS.map(a => <option key={a}>{a}</option>)}</select> : <input className={inputCls} style={inputStyle} value={d.responsavel ? `${d.responsavel} (eu)` : ""} readOnly />}</div>
        <div><L t="Onde consultar" /><input className={inputCls} style={inputStyle} value={d.onde} onChange={e => set("onde", e.target.value)} placeholder="Ex.: eProc · TJRJ, e-CAC, SEI-RJ" list="acomp-onde" /><datalist id="acomp-onde">{["e-SAJ · TJSP", "eProc · TJRJ", "eProc · TRF2", "PJe", "e-CAC", "SEI-RJ", "DOM-SP"].map(o => <option key={o} value={o} />)}</datalist></div>
      </div>
      <div className="mb-2.5"><L t="O que olhar" /><textarea className={inputCls + " min-h-[60px] resize-y"} style={inputStyle} value={d.o_que} onChange={e => set("o_que", e.target.value)} placeholder="Ex.: ver se saiu decisão sobre o efeito suspensivo do agravo" /></div>
{push && <div className="rounded border px-3 py-2.5 mb-2.5" style={{ borderColor: "var(--acao)", background: "var(--bg-page)" }}>
<div className="grid grid-cols-2 gap-2.5">
<div><L t="Íntegra completa" /><Seg opts={[["baixar", "Baixar na próxima rodada"], ["tenho", "Já tenho em 00. Cópias"]]} v={d.integra} set={v => set("integra", v)} /></div>
<div><L t="Se a rotina falhar no dia" /><Seg opts={[["manual", "Vira consulta manual"], ["avisar", "Só avisar"]]} v={d.se_falhar} set={v => set("se_falhar", v)} /></div>
</div>
<div className="mt-2.5"><L t="Marcar como urgente quando aparecer" /><input className={inputCls} style={inputStyle} value={d.palavras} onChange={e => set("palavras", e.target.value)} placeholder="penhora, bloqueio, SISBAJUD — separe por vírgula" /><div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>Padrão em todo caso Push: {PALAVRAS_URGENTE_PADRAO.join(", ")}. Andamento capturado com essas palavras entra em Atenção imediata.</div></div>
<label className="flex items-start gap-2 text-[12px] mt-2.5 cursor-pointer" style={{ color: "var(--text-primary)" }}><input type="checkbox" checked={!!d.furar} onChange={e => set("furar", e.target.checked)} className="mt-0.5" /><span>Também visitar quando houver publicação no Alerte, mesmo fora da frequência <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>(fura a fila do dia)</span></span></label>
</div>}
{!push && <div className="mb-2.5"><L t="Link do processo (opcional)" /><input className={inputCls} style={inputStyle} value={d.link} onChange={e => set("link", e.target.value)} placeholder="https://… — vira o botão “Abrir no sistema” na linha" /></div>}
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div><L t="Motivo" /><input className={inputCls} style={inputStyle} value={d.motivo} onChange={e => set("motivo", e.target.value)} placeholder={d.frequencia === "diario" ? "esperando liminar" : "atualização da base"} /></div>
        <div><L t="Até quando" /><input type="date" className={inputCls} style={inputStyle} value={d.ate} onChange={e => set("ate", e.target.value)} /><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>vazio = até encerrar</div></div>
        {modo !== "editar" && modo !== "sugerir" ? <div><L t="Começa" /><Seg opts={[["hoje", "Hoje"], ["amanha", "Amanhã"]]} v={d.comeca} set={v => set("comeca", v)} /></div> : <div />}
      </div>
      <div className="rounded px-3 py-2 text-[11.5px] mt-2" style={{ background: "var(--bg-page)", color: "var(--text-secondary)" }}>Aparece na Home de quem consulta e em Acompanhamentos. Se não for registrado no dia, fica em vermelho todos os dias até ser feito, e cada dia perdido entra no histórico como <b>não consultado</b>.</div>
      <Erro e={erro} />
    </Drawer>
  );
}

/* ───────── orquestrador de drawers (usado pela página, caso e Home) ───────── */
type Dr = null | { k: "hist" | "cobrar" | "editar"; it: AcompItem } | { k: "and"; it: AcompItem; caso: Caso } | { k: "incluir"; casoId?: string; origem?: string };
export function useAcaoAcomp(eu: Eu | null, reload: () => void) {
  const [dr, setDr] = useState<Dr>(null); const [sn, setSn] = useState<string | null>(null); const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  const supabase = createClient();
  const feito = (m: string) => { setDr(null); setSn(null); setAviso(m); reload(); };
  const acoes = {
    semNovidade: (it: AcompItem) => setSn(s => s === it.id ? null : it.id),
    teve: async (it: AcompItem) => { const c = await carregarCasoCompleto(supabase, it.caso_id); if (c) setDr({ k: "and", it, caso: c }); },
    cobrar: (it: AcompItem) => setDr({ k: "cobrar", it }),
    hist: (it: AcompItem) => setDr({ k: "hist", it }),
    editar: (it: AcompItem) => setDr({ k: "editar", it }),
    incluir: (casoId?: string, origem?: string) => setDr({ k: "incluir", casoId, origem }),
    trocar: async (it: AcompItem) => {
      const patch: Partial<Acomp> = it.frequencia === "diario" ? { frequencia: "semanal", dia_semana: it.dia_semana ?? 1 } : { frequencia: "diario" };
      const { error } = await supabase.from("acompanhamentos").update({ ...patch, atualizado_em: new Date().toISOString() }).eq("id", it.id);
      if (error) { setAviso("Erro: " + error.message); return; }
      await registrar(supabase, it, { tipo: "frequencia", autor: eu?.primeiro ?? null, obs: it.frequencia === "diario" ? "diário → semanal" : "semanal → diário" }); feito(`${it.caso?.titulo ?? "Caso"} agora é ${it.frequencia === "diario" ? "semanal" : "diário"}. Fica no histórico quem mudou e quando.`);
    },
  };
  const renderSN = (it: AcompItem) => sn === it.id ? <SemNovidadeBox it={it} eu={eu} onClose={() => setSn(null)} onDone={feito} /> : null;
  const drawers = (<>
    {dr?.k === "hist" && <DrawerHistorico it={dr.it} eu={eu} onClose={() => setDr(null)} onChanged={feito} onEditar={() => setDr({ k: "editar", it: dr.it })} />}
    {dr?.k === "cobrar" && <DrawerCobrar it={dr.it} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "editar" && <DrawerIncluir inicial={dr.it} casoId={dr.it.caso_id} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "incluir" && <DrawerIncluir casoId={dr.casoId} origem={dr.origem} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "and" && <AndDrawer caso={dr.caso} consultaDe={dr.it} onClose={() => setDr(null)} onSaved={() => feito(`Andamento salvo · consulta registrada.${dr.it.sit.abertos.length ? ` Os dias ${dr.it.sit.abertos.map(fmtCurto).join(", ")} seguem como não consultados no histórico.` : ""}`)} onCriarPend={() => feito("Andamento salvo · consulta registrada. Crie a pendência pela página do caso.")} supabase={supabase} />}
    {aviso && <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-md text-xs font-medium text-on-acao shadow-2xl max-w-[92vw]" style={{ background: aviso.startsWith("Erro") ? "var(--alerta)" : "var(--ok)" }}>{aviso}</div>}
  </>);
  return { acoes, renderSN, drawers };
}

/* ───────── linha de consulta (Home e página) ───────── */
export function LinhaConsulta({ it, adv, acoes, sn, mostrarResp = true }: { it: AcompItem; adv: boolean; acoes: ReturnType<typeof useAcaoAcomp>["acoes"]; sn: React.ReactNode; mostrarResp?: boolean }) {
  const late = it.sit.st === "atras"; const aberto = it.sit.st === "atras" || it.sit.st === "pend";
  return (
    <div className="px-3.5 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)", background: late ? "var(--tag-red-bg)" : undefined, opacity: it.sit.st === "feito" ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
          <div className="text-[12.5px] break-words"><b style={{ color: "var(--text-primary)" }}>{nomeCli(it)}</b> · <Link href={`/casos/${it.caso_id}`} style={{ color: "var(--text-primary)" }}>{nomeCaso(it)}</Link> <span className="ml-1 inline-flex gap-1 flex-wrap align-middle"><TagFreq a={it} /><TagModo modo={it.modo} /><AreaTag a={it.caso?.area} /></span></div>
          <div className="text-[11px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{mostrarResp && <><b style={{ color: "var(--text-secondary)" }}>{it.responsavel}</b> · </>}{it.onde ? `onde: ${it.onde} · ` : ""}último andamento no sistema: {it.ultAndamento ? fmtData(it.ultAndamento).slice(0, 5) : "nenhum"}</div>
          {it.o_que && <div className="text-[11.5px] mt-1 break-words" style={{ color: "var(--text-primary)" }}>{it.o_que}</div>}
          {it.sit.cobrancaHoje && <div className="text-[11px] mt-1 font-semibold" style={{ color: "var(--tag-red-fg)" }}>cobrado por {it.sit.cobrancaHoje.autor ?? "coordenação"} às {fmtHora(it.sit.cobrancaHoje.criado_em)}</div>}
        </div>
        <div className="shrink-0"><StatusSit it={it} /></div>
        <div className="flex gap-1.5 flex-wrap shrink-0">
          {aberto && it.status === "ativo" && <><button onClick={() => acoes.semNovidade(it)} className={btn} style={bOk}>Sem novidade</button><button onClick={() => acoes.teve(it)} className={btn} style={bPri}>Teve andamento</button></>}
          {!adv && late && <button onClick={() => acoes.cobrar(it)} className={btn} style={bDng}>Cobrar</button>}
          <button onClick={() => acoes.hist(it)} className={btn} style={bSec}>Histórico</button>
        </div>
      </div>
      {sn}
    </div>
  );
}

/* ───────── aba "Acompanhamentos diários / semanais" da página Acompanhamentos ───────── */
export function PainelAcompanhamentos({ eu, onContagem }: { eu: Eu | null; onContagem?: (n: { total: number; atras: number }) => void }) {
  const { itens, feriados, carregando, reload } = useAcomp({});
  const { acoes, renderSN, drawers } = useAcaoAcomp(eu, reload);
  const [f, setF] = useState<"todos" | "atras" | "diario" | "semanal">("todos"); const [fResp, setFResp] = useState("todos"); const [fArea, setFArea] = useState("todas");
  const vivos = itens.filter(i => i.status !== "sugerido"); const sugs = itens.filter(i => i.status === "sugerido"); const manuais = vivos.filter(i => i.modo !== "push" || falhouHoje(i));
  useEffect(() => { onContagem?.({ total: manuais.length, atras: manuais.filter(i => i.sit.st === "atras").length }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);
  const lista = manuais.filter(i => f === "todos" || (f === "atras" ? i.sit.st === "atras" : i.frequencia === f)).filter(i => fResp === "todos" || norm(i.responsavel) === norm(fResp)).filter(i => fArea === "todas" || i.caso?.area === fArea).sort((a, b) => ORDEM_ST[a.sit.st] - ORDEM_ST[b.sit.st] || nomeCli(a).localeCompare(nomeCli(b)));
  const resp = Array.from(new Set(vivos.map(i => primeiro(i.responsavel)))).sort();
  const cump = useMemo(() => cumprimento(vivos, feriados), [vivos, feriados]);
  const nAtr = manuais.filter(i => i.sit.st === "atras").length; const nPush = vivos.filter(i => i.modo === "push").length;
  return (
    <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: "minmax(0,1fr) 290px" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="flex gap-1.5 flex-wrap">{([["todos", "Todos", manuais.length], ["atras", "Atrasados", nAtr], ["diario", "Diários", manuais.filter(i => i.frequencia === "diario").length], ["semanal", "Semanais", manuais.filter(i => i.frequencia === "semanal").length]] as [typeof f, string, number][]).map(([k, l, n]) => <button key={k} onClick={() => setF(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chip(f === k)}>{l} <span className="opacity-70">{n}</span></button>)}</div>
          <select value={fResp} onChange={e => setFResp(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={bSec}><option value="todos">Todos os responsáveis</option>{resp.map(r => <option key={r}>{r}</option>)}</select>
          <select value={fArea} onChange={e => setFArea(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={bSec}><option value="todas">Todas as áreas</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
          <button onClick={() => acoes.incluir(undefined, "página Acompanhamentos")} className="ml-auto px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Acompanhamento</button>
        </div>
        <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {carregando ? <Empty t="Carregando…" /> : lista.length === 0 ? <Empty t={manuais.length ? "Nenhum acompanhamento com esses filtros." : "Nenhum processo em acompanhamento ainda. Inclua pela página do caso, ao registrar um andamento ou aqui em “+ Acompanhamento”."} /> : lista.map(it => <div key={it.id}><LinhaConsulta it={it} adv={!eu?.coord} acoes={acoes} sn={renderSN(it)} />{eu?.coord && <div className="px-3.5 pb-2 -mt-1 flex gap-1.5 flex-wrap" style={{ background: it.sit.st === "atras" ? "var(--tag-red-bg)" : undefined }}><button onClick={() => acoes.trocar(it)} className={btn} style={bSec}>{it.frequencia === "diario" ? "→ Semanal" : "→ Diário"}</button><Link href={`/casos/${it.caso_id}`} className={btn} style={bSec}>Abrir caso</Link></div>}</div>)}
        </div>
        <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{nPush > 0 && <><b>Esta lista é só do que a pessoa consulta</b> (PJe, DCP, SEI, Comprot, e-SAJ…). Os {nPush} casos em <b>Push</b> ficam na aba ao lado e só aparecem aqui no dia em que a rotina falha. </>}<b>Diário</b> = todo dia útil (usa os feriados de Configurações). <b>Semanal</b> = no dia escolhido. Se não for feito no dia, o item não some: continua aqui e na Home do advogado, em vermelho, contando os dias úteis de atraso, até alguém registrar. Cada dia perdido fica no histórico como <b>não consultado</b>.</div>
      </div>
      <div className="space-y-4">
        <Card title="Cumprimento · últimos 7 dias úteis">{cump.length === 0 ? <Empty t="Sem dados ainda." /> : cump.map(c => <div key={c.nome} className="px-3.5 py-2 border-b last:border-b-0 text-xs" style={{ borderColor: "var(--border)" }}>
{c.total > 0 && <div className="grid gap-2 items-center" style={{ gridTemplateColumns: "70px minmax(0,1fr) 40px" }}><div><b style={{ color: "var(--text-primary)" }}>{c.nome}</b><div className="text-[10px]" style={{ color: "var(--text-muted)" }}>consultas {c.feitos} de {c.total}{c.cobr ? ` · ${c.cobr} cobr.` : ""}</div></div><div className="h-1.5 rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><div className="h-full" style={{ width: `${c.pct}%`, background: c.pct >= 90 ? "var(--ok)" : c.pct >= 75 ? "var(--atencao)" : "var(--alerta)" }} /></div><div className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{c.pct}%</div></div>}
{c.pushTotal > 0 && <div className="grid gap-2 items-center" style={{ gridTemplateColumns: "70px minmax(0,1fr) 40px", marginTop: c.total > 0 ? 4 : 0 }}><div>{c.total === 0 && <b style={{ color: "var(--text-primary)" }}>{c.nome}</b>}<div className="text-[10px]" style={{ color: "var(--tag-blue-fg)" }}>decisões push {c.pushFeitas} de {c.pushTotal}</div></div><div className="h-1.5 rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><div className="h-full" style={{ width: `${c.pushPct}%`, background: "var(--acao)" }} /></div><div className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{c.pushPct}%</div></div>}
{c.total === 0 && c.pushTotal === 0 && <div><b style={{ color: "var(--text-primary)" }}>{c.nome}</b> <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>nada devido no período</span></div>}
</div>)}</Card>
        <Card title="Sugestões dos advogados" action={<Link href="/home" style={{ color: "var(--acao)" }}>ver em Aprovações →</Link>}>{sugs.length === 0 ? <Empty t="Nenhuma sugestão pendente." /> : sugs.map(s => <div key={s.id} className="px-3.5 py-2.5 border-b last:border-b-0 text-xs" style={{ borderColor: "var(--border)" }}><div style={{ color: "var(--text-muted)" }}><b style={{ color: "var(--text-secondary)" }}>{s.sugerido_por}</b> · {new Date(s.criado_em).toLocaleDateString("pt-BR")}</div><div className="mt-0.5" style={{ color: "var(--text-primary)" }}>{nomeCli(s)} · {s.caso?.titulo} <TagFreq a={s} /></div>{s.o_que && <div className="mt-0.5" style={{ color: "var(--text-secondary)" }}>{s.o_que}</div>}</div>)}</Card>
        <Card title="Como entra aqui"><div className="px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>Coordenação</b> cria direto: página do caso (aba Acompanhamento), Novo andamento ou aqui.<br /><b style={{ color: "var(--text-primary)" }}>Advogado</b> sugere pelos mesmos lugares → cai em Aprovações na Home da coordenação.</div></Card>
      </div>
      {drawers}
    </div>
  );
}

/* ───────── página do caso ───────── */
export function useAcompCaso(casoId: string) {
  const { itens, carregando, reload } = useAcomp({ casoId });
  const it = itens.find(i => i.status !== "sugerido") ?? itens[0] ?? null;
  const andIds = useMemo(() => new Set(itens.flatMap(i => i.regs.filter(r => r.andamento_id).map(r => r.andamento_id!))), [itens]);
  return { it, andIds, carregando, reload };
}
export function SeloAcomp({ it }: { it: AcompItem | null }) {
  if (!it || it.status === "sugerido") return null;
  return <span className="ml-1.5 align-middle"><TagFreq a={it} />{it.status === "pausado" && <span className="ml-1 text-[9.5px]" style={{ color: "var(--text-muted)" }}></span>}</span>;
}
export function AbaAcompanhamentoCaso({ casoId, dado, eu }: { casoId: string; dado: ReturnType<typeof useAcompCaso>; eu: Eu | null }) {
  const { it, carregando, reload } = dado;
  const { acoes, renderSN, drawers } = useAcaoAcomp(eu, reload);
  if (carregando) return <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><Empty t="Carregando…" /></div>;
  if (!it) return (<>
    <div className="rounded-md border px-5 py-8 text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[13px]" style={{ color: "var(--text-primary)" }}>Este processo não está em acompanhamento.</div>
      <div className="text-[11.5px] mt-1" style={{ color: "var(--text-muted)" }}>Diário para risco ou espera (liminar, bloqueio, decisão iminente) · Semanal para manter a base atualizada.</div>
      <button onClick={() => acoes.incluir(casoId, "página do caso")} className="mt-3 px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>{eu?.coord ? "Acompanhar este processo" : "Sugerir acompanhamento"}</button>
    </div>{drawers}</>);
  return (
    <div className="space-y-4">
      <Card title={<>Situação · {fmtCurto(hojeISO())}</>} red={it.sit.st === "atras"}>
        <div className="px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2"><StatusSit it={it} />{it.sit.cobrancaHoje && <span className="text-[11px] font-semibold" style={{ color: "var(--tag-red-fg)" }}>cobrado às {fmtHora(it.sit.cobrancaHoje.criado_em)}</span>}</div>
          <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>última consulta: {ultTxt(it)}</div>
          {it.status === "sugerido" && <div className="text-[11.5px] mt-2" style={{ color: "var(--text-secondary)" }}>Sugerido por <b>{it.sugerido_por}</b> · aguardando a coordenação em Aprovações.</div>}
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {(it.sit.st === "atras" || it.sit.st === "pend") && it.status === "ativo" && <><button onClick={() => acoes.semNovidade(it)} className={btn} style={bOk}>Sem novidade</button><button onClick={() => acoes.teve(it)} className={btn} style={bPri}>Teve andamento</button></>}
            {eu?.coord && it.sit.st === "atras" && <button onClick={() => acoes.cobrar(it)} className={btn} style={bDng}>Cobrar {primeiro(it.responsavel)}</button>}
          </div>
          {renderSN(it)}
        </div>
      </Card>
      <Card title="Histórico · inclusive dias sem novidade"><div className="px-3.5 py-1"><Historico it={it} /></div></Card>
      <Configuracao it={it} eu={eu} onChanged={() => reload()} onEditar={() => acoes.editar(it)} />
      {drawers}
    </div>
  );
}

/* ───────── Home: aba Acompanhamentos (atenção imediata → consultas → últimos andamentos) ───────── */
type AndHome = { id: string; caso_id: string; data: string; descricao: string; fonte: string; urgente: boolean | null; urgente_motivo: string | null; urgente_tratado_em: string | null; criado_em: string };
export function useConsultasHome(eu: Eu | null) {
  const adv = !!eu && !eu.coord;
  return useAcomp({ responsavel: adv ? eu!.primeiro : undefined, incluirSugestoes: true, desligado: !eu });
}
export function HomeAcompanhamentos({ eu, dado }: { eu: Eu | null; dado: ReturnType<typeof useConsultasHome> }) {
  const supabase = createClient(); const adv = !!eu && !eu.coord;
  const { itens, carregando, reload, feriados } = dado;
const [verSemOk, setVerSemOk] = useState(false);
  const { acoes, renderSN, drawers } = useAcaoAcomp(eu, reload);
  const [ands, setAnds] = useState<(AndHome & { caso?: CasoMin; cli?: string })[]>([]); const [urg, setUrg] = useState<(AndHome & { caso?: CasoMin; cli?: string })[]>([]);
  const [viaAcomp, setViaAcomp] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!eu) return;
    (async () => {
      const desde = addDias(hojeISO(), -3);
      const [{ data: rec }, { data: ur }, { data: regs }] = await Promise.all([
        supabase.from("caso_andamentos").select("id, caso_id, data, descricao, fonte, urgente, urgente_motivo, urgente_tratado_em, criado_em").gte("data", desde).lte("data", hojeISO()).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(120),
        supabase.from("caso_andamentos").select("id, caso_id, data, descricao, fonte, urgente, urgente_motivo, urgente_tratado_em, criado_em").eq("urgente", true).is("urgente_tratado_em", null).order("data", { ascending: false }).limit(50),
        supabase.from("acompanhamento_registros").select("andamento_id").not("andamento_id", "is", null).gte("data_ref", addDias(hojeISO(), -10)),
      ]);
      const todos = [...(rec ?? []), ...(ur ?? [])] as AndHome[];
      const ids = Array.from(new Set(todos.map(a => a.caso_id)));
      const { data: cs } = ids.length ? await supabase.from("casos").select("id, titulo, numero, area, empresa_id, advogado, orgao, dados").in("id", ids) : { data: [] as any[] };
      const eIds = Array.from(new Set((cs ?? []).map((c: any) => c.empresa_id)));
      const { data: es } = eIds.length ? await supabase.from("empresas").select("id, nome, nome_exibicao").in("id", eIds) : { data: [] as any[] };
      const cM = new Map((cs ?? []).map((c: any) => [c.id, c as CasoMin])); const eM = new Map((es ?? []).map((e: any) => [e.id, e]));
      const enr = (a: AndHome) => { const c = cM.get(a.caso_id); const e: any = c ? eM.get(c.empresa_id) : null; return { ...a, caso: c, cli: e?.nome_exibicao || e?.nome || "" }; };
      const meu = (a: { caso?: CasoMin }) => !adv || norm(a.caso?.advogado) === norm(eu.primeiro);
      setAnds(((rec ?? []) as AndHome[]).map(enr).filter(meu).slice(0, 12)); setUrg(((ur ?? []) as AndHome[]).map(enr).filter(meu));
      setViaAcomp(new Set((regs ?? []).map((r: any) => r.andamento_id)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eu?.id, itens.length]);
  async function tratar(a: AndHome) { await supabase.from("caso_andamentos").update({ urgente_tratado_em: new Date().toISOString(), urgente_tratado_por: eu?.primeiro ?? null }).eq("id", a.id); setUrg(u => u.filter(x => x.id !== a.id)); }
  const vivos = itens.filter(i => i.status !== "sugerido");
  const manuais = vivos.filter(i => i.modo !== "push" || falhouHoje(i));
  // Atenção: sem consulta bem-sucedida além da frequência (diário +2 dias úteis; semanal +7 dias)
const semOk = vivos.map(i => ({ i, s: semConsultaOk(i, feriados) })).filter(x => !!x.s).map(x => ({ i: x.i, s: x.s! })).sort((a, b) => b.s.dias - a.s.dias);
const atr = manuais.filter(i => i.sit.st === "atras"), hoje = manuais.filter(i => i.sit.st === "pend"), feitos = manuais.filter(i => i.sit.st === "feito"), fora = manuais.filter(i => i.sit.st === "fora" || i.sit.st === "pausado");
  const dias = Array.from(new Set(ands.map(a => a.data)));
  return (
    <div className="space-y-3">
      <Card red title={<>Atenção imediata · {urg.length}</>} action={<Link href="/acompanhamentos" style={{ color: "var(--text-secondary)" }}>ver em Acompanhamentos →</Link>}>
        {urg.length === 0 ? <Empty t="Nada exigindo atitude imediata. " /> : urg.slice(0, 5).map(a => <div key={a.id} className="px-3.5 py-2.5 border-b last:border-b-0 flex flex-wrap gap-2 items-start" style={{ borderColor: "var(--border)" }}><div className="min-w-0 flex-1" style={{ minWidth: 220 }}><div className="text-[12.5px]"><b style={{ color: "var(--text-primary)" }}>{a.cli}</b> · {a.caso?.titulo}{a.caso?.numero ? ` · ${a.caso.numero}` : ""} <AreaTag a={a.caso?.area} /></div><div className="text-[12px] mt-0.5" style={{ color: "var(--text-primary)" }}>{a.descricao}</div>{a.urgente_motivo && <div className="text-[11px] mt-0.5" style={{ color: "var(--tag-red-fg)" }}>{a.urgente_motivo}</div>}</div><div className="flex gap-1.5"><Link href={`/casos/${a.caso_id}`} className={btn} style={bSec}>Abrir caso</Link><button onClick={() => tratar(a)} className={btn} style={bOk}>✓ Tratado</button></div></div>)}
      </Card>
      {semOk.length > 0 && <Card red title={<>Atenção · sem consulta bem-sucedida · {semOk.length}</>} action={<span style={{ color: "var(--text-secondary)" }}>diário: +2 dias úteis · semanal: +7 dias</span>}>
{(verSemOk ? semOk : semOk.slice(0, 6)).map(({ i, s: x }) => <div key={i.id} className="px-3.5 py-2 border-b last:border-b-0 flex flex-wrap gap-2 items-start text-[12px]" style={{ borderColor: "var(--border)" }}><div className="min-w-0 flex-1" style={{ minWidth: 220 }}><div className="break-words"><b style={{ color: "var(--text-primary)" }}>{nomeCli(i)}</b> · <Link href={`/casos/${i.caso_id}`} style={{ color: "var(--text-primary)" }}>{nomeCaso(i)}</Link> <span className="ml-1 inline-flex gap-1 flex-wrap align-middle"><TagModo modo={i.modo} /><TagFreq a={i} /></span></div><div className="text-[11px] mt-0.5 break-words" style={{ color: "var(--tag-red-fg)" }}>{x.desde ? `última consulta bem-sucedida: ${fmtCurto(x.desde)}` : `nunca consultado com sucesso (desde ${fmtCurto(i.inicio)})`} · há {x.dias} {i.frequencia === "diario" ? "dias úteis" : "dias"}{x.ultima ? ` · última visita: ${x.ultima.origem === "rotina" ? rotuloVisita(x.ultima.visita as any).t : x.ultima.tipo === "consulta" ? "consulta manual" : x.ultima.tipo}` : ""}{i.integra_completa_pendente ? " · aguardando a 1ª íntegra" : ""}{!adv ? ` · ${primeiro(i.responsavel)}` : ""}</div></div><button onClick={() => acoes.hist(i)} className={btn} style={bSec}>Histórico</button></div>)}
{semOk.length > 6 && <div className="px-3.5 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}><button onClick={() => setVerSemOk(v => !v)} style={{ color: "var(--acao)" }}>{verSemOk ? "recolher" : `ver todos (${semOk.length})`}</button></div>}
</Card>}
<HomePush eu={eu} itens={vivos} reload={reload} onHist={acoes.hist} />
<Card title={<>Consultas de acompanhamento · {adv ? "suas" : "equipe"}</>} action={<span style={{ color: "var(--text-secondary)" }}><b style={{ color: atr.length ? "var(--tag-red-fg)" : undefined }}>{atr.length} atrasada{atr.length === 1 ? "" : "s"}</b> · {hoje.length} pra hoje · {feitos.length} feita{feitos.length === 1 ? "" : "s"} · <Link href="/acompanhamentos" style={{ color: "var(--acao)" }}>ver todas →</Link></span>}>
        {carregando ? <Empty t="Carregando…" /> : [...atr, ...hoje, ...feitos].length === 0 ? <Empty t={vivos.length ? "Nenhuma consulta pra hoje." : adv ? "Nenhum processo seu em acompanhamento." : "Nenhum processo em acompanhamento ainda."} /> : [...atr, ...hoje, ...feitos].map(it => <LinhaConsulta key={it.id} it={it} adv={adv} acoes={acoes} sn={renderSN(it)} mostrarResp={!adv} />)}
        {fora.length > 0 && <div className="px-3.5 py-2 text-[11px] border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>+ {fora.length} {fora.length > 1 ? "semanais" : "semanal"} em outro dia da semana{fora.some(i => i.sit.st === "pausado") ? " ou pausados" : ""}</div>}
      </Card>
      <BlocoCertidoesHome eu={eu} />
      <Card title="Últimos andamentos" action={<Link href="/acompanhamentos" style={{ color: "var(--acao)" }}>ver todos →</Link>}>
        {ands.length === 0 ? <Empty t="Nenhum andamento nos últimos dias." /> : dias.map(d => <div key={d}><div className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{d === hojeISO() ? "Hoje · " : ""}{fmtCurto(d)}</div>{ands.filter(a => a.data === d).map(a => <div key={a.id} className="px-3.5 py-2 border-b last:border-b-0 text-[12px]" style={{ borderColor: "var(--border)" }}><div className="text-[11px] break-words" style={{ color: "var(--text-muted)" }}><b style={{ color: "var(--text-secondary)" }}>{a.cli}</b> · <Link href={`/casos/${a.caso_id}`} style={{ color: "var(--text-secondary)" }}>{a.caso?.titulo}</Link> <AreaTag a={a.caso?.area} /></div><div className="break-words" style={{ color: "var(--text-primary)" }}>{a.descricao}{viaAcomp.has(a.id) && <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "var(--tag-purple-fg)" }}>via acompanhamento</span>}</div></div>)}</div>)}
      </Card>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Mesma ordem da página Acompanhamentos: atenção imediata → consultas → últimos andamentos. {adv ? "Você vê só os seus processos e registra a consulta daqui mesmo." : "Coordenação vê a equipe toda e cobra daqui."}</div>
      {drawers}
    </div>
  );
}

/* ───────── Home · Aprovações: sugestões de acompanhamento ───────── */
export function SugestoesAcomp({ eu, dado }: { eu: Eu | null; dado: ReturnType<typeof useConsultasHome> }) {
  const supabase = createClient();
  const sugs = dado.itens.filter(i => i.status === "sugerido");
  const [aj, setAj] = useState<AcompItem | null>(null); const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  if (!eu?.coord || !sugs.length) return null;
  async function aceitar(s: AcompItem) {
    const inicio = addDias(hojeISO(), 1);
    const { error } = await supabase.from("acompanhamentos").update({ status: "ativo", inicio, aprovado_por: eu?.primeiro ?? null, aprovado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", s.id);
    if (error) { setAviso("Erro: " + error.message); return; }
    await registrar(supabase, s, { tipo: "aprovado", autor: eu?.primeiro ?? null }); setAviso(`✓ Acompanhamento criado. Entra a partir de ${fmtCurto(proxUtil(inicio, dado.feriados))} na Home de ${s.responsavel}.`); dado.reload();
  }
  async function rejeitar(s: AcompItem) {
    const obs = window.prompt("Motivo da rejeição (vai para o histórico):", ""); if (obs === null) return;
    const { error } = await supabase.from("acompanhamentos").update({ status: "rejeitado", atualizado_em: new Date().toISOString() }).eq("id", s.id);
    if (error) { setAviso("Erro: " + error.message); return; }
    await registrar(supabase, s, { tipo: "rejeitado", autor: eu?.primeiro ?? null, obs: obs.trim() || null }); setAviso("Sugestão rejeitada."); dado.reload();
  }
  return (<>
    {sugs.map(s => <div key={s.id} className="p-3 rounded border" style={{ background: "var(--bg-surface)", borderColor: "var(--atencao)"}}>
      <div className="flex flex-wrap items-center gap-2 text-xs mb-1" style={{ color: "var(--text-secondary)" }}><span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>Sugestão de acompanhamento</span><span>enviado por {s.sugerido_por}</span><span className="ml-auto">{new Date(s.criado_em).toLocaleDateString("pt-BR")}</span></div>
      <div className="text-sm font-semibold break-words">{nomeCli(s)} · {nomeCaso(s)} <TagFreq a={s} /></div>
      {s.o_que && <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{s.o_que}</div>}
      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.onde ? `onde: ${s.onde} · ` : ""}quem consulta: {s.responsavel}</div>
      <div className="flex gap-2 flex-wrap mt-2"><button onClick={() => aceitar(s)} className="px-2.5 py-1 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>✓ Aceitar</button><button onClick={() => setAj(s)} className="px-2.5 py-1 rounded text-xs border" style={{ borderColor: "var(--border)" }}>✏ Ajustar</button><button onClick={() => rejeitar(s)} className="px-2.5 py-1 rounded text-xs border text-red-600" style={{ borderColor: "var(--border)" }}>✕ Rejeitar</button></div>
    </div>)}
    {aj && <DrawerIncluir inicial={aj} casoId={aj.caso_id} eu={eu} onClose={() => setAj(null)} onDone={m => { setAj(null); setAviso(m); dado.reload(); }} />}
    {aviso && <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-md text-xs font-medium text-on-acao shadow-2xl max-w-[92vw]" style={{ background: aviso.startsWith("Erro") ? "var(--alerta)" : "var(--ok)" }}>{aviso}</div>}
  </>);
}

/* ───────── bloco "Acompanhamento" no fim do Novo andamento ───────── */
export type OpAcomp = { tipo: "nada" } | { tipo: "incluir"; frequencia: "diario" | "semanal"; dia_semana: number; o_que: string } | { tipo: "trocar" } | { tipo: "encerrar" };
export function BlocoAcompAndamento({ casoId, consultaDe, value, onChange }: { casoId: string; consultaDe?: AcompItem; value: OpAcomp; onChange: (v: OpAcomp) => void }) {
  const eu = useEu();
  const [it, setIt] = useState<AcompItem | null | undefined>(consultaDe ?? undefined);
  useEffect(() => { if (consultaDe) return; let on = true; carregarAcomp(createClient(), { casoId }).then(r => { if (on) setIt(r.itens[0] ?? null); }); return () => { on = false; }; }, [casoId, consultaDe]);
  if (it === undefined) return null;
  const opt = (k: OpAcomp["tipo"], l: string, v: OpAcomp) => <button type="button" onClick={() => onChange(v)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={value.tipo === k && (k !== "incluir" || (value as any).frequencia === (v as any).frequencia) ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>;
  return (
    <div className="mt-4">
      <Sec t="Acompanhamento" />
      {it ? (<>
        <div className="text-[11.5px] mb-2" style={{ color: "var(--text-secondary)" }}>{it.status === "sugerido" ? <>Há uma sugestão de acompanhamento {labelFreq(it).replace("", "").toLowerCase()} aguardando a coordenação.</> : <>Este processo já está no acompanhamento <b>{labelFreq(it).replace("", "").toLowerCase()}</b>{consultaDe ? " · esta consulta conta como feita hoje" : ""}.</>}</div>
        {eu?.coord && it.status !== "sugerido" && <><L t={it.frequencia === "semanal" ? "Esse andamento pede consulta diária?" : "Deseja mudar o acompanhamento?"} /><div className="flex gap-1.5 flex-wrap">{opt("nada", "Manter como está", { tipo: "nada" })}{opt("trocar", it.frequencia === "semanal" ? "→ Passar pra diário" : "→ Passar pra semanal", { tipo: "trocar" })}{opt("encerrar", "Encerrar", { tipo: "encerrar" })}</div></>}
      </>) : (<>
        <L t={eu?.coord ? "Deseja incluir o processo no acompanhamento?" : "Deseja sugerir o acompanhamento deste processo?"} />
        <div className="flex gap-1.5 flex-wrap">{opt("nada", "Não", { tipo: "nada" })}{opt("incluir", "Diário", { tipo: "incluir", frequencia: "diario", dia_semana: 1, o_que: value.tipo === "incluir" ? value.o_que : "" })}{opt("incluir", "Semanal", { tipo: "incluir", frequencia: "semanal", dia_semana: value.tipo === "incluir" ? value.dia_semana : 1, o_que: value.tipo === "incluir" ? value.o_que : "" })}</div>
        {value.tipo === "incluir" && <div className="mt-2 rounded border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
          {value.frequencia === "semanal" && <div className="mb-2"><L t="Dia da semana" /><Seg opts={[["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"]]} v={String(value.dia_semana)} set={v => onChange({ ...value, dia_semana: Number(v) })} /></div>}
          <L t="O que olhar" /><input className={inputCls} style={inputStyle} value={value.o_que} onChange={e => onChange({ ...value, o_que: e.target.value })} placeholder="Ex.: ver se saiu a decisão da liminar" />
          <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>{eu?.coord ? "Começa amanhã, com o advogado do caso consultando. Ajuste depois na aba Acompanhamento do caso." : "Vai como sugestão para a coordenação aprovar."}</div>
        </div>}
      </>)}
    </div>
  );
}
/** Executa, depois de salvar o andamento: registra a consulta (se veio de uma) e aplica a escolha do bloco. */
export async function aplicarAcompAndamento(supabase: SB, caso: { id: string; empresa_id: string; advogado: string | null; orgao?: string | null; dados?: Record<string, any> | null }, andamento: { id: string; data: string; descricao: string }, consultaDe: AcompItem | undefined, op: OpAcomp) {
  const eu = await carregarEu(supabase);
  if (consultaDe) await registrar(supabase, consultaDe, { tipo: "consulta", resultado: "teve_andamento", andamento_id: andamento.id, data_ultimo_andamento: andamento.data, autor: eu?.primeiro ?? null, obs: andamento.descricao.slice(0, 140) });
  if (op.tipo === "nada") return;
  const { data: vivos } = await supabase.from("acompanhamentos").select("*").eq("caso_id", caso.id).in("status", ["ativo", "pausado", "sugerido"]).limit(1);
  const a = (vivos ?? [])[0] as Acomp | undefined;
  if (op.tipo === "incluir" && !a) {
    const coord = !!eu?.coord;
    const { data: novo } = await supabase.from("acompanhamentos").insert({ caso_id: caso.id, empresa_id: caso.empresa_id, frequencia: op.frequencia, dia_semana: op.frequencia === "semanal" ? op.dia_semana : null, responsavel: coord ? (caso.advogado || eu?.primeiro || "—") : (eu?.primeiro || caso.advogado || "—"), onde: ondePadrao(caso as any) || null, o_que: op.o_que.trim() || null, motivo: op.frequencia === "semanal" ? "atualização da base" : null, origem: "novo andamento", inicio: addDias(hojeISO(), 1), status: coord ? "ativo" : "sugerido", criado_por: coord ? eu?.primeiro ?? null : null, sugerido_por: coord ? null : eu?.primeiro ?? null }).select().single();
    if (novo) await registrar(supabase, novo as Acomp, { tipo: coord ? "criado" : "sugerido", autor: eu?.primeiro ?? null, obs: `a partir do andamento de ${fmtData(andamento.data)}` });
  } else if (a && op.tipo === "trocar" && eu?.coord) {
    await supabase.from("acompanhamentos").update(a.frequencia === "diario" ? { frequencia: "semanal", dia_semana: a.dia_semana ?? 1 } : { frequencia: "diario" }).eq("id", a.id);
    await registrar(supabase, a, { tipo: "frequencia", autor: eu?.primeiro ?? null, obs: `${a.frequencia === "diario" ? "diário → semanal" : "semanal → diário"} · pelo andamento de ${fmtData(andamento.data)}` });
  } else if (a && op.tipo === "encerrar" && eu?.coord) {
    await supabase.from("acompanhamentos").update({ status: "encerrado" }).eq("id", a.id);
    await registrar(supabase, a, { tipo: "encerrado", autor: eu?.primeiro ?? null, obs: `pelo andamento de ${fmtData(andamento.data)}` });
  }
}
export { situacao };
