"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { NovaEmpresaDrawer, BANCAS, type Empresa } from "./ClientesListView";
import { AREAS, TIPOS_DOC, CHECKLIST_9025, addDays, type Area, type Field } from "@/lib/areas";
import { BlocoCertidoesCliente } from "./Certidoes";
import RotinasCliente from "./RotinasCliente";
import { cnjValido, pareceCNJ, cnjGrau, soDigitos } from "@/lib/cnj";

export type Caso = { id: string; empresa_id: string; area: Area; titulo: string; numero: string | null; orgao: string | null; situacao: string; advogado: string | null; observacoes: string | null; prazo_proximo: string | null; prazo_fatal?: boolean | null; dados: Record<string, any>; ativo: boolean; criado_em: string };
export type Documento = { id: string; empresa_id: string; tipo: string; nome: string; url: string | null; validade: string | null; observacao: string | null; dados: Record<string, any>; criado_em: string };

const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const fmt = (d: string | null | undefined) => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—";
const ini = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

/* ───────── UI básicos ───────── */
function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{title}</span>{action}</div>
      {children}
    </div>
  );
}
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Pz = ({ pz, cls }: { pz: string; cls: string }) => pz === "—" ? <span style={{ color: "var(--text-muted)" }}>—</span> :
  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap" style={cls === "fatal" ? { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" } : cls === "prox" ? { background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" } : cls === "ok" ? { background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" } : { color: "var(--text-secondary)" }}>{pz}</span>;
const Steps = ({ n, total, fail }: { n: number; total: number; fail?: string }) => <span className="inline-flex gap-0.5 align-middle" title={fail}>{Array.from({ length: total }, (_, i) => <i key={i} className="inline-block w-3.5 h-[5px] rounded-sm border" style={fail ? { background: "var(--alerta)", borderColor: "var(--alerta)" } : { background: i < n ? "var(--ok)" : i === n ? "var(--acao)" : "var(--bg-page)", borderColor: i < n ? "var(--ok)" : i === n ? "var(--acao)" : "var(--border)" }} />)}</span>;

function Drawer({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[560px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}>
          <div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>{sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}</div>
          <button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>{footer}</div>
      </aside>
    </>
  );
}

