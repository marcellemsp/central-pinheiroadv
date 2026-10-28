"use client";
// Rotinas do cliente (22/10/2026): todas as pendências recorrentes do cliente, com e sem processo.
// Banco: caso_pendencias (recorrencia not null) + pa_rotina_salvar / pa_rotina_datas / trigger pa_pend_recorrente.
// Ao concluir uma rotina com "registrar_documento", o trigger exige o link e registra o arquivo em Documentos (relatorio_cliente).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { createClient } from "@/lib/supabase";
import { REC_FREQS, REC_FINS } from "@/lib/recorrencia";
import { EnviarDrawer, RevisarDrawer, AcaoPeca, Pz, STATUS_PEND, TIPOS_PEND, COORDS, primeiroNome, type Pendencia, type PendEvento } from "./CasoView";
import { ADVOGADOS } from "@/lib/areas";

type SB = ReturnType<typeof createClient>;
type CasoMin = { id: string; titulo: string; numero: string | null };
type Rot = Pendencia & { recorrencia: any };
type Prev = { prazo: string; interno: string; referencia: string | null };

const fmt = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—");
const fmtDT = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const diasAte = (d?: string | null) => (d ? Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5) : null);
const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const btn = "px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap";
const btnStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;
const RESPONSAVEIS = [...ADVOGADOS, "Estagiário"];
const DIAS: [string, string][] = [["util_n", "Nº dia útil do mês"], ["fixo", "Dia fixo do mês"], ["prim", "Primeiro dia útil"], ["ultu", "Último dia útil"], ["ult", "Último dia do mês"]];
const L = ({ t, req }: { t: string; req?: boolean }) => <label className={labelCls} style={{ color: "var(--text-secondary)" }}>{t}{req && <span style={{ color: "var(--alerta)" }}> *</span>}</label>;

/** "mensal · 5º dia útil · ref. mês anterior" */
export function regraTxt(r: any): string {
  if (!r) return "";
  const f = REC_FREQS.find(x => x[0] === r.freq)?.[1]?.toLowerCase() ?? r.freq;
  const d = r.freq === "semanal" || r.freq === "quinzenal" ? "" : r.dia === "util_n" ? (r.dia_ref ?? "?") + "º dia útil" : r.dia === "fixo" ? "dia " + (r.dia_ref ?? "?") : r.dia === "prim" ? "1º dia útil" : r.dia === "ultu" ? "último dia útil" : r.dia === "ult" ? "último dia" : "";
  const ref = r.ref === "anterior" ? " · ref. mês anterior" : r.ref === "corrente" ? " · ref. mês corrente" : "";
  return f + (d ? " · " + d : "") + ref;
}

async function meuNome(supabase: SB): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return "";
  const { data: u } = await supabase.from("usuarios").select("nome_completo").eq("id", user.id).maybeSingle();
  return primeiroNome((u as any)?.nome_completo ?? user.email?.split("@")[0] ?? "");
}

