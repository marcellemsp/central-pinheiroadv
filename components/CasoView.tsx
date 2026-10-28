"use client";
import { COORDENADORES } from "@/lib/equipe";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { CasoDrawer, type Caso, type Documento } from "./ClienteView";
import type { Empresa } from "./ClientesListView";
import { AREAS, ADVOGADOS, type Area } from "@/lib/areas";
import CalculadoraPrazo, { inferirTribunal, inferirSistema } from "./CalculadoraPrazo";
import { BlocoAcompAndamento, aplicarAcompAndamento, useAcompCaso, SeloAcomp, AbaAcompanhamentoCaso, useEu, type OpAcomp } from "./Acompanhamento";
import type { AcompItem } from "@/lib/acompanhamento";
import { type Recorrencia, REC_FREQS, REC_DIAS, REC_AJUSTES, REC_FINS, recPadrao, proximasDatas, proximaOcorrencia, labelRec, resumoRec } from "@/lib/recorrencia";
import AbaDocumentos from "./AbaDocumentos";

export type Andamento = { id: string; caso_id: string; empresa_id: string; data: string; hora: string | null; descricao: string; fonte: string; anexo_url: string | null; criado_em: string; urgente?: boolean | null; urgente_motivo?: string | null; urgente_tratado_em?: string | null; urgente_tratado_por?: string | null };
export type Pendencia = { id: string; caso_id: string | null; empresa_id: string; certidao_subtipo?: string | null; depende_de?: string | null; prazo_relativo_uteis?: number | null; titulo: string; tipo: string; responsavel: string | null; status: string; fatal: boolean; prazo: string | null; prazo_interno: string | null; contagem: string | null; revisor: string | null; prioridade: string | null; descricao: string | null; origem_andamento_id: string | null; concluida_em: string | null; criado_em: string; arquivo_url?: string | null; versao?: number | null; devolucao_obs?: string | null; enviado_em?: string | null; recorrencia?: Recorrencia | null; recorrencia_id?: string | null; recorrencia_seq?: number | null; recorrencia_ativa?: boolean | null; revisor_anterior?: string | null; subida_por?: string | null; subida_obs?: string | null; retorno_para?: string | null; origem_revisao?: string | null; hora?: string | null; detalhes?: any };
export type PendEvento = { id: string; pendencia_id: string; caso_id: string | null; empresa_id: string | null; autor: string | null; acao: string; obs: string | null; criado_em: string };

export const COORDS = COORDENADORES;
export const COR_REVISOR: Record<string, { bg: string; fg: string }> = { Marcelle: { bg: "var(--alerta-tint)", fg: "var(--alerta)" } };
export const corRevisor = (nome?: string | null) => COORDS.find(c => mesmoNome(c, nome)) ? COR_REVISOR[COORDS.find(c => mesmoNome(c, nome))!] : { bg: "var(--tag-gray-bg, var(--neutro-tint))", fg: "var(--text-secondary)" };
/** Nome de revisor com a cor dele. */
export const NomeRev = ({ n, forte }: { n?: string | null; forte?: boolean }) => { const c = corRevisor(n); return <span className="px-1.5 rounded font-semibold" style={{ background: forte ? c.bg : "transparent", color: c.fg }}>{n ? primeiroNome(n) : "—"}</span>; };
/** Cadeia de revisão em texto: responsável → revisores; o atual em destaque. */
export function Cadeia({ p }: { p: Pendencia }) {
  if (!FLUXO_PECA.includes(p.tipo) || !p.revisor) return null;
  const atual = COORDS.find(c => mesmoNome(c, p.revisor)) ?? p.revisor;
  const idx = COORDS.findIndex(c => mesmoNome(c, atual));
  const voltou = p.origem_revisao === "devolucao_de_cima" || p.origem_revisao === "retorno_aprovado";
  const passados = COORDS.slice(0, idx); const proximos = COORDS.slice(idx + 1);
  return (
    <span className="text-[10.5px] whitespace-nowrap" style={{ color: "var(--text-muted)" }} title={p.subida_obs ? `${p.subida_por ?? ""}: ${p.subida_obs}` : undefined}>
      {p.responsavel ? primeiroNome(p.responsavel) : "—"}{passados.map(c => <span key={c}> → <NomeRev n={c} /></span>)}
      {voltou && p.subida_por ? <span> → <NomeRev n={p.subida_por} /> ↩</span> : null}
      {" → "}<NomeRev n={atual} forte />{proximos.map(c => <span key={c} style={{ opacity: .6 }}> → {primeiroNome(c)}</span>)}
    </span>
  );
}
const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export const primeiroNome = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";
export const mesmoNome = (a?: string | null, b?: string | null) => !!a && !!b && norm(primeiroNome(a)) === norm(primeiroNome(b));
export const ehCoordenador = (nome?: string | null) => COORDS.some(c => mesmoNome(c, nome));
export const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
export const relTempo = (iso?: string | null) => { if (!iso) return ""; const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "agora" : m < 60 ? `há ${m}min` : m < 1440 ? `há ${Math.floor(m / 60)}h` : `há ${Math.floor(m / 1440)}d`; };

const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const fmt = (d?: string | null) => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().slice(0, 10);
const diasAte = (d?: string | null) => d ? Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5) : null;
function subUteis(d: string, n: number) { const x = new Date(d + "T12:00:00"); let k = 0; while (k < n) { x.setDate(x.getDate() - 1); if (x.getDay() !== 0 && x.getDay() !== 6) k++; } return x.toISOString().slice(0, 10); }
function addDias(d: string, n: number, uteis: boolean) { const x = new Date(d + "T12:00:00"); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (!uteis || (x.getDay() !== 0 && x.getDay() !== 6)) k++; } return x.toISOString().slice(0, 10); }
function subCorridos(d: string, n: number) { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); }

export const TIPOS_PEND = [["peca", "Peça"], ["memorial", "Memorial"], ["diligencia", "Diligência"], ["comprovacao", "Comprovação"], ["audiencia", "Audiência"], ["julgamento", "Julgamento"], ["despacho", "Despacho"], ["rolante", "↻ Rolante"], ["documento", "Documento"], ["certidao", "Certidão"], ["protocolo", "Protocolo"], ["alinhamento", "Alinhamento"], ["analise", "Análise"], ["solicitacao", "Solicitação ao cliente"]];
/** Tipos que seguem o fluxo da peça (link do Word, versão, revisão). Só "peca" grava andamento ao concluir; memorial não. */
export const FLUXO_PECA = ["peca", "memorial"];
export const MODALIDADES_JULG = [["presencial", "Presencial"], ["telepresencial", "Telepresencial / vídeo"], ["virtual", "Virtual (assíncrona)"]];
export const RESULTADOS_JULG = [["realizado", "Realizado"], ["adiado", "Adiado"], ["retirado", "Retirado de pauta"], ["vista", "Pedido de vista"]];
/** Linha da sessão de julgamento: data · hora (ou período) · modalidade · órgão · sustentação · entrar */
export const InfoJulg = ({ p, compacto }: { p: Pendencia; compacto?: boolean }) => { if (p.tipo !== "julgamento") return null; const dt = p.detalhes ?? {}; const mod = MODALIDADES_JULG.find(m => m[0] === dt.modalidade)?.[1]; return <div className="text-[10.5px] mt-0.5 flex flex-wrap items-center gap-x-1.5" style={{ color: "var(--text-muted)" }}><span style={{ color: "var(--acao-claro)", fontWeight: 600 }}>{p.prazo ? fmt(p.prazo) : "sem data"}{dt.modalidade === "virtual" && dt.fim ? ` → ${fmt(dt.fim)}` : p.hora ? ` · ${p.hora.slice(0, 5)}` : ""}</span>{mod && <span>· {mod}</span>}{!compacto && dt.orgao && <span>· {dt.orgao}</span>}{!compacto && dt.ordem_pauta && <span>· pauta nº {dt.ordem_pauta}</span>}{dt.sustentacao === "sim" && <span>· sustentação{dt.inscricao_ate ? ` (inscrição até ${fmt(dt.inscricao_ate)}${dt.inscricao_hora ? " " + dt.inscricao_hora : ""})` : ""}</span>}{dt.link && <a href={dt.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="font-semibold" style={{ color: "var(--acao)" }}>entrar</a>}</div>; };
export const ETAPAS_DESP = [["a_pedir", "A pedir"], ["pedido", "Pedido enviado"], ["agendado", "Agendado"]];
export const COM_DESP = [["relator", "Des. Relator(a)"], ["juiz", "Juiz(a)"], ["assessor", "Assessor(a)"], ["procurador", "Procurador(a)"], ["outro", "Outro"]];
export const MODALIDADES_DESP = [["presencial", "Presencial"], ["virtual", "Virtual"], ["telefone", "Telefone"]];
export const RESULTADOS_DESP = [["realizado", "Realizado"], ["remarcado", "Remarcado"], ["cancelado", "Cancelado"], ["nao_recebido", "Não recebido"]];
/** Linha do despacho: etapa · data/hora (ou pedir/cobrar até) · modalidade · com quem · órgão · entrar */
export const InfoDesp = ({ p }: { p: Pendencia }) => { if (p.tipo !== "despacho") return null; const dt = p.detalhes ?? {}; const et = dt.etapa ?? "a_pedir"; const etL = ETAPAS_DESP.find(e => e[0] === et)?.[1] ?? et; const com = COM_DESP.find(c => c[0] === dt.com)?.[1]; const mod = MODALIDADES_DESP.find(m => m[0] === dt.modalidade)?.[1]; return <div className="text-[10.5px] mt-0.5 flex flex-wrap items-center gap-x-1.5" style={{ color: "var(--text-muted)" }}><span style={{ color: "var(--atencao)", fontWeight: 600 }}>{etL}{et === "agendado" ? ` · ${p.prazo ? fmt(p.prazo) : "sem data"}${p.hora ? ` · ${p.hora.slice(0, 5)}` : ""}` : p.prazo ? ` · ${et === "pedido" ? "cobrar" : "pedir"} até ${fmt(p.prazo)}` : ""}</span>{mod && <span>· {mod}</span>}{(dt.com_nome || com) && <span>· {dt.com_nome || com}</span>}{dt.orgao && <span>· {dt.orgao}</span>}{dt.link && <a href={dt.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="font-semibold" style={{ color: "var(--acao)" }}>entrar</a>}</div>; };
export const ROLA_OPTS = [["util", "Próximo dia útil"], ["util2", "+2 úteis"], ["semana", "Próxima semana"]];
/** Linha da pendência rolante: ↻ N× · desde · avisado · limite */
export const InfoRol = ({ p }: { p: Pendencia }) => { if (p.tipo !== "rolante") return null; const dt = p.detalhes ?? {}; const n = Number(dt.adiamentos ?? 0); const m = Number(dt.manuais ?? 0); const av = !!dt.avisado; if (!n && !m && !dt.limite) return null; return <div className="text-[10.5px] mt-0.5" style={{ color: av ? "var(--atencao)" : "var(--acao-claro)", fontWeight: av ? 600 : 400 }}>↻ {n ? `${n}×` : "rolante"}{dt.desde ? ` · desde ${fmt(dt.desde)}` : ""}{m ? ` · adiada à mão ${m}×` : ""}{av ? " · avisado" : ""}{dt.limite ? ` · limite ${fmt(dt.limite)}` : ""}</div>; };
export const STATUS_PEND: Record<string, { l: string; cls: string }> = { aguardando: { l: "aguardando anterior", cls: "mut" }, a_fazer: { l: "a fazer", cls: "mut" }, em_elaboracao: { l: "em elaboração", cls: "prox" }, revisao_pendente: { l: "revisão pendente", cls: "rev" }, devolvida: { l: "devolvida · ajustar", cls: "fatal" }, pronta_protocolar: { l: "pendente de protocolo", cls: "prox" }, aguardando_cliente: { l: "aguardando cliente", cls: "prox" }, bloqueada: { l: "bloqueada", cls: "fatal" }, concluida: { l: "protocolado", cls: "ok" } };
export const FONTES = [["manual", "Manual"], ["publicacao", "Publicação (alerte)"], ["esaj", "e-SAJ"], ["pje", "PJe"], ["eproc", "eproc"], ["copia", "Cópia integral"], ["dcp", "DCP"], ["projudi", "PROJUDI"], ["dje", "DJE"], ["do", "D.O."], ["sei", "SEI"], ["orgao", "Órgão"], ["email", "E-mail"], ["tese", "Tese"]];
export const TagUrgente = ({ tratado }: { tratado?: boolean }) => <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-px rounded uppercase tracking-wider border align-middle" style={tratado ? { background: "var(--tag-gray-bg)", color: "var(--tag-gray-fg)", borderColor: "transparent" } : { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)", borderColor: "var(--alerta)" }}>{tratado ? "tratado" : "atitude imediata"}</span>;
const RESPONSAVEIS = [...ADVOGADOS, "Estagiário", "Contador cliente", "Cliente", "Financeiro"];