/* ───────── renderizador genérico de campos ───────── */
function TagsInput({ value, onChange, opts, ph }: { value: string[]; onChange: (v: string[]) => void; opts: string[]; ph?: string }) {
  const [q, setQ] = useState("");
  const disponiveis = opts.filter(o => !value.includes(o) && o.toLowerCase().includes(q.toLowerCase()));
  const novo = q.trim() && !opts.some(o => o.toLowerCase() === q.trim().toLowerCase()) && !value.includes(q.trim());
  const add = (t: string) => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setQ(""); };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded border min-h-[38px]" style={inputStyle}>
        {value.map(t => <span key={t} className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>{t} <button type="button" onClick={() => onChange(value.filter(x => x !== t))} className="ml-1" style={{ color: "var(--text-muted)" }}>×</button></span>)}
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(q); } }} placeholder={value.length ? "" : ph} className="flex-1 min-w-[120px] bg-transparent text-xs outline-none" style={{ color: "var(--text-primary)" }} />
      </div>
      {(q || disponiveis.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {disponiveis.slice(0, 12).map(o => <button key={o} type="button" onClick={() => add(o)} className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border hover:brightness-125" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>+ {o}</button>)}
          {novo && <button type="button" onClick={() => add(q)} className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border" style={{ background: "var(--tag-blue-bg)", borderColor: "var(--acao)", color: "var(--tag-blue-fg)" }}>criar “{q.trim()}”</button>}
        </div>
      )}
    </div>
  );
}

function Fields({ fields, d, set, fluxo, tagOpts = [] }: { fields: Field[]; d: Record<string, any>; set: (k: string, v: any) => void; fluxo?: string[]; tagOpts?: string[] }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.section) out.push(<div key={"s" + i} className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 first:mt-0 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{f.section}</div>);
    const group: Field[] = [f];
    if (f.half || f.third) { const n = f.third ? 3 : 2; while (group.length < n && fields[i + group.length] && (fields[i + group.length].third === f.third && fields[i + group.length].half === f.half) && !fields[i + group.length].section) group.push(fields[i + group.length]); }
    out.push(<div key={"g" + i} className={group.length > 1 ? `grid gap-2.5 mb-2.5 ${group.length === 3 ? "grid-cols-3" : "grid-cols-2"}` : "mb-2.5"}>{group.map(g => <FieldInput key={g.k} f={g} d={d} set={set} fluxo={fluxo} tagOpts={tagOpts} />)}</div>);
    i += group.length;
  }
  return <>{out}</>;
}
function FieldInput({ f, d, set, fluxo, tagOpts }: { f: Field; d: Record<string, any>; set: (k: string, v: any) => void; fluxo?: string[]; tagOpts: string[] }) {
  const v = d[f.k];
  const opts = f.k === "situacao" && fluxo ? fluxo : (f.opts ?? []);
  const auto = f.auto?.(d);
  return (
    <div>
      <label className={labelCls} style={{ color: "var(--text-secondary)" }}>{f.label}{f.req && <span style={{ color: "var(--alerta)" }}> *</span>}</label>
      {f.type === "tags" ? <TagsInput value={Array.isArray(v) ? v : (v ? String(v).split(",").map(s => s.trim()).filter(Boolean) : [])} onChange={val => set(f.k, val)} opts={tagOpts} ph={f.ph} />
        : f.type === "textarea" ? <textarea className={inputCls + " min-h-[64px] resize-y"} style={inputStyle} value={v ?? ""} placeholder={f.ph} onChange={e => set(f.k, e.target.value)} />
        : f.type === "select" ? <select className={inputCls} style={inputStyle} value={v ?? ""} onChange={e => set(f.k, e.target.value)}><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
        : f.type === "seg" ? <div className="flex gap-1.5 flex-wrap">{opts.map(o => <button key={o} type="button" onClick={() => set(f.k, o)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={v === o ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{o}</button>)}</div>
        : f.type === "multi" ? <div className="flex gap-1.5 flex-wrap">{opts.map(o => { const on = (v ?? []).includes(o); return <button key={o} type="button" onClick={() => set(f.k, on ? (v ?? []).filter((x: string) => x !== o) : [...(v ?? []), o])} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{o}</button>; })}</div>
        : <input type={f.type === "date" ? "date" : "text"} className={inputCls} style={inputStyle} value={v ?? ""} placeholder={f.ph} onChange={e => set(f.k, e.target.value)} />}
      {auto && <div className="text-[10px] mt-0.5" style={{ color: "var(--ok)" }}>{auto}</div>}
      {f.hint && !auto && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{f.hint}</div>}
    </div>
  );
}

const COMMON = ["titulo", "numero", "orgao", "situacao", "advogado", "observacoes", "prazo_proximo"];
function splitCaso(d: Record<string, any>) {
  const base: Record<string, any> = {}; const dados: Record<string, any> = {};
  for (const [k, v] of Object.entries(d)) (COMMON.includes(k) ? base : dados)[k] = v === "" ? null : v;
  return { base, dados };
}

/* ───────── drawer de caso ───────── */
export function CasoDrawer({ empresaId, area: a0, inicial, docs, tagOpts, onClose, onSaved, onExcluir, supabase, areasPermitidas }: { empresaId: string; area: Area; inicial?: Caso; docs: Documento[]; tagOpts: string[]; onClose: () => void; onSaved: (area: Area) => void; onExcluir: (c: Caso) => void; supabase: ReturnType<typeof createClient>; areasPermitidas?: Area[] }) {
  const AREAS_OPT = areasPermitidas ? AREAS.filter(x => areasPermitidas.includes(x.key)) : AREAS;
  const edit = !!inicial;
  const [area, setArea] = useState<Area>(a0);
  const A = AREAS.find(x => x.key === area)!;
  const [d, setD] = useState<Record<string, any>>(() => inicial
    ? { titulo: inicial.titulo, numero: inicial.numero ?? "", orgao: inicial.orgao ?? "", situacao: inicial.situacao, advogado: inicial.advogado ?? "", observacoes: inicial.observacoes ?? "", prazo_proximo: inicial.prazo_proximo ?? "", ...inicial.dados }
    : { situacao: A.fluxo[0], gerar_checklist: "Gerar padrão da lei (12 itens)" });
  const set = (k: string, v: any) => setD(p => ({ ...p, [k]: v }));
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  // Validação do número CNJ (só quando o campo parece um CNJ — outras áreas usam SEI/TIF/requerimento):
  // formato + dígito verificador bloqueiam o salvar; 2º grau no 1º e duplicado só alertam.
  const numeroStr = (d.numero ?? "").toString();
  const numeroCNJ = pareceCNJ(numeroStr);
  const numeroBad = numeroCNJ && !cnjValido(numeroStr);
  const textoGrau = [d.instancia, d.orgao, d.titulo, d.observacoes].filter(Boolean).join(" ").toUpperCase();
  const pareceSegundoGrau = /^(2ª|SUPERIOR)$/.test(String(d.instancia ?? "")) || /C[ÂA]MARA|TURMA|DESEMBARG|RELATOR|2[ºO°]?\s*G(RAU)?\b/.test(textoGrau);
  const alertaGrau = numeroCNJ && !numeroBad && cnjGrau(numeroStr) === 1 && pareceSegundoGrau;
  const [duplicados, setDuplicados] = useState<{ id: string; numero: string | null; titulo: string }[]>([]);
  useEffect(() => {
    const dig = soDigitos(numeroStr);
    if (!numeroCNJ || dig.length < 7) { setDuplicados([]); return; }
    const seq = dig.slice(0, 7);
    let vivo = true;
    supabase.from("casos").select("id, numero, titulo").eq("empresa_id", empresaId).ilike("numero", seq + "%").limit(10)
      .then(({ data }) => { if (vivo) setDuplicados(((data ?? []) as any[]).filter(c => c.id !== inicial?.id && soDigitos(c.numero).slice(0, 7) === seq)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeroStr, empresaId]);

  const valido = (d.titulo ?? "").trim().length > 2 && !numeroBad && A.fields.filter(f => f.req && f.k !== "titulo").every(f => Array.isArray(d[f.k]) ? d[f.k].length : (d[f.k] ?? "").toString().trim());

  async function salvar() {
    if (!valido) return; setSalvando(true); setErro(null);
    const { base, dados } = splitCaso(d);
    // incentivo: gera checklist padrão, marcando certidões já cadastradas no cliente como obtidas
    if (area === "incentivo" && !edit && dados.gerar_checklist?.startsWith("Gerar")) {
      dados.checklist = CHECKLIST_9025.map(([nome, exigido]) => {
        const doc = docs.find(x => x.tipo === "certidao" && nome.toLowerCase().includes((x.dados?.subtipo ?? "").toLowerCase().split(" ")[0] || "§") && x.validade && new Date(x.validade) > new Date());
        return { nome, exigido_por: exigido, status: doc ? "obtido" : "pendente", validade: doc?.validade ?? null };
      });
    }
    delete dados.gerar_checklist;
    // contencioso: recebeu número → sai de "Em preparação"
    if (area === "contencioso" && base.numero && base.situacao === "Em preparação") base.situacao = "Distribuído";
    const payload = { empresa_id: empresaId, area, ...base, dados, situacao: base.situacao || A.fluxo[0] };
    const res = edit ? await supabase.from("casos").update(payload).eq("id", inicial!.id) : await supabase.from("casos").insert(payload);
    setSalvando(false);
    if (res.error) { setErro(res.error.message); return; }
    onSaved(area);
  }

  return (
    <Drawer title={edit ? `Modificar ${A.sing}` : `Nov${A.artigo} ${A.sing}`} sub={A.hint} onClose={onClose}
      footer={<>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{edit ? <button onClick={() => onExcluir(inicial!)} className="font-medium" style={{ color: "var(--alerta)" }}>Excluir</button> : "* obrigatórios"}</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
          <button onClick={salvar} disabled={!valido || salvando} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{salvando ? "Salvando…" : edit ? "Salvar alterações" : "Salvar"}</button>
        </div>
      </>}>
      {!edit && (
        <div className="mb-3">
          <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Área</label>
          <div className="flex gap-1.5 flex-wrap">{AREAS_OPT.map(x => <button key={x.key} type="button" onClick={() => { setArea(x.key); set("situacao", x.fluxo[0]); }} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={area === x.key ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{x.icon} {x.label}</button>)}</div>
        </div>
      )}
      <Fields fields={A.fields.filter(f => !(edit && f.k === "gerar_checklist"))} d={d} set={set} fluxo={A.fluxo} tagOpts={tagOpts} />
      {edit && area === "incentivo" && Array.isArray(d.checklist) && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Checklist documental · {d.checklist.filter((i: any) => i.status === "obtido").length}/{d.checklist.length}</div>
          {d.checklist.map((it: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2 py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: "var(--border)" }}>
              <button type="button" onClick={() => set("checklist", d.checklist.map((x: any, j: number) => j === idx ? { ...x, status: x.status === "obtido" ? "pendente" : "obtido" } : x))} className="w-4 h-4 rounded border flex-shrink-0" style={{ background: it.status === "obtido" ? "var(--ok)" : "transparent", borderColor: it.status === "obtido" ? "var(--ok)" : "var(--border)" }} />
              <span className="flex-1" style={{ color: "var(--text-primary)" }}>{it.nome}</span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{it.exigido_por}</span>
            </div>
          ))}
        </div>
      )}
      {numeroBad && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>
        Número CNJ inválido: precisa ter 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO) e o dígito verificador não confere. Confira no tribunal antes de salvar.
      </div>}
      {alertaGrau && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-amber-bg)", borderColor: "var(--atencao)", color: "var(--tag-amber-fg, var(--atencao))" }}>
        Este número é de 1º grau (origem ≠ 0000), mas o cadastro indica 2º grau (instância/órgão/título). O robô vai consultar no eproc de 1º grau — confira.
      </div>}
      {duplicados.length > 0 && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-amber-bg)", borderColor: "var(--atencao)", color: "var(--tag-amber-fg, var(--atencao))" }}>
        Já existe caso deste cliente com o mesmo sequencial: {duplicados.map(c => `${c.numero} — ${c.titulo}`).join("; ")}. Pode ser duplicado ou incidente (embargos, recurso) — confira.
      </div>}
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── drawer de documento ───────── */
function DocDrawer({ empresaId, inicial, onClose, onSaved, onExcluir, supabase }: { empresaId: string; inicial?: Documento; onClose: () => void; onSaved: () => void; onExcluir: (d: Documento) => void; supabase: ReturnType<typeof createClient> }) {
  const edit = !!inicial;
  const [tipo, setTipo] = useState(inicial?.tipo ?? "procuracao");
  const T = TIPOS_DOC.find(t => t.k === tipo) ?? TIPOS_DOC[TIPOS_DOC.length - 1];
  const [d, setD] = useState<Record<string, any>>(() => inicial ? { nome: inicial.nome, url: inicial.url ?? "", observacao: inicial.observacao ?? "", validade: inicial.validade ?? "", ...inicial.dados } : {});
  const set = (k: string, v: any) => setD(p => {
    const n = { ...p, [k]: v };
    if (tipo === "certidao" && (k === "subtipo" || k === "emitida_em") && n.emitida_em && T.validadeDias?.[n.subtipo]) n.validade = addDays(n.emitida_em, T.validadeDias[n.subtipo]);
    if (tipo === "procuracao" && k === "outorgados") n.nome = n.nome || `Procuração — ${(v as string[]).join(", ")}`;
    if (tipo === "certidao" && k === "subtipo") n.nome = n.nome || v;
    return n;
  });
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const nomeAuto = tipo === "procuracao" && d.outorgados?.length ? `Procuração — ${d.outorgados.join(", ")}` : tipo === "certidao" && d.subtipo ? d.subtipo : tipo === "contrato_social" && d.alteracao ? `Contrato social — ${d.alteracao} alteração` : "";
  const nome = (d.nome ?? "").trim() || nomeAuto;
  const valido = nome.length > 1 && T.fields.filter(f => f.req).every(f => Array.isArray(d[f.k]) ? d[f.k].length : (d[f.k] ?? "").toString().trim());

  async function salvar() {
    if (!valido) return; setSalvando(true); setErro(null);
    const { nome: _n, url, observacao, validade, ...rest } = d;
    const payload = { empresa_id: empresaId, tipo, nome, url: url || null, observacao: observacao || null, validade: validade || null, dados: Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== "" && v !== null)) };
    const res = edit ? await supabase.from("empresa_documentos").update(payload).eq("id", inicial!.id) : await supabase.from("empresa_documentos").insert(payload);
    setSalvando(false);
    if (res.error) { setErro(res.error.message); return; }
    onSaved();
  }

  return (
    <Drawer title={edit ? "Modificar documento" : "Novo documento"} sub="Documento permanente do cliente. Validade gera alerta, nunca pendência." onClose={onClose}
      footer={<>
        <div className="text-[11px]">{edit && <button onClick={() => onExcluir(inicial!)} className="font-medium" style={{ color: "var(--alerta)" }}>Excluir</button>}</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
          <button onClick={salvar} disabled={!valido || salvando} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{salvando ? "Salvando…" : edit ? "Salvar alterações" : "Salvar"}</button>
        </div>
      </>}>
      <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Tipo <span style={{ color: "var(--alerta)" }}>*</span></label>
      <div className="flex gap-1.5 mb-3 flex-wrap">{TIPOS_DOC.map(t => <button key={t.k} type="button" disabled={edit} onClick={() => setTipo(t.k)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide disabled:opacity-60" style={tipo === t.k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{t.label}</button>)}</div>
      <Fields fields={T.fields} d={d} set={set} />
      <div className="mb-2.5"><label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nome</label><input className={inputCls} style={inputStyle} value={d.nome ?? ""} placeholder={nomeAuto || "Ex.: CND Federal 2026"} onChange={e => set("nome", e.target.value)} />{nomeAuto && !d.nome && <div className="text-[10px] mt-0.5" style={{ color: "var(--ok)" }}>✓ sugerido automaticamente</div>}</div>
      <div className="mb-2.5"><label className={labelCls} style={{ color: "var(--text-secondary)" }}>Arquivo (Google Drive)</label><input className={inputCls} style={inputStyle} value={d.url ?? ""} placeholder="https://…" onChange={e => set("url", e.target.value)} /></div>
      <div><label className={labelCls} style={{ color: "var(--text-secondary)" }}>Observação</label><textarea className={inputCls + " min-h-[56px] resize-y"} style={inputStyle} value={d.observacao ?? ""} onChange={e => set("observacao", e.target.value)} /></div>
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Drawer>
  );
}

/* ───────── página ───────── */
export type UltimoAnd = { data: string; descricao: string };
export type PendResumo = { abertas: number; revisao: number };
export default function ClienteView({ empresa, casos, documentos, areasPermitidas, grupo, ultimos, pendResumo }: { empresa: Empresa; casos: Caso[]; documentos: Documento[]; areasPermitidas?: Area[]; grupo?: { id: string; nome: string } | null; ultimos?: Record<string, UltimoAnd>; pendResumo?: Record<string, PendResumo> }) {
  const router = useRouter();
  const AREAS_VIS = areasPermitidas ? AREAS.filter(a => areasPermitidas.includes(a.key)) : AREAS;
  const supabase = createClient();
  const [tab, setTab] = useState<"geral" | Area | "docs">("geral");
  const [editando, setEditando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [novoCaso, setNovoCaso] = useState<Area | null>(null);
  const [editCaso, setEditCaso] = useState<Caso | null>(null);
  const [novoDoc, setNovoDoc] = useState(false);
  const [editDoc, setEditDoc] = useState<Documento | null>(null);
  const [verArq, setVerArq] = useState(false);
  const [excluir, setExcluir] = useState<{ tipo: "empresa" | "caso" | "doc"; id: string; nome: string } | null>(null);
  const [senha, setSenha] = useState(""); const [erroSenha, setErroSenha] = useState<string | null>(null); const [apagando, setApagando] = useState(false);
  const [menuCaso, setMenuCaso] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mover, setMover] = useState<Caso | null>(null);
  const [moverGrupos, setMoverGrupos] = useState<{ id: string; nome: string }[]>([]);
  const [moverEmps, setMoverEmps] = useState<{ id: string; nome: string; nome_exibicao: string | null; grupo_id: string | null }[]>([]);
  const [moverGrupo, setMoverGrupo] = useState(""); const [moverEmp, setMoverEmp] = useState(""); const [moverMotivo, setMoverMotivo] = useState(""); const [movendo, setMovendo] = useState(false);
  const [denso, setDenso] = useState<"completa" | "compacta">("completa");
  useEffect(() => { try { if (localStorage.getItem("pa_cards") === "compacta") setDenso("compacta"); } catch {} }, []);

  const nome = empresa.nome_exibicao || empresa.nome;
  const b = empresa.banca ? BANCAS[empresa.banca] : null;
  const contato = empresa.contatos?.[0];
  const porArea = useMemo(() => Object.fromEntries(AREAS_VIS.map(a => [a.key, casos.filter(c => c.area === a.key && c.ativo).length])), [casos, AREAS_VIS]);
  const casosAtivos = casos.filter(c => c.ativo);
  const [buscaCasos, setBuscaCasos] = useState("");
  const normB = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const casosVis = buscaCasos.trim() ? casosAtivos.filter(c => { const d = (c.dados ?? {}) as Record<string, unknown>; return normB([c.titulo, c.numero, c.orgao, c.situacao, c.area, (c as any).advogado, ...Object.values(d).flat()].join(" ")).includes(normB(buscaCasos.trim())); }) : casosAtivos;
  const venc = (d: string | null) => d ? (new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5 : null;
  const docsVencendo = documentos.filter(d => { const v = venc(d.validade); return v !== null && v < 30; });
  const proximos = casosAtivos.filter(c => c.prazo_proximo).sort((a, b) => a.prazo_proximo!.localeCompare(b.prazo_proximo!));
  const tagOpts = useMemo(() => Array.from(new Set([...(empresa.tags ?? []), ...casos.flatMap(c => Array.isArray(c.dados?.tese) ? c.dados.tese : c.dados?.tese ? [String(c.dados.tese)] : [])])).sort(), [empresa.tags, casos]);
  const abrirCaso = (c: Caso) => router.push(`/casos/${c.id}`);

  async function arquivarEmpresa() { await supabase.from("empresas").update({ ativo: !empresa.ativo }).eq("id", empresa.id); router.refresh(); }
  async function arquivarCaso(c: Caso) { await supabase.from("casos").update({ ativo: !c.ativo }).eq("id", c.id); router.refresh(); }
  async function abrirMover(c: Caso) {
    setMover(c); setMoverGrupo(""); setMoverEmp(""); setMoverMotivo("");
    const [{ data: gs }, { data: es }] = await Promise.all([supabase.from("grupos").select("id, nome").eq("ativo", true).order("nome"), supabase.from("empresas").select("id, nome, nome_exibicao, grupo_id").eq("ativo", true).order("nome")]);
    setMoverGrupos((gs ?? []) as { id: string; nome: string }[]); setMoverEmps((es ?? []) as { id: string; nome: string; nome_exibicao: string | null; grupo_id: string | null }[]);
  }
  async function confirmarMover() {
    if (!mover || !moverEmp) return; setMovendo(true);
    const dest = moverEmps.find(e => e.id === moverEmp);
    const { error } = await supabase.from("casos").update({ empresa_id: moverEmp }).eq("id", mover.id);
    if (error) { setMovendo(false); alert("Erro: " + error.message); return; }
    await Promise.all(["caso_andamentos", "caso_pendencias", "pendencia_eventos", "achados"].map(t => supabase.from(t).update({ empresa_id: moverEmp }).eq("caso_id", mover.id)));
    await supabase.from("caso_andamentos").insert({ caso_id: mover.id, empresa_id: moverEmp, data: new Date().toISOString().slice(0, 10), descricao: `Caso movido de ${nome} para ${dest?.nome_exibicao || dest?.nome || "outra empresa"}${moverMotivo.trim() ? ` · motivo: ${moverMotivo.trim()}` : ""}`, fonte: "manual" });
    setMovendo(false); setMover(null); router.refresh();
  }
  async function confirmarExclusao() {
    if (!excluir || !senha) return; setApagando(true); setErroSenha(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setApagando(false); setErroSenha("Sessão inválida."); return; }
    const { error: aErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (aErr) { setApagando(false); setErroSenha("Senha incorreta."); return; }
    const table = excluir.tipo === "empresa" ? "empresas" : excluir.tipo === "caso" ? "casos" : "empresa_documentos";
    const { error } = await supabase.from(table).delete().eq("id", excluir.id);
    setApagando(false);
    if (error) { setErroSenha(error.message); return; }
    setExcluir(null); setSenha("");
    if (excluir.tipo === "empresa") router.push("/clientes"); else router.refresh();
  }
  const pedirExclusao = (x: { tipo: "empresa" | "caso" | "doc"; id: string; nome: string }) => { setSenha(""); setErroSenha(null); setExcluir(x); };
  const A = (k: string) => AREAS.find(a => a.key === k)!;

  const cell = (v: any, first: boolean) => {
    if (v && typeof v === "object" && "pz" in v) return <Pz pz={v.pz} cls={v.cls} />;
    if (v && typeof v === "object" && "steps" in v) return <Steps n={v.steps} total={6} fail={v.fail} />;
    if (v && typeof v === "object" && "bar" in v) return <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[70px] h-[5px] rounded overflow-hidden" style={{ background: "var(--bg-page)" }}><i className="block h-full" style={{ width: `${v.bar * 100}%`, background: "var(--ok)" }} /></span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.label}</span></span>;
    const [l1, l2] = String(v).split("\n");
    return first ? <><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{l1}</div>{l2 && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l2}</div>}</> : <span style={{ color: "var(--text-secondary)" }}>{v}</span>;
  };

  return (
    <div className="pb-8">
      <div className="px-6 pt-3 text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><Link href="/clientes" style={{ color: "var(--acao)" }}>Clientes</Link><span>›</span>{grupo && <><Link href={`/grupo/${grupo.id}`} style={{ color: "var(--acao)" }}>{grupo.nome}</Link><span>›</span></>}<span>{nome}</span></div>

      <div className="px-6 pt-3 flex flex-col md:flex-row items-start md:justify-between gap-3 md:gap-4">
        <div className="flex gap-3.5 items-start min-w-0">
          <div className="w-11 h-11 md:w-[52px] md:h-[52px] rounded-[10px] flex items-center justify-center text-on-acao font-bold text-lg flex-shrink-0" style={{ background: "var(--acao)" }}>{ini(nome)}</div>
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight break-words">{nome}</h1>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{empresa.nome_exibicao ? empresa.nome + " · " : "Razão social · "}CNPJ raiz {empresa.cnpj_raiz ?? "—"}</div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2 text-[11px] items-center" style={{ color: "var(--text-secondary)" }}>
              {b && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: b.bg, color: b.fg }} title={b.nome}>Carteira {empresa.banca}</span>}
              <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: empresa.ativo ? "var(--ok)" : "var(--text-muted)" }} />{empresa.ativo ? "Ativo" : "Arquivado"}</span>
              <span>Cadastrado em <b style={{ color: "var(--text-primary)" }}>{fmt(empresa.criado_em)}</b></span>
              {contato?.nome && <span>Contato principal <b style={{ color: "var(--text-primary)" }}>{contato.nome}</b>{contato.email && ` · ${contato.email}`}</span>}
            </div>
            {!!empresa.tags?.length && <div className="flex flex-wrap gap-1.5 mt-2">{empresa.tags.map(t => <span key={t} className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{t}</span>)}</div>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 relative w-full md:w-auto">
          <button onClick={() => setNovoCaso(tab !== "geral" && tab !== "docs" ? tab : "contencioso")} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Novo caso</button>
          <button onClick={() => setEditando(true)} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>✎ Modificar</button>
          <button onClick={() => setMenu(m => !m)} className="w-9 rounded text-lg leading-none border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>⋯</button>
          {menu && (<>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 w-44 rounded-md border shadow-2xl py-1 text-xs" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <button onClick={() => { setMenu(false); arquivarEmpresa(); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span style={{ color: "var(--text-muted)" }}></span>{empresa.ativo ? "Arquivar" : "Desarquivar"}</button>
              <button onClick={() => { setMenu(false); pedirExclusao({ tipo: "empresa", id: empresa.id, nome }); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: "var(--alerta)" }}><span></span>Excluir cliente</button>
            </div>
          </>)}
        </div>
      </div>

      <div className="flex gap-0.5 px-6 mt-4 border-b overflow-x-auto" style={{ borderColor: "var(--border)", scrollbarWidth: "none" }}>
        {[{ k: "geral", l: "Visão geral", n: null as number | null, i: "" }, ...AREAS_VIS.map(a => ({ k: a.key, l: a.label, n: porArea[a.key], i: a.icon })), { k: "docs", l: "Documentos", n: documentos.length, i: "" }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as typeof tab)} className="px-3 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 border-b-2 -mb-px transition" style={{ color: tab === t.k ? "var(--acao)" : "var(--text-secondary)", borderColor: tab === t.k ? "var(--acao)" : "transparent", fontWeight: tab === t.k ? 600 : 500 }}>
            {t.i && <span>{t.i}</span>}{t.l}{t.n !== null && <span className="text-[10px] px-1.5 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: tab === t.k ? "var(--acao)" : "var(--text-muted)" }}>{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="px-6 pt-4">
        {tab === "geral" && (<>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {[{ v: casosAtivos.length, l: "Casos ativos" }, { v: Object.values(pendResumo ?? {}).reduce((s, p) => s + p.abertas, 0), l: "Pendências abertas", muted: false }, { v: proximos.filter(c => (venc(c.prazo_proximo) ?? 99) <= 7).length, l: "Prazos ≤7d", warn: true }, { v: docsVencendo.length, l: "Docs vencendo ≤30d", warn: true }].map(k => (
              <div key={k.l} className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="text-xl font-bold" style={{ color: k.warn && k.v > 0 ? "var(--atencao)" : k.muted ? "var(--text-muted)" : "var(--text-primary)" }}>{k.v}</div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: "var(--text-muted)" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <Card title="Próximos prazos" action={<button onClick={() => setNovoCaso("contencioso")} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>+ novo caso</button>}>
                {proximos.length === 0 ? <Empty t="Nenhum caso com prazo definido." /> : proximos.map(c => { const a = A(c.area); const p = A(c.area).row(c).find(x => x && typeof x === "object" && "pz" in x) as any; return (
                  <div key={c.id} onClick={() => abrirCaso(c)} className="px-3.5 py-2.5 border-b last:border-b-0 flex items-center gap-3 cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: a.bg, color: a.fg }}>{a.label}</span>
                    <div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-primary)" }}>{c.titulo}</div><div className="text-[10.5px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{[c.advogado, c.situacao].filter(Boolean).join(" · ")}</div></div>
                    {p && <Pz pz={p.pz} cls={p.cls} />}
                  </div>); })}
              </Card>
              <RotinasCliente empresaId={empresa.id} empresaNome={nome} casos={casosAtivos.map(c => ({ id: c.id, titulo: c.titulo, numero: c.numero }))} supabase={supabase} />
<Card title={`Casos ativos${buscaCasos.trim() ? ` · ${casosVis.length} de ${casosAtivos.length}` : ""}`} action={<div className="flex items-center gap-1.5 text-[10px] normal-case tracking-normal flex-wrap"><input value={buscaCasos} onChange={e => setBuscaCasos(e.target.value)} placeholder="buscar caso: nº, título, órgão, adverso, tese…" className="px-2 py-1 rounded border text-[11px] font-normal w-[210px] md:w-[280px] outline-none focus:border-acao" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }} />{buscaCasos && <button type="button" onClick={() => setBuscaCasos("")} className="px-1.5 font-semibold" style={{ color: "var(--text-muted)" }} title="limpar">✕</button>}<span style={{ color: "var(--text-muted)" }}>densidade:</span>{(["completa", "compacta"] as const).map(d => <button key={d} onClick={() => { setDenso(d); try { localStorage.setItem("pa_cards", d); } catch {} }} className="px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider" style={denso === d ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{d}</button>)}</div>}>
                {casosVis.length === 0 ? <Empty t={buscaCasos.trim() ? "Nenhum caso corresponde à busca." : "Nenhum caso ainda. Use + Novo caso."} /> : casosVis.map(c => { const a = A(c.area); const u = ultimos?.[c.id]; const pr = pendResumo?.[c.id]; const d = (c.dados ?? {}) as Record<string, any>; const pzd = venc(c.prazo_proximo); const teses: string[] = Array.isArray(d.tese) ? d.tese : d.tese ? [String(d.tese)] : []; const sitCls = /encerr|quitad|vigente|entregue|deferid|homolog/i.test(c.situacao) ? "ok" : /recurso|rescind/i.test(c.situacao) ? "prox" : ""; return (
                  <div key={c.id} onClick={() => abrirCaso(c)} className="px-3.5 py-3 border-b last:border-b-0 cursor-pointer hover:brightness-110 grid gap-3" style={{ borderColor: "var(--border)", gridTemplateColumns: "1fr auto" }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: a.bg, color: a.fg }}>{a.icon} {a.label}{d.esfera ? ` · ${d.esfera}` : ""}</span>
                        <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{c.titulo}</span>
                        <Pz pz={c.situacao} cls={sitCls} />
                        {!!pr?.revisao && <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" }}>{pr.revisao} em revisão</span>}
                      </div>
                      {denso === "completa" ? (<>
                        <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          <span><span style={{ color: "var(--text-muted)" }}>Nº</span> <b style={{ color: "var(--text-primary)" }}>{c.numero ?? "sem número"}</b></span>
                          {(c.orgao || d.tribunal) && <span><span style={{ color: "var(--text-muted)" }}>Órgão</span> <b style={{ color: "var(--text-primary)" }}>{[c.orgao, d.tribunal].filter(Boolean).join(" · ")}</b></span>}
                          {d.adverso && <span><span style={{ color: "var(--text-muted)" }}>Adverso</span> <b style={{ color: "var(--text-primary)" }}>{d.adverso}</b></span>}
                          {d.valor && <span><span style={{ color: "var(--text-muted)" }}>Valor</span> <b style={{ color: "var(--text-primary)" }}>{d.valor}</b></span>}
                          {c.advogado && <span><span style={{ color: "var(--text-muted)" }}>Advogado</span> <b style={{ color: "var(--text-primary)" }}>{c.advogado}</b></span>}
                          {d.sistema && <span><span style={{ color: "var(--text-muted)" }}>Sistema</span> <b style={{ color: "var(--text-primary)" }}>{d.sistema}</b></span>}
                          {teses.length > 0 && <span>{teses.map(t => <span key={t} className="inline-block text-[9.5px] px-1.5 rounded border mr-1" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{t}</span>)}</span>}
                        </div>
                        {u && <div className="flex gap-2 items-baseline mt-1.5 text-[11.5px] min-w-0" style={{ color: "var(--text-secondary)" }}><span className="text-[10.5px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>último andamento · {fmt(u.data)}</span><span className="truncate">{u.descricao}</span></div>}
                      </>) : (
                        <div className="text-[10.5px] uppercase tracking-wider mt-1" style={{ color: "var(--text-muted)" }}>{[c.numero, c.advogado, d.adverso].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {c.prazo_proximo ? <Pz pz={(pzd !== null && pzd < 0 ? "VENCIDO " : c.prazo_fatal && pzd !== null && pzd <= 7 ? "FATAL " : "próx. ") + fmt(c.prazo_proximo)} cls={pzd !== null && (pzd < 0 || (c.prazo_fatal && pzd <= 7)) ? "fatal" : pzd !== null && pzd <= 7 ? "prox" : ""} /> : <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>sem prazo</span>}
                        <button onClick={ev => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenuCaso(menuCaso?.id === c.id ? null : { id: c.id, x: r.right, y: r.bottom }); }} className="w-8 h-8 rounded-md text-lg leading-none border" style={{ color: "var(--text-secondary)", borderColor: menuCaso?.id === c.id ? "var(--border)" : "transparent" }}>⋯</button>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{pr?.abertas ?? 0} pendência{(pr?.abertas ?? 0) === 1 ? "" : "s"} aberta{(pr?.abertas ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                  </div>); })}
              </Card>
            </div>
            <div className="space-y-4">
              <Card title="Dados cadastrais" action={<button onClick={() => setEditando(true)} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>✎ editar</button>}>
                {[["Razão social", empresa.nome], ["CNPJ raiz", empresa.cnpj_raiz ?? "—"], ["Carteira responsável", b ? `${empresa.banca} · ${b.nome}` : "—"], ["Observações", empresa.observacoes ?? "—"]].map(([k, v]) => (
                  <div key={k} className="px-3.5 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{k}</div><div className="text-xs mt-0.5" style={{ color: k === "Observações" ? "var(--text-secondary)" : "var(--text-primary)" }}>{v}</div></div>
                ))}
              </Card>
              <Card title="Contatos" action={<button onClick={() => setEditando(true)} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>+ adicionar</button>}>
                {!empresa.contatos?.length ? <Empty t="Nenhum contato cadastrado." /> : empresa.contatos.map((c, i) => (
                  <div key={i} className="px-3.5 py-2 border-b last:border-b-0 flex items-center gap-2.5" style={{ borderColor: "var(--border)" }}>
                    <span className="w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{ini(c.nome || "?")}</span>
                    <div><div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{c.nome}</div><div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{[c.cargo, c.email].filter(Boolean).join(" · ")}</div></div>
                  </div>
                ))}
              </Card>
              <Card title="Documentos vencendo" action={<button onClick={() => setTab("docs")} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>ver todos</button>}>
                {docsVencendo.length === 0 ? <Empty t="Nada vencendo nos próximos 30 dias." /> : docsVencendo.map(d => { const v = venc(d.validade)!; return (
                  <div key={d.id} onClick={() => setEditDoc(d)} className="px-3.5 py-2 border-b last:border-b-0 flex items-center justify-between gap-2 cursor-pointer" style={{ borderColor: "var(--border)" }}><span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{d.nome}</span><Pz pz={(v < 0 ? "vencido " : "") + fmt(d.validade)} cls={v < 0 ? "fatal" : "prox"} /></div>); })}
              </Card>
            </div>
          </div>
        </>)}

        {AREAS_VIS.map(a => tab === a.key && (() => {
          const lista = casos.filter(c => c.area === a.key && (verArq || c.ativo)).sort((x, y) => Number(y.ativo) - Number(x.ativo) || (x.prazo_proximo ?? "9").localeCompare(y.prazo_proximo ?? "9"));
          const nArq = casos.filter(c => c.area === a.key && !c.ativo).length;
          return (
            <div key={a.key}>
              <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>{a.hint}</div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-1.5">
                  <button onClick={() => setVerArq(false)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={!verArq ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Ativos ({porArea[a.key]})</button>
                  <button onClick={() => setVerArq(true)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={verArq ? { background: "var(--text-muted)", borderColor: "var(--text-muted)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>+ Arquivados ({nArq})</button>
                </div>
                <button onClick={() => setNovoCaso(a.key)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Nov{a.artigo} {a.sing}</button>
              </div>
              <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <table className="w-full text-[12.5px]">
                  <thead><tr style={{ background: "var(--bg-page)" }}>{a.cols.map((h, i) => <th key={i} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: h.w }}>{h.h}</th>)}<th className="border-b" style={{ borderColor: "var(--border)", width: 56 }} /></tr></thead>
                  <tbody>
                    {lista.length === 0 && <tr><td colSpan={a.cols.length + 1}><Empty t={`Nenhum${a.artigo === "a" ? "a" : ""} ${a.sing} neste cliente.`} /></td></tr>}
                    {lista.map(c => (
                      <tr key={c.id} onClick={() => abrirCaso(c)} className="border-b last:border-b-0 cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)", opacity: c.ativo ? 1 : 0.55 }}>
                        {a.row(c).map((v, i) => <td key={i} className="px-3.5 py-2.5">{cell(v, i === 0)}</td>)}
                        <td className="px-2 py-2.5 text-right" onClick={ev => ev.stopPropagation()}>
                          <button onClick={ev => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenuCaso(menuCaso?.id === c.id ? null : { id: c.id, x: r.right, y: r.bottom }); }} className="w-8 h-8 rounded-md text-lg leading-none" style={{ color: "var(--text-secondary)" }}>⋯</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })())}

        {tab === "docs" && (
          <div>
            <div className="mb-4"><BlocoCertidoesCliente empresaId={empresa.id} /></div>
            <div className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>Documentos permanentes do cliente. Procuração mostra outorgados; certidão tem validade calculada pelo tipo; contrato social mostra alteração e registro.</div>
            <div className="flex justify-between items-center mb-3">
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{documentos.length} documento{documentos.length === 1 ? "" : "s"}{docsVencendo.length > 0 && <span style={{ color: "var(--atencao)" }}> · {docsVencendo.length} vencendo em 30 dias</span>}</div>
              <button onClick={() => setNovoDoc(true)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Novo documento</button>
            </div>
            <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-[12.5px]">
                <thead><tr style={{ background: "var(--bg-page)" }}>{["Documento", "Tipo", "Detalhes", "Validade", "Situação", ""].map((h, i) => <th key={i} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "30%" : i === 5 ? 56 : undefined }}>{h}</th>)}</tr></thead>
                <tbody>
                  {documentos.length === 0 && <tr><td colSpan={6}><Empty t="Contrato social, procurações, certidões… nada cadastrado ainda." /></td></tr>}
                  {documentos.map(d => { const v = venc(d.validade); const T = TIPOS_DOC.find(t => t.k === d.tipo); const det = d.tipo === "procuracao" ? [(d.dados.outorgados ?? []).join(", "), d.dados.tipo_poderes].filter(Boolean).join(" · ") : d.tipo === "certidao" ? [d.dados.orgao, d.dados.emitida_em && "emitida " + fmt(d.dados.emitida_em)].filter(Boolean).join(" · ") : d.tipo === "contrato_social" ? [d.dados.registro_em && "JUCERJA " + fmt(d.dados.registro_em), d.dados.registro_num].filter(Boolean).join(" · ") : d.tipo === "documento_socio" ? [d.dados.socio, d.dados.subtipo].filter(Boolean).join(" · ") : d.observacao ?? ""; return (
                    <tr key={d.id} onClick={() => setEditDoc(d)} className="border-b last:border-b-0 cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3.5 py-2.5"><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{d.nome}</div>{d.url && <a href={d.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10.5px]" style={{ color: "var(--acao)" }}>abrir arquivo ↗</a>}</td>
                      <td className="px-3.5 py-2.5">{T?.label ?? d.tipo}</td>
                      <td className="px-3.5 py-2.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{det || "—"}</td>
                      <td className="px-3.5 py-2.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>{fmt(d.validade)}</td>
                      <td className="px-3.5 py-2.5">{v === null ? <span style={{ color: "var(--text-muted)" }}>—</span> : <Pz pz={v < 0 ? "vencida" : v < 30 ? `vence em ${Math.ceil(v)}d` : "vigente"} cls={v < 0 ? "fatal" : v < 30 ? "prox" : "ok"} />}</td>
                      <td className="px-2 py-2.5 text-right" onClick={ev => ev.stopPropagation()}><button onClick={() => setEditDoc(d)} className="w-8 h-8 rounded-md text-lg leading-none" style={{ color: "var(--text-secondary)" }}>⋯</button></td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {menuCaso && (() => { const c = casos.find(x => x.id === menuCaso.id)!; return (<>
        <div className="fixed inset-0 z-30" onClick={() => setMenuCaso(null)} />
        <div className="fixed z-40 w-56 rounded-md border shadow-2xl py-1 text-xs" style={{ top: menuCaso.y + 4, left: menuCaso.x - 224, background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {[{ l: "Abrir caso", i: "→", fn: () => abrirCaso(c) }, { l: "Modificar dados", i: "✎", fn: () => setEditCaso(c) }, { l: "Mover para outra empresa", i: "↔", fn: () => abrirMover(c) }, { l: c.ativo ? "Arquivar" : "Desarquivar", i: "", fn: () => arquivarCaso(c) }, { l: "Excluir", i: "", fn: () => pedirExclusao({ tipo: "caso", id: c.id, nome: c.titulo }), danger: true }].map(op => (
            <button key={op.l} onClick={() => { setMenuCaso(null); op.fn(); }} className="w-full text-left px-3 py-2 flex gap-2.5 hover:brightness-125" style={{ color: op.danger ? "var(--alerta)" : "var(--text-primary)" }}><span style={{ color: op.danger ? "var(--alerta)" : "var(--text-muted)" }}>{op.i}</span>{op.l}</button>
          ))}
        </div>
      </>); })()}

      {mover && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !movendo && setMover(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Mover caso para outra empresa</h3>
          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{mover.titulo}{mover.numero ? ` · ${mover.numero}` : ""}</strong> sai de <b>{nome}</b> e vai para a empresa escolhida, levando andamentos, pendências, eventos e achados. Nada é apagado; fica registrado um andamento com a mudança.</p>
          <label className={labelCls + " mt-4"} style={{ color: "var(--text-secondary)" }}>Grupo de destino</label>
          <select value={moverGrupo} onChange={e => { setMoverGrupo(e.target.value); setMoverEmp(""); }} className={inputCls} style={inputStyle}><option value="">— todos os grupos</option>{moverGrupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
          <label className={labelCls + " mt-3"} style={{ color: "var(--text-secondary)" }}>Empresa de destino</label>
          <select value={moverEmp} onChange={e => setMoverEmp(e.target.value)} className={inputCls} style={inputStyle}><option value="">— escolher empresa</option>{moverEmps.filter(e => e.id !== empresa.id && (!moverGrupo || e.grupo_id === moverGrupo)).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao || e.nome}</option>)}</select>
          <label className={labelCls + " mt-3"} style={{ color: "var(--text-secondary)" }}>Motivo (fica no histórico do caso)</label>
          <input value={moverMotivo} onChange={e => setMoverMotivo(e.target.value)} placeholder="Ex.: processo é da filial, não da matriz" className={inputCls} style={inputStyle} />
          <div className="flex justify-end gap-2 mt-5"><button onClick={() => setMover(null)} disabled={movendo} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={confirmarMover} disabled={movendo || !moverEmp} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{movendo ? "Movendo…" : "Mover"}</button></div>
        </div>
      </>)}
      {editando && <NovaEmpresaDrawer inicial={empresa} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); router.refresh(); }} supabase={supabase} />}
      {(novoCaso || editCaso) && <CasoDrawer empresaId={empresa.id} area={editCaso?.area ?? novoCaso!} inicial={editCaso ?? undefined} docs={documentos} tagOpts={tagOpts} onClose={() => { setNovoCaso(null); setEditCaso(null); }} onSaved={area => { setNovoCaso(null); setEditCaso(null); setTab(area); router.refresh(); }} onExcluir={c => { setEditCaso(null); pedirExclusao({ tipo: "caso", id: c.id, nome: c.titulo }); }} supabase={supabase} areasPermitidas={areasPermitidas} />}
      {(novoDoc || editDoc) && <DocDrawer empresaId={empresa.id} inicial={editDoc ?? undefined} onClose={() => { setNovoDoc(false); setEditDoc(null); }} onSaved={() => { setNovoDoc(false); setEditDoc(null); router.refresh(); }} onExcluir={d => { setEditDoc(null); pedirExclusao({ tipo: "doc", id: d.id, nome: d.nome }); }} supabase={supabase} />}

      {excluir && (<>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !apagando && setExcluir(null)} />
        <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--alerta-tint)", color: "var(--alerta)" }}></div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Excluir {excluir.tipo === "empresa" ? "cliente" : excluir.tipo === "caso" ? "caso" : "documento"}?</h3>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{excluir.nome}</strong> será removido permanentemente{excluir.tipo === "empresa" ? ", com todos os casos e documentos" : ""}. Não pode ser desfeito.</p>
              <label className={labelCls + " mt-4"} style={{ color: "var(--text-secondary)" }}>Confirme com sua senha de acesso</label>
              <input type="password" autoFocus value={senha} onChange={e => { setSenha(e.target.value); setErroSenha(null); }} onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }} placeholder="Senha do login" className={inputCls} style={inputStyle} />
              {erroSenha && <div className="text-[11px] mt-1.5" style={{ color: "var(--alerta)" }}>{erroSenha}</div>}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => { setExcluir(null); setSenha(""); }} disabled={apagando} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
            <button onClick={confirmarExclusao} disabled={apagando || !senha} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{apagando ? "Excluindo…" : "Excluir permanentemente"}</button>
          </div>
        </div>
      </>)}
    </div>
  );
}