export default function RotinasCliente({ empresaId, empresaNome, casos, supabase }: { empresaId: string; empresaNome: string; casos: CasoMin[]; supabase: SB }) {
  const router = useRouter();
  const [rots, setRots] = useState<Rot[] | null>(null);
  const [eu, setEu] = useState("");
  const [dr, setDr] = useState<null | { k: "nova" | "editar" | "hist" | "enviar" | "revisar" | "concluir"; p?: Rot }>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const casoDe = useMemo(() => new Map<string, CasoMin>(casos.map(c => [c.id, c] as [string, CasoMin])), [casos]);

  const load = () => supabase.from("caso_pendencias").select("*").eq("empresa_id", empresaId).not("recorrencia", "is", null).neq("status", "concluida")
    .order("prazo", { ascending: true, nullsFirst: false }).limit(200).then(({ data }) => setRots((data ?? []) as Rot[]));
  useEffect(() => {
    load(); meuNome(supabase).then(setEu);
    const ch = supabase.channel("rotinas-" + empresaId).on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias", filter: "empresa_id=eq." + empresaId }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const ctx = (p: Rot) => empresaNome + " · " + (p.caso_id ? (casoDe.get(p.caso_id)?.titulo ?? "processo") : "rotina do cliente");
  async function pausar(p: Rot) {
    const ativa = p.recorrencia_ativa === false;
    const { error } = await supabase.from("caso_pendencias").update({ recorrencia_ativa: ativa }).eq("id", p.id);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: eu || "—", acao: ativa ? "retomou a rotina" : "pausou a rotina" });
    setMsg({ ok: true, t: ativa ? "Rotina retomada." : "Rotina pausada: a próxima não nasce até retomar." }); load();
  }
  const salvo = (t: string) => { setDr(null); setMsg({ ok: true, t }); load(); router.refresh(); };

  return (
    <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <span>Rotinas do cliente <span className="normal-case tracking-normal font-medium">— tarefas recorrentes, com e sem processo</span></span>
        <button onClick={() => setDr({ k: "nova" })} className="text-[11px] normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>+ Nova rotina</button>
      </div>
      {msg && <div className="mx-3.5 mt-2 px-2.5 py-1.5 rounded text-[11.5px]" style={msg.ok ? { background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" } : { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{msg.t}</div>}
      {rots === null ? <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>Carregando…</div>
        : rots.length === 0 ? <div className="px-4 py-6 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>Nenhuma rotina. Use <b>+ Nova rotina</b> para tarefas que se repetem (ex.: relatório mensal ao cliente, comprovação mensal de depósito).</div>
        : rots.map(p => {
          const s = STATUS_PEND[p.status] ?? { l: p.status, cls: "mut" }; const c = p.caso_id ? casoDe.get(p.caso_id) : null; const d = diasAte(p.prazo);
          return (
            <div key={p.id} className="px-3.5 py-2.5 border-b last:border-b-0 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--border)", opacity: p.recorrencia_ativa === false ? 0.6 : 1 }}>
              <div className="flex-1 min-w-[260px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{p.titulo}</span>
                  {c ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-pointer" style={{ background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" }} onClick={() => router.push("/casos/" + c.id)}>{c.numero ?? c.titulo}</span>
                    : <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: "var(--tag-gray-bg, var(--neutro-tint))", color: "var(--text-secondary)" }}>sem processo</span>}
                  {p.recorrencia_ativa === false && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>pausada</span>}
                </div>
                <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {TIPOS_PEND.find(t => t[0] === p.tipo)?.[1] ?? p.tipo} · {regraTxt(p.recorrencia)} · resp. <b style={{ color: "var(--text-secondary)" }}>{p.responsavel ?? "—"}</b> · {p.revisor ? "revisão " + p.revisor : "sem revisão"}{p.recorrencia_seq ? " · " + p.recorrencia_seq + "ª" : ""}{p.recorrencia?.registrar_documento ? " · ao concluir, arquivo vai para Documentos" : ""}
                </div>
              </div>
              <div className="text-right min-w-[150px]">
                <Pz t={s.l} cls={s.cls} />
                <div className="text-[12px] font-semibold mt-0.5" style={{ color: d !== null && d < 0 ? "var(--alerta)" : "var(--text-primary)" }}>até {fmt(p.prazo)}</div>
                <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{p.prazo_interno ? "interno " + fmt(p.prazo_interno) : ""}{d !== null ? " · " + (d < 0 ? "vencido há " + (-d) + "d" : d === 0 ? "hoje" : "faltam " + d + "d") : ""}</div>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <AcaoPeca p={p} eu={eu} onEnviar={() => setDr({ k: "enviar", p })} onRevisar={() => setDr({ k: "revisar", p })} onProtocolei={() => setDr({ k: "concluir", p })} />
                {!p.revisor && p.status !== "pronta_protocolar" && p.status !== "revisao_pendente" && <button className={btn} style={btnStyle} onClick={() => setDr({ k: "concluir", p })}>✓ Concluir</button>}
                <button className={btn} style={btnStyle} onClick={() => setDr({ k: "editar", p })}>✎ Editar</button>
                <button className={btn} style={btnStyle} onClick={() => setDr({ k: "hist", p })}>Histórico</button>
                <button className={btn} style={{ ...btnStyle, color: "var(--text-muted)" }} onClick={() => pausar(p)}>{p.recorrencia_ativa === false ? "▶ Retomar" : "Pausar"}</button>
              </div>
            </div>);
        })}

      {(dr?.k === "nova" || dr?.k === "editar") && <RotinaDrawer supabase={supabase} empresaId={empresaId} empresaNome={empresaNome} casos={casos} inicial={dr.p} eu={eu} onClose={() => setDr(null)} onSaved={salvo} />}
      {dr?.k === "hist" && dr.p && <HistoricoRotina supabase={supabase} p={dr.p} onClose={() => setDr(null)} />}
      {dr?.k === "enviar" && dr.p && <EnviarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => salvo("Enviado para revisão.")} supabase={supabase} />}
      {dr?.k === "revisar" && dr.p && <RevisarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu || "—"} onClose={() => setDr(null)} onSaved={() => salvo("Revisão registrada.")} supabase={supabase} />}
      {dr?.k === "concluir" && dr.p && <ConcluirRotina supabase={supabase} p={dr.p} eu={eu} onClose={() => setDr(null)} onSaved={() => salvo(dr.p?.recorrencia?.registrar_documento ? "Concluída: o arquivo foi para Documentos e a próxima ocorrência já foi criada." : "Concluída: a próxima ocorrência já foi criada.")} />}
    </div>
  );
}

