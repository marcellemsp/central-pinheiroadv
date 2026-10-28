"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRefreshDebounced } from "@/lib/refresh";
import { AREAS, type Area } from "@/lib/areas";
import { BANCAS } from "./ClientesListView";
import { EnviarDrawer, RevisarDrawer, Pz, prazoPz, COORDS, primeiroNome, mesmoNome, ehCoordenador, relTempo, fmtDT, Cadeia, NomeRev, corRevisor, type Pendencia, type PendEvento } from "./CasoView";

export type PendRev = Pendencia & { caso: { id: string; titulo: string; numero: string | null; area: Area } | null; empresa: { id: string; nome: string; nome_exibicao: string | null; banca: string | null } | null };

const fmt = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const diasAte = (d?: string | null) => d ? Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5) : null;
const internoPz = (p: Pendencia) => { if (!p.prazo_interno) return <Pz t="—" cls="mut" />; const d = diasAte(p.prazo_interno)!; return <Pz t={(d < 0 ? "VENCIDO " : d === 0 ? "HOJE · " : "") + fmt(p.prazo_interno)} cls={d < 0 ? "fatal" : d <= 1 ? "prox" : "mut"} />; };
const AreaTag = ({ a }: { a?: Area | null }) => { const A = AREAS.find(x => x.key === a); return A ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap" style={{ background: A.bg, color: A.fg }}>{A.icon} {A.label}</span> : null; };
const BancaTag = ({ b }: { b?: string | null }) => { const B = b ? (BANCAS as any)[b] : null; return B ? <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded ml-1.5" style={{ background: B.bg, color: B.fg }}>{b}</span> : null; };
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><span>{title}</span>{action}</div>{children}</div>;
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{t}</div>;
const Grp = ({ t, n, red }: { t: string; n: number; red?: boolean }) => <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mt-4 mb-2 first:mt-0" style={{ color: red ? "var(--alerta)" : "var(--text-muted)" }}>{t}<span className="px-1.5 rounded-full border text-[10px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>{n}</span></div>;
const Kpi = ({ v, l, c }: { v: React.ReactNode; l: string; c?: string }) => <div className="rounded-md border px-3.5 py-2.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-xl font-bold" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
const Live = ({ since }: { since: number }) => <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" }}><i className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--ok)" }} />ao vivo<span className="font-medium normal-case tracking-normal opacity-80">· {since < 5 ? "atualizado agora" : `sincronizado há ${since}s`}</span></span>;

export type Decisao = { pendencia_id: string; acao: string; obs: string | null; criado_em: string };
export default function RevisaoView({ usuarioNome, pendencias, eventos, decisoes = [] }: { usuarioNome: string; pendencias: PendRev[]; eventos: (PendEvento & { titulo?: string })[]; decisoes?: Decisao[] }) {
  const router = useRouter(); const supabase = createClient();
  const refresh = useRefreshDebounced(router);
  const eu = primeiroNome(usuarioNome); const coord = ehCoordenador(eu);
  const [dr, setDr] = useState<null | { k: "enviar" | "revisar"; p: PendRev }>(null);
  const [fBanca, setFBanca] = useState("todas"); const [fArea, setFArea] = useState("todas");
  const [since, setSince] = useState(0);
  // coordenador pode abrir a fila de outro coordenador (clicando no card lateral)
  const [verFila, setVerFila] = useState<string | null>(null); const dono = verFila ?? eu;

  useEffect(() => {
    const ch = supabase.channel("revisao-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "caso_pendencias" }, () => { setSince(0); refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pendencia_eventos" }, () => { setSince(0); refresh(); })
      .subscribe();
    const t = setInterval(() => setSince(s => s + 5), 5000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctx = (p: PendRev) => `${p.empresa?.nome_exibicao || p.empresa?.nome || "—"} · ${p.caso?.titulo ?? ""}${p.caso?.numero ? ` · ${p.caso.numero}` : ""}`;
  const abrirCaso = (p: PendRev) => p.caso && router.push(`/casos/${p.caso.id}`);

  /* ── coordenador: a fila DELE ── */
  const fila = useMemo(() => pendencias.filter(p => p.status === "revisao_pendente" && mesmoNome(p.revisor, dono)).filter(p => fBanca === "todas" || p.empresa?.banca === fBanca).filter(p => fArea === "todas" || p.caso?.area === fArea).sort((a, b) => (a.prazo_interno ?? "9999").localeCompare(b.prazo_interno ?? "9999")), [pendencias, dono, fBanca, fArea]);
  /* ── advogado: as peças DELE ── */
  const minhas = useMemo(() => pendencias.filter(p => mesmoNome(p.responsavel, eu) && ["revisao_pendente", "devolvida", "pronta_protocolar"].includes(p.status)), [pendencias, eu]);

  async function protocolei(p: PendRev) {
    await supabase.from("caso_pendencias").update({ status: "concluida", concluida_em: new Date().toISOString() }).eq("id", p.id);
    if (p.caso_id && p.tipo !== "memorial") await supabase.from("caso_andamentos").insert({ caso_id: p.caso_id, empresa_id: p.empresa_id, data: new Date().toISOString().slice(0, 10), descricao: `Concluída: ${p.titulo}${p.responsavel ? ` (${p.responsavel})` : ""}${p.versao ? ` · v${p.versao}` : ""}`, fonte: "manual" });
    await supabase.from("pendencia_eventos").insert({ pendencia_id: p.id, caso_id: p.caso_id, empresa_id: p.empresa_id, autor: eu, acao: "protocolou · concluída" });
    router.refresh();
  }

  const feed = (
    <Card title="Atividade em tempo real">
      <div className="px-3.5 py-1">{eventos.length === 0 ? <Empty t="Sem atividade recente." /> : eventos.map(e => <div key={e.id} className="grid gap-2.5 py-2 border-b last:border-b-0 text-xs" style={{ gridTemplateColumns: "8px 1fr", borderColor: "var(--border)" }}><span className="w-2 h-2 rounded-full mt-1.5" style={{ background: /aprovou|protocolou|concluiu/.test(e.acao) ? "var(--ok)" : /devolveu/.test(e.acao) ? "var(--alerta)" : /subiu/.test(e.acao) ? "var(--destaque)" : "var(--acao)" }} /><div style={{ color: "var(--text-primary)" }}><b>{e.autor ?? "—"}</b> {e.acao}{e.titulo && <> · <b>{e.titulo}</b></>}<div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{fmtDT(e.criado_em)} · {relTempo(e.criado_em)}</div></div></div>)}</div>
    </Card>
  );

  if (coord) {
    const g1 = fila.filter(p => p.prazo_interno && (diasAte(p.prazo_interno) ?? 9) <= 0), g2 = fila.filter(p => p.prazo_interno && (diasAte(p.prazo_interno) ?? 9) > 0 && (diasAte(p.prazo_interno) ?? 9) <= 7), g3 = fila.filter(p => !g1.includes(p) && !g2.includes(p));
    const media = fila.length ? Math.round(fila.reduce((s, p) => s + (p.enviado_em ? (Date.now() - new Date(p.enviado_em).getTime()) / 36e5 : 0), 0) / fila.length) : 0;
    const outros = COORDS.filter(c => !mesmoNome(c, eu)).map(c => [c, pendencias.filter(p => p.status === "revisao_pendente" && mesmoNome(p.revisor, c)).length] as const);
    const subidas = pendencias.filter(p => p.status === "revisao_pendente" && mesmoNome(p.subida_por, eu) && !mesmoNome(p.revisor, eu) && p.origem_revisao === "subida").sort((a, b) => (a.prazo_interno ?? "9999").localeCompare(b.prazo_interno ?? "9999"));
    // Última decisão minha por peça (aprovou / devolveu), nos últimos 30 dias
    const ultDec = new Map<string, Decisao>(); for (const d of decisoes) if (!ultDec.has(d.pendencia_id)) ultDec.set(d.pendencia_id, d);
    const devolvidas = pendencias.filter(p => p.status === "devolvida" && /^devolveu/.test(ultDec.get(p.id)?.acao ?? "")).sort((a, b) => (ultDec.get(b.id)?.criado_em ?? "").localeCompare(ultDec.get(a.id)?.criado_em ?? ""));
    const aprovadas = pendencias.filter(p => (p.status === "pronta_protocolar" || p.status === "concluida") && /^aprovou/.test(ultDec.get(p.id)?.acao ?? "")).sort((a, b) => (ultDec.get(b.id)?.criado_em ?? "").localeCompare(ultDec.get(a.id)?.criado_em ?? ""));
    const Bloco = ({ cor, titulo, sub, rows, extra }: { cor: string; titulo: string; sub: string; rows: PendRev[]; extra: (p: PendRev) => React.ReactNode }) => rows.length === 0 ? null : (
      <div className="mt-4 rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="px-3.5 py-2 border-b text-[10.5px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ borderColor: "var(--border)", color: cor }}><span>{titulo}</span><span className="font-medium normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>{sub}</span></div>
        {rows.map(p => { const d = ultDec.get(p.id); return <div key={p.id} className="px-3.5 py-2 border-b last:border-b-0 flex items-center justify-between gap-3 text-xs cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)" }} onClick={() => abrirCaso(p)}><div className="min-w-0"><div className="font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-primary)" }}>{p.titulo}</div><div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{ctx(p)}{d ? ` · ${relTempo(d.criado_em)}` : ""}</div>{d?.obs && <div className="text-[10.5px] mt-0.5 truncate max-w-[520px]" style={{ color: "var(--text-secondary)" }}>“{d.obs}”</div>}</div><div className="flex items-center gap-3 shrink-0">{extra(p)}{prazoPz(p)}</div></div>; })}
      </div>
    );
    const Tbl = ({ rows }: { rows: PendRev[] }) => (
      <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><table className="w-full text-[12.5px]">
        <thead><tr style={{ background: "var(--bg-page)" }}>{["Peça", "Frente", "Cadeia", "Prazo interno", "Prazo fatal", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "34%" : undefined }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(p => <tr key={p.id} className="border-b last:border-b-0 hover:brightness-110 cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => setDr({ k: "revisar", p })}>
          <td className="px-3 py-2.5"><div className="font-semibold uppercase tracking-wide flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-primary)" }}>{p.titulo}{p.origem_revisao === "subida" && p.subida_por && <span className="text-[9.5px] font-bold px-1.5 py-px rounded normal-case tracking-normal" style={{ background: corRevisor(p.subida_por).bg, color: corRevisor(p.subida_por).fg }}>⇧ subiu de {primeiroNome(p.subida_por)}</span>}{p.origem_revisao === "devolucao_de_cima" && <span className="text-[9.5px] font-bold px-1.5 py-px rounded normal-case tracking-normal" style={{ background: corRevisor(p.subida_por).bg, color: corRevisor(p.subida_por).fg }}>↩ voltou de {primeiroNome(p.subida_por)}</span>}{p.origem_revisao === "retorno_aprovado" && <span className="text-[9.5px] font-bold px-1.5 py-px rounded normal-case tracking-normal" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" }}>✓ {primeiroNome(p.subida_por)} aprovou · fechar</span>}</div><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ctx(p)}</div>{(p.origem_revisao === "devolucao_de_cima" || p.origem_revisao === "retorno_aprovado") && p.subida_obs && <div className="text-[10.5px] mt-1 px-2 py-1 rounded-sm max-w-[360px]" style={{ border: `1px solid ${corRevisor(p.subida_por).fg}`, background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{primeiroNome(p.subida_por)}:</b> {p.subida_obs}</div>}</td>
          <td className="px-3 py-2.5"><AreaTag a={p.caso?.area} /></td>
          <td className="px-3 py-2.5"><Cadeia p={p} /><BancaTag b={p.empresa?.banca} /><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>v{p.versao ?? 1}{p.enviado_em ? ` · ${fmtDT(p.enviado_em)} · ${relTempo(p.enviado_em)}` : ""}</div></td>
          <td className="px-3 py-2.5">{internoPz(p)}</td>
          <td className="px-3 py-2.5">{prazoPz(p)}</td>
          <td className="px-3 py-2.5 text-right whitespace-nowrap"><button onClick={e => { e.stopPropagation(); abrirCaso(p); }} className="px-2.5 py-1 rounded text-[11px] font-medium border mr-1.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Abrir caso</button><button onClick={e => { e.stopPropagation(); setDr({ k: "revisar", p }); }} className="px-2.5 py-1 rounded text-[11px] font-medium text-on-acao" style={{ background: "var(--acao)" }}>Revisar</button></td>
        </tr>)}</tbody></table></div>
    );
    return (
      <div className="px-6 pt-4 pb-10">
        <div className="flex items-start justify-between gap-4"><div><h1 className="text-[26px]">Revisão pendente</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{verFila ? <>Você está vendo a <b>fila de {verFila}</b>: peças enviadas para a revisão dele(a). Dá para abrir e revisar daqui. <button onClick={() => setVerFila(null)} className="underline" style={{ color: "var(--acao)" }}>← voltar para a minha fila</button></> : <>Peças que as carteiras enviaram para <b>sua</b> revisão, {eu}. Somem daqui quando você aprovar ou devolver.</>}</p></div><Live since={since} /></div>
        <div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={fila.length} l={verFila ? `aguardando ${verFila}` : "aguardando você"} c="var(--acao)" /><Kpi v={g1.length} l="prazo interno hoje ou vencido" c={g1.length ? "var(--alerta)" : undefined} /><Kpi v={g2.length} l="vencem esta semana" c={g2.length ? "var(--atencao)" : undefined} /><Kpi v={`${media}h`} l="tempo médio na sua fila" /></div>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 300px" }}>
          <div>
            <div className="flex justify-between items-center mb-3 gap-3">
              <div className="flex gap-1.5 flex-wrap">{[["todas", "Todas"], ...Object.keys(BANCAS).map(b => [b, `Carteira ${b}`])].map(([k, l]) => <button key={k} onClick={() => setFBanca(k)} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border" style={fBanca === k ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{l}</button>)}</div>
              <select value={fArea} onChange={e => setFArea(e.target.value)} className="px-2.5 py-1.5 rounded text-[11px] border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}><option value="todas">Todas as frentes</option>{AREAS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}</select>
            </div>
            {fila.length === 0 && <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><Empty t={verFila ? `Nada na fila de ${verFila}. ` : "Nada esperando sua revisão. "} /></div>}
            {g1.length > 0 && <><Grp t="Prazo interno hoje ou vencido" n={g1.length} red /><Tbl rows={g1} /></>}
            {g2.length > 0 && <><Grp t="Esta semana" n={g2.length} /><Tbl rows={g2} /></>}
            {g3.length > 0 && <><Grp t="Mais adiante / sem prazo interno" n={g3.length} /><Tbl rows={g3} /></>}
            {!verFila && <><Bloco cor="var(--alerta)" titulo={`↩ Você devolveu ${devolvidas.length} ${devolvidas.length === 1 ? "peça" : "peças"}`} sub="aguardando reenvio de quem escreveu" rows={devolvidas} extra={p => <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>com <b style={{ color: "var(--text-secondary)" }}>{primeiroNome(p.responsavel)}</b></span>} />
        {subidas.length > 0 && <div className="mt-4 rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="px-3.5 py-2 border-b text-[10.5px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ borderColor: "var(--border)", color: "var(--destaque)" }}><span>⇧ Você subiu {subidas.length} {subidas.length === 1 ? "peça" : "peças"}</span><span className="font-medium normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>aguardando quem está acima</span></div>
              {subidas.map(p => <div key={p.id} className="px-3.5 py-2 border-b last:border-b-0 flex items-center justify-between gap-3 text-xs cursor-pointer hover:brightness-110" style={{ borderColor: "var(--border)" }} onClick={() => abrirCaso(p)}><div className="min-w-0"><div className="font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-primary)" }}>{p.titulo}</div><div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{ctx(p)}</div></div><div className="flex items-center gap-3 shrink-0"><Cadeia p={p} />{p.retorno_para && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>volta pra você</span>}{prazoPz(p)}</div></div>)}
            </div>}
            <Bloco cor="var(--ok)" titulo={`✓ Você aprovou ${aprovadas.length} ${aprovadas.length === 1 ? "peça" : "peças"}`} sub="últimos 30 dias" rows={aprovadas} extra={p => <Pz t={p.status === "concluida" ? "protocolado" : "pendente de protocolo"} cls={p.status === "concluida" ? "ok" : "prox"} />} /></>}
        <div className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>Ordem: prazo interno (D-4) mais próximo primeiro. <b>Aprovar</b> → “pendente de protocolo” (ou “protocolado”, se você mesma protocolar). <b>Subir</b> → passa para o coordenador acima, com seu parecer. <b>Devolver</b> → volta para quem escreveu (ou para o revisor anterior, se a peça subiu). Quem recebe vê a mudança na hora.</div>
          </div>
          <div className="space-y-4">
            <Card title={verFila ? "Filas dos coordenadores" : "Filas dos outros coordenadores"}>{verFila && <div role="button" onClick={() => setVerFila(null)} className="px-3.5 py-2 border-b flex justify-between items-center text-xs cursor-pointer hover:brightness-125" style={{ borderColor: "var(--border)", color: "var(--acao)" }}><span>← Voltar para a minha fila</span><b className="text-sm">{pendencias.filter(p => p.status === "revisao_pendente" && mesmoNome(p.revisor, eu)).length}</b></div>}{outros.map(([c, n]) => { const sel = !!verFila && mesmoNome(verFila, c); return <div key={c} role="button" title={`Abrir a fila de ${c}`} onClick={() => setVerFila(sel ? null : c)} className="px-3.5 py-2 border-b last:border-b-0 flex justify-between items-center text-xs cursor-pointer hover:brightness-125" style={{ borderColor: "var(--border)", background: sel ? "var(--acao-tint)" : undefined }}><span><NomeRev n={c} forte /><span className="block text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>revisão pendente</span></span><b className="text-sm">{n} <span style={{ color: "var(--text-muted)" }}>›</span></b></div>; })}</Card>
            {feed}
          </div>
        </div>
        {dr?.k === "revisar" && <RevisarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
      </div>
    );
  }

  /* ── visão do advogado da banca ── */
  const dev = minhas.filter(p => p.status === "devolvida"), emRev = minhas.filter(p => p.status === "revisao_pendente"), apr = minhas.filter(p => p.status === "pronta_protocolar");
  const espera = emRev.length ? Math.round(emRev.reduce((s, p) => s + (p.enviado_em ? (Date.now() - new Date(p.enviado_em).getTime()) / 36e5 : 0), 0) / emRev.length) : null;
  const Tbl = ({ rows }: { rows: PendRev[] }) => (
    <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><table className="w-full text-[12.5px]">
      <thead><tr style={{ background: "var(--bg-page)" }}>{["Peça", "Frente", "Situação", "Prazo interno", "Prazo fatal", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b whitespace-nowrap" style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "34%" : undefined }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(p => <tr key={p.id} className="border-b last:border-b-0 hover:brightness-110 cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => abrirCaso(p)}>
        <td className="px-3 py-2.5"><div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{p.titulo}</div><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ctx(p)}</div>{p.arquivo_url && <a href={p.arquivo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[11px]" style={{ color: "var(--acao)" }}>v{p.versao ?? 1} · abrir peça ↗</a>}</td>
        <td className="px-3 py-2.5"><AreaTag a={p.caso?.area} /></td>
        <td className="px-3 py-2.5">{p.status === "revisao_pendente" ? <><span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>com <NomeRev n={p.revisor} forte />{p.subida_por && !mesmoNome(p.subida_por, p.revisor) && <span style={{ color: "var(--text-muted)" }}>(via {primeiroNome(p.subida_por)})</span>}</span><div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{p.enviado_em ? relTempo(p.enviado_em) : ""}</div></> : p.status === "pronta_protocolar" ? <><Pz t="pendente de protocolo" cls="prox" /><div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>aprovada · falta protocolar</div></> : <><Pz t="devolvida" cls="fatal" />{p.devolucao_obs && <div className="text-[10.5px] mt-1 px-2 py-1 rounded-sm max-w-[280px]" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{p.revisor}:</b> {p.devolucao_obs}</div>}</>}</td>
        <td className="px-3 py-2.5">{internoPz(p)}</td>
        <td className="px-3 py-2.5">{prazoPz(p)}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{p.status === "devolvida" ? <button onClick={e => { e.stopPropagation(); setDr({ k: "enviar", p }); }} className="px-2.5 py-1 rounded text-[11px] font-medium text-on-acao" style={{ background: "var(--acao)" }}>Reenviar (v{(p.versao ?? 0) + 1})</button> : p.status === "pronta_protocolar" ? <button onClick={e => { e.stopPropagation(); protocolei(p); }} className="px-2.5 py-1 rounded text-[11px] font-medium text-on-acao" style={{ background: "var(--ok)" }}>✓ Protocolei</button> : <button onClick={e => { e.stopPropagation(); abrirCaso(p); }} className="px-2.5 py-1 rounded text-[11px] font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Abrir caso</button>}</td>
      </tr>)}</tbody></table></div>
  );
  return (
    <div className="px-6 pt-4 pb-10">
      <div className="flex items-start justify-between gap-4"><div><h1 className="text-[26px]">Revisão pendente</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Suas peças em revisão, {eu}: o que está com cada coordenador, o que voltou com ajustes e o que já foi aprovado.</p></div><Live since={since} /></div>
      <div className="grid grid-cols-4 gap-2.5 mt-3.5"><Kpi v={dev.length} l="devolvidas · ajustar" c={dev.length ? "var(--alerta)" : undefined} /><Kpi v={emRev.length} l="aguardando coordenador" c="var(--acao)" /><Kpi v={apr.length} l="pendentes de protocolo" c={apr.length ? "var(--ok)" : undefined} /><Kpi v={espera === null ? "—" : `${espera}h`} l="tempo médio de espera" /></div>
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 300px" }}>
        <div>
          {minhas.length === 0 && <div className="rounded-md border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><Empty t="Nenhuma peça sua em revisão. Envie pelo botão na pendência, dentro do caso." /></div>}
          {dev.length > 0 && <><Grp t="↩ Devolvidas com ajustes" n={dev.length} red /><Tbl rows={dev} /></>}
          {emRev.length > 0 && <><Grp t="Em revisão" n={emRev.length} /><Tbl rows={emRev} /></>}
          {apr.length > 0 && <><Grp t="Aprovadas · pendentes de protocolo" n={apr.length} /><Tbl rows={apr} /></>}
          <div className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>Você vê só as próprias peças. Quando um coordenador aprova ou devolve, a linha muda de grupo aqui na mesma hora.</div>
        </div>
        <div>{feed}</div>
      </div>
      {dr?.k === "enviar" && <EnviarDrawer key={dr.p.id} p={dr.p} contexto={ctx(dr.p)} usuario={eu} onClose={() => setDr(null)} onSaved={() => { setDr(null); router.refresh(); }} supabase={supabase} />}
    </div>
  );
}
