"use client";
import { ADVOGADOS, COORDENADORES } from "@/lib/equipe";
// Controle de Certidões (v50) — página /certidoes, bloco na aba Documentos do cliente e bloco na Home.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { BANCAS } from "./ClientesListView";
import { criarXlsx, linhaTotal, baixarBlob, type Celula } from "@/lib/xlsx";
import {
  type CertItem, type CertPend, type Eu, type Sit, CERT_TIPOS, CERT_ORGAO, CERT_LINKS, SITUACOES, ORDEM_SIT,
  carregarCertidoes, carregarEu, cumprimento, registrarEvento, validadeDias, hojeISO, addDias, fmtData, fmtCurta, fmtHora, labelDias, primeiro, norm, pendAberta,
} from "@/lib/certidoes";

type SB = ReturnType<typeof createClient>;
const ADVS = ADVOGADOS;
const REVISORES = COORDENADORES;
const TIPO_PEND: Record<string, string> = { diligencia: "Diligência", peca: "Revisão", prazo: "Prazo" };
const STATUS_PEND: Record<string, [string, string]> = { a_fazer: ["A fazer", "blue"], aguardando: ["Aguardando", "gray"], revisao_pendente: ["Em revisão", "amber"], devolvida: ["Devolvida", "red"], pronta_protocolar: ["Aprovada", "green"], concluida: ["Concluída", "green"] };
const Tag = ({ t, c }: { t: string; c: string }) => <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `var(--tag-${c}-bg)`, color: `var(--tag-${c}-fg)` }}>{t}</span>;
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const btn = "px-2.5 py-1 rounded text-[10.5px] font-medium whitespace-nowrap border";
const bPri = { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }; const bSec = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }; const bDng = { background: "var(--alerta)", borderColor: "var(--alerta)", color: "var(--on-acao)" };
const chip = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const L = ({ t, req }: { t: string; req?: boolean }) => <label className={labelCls} style={{ color: "var(--text-secondary)" }}>{t}{req && <span style={{ color: "var(--alerta)" }}> *</span>}</label>;
const Sec = ({ t }: { t: string }) => <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{t}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-7 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Card = ({ title, action, children, tom }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; tom?: "red" | "amb" }) => <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: tom === "red" ? "var(--alerta)" : tom === "amb" ? "var(--atencao)" : "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: tom === "red" ? "var(--alerta)" : tom === "amb" ? "var(--atencao)" : "var(--border)", color: tom === "red" ? "var(--tag-red-fg)" : tom === "amb" ? "var(--tag-amber-fg)" : "var(--text-muted)", background: tom === "red" ? "var(--tag-red-bg)" : tom === "amb" ? "var(--tag-amber-bg)" : undefined }}><span>{title}</span>{action && <span className="ml-auto normal-case tracking-normal font-medium text-[11px]">{action}</span>}</div>{children}</div>;
const BancaTag = ({ b }: { b?: string | null }) => { const B = b ? (BANCAS as any)[b] : null; return B ? <span className="text-[9px] font-bold px-1 py-px rounded align-middle ml-1" style={{ background: B.bg, color: B.fg }}>{b}</span> : null; };
const nomeCli = (it: CertItem) => it.empresa.nome_exibicao || it.empresa.nome;
const Erro = ({ e }: { e: string | null }) => e ? <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{e}</div> : null;

export function PzSit({ it }: { it: CertItem }) {
  const s = it.sit; const cls = "text-[10.5px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap";
  if (it.naoAplica) return <span className={cls} style={{ color: "var(--text-muted)" }}>não se aplica</span>;
  if (s === "n") return <span className={cls} style={{ background: "var(--tag-gray-bg)", color: "var(--tag-gray-fg)" }}>não cadastrada</span>;
  if (s === "r") return <span className={cls} style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{it.dias! < 0 ? "vencida" : "≤15d"} · {fmtCurta(it.doc!.validade)}</span>;
  if (s === "a") return <span className={cls} style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>≤30d · {fmtCurta(it.doc!.validade)}</span>;
  return <span className={cls} style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" }}>válida · {fmtCurta(it.doc!.validade)}</span>;
}
const Dot = ({ s }: { s: Sit }) => <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 align-middle" style={s === "g" ? { background: "var(--ok)" } : s === "a" ? { background: "var(--atencao)" } : s === "r" ? { background: "var(--alerta)" } : { background: "var(--bg-page)", border: "1px dashed var(--border-strong, var(--text-secondary))" }} />;

