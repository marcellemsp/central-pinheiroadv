"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, ADVOGADOS } from "@/lib/areas";
import { BANCAS } from "./ClientesListView";
import { Pz, STATUS_PEND, primeiroNome, mesmoNome } from "./CasoView";
import type { PendRev } from "./RevisaoView";

type Tipo = "fatal" | "prazo" | "interno" | "pend" | "rev";
type Item = { p: PendRev; data: string; tipo: Tipo };
const TIPOS: Record<Tipo, { l: string; cor: string; bg: string; cls: string }> = {
  fatal:   { l: "Prazo fatal",          cor: "var(--alerta)", bg: "var(--tag-red-bg)",    cls: "fatal" },
  prazo:   { l: "Prazo (não fatal)",    cor: "var(--text-muted)", bg: "var(--bg-page)",       cls: "mut" },
  interno: { l: "Prazo interno (D-4)",  cor: "var(--acao)", bg: "var(--tag-blue-bg)",   cls: "rev" },
  pend:    { l: "Pendência com prazo",  cor: "var(--atencao)", bg: "var(--tag-amber-bg)",  cls: "prox" },
  rev:     { l: "Revisão pendente",     cor: "var(--destaque)", bg: "var(--tag-purple-bg)", cls: "gray" },
};
const TIPOS_PRAZO = new Set(["peca", "protocolo", "audiencia", "julgamento", "memorial", "despacho"]);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeStr = () => iso(new Date());
const addD = (s: string, n: number) => { const x = new Date(s + "T12:00:00"); x.setDate(x.getDate() + n); return iso(x); };
const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const chip = (on: boolean) => on ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };
const selCls = "px-2.5 py-1.5 rounded text-[11px] border"; const selStyle = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" } as const;

