"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ADVOGADOS } from "@/lib/areas";
import { criarXlsx, baixarBlob, type Celula } from "@/lib/xlsx";
import { COORDS, mesmoNome, NomeRev, TIPOS_PEND } from "./CasoView";
import { type Alerte, type AlerteEvento, type Providencia, type CasoMin, type Proposta, STATUS_ALERTE, fmtD, fmtDT, hojeIso, primeiroNome, numNorm, lerPrazoDoTeor, classificarTipo, sugerirTextoAndamento, tribunalDe } from "@/lib/alertes";

// Alertes: publicações trazidas pela rotina → destinação (advogado do caso) → aprovação (coordenação) → andamento (+ pendência).
type Aba = "fila" | "aprovacao" | "historico";
const TRIB_OPTS: [string, string][] = [["TJRJ", "TJRJ"], ["TRF2", "TRF2 / JFRJ"], ["STJ", "STJ"], ["STF", "STF"], ["OUTRO", "outro tribunal"], ["SEFAZ-RJ", "SEFAZ-RJ"], ["PGFN", "PGFN / RFB"], ["CARF", "CARF"]];

export default function AlertesView({ alertes: ini, eventos, casos, providencias, userName, coordenador }: { alertes: Alerte[]; eventos: AlerteEvento[]; casos: CasoMin[]; providencias: Providencia[]; userName: string; coordenador: boolean }) {
  const router = useRouter(); const supabase = useMemo(() => createClient(), []);
  const eu = primeiroNome(userName);
  const [aba, setAba] = useState<Aba>("fila");
  const [dia, setDia] = useState<string>("todos");
  const [calAberto, setCalAberto] = useState(false);
  const [mesCal, setMesCal] = useState<string>(() => hojeIso().slice(0,7));
  const [busca, setBusca] = useState("");
  const [dr, setDr] = useState<null | { a: Alerte; modo: "destinar" | "aprovar" }>(null);
  const [devolvendo, setDevolvendo] = useState<null | { a: Alerte; obs: string }>(null);
  const [aviso, setAviso] = useState<{ t: string; tom: "ok" | "erro" } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = (t: string, tom: "ok" | "erro" = "ok") => { setAviso({ t, tom }); setTimeout(() => setAviso(null), 4000); };

  useEffect(() => {
    const ch = supabase.channel("alertes-live").on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, () => router.refresh()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const casoDe = (a: Alerte) => a.caso_id ? casos.find(c => c.id === a.caso_id) ?? null : (a.numero_norm ? casos.find(c => numNorm(c.numero) === a.numero_norm) ?? null : null);
  const meu = (a: Alerte) => { const c = casoDe(a); return coordenador || (c ? mesmoNome(c.advogado, eu) : false); };
  const alertes = ini.filter(meu);
  const totaisPorDia = useMemo(() => { const m = new Map<string, number>(); for (const a of ini) m.set(a.data, (m.get(a.data) ?? 0) + 1); return m; }, [ini]);
  // contador do calendário: só o que ainda falta fazer (destinar / aprovar / segurando / devolvida), das publicações que a pessoa vê
  const pendPorDia = new Map<string, number>(); for (const a of alertes) if (!["aprovada", "descartada"].includes(a.status)) pendPorDia.set(a.data, (pendPorDia.get(a.data) ?? 0) + 1);
  const dias = [...new Set(ini.map(a => a.data))].sort().reverse();
  const nb = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtra = (l: Alerte[]) => l.filter(a => (dia === "todos" || a.data === dia) && (!busca.trim() || nb(`${a.cliente ?? ""} ${a.processo ?? ""} ${a.tribunal ?? ""} ${a.teor ?? ""} ${casoDe(a)?.titulo ?? ""}`).includes(nb(busca))));
  const fila = filtra(alertes.filter(a => ["novo", "devolvida", "segurando"].includes(a.status))).sort((a, b) => (a.status === "devolvida" ? 0 : 1) - (b.status === "devolvida" ? 0 : 1) || (a.prazo_expresso ?? 99) - (b.prazo_expresso ?? 99) || b.data.localeCompare(a.data));
  const propostas = filtra(alertes.filter(a => a.status === "proposta")).sort((a, b) => ((a.proposta?.prazo_interno ?? a.proposta?.prazo ?? "9999")).localeCompare(b.proposta?.prazo_interno ?? b.proposta?.prazo ?? "9999"));
  const historico = filtra(alertes.filter(a => ["aprovada", "descartada"].includes(a.status))).sort((a, b) => (b.aprovado_em ?? b.criado_em).localeCompare(a.aprovado_em ?? a.criado_em));
  const semCaso = alertes.filter(a => !casoDe(a) && !["aprovada", "descartada"].includes(a.status)).length;

  /* ── relatório do Alerte (tudo do dia selecionado; "todos" = mês em exibição) ── */
  const relRotulo = dia === "todos" ? `mês ${mesCal.slice(5, 7)}/${mesCal.slice(0, 4)}` : `dia ${fmtD(dia)}`;
  const relBase = alertes.filter(a => dia === "todos" ? (a.data ?? "").startsWith(mesCal) : a.data === dia).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || (a.cliente ?? "").localeCompare(b.cliente ?? ""));
  const relLinha = (a: Alerte) => { const p = a.proposta; const c = casoDe(a); return {
    data: a.data, processo: a.processo ?? "", cliente: a.cliente ?? c?.empresa_nome ?? "", tribunal: a.tribunal ?? "", tipo: classificarTipo(a), status: STATUS_ALERTE[a.status]?.l ?? a.status,
    destino: a.status === "descartada" ? "descartada" : p ? (p.destino === "pendencia" ? "pendência" : "NAF") : "—", titulo: p?.titulo ?? "", prazo: p?.prazo ?? "", responsavel: p?.responsavel ?? "",
    andamento: p?.texto_andamento ?? "", propostoPor: a.proposto_por ?? "", aprovadoPor: a.aprovado_por ?? "", aprovadoEm: a.aprovado_em ? fmtDT(a.aprovado_em) : "", caso: c?.titulo ?? "", obs: a.devolucao_obs ?? a.segurar_obs ?? p?.obs ?? "", teor: (a.resumo ?? a.teor ?? "").replace(/\s+/g, " ").trim(),
  }; };
  function relatorioExcel() {
    const ls = relBase.map(relLinha); if (!ls.length) { toast("Nada para exportar em " + relRotulo + ".", "erro"); return; }
    const conta = (f: (l: ReturnType<typeof relLinha>) => string) => { const m = new Map<string, number>(); ls.forEach(l => { const k = f(l) || "—"; m.set(k, (m.get(k) ?? 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const blob = criarXlsx([
      { nome: "Publicações", colunas: ["Data", "Processo", "Cliente", "Tribunal", "Tipo", "Status", "Destino", "Pendência", "Prazo fatal", "Responsável", "Andamento", "Proposto por", "Aprovado por", "Aprovado em", "Caso", "Obs", "Teor"], larguras: [11, 24, 26, 10, 14, 20, 12, 34, 11, 12, 50, 12, 12, 16, 30, 30, 80],
        linhas: ls.map(l => [{ d: l.data }, l.processo, l.cliente, l.tribunal, l.tipo, l.status, l.destino, l.titulo, l.prazo ? { d: l.prazo } : "", l.responsavel, l.andamento, l.propostoPor, l.aprovadoPor, l.aprovadoEm, l.caso, l.obs, l.teor] as Celula[]) },
      { nome: "Resumo", colunas: ["Por status", "Qtd", "", "Por responsável", "Qtd", "", "Por tipo", "Qtd"], larguras: [24, 8, 3, 24, 8, 3, 24, 8],
        linhas: (() => { const a = conta(l => l.status), b = conta(l => l.responsavel), c = conta(l => l.tipo); const n = Math.max(a.length, b.length, c.length); return Array.from({ length: n }, (_, i) => [a[i]?.[0] ?? "", a[i] ? { v: a[i][1], fmt: "int" } : "", "", b[i]?.[0] ?? "", b[i] ? { v: b[i][1], fmt: "int" } : "", "", c[i]?.[0] ?? "", c[i] ? { v: c[i][1], fmt: "int" } : ""] as Celula[]); })() },
    ]);
    baixarBlob(blob, `alerte_${dia === "todos" ? mesCal : dia}.xlsx`); toast(`Relatório do ${relRotulo}: ${ls.length} publicação(ões).`, "ok");
  }
  function relatorioImprimir() {
    const ls = relBase.map(relLinha); if (!ls.length) { toast("Nada para imprimir em " + relRotulo + ".", "erro"); return; }
    const esc = (v: string) => String(v ?? "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string));
    const porStatus = new Map<string, number>(); ls.forEach(l => porStatus.set(l.status, (porStatus.get(l.status) ?? 0) + 1));
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Publicações · ${esc(relRotulo)}</title>
<style>body{font-family:Inter,Segoe UI,Arial,sans-serif;font-size:11px;color:#111;margin:24px}h1{font-size:17px;margin:0 0 2px}.sub{color:#555;margin-bottom:12px}.res{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}.res span{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px}
.item{border:1px solid var(--text-muted);border-radius:6px;padding:8px 10px;margin-bottom:8px;page-break-inside:avoid}.top{display:flex;justify-content:space-between;gap:10px;font-weight:600}.tag{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;border:1px solid var(--text-muted);border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:600}.meta{color:#555;margin:2px 0 4px}.teor{color:#333;white-space:pre-wrap}.dest{margin-top:5px;padding-top:5px;border-top:1px dashed var(--text-muted)}
@media print{body{margin:10mm}button{display:none}}</style></head><body>
<button onclick="window.print()" style="float:right;padding:6px 12px">Imprimir / salvar PDF</button>
<h1>Relatório de publicações · ${esc(relRotulo)}</h1><div class="sub">Central PinheiroAdv · gerado em ${esc(fmtDT(new Date().toISOString()))} por ${esc(userName)} · ${ls.length} publicação(ões)</div>
<div class="res">${[...porStatus.entries()].map(([k, v]) => `<span><b>${v}</b> ${esc(k)}</span>`).join("")}</div>
${ls.map((l, i) => `<div class="item"><div class="top"><div>${i + 1}. ${esc(l.cliente || "(sem cliente)")} · ${esc(l.processo)}<span class="tag">${esc(l.tipo)}</span><span class="tag">${esc(l.status)}</span></div><div>${esc(fmtD(l.data))} · ${esc(l.tribunal)}</div></div>
<div class="meta">${l.caso ? "Caso: " + esc(l.caso) + " · " : ""}${l.propostoPor ? "proposto por " + esc(l.propostoPor) : ""}${l.aprovadoPor ? " · aprovado por " + esc(l.aprovadoPor) + " em " + esc(l.aprovadoEm) : ""}</div>
<div class="teor">${esc(l.teor)}</div>
${l.destino !== "—" ? `<div class="dest"><b>Destino:</b> ${esc(l.destino)}${l.titulo ? " — " + esc(l.titulo) : ""}${l.prazo ? " · fatal " + esc(fmtD(l.prazo)) : ""}${l.responsavel ? " · " + esc(l.responsavel) : ""}${l.andamento ? "<br><i>" + esc(l.andamento) + "</i>" : ""}${l.obs ? "<br>Obs: " + esc(l.obs) : ""}</div>` : ""}</div>`).join("")}
</body></html>`;
    const w = window.open("", "_blank"); if (!w) { toast("O navegador bloqueou a janela de impressão.", "erro"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
  const hoje = hojeIso(); const deHoje = ini.filter(a => a.data === hoje).length;

  async function evento(a: Alerte, acao: string, obs?: string | null) { await supabase.from("alerte_eventos").insert({ alerte_id: a.id, autor: eu, acao, obs: obs || null }); }
  async function devolver() {
    if (!devolvendo) return; if (devolvendo.obs.trim().length < 3) { toast("Diga o motivo da devolução.", "erro"); return; }
    setOcupado(true);
    const { error } = await supabase.from("alertes").update({ status: "devolvida", devolucao_obs: devolvendo.obs.trim() }).eq("id", devolvendo.a.id);
    if (error) { toast(error.message, "erro"); setOcupado(false); return; }
    await evento(devolvendo.a, `devolveu para ${devolvendo.a.proposto_por ?? "a equipe"}`, devolvendo.obs.trim());
    setOcupado(false); setDevolvendo(null); toast("Devolvida com seu comentário."); router.refresh();
  }
  async function aprovarDireto(a: Alerte) {
    if (!a.proposta) return; setOcupado(true);
    const { error } = await supabase.rpc("pa_alerte_aprovar", { p_id: a.id, p: a.proposta });
    setOcupado(false); if (error) { toast(error.message, "erro"); return; }
    toast(a.proposta.destino === "pendencia" ? "Aprovado: andamento e pendência criados no caso." : "Aprovado como NAF: andamento criado no caso."); router.refresh();
  }
  async function descartar(a: Alerte) {
    if (!confirm("Descartar esta publicação? Ela não entra em nenhum processo (ex.: publicação de outro escritório, duplicada).")) return;
    const { error } = await supabase.from("alertes").update({ status: "descartada" }).eq("id", a.id);
    if (error) { toast(error.message, "erro"); return; } await evento(a, "descartou"); router.refresh();
  }
  async function importar(f: File) {
    try {
      const j = JSON.parse(await f.text());
      // aceita o arquivo da rotina (alerte_in/alerte_AAAA-MM-DD.json: { id, data_ciencia, rows[{cliente,processo,tribunal,descricao,responsavel}] })
      // ou uma lista já no formato da Central ([{ source_id, data, cliente, tribunal, processo, tipo, teor, url, docx }])
      let itens: any[] = Array.isArray(j) ? j : (j.itens ?? j.publicacoes ?? []);
      if (!itens.length && Array.isArray(j.rows)) {
        const dataC = j.data_ciencia ?? (String(j.id ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0]) ?? hojeIso();
        itens = j.rows.map((r: any, i: number) => {
          const teor = String(r.descricao ?? r.teor ?? "").trim();
          const url = teor.match(/Link:\s*(https?:\/\/\S+)/i)?.[1] ?? teor.match(/(https?:\/\/\S+)/)?.[1] ?? null;
          const disp = teor.match(/disponibiliza[çc][ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
          const tipoM = teor.match(/Tipo de documento:\s*([^\n]+?)\s+(?:Classe|Meio|Link|$)/i);
          return { source_id: `${j.id ?? "alerte_" + dataC}#${i}`, data: disp ? `${disp[3]}-${disp[2]}-${disp[1]}` : dataC, cliente: r.cliente, tribunal: r.tribunal, processo: r.processo, teor, tipo: tipoM?.[1]?.trim() || null, url, responsavel: r.responsavel ?? null, intimacao: r.intimacao ?? null, arquivo: j.id ?? null };
        });
      }
      if (!itens.length) { toast("Arquivo sem publicações.", "erro"); return; }
      setOcupado(true); const { data, error } = await supabase.rpc("pa_alertes_importar", { p_itens: itens }); setOcupado(false);
      if (error) { toast(error.message, "erro"); return; }
      toast(`Importado: ${(data as any)?.novos ?? 0} nova(s) · ${(data as any)?.repetidos ?? 0} repetida(s).`); router.refresh();
    } catch (e: any) { setOcupado(false); toast("Não consegui ler o arquivo: " + (e?.message ?? e), "erro"); }
  }

  // ---- UI ----
  const btn = "px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap disabled:opacity-50";
  const st = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const Tag = ({ t, cls }: { t: string; cls: "gray" | "blue" | "amber" | "red" | "green" | "purple" }) => { const m = { gray: ["var(--bg-page)", "var(--text-muted)"], blue: ["var(--tag-blue-bg)", "var(--tag-blue-fg)"], amber: ["var(--tag-amber-bg)", "var(--tag-amber-fg)"], red: ["var(--tag-red-bg)", "var(--tag-red-fg)"], green: ["var(--tag-green-bg)", "var(--tag-green-fg)"], purple: ["var(--destaque-tint)", "var(--destaque)"] }[cls]; return <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide whitespace-nowrap" style={{ background: m[0], color: m[1] }}>{t}</span>; };
  const Kpi = ({ v, l, c }: { v: string | number; l: string; c?: string }) => <div className="rounded-lg border px-3.5 py-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-[20px] font-bold leading-tight" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
  const tab = (k: Aba, label: string, n?: number, cor?: string) => <button key={k} type="button" onClick={() => setAba(k)} className="px-3 py-2 text-[12.5px] -mb-px border-b-2 whitespace-nowrap inline-flex items-center gap-1.5" style={{ color: aba === k ? "var(--acao)" : "var(--text-secondary)", borderColor: aba === k ? "var(--acao)" : "transparent", fontWeight: aba === k ? 600 : 500 }}>{label}{n ? <span className="text-[10px] font-bold px-1.5 rounded-full text-on-acao" style={{ background: cor ?? "var(--atencao)" }}>{n}</span> : null}</button>;

  const CelCaso = ({ a }: { a: Alerte }) => { const c = casoDe(a); return (
    <div className="min-w-0">
      <div className="font-semibold uppercase tracking-wide text-[12px] break-words" style={{ color: "var(--text-primary)" }}>{c?.empresa_nome || a.cliente || "—"}</div>
      <div className="font-mono text-[11px]" style={{ color: "var(--acao-claro)" }}>{a.processo ?? "sem número"}</div>
      <div className="text-[10.5px] break-words" style={{ color: "var(--text-muted)" }}>{a.tribunal ?? "—"}{c ? <> · <Link href={`/casos/${c.id}`} onClick={e => e.stopPropagation()} style={{ color: "var(--ok)" }}>✓ {c.titulo}</Link>{c.advogado ? ` · ${primeiroNome(c.advogado)}` : ""}</> : <span style={{ color: "var(--alerta)" }}> · ✗ processo não cadastrado</span>}</div>
    </div>); };
  const CelPub = ({ a }: { a: Alerte }) => <div className="min-w-0"><Tag t={classificarTipo(a)} cls="blue" />{a.prazo_expresso || lerPrazoDoTeor(a.teor) ? <span className="ml-1.5"><Tag t={`${a.prazo_expresso ?? lerPrazoDoTeor(a.teor)} dias no teor`} cls="amber" /></span> : null}<div className="text-[11px] mt-1 break-words" style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={a.teor ?? ""}>{a.teor ?? "—"}</div><div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>publicado {fmtD(a.data)}{a.docx_url && <> · <a href={a.docx_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: "var(--acao)" }}>DOCX</a></>}{a.url_documento && <> · <a href={a.url_documento} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: "var(--acao)" }}>fonte</a></>}</div></div>;
  const Tabela = ({ rows, cols, cell }: { rows: Alerte[]; cols: [string, string][]; cell: (a: Alerte) => ReactNode[] }) => (
    <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><table className="w-full text-[12.5px] table-fixed min-w-[860px]">
      <colgroup>{cols.map(([, w], i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr style={{ background: "var(--bg-page)" }}>{cols.map(([h], i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{h}</th>)}</tr></thead>
      <tbody>{rows.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Nada aqui. ✓</td></tr>}
        {rows.map(a => <tr key={a.id} className="border-b last:border-b-0 hover:brightness-110 align-top" style={{ borderColor: "var(--border)" }}>{cell(a).map((c, i) => <td key={i} className="px-3 py-2.5 break-words">{c}</td>)}</tr>)}</tbody></table></div>
  );

  return (
    <div>
      {aviso && <div className="fixed top-3 right-3 z-[60] px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg text-on-acao" style={{ background: aviso.tom === "ok" ? "var(--ok)" : "var(--alerta)" }}>{aviso.t}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <Kpi v={fila.length} l="sem destinação" c={fila.length ? "var(--atencao)" : undefined} />
        <Kpi v={propostas.length} l={coordenador ? "aguardando sua aprovação" : "aguardando aprovação"} c={coordenador && propostas.length ? "var(--acao)" : undefined} />
        <Kpi v={semCaso} l="processo não encontrado" c={semCaso ? "var(--alerta)" : undefined} />
        <Kpi v={deHoje} l={`publicações hoje · ${fmtD(hoje)}`} />
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tab("fila", "Para destinar", fila.length)}{tab("aprovacao", coordenador ? "Aprovar" : "Aguardando aprovação", propostas.length, "var(--acao)")}{tab("historico", "Histórico")}
        <div className="ml-auto flex items-center gap-1.5 mb-1 flex-wrap">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="cliente, processo, teor…" className="px-2.5 py-1.5 rounded text-[11.5px] border w-[220px]" style={st} />
          <CalendarioDias dia={dia} setDia={setDia} dias={dias} hoje={hoje} aberto={calAberto} setAberto={setCalAberto} mes={mesCal} setMes={setMesCal} totais={totaisPorDia} pendentes={pendPorDia} st={st} />
          {coordenador && <><button type="button" disabled={ocupado} onClick={() => fileRef.current?.click()} className={btn} style={st} title="Arquivo _alertes_import.json gerado pela rotina">⇪ Importar arquivo</button><input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.currentTarget.value = ""; }} /></>}
        </div>
      </div>

      {aba === "fila" && <div className="mt-3">
        <Tabela rows={fila} cols={[["Cliente · processo", "24%"], ["Publicação", "40%"], ["Situação", "16%"], ["", "20%"]]} cell={a => [
          <CelCaso a={a} />, <CelPub a={a} />,
          <div><Tag t={STATUS_ALERTE[a.status].l} cls={STATUS_ALERTE[a.status].cls} />{a.status === "devolvida" && a.devolucao_obs && <div className="text-[10.5px] mt-1 px-2 py-1 rounded-sm" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{a.aprovado_por ?? "Coordenação"}:</b> {a.devolucao_obs}</div>}{a.status === "segurando" && <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>{a.segurar_para ? `para ${a.segurar_para}` : ""}{a.segurar_obs ? ` · ${a.segurar_obs}` : ""}</div>}{a.proposto_por && a.status === "devolvida" && <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>proposta de {a.proposto_por}</div>}</div>,
          <div className="flex flex-wrap gap-1.5 justify-end"><button onClick={() => setDr({ a, modo: "destinar" })} className={btn + " text-on-acao"} style={{ background: "var(--acao)", borderColor: "var(--acao)" }}>{casoDe(a) ? "Dar destinação" : "Vincular e destinar"}</button>{coordenador && <button onClick={() => descartar(a)} className={btn} style={{ ...st, color: "var(--text-muted)" }} title="Não é nossa / duplicada">✕</button>}</div>,
        ]} />
        <div className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>{coordenador ? "Você vê todas as publicações. " : "Você vê as publicações dos seus casos. "}Ordem: devolvidas primeiro, depois menor prazo expresso no teor. Nada entra no processo antes da aprovação da coordenação — inclusive NAF.</div>
      </div>}

      {aba === "aprovacao" && <div className="mt-3">
        <Tabela rows={propostas} cols={[["Publicação", "26%"], ["Destinação proposta", "34%"], ["Prazo", "16%"], ["", "24%"]]} cell={a => { const p = a.proposta!; const c = casoDe(a); return [
          <div><CelCaso a={a} /><div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}><Tag t={classificarTipo(a)} cls="blue" /> · por <b style={{ color: "var(--text-secondary)" }}>{a.proposto_por}</b> · {fmtDT(a.proposto_em)}</div></div>,
          <div>{p.destino === "pendencia" ? <><Tag t="Pendência" cls="blue" /><div className="mt-1 font-semibold" style={{ color: "var(--text-primary)" }}>{p.titulo}</div><div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{p.providencia_nome}{p.providencia_nome ? " · " : ""}{TIPOS_PEND.find(t => t[0] === p.tipo_pend)?.[1] ?? p.tipo_pend} · resp. {p.responsavel ?? c?.advogado ?? "—"} · rev. <NomeRev n={p.revisor ?? "Marcelle"} /></div></> : <><Tag t="NAF · nada a fazer" cls="purple" /></>}
            <div className="text-[11px] mt-1.5 px-2 py-1 rounded-sm" style={{ border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><i>{p.texto_andamento}</i></div>
            {p.obs && <div className="text-[10.5px] mt-1 italic" style={{ color: "var(--text-muted)" }}>"{p.obs}"</div>}</div>,
          <div>{p.destino === "pendencia" && p.prazo ? <><Tag t={`fatal ${fmtD(p.prazo)}`} cls={(new Date(p.prazo + "T12:00:00").getTime() - Date.now()) / 864e5 <= 3 ? "red" : "amber"} /><div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>interno {fmtD(p.prazo_interno)}{p.dias ? ` · ${p.dias} d. ${p.contagem === "corridos" ? "corridos" : "úteis"}` : ""}</div></> : <span style={{ color: "var(--text-muted)" }}>—</span>}</div>,
          <div className="flex flex-wrap gap-1.5 justify-end">{coordenador ? <>
            <button disabled={ocupado} onClick={() => setDevolvendo({ a, obs: "" })} className={btn} style={{ ...st, color: "var(--atencao)", borderColor: "var(--atencao)" }}>↩ Devolver</button>
            <button disabled={ocupado} onClick={() => setDr({ a, modo: "aprovar" })} className={btn} style={st}>✎ Ajustar</button>
            <button disabled={ocupado} onClick={() => aprovarDireto(a)} className={btn + " text-on-acao"} style={{ background: "var(--ok)", borderColor: "var(--ok)" }}>{p.destino === "naf" ? "✓ Aprovar NAF" : "✓ Aprovar"}</button>
          </> : <><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>aguardando <NomeRev n="Marcelle" /></span>{(meu(a) || a.proposto_por === eu) && <button disabled={ocupado} onClick={() => setDr({ a, modo: "destinar" })} className={btn} style={st} title="Errou algo? Reabre a destinação já preenchida; ao enviar, substitui a anterior na fila de aprovação.">✎ Corrigir destinação</button>}</>}</div>,
        ]; }} />
        {coordenador && <div className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}><b>Aprovar</b> grava no caso o andamento (fonte "publicação") e, se for pendência, a pendência com prazo fatal e interno. <b>Ajustar</b> abre tudo editável antes de aprovar. <b>Devolver</b> manda de volta para quem propôs, com seu comentário.</div>}
      </div>}

      {aba === "historico" && <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Relatório de publicações · {relRotulo} · {relBase.length} publicação(ões), todos os status{dia === "todos" ? " · escolha um dia no calendário para o relatório diário" : ""}</div>
          <div className="flex gap-1.5"><button onClick={relatorioExcel} className="px-2.5 py-1 rounded text-[10.5px] font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Excel</button><button onClick={relatorioImprimir} className="px-2.5 py-1 rounded text-[10.5px] font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Imprimir / PDF</button></div>
        </div>
        <Tabela rows={historico} cols={[["Publicação", "28%"], ["Destinação", "40%"], ["Quem", "18%"], ["", "14%"]]} cell={a => { const p = a.proposta; const c = casoDe(a); return [
          <div><CelCaso a={a} /><div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}><Tag t={classificarTipo(a)} cls="blue" /> · publicado {fmtD(a.data)}</div></div>,
          <div>{a.status === "descartada" ? <Tag t="descartada" cls="gray" /> : p ? <>{p.destino === "pendencia" ? <><Tag t="Pendência" cls="blue" /> <b>{p.titulo}</b>{p.prazo ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}> · fatal {fmtD(p.prazo)}</span> : null}</> : <Tag t="NAF" cls="purple" />}<div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}><i>{p.texto_andamento}</i></div></> : "—"}</div>,
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{a.proposto_por && <div>proposto por {a.proposto_por}</div>}{a.aprovado_por && <div>aprovado por <NomeRev n={a.aprovado_por} /> · {fmtDT(a.aprovado_em)}</div>}</div>,
          <div className="text-right">{c && <Link href={`/casos/${c.id}`} className={btn} style={st}>Abrir caso</Link>}</div>,
        ]; }} />
        <div className="text-[10px] font-bold uppercase tracking-widest mt-5 mb-2" style={{ color: "var(--text-muted)" }}>Atividade recente</div>
        <div className="rounded-md border px-3.5 py-1" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>{eventos.length === 0 ? <div className="py-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Sem atividade.</div> : eventos.map(e => <div key={e.id} className="py-2 border-b last:border-b-0 text-xs flex gap-2" style={{ borderColor: "var(--border)" }}><span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: /aprovou/.test(e.acao) ? "var(--ok)" : /devolveu|descartou/.test(e.acao) ? "var(--alerta)" : /segur/.test(e.acao) ? "var(--atencao)" : "var(--acao)" }} /><div><b>{e.autor}</b> {e.acao}{e.obs && <span style={{ color: "var(--text-secondary)" }}> — {e.obs}</span>}<div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{fmtDT(e.criado_em)}</div></div></div>)}</div>
      </div>}

      {dr && <DestinarDrawer key={dr.a.id + dr.modo} a={dr.a} modo={dr.modo} caso={casoDe(dr.a)} casos={casos} providencias={providencias} eu={eu} coordenador={coordenador} supabase={supabase} onClose={() => setDr(null)} onDone={(msg) => { setDr(null); toast(msg); router.refresh(); }} onErro={m => toast(m, "erro")} />}

      {devolvendo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} onClick={() => setDevolvendo(null)}>
          <div className="rounded-lg border p-4 w-full max-w-[460px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Devolver para {devolvendo.a.proposto_por ?? "a equipe"}</div>
            <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{devolvendo.a.cliente} · {devolvendo.a.processo}</div>
            <textarea className="w-full px-2.5 py-2 rounded text-[12.5px] border outline-none min-h-[80px]" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }} placeholder="o que precisa mudar (a pessoa vai ver)" value={devolvendo.obs} onChange={e => setDevolvendo({ ...devolvendo, obs: e.target.value })} autoFocus />
            <div className="flex gap-1.5 mt-3"><button type="button" disabled={ocupado} onClick={devolver} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold border" style={{ borderColor: "var(--atencao)", color: "var(--atencao)", background: "var(--bg-surface)" }}>↩ Devolver</button><button type="button" onClick={() => setDevolvendo(null)} className={btn} style={st}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Seletor de dia em calendário ───────── */
function CalendarioDias({ dia, setDia, dias, hoje, aberto, setAberto, mes, setMes, totais, pendentes, st }: { dia: string; setDia: (v: string) => void; dias: string[]; hoje: string; aberto: boolean; setAberto: (v: boolean) => void; mes: string; setMes: (v: string) => void; totais: Map<string, number>; pendentes: Map<string, number>; st: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [aberto, setAberto]);
  const [ano, mm] = mes.split("-").map(Number);
  const primeiro = new Date(ano, mm - 1, 1);
  const diasNoMes = new Date(ano, mm, 0).getDate();
  const inicio = primeiro.getDay(); // 0=dom
  const cells: (string | null)[] = [];
  for (let i = 0; i < inicio; i++) cells.push(null);
  for (let d = 1; d <= diasNoMes; d++) cells.push(`${mes}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const nomeMes = new Date(ano, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const label = dia === "todos" ? "Todos os dias" : dia === hoje ? `Hoje · ${fmtD(dia)}` : fmtD(dia);
  function nav(delta: number) { const d = new Date(ano, mm - 1 + delta, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  const dow = ["D", "S", "T", "Q", "Q", "S", "S"];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(!aberto)} className="px-3 py-1.5 rounded text-[11.5px] border inline-flex items-center gap-1.5" style={st}><span>{label}</span><span style={{ color: "var(--text-muted)" }}>▾</span></button>
      {aberto && (
        <div className="absolute right-0 mt-1.5 z-30 rounded-lg border shadow-2xl p-3 w-[268px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => nav(-1)} className="w-7 h-7 rounded hover:brightness-125" style={{ color: "var(--text-secondary)" }}>◀</button>
            <div className="text-[12px] font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{nomeMes}</div>
            <button type="button" onClick={() => nav(1)} className="w-7 h-7 rounded hover:brightness-125" style={{ color: "var(--text-secondary)" }}>▶</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold mb-1" style={{ color: "var(--text-muted)" }}>{dow.map((d, i) => <div key={i}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-0.5">{cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const n = totais.get(c) ?? 0; const pend = pendentes.get(c) ?? 0;
            const isHoje = c === hoje; const isSel = c === dia; const temAlerte = n > 0;
            return <button key={i} type="button" disabled={!temAlerte} title={temAlerte ? `${n} publicação(ões)${pend ? ` · ${pend} pendente(s)` : " · tudo resolvido"}` : undefined} onClick={() => { setDia(c); setAberto(false); }} className="h-8 rounded text-[11px] font-medium relative disabled:cursor-not-allowed" style={{
              background: isSel ? "var(--acao)" : temAlerte ? "var(--bg-page)" : "transparent",
              color: isSel ? "var(--on-acao)" : temAlerte ? "var(--text-primary)" : "var(--text-muted)",
              border: isHoje && !isSel ? "1px solid var(--acao)" : "1px solid transparent",
              opacity: temAlerte ? 1 : 0.4,
            }}>{Number(c.slice(-2))}{pend > 0 && <span title={`${pend} a destinar/aprovar`} className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1 rounded-full" style={{ background: isSel ? "rgba(255,255,255,.3)" : "var(--atencao)", color: "var(--on-acao)", lineHeight: "12px" }}>{pend}</span>}</button>;
          })}</div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={() => { setDia("todos"); setAberto(false); }} className="text-[11px]" style={{ color: dia === "todos" ? "var(--acao)" : "var(--text-secondary)" }}>Todos os dias</button>
            <button type="button" onClick={() => { setDia(hoje); setMes(hoje.slice(0, 7)); setAberto(false); }} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Ir para hoje</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Drawer: destinar (equipe) / ajustar e aprovar (coordenação) ───────── */
function DestinarDrawer({ a, modo, caso: casoIni, casos, providencias, eu, coordenador, supabase, onClose, onDone, onErro }: { a: Alerte; modo: "destinar" | "aprovar"; caso: CasoMin | null; casos: CasoMin[]; providencias: Providencia[]; eu: string; coordenador: boolean; supabase: ReturnType<typeof createClient>; onClose: () => void; onDone: (msg: string) => void; onErro: (m: string) => void }) {
  const p0 = a.proposta;
  const [caso, setCaso] = useState<CasoMin | null>(casoIni);
  const [buscaCaso, setBuscaCaso] = useState("");
  const [destino, setDestino] = useState<"pendencia" | "naf" | "segurar">(p0?.destino ?? "pendencia");
  const [provId, setProvId] = useState<string>(p0?.providencia_id ?? "");
  const prov = providencias.find(x => x.id === provId) ?? null;
  const prazoTeor = a.prazo_expresso ?? lerPrazoDoTeor(a.teor);
  const [dias, setDias] = useState<string>(p0?.dias != null ? String(p0.dias) : "");
  const [contagem, setContagem] = useState<"uteis" | "corridos">(p0?.contagem ?? "uteis");
  const [tribunal, setTribunal] = useState<string>(p0?.tribunal ?? tribunalDe(a.tribunal, a.processo, caso?.orgao, caso?.dados?.tribunal));
  const [djen, setDjen] = useState<boolean>(p0 ? !!(p0 as any).djen : /pje|djen|comunica/i.test(`${a.url_documento ?? ""} ${JSON.stringify(a.metadata ?? {})}`));
  const [prazo, setPrazo] = useState<string>(p0?.prazo ?? "");
  const [interno, setInterno] = useState<string>(p0?.prazo_interno ?? "");
  const [calcInfo, setCalcInfo] = useState<string>("");
  const [titulo, setTitulo] = useState<string>(p0?.titulo ?? "");
  const [tipoPend, setTipoPend] = useState<string>(p0?.tipo_pend ?? "peca");
  const [responsavel, setResponsavel] = useState<string>(p0?.responsavel ?? primeiroNome(caso?.advogado) ?? "");
  const [revisor, setRevisor] = useState<string>(p0?.revisor ?? "Marcelle");
  const sugestao = useMemo(() => sugerirTextoAndamento(a), [a]);
  const [texto, setTexto] = useState<string>(p0?.texto_andamento ?? sugestao);
  const [dataAnd, setDataAnd] = useState<string>(p0?.data_andamento ?? a.data);
  const [obs, setObs] = useState<string>(p0?.obs ?? "");
  const [obsApr, setObsApr] = useState("");
  const [segurarPara, setSegurarPara] = useState<string>(a.segurar_para ?? "Marcelle");
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState<AlerteEvento[]>([]);
  useEffect(() => { supabase.from("alerte_eventos").select("*").eq("alerte_id", a.id).order("criado_em", { ascending: true }).then(({ data }) => setHistorico((data ?? []) as AlerteEvento[])); }, [a.id, supabase]);
  useEffect(() => { if (!responsavel && caso?.advogado) setResponsavel(primeiroNome(caso.advogado)); }, [caso, responsavel]);

  function escolherProv(id: string) {
    setProvId(id); const pr = providencias.find(x => x.id === id); if (!pr) return;
    const d = pr.ler_prazo_do_teor && prazoTeor ? prazoTeor : pr.dias;
    setDias(d != null ? String(d) : ""); setContagem(pr.contagem); setTipoPend(pr.tipo_pend);
    if (!titulo || providencias.some(x => x.titulo_padrao === titulo)) setTitulo(pr.titulo_padrao ?? pr.nome);
  }
  async function calcular(diasN = Number(dias)) {
    if (!diasN || diasN <= 0) { setCalcInfo("Informe os dias."); return; }
    const adm = ["SEFAZ-RJ", "PGFN", "CARF"].includes(tribunal);
    const regra = contagem === "corridos" ? (adm ? "paf" : "corridos") : "cpc";
    const { data, error } = await supabase.rpc("pa_prazo", { evento: a.data, dias: diasN, regra, tribunal, incluir_municipais: !adm, djen: djen && !adm });
    if (error || !data?.final) { setCalcInfo("Não consegui calcular: " + (error?.message ?? "sem resultado")); return; }
    setPrazo(data.final);
    const { data: d4 } = await supabase.rpc("pa_sub_uteis", { d: data.final, n: 4, tribunal });
    setInterno((d4 as string) ?? "");
    setCalcInfo(`${fmtD(a.data)} ${djen && !adm ? "(DJEN) " : ""}+ ${diasN} dias ${contagem === "corridos" ? "corridos" : "úteis"} · ${TRIB_OPTS.find(t => t[0] === tribunal)?.[1] ?? tribunal}${data.pendentes?.length ? ` · ${data.pendentes.length} feriado(s) pendente(s) de confirmação` : ""}`);
  }
  useEffect(() => { if (destino === "pendencia" && dias && !p0?.prazo) calcular(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dias, contagem, tribunal, djen]);

  async function vincular(c: CasoMin) {
    const { error } = await supabase.from("alertes").update({ caso_id: c.id, empresa_id: c.empresa_id }).eq("id", a.id);
    if (error) { onErro(error.message); return; }
    await supabase.from("alerte_eventos").insert({ alerte_id: a.id, autor: eu, acao: `vinculou ao caso "${c.titulo}"` });
    setCaso(c); if (!responsavel) setResponsavel(primeiroNome(c.advogado)); setTribunal(tribunalDe(a.tribunal, a.processo, c.orgao, c.dados?.tribunal));
  }
  function montar(): Proposta {
    return { destino: destino === "naf" ? "naf" : "pendencia", texto_andamento: texto.trim(), data_andamento: dataAnd || a.data, providencia_id: provId || null, providencia_nome: prov?.nome ?? null, titulo: titulo.trim() || prov?.titulo_padrao || "Providência sobre publicação", tipo_pend: tipoPend, dias: dias ? Number(dias) : null, contagem, prazo: prazo || null, prazo_interno: interno || null, tribunal, responsavel: responsavel || null, revisor: revisor || "Marcelle", obs: obs.trim(), ...( { djen } as any) };
  }
  function valida(): string | null {
    if (!caso) return "Vincule a publicação a um caso antes.";
    if (texto.trim().length < 10) return "Escreva o texto do andamento.";
    if (destino === "pendencia") { if (!titulo.trim() && !prov) return "Escolha a providência."; if (!prazo) return "Calcule ou informe o prazo fatal."; if (!responsavel) return "Escolha o responsável."; }
    return null;
  }
  async function enviar() {
    if (destino === "segurar") {
      setSaving(true); const { error } = await supabase.from("alertes").update({ status: "segurando", segurar_obs: obs.trim() || null, segurar_para: segurarPara }).eq("id", a.id); setSaving(false);
      if (error) { onErro(error.message); return; } await supabase.from("alerte_eventos").insert({ alerte_id: a.id, autor: eu, acao: `segurou · pediu ajuda de ${segurarPara}`, obs: obs.trim() || null }); onDone(`Marcado para ${segurarPara} olhar.`); return;
    }
    const e = valida(); if (e) { onErro(e); return; }
    setSaving(true); const prop = montar();
    const { error } = await supabase.from("alertes").update({ status: "proposta", proposta: prop, proposto_por: eu, proposto_em: new Date().toISOString(), devolucao_obs: null, segurar_obs: null, segurar_para: null }).eq("id", a.id); setSaving(false);
    if (error) { onErro(error.message); return; }
    const corrigindo = a.status === "proposta" && !!p0;
    await supabase.from("alerte_eventos").insert({ alerte_id: a.id, autor: eu, acao: (corrigindo ? "corrigiu a destinação → " : "") + (prop.destino === "pendencia" ? `propôs pendência "${prop.titulo}"${prop.prazo ? ` · fatal ${fmtD(prop.prazo)}` : ""}` : "propôs NAF (nada a fazer)"), obs: prop.obs || null });
    onDone(corrigindo ? "Destinação corrigida. Continua na fila de aprovação com a nova versão." : "Enviado para aprovação. A coordenação é avisada na hora.");
  }
  async function aprovar() {
    if (destino === "segurar") { onErro("Escolha pendência ou NAF para aprovar."); return; }
    const e = valida(); if (e) { onErro(e); return; }
    setSaving(true); const prop = montar(); const ajustado = !!p0 && JSON.stringify({ ...p0, obs_aprovacao: undefined, ajustado: undefined }) !== JSON.stringify({ ...prop, obs_aprovacao: undefined, ajustado: undefined });
    if (!p0) { await supabase.from("alertes").update({ proposto_por: a.proposto_por ?? eu, proposto_em: a.proposto_em ?? new Date().toISOString() }).eq("id", a.id); }
    const { error } = await supabase.rpc("pa_alerte_aprovar", { p_id: a.id, p: { ...prop, ajustado, obs_aprovacao: obsApr.trim() } }); setSaving(false);
    if (error) { onErro(error.message); return; }
    onDone(prop.destino === "pendencia" ? "Aprovado: andamento e pendência criados no caso." : "Aprovado como NAF: andamento criado no caso.");
  }

  const inp = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
  const ist = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const lbl = "block text-[10px] font-bold uppercase tracking-wider mb-1";
  const H = ({ t }: { t: string }) => <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{t}</div>;
  const nb = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const candidatos = buscaCaso.trim().length >= 2 ? casos.filter(c => nb(`${c.titulo} ${c.numero ?? ""} ${c.empresa_nome ?? ""}`).includes(nb(buscaCaso))).slice(0, 8) : [];
  const Opt = ({ k, ic, t, d }: { k: "pendencia" | "naf" | "segurar"; ic: string; t: string; d: string }) => <button type="button" onClick={() => setDestino(k)} className="text-left rounded-lg border px-3 py-2.5" style={{ borderColor: destino === k ? "var(--acao)" : "var(--border)", background: destino === k ? "var(--acao-tint)" : "var(--bg-surface)", boxShadow: destino === k ? "0 0 0 1px var(--acao) inset" : "none" }}><div className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{ic} {t}</div><div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{d}</div></button>;

  return (<>
    <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
    <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[720px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}><div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{modo === "aprovar" ? "Ajustar e aprovar" : "Destinar publicação"} · {caso?.empresa_nome || a.cliente || "—"}</h2><div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{classificarTipo(a)} · {a.tribunal ?? "—"} · publicado em {fmtD(a.data)}{a.proposto_por ? ` · proposta de ${a.proposto_por}` : ""}</div></div><button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button></div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {a.status === "devolvida" && a.devolucao_obs && <div className="mb-3 px-3 py-2 rounded-sm text-[11.5px]" style={{ border: "1px solid var(--alerta)", background: "var(--bg-page)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{a.aprovado_por ?? "Coordenação"} devolveu:</b> {a.devolucao_obs}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border px-3.5 py-3" style={{ background: "var(--bg-page)", borderColor: "var(--border)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Publicação (alerte)</div>
            <div className="grid gap-y-1 text-[12px]" style={{ gridTemplateColumns: "88px 1fr" }}>
              <div style={{ color: "var(--text-muted)" }}>Processo</div><div className="font-mono text-[11px]" style={{ color: "var(--acao-claro)" }}>{a.processo ?? "—"}</div>
              <div style={{ color: "var(--text-muted)" }}>Tribunal</div><div>{a.tribunal ?? "—"}</div>
              <div style={{ color: "var(--text-muted)" }}>Tipo</div><div>{classificarTipo(a)}{prazoTeor ? <span className="ml-1.5 text-[10.5px] font-semibold" style={{ color: "var(--atencao)" }}>· {prazoTeor} dias no teor</span> : null}</div>
              <div style={{ color: "var(--text-muted)" }}>Fonte</div><div className="text-[11.5px]">{a.docx_url && <a href={a.docx_url} target="_blank" rel="noreferrer" style={{ color: "var(--acao)" }}>DOCX</a>}{a.docx_url && a.url_documento ? " · " : ""}{a.url_documento && <a href={a.url_documento} target="_blank" rel="noreferrer" style={{ color: "var(--acao)" }}>{/comunica\.pje/.test(a.url_documento) ? "DJEN" : "publicação"}</a>}{!a.docx_url && !a.url_documento && "—"}</div>
            </div>
            <div className="text-[12px] mt-2 px-2.5 py-2 rounded-sm max-h-[220px] overflow-y-auto" style={{ border: "1px solid var(--acao)", background: "var(--acao-tint)", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{a.teor ?? "—"}</div>
          </div>
          <div className="rounded-lg border px-3.5 py-3" style={{ background: "var(--bg-page)", borderColor: caso ? "var(--border)" : "var(--alerta)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Processo na Central</div>
            {caso ? <>
              <div className="grid gap-y-1 text-[12px]" style={{ gridTemplateColumns: "88px 1fr" }}>
                <div style={{ color: "var(--text-muted)" }}>Caso</div><div><b>{caso.titulo}</b> <span style={{ color: "var(--ok)" }}>✓</span></div>
                <div style={{ color: "var(--text-muted)" }}>Número</div><div className="font-mono text-[11px]">{caso.numero ?? "—"} {numNorm(caso.numero) && numNorm(caso.numero) === a.numero_norm ? <span style={{ color: "var(--ok)" }}>✓ bate</span> : <span style={{ color: "var(--atencao)" }}>≠ confira</span>}</div>
                <div style={{ color: "var(--text-muted)" }}>Órgão</div><div>{[caso.dados?.tribunal, caso.orgao].filter(Boolean).join(" · ") || "—"}</div>
                <div style={{ color: "var(--text-muted)" }}>Advogado</div><div>{caso.advogado ?? "—"}</div>
                <div style={{ color: "var(--text-muted)" }}>Situação</div><div>{caso.situacao ?? "—"}{caso.ativo === false ? " · arquivado" : ""}</div>
              </div>
              <div className="text-[11px] mt-2 flex flex-wrap gap-1.5 items-center" style={{ color: "var(--text-muted)" }}><Link href={`/casos/${caso.id}`} className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>Abrir caso ↗</Link><button type="button" onClick={() => setCaso(null)} className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)" }}>Vincular a outro caso</button><span>Confira o cadastro antes de destinar.</span></div>
            </> : <>
              <div className="text-[12px] mb-2" style={{ color: "var(--alerta)" }}>✗ Nenhum caso com o número <span className="font-mono">{a.processo ?? "—"}</span>. Procure o caso certo ou cadastre-o.</div>
              <input className={inp} style={ist} placeholder="buscar caso por número, título ou cliente…" value={buscaCaso} onChange={e => setBuscaCaso(e.target.value)} autoFocus />
              {candidatos.length > 0 && <div className="mt-1.5 rounded border max-h-[200px] overflow-y-auto" style={{ borderColor: "var(--border)" }}>{candidatos.map(c => <button key={c.id} type="button" onClick={() => vincular(c)} className="block w-full text-left px-2.5 py-1.5 border-b last:border-b-0 text-[12px] hover:brightness-125" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}><b>{c.empresa_nome}</b> · {c.titulo}<div className="font-mono text-[10.5px]" style={{ color: "var(--acao-claro)" }}>{c.numero ?? "sem número"} · {c.advogado ?? "—"}</div></button>)}</div>}
              <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>Ainda não existe? <Link href="/areas/contencioso" style={{ color: "var(--acao)" }}>+ Cadastrar o processo</Link> e volte aqui.</div>
            </>}
          </div>
        </div>

        <H t="Destinação" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Opt k="pendencia" ic="" t="Gerar pendência" d="Andamento + pendência com prazo. Passa pela coordenação." />
          <Opt k="naf" ic="" t="NAF · nada a fazer" d="Só o andamento. Também passa pela coordenação." />
          {modo === "destinar" && <Opt k="segurar" ic="" t="Segurar / pedir ajuda" d="Não dá para decidir agora. Fica marcado para um coordenador." />}
        </div>

        {destino === "pendencia" && <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 mt-3">
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Providência <span className="font-normal normal-case">(define o prazo)</span></label><select className={inp} style={ist} value={provId} onChange={e => escolherProv(e.target.value)}><option value="">— escolher —</option>{providencias.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}{p.dias ? ` · ${p.dias} d.${p.contagem === "corridos" ? " corridos" : ""}` : p.ler_prazo_do_teor ? " · prazo do teor" : ""}</option>)}</select></div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Título da pendência</label><input className={inp} style={ist} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="ex.: Embargos de declaração" /></div>
            <div className="grid grid-cols-[72px_1fr_1fr] gap-2">
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Dias</label><input inputMode="numeric" className={inp} style={ist} value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ""))} /></div>
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Contagem</label><select className={inp} style={ist} value={contagem} onChange={e => setContagem(e.target.value as any)}><option value="uteis">dias úteis</option><option value="corridos">corridos</option></select></div>
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Tribunal</label><select className={inp} style={ist} value={tribunal} onChange={e => setTribunal(e.target.value)}>{TRIB_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            </div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Tipo</label><select className={inp} style={ist} value={tipoPend} onChange={e => setTipoPend(e.target.value)}>{TIPOS_PEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Prazo fatal <span className="font-normal normal-case">(calculado da publicação)</span></label><div className="flex gap-1.5"><input type="date" className={inp} style={ist} value={prazo} onChange={e => { setPrazo(e.target.value); setCalcInfo("prazo informado manualmente"); }} /><button type="button" onClick={() => calcular()} className="px-2.5 rounded border text-[14px] shrink-0" style={{ background: "var(--bg-page)", borderColor: "var(--border)" }} title="Recalcular"></button></div><label className="inline-flex items-center gap-1.5 text-[10.5px] mt-1 cursor-pointer" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={djen} onChange={e => setDjen(e.target.checked)} /> publicação no DJEN (conta a partir do dia útil seguinte à disponibilização)</label></div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Prazo interno (D-4)</label><input type="date" className={inp} style={ist} value={interno} onChange={e => setInterno(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Responsável</label><select className={inp} style={ist} value={responsavel} onChange={e => setResponsavel(e.target.value)}><option value="">—</option>{ADVOGADOS.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Revisor</label><select className={inp} style={ist} value={revisor} onChange={e => setRevisor(e.target.value)}>{COORDS.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
          </div>
          {calcInfo && <div className="text-[10.5px] mt-1.5" style={{ color: /Não consegui|Informe/.test(calcInfo) ? "var(--alerta)" : "var(--text-muted)" }}>{calcInfo}</div>}
        </>}

        {destino === "segurar" && <div className="mt-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Pedir para</label><select className={inp} style={ist} value={segurarPara} onChange={e => setSegurarPara(e.target.value)}>{COORDS.map(n => <option key={n} value={n}>{n}</option>)}</select></div>}

        {destino !== "segurar" && <>
          <H t="Texto do andamento" />
          <div className="text-[10.5px] mb-1.5" style={{ color: "var(--text-muted)" }}>Como vai aparecer na árvore do processo e no relatório. Sugestão gerada do teor, no padrão do relatório — edite à vontade. <button type="button" onClick={() => setTexto(sugestao)} className="underline">↺ voltar à sugestão</button> · <button type="button" onClick={() => setTexto((a.teor ?? "").replace(/\s+/g, " ").trim())} className="underline">colar teor literal</button></div>
          <textarea className={inp + " min-h-[84px] resize-y"} style={ist} value={texto} onChange={e => setTexto(e.target.value)} />
          <div className="grid grid-cols-[150px_1fr] gap-2 mt-2"><div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Data do andamento</label><input type="date" className={inp} style={ist} value={dataAnd} onChange={e => setDataAnd(e.target.value)} /></div><div><label className={lbl} style={{ color: "var(--text-secondary)" }}>{modo === "aprovar" ? "Observação de quem propôs" : "Observação para quem aprova"}</label><input className={inp} style={ist} value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: já temos o laudo; sugiro pedir substituição por seguro" /></div></div>
        </>}
        {destino === "segurar" && <div className="mt-2"><label className={lbl} style={{ color: "var(--text-secondary)" }}>O que está em dúvida</label><textarea className={inp + " min-h-[70px]"} style={ist} value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: número não bate com o caso cadastrado; parece processo de outro escritório" /></div>}
        {coordenador && destino !== "segurar" && <div className="mt-2"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Comentário da aprovação (opcional)</label><input className={inp} style={ist} value={obsApr} onChange={e => setObsApr(e.target.value)} placeholder="fica no histórico do alerte" /></div>}

        {historico.length > 0 && <><H t="Histórico" />{historico.map(e => <div key={e.id} className="text-[11.5px] py-1 border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{e.autor}</b> {e.acao}{e.obs && <> — <i>{e.obs}</i></>}<span className="text-[10px] ml-1.5" style={{ color: "var(--text-muted)" }}>{fmtDT(e.criado_em)}</span></div>)}</>}
      </div>
      <div className="px-5 py-3 border-t flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{destino === "segurar" ? "Fica na fila, marcado para quem você escolheu." : coordenador ? "Aprovar grava no caso agora." : "Nada entra no processo antes da aprovação."}</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
          {(modo === "destinar" || destino === "segurar") && <button onClick={enviar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: destino === "segurar" ? "var(--atencao)" : "var(--acao)" }}>{saving ? "Gravando…" : destino === "segurar" ? "Segurar" : coordenador ? "Só propor (sem aprovar)" : "Enviar para aprovação →"}</button>}
          {coordenador && destino !== "segurar" && <button onClick={aprovar} disabled={saving} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{saving ? "Gravando…" : destino === "naf" ? "✓ Aprovar NAF" : "✓ Aprovar e criar pendência"}</button>}
        </div>
      </div>
    </aside>
  </>);
}