/* ───────── dados ───────── */
export function useEu() { const [eu, setEu] = useState<Eu | null>(null); useEffect(() => { let on = true; carregarEu(createClient()).then(e => { if (on) setEu(e); }); return () => { on = false; }; }, []); return eu; }
export function useCertidoes(f: { empresaId?: string; responsavel?: string; desligado?: boolean } = {}) {
  const [itens, setItens] = useState<CertItem[]>([]); const [carregando, setCarregando] = useState(true);
  const chave = `${f.empresaId ?? ""}|${f.responsavel ?? ""}|${f.desligado ? 1 : 0}`;
  const reload = useCallback(async () => { if (f.desligado) return; const r = await carregarCertidoes(createClient(), f); setItens(r); setCarregando(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => {
    reload(); if (f.desligado) return;
    const supabase = createClient();
    const ch = supabase.channel(`cert-${chave}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "empresa_documentos" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "certidao_config" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "certidao_eventos" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return { itens, carregando, reload };
}

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

/* ───────── Nova / Renovar (mesmo registro da aba Documentos) ───────── */
export function DrawerCertidao({ it, empresaId, eu, onClose, onDone }: { it?: CertItem; empresaId?: string; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient(); const renovar = !!it?.doc;
  const [emps, setEmps] = useState<{ id: string; nome: string; nome_exibicao: string | null }[]>([]);
  const [d, setD] = useState<Record<string, any>>(() => ({ empresa_id: it?.empresa.id ?? empresaId ?? "", subtipo: it?.subtipo ?? CERT_TIPOS[0], orgao: it?.doc?.dados?.orgao ?? CERT_ORGAO[it?.subtipo ?? CERT_TIPOS[0]] ?? "", emitida_em: hojeISO(), validade: addDias(hojeISO(), validadeDias(it?.subtipo ?? CERT_TIPOS[0])), codigo: "", situacao: "Negativa", url: "", observacao: it?.doc?.observacao ?? "" }));
  const set = (k: string, v: any) => setD(p => { const n = { ...p, [k]: v }; if (k === "subtipo") { n.orgao = CERT_ORGAO[v] ?? ""; n.validade = addDias(n.emitida_em || hojeISO(), validadeDias(v)); } if (k === "emitida_em" && v) n.validade = addDias(v, validadeDias(n.subtipo)); return n; });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (!it && !empresaId) supabase.from("empresas").select("id, nome, nome_exibicao").eq("ativo", true).order("nome").then(({ data }) => setEmps((data ?? []) as any)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ok = !!d.empresa_id && !!d.subtipo && !!d.emitida_em;
  async function salvar() {
    if (!ok) return; setSaving(true); setErro(null);
    const dados: Record<string, any> = { subtipo: d.subtipo, orgao: d.orgao || undefined, emitida_em: d.emitida_em, codigo: d.codigo || undefined, situacao: d.situacao };
    const res = await supabase.from("empresa_documentos").insert({ empresa_id: d.empresa_id, tipo: "certidao", nome: d.subtipo, url: d.url?.trim() || null, observacao: d.observacao?.trim() || null, validade: d.validade || null, dados: Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined && v !== "")) }).select().single();
    setSaving(false); if (res.error) { setErro(res.error.message); return; }
    await registrarEvento(supabase, { empresa: { id: d.empresa_id } as any, subtipo: d.subtipo }, { tipo: renovar ? "renovou" : "cadastrou", autor: eu?.primeiro ?? null, documento_id: (res.data as any).id, obs: `${d.situacao} · emitida ${fmtData(d.emitida_em)} · válida até ${fmtData(d.validade)}` });
    if (it?.naoAplica) await supabase.from("certidao_config").update({ nao_aplica: false, atualizado_por: eu?.primeiro ?? null, atualizado_em: new Date().toISOString() }).eq("empresa_id", d.empresa_id).eq("subtipo", d.subtipo);
    onDone(`${d.subtipo} válida até ${fmtData(d.validade)}. ${renovar ? "A anterior foi para o histórico." : "Entrou na aba Documentos do cliente."}`);
  }
  return (
    <Drawer title={renovar ? `Renovar · ${it!.curto}` : "Nova certidão"} sub={it ? `${nomeCli(it)}${it.doc ? ` · anterior emitida em ${fmtData(it.doc.dados?.emitida_em)}, ${labelDias(it)}` : ""}` : "Entra na aba Documentos do cliente e no Controle"} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{renovar ? "A anterior fica no histórico." : "* obrigatórios"}</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Cancelar</button><button onClick={salvar} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Salvando…" : renovar ? "Salvar renovação" : "Salvar"}</button></div></>}>
      {!it && !empresaId && <div className="mb-2.5"><L t="Cliente" req /><select className={inputCls} style={inputStyle} value={d.empresa_id} onChange={e => set("empresa_id", e.target.value)} autoFocus><option value="">— escolher cliente</option>{emps.map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select></div>}
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><L t="Tipo de certidão" req /><select className={inputCls} style={inputStyle} value={d.subtipo} onChange={e => set("subtipo", e.target.value)} disabled={renovar}>{CERT_TIPOS.map(t => <option key={t}>{t}</option>)}<option>Outra</option></select></div>
        <div><L t="Órgão emissor" /><input className={inputCls} style={inputStyle} value={d.orgao} onChange={e => set("orgao", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div><L t="Emitida em" req /><input type="date" className={inputCls} style={inputStyle} value={d.emitida_em} onChange={e => set("emitida_em", e.target.value)} autoFocus={renovar} /></div>
        <div><L t="Validade" /><input type="date" className={inputCls} style={inputStyle} value={d.validade} onChange={e => set("validade", e.target.value)} /><div className="text-[10px] mt-0.5" style={{ color: "var(--ok)" }}>✓ {validadeDias(d.subtipo)} dias — pode ajustar</div></div>
        <div><L t="Código de controle" /><input className={inputCls} style={inputStyle} value={d.codigo} onChange={e => set("codigo", e.target.value)} placeholder="ex.: A1B2.C3D4" /></div>
      </div>
      <div className="mb-2.5"><L t="Situação" /><Seg opts={SITUACOES.map(s => [s, s] as [string, string])} v={d.situacao} set={v => set("situacao", v)} /><div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Positiva com efeitos de negativa vale como regular, mas fica marcada.</div></div>
      <div className="mb-2.5"><L t="Arquivo (Google Drive)" /><input className={inputCls} style={inputStyle} value={d.url} onChange={e => set("url", e.target.value)} placeholder="https://…" /></div>
      <div className="mb-2.5"><L t="Observação" /><input className={inputCls} style={inputStyle} value={d.observacao} onChange={e => set("observacao", e.target.value)} placeholder="ex.: parcelamento em dia · débito garantido no processo X" /></div>
      {renovar && it && (it.sit === "r" || it.sit === "a") && <div className="mt-3 px-3 py-2.5 rounded border border-dashed text-[11.5px]" style={{ borderColor: "var(--atencao)", background: "var(--tag-amber-bg)", color: "var(--text-primary)" }}><b>Não conseguiu emitir?</b> Se o órgão aponta débito, registre como <b>Positiva</b> com observação e use <b>Pendência</b> na linha da certidão para abrir a diligência de regularização no caso certo.</div>}
      <Erro e={erro} />
    </Drawer>
  );
}

/* ───────── Cobrar ───────── */
export function DrawerCobrar({ it, eu, onClose, onDone }: { it: CertItem; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient(); const r = it.responsavel;
  const [msg, setMsg] = useState(`${r}, a ${it.curto} de ${nomeCli(it)} ${it.dias !== null && it.dias < 0 ? `está vencida há ${-it.dias} dias (${fmtData(it.doc?.validade)})` : it.dias !== null ? `vence em ${it.dias} dias (${fmtData(it.doc?.validade)})` : "ainda não foi cadastrada"}. Renove e anexe na Central.`);
  const [email, setEmail] = useState(true); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  async function enviar() {
    setSaving(true); setErro(null);
    const { data: us } = await supabase.from("usuarios").select("id, email, nome_completo");
    const dest = (us ?? []).find((u: any) => norm(u.nome_completo) === norm(r)) as any;
    if (dest) await supabase.from("notificacoes").insert({ usuario_id: dest.id, tipo: "certidao", titulo: `Certidão · ${nomeCli(it)} · ${it.curto}`, mensagem: msg });
    const { error } = await registrarEvento(supabase, it, { tipo: "cobranca", autor: eu?.primeiro ?? null, obs: msg });
    setSaving(false); if (error) { setErro(error.message); return; }
    if (email && dest?.email) window.open(`mailto:${dest.email}?subject=${encodeURIComponent(`Certidão ${it.curto} · ${nomeCli(it)}`)}&body=${encodeURIComponent(msg + `\n\n${location.origin}/certidoes`)}`, "_blank");
    onDone(`${r} recebeu no sino${email && dest?.email ? " e o e-mail abriu no seu e-mail" : ""}. Registrado no histórico.${dest ? "" : " (usuário não encontrado — só o histórico foi gravado)"}`);
  }
  return (
    <Drawer title="Cobrar renovação" sub={`${nomeCli(it)} · ${it.subtipo}`} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Pode cobrar de novo amanhã.</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Cancelar</button><button onClick={enviar} disabled={saving || msg.trim().length < 5} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{saving ? "Enviando…" : "Enviar cobrança"}</button></div></>}>
      <div className="px-3 py-2 rounded border text-[12px] mb-3 flex flex-wrap items-center gap-2" style={{ borderColor: "var(--alerta)", background: "var(--tag-red-bg)", color: "var(--text-primary)" }}><PzSit it={it} /> {labelDias(it)}{it.cobrancaHoje ? <> · já cobrado hoje às <b>{fmtHora(it.cobrancaHoje.criado_em)}</b></> : null}</div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5"><div><L t="Para" /><input className={inputCls} style={inputStyle} value={r} readOnly /></div><div><L t="Por onde" /><div className="flex flex-wrap gap-3 text-[12px] py-2" style={{ color: "var(--text-primary)" }}><label className="inline-flex items-center gap-1.5 opacity-80"><input type="checkbox" checked readOnly /> Sino</label><label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> E-mail</label></div></div></div>
      <div className="mb-2.5"><L t="Mensagem" /><textarea className={inputCls + " min-h-[80px] resize-y"} style={inputStyle} value={msg} onChange={e => setMsg(e.target.value)} /></div>
      <div className="text-[11.5px] space-y-1" style={{ color: "var(--text-secondary)" }}><div><b>1.</b> {r} recebe no sino{email ? "; o e-mail abre pronto no seu e-mail" : ""}.</div><div><b>2.</b> Na Home e no Controle, a certidão passa a mostrar “cobrado por {eu?.primeiro ?? "você"} às hh:mm”.</div><div><b>3.</b> Fica no histórico e conta em Cumprimento.</div></div>
      <Erro e={erro} />
    </Drawer>
  );
}

/* ───────── Histórico + configuração ───────── */
export function DrawerHistorico({ it, eu, onClose, onRenovar, onPend, onChanged }: { it: CertItem; eu: Eu | null; onClose: () => void; onRenovar: () => void; onPend?: () => void; onChanged: (msg: string) => void }) {
  const supabase = createClient(); const coord = !!eu?.coord;
  const [resp, setResp] = useState(it.cfg?.responsavel ?? "");
  const [subir, setSubir] = useState<{ id: string; url: string; revisor: string } | null>(null); const [busy, setBusy] = useState(false);
  const autor = eu?.primeiro ?? null;
  const numDe = (id: string | null) => id ? (it.pendencias.findIndex(x => x.id === id) + 1 || null) : null;
  async function evento(p: CertPend, acao: string) { await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: it.empresa.id, autor, acao }); }
  async function concluir(p: CertPend) {
    setBusy(true); const { error } = await supabase.from("caso_pendencias").update({ status: "concluida", concluida_em: new Date().toISOString() }).eq("id", p.id); setBusy(false);
    if (error) { onChanged("Erro: " + error.message); return; }
    await evento(p, "concluiu"); const filhas = it.pendencias.filter(x => x.depende_de === p.id && x.status === "aguardando");
    onChanged(`“${p.titulo}” concluída.${filhas.length ? ` Liberou: ${filhas.map(f => f.titulo).join(", ")}.` : ""}`);
  }
  async function reabrir(p: CertPend) {
    setBusy(true); const { error } = await supabase.from("caso_pendencias").update({ status: "a_fazer", concluida_em: null }).eq("id", p.id); setBusy(false);
    if (error) { onChanged("Erro: " + error.message); return; }
    await evento(p, "reabriu"); onChanged(`“${p.titulo}” reaberta.`);
  }
  async function enviarRevisao() {
    if (!subir || !/^https?:\/\//i.test(subir.url.trim()) || !subir.revisor) return;
    const p = it.pendencias.find(x => x.id === subir.id)!; setBusy(true);
    const { error } = await supabase.from("caso_pendencias").update({ status: "revisao_pendente", arquivo_url: subir.url.trim(), revisor: subir.revisor, enviado_em: new Date().toISOString(), subida_por: autor, devolucao_obs: null }).eq("id", p.id); setBusy(false);
    if (error) { onChanged("Erro: " + error.message); return; }
    await evento(p, `subiu para revisão de ${subir.revisor}`); onChanged(`“${p.titulo}” subiu para ${subir.revisor} revisar.`);
  }
  const abertas = it.pendencias.filter(pendAberta).length;
  const linhaPend = (p: CertPend, i: number) => {
    const [sl, sc] = STATUS_PEND[p.status] ?? [p.status, "gray"]; const done = p.status === "concluida"; const ag = p.status === "aguardando"; const dep = numDe(p.depende_de);
    const meta = [p.responsavel, ag ? (dep ? `aguarda ${dep}` : "aguardando") : null, p.prazo_relativo_uteis != null && ag ? `${p.prazo_relativo_uteis} dias úteis após` : p.prazo ? `prazo ${fmtData(p.prazo)}` : null].filter(Boolean).join(" · ");
    return <div key={p.id} className="grid gap-2 py-2 border-b last:border-b-0" style={{ gridTemplateColumns: "22px minmax(0,1fr)", borderColor: "var(--border)" }}>
      <div className="w-5 h-5 rounded-full border-2 text-[10px] font-bold flex items-center justify-center" style={{ borderColor: done ? "var(--ok)" : ag ? "var(--border)" : "var(--acao)", background: done ? "var(--ok)" : "transparent", color: done ? "var(--on-acao)" : ag ? "var(--text-muted)" : "var(--acao)", borderStyle: ag ? "dashed" : "solid" }}>{done ? "✓" : i + 1}</div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold break-words" style={{ color: done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>{p.titulo}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10.5px]" style={{ color: "var(--text-muted)" }}><Tag t={TIPO_PEND[p.tipo] ?? p.tipo} c={p.tipo === "peca" ? "purple" : "blue"} /><Tag t={sl} c={sc} /><span>{meta}</span></div>
        {!done && <div className="flex flex-wrap gap-1.5 mt-1.5">
          {p.tipo === "peca" && (p.status === "a_fazer" || p.status === "devolvida") && <button disabled={busy} onClick={() => setSubir({ id: p.id, url: "", revisor: REVISORES[0] })} className={btn} style={{ ...bSec, borderColor: "var(--destaque)", color: "var(--destaque)" }}>Subir p/ revisão</button>}
          {!ag && <button disabled={busy} onClick={() => concluir(p)} className={btn} style={bSec}>✓ Concluir</button>}
          <Link href={`/pendencias?q=${encodeURIComponent(p.titulo)}`} className={btn} style={bSec}>Abrir ↗</Link>
        </div>}
        {done && <div className="mt-1"><button disabled={busy} onClick={() => reabrir(p)} className={btn} style={{ ...bSec, color: "var(--text-muted)" }}>↩ Reabrir</button></div>}
        {subir?.id === p.id && <div className="mt-2 rounded p-2.5 grid gap-2" style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}>
          <div><L t="Link do arquivo (Google Drive)" req /><input className={inputCls} style={inputStyle} placeholder="https://…" value={subir.url} onChange={e => setSubir({ ...subir, url: e.target.value })} autoFocus /></div>
          <div className="flex gap-2 items-end"><div className="flex-1"><L t="Revisor" req /><select className={inputCls} style={inputStyle} value={subir.revisor} onChange={e => setSubir({ ...subir, revisor: e.target.value })}>{REVISORES.map(r => <option key={r}>{r}</option>)}</select></div><button onClick={enviarRevisao} disabled={busy || !/^https?:\/\//i.test(subir.url.trim())} className={btn + " py-2 disabled:opacity-50"} style={bPri}>Enviar</button><button onClick={() => setSubir(null)} className={btn + " py-2"} style={bSec}>Cancelar</button></div>
        </div>}
      </div>
    </div>;
  };
  const tl = [
    ...it.eventos.map(e => ({ d: e.criado_em.slice(0, 10), ts: e.criado_em, ic: ({ cobranca: "", renovou: "", cadastrou: "", nao_aplica: "", reativou: "↩", pendencia: "" } as any)[e.tipo], t: ({ cobranca: "Cobrado", renovou: "Renovada", cadastrou: "Cadastrada", nao_aplica: "Marcada como não se aplica", reativou: "Reativada", pendencia: "Pendência criada" } as any)[e.tipo], w: [e.autor, e.obs ? (e.tipo === "cobranca" ? `“${e.obs.slice(0, 100)}${e.obs.length > 100 ? "…" : ""}”` : e.obs) : null].filter(Boolean).join(" · ") })),
    ...it.historico.map(h => ({ d: h.dados?.emitida_em ?? h.criado_em.slice(0, 10), ts: (h.dados?.emitida_em ?? h.criado_em.slice(0, 10)) + "T00:00:00Z", ic: "", t: `Emitida · ${h.dados?.situacao ?? "Negativa"} · válida até ${fmtData(h.validade)}`, w: [h.dados?.orgao, h.dados?.codigo, h.url ? "PDF anexado" : null].filter(Boolean).join(" · ") })),
    ...(it.doc?.validade ? [{ d: it.doc.validade, ts: it.doc.validade + "T23:59:00Z", ic: "", t: it.dias! < 0 ? "Venceu" : "Vence", w: labelDias(it) }] : []),
  ].sort((a, b) => b.ts.localeCompare(a.ts));
  async function toggleNa() {
    const novo = !it.naoAplica;
    const { error } = await supabase.from("certidao_config").upsert({ empresa_id: it.empresa.id, subtipo: it.subtipo, nao_aplica: novo, atualizado_por: eu?.primeiro ?? null, atualizado_em: new Date().toISOString() }, { onConflict: "empresa_id,subtipo" });
    if (error) { onChanged("Erro: " + error.message); return; }
    await registrarEvento(supabase, it, { tipo: novo ? "nao_aplica" : "reativou", autor: eu?.primeiro ?? null });
    onChanged(novo ? `${it.curto} não conta mais para ${nomeCli(it)}.` : `${it.curto} voltou a contar para ${nomeCli(it)}.`);
  }
  async function salvarResp() {
    const { error } = await supabase.from("certidao_config").upsert({ empresa_id: it.empresa.id, subtipo: it.subtipo, responsavel: resp || null, nao_aplica: it.naoAplica, atualizado_por: eu?.primeiro ?? null, atualizado_em: new Date().toISOString() }, { onConflict: "empresa_id,subtipo" });
    onChanged(error ? "Erro: " + error.message : `Responsável: ${resp || "advogado do cliente"}.`);
  }
  return (
    <Drawer title={`${it.curto} · histórico`} sub={`${nomeCli(it)} · Carteira ${it.empresa.banca ?? "—"} · resp. ${it.responsavel}`} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Cada emissão fica guardada.</div><div className="flex gap-2"><Link href={`/clientes/${it.empresa.id}`} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Ficha do cliente ↗</Link><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Fechar</button></div></>}>
      <div className="flex flex-wrap gap-2 items-center mb-3"><PzSit it={it} /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{it.subtipo} · {validadeDias(it.subtipo)} dias</span>{it.positiva && <span className="text-[10.5px] font-semibold" style={{ color: "var(--tag-amber-fg)" }}>positiva c/ efeitos de negativa</span>}</div>
      <div className="flex gap-2 flex-wrap mb-3">{!it.naoAplica && <button onClick={onRenovar} className={btn} style={bPri}>{it.doc ? "Renovar" : "Cadastrar"}</button>}{it.doc?.url && <a href={it.doc.url} target="_blank" rel="noreferrer" className={btn} style={bSec}>Abrir arquivo atual</a>}</div>
      <div className="flex items-center justify-between mt-4 pb-1.5 mb-2 border-b" style={{ borderColor: "var(--border)" }}><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Pendências desta certidão{abertas ? ` · ${abertas} aberta${abertas > 1 ? "s" : ""}` : ""}</div>{onPend && !it.naoAplica && <button onClick={onPend} className={btn} style={bSec}>+ Pendência</button>}</div>
      {it.pendencias.length === 0 ? <div className="text-[11px] italic py-1" style={{ color: "var(--text-muted)" }}>Nenhuma. Crie uma para emitir/renovar, ou uma cadeia (ex.: revisar DARJs → pagar → pedir à PGE).</div> : <div>{it.pendencias.map(linhaPend)}</div>}
      <Sec t="Linha do tempo" />
      {tl.length === 0 ? <div className="text-[11px] italic py-2" style={{ color: "var(--text-muted)" }}>Nunca cadastrada.</div> : <div>{tl.slice(0, 40).map((e, i) => <div key={i} className="grid gap-2 py-1.5 border-b last:border-b-0 text-[12px]" style={{ gridTemplateColumns: "68px 18px minmax(0,1fr)", borderColor: "var(--border)" }}><div className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>{fmtCurta(e.d)}/{e.d.slice(2, 4)}</div><div className="text-center">{e.ic}</div><div className="min-w-0"><div style={{ color: "var(--text-primary)" }}>{e.t}</div>{e.w && <div className="text-[10.5px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{e.w}</div>}</div></div>)}</div>}
      <Sec t="Configuração" />
      <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)" }}><b>Aviso:</b> 30 dias (amarelo) · 15 dias (vermelho + sino) · <b>Validade padrão:</b> {validadeDias(it.subtipo)} dias · <b>Responsável:</b> {it.responsavel}{it.cfg?.responsavel ? "" : " (advogado do cliente)"}</div>
      <div className="mt-2.5 flex flex-wrap gap-2 items-end">{coord && <><div className="flex-1 min-w-[160px]"><L t="Trocar responsável" /><select className={inputCls} style={inputStyle} value={resp} onChange={e => setResp(e.target.value)}><option value="">— advogado do cliente</option>{ADVS.map(a => <option key={a}>{a}</option>)}</select></div><button onClick={salvarResp} className={btn} style={bSec}>Salvar</button></>}<button onClick={toggleNa} className={btn} style={bSec}>{it.naoAplica ? "↩ Voltar a exigir" : "Não se aplica a este cliente"}</button></div>
    </Drawer>
  );
}

/* ───────── pendência da certidão: ligada ao cliente + tipo de certidão, sem caso ───────── */
function DrawerPendenciaCert({ it, eu, onClose, onDone }: { it: CertItem; eu: Eu | null; onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient(); const vencida = it.dias !== null && it.dias < 0;
  const anteriores = it.pendencias.filter(pendAberta);
  const [d, setD] = useState({ tipo: "diligencia", titulo: anteriores.length ? "" : it.sit === "n" ? `Emitir ${it.curto}` : vencida ? `Renovar ${it.curto} (vencida)` : `Renovar ${it.curto}`, responsavel: it.responsavel, prazo: addDias(hojeISO(), 7), prioridade: it.sit === "r" ? "alta" : "normal", descricao: anteriores.length ? "" : `Certidão ${it.subtipo} · ${labelDias(it)}${it.doc?.validade ? ` (validade ${fmtData(it.doc.validade)})` : ""}. Emitir/renovar e anexar na aba Documentos do cliente.`, encadear: false, dependeDe: anteriores[anteriores.length - 1]?.id ?? "", prazoModo: "fixo", uteis: 3 });
  const set = (k: string, v: any) => setD(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const enc = d.encadear && !!d.dependeDe; const relativo = enc && d.prazoModo === "rel";
  const ok = d.titulo.trim().length > 2 && !!d.responsavel && (relativo ? d.uteis > 0 : !!d.prazo);
  const anterior = anteriores.find(a => a.id === d.dependeDe);
  async function salvar() {
    if (!ok) return; setSaving(true); setErro(null);
    const tipo = d.tipo === "prazo" ? "diligencia" : d.tipo;
    const { data, error } = await supabase.from("caso_pendencias").insert({ caso_id: null, empresa_id: it.empresa.id, certidao_subtipo: it.subtipo, titulo: d.titulo.trim(), tipo, responsavel: d.responsavel, status: enc ? "aguardando" : "a_fazer", fatal: d.tipo === "prazo", prazo: relativo ? null : d.prazo, contagem: "uteis", prioridade: d.prioridade, revisor: null, descricao: d.descricao.trim() || null, depende_de: enc ? d.dependeDe : null, prazo_relativo_uteis: relativo ? d.uteis : null }).select().single();
    setSaving(false); if (error) { setErro(error.message); return; }
    const quando = relativo ? `${d.uteis} dias úteis após “${anterior?.titulo}”` : `prazo ${fmtData(d.prazo)}`;
    await supabase.from("pendencia_eventos").insert({ pendencia_id: (data as any).id, caso_id: null, empresa_id: it.empresa.id, autor: eu?.primeiro ?? null, acao: `criou pela certidão ${it.curto}${enc ? ` · aguarda “${anterior?.titulo}”` : ""}` });
    await registrarEvento(supabase, it, { tipo: "pendencia", autor: eu?.primeiro ?? null, obs: `pendência “${d.titulo.trim()}” (${TIPO_PEND[d.tipo]}) para ${d.responsavel} · ${quando}` });
    onDone(enc ? `“${d.titulo.trim()}” criada em espera: libera quando “${anterior?.titulo}” for concluída (${quando}).` : `“${d.titulo.trim()}” criada para ${d.responsavel}, ${quando}. Aparece em Pendências, Prazos e Calendário, ligada a esta certidão.`);
  }
  return (
    <Drawer title="Nova pendência da certidão" sub={`${nomeCli(it)} · ${it.subtipo} · sem caso: fica ligada ao cliente e a esta certidão`} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>* obrigatórios</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={bSec}>Cancelar</button><button onClick={salvar} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Salvando…" : "Criar pendência"}</button></div></>}>
      <div className="mb-2.5"><L t="Tipo" req /><Seg opts={[["diligencia", "Diligência"], ["peca", "Revisão"], ["prazo", "Prazo fatal"]]} v={d.tipo} set={v => set("tipo", v)} />
        <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>{d.tipo === "peca" ? "O responsável sobe o arquivo/e-mail e ele entra na fila de Revisão pendente do revisor." : d.tipo === "prazo" ? "Data fatal: conta no Calendário e nos alertas de fatal." : "Tarefa sem revisão. Ao concluir, some da lista."}</div></div>
      <div className="mb-2.5"><L t="Título" req /><input className={inputCls} style={inputStyle} value={d.titulo} onChange={e => set("titulo", e.target.value)} placeholder={`ex.: Revisar e-mail com DARJs · Pedir ${it.curto} à ${it.subtipo.split(" — ")[0]}`} autoFocus /></div>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div><L t="Responsável" req /><select className={inputCls} style={inputStyle} value={d.responsavel} onChange={e => set("responsavel", e.target.value)}>{ADVS.map(a => <option key={a}>{a}</option>)}{!ADVS.includes(d.responsavel) && d.responsavel && <option>{d.responsavel}</option>}</select></div>
        <div><L t="Prazo" req={!relativo} /><input type="date" disabled={relativo} className={inputCls + " disabled:opacity-40"} style={inputStyle} value={d.prazo} onChange={e => set("prazo", e.target.value)} /></div>
        <div><L t="Prioridade" /><Seg opts={[["baixa", "Baixa"], ["normal", "Normal"], ["alta", "Alta"]]} v={d.prioridade} set={v => set("prioridade", v)} /></div>
      </div>
      <div className="mb-2.5"><L t="Descrição / providência" /><textarea className={inputCls + " min-h-[64px] resize-y"} style={inputStyle} value={d.descricao} onChange={e => set("descricao", e.target.value)} /></div>
      <div className="rounded px-3 py-2.5 mb-2.5" style={{ border: "1px dashed var(--border)", background: "var(--bg-page)" }}>
        <label className={"flex items-center gap-2 text-[12px] " + (anteriores.length ? "cursor-pointer" : "opacity-50")} style={{ color: "var(--text-primary)" }}><input type="checkbox" disabled={!anteriores.length} checked={d.encadear} onChange={e => set("encadear", e.target.checked)} /> Só começa após concluir outra pendência desta certidão</label>
        {!anteriores.length && <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>Ainda não há pendência aberta nesta certidão para encadear.</div>}
        {d.encadear && anteriores.length > 0 && <div className="mt-2 grid gap-2">
          <select className={inputCls} style={inputStyle} value={d.dependeDe} onChange={e => set("dependeDe", e.target.value)}>{anteriores.map((a, i) => <option key={a.id} value={a.id}>{it.pendencias.indexOf(a) + 1}. {a.titulo} · {a.responsavel ?? "—"}{a.prazo ? ` · ${fmtCurta(a.prazo)}` : ""}</option>)}</select>
          <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: "var(--text-primary)" }}>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={d.prazoModo === "fixo"} onChange={() => set("prazoModo", "fixo")} /> Prazo fixo (data acima)</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={d.prazoModo === "rel"} onChange={() => set("prazoModo", "rel")} /> <input type="number" min={1} max={60} className={inputCls + " w-14 py-1"} style={inputStyle} value={d.uteis} onChange={e => set("uteis", Math.max(1, Number(e.target.value) || 1))} /> dias úteis após concluir a anterior</label>
          </div>
          <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>Fica como <b>Aguardando</b> (sem prazo, sem alerta) até a anterior ser concluída; aí vira “A fazer” e o responsável recebe aviso no sino.</div>
        </div>}
      </div>
      <div className="rounded px-3 py-2 text-[11.5px]" style={{ background: "var(--bg-page)", color: "var(--text-secondary)" }}>Ao concluir a última da cadeia, lembre de anexar a certidão nova em <b>Documentos</b> do cliente (ou use Renovar aqui), senão a certidão continua vencida.</div>
      <Erro e={erro} />
    </Drawer>
  );
}
async function toggleNaoAplica(supabase: SB, it: CertItem, eu: Eu | null): Promise<string> {
  const novo = !it.naoAplica;
  const { error } = await supabase.from("certidao_config").upsert({ empresa_id: it.empresa.id, subtipo: it.subtipo, nao_aplica: novo, atualizado_por: eu?.primeiro ?? null, atualizado_em: new Date().toISOString() }, { onConflict: "empresa_id,subtipo" });
  if (error) return "Erro: " + error.message;
  await registrarEvento(supabase, it, { tipo: novo ? "nao_aplica" : "reativou", autor: eu?.primeiro ?? null });
  return novo ? `${it.curto} não conta mais para ${nomeCli(it)}. Dá para desfazer na própria linha.` : `${it.curto} voltou a contar para ${nomeCli(it)}.`;
}

/* ───────── orquestrador ───────── */
type Dr = null | { k: "hist" | "cobrar" | "renovar" | "pend"; it: CertItem } | { k: "nova"; empresaId?: string };
export function useAcaoCert(eu: Eu | null, reload: () => void) {
  const supabase = createClient();
  const [dr, setDr] = useState<Dr>(null); const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  const feito = (m: string) => { setDr(null); setAviso(m); reload(); };
  const acoes = {
    renovar: (it: CertItem) => setDr({ k: "renovar", it }), cobrar: (it: CertItem) => setDr({ k: "cobrar", it }), hist: (it: CertItem) => setDr({ k: "hist", it }), nova: (empresaId?: string) => setDr({ k: "nova", empresaId }),
    pendencia: (it: CertItem) => setDr({ k: "pend", it }),
    naoAplica: async (it: CertItem) => feito(await toggleNaoAplica(supabase, it, eu)),
  };
  const drawers = (<>
    {dr?.k === "pend" && <DrawerPendenciaCert it={dr.it} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "renovar" && <DrawerCertidao it={dr.it} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "nova" && <DrawerCertidao empresaId={dr.empresaId} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "cobrar" && <DrawerCobrar it={dr.it} eu={eu} onClose={() => setDr(null)} onDone={feito} />}
    {dr?.k === "hist" && <DrawerHistorico it={dr.it} eu={eu} onClose={() => setDr(null)} onRenovar={() => setDr({ k: "renovar", it: dr.it })} onPend={() => setDr({ k: "pend", it: dr.it })} onChanged={feito} />}
    {aviso && <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-md text-xs font-medium text-on-acao shadow-2xl max-w-[92vw]" style={{ background: aviso.startsWith("Erro") ? "var(--alerta)" : "var(--ok)" }}>{aviso}</div>}
  </>);
  return { acoes, drawers };
}

/* ───────── linha (página e Home) ───────── */
function Acoes({ it, adv, acoes }: { it: CertItem; adv: boolean; acoes: ReturnType<typeof useAcaoCert>["acoes"] }) {
  if (it.naoAplica) return <div className="flex gap-1.5 flex-wrap justify-end">
    <button onClick={() => acoes.naoAplica(it)} className={btn} style={bSec} title="Volta a contar para este cliente">↩ Voltar a exigir</button>
    <button onClick={() => acoes.hist(it)} className={btn} style={bSec}>Histórico</button>
  </div>;
  return <div className="flex gap-1.5 flex-wrap justify-end">
    {it.sit === "n" ? <button onClick={() => acoes.renovar(it)} className={btn} style={bPri}>Cadastrar</button> : <button onClick={() => acoes.renovar(it)} className={btn} style={it.sit === "r" ? bPri : bSec}>Renovar</button>}
    {it.doc?.url && <a href={it.doc.url} target="_blank" rel="noreferrer" className={btn} style={bSec} title="Abrir arquivo"></a>}
    {(() => { const ab = it.pendencias.filter(pendAberta); const eu = ab.filter(p => p.status === "revisao_pendente").length; return ab.length ? <button onClick={() => acoes.hist(it)} className={btn} style={{ ...bSec, borderColor: "var(--atencao)", color: "var(--atencao)" }} title={ab.map(p => `• ${p.titulo} · ${p.responsavel ?? ""}${p.prazo ? ` · ${fmtCurta(p.prazo)}` : p.status === "aguardando" ? " · aguardando" : ""}`).join("\n")}>{ab.length} aberta{ab.length > 1 ? "s" : ""}{eu ? ` · ${eu} em revisão` : it.pendencia?.prazo ? ` · ${fmtCurta(it.pendencia.prazo)}` : ""}</button> : null; })()}
    <button onClick={() => acoes.pendencia(it)} className={btn} style={bSec} title="Cria uma pendência ligada a esta certidão (sem caso). Pode encadear com as já abertas.">+ Pendência</button>
    {!adv && it.sit === "r" && <button onClick={() => acoes.cobrar(it)} className={btn} style={bDng}>Cobrar {it.responsavel}</button>}
    {it.sit === "n" && <button onClick={() => acoes.naoAplica(it)} className={btn} style={{ ...bSec, color: "var(--text-muted)" }} title="Este tipo de certidão não se aplica a este cliente">Não se aplica</button>}
    <button onClick={() => acoes.hist(it)} className={btn} style={bSec}>Histórico</button>
  </div>;
}
export function LinhaCert({ it, adv, acoes, mostrarCli = true }: { it: CertItem; adv: boolean; acoes: ReturnType<typeof useAcaoCert>["acoes"]; mostrarCli?: boolean }) {
  return (
    <div className="px-3.5 py-2.5 border-b last:border-b-0 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderColor: "var(--border)", background: it.sit === "r" ? "var(--tag-red-bg)" : undefined, opacity: it.naoAplica ? 0.55 : 1 }}>
      <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
        <div className="text-[12.5px] break-words" style={{ color: "var(--text-primary)" }}>{mostrarCli ? <><b>{nomeCli(it)}</b><BancaTag b={it.empresa.banca} /> · </> : null}<b>{it.curto}</b></div>
        <div className="text-[10.5px] mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>{it.subtipo} · {validadeDias(it.subtipo)} dias{it.doc?.dados?.emitida_em ? ` · emitida ${fmtData(it.doc.dados.emitida_em)}` : ""}{!adv ? ` · resp. ${it.responsavel}` : ""}{it.positiva ? <> · <span style={{ color: "var(--tag-amber-fg)" }}>positiva c/ efeitos de negativa</span></> : null}{it.cobrancaHoje ? <> · <span style={{ color: "var(--tag-red-fg)", fontWeight: 600 }}>cobrado por {it.cobrancaHoje.autor ?? "coordenação"} às {fmtHora(it.cobrancaHoje.criado_em)}</span></> : null}</div>
      </div>
      <div className="shrink-0"><PzSit it={it} /><div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{labelDias(it)}</div></div>
      <div className="shrink-0"><Acoes it={it} adv={adv} acoes={acoes} /></div>
    </div>
  );
}

/* ───────── página /certidoes ───────── */
export default function CertidoesView({ usuarioNome, coord }: { usuarioNome: string; coord: boolean }) {
  const eu = useEu(); const adv = !coord;
  const { itens, carregando, reload } = useCertidoes({ responsavel: adv ? primeiro(usuarioNome) : undefined });
  const { acoes, drawers } = useAcaoCert(eu, reload);
  const [f, setF] = useState<"atencao" | "venc" | "15" | "30" | "nc" | "todas">("atencao"); const [fResp, setFResp] = useState("todos"); const [modo, setModo] = useState<"lista" | "quadro">("lista"); const [busca, setBusca] = useState("");
  const vivos = itens.filter(i => !i.naoAplica);
  const venc = vivos.filter(i => i.sit === "r" && i.dias! < 0), q15 = vivos.filter(i => i.sit === "r" && i.dias! >= 0), q30 = vivos.filter(i => i.sit === "a"), nc = vivos.filter(i => i.sit === "n");
  const clientes = useMemo(() => Array.from(new Map(itens.map(i => [i.empresa.id, i.empresa])).values()), [itens]);
  const emDia = clientes.filter(c => itens.filter(i => i.empresa.id === c.id).every(i => i.naoAplica || i.sit === "g")).length;
  const resps = useMemo(() => Array.from(new Set(vivos.map(i => i.responsavel))).sort(), [vivos]);
  const lista = useMemo(() => vivos.filter(i => f === "todas" ? true : f === "atencao" ? i.sit !== "g" : f === "venc" ? i.sit === "r" && i.dias! < 0 : f === "15" ? i.sit === "r" && i.dias! >= 0 : f === "30" ? i.sit === "a" : i.sit === "n").filter(i => fResp === "todos" || i.responsavel === fResp).filter(i => !busca || nomeCli(i).toLowerCase().includes(busca.toLowerCase())).sort((a, b) => ORDEM_SIT[a.sit] - ORDEM_SIT[b.sit] || (a.dias ?? 9999) - (b.dias ?? 9999) || nomeCli(a).localeCompare(nomeCli(b))), [vivos, f, fResp, busca]);
  const cump = useMemo(() => cumprimento(itens), [itens]);
  const prox30 = vivos.filter(i => i.dias !== null && i.dias >= 0 && i.dias <= 30).sort((a, b) => a.dias! - b.dias!).slice(0, 8);
  const clientesQuadro = clientes.filter(c => (fResp === "todos" || itens.some(i => i.empresa.id === c.id && i.responsavel === fResp)) && (!busca || (c.nome_exibicao || c.nome).toLowerCase().includes(busca.toLowerCase()))).sort((a, b) => { const sa = Math.min(...itens.filter(i => i.empresa.id === a.id && !i.naoAplica).map(i => ORDEM_SIT[i.sit])); const sb = Math.min(...itens.filter(i => i.empresa.id === b.id && !i.naoAplica).map(i => ORDEM_SIT[i.sit])); return sa - sb || (a.nome_exibicao || a.nome).localeCompare(b.nome_exibicao || b.nome); });
  function excel() {
    const rows: Celula[][] = lista.map(i => [nomeCli(i), i.empresa.banca ?? "", i.responsavel, i.subtipo, i.doc?.dados?.emitida_em ? { d: i.doc.dados.emitida_em } : "", i.doc?.validade ? { d: i.doc.validade } : "", i.dias === null ? "" : { v: i.dias, fmt: "int" }, i.naoAplica ? "não se aplica" : i.sit === "n" ? "não cadastrada" : i.sit === "r" ? (i.dias! < 0 ? "vencida" : "vence em ≤15 dias") : i.sit === "a" ? "vence em ≤30 dias" : "válida", i.doc?.dados?.situacao ?? "", i.doc?.dados?.codigo ?? "", i.doc?.url ?? ""]);
    rows.push(linhaTotal([`${lista.length} certidões`, "", "", "", "", "", "", "", "", "", ""]));
    baixarBlob(criarXlsx([{ nome: "Certidões", colunas: ["Cliente", "Carteira", "Responsável", "Certidão", "Emitida em", "Validade", "Dias", "Situação", "Tipo", "Código", "Arquivo"], larguras: [34, 7, 12, 26, 12, 12, 7, 18, 26, 16, 40], linhas: rows }]), `certidoes-${hojeISO()}.xlsx`);
  }
  const Chip = ({ k, l, n }: { k: typeof f; l: string; n: number }) => <button onClick={() => setF(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chip(f === k)}>{l} <span className="opacity-70">{n}</span></button>;
  return (
    <div className="px-4 md:px-6 pt-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[26px]">Controle de Certidões</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{adv ? "Certidões negativas dos seus clientes. Você emite e anexa; o sistema calcula a validade e avisa com 30 e 15 dias." : "Certidões negativas de todos os clientes. Cada advogado cuida das dos próprios clientes; aqui a coordenação vê o quadro geral e cobra."}</p></div>
        <div className="flex gap-2"><button onClick={excel} disabled={lista.length === 0} className="px-3 py-1.5 rounded text-xs font-medium border disabled:opacity-50" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>Excel</button><button onClick={() => acoes.nova()} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Certidão</button></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mt-3.5">
        {[{ v: venc.length, l: "vencidas", c: venc.length ? "var(--alerta)" : undefined }, { v: q15.length, l: "vencem em ≤15 dias", c: q15.length ? "var(--alerta)" : undefined }, { v: q30.length, l: "vencem em 16–30 dias", c: q30.length ? "var(--atencao)" : undefined }, { v: nc.length, l: "não cadastradas" }, { v: <>{emDia} <span className="text-xs" style={{ color: "var(--text-muted)" }}>de {clientes.length}</span></>, l: "clientes 100% em dia", c: "var(--ok)" }].map((k, i) => <div key={i} className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: k.c ?? "var(--text-primary)" }}>{k.v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{k.l}</div></div>)}
      </div>
      <div className="grid gap-4 mt-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <div className="flex gap-1.5 flex-wrap"><Chip k="atencao" l="Precisam de atenção" n={venc.length + q15.length + q30.length + nc.length} /><Chip k="venc" l="Vencidas" n={venc.length} /><Chip k="15" l="≤15 dias" n={q15.length} /><Chip k="30" l="16–30 dias" n={q30.length} /><Chip k="nc" l="Não cadastradas" n={nc.length} /><Chip k="todas" l="Todas" n={vivos.length} /></div>
            {!adv && <select value={fResp} onChange={e => setFResp(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={bSec}><option value="todos">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>}
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar cliente…" className="px-2.5 py-1.5 rounded text-[11px] border w-[160px]" style={inputStyle} />
            <div className="ml-auto flex gap-1.5"><button onClick={() => setModo("lista")} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chip(modo === "lista")}>Lista</button><button onClick={() => setModo("quadro")} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={chip(modo === "quadro")}>Quadro por cliente</button></div>
          </div>
          {modo === "lista" ? (
            <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {carregando ? <Empty t="Carregando…" /> : lista.length === 0 ? <Empty t={vivos.length ? "Nada aqui com esse filtro. " : "Nenhuma certidão cadastrada ainda. Cadastre pela ficha do cliente (aba Documentos) ou em “+ Certidão”."} /> : lista.map(i => <LinhaCert key={i.empresa.id + i.subtipo} it={i} adv={adv} acoes={acoes} />)}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-[11.5px]"><thead><tr style={{ background: "var(--bg-page)" }}><th className="text-left px-3 py-2 text-[9.5px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Cliente{adv ? "" : " · responsável"}</th>{CERT_TIPOS.map(t => <th key={t} className="text-left px-2.5 py-2 text-[9.5px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{itens.find(i => i.subtipo === t)?.curto ?? t}</th>)}</tr></thead>
                <tbody>{clientesQuadro.map(c => <tr key={c.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}><td className="px-3 py-2"><div className="font-semibold" style={{ color: "var(--text-primary)" }}>{c.nome_exibicao || c.nome}<BancaTag b={c.banca} /></div>{!adv && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{itens.find(i => i.empresa.id === c.id)?.responsavel}</div>}</td>{CERT_TIPOS.map(t => { const i = itens.find(x => x.empresa.id === c.id && x.subtipo === t); if (!i) return <td key={t} />; return <td key={t} className="px-2.5 py-2 cursor-pointer hover:brightness-110" onClick={() => i.sit === "n" && !i.naoAplica ? acoes.renovar(i) : acoes.hist(i)} title={labelDias(i)}>{i.naoAplica ? <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>n/a</span> : <span className="inline-flex items-center gap-1.5"><Dot s={i.sit} /><span style={{ color: i.sit === "r" ? "var(--alerta)" : i.sit === "a" ? "var(--tag-amber-fg)" : i.sit === "n" ? "var(--text-muted)" : "var(--text-primary)", fontWeight: i.sit === "r" ? 600 : 400 }}>{i.sit === "n" ? "cadastrar" : fmtCurta(i.doc!.validade)}</span></span>}</td>; })}</tr>)}</tbody></table>
              <div className="px-3 py-2 text-[10.5px] flex flex-wrap gap-3" style={{ color: "var(--text-muted)" }}><span><Dot s="g" /> válida</span><span><Dot s="a" /> 16–30 dias</span><span><Dot s="r" /> vencida ou ≤15 dias</span><span><Dot s="n" /> não cadastrada</span><span>n/a = não se aplica</span></div>
            </div>
          )}
          <div className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>A certidão mora na ficha do cliente (aba Documentos). Aqui só junta tudo e ordena pelo vencimento. Validade calculada pelo tipo (Federal 180d · Estadual 180d · Municipal 90d · FGTS 30d · CNDT 180d), ajustável. Aos <b>30 dias</b> fica amarela; aos <b>15</b>, vermelha, sobe na barra lateral e entra na Home. <b>Renovar</b> abre já preenchido: só a nova data e o arquivo; a anterior vai para o histórico.</div>
        </div>
        <div className="space-y-4">
          {!adv && <Card title="Cumprimento por responsável">{cump.length === 0 ? <Empty t="Sem dados." /> : cump.map(c => <div key={c.nome} className="grid gap-2 items-center px-3.5 py-2 border-b last:border-b-0 text-xs" style={{ gridTemplateColumns: "64px minmax(0,1fr) 40px", borderColor: "var(--border)" }}><div><b style={{ color: "var(--text-primary)" }}>{c.nome}</b><div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.ok} de {c.total}{c.cobr ? ` · ${c.cobr} cobr.` : ""}</div></div><div className="h-1.5 rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><div className="h-full" style={{ width: `${c.pct}%`, background: c.pct >= 90 ? "var(--ok)" : c.pct >= 75 ? "var(--atencao)" : "var(--alerta)" }} /></div><div className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{c.pct}%</div></div>)}</Card>}
          <Card title="Próximos 30 dias">{prox30.length === 0 ? <Empty t="Nada vencendo em 30 dias." /> : prox30.map(i => <div key={i.empresa.id + i.subtipo} className="px-3.5 py-2 border-b last:border-b-0 flex justify-between gap-2 text-xs cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => acoes.hist(i)}><span className="min-w-0"><b style={{ color: "var(--text-primary)" }}>{nomeCli(i)}</b><br /><span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{i.curto}{adv ? "" : " · " + i.responsavel}</span></span><span className="text-right whitespace-nowrap text-[11px]"><b style={{ color: i.dias! <= 15 ? "var(--alerta)" : "var(--atencao)" }}>{fmtCurta(i.doc!.validade)}</b><br /><span style={{ color: "var(--text-muted)" }}>{i.dias}d</span></span></div>)}</Card>
          <Card title="Onde emitir">{CERT_LINKS.map(([a, b, u]) => <div key={a} className="px-3.5 py-2 border-b last:border-b-0 text-xs" style={{ borderColor: "var(--border)" }}><a href={u} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "var(--acao)" }}>{a} ↗</a><div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{b}</div></div>)}</Card>
        </div>
      </div>
      {drawers}
    </div>
  );
}

/* ───────── bloco na aba Documentos do cliente ───────── */
export function BlocoCertidoesCliente({ empresaId }: { empresaId: string }) {
  const eu = useEu(); const { itens, carregando, reload } = useCertidoes({ empresaId });
  const { acoes, drawers } = useAcaoCert(eu, reload);
  const adv = !!eu && !eu.coord; const vivos = itens.filter(i => !i.naoAplica);
  const ord = [...itens].sort((a, b) => (a.naoAplica ? 1 : 0) - (b.naoAplica ? 1 : 0) || ORDEM_SIT[a.sit] - ORDEM_SIT[b.sit] || (a.dias ?? 9999) - (b.dias ?? 9999));
  return (<>
    <Card title="Certidões negativas" action={<span style={{ color: "var(--text-secondary)" }}>{vivos.filter(i => i.sit === "g").length} de {vivos.length} em dia · <Link href="/certidoes" style={{ color: "var(--acao)" }}>ver Controle de Certidões →</Link></span>}>
      {carregando ? <Empty t="Carregando…" /> : ord.map(i => <LinhaCert key={i.subtipo} it={i} adv={adv} acoes={acoes} mostrarCli={false} />)}
    </Card>
    {drawers}
  </>);
}

/* ───────── bloco na Home (só vermelhas) ───────── */
export function BlocoCertidoesHome({ eu }: { eu: Eu | null }) {
  const adv = !!eu && !eu.coord;
  const { itens, carregando, reload } = useCertidoes({ responsavel: adv ? eu!.primeiro : undefined, desligado: !eu });
  const { acoes, drawers } = useAcaoCert(eu, reload);
  const venc = itens.filter(i => !i.naoAplica && i.sit === "r").sort((a, b) => a.dias! - b.dias!);
  if (!carregando && venc.length === 0) return null;
  return (<>
    <Card tom="amb" title={<>Certidões · {venc.length} vencida{venc.length === 1 ? "" : "s"} ou a vencer em 15 dias</>} action={<Link href="/certidoes" style={{ color: "var(--acao)" }}>ver Controle de Certidões →</Link>}>
      {carregando ? <Empty t="Carregando…" /> : venc.slice(0, 8).map(i => <LinhaCert key={i.empresa.id + i.subtipo} it={i} adv={adv} acoes={acoes} />)}
      {venc.length > 8 && <div className="px-3.5 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>+ {venc.length - 8} no Controle.</div>}
    </Card>
    {drawers}
  </>);
}
