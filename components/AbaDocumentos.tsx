"use client";
// Aba Documentos v2 — acervo reaproveitável do caso (spec_documentos_acervo.md v2.1; protótipo aba_documentos_interativo_2026-10-17.html).
// Lê caso_documentos (RLS caso_visivel); toda escrita passa pelas funções pa_documento_* (security definer), que registram em documento_eventos.
import { useEffect, useMemo, useState } from "react";
import type { createClient } from "@/lib/supabase";
import { CERT_TIPOS } from "@/lib/certidoes";

type SB = ReturnType<typeof createClient>;
type Aproveitado = { destino: string; detalhe?: Record<string, any>; por?: string; em?: string; evento_id?: string };
export type DocAcervo = {
  id: string; caso_id: string; chave: string; sistema: string | null; data: string | null; evento: number | null; folhas: number | null;
  tipo: string | null; titulo: string | null; link: string | null; ausente_desde: string | null; paginas: number[] | null;
  classe: string | null; subtipo: string | null; titulo_acervo: string | null; validade: string | null; tags: string[] | null; observacao: string | null;
  confianca: string | null; classe_origem: string | null; classificado_por: string | null; classificado_em: string | null;
  sugestao: Record<string, any> | null; sugestao_decisao: Record<string, any> | null; aproveitado: Aproveitado[] | null; hash_texto: string | null;
};

export const CLASSES: { k: string; l: string; cor: string; sub: string[] }[] = [
  { k: "societario", l: "Societário", cor: "blue", sub: ["contrato_social", "ata", "procuracao", "substabelecimento", "cnpj", "documento_socio", "outro"] },
  { k: "contabil_fiscal", l: "Contábil / fiscal", cor: "purple", sub: ["balanco", "dre", "livro", "obrigacao_acessoria", "demonstrativo_debito", "parcelamento", "cda", "outro"] },
  { k: "certidao", l: "Certidões", cor: "green", sub: [...CERT_TIPOS, "Outra"] },
  { k: "incentivo", l: "Incentivo fiscal", cor: "amber", sub: ["termo_acordo", "tare", "enquadramento", "carta_consulta", "relatorio_codin", "outro"] },
  { k: "provas", l: "Provas e laudos", cor: "red", sub: ["laudo", "pericia", "foto", "calculo", "outro"] },
  { k: "jurisprudencia", l: "Jurisprudência", cor: "blue", sub: ["acordao", "decisao", "parecer", "doutrina"] },
  { k: "comprovantes", l: "Comprovantes", cor: "gray", sub: ["guia", "recibo", "extrato"] },
  { k: "correspondencia", l: "Correspondência", cor: "gray", sub: ["email", "oficio", "notificacao"] },
  { k: "peca", l: "Peça processual (ocultar)", cor: "gray", sub: [] },
];
const SUB_L: Record<string, string> = { contrato_social: "contrato social", procuracao: "procuração", substabelecimento: "substabelecimento", cnpj: "cartão CNPJ", documento_socio: "documento do sócio", balanco: "balanço", dre: "DRE", livro: "livro", obrigacao_acessoria: "obrigação acessória", demonstrativo_debito: "demonstrativo de débito", parcelamento: "parcelamento", cda: "CDA", laudo: "laudo", pericia: "perícia", foto: "fotos", calculo: "cálculo", acordao: "acórdão", decisao: "decisão", parecer: "parecer", doutrina: "doutrina", guia: "guia", recibo: "recibo", extrato: "extrato", email: "e-mail", oficio: "ofício", notificacao: "notificação", termo_acordo: "termo de acordo", tare: "TARE", enquadramento: "enquadramento", carta_consulta: "carta-consulta", relatorio_codin: "relatório CODIN", ata: "ata", outro: "outro" };
const DEST_L: Record<string, string> = { certidoes: "Certidões da empresa", documentos_empresa: "Documentos da empresa", modelos: "Modelos e paradigmas", caso: "outro caso" };
const classeDe = (k?: string | null) => CLASSES.find(c => c.k === k);
const subL = (s?: string | null) => (s ? SUB_L[s] ?? s : "");
const fmt = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—");
const fmtDT = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const tag = (cor: string) => ({ background: `var(--tag-${cor}-bg)`, color: `var(--tag-${cor}-fg)` });
const inputCls = "w-full px-2.5 py-1.5 rounded text-[12px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const lbl = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const btn = "px-2 py-1 rounded border text-[11px] font-medium whitespace-nowrap";
const btnStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;
const tituloDe = (d: DocAcervo) => d.titulo_acervo || [d.tipo, d.titulo && d.titulo !== d.tipo ? d.titulo : null].filter(Boolean).join(" · ") || "Documento";
const erroMsg = (e: any) => String(e?.message ?? e ?? "erro").replace(/^.*?ERROR:\s*/, "");