export default function CalendarioView({ usuarioNome, pendencias }: { usuarioNome: string; pendencias: PendRev[] }) {
  const router = useRouter(); const supabase = createClient(); const refresh = useRefreshDebounced(router);
  const eu = primeiroNome(usuarioNome);
  const hoje = hojeStr();
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth());
  const [modo, setModo] = useState<"mes" | "semana">("mes");
  // Celular abre na semana (tela estreita não comporta o mês)
  useEffect(() => { if (typeof window !== "undefined" && window.innerWidth < 768) setModo("semana"); }, []);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); const f = () => setMobile(mq.matches); f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const [sel, setSel] = useState<string>(hoje);
  const [fBanca, setFBanca] = useState("todas"); const [fArea, setFArea] = useState("todas"); const [fResp, setFResp] = useState("todos"); const [soMeus, setSoMeus] = useState(false);
  const [ativos, setAtivos] = useState<Record<Tipo, boolean>>({ fatal: true, prazo: true, interno: true, pend: true, rev: true });

  useEffect(() => {
    const ch = supabase.channel("calendario-live").on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, refresh).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── pendências → itens do calendário ── */
  const itens = useMemo<Item[]>(() => {
    const out: Item[] = [];
    pendencias.filter(p => p.status !== "concluida")
      .filter(p => fBanca === "todas" || p.empresa?.banca === fBanca)
      .filter(p => fArea === "todas" || p.caso?.area === fArea)
      .filter(p => fResp === "todos" || p.responsavel === fResp)
      .filter(p => !soMeus || mesmoNome(p.responsavel, eu) || mesmoNome(p.revisor, eu))
      .forEach(p => {
        if (p.status === "revisao_pendente") { const d = p.prazo_interno ?? p.prazo; if (d) out.push({ p, data: d, tipo: "rev" }); if (p.fatal && p.prazo) out.push({ p, data: p.prazo, tipo: "fatal" }); return; }
        if (p.prazo) out.push({ p, data: p.prazo, tipo: p.fatal ? "fatal" : TIPOS_PRAZO.has(p.tipo) ? "prazo" : "pend" });
        if (p.fatal && p.prazo_interno && p.status !== "pronta_protocolar") out.push({ p, data: p.prazo_interno, tipo: "interno" });
      });
    return out.filter(i => ativos[i.tipo]).sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === "fatal" ? 0 : 1) - (b.tipo === "fatal" ? 0 : 1));
  }, [pendencias, fBanca, fArea, fResp, soMeus, eu, ativos]);
  const porDia = useMemo(() => { const m: Record<string, Item[]> = {}; itens.forEach(i => (m[i.data] ??= []).push(i)); return m; }, [itens]);

  /* ── grade do mês ── */
  const primeiro = new Date(ano, mes, 1); const inicioGrade = addD(iso(primeiro), -primeiro.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => addD(inicioGrade, i));
  const noMes = (d: string) => Number(d.slice(5, 7)) - 1 === mes && Number(d.slice(0, 4)) === ano;
  const mesPrefix = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const doMes = itens.filter(i => i.data.startsWith(mesPrefix));
  const resumo = (t: Tipo) => doMes.filter(i => i.tipo === t).length;
  /* ── semana da data selecionada (seg–sex, fim de semana se houver item) ── */
  const dSel = new Date(sel + "T12:00:00"); const segunda = addD(sel, -((dSel.getDay() + 6) % 7));
  const semana = Array.from({ length: 5 }, (_, i) => addD(segunda, i)).slice(0, 5);
  const mudarMes = (n: number) => { const x = new Date(ano, mes + n, 1); setAno(x.getFullYear()); setMes(x.getMonth()); };
  const irHoje = () => { const x = new Date(); setAno(x.getFullYear()); setMes(x.getMonth()); setSel(hoje); };
  const resps = Array.from(new Set([...ADVOGADOS, ...pendencias.map(p => p.responsavel).filter(Boolean) as string[]]));
  const abrir = (i: Item) => { if (i.p.caso) router.push(`/casos/${i.p.caso.id}`); else if (i.p.empresa_id) router.push(`/clientes/${i.p.empresa_id}`); };
  const rotulo = (i: Item) => `${i.p.tipo === "julgamento" ? "" + (i.p.hora ? i.p.hora.slice(0, 5) + " " : "") : i.p.tipo === "despacho" ? "" + (i.p.hora ? i.p.hora.slice(0, 5) + " " : (i.p.detalhes?.etapa ?? "a_pedir") !== "agendado" ? "pedir/cobrar " : "") : ""}${i.tipo === "fatal" ? "FATAL · " : i.tipo === "interno" ? "D-4 · " : i.tipo === "rev" ? "Revisão · " : ""}${i.p.titulo} · ${i.p.empresa?.nome_exibicao || i.p.empresa?.nome || ""}`;
  const Ev = ({ i, full }: { i: Item; full?: boolean }) => <div onClick={e => { e.stopPropagation(); abrir(i); }} title={rotulo(i)} className={`text-[10px] rounded px-1.5 py-px mb-0.5 cursor-pointer hover:brightness-125 ${full ? "" : "truncate"}`} style={{ border: `1px solid ${TIPOS[i.tipo].cor}`, background: TIPOS[i.tipo].bg, color: "var(--text-primary)", lineHeight: 1.45 }}>{rotulo(i)}{full && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{i.p.responsavel ?? "—"}{i.p.caso ? ` · ${i.p.caso.titulo}` : ""}</div>}</div>;

  const selItens = porDia[sel] ?? [];
  const MAX = 2;

  return (
    <div data-cal-root className="px-5 pt-3 pb-3 flex flex-col overflow-hidden" style={{ height: "calc(100vh - 44px)" }}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div><h1 className="text-[26px]">Calendário</h1><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Prazos fatais, prazos internos (D-4), pendências com prazo e revisões, no formato de calendário — os mesmos dados de Prazos e Pendências. Só leitura: clicar abre o caso.</p></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex gap-1"><button onClick={() => mudarMes(-1)} className="px-2.5 py-1 rounded text-xs border" style={selStyle}>‹</button><button onClick={irHoje} className="px-2.5 py-1 rounded text-xs border" style={selStyle}>Hoje</button><button onClick={() => mudarMes(1)} className="px-2.5 py-1 rounded text-xs border" style={selStyle}>›</button></div>
        <h2 className="text-[14px] font-semibold min-w-[160px]" style={{ color: "var(--text-primary)" }}>{modo === "mes" ? `${MESES[mes]} de ${ano}` : `semana útil de ${fmt(segunda)}`}</h2>
        <div className="flex gap-1">{(["mes", "semana"] as const).map(m => <button key={m} onClick={() => setModo(m)} className="px-2.5 py-1 rounded text-[11px] font-medium border" style={chip(modo === m)}>{m === "mes" ? "Mês" : "Semana útil"}</button>)}</div>
        <select value={fBanca} onChange={e => setFBanca(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as carteiras</option>{Object.keys(BANCAS).map(b => <option key={b} value={b}>Carteira {b}</option>)}</select>
        <select value={fArea} onChange={e => setFArea(e.target.value)} className={selCls} style={selStyle}><option value="todas">Todas as áreas</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
        <select value={fResp} onChange={e => setFResp(e.target.value)} className={selCls} style={selStyle}><option value="todos">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
        <button onClick={() => setSoMeus(v => !v)} className="px-2.5 py-1.5 rounded text-[11px] font-medium border" style={chip(soMeus)}>Só meus</button>
        <div className="ml-auto flex gap-3 text-[11px] flex-wrap" style={{ color: "var(--text-secondary)" }}>
          {(Object.keys(TIPOS) as Tipo[]).map(t => <button key={t} onClick={() => setAtivos(a => ({ ...a, [t]: !a[t] }))} className="inline-flex items-center gap-1.5" style={{ opacity: ativos[t] ? 1 : 0.4, textDecoration: ativos[t] ? "none" : "line-through" }}><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIPOS[t].cor }} />{TIPOS[t].l}</button>)}
        </div>
      </div>

      <div data-cal-grid className="flex-1 min-h-0 grid gap-3" style={{ gridTemplateColumns: "1fr 280px" }}>
        <div className="min-h-0 flex flex-col">
          {modo === "mes" && mobile ? (
            /* Celular: grade compacta do mês, só pontos por tipo; toca no dia e a lista aparece embaixo */
            <div className="grid grid-cols-7 gap-1 rounded-md border p-1.5 mb-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {DIAS.map(d => <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider pb-0.5" style={{ color: "var(--text-muted)" }}>{d}</div>)}
              {dias.map(d => { const its = porDia[d] ?? []; const tipos = Array.from(new Set(its.map(i => i.tipo))).slice(0, 3) as Tipo[]; const dentro = noMes(d); const on = d === sel; return (
                <button key={d} onClick={() => setSel(d)} className="relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold" style={{ background: on ? "var(--acao)" : "transparent", color: on ? "var(--on-acao)" : dentro ? "var(--text-primary)" : "var(--text-muted)", opacity: dentro || on ? 1 : 0.45, boxShadow: d === hoje && !on ? "inset 0 0 0 1.5px var(--acao)" : "none" }}>
                  {its.length > 1 && <span className="absolute top-0.5 right-1 text-[8px] font-bold" style={{ color: on ? "var(--acao-claro)" : "var(--text-muted)" }}>{its.length}</span>}
                  {Number(d.slice(8, 10))}
                  <span className="flex gap-0.5 h-1.5">{tipos.map(t => <i key={t} className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "var(--on-acao)" : TIPOS[t].cor }} />)}</span>
                </button>); })}
            </div>
          ) : modo === "mes" ? (
            <div className="flex-1 min-h-0 grid rounded-md border overflow-hidden" style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "auto repeat(6, minmax(0, 1fr))", background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {DIAS.map(d => <div key={d} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", background: "var(--bg-page)", borderColor: "var(--border)" }}>{d}</div>)}
              {dias.map((d, i) => { const its = porDia[d] ?? []; const dentro = noMes(d); const fds = i % 7 === 0 || i % 7 === 6; return (
                <div key={d} onClick={() => setSel(d)} className="min-h-0 overflow-hidden flex flex-col px-1.5 py-1 border-b cursor-pointer" style={{ borderColor: "var(--border)", borderRight: i % 7 === 6 ? "none" : "1px solid var(--border)", background: !dentro ? "var(--bg-page)" : d === sel ? "var(--bg-page)" : "transparent", boxShadow: d === hoje ? "inset 0 0 0 2px var(--acao)" : "none", opacity: dentro ? 1 : 0.55 }}>
                  <div className="flex justify-between text-[11px] font-semibold mb-0.5" style={{ color: fds ? "var(--text-muted)" : "var(--text-primary)" }}><span>{Number(d.slice(8, 10))}</span>{d === hoje && <span className="text-[9px] font-bold uppercase" style={{ color: "var(--acao)" }}>hoje</span>}</div>
                  <div className="flex-1 min-h-0 overflow-hidden">{its.slice(0, MAX).map((it, k) => <Ev key={k} i={it} />)}{its.length > MAX && <div className="text-[10px] font-semibold" style={{ color: "var(--acao)" }}>+{its.length - MAX} mais</div>}</div>
                </div>); })}
            </div>
          ) : mobile ? (
            /* Celular: faixa da semana (seg–dom); a lista do dia selecionado fica logo abaixo */
            <div className="grid grid-cols-7 gap-1 mb-2">
              {Array.from({ length: 7 }, (_, i) => addD(segunda, i)).map(d => { const its = porDia[d] ?? []; const tipos = Array.from(new Set(its.map(i => i.tipo))).slice(0, 4) as Tipo[]; const on = d === sel; return (
                <button key={d} onClick={() => setSel(d)} className="rounded-lg border py-1.5 flex flex-col items-center gap-0.5" style={{ background: on ? "var(--acao)" : "var(--bg-surface)", borderColor: on ? "var(--acao)" : "var(--border)" }}>
                  <span className="text-[9px] font-bold uppercase" style={{ color: on ? "var(--acao-claro)" : "var(--text-muted)" }}>{DIAS[new Date(d + "T12:00:00").getDay()]}</span>
                  <b className="text-[13px]" style={{ color: on ? "var(--on-acao)" : d === hoje ? "var(--acao)" : "var(--text-primary)" }}>{Number(d.slice(8, 10))}</b>
                  <span className="flex gap-0.5 h-1.5">{tipos.map(t => <i key={t} className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "var(--on-acao)" : TIPOS[t].cor }} />)}</span>
                </button>); })}
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid rounded-md border overflow-hidden" style={{ gridTemplateColumns: `repeat(${semana.length}, 1fr)`, gridTemplateRows: "auto minmax(0, 1fr)", background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {semana.map(d => <div key={d} onClick={() => setSel(d)} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider border-b cursor-pointer" style={{ color: "var(--text-muted)", background: "var(--bg-page)", borderColor: "var(--border)" }}>{DIAS[new Date(d + "T12:00:00").getDay()]}<b className="block text-[15px]" style={{ color: d === hoje ? "var(--acao)" : "var(--text-primary)" }}>{Number(d.slice(8, 10))}</b></div>)}
              {semana.map((d, i) => { const its = porDia[d] ?? []; return <div key={d} className="min-h-0 overflow-auto p-1.5" style={{ borderRight: i === semana.length - 1 ? "none" : "1px solid var(--border)", background: d === sel ? "var(--bg-page)" : "transparent" }}><div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{its.length} item{its.length === 1 ? "" : "s"}</div>{its.map((it, k) => <Ev key={k} i={it} full />)}</div>; })}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto flex flex-col gap-2.5">
          <div className="rounded-md border flex-shrink-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="px-3 py-2 border-b flex justify-between items-center text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{sel === hoje ? "Hoje · " : ""}{DIAS[new Date(sel + "T12:00:00").getDay()]} {fmt(sel)}</span><button onClick={() => router.push("/prazos")} className="normal-case tracking-normal font-medium" style={{ color: "var(--acao)" }}>ver em Prazos →</button></div>
            {selItens.length === 0 ? <div className="px-3 py-5 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>Nada neste dia.</div> : selItens.map((i, k) => { const s = STATUS_PEND[i.p.status] ?? { l: i.p.status, cls: "mut" }; return (
              <div key={k} onClick={() => abrir(i)} className="px-3 py-2 border-b last:border-b-0 cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-1.5 flex-wrap"><Pz t={TIPOS[i.tipo].l} cls={TIPOS[i.tipo].cls} /><Pz t={s.l} cls={s.cls} /></div>
                <div className="text-[12.5px] font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{i.p.titulo}</div>
{(i.p.tipo === "julgamento" || i.p.tipo === "despacho") && (i.p.hora || i.p.detalhes?.link) && <div className="text-[11px] mt-0.5" style={{ color: i.p.tipo === "despacho" ? "var(--atencao)" : "var(--acao-claro)" }}>{i.p.tipo === "despacho" ? "" : ""} {i.p.hora ? i.p.hora.slice(0, 5) : ""}{i.p.detalhes?.modalidade ? ` · ${i.p.detalhes.modalidade}` : ""}{i.p.detalhes?.link && <a href={i.p.detalhes.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-1.5 font-semibold" style={{ color: "var(--acao)" }}>entrar</a>}</div>}
                <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{i.p.empresa?.nome_exibicao || i.p.empresa?.nome || "—"}{i.p.caso ? ` · ${i.p.caso.titulo}` : i.p.certidao_subtipo ? ` · ${i.p.certidao_subtipo}` : i.p.recorrencia ? " · rotina do cliente" : ""} · {i.p.responsavel ?? "—"}</div>
              </div>); })}
          </div>
          <div className="rounded-md border flex-shrink-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Resumo de {MESES[mes]}</div>
            <div className="grid grid-cols-2">{(Object.keys(TIPOS) as Tipo[]).map((t, k) => <div key={t} className="px-3 py-2 text-xs" style={{ borderRight: k % 2 === 0 ? "1px solid var(--border)" : "none", borderBottom: k < 4 ? "1px solid var(--border)" : "none" }}><b className="text-[15px]" style={{ color: resumo(t) ? TIPOS[t].cor : "var(--text-primary)" }}>{resumo(t)}</b><div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{TIPOS[t].l}</div></div>)}</div>
          </div>
          {mobile && modo === "mes" && (
            /* Celular: agenda do mês — só os dias com itens, em ordem */
            <div className="rounded-md border flex-shrink-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Agenda de {MESES[mes]}</div>
              {dias.filter(d => noMes(d) && (porDia[d]?.length ?? 0) > 0).length === 0 && <div className="px-3 py-5 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>Nada neste mês.</div>}
              {dias.filter(d => noMes(d) && (porDia[d]?.length ?? 0) > 0).map(d => (
                <div key={d} className="grid gap-2.5 px-3 py-2 border-b last:border-b-0" style={{ gridTemplateColumns: "40px 1fr", borderColor: "var(--border)" }} data-keep-grid>
                  <button onClick={() => setSel(d)} className="text-center pt-0.5"><b className="block text-[17px] leading-none" style={{ color: d === hoje ? "var(--acao)" : "var(--text-primary)" }}>{Number(d.slice(8, 10))}</b><span className="block text-[9px] font-bold uppercase mt-0.5" style={{ color: "var(--text-muted)" }}>{DIAS[new Date(d + "T12:00:00").getDay()]}</span></button>
                  <div className="min-w-0">{(porDia[d] ?? []).map((i, k) => { const s = STATUS_PEND[i.p.status] ?? { l: i.p.status, cls: "mut" }; return (
                    <div key={k} onClick={() => abrir(i)} className="py-1.5 border-b last:border-b-0 cursor-pointer" style={{ borderColor: "var(--border)" }}>
                      <div className="flex gap-1.5 flex-wrap"><Pz t={TIPOS[i.tipo].l} cls={TIPOS[i.tipo].cls} /><Pz t={s.l} cls={s.cls} /></div>
                      <div className="text-[12px] font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{i.p.titulo}</div>
                      <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{i.p.empresa?.nome_exibicao || i.p.empresa?.nome || "—"} · {i.p.responsavel ?? "—"}</div>
                    </div>); })}</div>
                </div>))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