export const Pz = ({ t, cls }: { t: string; cls: string }) => <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap" style={cls === "fatal" ? { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" } : cls === "prox" ? { background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" } : cls === "ok" ? { background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" } : cls === "rev" ? { background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" } : { color: "var(--text-muted)" }}>{t}</span>;
export const prazoPz = (p: Pendencia) => { if (!p.prazo) return <Pz t="—" cls="mut" />; if (p.status === "concluida") return <Pz t={fmt(p.prazo)} cls="ok" />; const d = diasAte(p.prazo)!; return <Pz t={(d < 0 ? "VENCIDO " : p.fatal && d <= 7 ? "FATAL " : "") + fmt(p.prazo)} cls={d < 0 || (p.fatal && d <= 2) ? "fatal" : d <= 7 ? "prox" : "mut"} />; };

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{title}</span>{action}</div>{children}</div>;
}
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
function Drawer({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (<>
    <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
    <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[560px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}><div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>{sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}</div><button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button></div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      <div className="px-5 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>{footer}</div>
    </aside>
  </>);
}
const Seg = ({ opts, v, set }: { opts: string[][]; v: string; set: (k: string) => void }) => <div className="flex gap-1.5 flex-wrap">{opts.map(([k, l]) => <button key={k} type="button" onClick={() => set(k)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={v === k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>)}</div>;
const L = ({ t, req }: { t: string; req?: boolean }) => <label className={labelCls} style={{ color: "var(--text-secondary)" }}>{t}{req && <span style={{ color: "var(--alerta)" }}> *</span>}</label>;
const Foot = ({ onClose, onSave, ok, saving, edit, onDel }: { onClose: () => void; onSave: () => void; ok: boolean; saving: boolean; edit?: boolean; onDel?: () => void }) => (<>
  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{edit && onDel ? <button onClick={onDel} className="font-medium" style={{ color: "var(--alerta)" }}>Excluir</button> : "* obrigatórios"}</div>
  <div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={onSave} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Salvando…" : edit ? "Salvar alterações" : "Salvar"}</button></div>
</>);

/* ───────── Pendência / Diligência ───────── */
export function PendDrawer({ caso, inicial, diligencia, origem, andamentos, onClose, onSaved, onDel, supabase, preset, usuario }: { caso: Caso; inicial?: Pendencia; diligencia?: boolean; origem?: Andamento; andamentos: Andamento[]; onClose: () => void; onSaved: () => void; onDel?: (p: Pendencia) => void; supabase: ReturnType<typeof createClient>; preset?: Partial<Record<string, any>>; usuario?: string }) {
  const edit = !!inicial;
  const [enc, setEnc] = useState<{ on: boolean; de: string; modo: "fixo" | "rel"; uteis: number }>(() => ({ on: !!inicial?.depende_de, de: inicial?.depende_de ?? "", modo: inicial?.prazo_relativo_uteis ? "rel" : "fixo", uteis: inicial?.prazo_relativo_uteis ?? 3 }));
  const [irmas, setIrmas] = useState<{ id: string; titulo: string; responsavel: string | null; prazo: string | null; tipo?: string }[]>([]);
  useEffect(() => { if (!caso.id) return; supabase.from("caso_pendencias").select("id,titulo,responsavel,prazo,tipo").eq("caso_id", caso.id).neq("status", "concluida").order("prazo", { ascending: true, nullsFirst: false }).then(({ data }: any) => setIrmas(((data ?? []) as any[]).filter(x => x.id !== inicial?.id))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const encAtivo = enc.on && !!enc.de && irmas.some(x => x.id === enc.de);
  const [d, setD] = useState<Record<string, any>>(() => inicial ? { ...inicial } : { tipo: diligencia ? "diligencia" : "peca", status: "a_fazer", fatal: !diligencia, contagem: "uteis", prioridade: "normal", revisor: diligencia ? "" : "Marcelle", responsavel: caso.advogado ?? "", origem_andamento_id: origem?.id ?? "", descricao: origem ? `Origem: ${origem.descricao}` : "", ...(preset ?? {}) });
  const set = (k: string, v: any) => setD(p => { const n = { ...p, [k]: v }; if (k === "tipo" && v === "julgamento") { n.fatal = false; n.revisor = ""; n.prazo_interno = null; n.detalhes = { modalidade: "telepresencial", sustentacao: "decidir", ...(p.detalhes ?? {}) }; if (!inicial) n.criar_memorial = true; } if (k === "tipo" && v === "despacho") { n.fatal = false; n.revisor = ""; n.prazo_interno = null; n.detalhes = { etapa: "a_pedir", modalidade: "virtual", com: "relator", ...(p.detalhes ?? {}) }; if (!inicial) n.criar_memorial = true; } if (k === "tipo" && v === "rolante") { n.fatal = false; n.revisor = ""; n.prazo_interno = null; n.detalhes = { rola: "util", avisar_apos: 3, ...(p.detalhes ?? {}) }; } if (k === "tipo" && v === "memorial" && !inicial) { n.fatal = false; n.prazo_interno = null; if (!n.revisor) n.revisor = "Marcelle"; } if ((k === "prazo" || k === "fatal" || k === "contagem") && n.prazo && n.fatal && !p.prazo_interno_manual) n.prazo_interno = n.contagem === "uteis" ? subUteis(n.prazo, 4) : subCorridos(n.prazo, 4); if (k === "prazo_interno") n.prazo_interno_manual = true; if (k === "prazo" && n.recorrencia && n.recorrencia.dia === "fixo" && v) n.recorrencia = { ...n.recorrencia, dia_ref: Number(String(v).slice(8, 10)) }; return n; });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const [calc, setCalc] = useState(false);
  // D-4 em dias úteis de verdade (feriados nacionais/RJ/Rio) — recalcula no banco quando o prazo muda e o interno não foi ajustado à mão
  useEffect(() => {
    if (!d.prazo || !d.fatal || d.prazo_interno_manual) return;
    let on = true;
    supabase.rpc("pa_sub_uteis_esf", { d: d.prazo, n: 4, esferas: ["nacional", "rj", "rio"] }).then(({ data }) => { if (on && data && d.contagem === "uteis") setD(p => p.prazo_interno_manual ? p : { ...p, prazo_interno: data as string }); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.prazo, d.fatal, d.contagem]);
  const setDet = (k: string, v: any) => setD(p => ({ ...p, detalhes: { ...(p.detalhes ?? {}), [k]: v } }));
const linkSessaoOk = !String(d.detalhes?.link ?? "").trim() || /^https?:\/\//i.test(String(d.detalhes?.link ?? "").trim());
const linkOk = !((d.arquivo_url ?? "") as string).trim() || /^https?:\/\//i.test(((d.arquivo_url ?? "") as string).trim());
  const ok = (d.titulo ?? "").trim().length > 2 && !!d.responsavel && linkOk && (d.tipo !== "julgamento" || (!!d.prazo && linkSessaoOk)) && (d.tipo !== "rolante" || !!d.prazo) && (d.tipo !== "despacho" || (!!d.prazo && linkSessaoOk));
  async function salvar() {
    if (!ok) return; setSaving(true); setErro(null);
    const payload = { caso_id: caso.id || null, empresa_id: caso.empresa_id, titulo: d.titulo.trim(), tipo: d.tipo, responsavel: d.responsavel || null, status: encAtivo && (d.status === "a_fazer" || d.status === "aguardando") ? "aguardando" : !encAtivo && d.status === "aguardando" ? "a_fazer" : d.status, fatal: ["julgamento", "rolante", "despacho"].includes(d.tipo) ? false : !!d.fatal, prazo: encAtivo && enc.modo === "rel" ? null : (d.prazo || null), depende_de: encAtivo ? enc.de : null, prazo_relativo_uteis: encAtivo && enc.modo === "rel" ? enc.uteis : null, prazo_interno: d.fatal && !["julgamento", "rolante", "despacho"].includes(d.tipo) ? (d.prazo_interno || null) : null, contagem: d.contagem, revisor: ["julgamento", "rolante", "despacho"].includes(d.tipo) ? null : (d.revisor || null), prioridade: d.prioridade, descricao: d.descricao?.trim() || null, arquivo_url: ((d.arquivo_url ?? "") as string).trim() || null, origem_andamento_id: d.origem_andamento_id || null, hora: d.hora || null, detalhes: d.detalhes && Object.keys(d.detalhes).length ? d.detalhes : null,
      recorrencia: d.recorrencia ?? null, recorrencia_ativa: d.recorrencia ? (d.recorrencia_ativa ?? true) : null,
      ...(edit ? {} : d.recorrencia ? { recorrencia_id: crypto.randomUUID(), recorrencia_seq: 1 } : {}) };
    const res = edit ? await supabase.from("caso_pendencias").update(payload).eq("id", inicial!.id) : await supabase.from("caso_pendencias").insert(payload).select("id").single();
    if (!res.error && edit && ((payload as any).arquivo_url ?? null) !== (inicial!.arquivo_url ?? null)) await supabase.from("pendencia_eventos").insert({ pendencia_id: inicial!.id, caso_id: caso.id, empresa_id: caso.empresa_id, autor: usuario || "—", acao: (payload as any).arquivo_url ? `trocou o anexo · v${inicial!.versao ?? 1}` : "removeu o anexo", obs: (payload as any).arquivo_url });
    setSaving(false); if (res.error) { setErro(res.error.message); return; }
    // julgamento novo: memorial (2 dias úteis antes) e inscrição para sustentação, se marcados
if (!edit && (d.tipo === "julgamento" || d.tipo === "despacho") && (res as any).data?.id) {
const jid = (res as any).data.id as string; const extras: Record<string, any>[] = [];
if (d.criar_memorial && d.prazo) { const { data: dm } = await supabase.rpc("pa_sub_uteis_esf", { d: d.prazo, n: d.tipo === "despacho" ? 1 : 2, esferas: ["nacional", "rj", "rio"] }); extras.push({ caso_id: caso.id, empresa_id: caso.empresa_id, titulo: `Memorial · ${d.titulo.trim()}`, tipo: "memorial", responsavel: d.responsavel || null, status: "a_fazer", fatal: false, prazo: (dm as string) || null, contagem: "uteis", revisor: "Marcelle", prioridade: "normal", detalhes: d.tipo === "despacho" ? { despacho_id: jid } : { julgamento_id: jid } }); }
if (d.criar_inscricao && d.detalhes?.sustentacao === "sim" && d.detalhes?.inscricao_ate) extras.push({ caso_id: caso.id, empresa_id: caso.empresa_id, titulo: `Inscrição para sustentação oral · ${d.titulo.trim()}`, tipo: "diligencia", responsavel: d.responsavel || null, status: "a_fazer", fatal: true, prazo: d.detalhes.inscricao_ate, hora: d.detalhes.inscricao_hora || null, contagem: "uteis", prioridade: "alta", descricao: `Inscrever para sustentar no julgamento de ${fmt(d.prazo)}${d.hora ? " às " + String(d.hora).slice(0, 5) : ""}.`, detalhes: { julgamento_id: jid } });
if (extras.length) await supabase.from("caso_pendencias").insert(extras);
}
if (!edit && caso.id && d.prazo && (!caso.prazo_proximo || d.prazo < caso.prazo_proximo)) await supabase.from("casos").update({ prazo_proximo: d.prazo }).eq("id", caso.id);
    onSaved();
  }
  const isDil = d.tipo === "diligencia"; const isJulg = d.tipo === "julgamento"; const isMemo = d.tipo === "memorial"; const isRol = d.tipo === "rolante"; const isDesp = d.tipo === "despacho"; const despAg = (d.detalhes?.etapa ?? "a_pedir") === "agendado";
  return (
    <Drawer title={edit ? (isJulg ? "Modificar julgamento" : isDesp ? "Modificar despacho" : "Modificar pendência") : isDil ? "Nova diligência" : isDesp ? "Novo despacho" : isJulg ? "Novo julgamento" : "Nova pendência"} sub={isDesp ? "Despacho com o gabinete: a pedir → pedido enviado → agendado → realizado. Sem revisão e sem D-4. Não grava andamento." : isRol ? "Rolante: se ninguém marcar até o fim do dia, passa sozinha para frente (0h05). Sem D-4 e sem revisão." : isJulg ? "Sessão com data e hora marcadas. Sem revisão e sem D-4. Ao concluir, não grava andamento: o resultado vem pela publicação." : isMemo ? "Memorial: mesma rotina da peça (link + revisão), mas não grava andamento no processo ao concluir." : isDil ? "Providência prática (certidão, cópia, protocolo, comprovante). Sem revisão obrigatória." : "Tarefa com prazo neste caso. Prazo interno D-4 automático (dias úteis) e revisão antes de protocolar."} onClose={onClose}
      footer={<Foot onClose={onClose} onSave={salvar} ok={ok} saving={saving} edit={edit} onDel={onDel && inicial ? () => onDel(inicial) : undefined} />}>
      <div className="mb-2.5"><L t="Título" req /><input className={inputCls} style={inputStyle} value={d.titulo ?? ""} onChange={e => set("titulo", e.target.value)} autoFocus placeholder={isDil ? "Ex.: Obter certidão de objeto e pé" : "Ex.: Manifestação sobre os cálculos"} /></div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Tipo" /><select className={inputCls} style={inputStyle} value={d.tipo} onChange={e => set("tipo", e.target.value)}>{TIPOS_PEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><L t="Responsável" req /><select className={inputCls} style={inputStyle} value={d.responsavel ?? ""} onChange={e => set("responsavel", e.target.value)}><option value="">—</option>{RESPONSAVEIS.map(r => <option key={r}>{r}</option>)}</select></div>
      </div>
      {isMemo && irmas.some(x => x.tipo === "julgamento") && <div className="mb-2.5"><L t="Vinculado ao julgamento (opcional)" /><select className={inputCls} style={inputStyle} value={d.detalhes?.julgamento_id ?? ""} onChange={e => setDet("julgamento_id", e.target.value || null)}><option value="">— nenhum</option>{irmas.filter(x => x.tipo === "julgamento").map(x => <option key={x.id} value={x.id}>{x.titulo}{x.prazo ? ` · ${fmt(x.prazo)}` : ""}</option>)}</select></div>}
{andamentos.length > 0 && <div className="mb-2.5"><L t="Origem (andamento que gerou)" /><select className={inputCls} style={inputStyle} value={d.origem_andamento_id ?? ""} onChange={e => set("origem_andamento_id", e.target.value)}><option value="">— nenhuma</option>{andamentos.slice(0, 15).map(a => <option key={a.id} value={a.id}>{fmt(a.data)} · {a.descricao.slice(0, 70)}</option>)}</select></div>}
      {isJulg && <>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Sessão</div>
<div className="mb-2.5"><L t="Modalidade" /><Seg opts={MODALIDADES_JULG} v={d.detalhes?.modalidade ?? "telepresencial"} set={v => setDet("modalidade", v)} /></div>
<div className="grid grid-cols-3 gap-2.5 mb-2.5">
<div><L t={d.detalhes?.modalidade === "virtual" ? "Início" : "Data"} req /><input type="date" className={inputCls} style={inputStyle} value={d.prazo ?? ""} onChange={e => set("prazo", e.target.value)} /></div>
{d.detalhes?.modalidade === "virtual" ? <div><L t="Fim" /><input type="date" className={inputCls} style={inputStyle} value={d.detalhes?.fim ?? ""} onChange={e => setDet("fim", e.target.value || null)} /></div> : <div><L t="Horário" /><input type="time" className={inputCls} style={inputStyle} value={String(d.hora ?? "").slice(0, 5)} onChange={e => set("hora", e.target.value || null)} /></div>}
<div><L t="Nº na pauta" /><input className={inputCls} style={inputStyle} value={d.detalhes?.ordem_pauta ?? ""} onChange={e => setDet("ordem_pauta", e.target.value)} /></div>
</div>
<div className="mb-2.5"><L t="Órgão / câmara / turma" /><input className={inputCls} style={inputStyle} value={d.detalhes?.orgao ?? ""} onChange={e => setDet("orgao", e.target.value)} placeholder={caso.orgao ?? "Ex.: TJRJ · 3ª Câmara de Direito Público"} /></div>
<div className="mb-2.5"><L t="Link da sessão" /><input className={inputCls} style={inputStyle} value={d.detalhes?.link ?? ""} onChange={e => setDet("link", e.target.value)} placeholder="https://… (Teams / Zoom / sala virtual)" />{!linkSessaoOk && <div className="text-[11px] mt-1" style={{ color: "var(--alerta)" }}>O link precisa começar com http:// ou https://.</div>}</div>
<div className="grid grid-cols-2 gap-2.5 mb-2.5">
<div><L t="Sustentação oral" /><Seg opts={[["sim", "Sim"], ["nao", "Não"], ["decidir", "A decidir"]]} v={d.detalhes?.sustentacao ?? "decidir"} set={v => setDet("sustentacao", v)} /></div>
{d.detalhes?.sustentacao === "sim" && <div><L t="Inscrição até" /><div className="flex gap-2"><input type="date" className={inputCls + " min-w-0"} style={inputStyle} value={d.detalhes?.inscricao_ate ?? ""} onChange={e => setDet("inscricao_ate", e.target.value || null)} /><input type="time" className={inputCls + " w-[96px]"} style={inputStyle} value={d.detalhes?.inscricao_hora ?? ""} onChange={e => setDet("inscricao_hora", e.target.value || null)} /></div></div>}
</div>
{!edit && <div className="rounded px-3 py-2.5 mb-2.5 text-[12px] space-y-1.5" style={{ border: "1px solid var(--acao-claro)", background: "var(--acao-tint)", color: "var(--text-secondary)" }}>
<label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!d.criar_memorial} onChange={e => set("criar_memorial", e.target.checked)} /><span><b style={{ color: "var(--text-primary)" }}>Criar também a pendência de memorial</b> · entrega 2 dias úteis antes da sessão, mesmo responsável, revisor Marcelle</span></label>
{d.detalhes?.sustentacao === "sim" && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!d.criar_inscricao} onChange={e => set("criar_inscricao", e.target.checked)} /><span><b style={{ color: "var(--text-primary)" }}>Criar pendência de inscrição para sustentação</b> · prazo = data de “inscrição até”</span></label>}
</div>}
{edit && Array.isArray(d.detalhes?.adiamentos) && d.detalhes.adiamentos.length > 0 && <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>Adiamentos: {d.detalhes.adiamentos.map((a: any) => `${fmt(a.de)} → ${fmt(a.para)}`).join(" · ")}</div>}
{edit && d.detalhes?.resultado && <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>Resultado: <b style={{ color: "var(--text-primary)" }}>{RESULTADOS_JULG.find(r => r[0] === d.detalhes.resultado)?.[1] ?? d.detalhes.resultado}</b>{d.detalhes.resultado_obs ? ` · ${d.detalhes.resultado_obs}` : ""}</div>}
</>}
{isDesp && <>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Etapa</div>
<div className="mb-2.5"><Seg opts={ETAPAS_DESP} v={d.detalhes?.etapa ?? "a_pedir"} set={v => setDet("etapa", v)} /><div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{despAg ? "Data e horário do despacho. Ao concluir: realizado, remarcado, cancelado ou não recebido." : "A data abaixo é o prazo para pedir/cobrar o gabinete. Use “Marcar como pedido” e “Agendar…” na linha."}</div></div>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Com quem</div>
<div className="grid grid-cols-2 gap-2.5 mb-2.5"><div><L t="Com" /><select className={inputCls} style={inputStyle} value={d.detalhes?.com ?? "relator"} onChange={e => setDet("com", e.target.value)}>{COM_DESP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div><div><L t="Nome" /><input className={inputCls} style={inputStyle} value={d.detalhes?.com_nome ?? ""} onChange={e => setDet("com_nome", e.target.value)} placeholder="Ex.: Des. Fulana de Tal" /></div></div>
<div className="mb-2.5"><L t="Gabinete / órgão" /><input className={inputCls} style={inputStyle} value={d.detalhes?.orgao ?? ""} onChange={e => setDet("orgao", e.target.value)} placeholder={caso.orgao ?? "Ex.: TJRJ · 3ª Câmara de Direito Público"} /></div>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Quando e como</div>
<div className="mb-2.5"><L t="Modalidade" /><Seg opts={MODALIDADES_DESP} v={d.detalhes?.modalidade ?? "virtual"} set={v => setDet("modalidade", v)} /></div>
<div className="grid grid-cols-3 gap-2.5 mb-2.5"><div><L t={despAg ? "Data" : "Pedir/cobrar até"} req /><input type="date" className={inputCls} style={inputStyle} value={d.prazo ?? ""} onChange={e => set("prazo", e.target.value)} /></div>{despAg ? <><div><L t="Horário" /><input type="time" className={inputCls} style={inputStyle} value={String(d.hora ?? "").slice(0, 5)} onChange={e => set("hora", e.target.value || null)} /></div><div><L t="Duração" /><input className={inputCls} style={inputStyle} value={d.detalhes?.duracao ?? ""} onChange={e => setDet("duracao", e.target.value)} placeholder="15 min" /></div></> : <div className="col-span-2" />}</div>
<div className="mb-2.5"><L t="Link da sala" /><input className={inputCls} style={inputStyle} value={d.detalhes?.link ?? ""} onChange={e => setDet("link", e.target.value)} placeholder="https://… (Teams / balcão virtual)" />{!linkSessaoOk && <div className="text-[11px] mt-1" style={{ color: "var(--alerta)" }}>O link precisa começar com http:// ou https://.</div>}</div>
<div className="mb-2.5"><L t="Contato do gabinete" /><input className={inputCls} style={inputStyle} value={d.detalhes?.contato ?? ""} onChange={e => setDet("contato", e.target.value)} placeholder="e-mail · telefone" /></div>
<div className="mb-2.5"><L t="Pauta (o que levar)" /><textarea className={inputCls + " min-h-[52px] resize-y"} style={inputStyle} value={d.detalhes?.pauta ?? ""} onChange={e => setDet("pauta", e.target.value)} placeholder="Ex.: efeito suspensivo; risco de bloqueio; memorial entregue" /></div>
{!edit && <div className="rounded px-3 py-2.5 mb-2.5 text-[12px]" style={{ border: "1px solid var(--atencao)", background: "var(--atencao-tint)", color: "var(--text-secondary)" }}><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!d.criar_memorial} onChange={e => set("criar_memorial", e.target.checked)} /><span><b style={{ color: "var(--text-primary)" }}>Criar o memorial do despacho</b> · entrega 1 dia útil antes, mesmo responsável, revisor Marcelle</span></label></div>}
{edit && Array.isArray(d.detalhes?.remarcacoes) && d.detalhes.remarcacoes.length > 0 && <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>Remarcações: {d.detalhes.remarcacoes.map((a: any) => `${fmt(a.de)} → ${fmt(a.para)}`).join(" · ")}</div>}
{edit && d.detalhes?.resultado && <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>Resultado: <b style={{ color: "var(--text-primary)" }}>{RESULTADOS_DESP.find(r => r[0] === d.detalhes.resultado)?.[1] ?? d.detalhes.resultado}</b>{d.detalhes.resultado_obs ? ` · ${d.detalhes.resultado_obs}` : ""}</div>}
</>}
{isRol && <>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Data e regra</div>
<div className="grid grid-cols-2 gap-2.5 mb-2.5"><div><L t="Fazer em" req /><input type="date" className={inputCls} style={inputStyle} value={d.prazo ?? ""} onChange={e => set("prazo", e.target.value)} /></div><div><L t="Se não marcar, passa para" /><Seg opts={ROLA_OPTS} v={d.detalhes?.rola ?? "util"} set={v => setDet("rola", v)} /></div></div>
<div className="grid grid-cols-2 gap-2.5 mb-2.5"><div><L t="Avisar após" /><select className={inputCls} style={inputStyle} value={String(d.detalhes?.avisar_apos ?? 3)} onChange={e => setDet("avisar_apos", Number(e.target.value))}>{[0, 1, 2, 3, 4, 5, 7, 10].map(n => <option key={n} value={n}>{n === 0 ? "nunca avisar" : `${n} adiamento${n > 1 ? "s" : ""}`}</option>)}</select><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>sino do responsável + coordenação</div></div><div><L t="Data limite (opcional)" /><input type="date" className={inputCls} style={inputStyle} value={d.detalhes?.limite ?? ""} onChange={e => setDet("limite", e.target.value || null)} /><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>passou dela: para de rolar e vira VENCIDO</div></div></div>
<div className="rounded px-3 py-2 mb-2.5 text-[11.5px]" style={{ border: "1px dashed var(--border)", background: "var(--bg-page)", color: "var(--text-secondary)" }}>Se ninguém marcar até o fim do dia, passa sozinha para <b>{(ROLA_OPTS.find(o => o[0] === (d.detalhes?.rola ?? "util"))?.[1] ?? "").toLowerCase()}</b> (às 0h05, pulando fins de semana e feriados) e fica registrado no histórico. Sem prazo interno D-4 e sem revisão.{edit && d.detalhes?.adiamentos ? ` Já rolou ${d.detalhes.adiamentos}× desde ${fmt(d.detalhes.desde)}.` : ""}</div>
</>}
{!isJulg && !isRol && !isDesp && <>
<div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Prazos</div>
      <div className="grid grid-cols-[1.35fr_1fr_1fr] gap-3 mb-2.5">
        <div><L t="Prazo" /><div className="flex gap-2"><input type="date" className={inputCls + " min-w-0"} style={inputStyle} value={d.prazo ?? ""} onChange={e => set("prazo", e.target.value)} /><button type="button" onClick={() => setCalc(v => !v)} title="Calcular prazo (dias úteis, feriados, DJEN)" className="px-2.5 rounded border text-[14px] shrink-0" style={{ background: calc ? "var(--acao)" : "var(--bg-page)", borderColor: calc ? "var(--acao)" : "var(--border)" }}></button></div></div>
        <div><L t="É fatal?" /><Seg opts={[["1", "Sim"], ["0", "Não"]]} v={d.fatal ? "1" : "0"} set={v => set("fatal", v === "1")} /></div>
        <div><L t="Contagem" /><Seg opts={[["uteis", "Úteis"], ["corridos", "Corridos"]]} v={d.contagem ?? "uteis"} set={v => set("contagem", v)} /></div>
      </div>
      {irmas.length > 0 && <div className="rounded px-3 py-2.5 mb-2.5" style={{ border: "1px dashed var(--border)", background: "var(--bg-page)" }}>
        <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--text-primary)" }}><input type="checkbox" checked={enc.on} onChange={e => setEnc(p => ({ ...p, on: e.target.checked, de: p.de || irmas[irmas.length - 1].id }))} /> Só começa após concluir outra pendência deste caso</label>
        {enc.on && <div className="mt-2 grid gap-2">
          <select className={inputCls} style={inputStyle} value={enc.de} onChange={e => setEnc(p => ({ ...p, de: e.target.value }))}>{irmas.map(a => <option key={a.id} value={a.id}>{a.titulo} · {a.responsavel ?? "—"}{a.prazo ? ` · ${fmt(a.prazo)}` : ""}</option>)}</select>
          <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: "var(--text-primary)" }}>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={enc.modo === "fixo"} onChange={() => setEnc(p => ({ ...p, modo: "fixo" }))} /> Prazo fixo (data acima)</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={enc.modo === "rel"} onChange={() => setEnc(p => ({ ...p, modo: "rel" }))} /> <input type="number" min={1} max={60} className={inputCls + " w-14 py-1"} style={inputStyle} value={enc.uteis} onChange={e => setEnc(p => ({ ...p, uteis: Math.max(1, Number(e.target.value) || 1) }))} /> dias úteis após concluir a anterior</label>
          </div>
          <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>Fica como <b>aguardando</b> até a anterior ser concluída; aí vira “a fazer” e o responsável recebe aviso no sino.</div>
        </div>}
      </div>}
      {calc && <div className="rounded border px-3 py-3 mb-2.5" style={{ borderColor: "var(--acao)", background: "var(--bg-page)" }}><div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--acao)" }}>Calculadora de prazo</div><CalculadoraPrazo compacto supabase={supabase} tribunalInicial={inferirTribunal(caso.dados?.tribunal, caso.orgao, caso.dados?.sistema, caso.numero)} sistemaInicial={inferirSistema(caso.dados?.sistema)} contexto={caso.numero ?? caso.titulo} onUsar={(final, memo) => { set("prazo", final); const desc = (d.descricao ?? "").replace(/\n*Memória de cálculo:[\s\S]*$/, "").trim(); set("descricao", (desc ? desc + "\n\n" : "") + "Memória de cálculo:\n" + memo); setCalc(false); }} /></div>}
      {d.fatal && <div className="mb-2.5"><L t="Prazo interno (entrega pra revisão)" /><input type="date" className={inputCls} style={inputStyle} value={d.prazo_interno ?? ""} onChange={e => set("prazo_interno", e.target.value)} /><div className="text-[10px] mt-0.5" style={{ color: "var(--ok)" }}>✓ D-4 automático — ajuste se precisar</div></div>}
</>}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b flex items-center justify-between" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}><span>Recorrência</span>{d.recorrencia && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--tag-purple-bg)", color: "var(--tag-purple-fg)" }}>{labelRec(d.recorrencia)}{edit && inicial?.recorrencia_seq ? ` · ${inicial.recorrencia_seq}ª` : ""}{d.recorrencia_ativa === false ? " · pausada" : ""}</span>}</div>
      <button type="button" onClick={() => set("recorrencia", d.recorrencia ? null : recPadrao(d.prazo))} className="w-full flex items-center gap-2.5 px-3 py-2 rounded border text-left mb-2.5" style={{ background: "var(--bg-page)", borderColor: "var(--border)" }}>
        <span className="relative inline-block w-8 h-[18px] rounded-full shrink-0 transition-colors" style={{ background: d.recorrencia ? "var(--acao)" : "var(--border-strong, var(--text-secondary))" }}><span className="absolute top-[2px] w-3.5 h-3.5 rounded-full bg-surface-200 transition-all" style={{ left: d.recorrencia ? 16 : 2 }} /></span>
        <span><span className="block text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Repetir esta pendência</span><span className="block text-[10.5px]" style={{ color: "var(--text-muted)" }}>Custas mensais, comprovação de depósito, penhora de faturamento, parcelamentos… Só uma ocorrência fica aberta por vez: ao concluir, a próxima nasce sozinha.</span></span>
      </button>
      {d.recorrencia && (() => { const r = d.recorrencia as Recorrencia; const setR = (k: string, v: any) => set("recorrencia", { ...r, [k]: v }); const mensal = !(r.freq === "semanal" || r.freq === "quinzenal"); const px = d.prazo ? proximasDatas(d.prazo, r, 5, inicial?.recorrencia_seq ?? 1) : []; return (
        <div className="rounded border px-3 pt-3 pb-1 mb-2.5" style={{ borderColor: "var(--tag-purple-fg)", background: "var(--tag-purple-bg)" }}>
          <div className="grid grid-cols-3 gap-2.5 mb-2.5">
            <div><L t="Frequência" /><select className={inputCls} style={inputStyle} value={r.freq} onChange={e => setR("freq", e.target.value)}>{REC_FREQS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {mensal ? <div><L t="Dia de referência" /><select className={inputCls} style={inputStyle} value={r.dia} onChange={e => setR("dia", e.target.value)}>{REC_DIAS.map(([k, l]) => <option key={k} value={k}>{k === "fixo" && r.dia_ref ? `Todo dia ${r.dia_ref}` : l}</option>)}</select><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>vem do prazo da 1ª ocorrência</div></div> : <div><L t="Dia" /><div className="text-[11.5px] py-2" style={{ color: "var(--text-secondary)" }}>{d.prazo ? `mesmo dia da semana do prazo` : "defina o prazo acima"}</div></div>}
            {mensal && (r.dia === "fixo" || r.dia === "ult") ? <div><L t="Se cair em fim de semana" /><select className={inputCls} style={inputStyle} value={r.ajuste} onChange={e => setR("ajuste", e.target.value)}>{REC_AJUSTES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : <div />}
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div><L t="Termina" /><select className={inputCls} style={inputStyle} value={r.fim} onChange={e => setR("fim", e.target.value)}>{REC_FINS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {r.fim === "data" && <div><L t="Data final" /><input type="date" className={inputCls} style={inputStyle} value={r.fim_data ?? ""} onChange={e => setR("fim_data", e.target.value || null)} /></div>}
            {r.fim === "n" && <div><L t="Nº de ocorrências" /><input type="number" min={1} className={inputCls} style={inputStyle} value={r.fim_n ?? ""} onChange={e => setR("fim_n", e.target.value ? Number(e.target.value) : null)} /></div>}
          </div>
          <div className="rounded px-2.5 py-2 text-[11.5px] mb-2.5" style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}>{resumoRec(r)} Prazo interno D-4 e revisor valem para todas.</div>
          {d.prazo ? <div className="mb-2.5"><L t="Próximas datas previstas" /><div className="flex flex-wrap gap-1.5 mt-1">{px.length ? px.map((x, i) => <span key={x} className="text-[10.5px] px-2 py-0.5 rounded-full border" style={{ borderColor: i === 0 ? "var(--tag-purple-fg)" : "var(--border-strong, var(--text-secondary))", borderStyle: i === 0 ? "solid" : "dashed", background: "var(--bg-card)", color: "var(--text-secondary)" }}>{fmt(x)}</span>) : <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>a série termina nesta ocorrência</span>}</div></div> : <div className="text-[11px] italic mb-2.5" style={{ color: "var(--text-muted)" }}>Defina o prazo da 1ª ocorrência acima para ver a prévia.</div>}
          {edit && inicial?.recorrencia && <div className="flex gap-2 mb-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={() => set("recorrencia_ativa", d.recorrencia_ativa === false ? true : false)} className="px-2.5 py-1.5 rounded border text-[11px] font-medium" style={{ borderColor: "var(--border-strong, var(--text-secondary))", color: "var(--text-primary)", background: "var(--bg-card)" }}>{d.recorrencia_ativa === false ? "▶ Retomar recorrência" : "Pausar recorrência"}</button>
            <button type="button" onClick={() => set("recorrencia", null)} className="px-2.5 py-1.5 rounded border text-[11px] font-medium" style={{ borderColor: "var(--border-strong, var(--text-secondary))", color: "var(--text-primary)", background: "var(--bg-card)" }}>Encerrar recorrência</button>
            <span className="text-[10px] self-center" style={{ color: "var(--text-muted)" }}>Pausar segura a próxima; encerrar transforma esta em pendência avulsa. Ocorrências já concluídas ficam no histórico.</span>
          </div>}
        </div>); })()}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Revisão e prioridade</div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Revisor" /><select className={inputCls} style={inputStyle} value={d.revisor ?? ""} onChange={e => set("revisor", e.target.value)}><option value="">Sem revisão</option>{COORDENADORES.map(r => <option key={r}>{r}</option>)}</select></div>
        <div><L t="Prioridade" /><Seg opts={[["baixa", "Baixa"], ["normal", "Normal"], ["alta", "Alta"]]} v={d.prioridade ?? "normal"} set={v => set("prioridade", v)} /></div>
      </div>
      {edit && <div className="mb-2.5"><L t="Status" /><select className={inputCls} style={inputStyle} value={d.status} onChange={e => set("status", e.target.value)}>{Object.entries(STATUS_PEND).map(([k, s]) => <option key={k} value={k}>{s.l}</option>)}</select></div>}
      <div><L t="Descrição / providência" /><textarea className={inputCls + " min-h-[70px] resize-y"} style={inputStyle} value={d.descricao ?? ""} onChange={e => set("descricao", e.target.value)} /></div>
      {(edit || FLUXO_PECA.includes(d.tipo)) && <div className="mt-2.5"><L t={isMemo ? "Link do memorial (Word / Google Drive)" : "Link da peça (Word / Google Drive)"} /><input className={inputCls} style={inputStyle} value={d.arquivo_url ?? ""} onChange={e => set("arquivo_url", e.target.value)} placeholder="https://… (cole o link do arquivo; vazio = sem arquivo)" />{!linkOk && <div className="text-[11px] mt-1" style={{ color: "var(--alerta)" }}>O link precisa começar com http:// ou https://.</div>}</div>}
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── Histórico da pendência (eventos) ───────── */
function useEventos(pendId: string, supabase: ReturnType<typeof createClient>) {
  const [evs, setEvs] = useState<PendEvento[] | null>(null);
  useEffect(() => { let on = true; supabase.from("pendencia_eventos").select("*").eq("pendencia_id", pendId).order("criado_em", { ascending: false }).limit(30).then(({ data }) => { if (on) setEvs((data ?? []) as PendEvento[]); }); return () => { on = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendId]);
  return evs;
}
export function Historico({ evs }: { evs: PendEvento[] | null }) {
  if (evs === null) return <div className="text-[11px] py-2" style={{ color: "var(--text-muted)" }}>Carregando histórico…</div>;
  if (!evs.length) return <div className="text-[11px] py-2 italic" style={{ color: "var(--text-muted)" }}>Sem eventos ainda.</div>;
  return <div>{evs.map(e => <div key={e.id} className="py-1.5 border-b last:border-b-0 text-[11.5px]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{e.autor ?? "—"}</b> {e.acao}<span className="ml-1.5 text-[10.5px]" style={{ color: "var(--text-muted)" }}>{fmtDT(e.criado_em)}</span>{e.obs && <div className="mt-0.5 italic" style={{ color: "var(--text-secondary)" }}>“{e.obs}”</div>}</div>)}</div>;
}
const DocLink = ({ p, supabase, usuario, onSaved }: { p: Pendencia; supabase?: ReturnType<typeof createClient>; usuario?: string; onSaved?: () => void }) => {
  // Troca do anexo (link da peça) por qualquer usuário: grava só arquivo_url (versão não muda) + evento "trocou o anexo"
  const [editando, setEditando] = useState(false); const [url, setUrl] = useState(p.arquivo_url ?? ""); const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const podeTrocar = !!supabase; const okUrl = /^https?:\/\//i.test(url.trim());
  async function trocar() {
    if (!supabase || !okUrl) return; setSalvando(true); setErro(null);
    const { error } = await supabase.from("caso_pendencias").update({ arquivo_url: url.trim() }).eq("id", p.id);
    if (error) { setSalvando(false); setErro(error.message); return; }
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || "—", acao: `trocou o anexo · v${p.versao ?? 1}`, obs: url.trim() });
    setSalvando(false); setEditando(false); onSaved?.();
  }
  if (editando) return (
    <div className="px-3 py-2.5 rounded border border-dashed text-xs" style={{ background: "var(--bg-page)", borderColor: "var(--acao)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Novo link da peça (Word / Google Drive)</div>
      <input className={inputCls} style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" autoFocus />
      {erro && <div className="mt-1" style={{ color: "var(--alerta)" }}>{erro}</div>}
      <div className="flex gap-2 mt-2"><button type="button" disabled={!okUrl || salvando} onClick={trocar} className="px-2.5 py-1 rounded font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{salvando ? "Salvando…" : "Salvar link"}</button><button type="button" onClick={() => { setEditando(false); setUrl(p.arquivo_url ?? ""); setErro(null); }} className="px-2.5 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
    </div>
  );
  return p.arquivo_url ? (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-dashed text-xs" style={{ background: "var(--bg-page)", borderColor: "var(--border-strong, var(--text-secondary))" }}><div className="min-w-0"><b className="block truncate" style={{ color: "var(--text-primary)" }}>{decodeURIComponent(p.arquivo_url.split("/").pop()?.split("?")[0] || "peça")}</b><span style={{ color: "var(--text-muted)" }}>v{p.versao ?? 1}{p.enviado_em ? ` · enviada ${fmtDT(p.enviado_em)}` : ""}</span></div><a href={p.arquivo_url} target="_blank" rel="noreferrer" className="ml-auto whitespace-nowrap font-medium" style={{ color: "var(--acao)" }}>abrir no Word ↗</a>{podeTrocar && <button type="button" onClick={() => setEditando(true)} className="whitespace-nowrap underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }} title="Trocar o link da peça">trocar</button>}</div>
  ) : <div className="px-3 py-2.5 rounded border border-dashed text-xs italic flex items-center gap-2" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Sem arquivo vinculado.{podeTrocar && <button type="button" onClick={() => setEditando(true)} className="not-italic font-medium" style={{ color: "var(--acao)" }}>vincular link</button>}</div>;
};

/* ───────── Enviar / reenviar para revisão (advogado) ───────── */
export function EnviarDrawer({ p, contexto, usuario, onClose, onSaved, supabase }: { p: Pendencia; contexto: string; usuario: string; onClose: () => void; onSaved: () => void; supabase: ReturnType<typeof createClient> }) {
  const re = p.status === "devolvida"; const v = (p.versao ?? 0) + 1;
  const [url, setUrl] = useState(p.arquivo_url ?? ""); const [revisor, setRevisor] = useState(p.revisor && COORDS.includes(p.revisor) ? p.revisor : "Marcelle"); const [obs, setObs] = useState(""); const [prazo, setPrazo] = useState(p.prazo ?? "");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const evs = useEventos(p.id, supabase);
  const ok = /^https?:\/\//i.test(url.trim()) && !!revisor;
  async function enviar() {
    if (!ok) return; setSaving(true); setErro(null);
    const upd: Record<string, any> = { status: "revisao_pendente", arquivo_url: url.trim(), versao: v, revisor, enviado_em: new Date().toISOString(), devolucao_obs: null };
    if (prazo && prazo !== p.prazo) { upd.prazo = prazo; upd.fatal = true; upd.prazo_interno = (p.contagem ?? "uteis") === "uteis" ? subUteis(prazo, 4) : subCorridos(prazo, 4); }
    const { error } = await supabase.from("caso_pendencias").update(upd).eq("id", p.id);
    if (error) { setSaving(false); setErro(error.message); return; }
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario, acao: `${re ? "reenviou" : "enviou"} para revisão de ${revisor} · v${v}`, obs: obs.trim() || null });
    setSaving(false); onSaved();
  }
  return (
    <Drawer title={`${re ? "Reenviar" : "Enviar"} para revisão · ${p.titulo}`} sub={contexto} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>* obrigatórios</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={enviar} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Enviando…" : `${re ? "Reenviar" : "Enviar"} para ${revisor}`}</button></div></>}>
      {re && p.devolucao_obs && <div className="mb-3 px-3 py-2 rounded-sm text-[11.5px]" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>Ajustes pedidos por {p.revisor}:</b> {p.devolucao_obs}</div>}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>A peça</div>
      <div className="mb-2.5"><L t="Link do arquivo no Google Drive" req /><input className={inputCls} style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} autoFocus placeholder="https://drive.google.com/…/Peca_v1.docx" /><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Cole o link do Word onde a peça já está salva — o arquivo continua lá, o sistema só guarda o caminho.</div></div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Versão" /><input className={inputCls} style={inputStyle} value={`v${v}`} readOnly /><div className="text-[10px] mt-0.5" style={{ color: "var(--ok)" }}>✓ automática{re ? ` — v${p.versao} foi devolvida` : ""}</div></div>
        <div><L t="Revisor" req /><select className={inputCls} style={inputStyle} value={revisor} onChange={e => setRevisor(e.target.value)}>{COORDS.map(c => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Para o revisor</div>
      <div className="mb-2.5"><L t="Observações" /><textarea className={inputCls + " min-h-[70px] resize-y"} style={inputStyle} value={obs} onChange={e => setObs(e.target.value)} placeholder={re ? "O que foi ajustado nesta versão…" : "Pontos de atenção, dúvidas, tese adotada…"} /></div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Prazo fatal" /><input type="date" className={inputCls} style={inputStyle} value={prazo} onChange={e => setPrazo(e.target.value)} /><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Se ainda não tiver, o revisor preenche.</div></div>
        <div><L t="Prazo interno" /><input className={inputCls} style={inputStyle} value={prazo ? fmt((p.contagem ?? "uteis") === "uteis" ? subUteis(prazo, 4) : subCorridos(prazo, 4)) : "D-4 automático"} readOnly /></div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>O que acontece ao enviar</div>
      <div className="text-[11.5px] space-y-1" style={{ color: "var(--text-secondary)" }}><div><b>1.</b> status → <Pz t="revisão pendente" cls="rev" /> · revisor {revisor}</div><div><b>2.</b> entra na fila <b>Revisão pendente</b> de {revisor} na mesma hora</div><div><b>3.</b> aqui a linha fica “Aguardando {revisor}” até aprovar ou devolver</div></div>
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Histórico</div>
      <Historico evs={evs} />
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── Revisar (coordenador): devolver · subir · aprovar ───────── */
export function RevisarDrawer({ p, contexto, usuario, onClose, onSaved, supabase }: { p: Pendencia; contexto: string; usuario: string; onClose: () => void; onSaved: () => void; supabase: ReturnType<typeof createClient> }) {
  const [obs, setObs] = useState(""); const [destino, setDestino] = useState<"pronta_protocolar" | "concluida">("pronta_protocolar");
  const [modo, setModo] = useState<null | "devolver" | "subir">(null);
  const acima = COORDS.filter(c => !mesmoNome(c, usuario) && !mesmoNome(c, p.revisor)); // para quem posso subir
  const [paraCima, setParaCima] = useState(acima[0] ?? "");
  const [verDeNovo, setVerDeNovo] = useState(false);
  const podeDevolverRevisor = !!p.revisor_anterior && !mesmoNome(p.revisor_anterior, usuario) && ehCoordenador(p.revisor_anterior);
  const [paraBaixo, setParaBaixo] = useState<"responsavel" | "revisor">(podeDevolverRevisor ? "revisor" : "responsavel");
  const [saving, setSaving] = useState<null | "ok" | "dev" | "up">(null); const [erro, setErro] = useState<string | null>(null);
  const evs = useEventos(p.id, supabase);
  const v = p.versao ?? 1;
  async function grava(upd: Record<string, any>, acao: string, extra?: () => Promise<void>) {
    const { error } = await supabase.from("caso_pendencias").update(upd).eq("id", p.id);
    if (error) { setSaving(null); setErro(error.message); return false; }
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario, acao, obs: obs.trim() || null });
    if (extra) await extra();
    setSaving(null); onSaved(); return true;
  }
  async function devolver() {
    if (obs.trim().length < 3) { setErro("Descreva o motivo da devolução."); return; }
    setSaving("dev"); setErro(null);
    if (paraBaixo === "revisor" && podeDevolverRevisor) {
      // volta para o revisor anterior (divergência de tese), continua em revisão
      await grava({ revisor: p.revisor_anterior, revisor_anterior: null, subida_por: usuario, subida_obs: obs.trim(), origem_revisao: "devolucao_de_cima", devolucao_obs: null }, `devolveu para ${primeiroNome(p.revisor_anterior!)} (revisão) · v${v}`);
    } else {
      await grava({ status: "devolvida", devolucao_obs: obs.trim(), revisor_anterior: null, subida_por: null, subida_obs: null, origem_revisao: null, retorno_para: null }, `devolveu com ajustes · v${v}`);
    }
  }
  async function subir() {
    if (!paraCima) { setErro("Escolha para quem subir."); return; }
    setSaving("up"); setErro(null);
    await grava({ revisor: paraCima, revisor_anterior: usuario, subida_por: usuario, subida_obs: obs.trim() || null, origem_revisao: "subida", retorno_para: verDeNovo ? usuario : (p.retorno_para ?? null), devolucao_obs: null }, `subiu para ${primeiroNome(paraCima)} · v${v}`);
  }
  async function aprovar() {
    setSaving("ok"); setErro(null);
    if (p.retorno_para && !mesmoNome(p.retorno_para, usuario)) {
      // quem subiu pediu para ver de novo antes de fechar
      await grava({ revisor: p.retorno_para, revisor_anterior: null, subida_por: usuario, subida_obs: `Aprovei.${obs.trim() ? " " + obs.trim() : ""}`, origem_revisao: "retorno_aprovado", retorno_para: null }, `aprovou e devolveu para ${primeiroNome(p.retorno_para)} fechar · v${v}`);
      return;
    }
    await grava({ status: destino, devolucao_obs: null, revisor_anterior: null, subida_por: null, subida_obs: null, origem_revisao: null, retorno_para: null, ...(destino === "concluida" ? { concluida_em: new Date().toISOString() } : {}) },
      `aprovou · ${destino === "concluida" ? "protocolado" : "pendente de protocolo"} · v${v}`,
      async () => { if (destino === "concluida" && p.tipo === "peca" && p.caso_id) await supabase.from("caso_andamentos").insert({ caso_id: p.caso_id, empresa_id: p.empresa_id, data: hoje(), descricao: `Concluída: ${p.titulo}${p.responsavel ? ` (${p.responsavel})` : ""} · v${v}`, fonte: "manual" }); });
  }
  const parecer = p.subida_obs && (p.origem_revisao === "subida" || p.origem_revisao === "devolucao_de_cima" || p.origem_revisao === "retorno_aprovado");
  return (
    <Drawer title={`Revisar · ${p.titulo}`} sub={contexto} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Quem recebe é avisado na hora.</div><div className="flex gap-2 flex-wrap justify-end">
        <button onClick={() => setModo(m => m === "devolver" ? null : "devolver")} disabled={!!saving} className="px-3 py-1.5 rounded text-xs font-medium border disabled:opacity-50" style={{ background: modo === "devolver" ? "var(--tag-amber-bg)" : "var(--bg-surface)", borderColor: modo === "devolver" ? "var(--atencao)" : "var(--border)", color: "var(--atencao)" }}>↩ Devolver</button>
        {acima.length > 0 && <button onClick={() => setModo(m => m === "subir" ? null : "subir")} disabled={!!saving} className="px-3 py-1.5 rounded text-xs font-medium border disabled:opacity-50" style={{ background: modo === "subir" ? "var(--destaque-tint)" : "var(--bg-surface)", borderColor: modo === "subir" ? "var(--destaque)" : "var(--border)", color: "var(--destaque)" }}>⇧ Subir</button>}
        <button onClick={aprovar} disabled={!!saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{saving === "ok" ? "Gravando…" : p.retorno_para && !mesmoNome(p.retorno_para, usuario) ? `✓ Aprovar → volta para ${primeiroNome(p.retorno_para)}` : "✓ Aprovar"}</button></div></>}>
      <div className="mb-2"><Cadeia p={p} /></div>
      {parecer && <div className="mb-3 px-3 py-2 rounded-sm text-[11.5px]" style={{ border: `1px solid ${corRevisor(p.subida_por).fg}`, background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{p.origem_revisao === "devolucao_de_cima" ? `${primeiroNome(p.subida_por)} devolveu para você:` : p.origem_revisao === "retorno_aprovado" ? `${primeiroNome(p.subida_por)}:` : `Parecer de ${primeiroNome(p.subida_por)}:`}</b> {p.subida_obs}</div>}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Peça</div>
      <DocLink p={p} supabase={supabase} usuario={usuario} onSaved={onSaved} />
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Contexto</div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-2 text-xs">
        <div><div className={labelCls} style={{ color: "var(--text-muted)" }}>Responsável</div>{p.responsavel ?? "—"}</div>
        <div><div className={labelCls} style={{ color: "var(--text-muted)" }}>Tipo</div>{TIPOS_PEND.find(t => t[0] === p.tipo)?.[1] ?? p.tipo}</div>
        <div><div className={labelCls} style={{ color: "var(--text-muted)" }}>Prazo interno (D-4)</div>{p.prazo_interno ? <Pz t={fmt(p.prazo_interno)} cls={(diasAte(p.prazo_interno) ?? 9) < 0 ? "fatal" : (diasAte(p.prazo_interno) ?? 9) <= 1 ? "prox" : "mut"} /> : "—"}</div>
        <div><div className={labelCls} style={{ color: "var(--text-muted)" }}>Prazo fatal</div>{prazoPz(p)}</div>
      </div>
      {p.descricao && <div className="text-xs mt-2.5" style={{ color: "var(--text-secondary)" }}>{p.descricao}</div>}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Sua revisão</div>
      <div className="mb-2.5"><textarea className={inputCls + " min-h-[90px] resize-y"} style={inputStyle} value={obs} onChange={e => { setObs(e.target.value); setErro(null); }} autoFocus placeholder="Comentários (ficam no histórico e vão para quem recebe)" /></div>
      {modo === "subir" && (
        <div className="mb-2.5 px-3 py-2.5 rounded border text-xs flex flex-wrap items-center gap-2" style={{ borderColor: "var(--destaque)", background: "var(--bg-page)", color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--destaque)", fontWeight: 600 }}>⇧ Subir para</span>
          <select className={inputCls + " !w-auto"} style={inputStyle} value={paraCima} onChange={e => setParaCima(e.target.value)}>{acima.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={verDeNovo} onChange={e => setVerDeNovo(e.target.checked)} /> quero ver de novo antes de fechar</label>
          <button onClick={subir} disabled={!!saving} className="ml-auto px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--destaque)" }}>{saving === "up" ? "Subindo…" : `⇧ Subir para ${primeiroNome(paraCima)}`}</button>
        </div>
      )}
      {modo === "devolver" && (
        <div className="mb-2.5 px-3 py-2.5 rounded border text-xs flex flex-wrap items-center gap-2" style={{ borderColor: "var(--atencao)", background: "var(--bg-page)", color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--atencao)", fontWeight: 600 }}>↩ Devolver para</span>
          {podeDevolverRevisor ? (
            <select className={inputCls + " !w-auto"} style={inputStyle} value={paraBaixo} onChange={e => setParaBaixo(e.target.value as any)}><option value="revisor">{p.revisor_anterior} (revisor anterior)</option><option value="responsavel">{p.responsavel ?? "responsável"} (quem escreveu)</option></select>
          ) : <b style={{ color: "var(--text-primary)" }}>{p.responsavel ?? "responsável"}</b>}
          <button onClick={devolver} disabled={!!saving} className="ml-auto px-3 py-1.5 rounded text-xs font-medium border disabled:opacity-50" style={{ background: "var(--bg-surface)", borderColor: "var(--atencao)", color: "var(--atencao)" }}>{saving === "dev" ? "Devolvendo…" : "↩ Devolver"}</button>
        </div>
      )}
      {!(p.retorno_para && !mesmoNome(p.retorno_para, usuario)) && <div className="mb-2.5"><L t="Se aprovar, marcar como" /><select className={inputCls} style={inputStyle} value={destino} onChange={e => setDestino(e.target.value as any)}><option value="pronta_protocolar">Pendente de protocolo (responsável protocola)</option><option value="concluida">Protocolado · eu mesmo(a) protocolo → concluída</option></select></div>}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Histórico desta peça</div>
      <Historico evs={evs} />
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── Botão de ação da peça conforme status e quem está logado ───────── */
export function AcaoPeca({ p, eu, onEnviar, onRevisar, onProtocolei }: { p: Pendencia; eu: string; onEnviar: () => void; onRevisar: () => void; onProtocolei: () => void }) {
  if (p.status === "concluida") return null;
  const btn = "px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap";
  // "Enviar para revisão" só para peças; mas Revisar / Reenviar / Protocolei aparecem em qualquer tipo que esteja no fluxo de revisão
  if (!FLUXO_PECA.includes(p.tipo) && !(p.recorrencia && p.revisor) && (p.status === "a_fazer" || p.status === "em_elaboracao")) return null; // rotina com revisor: qualquer tipo passa pela revisão
  if (p.status === "a_fazer" || p.status === "em_elaboracao") return <button onClick={onEnviar} className={btn + " text-on-acao"} style={{ background: "var(--acao)" }}>Enviar para revisão</button>;
  if (p.status === "devolvida") return <button onClick={onEnviar} className={btn + " text-on-acao"} style={{ background: "var(--acao)" }}>Reenviar (v{(p.versao ?? 0) + 1})</button>;
  if (p.status === "revisao_pendente") return mesmoNome(p.revisor, eu) ? <button onClick={onRevisar} className={btn + " text-on-acao"} style={{ background: "var(--acao)" }}>✓ Revisar</button> : <span className={btn + " border"} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>com <NomeRev n={p.revisor ?? "revisão"} />{p.subida_por && !mesmoNome(p.subida_por, p.revisor) ? <span> (via {primeiroNome(p.subida_por)})</span> : null}</span>;
  if (p.status === "pronta_protocolar") return <button onClick={onProtocolei} className={btn + " text-on-acao"} style={{ background: "var(--ok)" }}>{p.recorrencia?.registrar_documento ? "✓ Enviado ao cliente" : "✓ Protocolei"}</button>;
  return null;
}

/* ───────── Concluir julgamento: realizado / adiado / retirado / vista (não grava andamento) ───────── */
export function ConcluirJulgamento({ p, usuario, supabase, onClose, onSaved }: { p: Pendencia; usuario: string; supabase: ReturnType<typeof createClient>; onClose: () => void; onSaved: () => void }) {
const [res, setRes] = useState("realizado"); const [obs, setObs] = useState(""); const [nova, setNova] = useState(""); const [novaHora, setNovaHora] = useState((p.hora ?? "").slice(0, 5));
const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
const adiar = res === "adiado";
async function salvar() {
if (adiar && !nova) { setErro("Informe a nova data."); return; }
setSaving(true); setErro(null);
const dt: Record<string, any> = { ...(p.detalhes ?? {}) };
const rot = RESULTADOS_JULG.find(r => r[0] === res)?.[1] ?? res;
let upd: Record<string, any>; let acao: string;
if (adiar) { dt.adiamentos = [...(Array.isArray(dt.adiamentos) ? dt.adiamentos : []), { de: p.prazo, de_hora: p.hora ?? null, para: nova, para_hora: novaHora || null, obs: obs.trim() || null, em: new Date().toISOString(), por: usuario }]; upd = { prazo: nova, hora: novaHora || null, detalhes: dt }; acao = `adiou o julgamento de ${fmt(p.prazo)} para ${fmt(nova)}${novaHora ? " " + novaHora : ""}`; }
else { dt.resultado = res; dt.resultado_obs = obs.trim() || null; upd = { status: "concluida", concluida_em: new Date().toISOString(), detalhes: dt }; acao = `concluiu o julgamento · ${rot.toLowerCase()}`; }
const { error } = await supabase.from("caso_pendencias").update(upd).eq("id", p.id);
if (error) { setSaving(false); setErro(error.message); return; }
await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || null, acao, obs: obs.trim() || null });
setSaving(false); onSaved();
}
return (<>
<div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
<div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
<h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Concluir julgamento</h3>
<div className="text-[11px] mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>{p.titulo} · {fmt(p.prazo)}{p.hora ? ` · ${p.hora.slice(0, 5)}` : ""}</div>
<L t="O que aconteceu?" /><Seg opts={RESULTADOS_JULG} v={res} set={setRes} />
{adiar && <div className="grid grid-cols-2 gap-2.5 mt-3"><div><L t="Nova data" req /><input type="date" className={inputCls} style={inputStyle} value={nova} onChange={e => setNova(e.target.value)} /></div><div><L t="Horário" /><input type="time" className={inputCls} style={inputStyle} value={novaHora} onChange={e => setNovaHora(e.target.value)} /></div></div>}
<div className="mt-3"><L t={adiar ? "Motivo (opcional)" : "Resultado / nota (opcional)"} /><textarea className={inputCls + " min-h-[60px] resize-y"} style={inputStyle} value={obs} onChange={e => setObs(e.target.value)} placeholder={adiar ? "Ex.: adiado a pedido do relator" : "Ex.: provido por unanimidade; acórdão a publicar"} /></div>
<div className="text-[10.5px] mt-2" style={{ color: "var(--text-muted)" }}>{adiar ? "A pendência continua aberta com a nova data; o adiamento fica no histórico." : "Nenhum andamento é gravado: o andamento oficial vem pela publicação (Alerte)."}</div>
{erro && <div className="mt-2 text-[11px]" style={{ color: "var(--alerta)" }}>{erro}</div>}
<div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: adiar ? "var(--atencao)" : "var(--ok)" }}>{saving ? "Gravando…" : adiar ? "Adiar" : "Concluir"}</button></div>
</div>
</>);
}

/* ───────── Despacho: marcar pedido · agendar · concluir (não grava andamento) ───────── */
export async function marcarPedidoDespacho(supabase: ReturnType<typeof createClient>, p: Pendencia, usuario: string) {
const dt = { ...(p.detalhes ?? {}), etapa: "pedido", pedido_em: new Date().toISOString().slice(0, 10) };
const { error } = await supabase.from("caso_pendencias").update({ detalhes: dt }).eq("id", p.id);
if (!error) await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || null, acao: "despacho: pedido enviado ao gabinete" });
return error;
}
export function AcoesDespacho({ p, onPedido, onAgendar, onConcluir }: { p: Pendencia; onPedido: () => void; onAgendar: () => void; onConcluir: () => void }) {
if (p.tipo !== "despacho" || p.status === "concluida") return null;
const b = "px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap"; const st = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };
const et = p.detalhes?.etapa ?? "a_pedir";
return <>{et === "a_pedir" && <button onClick={onPedido} className={b} style={st}>Marcar como pedido</button>}{et !== "agendado" && <button onClick={onAgendar} className={b} style={st}>Agendar…</button>}{et === "agendado" && <button onClick={onConcluir} className={b + " text-on-acao"} style={{ background: "var(--ok)", borderColor: "var(--ok)" }}>✓ Concluir</button>}</>;
}
const Modal = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (<>
<div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
<div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>{children}</div>
</>);
export function AgendarDespacho({ p, usuario, supabase, onClose, onSaved }: { p: Pendencia; usuario: string; supabase: ReturnType<typeof createClient>; onClose: () => void; onSaved: () => void }) {
const [data, setData] = useState(""); const [hora, setHora] = useState((p.hora ?? "").slice(0, 5)); const [link, setLink] = useState(p.detalhes?.link ?? ""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
async function salvar() {
if (!data) { setErro("Informe a data do despacho."); return; }
if (link.trim() && !/^https?:\/\//i.test(link.trim())) { setErro("O link precisa começar com http:// ou https://."); return; }
setSaving(true); setErro(null);
const dt = { ...(p.detalhes ?? {}), etapa: "agendado", link: link.trim() || null };
const { error } = await supabase.from("caso_pendencias").update({ prazo: data, hora: hora || null, detalhes: dt }).eq("id", p.id);
if (error) { setSaving(false); setErro(error.message); return; }
await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || null, acao: `despacho agendado para ${fmt(data)}${hora ? " às " + hora : ""}` });
setSaving(false); onSaved();
}
return <Modal onClose={onClose}>
<h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Agendar despacho</h3>
<div className="text-[11px] mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>{p.titulo}</div>
<div className="grid grid-cols-2 gap-2.5"><div><L t="Data" req /><input type="date" className={inputCls} style={inputStyle} value={data} onChange={e => setData(e.target.value)} autoFocus /></div><div><L t="Horário" /><input type="time" className={inputCls} style={inputStyle} value={hora} onChange={e => setHora(e.target.value)} /></div></div>
<div className="mt-3"><L t="Link da sala (opcional)" /><input className={inputCls} style={inputStyle} value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" /></div>
{erro && <div className="mt-2 text-[11px]" style={{ color: "var(--alerta)" }}>{erro}</div>}
<div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Gravando…" : "Agendar"}</button></div>
</Modal>;
}
export function ConcluirDespacho({ p, usuario, supabase, onClose, onSaved }: { p: Pendencia; usuario: string; supabase: ReturnType<typeof createClient>; onClose: () => void; onSaved: () => void }) {
const [res, setRes] = useState("realizado"); const [obs, setObs] = useState(""); const [nova, setNova] = useState(""); const [novaHora, setNovaHora] = useState((p.hora ?? "").slice(0, 5));
const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
const rem = res === "remarcado";
async function salvar() {
if (rem && !nova) { setErro("Informe a nova data."); return; }
setSaving(true); setErro(null);
const dt: Record<string, any> = { ...(p.detalhes ?? {}) };
const rot = RESULTADOS_DESP.find(r => r[0] === res)?.[1] ?? res;
let upd: Record<string, any>; let acao: string;
if (rem) { dt.remarcacoes = [...(Array.isArray(dt.remarcacoes) ? dt.remarcacoes : []), { de: p.prazo, de_hora: p.hora ?? null, para: nova, para_hora: novaHora || null, obs: obs.trim() || null, em: new Date().toISOString(), por: usuario }]; dt.etapa = "agendado"; upd = { prazo: nova, hora: novaHora || null, detalhes: dt }; acao = `remarcou o despacho de ${fmt(p.prazo)} para ${fmt(nova)}${novaHora ? " " + novaHora : ""}`; }
else { dt.resultado = res; dt.resultado_obs = obs.trim() || null; upd = { status: "concluida", concluida_em: new Date().toISOString(), detalhes: dt }; acao = `concluiu o despacho · ${rot.toLowerCase()}`; }
const { error } = await supabase.from("caso_pendencias").update(upd).eq("id", p.id);
if (error) { setSaving(false); setErro(error.message); return; }
await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || null, acao, obs: obs.trim() || null });
setSaving(false); onSaved();
}
return <Modal onClose={onClose}>
<h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Concluir despacho</h3>
<div className="text-[11px] mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>{p.titulo} · {fmt(p.prazo)}{p.hora ? ` · ${p.hora.slice(0, 5)}` : ""}</div>
<L t="O que aconteceu?" /><Seg opts={RESULTADOS_DESP} v={res} set={setRes} />
{rem && <div className="grid grid-cols-2 gap-2.5 mt-3"><div><L t="Nova data" req /><input type="date" className={inputCls} style={inputStyle} value={nova} onChange={e => setNova(e.target.value)} /></div><div><L t="Horário" /><input type="time" className={inputCls} style={inputStyle} value={novaHora} onChange={e => setNovaHora(e.target.value)} /></div></div>}
<div className="mt-3"><L t={rem ? "Motivo (opcional)" : "O que foi dito (opcional)"} /><textarea className={inputCls + " min-h-[60px] resize-y"} style={inputStyle} value={obs} onChange={e => setObs(e.target.value)} placeholder={rem ? "Ex.: gabinete remarcou a pedido da relatora" : "Ex.: relatora vai levar em mesa na sessão de 11/11"} /></div>
<div className="text-[10.5px] mt-2" style={{ color: "var(--text-muted)" }}>{rem ? "A pendência continua aberta com a nova data; a remarcação fica no histórico." : "Nenhum andamento é gravado no processo."}</div>
{erro && <div className="mt-2 text-[11px]" style={{ color: "var(--alerta)" }}>{erro}</div>}
<div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: rem ? "var(--atencao)" : "var(--ok)" }}>{saving ? "Gravando…" : rem ? "Remarcar" : "Concluir"}</button></div>
</Modal>;
}

/* ───────── Adiar rolante à mão ───────── */
export function AdiarRolante({ p, usuario, supabase, onClose, onSaved }: { p: Pendencia; usuario: string; supabase: ReturnType<typeof createClient>; onClose: () => void; onSaved: () => void }) {
const [data, setData] = useState(""); const [motivo, setMotivo] = useState(""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
async function salvar() {
if (!data) { setErro("Escolha a nova data."); return; }
setSaving(true); setErro(null);
const dt: Record<string, any> = { ...(p.detalhes ?? {}) }; dt.manuais = Number(dt.manuais ?? 0) + 1; if (!dt.desde) dt.desde = p.prazo;
const { error } = await supabase.from("caso_pendencias").update({ prazo: data, detalhes: dt }).eq("id", p.id);
if (error) { setSaving(false); setErro(error.message); return; }
await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: usuario || null, acao: `adiou manualmente de ${fmt(p.prazo)} para ${fmt(data)}`, obs: motivo.trim() || null });
setSaving(false); onSaved();
}
return (<>
<div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
<div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
<h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Adiar para…</h3>
<div className="text-[11px] mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>{p.titulo} · hoje em {fmt(p.prazo)}</div>
<L t="Nova data" req /><input type="date" className={inputCls} style={inputStyle} value={data} onChange={e => setData(e.target.value)} autoFocus />
<div className="mt-3"><L t="Motivo (opcional)" /><input className={inputCls} style={inputStyle} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: cliente viaja, volta terça" /></div>
<div className="text-[10.5px] mt-2" style={{ color: "var(--text-muted)" }}>Fica no histórico como adiamento manual (não soma no contador automático).</div>
{erro && <div className="mt-2 text-[11px]" style={{ color: "var(--alerta)" }}>{erro}</div>}
<div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Gravando…" : "Adiar"}</button></div>
</div>
</>);
}