export default function AbaDocumentos({ caso, supabase, eu }: { caso: { id: string; empresa_id: string; numero?: string | null }; supabase: SB; eu: string }) {
  const [docs, setDocs] = useState<DocAcervo[] | null>(null);
  const [q, setQ] = useState(""); const [fClasse, setFClasse] = useState<string | null>(null);
  const [verPecas, setVerPecas] = useState(false); const [soSemLink, setSoSemLink] = useState(false); const [soConfirmar, setSoConfirmar] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); const [aprovId, setAprovId] = useState<string | null>(null); const [novo, setNovo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [ocorr, setOcorr] = useState<Record<string, { numero: string; caso_id: string }[]>>({});

  useEffect(() => {
    let on = true;
    const load = () => supabase.from("caso_documentos").select("*").eq("caso_id", caso.id)
      .order("data", { ascending: false, nullsFirst: false }).order("evento", { ascending: false, nullsFirst: false }).order("chave").limit(2000)
      .then(({ data }) => { if (on) setDocs((data ?? []) as DocAcervo[]); });
    load();
    const ch = supabase.channel(`caso-acervo-${caso.id}`).on("postgres_changes", { event: "*", schema: "public", table: "caso_documentos", filter: `caso_id=eq.${caso.id}` }, load).subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caso.id]);

  const todos = docs ?? [];
  const acervo = todos.filter(d => d.classe !== "peca");
  const nPecas = todos.length - acervo.length;
  const nConfirmar = acervo.filter(d => d.sugestao).length;
  const base = verPecas ? todos : acervo;
  const contagem = useMemo(() => { const m: Record<string, number> = {}; for (const d of base) { const k = d.classe ?? "_"; m[k] = (m[k] ?? 0) + 1; } return m; }, [base]);
  const lista = base.filter(d => {
    if (fClasse && (fClasse === "_" ? d.classe !== null : d.classe !== fClasse)) return false;
    if (soSemLink && d.link) return false;
    if (soConfirmar && !d.sugestao) return false;
    if (q.trim()) { const s = q.trim().toLowerCase(); const hay = [d.titulo_acervo, d.titulo, d.tipo, d.observacao, subL(d.subtipo), d.subtipo, ...(d.tags ?? [])].join(" ").toLowerCase(); if (!hay.includes(s)) return false; }
    return true;
  });

  async function rpc(fn: string, args: Record<string, any>, ok: string) {
    setMsg(null);
    const { data, error } = await supabase.rpc(fn, args);
    if (error) { setMsg({ ok: false, t: erroMsg(error) }); return null; }
    setMsg({ ok: true, t: ok }); return data as any;
  }
  async function verOcorrencias(d: DocAcervo) {
    const { data } = await supabase.rpc("pa_documento_ocorrencias", { p_id: d.id });
    setOcorr(o => ({ ...o, [d.id]: ((data ?? []) as any[]).map(x => ({ numero: x.numero, caso_id: x.caso_id })) }));
  }

  if (docs === null) return <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>Carregando documentos…</div>;
  return (
    <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-3.5 py-2.5 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
          <b style={{ color: "var(--text-primary)" }}>{acervo.length} documento{acervo.length === 1 ? "" : "s"} de acervo</b>
          <span>· {nPecas} peça{nPecas === 1 ? "" : "s"} processua{nPecas === 1 ? "l oculta" : "is ocultas"}</span>
          {nConfirmar > 0 && <span style={{ color: "var(--tag-amber-fg)" }}>· {nConfirmar} sugest{nConfirmar === 1 ? "ão" : "ões"} a confirmar</span>}
          <button className={btn + " ml-auto"} style={{ ...btnStyle, color: "var(--acao)", borderColor: "var(--acao)" }} onClick={() => setNovo(v => !v)}>+ adicionar documento (link)</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input className={inputCls + " !w-60"} style={inputStyle} placeholder="buscar título, tag, observação…" value={q} onChange={e => setQ(e.target.value)} />
          {[["Mostrar peças processuais", verPecas, setVerPecas], ["Só não arquivados", soSemLink, setSoSemLink], [`A confirmar (${nConfirmar})`, soConfirmar, setSoConfirmar]].map(([l, v, set]: any) => (
            <button key={l} className={btn} style={v ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : btnStyle} onClick={() => set(!v)}>{l}</button>))}
        </div>
        <div className="flex flex-wrap gap-1">
          <button className={btn} style={!fClasse ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : btnStyle} onClick={() => setFClasse(null)}>todas ({base.length})</button>
          {CLASSES.filter(c => contagem[c.k]).map(c => <button key={c.k} className={btn} style={fClasse === c.k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : btnStyle} onClick={() => setFClasse(fClasse === c.k ? null : c.k)}>{c.k === "peca" ? "Peças" : c.l} ({contagem[c.k]})</button>)}
          {contagem["_"] ? <button className={btn} style={fClasse === "_" ? { background: "var(--atencao)", borderColor: "var(--atencao)", color: "var(--on-acao)" } : { ...btnStyle, color: "var(--tag-amber-fg)" }} onClick={() => setFClasse(fClasse === "_" ? null : "_")}>a classificar ({contagem["_"]})</button> : null}
        </div>
        {msg && <div className="px-2.5 py-1.5 rounded text-[11.5px]" style={msg.ok ? tag("green") : tag("red")}>{msg.t}</div>}
      </div>

      {novo && <Editor titulo="Adicionar documento por link" inicial={null} onCancel={() => setNovo(false)} comLink
        onSave={async p => { const r = await rpc("pa_documento_adicionar", { p_caso: caso.id, p, p_autor: eu }, "Documento adicionado ao acervo."); if (r) setNovo(false); }} />}

      {lista.length === 0 ? <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{todos.length === 0 ? "Nenhum documento indexado para este caso ainda — a Rotina A envia o índice da cópia integral, já classificado." : "Nenhum documento com esses filtros."}</div> :
        lista.map(d => {
          const c = classeDe(d.classe); const vencida = d.validade ? d.validade < hojeISO() : false;
          return (
            <div key={d.id} className="px-3.5 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)", opacity: d.ausente_desde ? 0.6 : 1 }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c ? <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-px rounded" style={tag(c.cor)}>{c.k === "peca" ? "peça" : c.l}{d.subtipo ? ` · ${subL(d.subtipo)}` : ""}</span>
                      : <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-px rounded" style={tag("amber")}>a classificar</span>}
                    <b className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>{tituloDe(d)}</b>
                    {d.hash_texto && <button className="text-[10.5px]" style={{ color: "var(--text-muted)" }} title="Outros casos da mesma empresa com o mesmo documento" onClick={() => verOcorrencias(d)}>★</button>}
                  </div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {d.data ? fmt(d.data) : "sem data"}{d.evento != null ? ` · ev. ${d.evento}` : d.folhas != null ? ` · fls. ${d.folhas}` : ""}{d.paginas?.length ? ` · ${d.paginas.length} pág.` : ""}
                    {d.validade && <span style={{ color: vencida ? "var(--tag-red-fg)" : "var(--tag-green-fg)" }}> · válida até {fmt(d.validade)}{vencida ? " (vencida)" : ""}</span>}
                    {d.classe_origem === "humano" ? ` · editado por ${d.classificado_por ?? "—"}${d.classificado_em ? ` em ${fmtDT(d.classificado_em)}` : ""}` : d.classe_origem === "rotina" ? ` · classificado pela Rotina A${d.confianca ? ` (confiança ${d.confianca})` : ""}` : ""}
                    {d.ausente_desde && " · não consta mais na cópia"}
                  </div>
                  {!!d.tags?.length && <div className="flex flex-wrap gap-1 mt-1">{d.tags.map(t => <span key={t} className="text-[10px] px-1.5 rounded" style={tag("gray")}>{t}</span>)}</div>}
                  {d.observacao && <div className="text-[11px] mt-1 italic" style={{ color: "var(--text-secondary)" }}>{d.observacao}</div>}
                  {ocorr[d.id] && <div className="text-[10.5px] mt-1" style={{ color: "var(--text-secondary)" }}>★ {ocorr[d.id].length ? `aparece em ${ocorr[d.id].length + 1} casos: este, ${ocorr[d.id].map(o => o.numero).join(", ")}` : "só neste caso"}</div>}
                  {(d.aproveitado ?? []).map((a, i) => (
                    <div key={i} className="inline-flex items-center gap-1.5 mt-1 mr-1.5 text-[10.5px] px-1.5 py-0.5 rounded" style={tag("green")}>
                      ✓ aproveitado: {DEST_L[a.destino] ?? a.destino}{a.detalhe?.historico ? " (histórico)" : ""} · {a.por ?? "—"} · {fmtDT(a.em)}
                      {a.evento_id && <button className="underline" title="Até 10 min pelo autor: desfaz direto. Depois: vira pedido de exclusão para a coordenação." onClick={() => rpc("pa_documento_desfazer", { p_evento_id: a.evento_id, p_autor: eu }, "Desfeito (ou pedido de exclusão registrado).")}>desfazer</button>}
                    </div>))}
                  {d.sugestao && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 px-2 py-1 rounded text-[11px]" style={tag("amber")}>
                      <span>Sugestão da Rotina A: enviar para <b>{DEST_L[d.sugestao.destino] ?? d.sugestao.destino}</b>{d.sugestao.subtipo ? ` · ${d.sugestao.subtipo}` : ""}{d.sugestao.validade ? ` · válida até ${fmt(d.sugestao.validade)}` : ""}</span>
                      <button className={btn} style={{ ...btnStyle, color: "var(--ok)", borderColor: "var(--ok)" }} onClick={() => rpc("pa_documento_sugestao", { p_id: d.id, p_acao: "confirmar", p_autor: eu }, "Sugestão confirmada.")}>confirmar</button>
                      <button className={btn} style={btnStyle} onClick={() => rpc("pa_documento_sugestao", { p_id: d.id, p_acao: "descartar", p_autor: eu }, "Sugestão descartada.")}>descartar</button>
                    </div>)}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {d.link ? <a href={d.link} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium" style={{ color: "var(--acao)" }}>Abrir ↗</a> : <span className="text-[10.5px] italic" style={{ color: "var(--text-muted)" }}>não arquivado</span>}
                  <div className="flex gap-1">
                    <button className={btn} style={btnStyle} onClick={() => { setEditId(editId === d.id ? null : d.id); setAprovId(null); }}>✎ editar</button>
                    {d.classe !== "peca" && <button className={btn} style={btnStyle} onClick={() => { setAprovId(aprovId === d.id ? null : d.id); setEditId(null); }}>⤴ aproveitar ▾</button>}
                  </div>
                </div>
              </div>
              {editId === d.id && <Editor titulo="Editar classificação" inicial={d} onCancel={() => setEditId(null)}
                onSave={async p => { const r = await rpc("pa_documento_editar", { p_id: d.id, p_patch: p, p_autor: eu }, "Classificação salva."); if (r) setEditId(null); }} />}
              {aprovId === d.id && <Aproveitar d={d} supabase={supabase} empresaId={caso.empresa_id} casoId={caso.id} onCancel={() => setAprovId(null)}
                onGo={async (destino, params) => { const r = await rpc("pa_documento_aproveitar", { p_id: d.id, p_destino: destino, p_params: params, p_autor: eu }, destino === "certidoes" ? "Enviado ao controle de Certidões." : `Aproveitado em ${DEST_L[destino]}.`); if (r) setAprovId(null); }} />}
            </div>);
        })}
    </div>
  );
}