function Shell({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (<>
    <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
    <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[560px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}><div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>{sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}</div><button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button></div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      <div className="px-5 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>{footer}</div>
    </aside>
  </>);
}

function RotinaDrawer({ supabase, empresaId, empresaNome, casos, inicial, eu, onClose, onSaved }: { supabase: SB; empresaId: string; empresaNome: string; casos: CasoMin[]; inicial?: Rot; eu: string; onClose: () => void; onSaved: (t: string) => void }) {
  const edit = !!inicial; const r0 = (inicial?.recorrencia ?? {}) as any; const pad = (r0.padrao ?? {}) as any;
  const hoje = new Date(); const mesSeg = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const [f, setF] = useState(() => ({
    titulo: pad.titulo ?? (inicial ? inicial.titulo.replace(/ — [a-z]{3}\/\d{4}$/, "") : "Relatório mensal ao cliente"),
    caso_id: inicial?.caso_id ?? "", tipo: inicial?.tipo ?? "peca", responsavel: inicial?.responsavel ?? "", revisor: inicial ? (inicial.revisor ?? "") : "Marcelle",
    descricao: inicial?.descricao ?? "", freq: r0.freq ?? "mensal", dia: r0.dia ?? "util_n", dia_ref: Number(r0.dia_ref ?? 5), ajuste: r0.ajuste ?? "man",
    ref: r0.ref ?? (edit ? "" : "anterior"), fim: r0.fim ?? "nunca", fim_data: r0.fim_data ?? "", fim_n: r0.fim_n ?? "", registrar: edit ? !!r0.registrar_documento : true,
    inicio: mesSeg.getFullYear() + "-" + String(mesSeg.getMonth() + 1).padStart(2, "0"), prazo: inicial?.prazo ?? "", escopo: "serie" as "serie" | "ocorrencia",
  }));
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const [prev, setPrev] = useState<Prev[]>([]); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const mensal = !(f.freq === "semanal" || f.freq === "quinzenal");
  const rec = useMemo(() => ({ calendario: "civil", freq: f.freq, dia: f.dia, dia_ref: f.dia === "util_n" || f.dia === "fixo" ? Number(f.dia_ref) || 1 : null, ajuste: f.dia === "fixo" ? f.ajuste : "man",
    fim: f.fim, fim_data: f.fim === "data" ? f.fim_data || null : null, fim_n: f.fim === "n" ? Number(f.fim_n) || null : null, ref: f.ref || null, registrar_documento: !!f.registrar }), [f]);
  useEffect(() => {
    let on = true;
    const base = edit && inicial?.prazo ? inicial.prazo.slice(0, 7) + "-01" : f.inicio + "-01";
    supabase.rpc("pa_rotina_datas", { p_inicio: base, p_rec: rec, p_n: 5 }).then(({ data }) => { if (on) setPrev((data ?? []) as Prev[]); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, f.inicio]);
  const ok = f.titulo.trim().length > 2 && !!f.responsavel && (!mensal || !(f.dia === "util_n" || f.dia === "fixo") || Number(f.dia_ref) >= 1);
  async function salvar() {
    if (!ok) return; setSaving(true); setErro(null);
    const p: Record<string, any> = { titulo: f.titulo.trim(), tipo: f.tipo, responsavel: f.responsavel, revisor: f.revisor || null, descricao: f.descricao.trim() || null, caso_id: f.caso_id || null, empresa_id: empresaId, recorrencia: rec };
    if (!edit) p.inicio = f.inicio + "-01"; else if (f.prazo && f.prazo !== inicial!.prazo) p.prazo = f.prazo;
    if (edit && f.escopo === "ocorrencia") delete p.recorrencia;
    const { error } = await supabase.rpc("pa_rotina_salvar", { p_id: inicial?.id ?? null, p, p_escopo: edit ? f.escopo : null, p_autor: eu || "—" });
    setSaving(false); if (error) { setErro(error.message); return; }
    onSaved(edit ? (f.escopo === "serie" ? "Rotina alterada (esta e as próximas)." : "Alterada só esta ocorrência.") : "Rotina criada: a 1ª ocorrência já aparece em Pendências.");
  }
  const so = edit && f.escopo === "ocorrencia";
  return (
    <Shell title={edit ? "Editar rotina" : "Nova rotina do cliente"} sub={empresaNome + " · tarefa recorrente, com ou sem processo. Cada ocorrência é uma pendência normal (prazo, revisão, aviso)."} onClose={onClose}
      footer={<><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>* obrigatórios</div><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={salvar} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{saving ? "Salvando…" : edit ? "Salvar alterações" : "Criar rotina"}</button></div></>}>
      {edit && <div className="mb-3 px-3 py-2 rounded border text-[11.5px]" style={{ borderColor: "var(--destaque)", background: "var(--destaque-tint)", color: "var(--text-secondary)" }}>
        <b style={{ color: "var(--text-primary)" }}>Aplicar a mudança em:</b>
        <div className="flex gap-3 mt-1.5">{([["serie", "esta e as próximas ocorrências"], ["ocorrencia", "só a ocorrência atual (" + fmt(inicial?.prazo) + ")"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={f.escopo === k} onChange={() => set("escopo", k)} /> {l}</label>)}</div>
        <div className="mt-1" style={{ color: "var(--text-muted)" }}>Ocorrências já concluídas não mudam. Fica registrado no histórico.</div>
      </div>}
      <div className="mb-2.5"><L t="Título" req /><input className={inputCls} style={inputStyle} value={f.titulo} onChange={e => set("titulo", e.target.value)} autoFocus placeholder="Ex.: Relatório mensal ao cliente" />{f.ref && !so && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Cada ocorrência ganha o mês de referência no final (ex.: “— out/2026”).</div>}</div>
      <div className="mb-2.5"><L t="Processo (opcional)" /><select className={inputCls} style={inputStyle} value={f.caso_id} disabled={so} onChange={e => set("caso_id", e.target.value)}><option value="">— sem processo (rotina do cliente)</option>{casos.map(c => <option key={c.id} value={c.id}>{c.numero ? c.numero + " · " : ""}{c.titulo}</option>)}</select></div>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div><L t="Tipo" /><select className={inputCls} style={inputStyle} value={f.tipo} onChange={e => set("tipo", e.target.value)}>{TIPOS_PEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><L t="Responsável" req /><select className={inputCls} style={inputStyle} value={f.responsavel} onChange={e => set("responsavel", e.target.value)}><option value="">—</option>{RESPONSAVEIS.map(r => <option key={r}>{r}</option>)}</select></div>
        <div><L t="Revisor" /><select className={inputCls} style={inputStyle} value={f.revisor} onChange={e => set("revisor", e.target.value)}><option value="">Sem revisão</option>{COORDS.map(r => <option key={r}>{r}</option>)}</select></div>
      </div>
      {!so && (<>
        <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Quando</div>
        <div className="grid grid-cols-3 gap-2.5 mb-2.5">
          <div><L t="Frequência" /><select className={inputCls} style={inputStyle} value={f.freq} onChange={e => set("freq", e.target.value)}>{REC_FREQS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {mensal ? <div><L t="Dia" /><select className={inputCls} style={inputStyle} value={f.dia} onChange={e => set("dia", e.target.value)}>{DIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : <div />}
          {mensal && (f.dia === "util_n" || f.dia === "fixo") ? <div><L t={f.dia === "util_n" ? "Qual dia útil" : "Dia do mês"} /><input type="number" min={1} max={f.dia === "util_n" ? 22 : 31} className={inputCls} style={inputStyle} value={f.dia_ref} onChange={e => set("dia_ref", e.target.value)} /></div> : <div />}
        </div>
        {mensal && f.dia === "fixo" && <div className="mb-2.5"><L t="Se cair em fim de semana ou feriado" /><select className={inputCls} style={inputStyle} value={f.ajuste} onChange={e => set("ajuste", e.target.value)}><option value="ant">Antecipa para o dia útil anterior</option><option value="prox">Adia para o próximo dia útil</option><option value="man">Mantém a data</option></select></div>}
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <div><L t="Mês de referência" /><select className={inputCls} style={inputStyle} value={f.ref} onChange={e => set("ref", e.target.value)}><option value="anterior">Mês anterior (ex.: outubro entregue em novembro)</option><option value="corrente">Mês corrente</option><option value="">Não usar</option></select></div>
          {!edit ? <div><L t="Começa em" /><input type="month" className={inputCls} style={inputStyle} value={f.inicio} onChange={e => set("inicio", e.target.value)} /></div>
            : <div><L t="Prazo desta ocorrência" /><input type="date" className={inputCls} style={inputStyle} value={f.prazo} onChange={e => set("prazo", e.target.value)} /></div>}
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <div><L t="Termina" /><select className={inputCls} style={inputStyle} value={f.fim} onChange={e => set("fim", e.target.value)}>{REC_FINS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {f.fim === "data" && <div><L t="Data final" /><input type="date" className={inputCls} style={inputStyle} value={f.fim_data} onChange={e => set("fim_data", e.target.value)} /></div>}
          {f.fim === "n" && <div><L t="Nº de ocorrências" /><input type="number" min={1} className={inputCls} style={inputStyle} value={f.fim_n} onChange={e => set("fim_n", e.target.value)} /></div>}
        </div>
        <L t="Próximas datas previstas (prazo · interno D-4 úteis)" />
        <div className="flex flex-wrap gap-1.5 mb-1">{prev.length ? prev.map((x, i) => <span key={x.prazo} className="text-[10.5px] px-2 py-0.5 rounded-full border" style={{ borderColor: i === 0 ? "var(--destaque)" : "var(--border-strong, var(--text-secondary))", borderStyle: i === 0 ? "solid" : "dashed", color: "var(--text-secondary)" }}>{fmt(x.prazo)} · int. {fmt(x.interno).slice(0, 5)}{x.referencia ? " · ref. " + x.referencia : ""}</span>) : <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>calculando…</span>}</div>
        <div className="text-[10px] mb-2.5" style={{ color: "var(--text-muted)" }}>Dias úteis civis: fins de semana e feriados nacionais, do RJ e do Rio (recesso forense não conta).</div>
        <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Ao concluir</div>
        <label className="flex items-start gap-2 text-[12px] cursor-pointer mb-2" style={{ color: "var(--text-primary)" }}><input type="checkbox" className="mt-0.5" checked={f.registrar} onChange={e => set("registrar", e.target.checked)} /><span>Exigir o <b>link do arquivo</b> e registrar em <b>Documentos</b> do cliente (tipo “Relatório ao cliente”, com o mês de referência).</span></label>
      </>)}
      <div className="mt-2"><L t="Descrição / observação" /><textarea className={inputCls + " min-h-[60px] resize-y"} style={inputStyle} value={f.descricao} onChange={e => set("descricao", e.target.value)} placeholder="ex.: enviar para financeiro@… com cópia para a diretoria" /></div>
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Shell>
  );
}

function ConcluirRotina({ supabase, p, eu, onClose, onSaved }: { supabase: SB; p: Rot; eu: string; onClose: () => void; onSaved: () => void }) {
  const exige = !!p.recorrencia?.registrar_documento;
  const [url, setUrl] = useState(p.arquivo_url ?? ""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const ok = !exige || /^https?:\/\//i.test(url.trim());
  async function concluir() {
    if (!ok) return; setSaving(true); setErro(null);
    const { error } = await supabase.from("caso_pendencias").update({ arquivo_url: url.trim() || p.arquivo_url || null, status: "concluida", concluida_em: new Date().toISOString() }).eq("id", p.id);
    if (error) { setSaving(false); setErro(error.message); return; }
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: eu || "—", acao: "concluiu", obs: url.trim() || null });
    setSaving(false); onSaved();
  }
  return (
    <Shell title={"Concluir · " + p.titulo} sub={exige ? "O link do arquivo enviado é obrigatório: ele vai para Documentos do cliente." : "A próxima ocorrência nasce sozinha."} onClose={onClose}
      footer={<><div /><div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={concluir} disabled={!ok || saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{saving ? "Concluindo…" : "✓ Concluir"}</button></div></>}>
      <L t={exige ? "Link do arquivo enviado (Google Drive)" : "Link do arquivo (opcional)"} req={exige} />
      <input className={inputCls} style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/…" autoFocus />
      {exige && !ok && url.trim() && <div className="text-[11px] mt-1" style={{ color: "var(--alerta)" }}>O link precisa começar com http:// ou https://.</div>}
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
    </Shell>
  );
}

function HistoricoRotina({ supabase, p, onClose }: { supabase: SB; p: Rot; onClose: () => void }) {
  const [serie, setSerie] = useState<Pendencia[] | null>(null); const [evs, setEvs] = useState<PendEvento[]>([]);
  useEffect(() => {
    (async () => {
      const q = p.recorrencia_id ? supabase.from("caso_pendencias").select("*").eq("recorrencia_id", p.recorrencia_id) : supabase.from("caso_pendencias").select("*").eq("id", p.id);
      const { data } = await q.order("recorrencia_seq", { ascending: false }).limit(200);
      const lista = (data ?? []) as Pendencia[]; setSerie(lista);
      if (lista.length) { const { data: e } = await supabase.from("pendencia_eventos").select("*").in("pendencia_id", lista.map(x => x.id)).order("criado_em", { ascending: false }).limit(100); setEvs((e ?? []) as PendEvento[]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  return (
    <Shell title={"Histórico · " + p.titulo.replace(/ — [a-z]{3}\/\d{4}$/, "")} sub="Uma linha por ocorrência; eventos embaixo." onClose={onClose} footer={<><div /><button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Fechar</button></>}>
      {serie === null ? <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Carregando…</div> : serie.map(x => { const s = STATUS_PEND[x.status] ?? { l: x.status, cls: "mut" }; return (
        <div key={x.id} className="py-2 border-b text-[12px] flex flex-wrap items-center gap-2" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <b style={{ color: "var(--text-primary)" }}>{x.recorrencia_seq ? x.recorrencia_seq + "ª" : ""} {x.titulo}</b>
          <span>· prazo {fmt(x.prazo)}</span><Pz t={s.l} cls={s.cls} /><span>· {x.responsavel ?? "—"}{x.revisor ? " → " + x.revisor : ""}</span>
          {x.concluida_em && <span>· concluída {fmt(x.concluida_em)}</span>}
          {x.arquivo_url && <a href={x.arquivo_url} target="_blank" rel="noreferrer" style={{ color: "var(--acao)" }}>arquivo ↗</a>}
        </div>); })}
      <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-1 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Eventos</div>
      {evs.length === 0 ? <div className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Sem eventos.</div> : evs.map(e => <div key={e.id} className="py-1.5 border-b text-[11.5px]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{e.autor ?? "—"}</b> {e.acao}<span className="ml-1.5 text-[10.5px]" style={{ color: "var(--text-muted)" }}>{fmtDT(e.criado_em)}</span>{e.obs && <div className="italic">“{e.obs}”</div>}</div>)}
    </Shell>
  );
}