/* ───────── Andamento ───────── */
export function AndDrawer({ caso, inicial, consultaDe, onClose, onSaved, onDel, onCriarPend, supabase }: { caso: Caso; inicial?: Andamento; consultaDe?: AcompItem; onClose: () => void; onSaved: () => void; onDel?: (a: Andamento) => void; onCriarPend: (a: Andamento) => void; supabase: ReturnType<typeof createClient> }) {
  const edit = !!inicial;
  const [opAc, setOpAc] = useState<OpAcomp>({ tipo: "nada" });
  const [d, setD] = useState<Record<string, any>>(() => inicial ? { ...inicial } : { data: hoje(), fonte: "manual", gerar: false });
  const set = (k: string, v: any) => setD(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const ok = !!d.data && (d.descricao ?? "").trim().length > 2;
  async function salvar() {
    if (!ok) return; setSaving(true); setErro(null);
    const payload: Record<string, any> = { caso_id: caso.id, empresa_id: caso.empresa_id, data: d.data, hora: d.hora || null, descricao: d.descricao.trim(), fonte: d.fonte, anexo_url: d.anexo_url?.trim() || null, urgente: !!d.urgente, urgente_motivo: d.urgente ? (d.urgente_motivo?.trim() || null) : null };
    if (!d.urgente) { payload.urgente_tratado_em = null; payload.urgente_tratado_por = null; }
    const res = edit ? await supabase.from("caso_andamentos").update(payload).eq("id", inicial!.id).select().single() : await supabase.from("caso_andamentos").insert(payload).select().single();
    if (!res.error && !edit && res.data) { try { await aplicarAcompAndamento(supabase, caso, res.data as Andamento, consultaDe, opAc); } catch { /* acompanhamento não bloqueia o andamento */ } }
    setSaving(false); if (res.error) { setErro(res.error.message); return; }
    if (!edit && d.gerar && res.data) { onCriarPend(res.data as Andamento); return; }
    onSaved();
  }
  return (
    <Drawer title={edit ? "Modificar andamento" : "Novo andamento"} sub={consultaDe ? `Registrando a consulta de hoje · ${caso.titulo}${caso.numero ? " · " + caso.numero : ""}` : "Registre o que aconteceu no caso. Se o andamento abre um prazo, crie a pendência em seguida."} onClose={onClose}
      footer={<Foot onClose={onClose} onSave={salvar} ok={ok} saving={saving} edit={edit} onDel={onDel && inicial ? () => onDel(inicial) : undefined} />}>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div><L t="Data" req /><input type="date" className={inputCls} style={inputStyle} value={d.data ?? ""} onChange={e => set("data", e.target.value)} /></div>
        <div><L t="Hora" /><input className={inputCls} style={inputStyle} value={d.hora ?? ""} placeholder="14:02" onChange={e => set("hora", e.target.value)} /></div>
        <div><L t="Fonte" /><select className={inputCls} style={inputStyle} value={d.fonte} onChange={e => set("fonte", e.target.value)}>{FONTES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div className="mb-2.5"><L t="Descrição" req /><textarea className={inputCls + " min-h-[90px] resize-y"} style={inputStyle} value={d.descricao ?? ""} onChange={e => set("descricao", e.target.value)} autoFocus placeholder="Ex.: Despacho — vista ao executado pelo prazo de 15 dias para manifestação sobre os cálculos" /></div>
      <div className="mb-2.5"><L t="Anexo (Google Drive)" /><input className={inputCls} style={inputStyle} value={d.anexo_url ?? ""} placeholder="https://…" onChange={e => set("anexo_url", e.target.value)} /></div>
      <div className="mb-2.5"><L t="Exige atitude imediata?" /><div className="flex gap-1.5"><button type="button" onClick={() => set("urgente", false)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={!d.urgente ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Não</button><button type="button" onClick={() => set("urgente", true)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={d.urgente ? { background: "var(--alerta)", borderColor: "var(--alerta)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Sim</button></div>
        {d.urgente && <div className="mt-2 px-3 py-2.5 rounded border border-dashed text-[11.5px]" style={{ borderColor: "var(--alerta)", background: "var(--tag-red-bg)", color: "var(--text-secondary)" }}><b style={{ color: "var(--tag-red-fg)" }}>Marcado como atitude imediata.</b> Entra no bloco vermelho de Acompanhamentos e no contador da sidebar até alguém marcar como tratado ou criar a pendência.{d.urgente_tratado_em && <div className="mt-1" style={{ color: "var(--text-muted)" }}>Tratado por {d.urgente_tratado_por ?? "—"} em {fmtDT(d.urgente_tratado_em)}.</div>}<div className="mt-2"><L t="Motivo (curto)" /><input className={inputCls} style={inputStyle} value={d.urgente_motivo ?? ""} onChange={e => set("urgente_motivo", e.target.value)} placeholder="Ex.: prazo de 5 dias · risco de bloqueio de contas" /></div></div>}
      </div>
      {!edit && <div><L t="Gera pendência?" /><Seg opts={[["0", "Não"], ["1", "Sim → criar em seguida"]]} v={d.gerar ? "1" : "0"} set={v => set("gerar", v === "1")} /><div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Ex.: “intimado para manifestação em 15 dias” — ao salvar, abre a pendência já ligada a este andamento.</div></div>}
      {!edit && <BlocoAcompAndamento casoId={caso.id} consultaDe={consultaDe} value={opAc} onChange={setOpAc} />}
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── Colar andamentos ───────── */
function ColarDrawer({ caso, existentes, onClose, onSaved, supabase }: { caso: Caso; existentes: Andamento[]; onClose: () => void; onSaved: () => void; supabase: ReturnType<typeof createClient> }) {
  const [txt, setTxt] = useState(""); const [fonte, setFonte] = useState("esaj"); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const parsed = useMemo(() => {
    const out: { data: string; descricao: string; dup: boolean; prazoDias: number | null }[] = [];
    const re = /(\d{2})\/(\d{2})\/(\d{4})\s*[-–:]?\s*/g;
    const idx: { i: number; d: string }[] = []; let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) idx.push({ i: m.index, d: `${m[3]}-${m[2]}-${m[1]}` });
    idx.forEach((it, k) => {
      const raw = txt.slice(it.i, idx[k + 1]?.i ?? txt.length).replace(/^\d{2}\/\d{2}\/\d{4}\s*[-–:]?\s*/, "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      const dup = existentes.some(a => a.data === it.d && a.descricao.toLowerCase().slice(0, 40) === raw.toLowerCase().slice(0, 40));
      const pm = raw.match(/(\d{1,3})\s*\(?[\w]*\)?\s*dias?/i);
      out.push({ data: it.d, descricao: raw, dup, prazoDias: pm ? Number(pm[1]) : null });
    });
    return out;
  }, [txt, existentes]);
  const novos = parsed.filter(p => !p.dup);
  async function salvar() {
    if (!novos.length) return; setSaving(true); setErro(null);
    const { error } = await supabase.from("caso_andamentos").insert(novos.map(n => ({ caso_id: caso.id, empresa_id: caso.empresa_id, data: n.data, descricao: n.descricao, fonte })));
    setSaving(false); if (error) { setErro(error.message); return; } onSaved();
  }
  return (
    <Drawer title="Colar andamentos" sub="Copie a movimentação do e-SAJ/PJe e cole aqui. Separa por data, ignora os que já existem e marca os que mencionam prazo." onClose={onClose}
      footer={<Foot onClose={onClose} onSave={salvar} ok={novos.length > 0} saving={saving} />}>
      <div className="mb-2.5"><L t="Fonte" /><Seg opts={[["esaj", "e-SAJ"], ["pje", "PJe"], ["dje", "DJE"], ["sei", "SEI"], ["orgao", "Órgão"]]} v={fonte} set={setFonte} /></div>
      <div className="mb-2.5"><L t="Texto colado" /><textarea className={inputCls + " min-h-[160px] resize-y font-mono text-[11.5px]"} style={inputStyle} value={txt} onChange={e => setTxt(e.target.value)} autoFocus placeholder={"12/09/2026 Juntada de Petição\n28/08/2026 Vista ao executado pelo prazo de 15 dias…"} /></div>
      {parsed.length > 0 && (
        <div className="rounded border p-3 text-xs space-y-1.5" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <div>✓ <b style={{ color: "var(--text-primary)" }}>{parsed.length}</b> reconhecidos · {parsed.length - novos.length} já existem · <b style={{ color: "var(--ok)" }}>{novos.length} novos</b></div>
          {novos.filter(n => n.prazoDias).map((n, i) => <div key={i}><b>{fmt(n.data)}</b> menciona <b>{n.prazoDias} dias</b> → sugerido prazo {fmt(addDias(n.data, n.prazoDias!, true))} (úteis). Crie a pendência depois de salvar.</div>)}
          <div className="max-h-40 overflow-y-auto mt-2 space-y-1">{parsed.map((p, i) => <div key={i} className="flex gap-2" style={{ opacity: p.dup ? 0.45 : 1 }}><span className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmt(p.data)}</span><span className="truncate">{p.descricao}</span>{p.dup && <span className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>· já existe</span>}</div>)}</div>
        </div>
      )}
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── página ───────── */
export default function CasoView({ caso, empresa, andamentos, pendencias, documentos, usuarioNome }: { caso: Caso; empresa: Empresa; andamentos: Andamento[]; pendencias: Pendencia[]; documentos: Documento[]; usuarioNome?: string | null }) {
  const router = useRouter(); const supabase = createClient();
  const refresh = useRefreshDebounced(router);
  const A = AREAS.find(a => a.key === caso.area)!;
  const eu = primeiroNome(usuarioNome);
  const [tab, setTab] = useState<"and" | "pend" | "alin" | "mail" | "docs" | "acomp">("and");
  const acc = useAcompCaso(caso.id); const euAc = useEu();
  const [dr, setDr] = useState<null | { k: "pend" | "dil" | "and" | "colar" | "caso" | "enviar" | "revisar"; p?: Pendencia; a?: Andamento; origem?: Andamento }>(null);

  // Documentos (acervo v2, spec_documentos_acervo.md): só a contagem do acervo para a aba; a lista, edição e aproveitamento ficam em AbaDocumentos
  const [nDocs, setNDocs] = useState(0);
  useEffect(() => {
    let on = true;
    const load = () => supabase.from("caso_documentos").select("id", { count: "exact", head: true }).eq("caso_id", caso.id).or("classe.is.null,classe.neq.peca")
      .then(({ count }) => { if (on) setNDocs(count ?? 0); });
    load();
    const ch = supabase.channel(`caso-docs-${caso.id}`).on("postgres_changes", { event: "*", schema: "public", table: "caso_documentos", filter: `caso_id=eq.${caso.id}` }, load).subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caso.id]);

  // Tempo real: qualquer mudança nas pendências/andamentos deste caso recarrega os dados
  useEffect(() => {
    const ch = supabase.channel(`caso-${caso.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias", filter: `caso_id=eq.${caso.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_andamentos", filter: `caso_id=eq.${caso.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caso.id]);
  const [menu, setMenu] = useState(false);
const [julg, setJulg] = useState<Pendencia | null>(null); const [adiar, setAdiar] = useState<Pendencia | null>(null); const [despC, setDespC] = useState<Pendencia | null>(null); const [agendar, setAgendar] = useState<Pendencia | null>(null);
  const [filtro, setFiltro] = useState<"abertas" | "revisao" | "concluidas" | "todas">("abertas");
  const [fAnd, setFAnd] = useState<"todos" | "manual" | "oficial">("todos");
  const [excluir, setExcluir] = useState<{ tipo: "caso" | "pend" | "and"; id: string; nome: string } | null>(null);
  const [senha, setSenha] = useState(""); const [erroSenha, setErroSenha] = useState<string | null>(null); const [apagando, setApagando] = useState(false);

  const nomeEmp = empresa.nome_exibicao || empresa.nome;
  const abertas = pendencias.filter(p => p.status !== "concluida");
  const fatais7 = abertas.filter(p => p.fatal && p.prazo && (diasAte(p.prazo) ?? 99) <= 7).length;
  const emRev = abertas.filter(p => p.status === "revisao_pendente").length;
  const ultimo = andamentos[0];
  const idx = A.fluxo.indexOf(caso.situacao);
  const listaPend = pendencias.filter(p => filtro === "todas" || (filtro === "concluidas" ? p.status === "concluida" : filtro === "revisao" ? p.status === "revisao_pendente" : p.status !== "concluida")).sort((a, b) => (a.status === "concluida" ? 1 : 0) - (b.status === "concluida" ? 1 : 0) || (a.prazo ?? "9").localeCompare(b.prazo ?? "9"));
  const listaAnd = andamentos.filter(a => fAnd === "todos" || (fAnd === "manual" ? a.fonte === "manual" : a.fonte !== "manual"));
  const proximas = abertas.filter(p => p.prazo).sort((a, b) => a.prazo!.localeCompare(b.prazo!)).slice(0, 5);
  const dadosExtras = Object.entries(caso.dados ?? {}).filter(([k, v]) => v && !["checklist", "gerar_checklist"].includes(k) && A.fields.some(f => f.k === k)).map(([k, v]) => [A.fields.find(f => f.k === k)!.label, Array.isArray(v) ? v.join(", ") : String(v)]);

  async function toggleConcluir(p: Pendencia) {
if (p.tipo === "julgamento" && p.status !== "concluida") { setJulg(p); return; }
if (p.tipo === "despacho" && p.status !== "concluida") { setDespC(p); return; } // despacho: realizado / remarcado / cancelado / não recebido // julgamento: pergunta o que aconteceu (realizado / adiado / …)
    const done = p.status !== "concluida";
    await supabase.from("caso_pendencias").update({ status: done ? "concluida" : "a_fazer", concluida_em: done ? new Date().toISOString() : null }).eq("id", p.id);
    if (done && p.tipo === "peca") await supabase.from("caso_andamentos").insert({ caso_id: caso.id, empresa_id: caso.empresa_id, data: hoje(), descricao: `Concluída: ${p.titulo}${p.responsavel ? ` (${p.responsavel})` : ""}${p.versao ? ` · v${p.versao}` : ""}`, fonte: "manual" });
    if (done && FLUXO_PECA.includes(p.tipo)) await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: caso.id, empresa_id: caso.empresa_id, autor: eu || null, acao: p.status === "pronta_protocolar" ? "protocolou · concluída" : "concluiu" });
    else if (done && p.recorrencia) await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: caso.id, empresa_id: caso.empresa_id, autor: eu || null, acao: `concluiu a ${p.recorrencia_seq ?? 1}ª ocorrência` });
    router.refresh();
  }
  const ctxPend = `${nomeEmp} · ${caso.titulo}${caso.numero ? ` · ${caso.numero}` : ""}`;
  async function arquivar() { await supabase.from("casos").update({ ativo: !caso.ativo }).eq("id", caso.id); router.refresh(); }
  async function confirmarExclusao() {
    if (!excluir || !senha) return; setApagando(true); setErroSenha(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setApagando(false); setErroSenha("Sessão inválida."); return; }
    const { error: aErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (aErr) { setApagando(false); setErroSenha("Senha incorreta."); return; }
    const table = excluir.tipo === "caso" ? "casos" : excluir.tipo === "pend" ? "caso_pendencias" : "caso_andamentos";
    const { error } = await supabase.from(table).delete().eq("id", excluir.id);
    setApagando(false); if (error) { setErroSenha(error.message); return; }
    setExcluir(null); setSenha("");
    if (excluir.tipo === "caso") router.push(`/clientes/${caso.empresa_id}`); else router.refresh();
  }
  const pedirExclusao = (x: { tipo: "caso" | "pend" | "and"; id: string; nome: string }) => { setDr(null); setSenha(""); setErroSenha(null); setExcluir(x); };
  const fonteLabel = (f: string) => FONTES.find(x => x[0] === f)?.[1] ?? f;

  return (
    <div className="pb-8">
      <div className="px-6 pt-3 text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><Link href="/clientes" style={{ color: "var(--acao)" }}>Clientes</Link><span>›</span><Link href={`/clientes/${empresa.id}`} style={{ color: "var(--acao)" }}>{nomeEmp}</Link><span>›</span><span>{A.label}</span></div>

      <div className="px-6 pt-3 flex flex-col md:flex-row items-start md:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}{caso.dados?.esfera ? ` · ${caso.dados.esfera}` : ""}{caso.dados?.sub_tipo ? ` · ${caso.dados.sub_tipo}` : ""}</span><SeloAcomp it={acc.it} />
          <h1 className="text-[26px] mt-1.5 leading-tight break-words">{caso.titulo}{!caso.ativo && <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full align-middle" style={{ background: "var(--tag-gray-bg)", color: "var(--tag-gray-fg)" }}>ARQUIVADO</span>}</h1>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span>Nº <b style={{ color: "var(--text-primary)" }}>{caso.numero ?? "sem número"}</b></span>
            {caso.orgao && <span>Órgão <b style={{ color: "var(--text-primary)" }}>{caso.orgao}</b></span>}
            {caso.dados?.adverso && <span>Adverso <b style={{ color: "var(--text-primary)" }}>{caso.dados.adverso}</b></span>}
            {caso.dados?.valor && <span>Valor <b style={{ color: "var(--text-primary)" }}>{caso.dados.valor}</b></span>}
            {caso.advogado && <span>Advogado <b style={{ color: "var(--text-primary)" }}>{caso.advogado}</b></span>}
            {Array.isArray(caso.dados?.tese) && caso.dados.tese.length > 0 && <span><b style={{ color: "var(--text-primary)" }}>{caso.dados.tese.join(", ")}</b></span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 relative flex-wrap w-full md:w-auto">
          <button onClick={() => setDr({ k: "pend" })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Pendência</button>
          <button onClick={() => setDr({ k: "and" })} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>+ Andamento</button>
          <button onClick={() => setMenu(m => !m)} className="w-9 rounded text-lg leading-none border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>⋯</button>
          {menu && (<>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 w-48 rounded-md border shadow-2xl py-1 text-xs" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <button onClick={() => { setMenu(false); setDr({ k: "caso" }); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}>✎</span>Modificar dados</button>
              <button onClick={() => { setMenu(false); arquivar(); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}></span>{caso.ativo ? "Arquivar" : "Desarquivar"}</button>
              <button onClick={() => { setMenu(false); pedirExclusao({ tipo: "caso", id: caso.id, nome: caso.titulo }); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--alerta)" }}><span></span>Excluir caso</button>
            </div>
          </>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-6 mt-3">
        {A.fluxo.map((s, i) => <span key={s} className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wide font-semibold border" style={i < idx ? { borderColor: "var(--ok)", color: "var(--ok)" } : i === idx ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>{i < idx ? "✓ " : ""}{s}</span>)}
      </div>

      <div className="grid grid-cols-4 gap-2.5 px-6 mt-3.5">
        {[{ v: fatais7, l: "Prazo fatal ≤7d", c: fatais7 ? "var(--alerta)" : undefined }, { v: abertas.length, l: "Pendências abertas", c: abertas.length ? "var(--atencao)" : undefined }, { v: emRev, l: "Em revisão", c: emRev ? "var(--acao)" : undefined }, { v: ultimo ? fmt(ultimo.data) : "—", l: "Último andamento" }].map(k => (
          <div key={k.l} className="rounded-md border px-3.5 py-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-lg font-bold" style={{ color: k.c ?? "var(--text-primary)" }}>{k.v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{k.l}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-0.5 px-6 mt-3.5 border-b" style={{ borderColor: "var(--border)" }}>
        {[{ k: "and", l: "Andamentos", n: andamentos.length }, { k: "pend", l: "Pendências & diligências", n: abertas.length }, { k: "alin", l: "Alinhamentos", n: 0 }, { k: "mail", l: "E-mails", n: 0 }, { k: "docs", l: "Documentos", n: nDocs }, { k: "acomp", l: "Acompanhamento", n: acc.it?.sit.st === "atras" ? acc.it.sit.atraso : -1 }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as typeof tab)} className="px-3 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 border-b-2 -mb-px" style={{ color: tab === t.k ? "var(--acao)" : "var(--text-secondary)", borderColor: tab === t.k ? "var(--acao)" : "transparent", fontWeight: tab === t.k ? 600 : 500 }}>{t.l}{t.k === "acomp" ? (t.n > 0 ? <span className="text-[10px] px-1.5 rounded-full font-bold text-on-acao" style={{ background: "var(--alerta)" }}>{t.n}</span> : acc.it && acc.it.status !== "sugerido" ? <span className="text-[10px] px-1.5 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>{acc.it.frequencia === "diario" ? "diário" : "semanal"}</span> : null) : <span className="text-[10px] px-1.5 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: tab === t.k ? "var(--acao)" : "var(--text-muted)" }}>{t.n}</span>}</button>
        ))}
      </div>

      <div className="px-6 pt-4 grid gap-4 grid-cols-1 md:grid-cols-[1fr_320px]">
        <div>
          {tab === "and" && (<>
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="flex gap-1.5 flex-wrap">{([["todos", "Todos"], ["oficial", "Oficiais"], ["manual", "Manuais"]] as const).map(([k, l]) => <button key={k} onClick={() => setFAnd(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={fAnd === k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>)}</div>
              <div className="flex gap-1.5"><button onClick={() => setDr({ k: "colar" })} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>⇩ Colar do sistema</button><button onClick={() => setDr({ k: "and" })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Andamento</button></div>
            </div>
            {(caso as any).eproc_ultimo_seq != null && <div className="mb-2.5 px-3 py-2 rounded border text-[11.5px] flex flex-wrap items-center gap-2" style={{ borderColor: "var(--acao)", background: "var(--tag-blue-bg)", color: "var(--text-primary)" }}><span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--ok)" }} /><b>Íntegra até o evento {(caso as any).eproc_ultimo_seq}</b>{(caso as any).eproc_visto_em && <span style={{ color: "var(--text-secondary)" }}>· processada em {fmt((caso as any).eproc_visto_em)}</span>}{(caso as any).tribunal_ultimo_seq != null && <span style={{ color: (caso as any).tribunal_ultimo_seq > (caso as any).eproc_ultimo_seq ? "var(--tag-amber-fg)" : "var(--text-secondary)" }}>· tribunal no evento {(caso as any).tribunal_ultimo_seq}{(caso as any).tribunal_ultimo_seq > (caso as any).eproc_ultimo_seq ? " — íntegra em A Fazer, aguardando a Rotina A" : " ✓ em dia"}</span>}</div>}
<div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {listaAnd.length === 0 ? <Empty t="Nenhum andamento. Cole a movimentação do sistema ou registre manualmente." /> : (
                <div className="px-3.5">{listaAnd.map(a => { const pend = pendencias.filter(p => p.origem_andamento_id === a.id); return (
                  <div key={a.id} className="grid gap-2.5 py-2.5 border-b last:border-b-0 group" style={{ gridTemplateColumns: "88px 14px 1fr auto", borderColor: "var(--border)" }}>
                    <div className="text-[10.5px] uppercase tracking-wider pt-0.5" style={{ color: "var(--text-muted)" }}><b className="block text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{fmt(a.data)}</b>{a.hora ?? ""}</div>
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={a.urgente && !a.urgente_tratado_em ? { background: "var(--alerta)", outline: "2px solid var(--alerta)", outlineOffset: 1 } : { background: a.fonte === "manual" ? "var(--acao)" : a.fonte === "dje" || a.fonte === "do" ? "var(--alerta)" : "var(--text-muted)" }} />
                    <div className="text-[12.5px] min-w-0" style={{ color: "var(--text-primary)" }}>
                      {a.descricao}<span className="ml-1.5 text-[9px] font-bold px-1.5 py-px rounded uppercase tracking-wider border align-middle" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-muted)" }}>{fonteLabel(a.fonte)}</span>{acc.andIds.has(a.id) && <span className="ml-1.5 text-[10px] font-semibold align-middle" style={{ color: "var(--tag-purple-fg)" }}>via acompanhamento</span>}{a.urgente && <span className="ml-1.5"><TagUrgente tratado={!!a.urgente_tratado_em} /></span>}
                      {a.urgente && a.urgente_motivo && !a.urgente_tratado_em && <div className="text-[11px] mt-0.5" style={{ color: "var(--tag-red-fg)" }}>{a.urgente_motivo}</div>}
                      <div className="flex flex-wrap gap-3 mt-1 text-[10.5px]">
                        {a.anexo_url && <a href={a.anexo_url} target="_blank" rel="noreferrer" style={{ color: "var(--acao)" }}>anexo</a>}
                        {pend.map(p => <button key={p.id} onClick={() => { setTab("pend"); }} style={{ color: p.status === "concluida" ? "var(--ok)" : "var(--atencao)" }}>{p.status === "concluida" ? "concluída" : "pendência"}: {p.titulo}</button>)}
                        {pend.length === 0 && <button onClick={() => setDr({ k: "pend", origem: a })} className="opacity-0 group-hover:opacity-100 transition" style={{ color: "var(--acao)" }}>+ criar pendência a partir deste</button>}
                      </div>
                    </div>
                    <button onClick={() => setDr({ k: "and", a })} className="text-base leading-none opacity-40 hover:opacity-100" style={{ color: "var(--text-secondary)" }} title="Modificar">⋯</button>
                  </div>); })}</div>
              )}
            </div>
          </>)}

          {tab === "pend" && (<>
            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-1.5">{([["abertas", `Abertas (${abertas.length})`], ["revisao", `Em revisão (${emRev})`], ["concluidas", `Concluídas (${pendencias.length - abertas.length})`], ["todas", "Todas"]] as const).map(([k, l]) => <button key={k} onClick={() => setFiltro(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={filtro === k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>)}</div>
              <div className="flex gap-1.5"><button onClick={() => setDr({ k: "dil" })} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>+ Diligência</button><button onClick={() => setDr({ k: "pend" })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Pendência</button></div>
            </div>
            <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-[12.5px]">
                <thead><tr style={{ background: "var(--bg-page)" }}>{["", "Pendência", "Tipo", "Responsável", "Status", "Prazo", "Interno", "Revisor", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? 36 : undefined }}>{h}</th>)}</tr></thead>
                <tbody>
                  {listaPend.length === 0 && <tr><td colSpan={9}><Empty t="Nenhuma pendência aqui." /></td></tr>}
                  {listaPend.map(p => { const done = p.status === "concluida"; const s = STATUS_PEND[p.status] ?? { l: p.status, cls: "mut" }; return (
                    <tr key={p.id} className="border-b last:border-b-0 hover:brightness-110" style={{ borderColor: "var(--border)", opacity: done ? 0.55 : 1 }}>
                      <td className="px-3 py-2.5"><button onClick={() => toggleConcluir(p)} className="w-4 h-4 rounded border block" style={{ background: done ? "var(--ok)" : "transparent", borderColor: done ? "var(--ok)" : "var(--border-strong, var(--text-secondary))" }} title={done ? "Reabrir" : "Concluir"} /></td>
                      <td className="px-3 py-2.5 cursor-pointer" onClick={() => setDr({ k: "pend", p })}><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>{p.titulo}</div>{p.recorrencia && <div className="text-[10.5px] mt-0.5 flex items-center gap-1.5 flex-wrap"><span className="font-bold px-1.5 py-px rounded" style={{ background: "var(--tag-purple-bg)", color: "var(--tag-purple-fg)" }}>{labelRec(p.recorrencia)}</span><span style={{ color: "var(--text-muted)" }}>{p.recorrencia_seq ?? 1}ª ocorrência{p.recorrencia_ativa === false ? " · pausada" : !done && proximaOcorrencia(p) ? ` · próxima ${fmt(proximaOcorrencia(p))}` : !done ? " · última da série" : ""}</span></div>}<InfoJulg p={p} /><InfoDesp p={p} /><InfoRol p={p} />{p.descricao && <div className="text-[11px] truncate max-w-[380px]" style={{ color: "var(--text-muted)" }}>{p.descricao}</div>}{p.arquivo_url && <a href={p.arquivo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[11px]" style={{ color: "var(--acao)" }}>v{p.versao ?? 1} · abrir peça ↗</a>}</td>
                      <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>{TIPOS_PEND.find(t => t[0] === p.tipo)?.[1] ?? p.tipo}</td>
                      <td className="px-3 py-2.5">{p.responsavel ?? "—"}</td>
                      <td className="px-3 py-2.5"><Pz t={s.l} cls={s.cls} />{p.status === "revisao_pendente" && p.revisor && <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>com <NomeRev n={p.revisor} />{p.subida_por && !mesmoNome(p.subida_por, p.revisor) ? ` (via ${primeiroNome(p.subida_por)})` : ""}{p.enviado_em ? ` · ${relTempo(p.enviado_em)}` : ""}</div>}{p.status === "devolvida" && p.devolucao_obs && <div className="text-[10.5px] mt-1 px-2 py-1 rounded-sm max-w-[260px]" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{p.revisor}:</b> {p.devolucao_obs}</div>}</td>
                      <td className="px-3 py-2.5">{prazoPz(p)}</td>
                      <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{p.fatal ? fmt(p.prazo_interno) : "—"}</td>
                      <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{p.revisor ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><AcoesDespacho p={p} onPedido={async () => { await marcarPedidoDespacho(supabase, p, eu || "—"); router.refresh(); }} onAgendar={() => setAgendar(p)} onConcluir={() => setDespC(p)} />{p.tipo === "rolante" && p.status !== "concluida" && <button onClick={() => setAdiar(p)} className="px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Adiar para…</button>}<AcaoPeca p={p} eu={eu} onEnviar={() => setDr({ k: "enviar", p })} onRevisar={() => setDr({ k: "revisar", p })} onProtocolei={() => toggleConcluir(p)} /><button onClick={() => setDr({ k: "pend", p })} className="w-8 h-8 rounded-md text-lg leading-none" style={{ color: "var(--text-secondary)" }}>⋯</button></span></td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] mt-2.5" style={{ color: "var(--text-muted)" }}>Peça pronta? Use <b>Enviar para revisão</b> na linha — cola o link do Word e a versão sobe sozinha. Quem revisa vê na hora em <b>Revisão pendente</b>. Prazo interno = D-4 em dias úteis. Concluir uma peça registra um andamento; memorial, julgamento e despacho, não.</div>
          </>)}

          {tab === "acomp" && <AbaAcompanhamentoCaso casoId={caso.id} dado={acc} eu={euAc} />}

          {(tab === "alin" || tab === "mail") && <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><Empty t={`${tab === "alin" ? "Alinhamentos" : "E-mails"} do caso — em breve.`} /></div>}

          {tab === "docs" && <AbaDocumentos caso={caso} supabase={supabase} eu={eu || "—"} />}
        </div>

        <div className="space-y-4">
          <Card title="Próximos prazos" action={<button onClick={() => setTab("pend")} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>ver pendências →</button>}>
            {proximas.length === 0 ? <Empty t="Sem prazos abertos." /> : proximas.map(p => <div key={p.id} className="px-3.5 py-2 border-b last:border-b-0 cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => setDr({ k: "pend", p })}><div className="flex justify-between items-center gap-2">{prazoPz(p)}<span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{p.responsavel}</span></div><div className="text-xs mt-1" style={{ color: "var(--text-primary)" }}>{p.titulo}</div></div>)}
          </Card>
          <Card title={`Dados d${A.artigo} ${A.sing}`} action={<button onClick={() => setDr({ k: "caso" })} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>✎ editar</button>}>
            {[["Cliente", nomeEmp], ["Situação", caso.situacao], ...dadosExtras.filter(([k]) => !["Título", "Tese / tags"].includes(k)), ["Observações", caso.observacoes ?? "—"]].map(([k, v]) => <div key={k} className="px-3.5 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{k}</div><div className="text-xs mt-0.5 break-words" style={{ color: k === "Observações" ? "var(--text-secondary)" : "var(--text-primary)" }}>{v}</div></div>)}
          </Card>
          <Card title="Sincronização"><div className="px-3.5 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>Integração automática com e-SAJ/PJe/DJE em breve. Por enquanto, use <b>⇩ Colar do sistema</b> na aba Andamentos.</div></Card>
        </div>
      </div>

      {dr?.k === "pend" && <PendDrawer key={dr.p?.id ?? dr.origem?.id ?? "nova"} caso={caso} inicial={dr.p} origem={dr.origem} andamentos={andamentos} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onDel={p => pedirExclusao({ tipo: "pend", id: p.id, nome: p.titulo })} supabase={supabase} />}
      {dr?.k === "enviar" && dr.p && <EnviarDrawer key={dr.p.id} p={dr.p} contexto={ctxPend} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "revisar" && dr.p && <RevisarDrawer key={dr.p.id} p={dr.p} contexto={ctxPend} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "dil" && <PendDrawer caso={caso} diligencia andamentos={andamentos} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "and" && <AndDrawer caso={caso} inicial={dr.a} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onDel={a => pedirExclusao({ tipo: "and", id: a.id, nome: a.descricao.slice(0, 60) })} onCriarPend={a => setDr({ k: "pend", origem: a })} supabase={supabase} />}
      {dr?.k === "colar" && <ColarDrawer caso={caso} existentes={andamentos} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      {dr?.k === "caso" && <CasoDrawer empresaId={caso.empresa_id} area={caso.area as Area} inicial={caso} docs={documentos} tagOpts={Array.from(new Set([...(empresa.tags ?? []), ...(Array.isArray(caso.dados?.tese) ? caso.dados.tese : [])]))} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} onExcluir={c => pedirExclusao({ tipo: "caso", id: c.id, nome: c.titulo })} supabase={supabase} />}

      {despC && <ConcluirDespacho p={despC} usuario={eu || "—"} supabase={supabase} onClose={() => setDespC(null)} onSaved={() => { setDespC(null); router.refresh(); }} />}
{agendar && <AgendarDespacho p={agendar} usuario={eu || "—"} supabase={supabase} onClose={() => setAgendar(null)} onSaved={() => { setAgendar(null); router.refresh(); }} />}
{adiar && <AdiarRolante p={adiar} usuario={eu || "—"} supabase={supabase} onClose={() => setAdiar(null)} onSaved={() => { setAdiar(null); router.refresh(); }} />}
{julg && <ConcluirJulgamento p={julg} usuario={eu || "—"} supabase={supabase} onClose={() => setJulg(null)} onSaved={() => { setJulg(null); router.refresh(); }} />}
{excluir && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !apagando && setExcluir(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--alerta-tint)", color: "var(--alerta)" }}></div>
            <div className="flex-1"><h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Excluir {excluir.tipo === "caso" ? "caso" : excluir.tipo === "pend" ? "pendência" : "andamento"}?</h3>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{excluir.nome}</strong> será removido permanentemente{excluir.tipo === "caso" ? ", com andamentos e pendências" : ""}.</p>
              <label className={labelCls + " mt-4"} style={{ color: "var(--text-secondary)" }}>Confirme com sua senha de acesso</label>
              <input type="password" autoFocus value={senha} onChange={e => { setSenha(e.target.value); setErroSenha(null); }} onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }} placeholder="Senha do login" className={inputCls} style={inputStyle} />
              {erroSenha && <div className="text-[11px] mt-1.5" style={{ color: "var(--alerta)" }}>{erroSenha}</div>}</div></div>
          <div className="flex justify-end gap-2 mt-5"><button onClick={() => { setExcluir(null); setSenha(""); }} disabled={apagando} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={confirmarExclusao} disabled={apagando || !senha} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{apagando ? "Excluindo…" : "Excluir permanentemente"}</button></div>
        </div>
      </>)}
    </div>
  );
}