function Editor({ titulo, inicial, onSave, onCancel, comLink }: { titulo: string; inicial: DocAcervo | null; onSave: (p: Record<string, any>) => void; onCancel: () => void; comLink?: boolean }) {
  const [f, setF] = useState({ classe: inicial?.classe ?? "", subtipo: inicial?.subtipo ?? "", titulo_acervo: inicial?.titulo_acervo ?? (inicial ? tituloDe(inicial) : ""), validade: inicial?.validade ?? "", observacao: inicial?.observacao ?? "", tags: (inicial?.tags ?? []).join(", "), link: "" });
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v, ...(k === "classe" ? { subtipo: "" } : {}) }));
  const c = classeDe(f.classe); const cert = f.classe === "certidao";
  const ok = !!f.titulo_acervo.trim() && (!cert || !!f.validade) && (!comLink || /^https:\/\//i.test(f.link.trim()));
  const salvar = () => onSave({ classe: f.classe || null, subtipo: f.subtipo || null, titulo_acervo: f.titulo_acervo.trim(), validade: f.validade || null, observacao: f.observacao.trim() || null, tags: f.tags.split(",").map(t => t.trim()).filter(Boolean), ...(comLink ? { link: f.link.trim() } : {}) });
  return (
    <div className="mx-3.5 my-2 px-3 py-2.5 rounded border" style={{ borderColor: "var(--acao)", background: "var(--bg-page)" }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--acao)" }}>{titulo}</div>
      <label className={lbl} style={{ color: "var(--text-secondary)" }}>Classe</label>
      <div className="flex flex-wrap gap-1 mb-2">{CLASSES.filter(x => !comLink || x.k !== "peca").map(x => <button key={x.k} type="button" className={btn} style={f.classe === x.k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : btnStyle} onClick={() => set("classe", x.k)}>{x.l}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Subtipo</label>
          <select className={inputCls} style={inputStyle} value={f.subtipo} disabled={!c?.sub.length} onChange={e => set("subtipo", e.target.value)}><option value="">—</option>{(c?.sub ?? []).map(s => <option key={s} value={s}>{cert ? s : subL(s)}</option>)}</select></div>
        <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Validade{cert && <span style={{ color: "var(--alerta)" }}> *</span>}</label>
          <input type="date" className={inputCls} style={inputStyle} value={f.validade} onChange={e => set("validade", e.target.value)} />{cert && !f.validade && <div className="text-[10px] mt-0.5" style={{ color: "var(--alerta)" }}>Certidão precisa de validade.</div>}</div>
      </div>
      <div className="mb-2"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Título <span style={{ color: "var(--alerta)" }}>*</span></label><input className={inputCls} style={inputStyle} value={f.titulo_acervo} onChange={e => set("titulo_acervo", e.target.value)} placeholder="Ex.: Contrato social consolidado — 7ª alteração (2013)" /></div>
      {comLink && <div className="mb-2"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Link (Google Drive) <span style={{ color: "var(--alerta)" }}>*</span></label><input className={inputCls} style={inputStyle} value={f.link} onChange={e => set("link", e.target.value)} placeholder="https://drive.google.com/…" /></div>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Tags (separadas por vírgula)</label><input className={inputCls} style={inputStyle} value={f.tags} onChange={e => set("tags", e.target.value)} /></div>
        <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Observação</label><input className={inputCls} style={inputStyle} value={f.observacao} onChange={e => set("observacao", e.target.value)} /></div>
      </div>
      <div className="flex gap-2 justify-end"><button className={btn} style={btnStyle} onClick={onCancel}>Cancelar</button><button className={btn + " text-on-acao disabled:opacity-50"} style={{ background: "var(--acao)", borderColor: "var(--acao)" }} disabled={!ok} onClick={salvar}>Salvar</button></div>
    </div>
  );
}

function Aproveitar({ d, supabase, empresaId, casoId, onGo, onCancel }: { d: DocAcervo; supabase: SB; empresaId: string; casoId: string; onGo: (destino: string, params: Record<string, any>) => void; onCancel: () => void }) {
  const certOk = d.classe === "certidao" && !!d.validade && (CERT_TIPOS as readonly string[]).includes(d.subtipo ?? "");
  const [busca, setBusca] = useState(""); const [casos, setCasos] = useState<{ id: string; numero: string | null; titulo: string | null }[]>([]);
  useEffect(() => {
    let on = true; const s = busca.trim();
    let qb = supabase.from("casos").select("id, numero, titulo").neq("id", casoId).eq("ativo", true).limit(8);
    qb = s.length >= 3 ? qb.or(`numero.ilike.%${s.replace(/[,()%]/g, "")}%,titulo.ilike.%${s.replace(/[,()%]/g, "")}%`) : qb.eq("empresa_id", empresaId);
    qb.then(({ data }) => { if (on) setCasos((data ?? []) as any[]); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);
  return (
    <div className="mx-3.5 my-2 px-3 py-2.5 rounded border text-[11.5px]" style={{ borderColor: "var(--ok)", background: "var(--bg-page)", color: "var(--text-secondary)" }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--ok)" }}>Aproveitar este documento</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button className={btn} style={btnStyle} disabled={!certOk} title={certOk ? "Entra no controle de Certidões; se for mais antiga que a vigente, entra como histórico" : "Só certidão com validade e com um dos 5 tipos do controle"} onClick={() => onGo("certidoes", {})}>Certidões da empresa{!certOk && " (indisponível)"}</button>
        <button className={btn} style={btnStyle} disabled={!d.link} onClick={() => onGo("documentos_empresa", { tipo: d.subtipo ?? d.classe })}>Documentos da empresa</button>
        <button className={btn} style={btnStyle} disabled={!d.link} onClick={() => onGo("modelos", {})}>Modelos e paradigmas</button>
      </div>
      <label className={lbl}>Outro caso (referência, sem copiar o arquivo)</label>
      <input className={inputCls + " mb-1.5"} style={inputStyle} value={busca} onChange={e => setBusca(e.target.value)} placeholder="nº ou título (vazio = casos do mesmo cliente)" />
      <div className="max-h-40 overflow-y-auto">{casos.map(k => <button key={k.id} className="block w-full text-left px-2 py-1 rounded hover:opacity-80" style={{ color: "var(--text-primary)" }} onClick={() => onGo("caso", { caso_id: k.id })}>→ {k.numero ?? "—"} · {k.titulo ?? ""}</button>)}</div>
      <div className="flex justify-end mt-2"><button className={btn} style={btnStyle} onClick={onCancel}>Fechar</button></div>
    </div>
  );
}
