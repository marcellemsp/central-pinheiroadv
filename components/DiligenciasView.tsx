"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { type Despesa, type Lote, type CaixaMov, brl, fmtD, fmtDc, hojeIso, catLabel, catIcon, meioLabel, iniciais, corPessoa } from "@/lib/despesas";
import EditarGastoModal from "./EditarGastoModal";
import { criarZip, slugArquivo, type ZipEntry } from "@/lib/zip";
import { criarXlsx, linhaTotal, baixarBlob, type Celula } from "@/lib/xlsx";

// Painel de gastos de diligências — só coordenadores. Abas: A reembolsar · Caixinha · Histórico · Relatórios.
type Aba = "fila" | "caixa" | "historico" | "comprovantes" | "relatorios";

export default function DiligenciasView({ despesas: inicial, lotes: lotesIni, caixa: caixaIni, userName, empresas = [], usuarios = [] }: { despesas: Despesa[]; lotes: Lote[]; caixa: CaixaMov[]; userName: string; empresas?: { id: string; nome: string }[]; usuarios?: { id: string; nome: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [despesas, setDespesas] = useState<Despesa[]>(inicial);
  const [lotes, setLotes] = useState<Lote[]>(lotesIni);
  const [caixa, setCaixa] = useState<CaixaMov[]>(caixaIni);
  const [aba, setAba] = useState<Aba>("fila");
  // aba Comprovantes: filtros + seleção própria (independente da seleção de pagamento)
  const [fMes, setFMes] = useState<string>(() => hojeIso().slice(0, 7));
  const [fPessoa, setFPessoa] = useState("todas"); const [fStatus, setFStatus] = useState<"todos" | "pago" | "aguardando">("todos");
  const [selComp, setSelComp] = useState<Set<string>>(new Set());
  const [baixando, setBaixando] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set(inicial.filter(d => d.status === "aguardando" && d.comprovante_path).map(d => d.id)));
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ t: string; tom: "ok" | "erro" } | null>(null);
  const [pagar, setPagar] = useState(false);
  const [forma, setForma] = useState("dinheiro");
  const [obsLote, setObsLote] = useState("");
  const [recusa, setRecusa] = useState<{ id: string; motivo: string } | null>(null);
  const [aporte, setAporte] = useState<{ valor: string; data: string; desc: string } | null>(null);
  const [conf, setConf] = useState<{ contado: string } | null>(null);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  const [anoRel, setAnoRel] = useState(new Date().getFullYear());
  const [agrupRel, setAgrupRel] = useState<"pessoa" | "cliente" | "mes" | "categoria">("pessoa");
  const [mesRel, setMesRel] = useState<string>(() => String(new Date().getMonth() + 1).padStart(2, "0")); // "01".."12" ou "todos"
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Despesa | null>(null);
  const [movEdit, setMovEdit] = useState<{ id: string; data: string; valor: string; descricao: string } | null>(null);
  const [loteEdit, setLoteEdit] = useState<{ id: string; data: string; forma: string; obs: string } | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);

  function toast(t: string, tom: "ok" | "erro" = "ok") { setAviso({ t, tom }); setTimeout(() => setAviso(null), 3500); }
  const hoje = hojeIso();

  // ---- derivados ----
  const fila = despesas.filter(d => d.status === "aguardando").sort((a, b) => a.data.localeCompare(b.data));
  const porPessoa = useMemo(() => { const m = new Map<string, Despesa[]>(); for (const d of fila) { const k = d.pessoa_nome; if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); } return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [fila]);
  const totalFila = fila.reduce((s, d) => s + Number(d.valor), 0);
  const semComp = fila.filter(d => !d.comprovante_path).length;
  const selecionadas = fila.filter(d => sel.has(d.id) && d.comprovante_path);
  const totalSel = selecionadas.reduce((s, d) => s + Number(d.valor), 0);
  const saldo = caixa.filter(m => m.tipo !== "conferencia").reduce((s, m) => s + Number(m.valor), 0);
  const ultimaConf = caixa.filter(m => m.tipo === "conferencia").sort((a, b) => b.data.localeCompare(a.data))[0];
  const pagoAno = despesas.filter(d => d.status === "pago" && (d.pago_em ?? d.data).startsWith(String(new Date().getFullYear()))).reduce((s, d) => s + Number(d.valor), 0);
  const ultimoLote = lotes.slice().sort((a, b) => b.numero - a.numero)[0];

  async function recarregar() {
    const [a, b, c] = await Promise.all([
      supabase.from("despesas").select("*").order("data", { ascending: false }).limit(3000),
      supabase.from("reembolso_lotes").select("*").order("numero", { ascending: false }),
      supabase.from("caixa_movimentos").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }),
    ]);
    if (a.data) setDespesas(a.data as Despesa[]); if (b.data) setLotes(b.data as Lote[]); if (c.data) setCaixa(c.data as CaixaMov[]);
  }

  // ---- ações ----
  async function confirmarPagamento() {
    if (selecionadas.length === 0) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("pa_pagar_lote", { ids: selecionadas.map(d => d.id), forma, obs: obsLote.trim() || null });
    setOcupado(false);
    if (error) { toast(error.message, "erro"); return; }
    setPagar(false); setObsLote("");
    await recarregar(); setSel(new Set());
    toast(`Lote #${(data as any)?.numero} criado: ${(data as any)?.qtd} lançamento(s), ${brl(Number((data as any)?.total ?? 0))} debitados da caixinha.`);
  }
  async function recusar() {
    if (!recusa) return;
    const { error } = await supabase.from("despesas").update({ status: "recusado", motivo_recusa: recusa.motivo.trim() || "sem motivo informado" }).eq("id", recusa.id);
    if (error) { toast(error.message, "erro"); return; }
    setDespesas(prev => prev.map(d => d.id === recusa.id ? { ...d, status: "recusado", motivo_recusa: recusa.motivo } : d)); setRecusa(null); toast("Lançamento recusado; a pessoa vê o motivo na lista dela.");
  }
  async function devolverFila(d: Despesa) {
    const { error } = await supabase.from("despesas").update({ status: "aguardando", motivo_recusa: null }).eq("id", d.id);
    if (error) { toast(error.message, "erro"); return; }
    setDespesas(prev => prev.map(x => x.id === d.id ? { ...x, status: "aguardando", motivo_recusa: null } : x));
  }
  async function salvarAporte() {
    if (!aporte) return; const v = Number(aporte.valor.replace(/\./g, "").replace(",", ".")); if (!v) { toast("Informe o valor.", "erro"); return; }
    const { error } = await supabase.from("caixa_movimentos").insert({ data: aporte.data, tipo: "aporte", valor: Math.abs(v), descricao: aporte.desc.trim() || "Aporte", responsavel_nome: userName, criado_por: userName });
    if (error) { toast(error.message, "erro"); return; }
    setAporte(null); await recarregar(); toast(`Aporte de ${brl(v)} registrado.`);
  }
  async function salvarConferencia() {
    if (!conf) return; const v = Number(conf.contado.replace(/\./g, "").replace(",", ".")); if (Number.isNaN(v)) { toast("Informe o valor contado.", "erro"); return; }
    const dif = Number((v - saldo).toFixed(2));
    const linhas: any[] = [{ data: hoje, tipo: "conferencia", valor: v, descricao: `Conferência: em mãos ${brl(v)} · saldo registrado ${brl(saldo)} · diferença ${brl(dif)}`, responsavel_nome: userName, criado_por: userName }];
    if (dif !== 0) linhas.push({ data: hoje, tipo: "ajuste", valor: dif, descricao: `Ajuste pela conferência de ${fmtD(hoje)}`, responsavel_nome: userName, criado_por: userName });
    const { error } = await supabase.from("caixa_movimentos").insert(linhas);
    if (error) { toast(error.message, "erro"); return; }
    setConf(null); await recarregar(); toast(dif === 0 ? "Caixa conferida: bate." : `Caixa conferida; ajuste de ${brl(dif)} lançado.`);
  }
  async function salvarMov() {
    if (!movEdit) return; const v = Number(movEdit.valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); if (Number.isNaN(v)) { toast("Valor inválido.", "erro"); return; }
    const { error } = await supabase.from("caixa_movimentos").update({ data: movEdit.data, valor: v, descricao: movEdit.descricao.trim() || null }).eq("id", movEdit.id);
    if (error) { toast(error.message, "erro"); return; }
    setMovEdit(null); await recarregar(); toast("Movimento atualizado.");
  }
  async function excluirMov(m: CaixaMov) {
    if (!confirm(`Excluir este movimento (${m.tipo} de ${brl(Math.abs(Number(m.valor)))})? O saldo da caixinha muda.`)) return;
    const { error } = await supabase.from("caixa_movimentos").delete().eq("id", m.id);
    if (error) { toast(error.message, "erro"); return; }
    await recarregar(); toast("Movimento excluído.");
  }
  async function salvarLote() {
    if (!loteEdit) return;
    const { error } = await supabase.from("reembolso_lotes").update({ data: loteEdit.data, forma: loteEdit.forma, obs: loteEdit.obs.trim() || null }).eq("id", loteEdit.id);
    if (error) { toast(error.message, "erro"); return; }
    await supabase.from("caixa_movimentos").update({ data: loteEdit.data }).eq("lote_id", loteEdit.id).eq("tipo", "lote");
    await supabase.from("despesas").update({ pago_em: loteEdit.data }).eq("lote_id", loteEdit.id);
    setLoteEdit(null); await recarregar(); toast("Lote atualizado.");
  }
  async function estornarLote(l: Lote) {
    setOcupado(true);
    const { data, error } = await supabase.rpc("pa_estornar_lote", { p_lote: l.id });
    setOcupado(false); setEstornando(null);
    if (error) { toast(error.message, "erro"); return; }
    await recarregar(); toast(`Lote #${l.numero} estornado: ${(data as any)?.devolvidas} lançamento(s) voltaram para "a reembolsar" e a caixinha foi recomposta.`);
  }
  async function verComprovante(path: string) {
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast("Não consegui abrir o comprovante.", "erro"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function baixarZip(itens: Despesa[], nomeZip: string) {
    const com = itens.filter(d => d.comprovante_path);
    if (!com.length) { toast("Nenhum comprovante nesses lançamentos.", "erro"); return; }
    if (baixando) return;
    const arquivos: ZipEntry[] = []; const usados = new Set<string>(); let falhas = 0;
    for (let i = 0; i < com.length; i++) {
      const d = com[i]; setBaixando(`Baixando comprovante ${i + 1} de ${com.length}…`);
      const { data, error } = await supabase.storage.from("comprovantes").download(d.comprovante_path!);
      if (error || !data) { falhas++; continue; }
      const ext = (d.comprovante_path!.split("?")[0].split(".").pop() || "bin").toLowerCase().slice(0, 5);
      const base = `${slugArquivo(d.pessoa_nome, 30)}/${d.data}_${slugArquivo(d.cliente_txt || d.local || "diligencia")}_R$${Number(d.valor).toFixed(2).replace(".", ",")}`;
      let nome = `${base}.${ext}`; let k = 2; while (usados.has(nome)) nome = `${base}_${k++}.${ext}`; usados.add(nome);
      arquivos.push({ nome, dados: new Uint8Array(await data.arrayBuffer()), data: new Date(d.data + "T12:00:00") });
    }
    setBaixando(null);
    if (!arquivos.length) { toast("Não consegui baixar nenhum comprovante.", "erro"); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(criarZip(arquivos)); a.download = nomeZip; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    toast(`${arquivos.length} comprovante(s) no zip${falhas ? ` · ${falhas} falharam` : ""}.`, falhas ? "erro" : "ok");
  }
  function imprimirRecibo(l: Lote) {
    const itens = despesas.filter(d => d.lote_id === l.id).sort((a, b) => a.pessoa_nome.localeCompare(b.pessoa_nome) || a.data.localeCompare(b.data));
    const porP = new Map<string, Despesa[]>(); for (const d of itens) { if (!porP.has(d.pessoa_nome)) porP.set(d.pessoa_nome, []); porP.get(d.pessoa_nome)!.push(d); }
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo de reembolso · Lote #${l.numero}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:32px}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left;font-size:11.5px}th{background:#f3f3f3}td.v,th.v{text-align:right;white-space:nowrap}.tot{font-weight:bold}.ass{margin-top:36px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:11px}.meta{color:#555;margin-bottom:12px}@media print{button{display:none}}</style></head><body>
<button onclick="window.print()" style="float:right">Imprimir / salvar PDF</button>
<h1>Pinheiro Advogados — Recibo de reembolso de despesas de diligência</h1>
<div class="meta">Lote #${l.numero} · pago em ${fmtD(l.data)} · ${l.forma} · por ${l.pago_por_nome ?? ""}${l.obs ? ` · ${l.obs}` : ""}</div>
${[...porP.entries()].map(([p, ds]) => `<h2>${p} — ${brl(ds.reduce((s, d) => s + Number(d.valor), 0))}</h2><table><tr><th>Data</th><th>Diligência</th><th>Cliente</th><th>Categoria</th><th class="v">Valor</th></tr>${ds.map(d => `<tr><td>${fmtD(d.data)}</td><td>${d.local ?? ""}</td><td>${d.cliente_txt ?? ""}</td><td>${catLabel(d.categoria)}${d.meio ? " · " + meioLabel(d.meio) : ""}</td><td class="v">${brl(Number(d.valor))}</td></tr>`).join("")}</table>
<div class="ass"><div>Recebi em ${fmtD(l.data)}: ${p}</div><div>Pago por: ${l.pago_por_nome ?? ""}</div></div>`).join("")}
<h2 class="tot">Total do lote: ${brl(Number(l.total))} · ${l.qtd} lançamento(s)</h2>
</body></html>`;
    const w = window.open("", "_blank"); if (!w) { toast("O navegador bloqueou a janela do recibo.", "erro"); return; } w.document.write(html); w.document.close();
  }
  // Excel do mês: aba de lançamentos (uma linha por gasto, com total) + resumo por pessoa, por cliente e por categoria.
  function exportarXlsx(linhas: Despesa[], rotulo: string) {
    const ord = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || a.pessoa_nome.localeCompare(b.pessoa_nome));
    const total = ord.reduce((s, d) => s + Number(d.valor), 0);
    const stLabel = (s: string) => s === "pago" ? "Pago" : s === "aguardando" ? "A reembolsar" : "Recusado";
    const lanc: Celula[][] = ord.map(d => [{ d: d.data }, d.pessoa_nome, d.cliente_txt ?? "", d.local ?? "", catLabel(d.categoria), meioLabel(d.meio), { v: Number(d.valor) }, stLabel(d.status), d.lote_numero ? { v: d.lote_numero, fmt: "int" } : "", d.pago_em ? { d: d.pago_em } : "", d.comprovante_path ? "Sim" : "Não", d.obs ?? ""]);
    lanc.push(linhaTotal(["", "", "", "", "", "TOTAL", { v: total }, "", "", "", "", `${ord.length} lançamento(s)`]));
    const resumo = (chave: (d: Despesa) => string, titulo: string) => {
      const m = new Map<string, { n: number; v: number; pago: number; aberto: number }>();
      for (const d of ord) { const k = chave(d); const r = m.get(k) ?? { n: 0, v: 0, pago: 0, aberto: 0 }; r.n++; r.v += Number(d.valor); if (d.status === "pago") r.pago += Number(d.valor); else if (d.status === "aguardando") r.aberto += Number(d.valor); m.set(k, r); }
      const ls: Celula[][] = [...m.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, r]) => [k, { v: r.n, fmt: "int" }, { v: r.v }, { v: r.pago }, { v: r.aberto }]);
      ls.push(linhaTotal(["TOTAL", { v: ord.length, fmt: "int" }, { v: total }, { v: ord.filter(d => d.status === "pago").reduce((s, d) => s + Number(d.valor), 0) }, { v: ord.filter(d => d.status === "aguardando").reduce((s, d) => s + Number(d.valor), 0) }]));
      return { nome: titulo, colunas: [titulo, "Qtd", "Total", "Pago", "A reembolsar"], larguras: [34, 8, 14, 14, 14], linhas: ls };
    };
    const blob = criarXlsx([
      { nome: "Lançamentos", colunas: ["Data", "Pessoa", "Cliente", "Diligência", "Categoria", "Meio", "Valor", "Status", "Lote", "Pago em", "Comprovante", "Obs"], larguras: [12, 22, 30, 34, 20, 14, 14, 14, 7, 12, 12, 40], linhas: lanc },
      resumo(d => d.pessoa_nome, "Por pessoa"),
      resumo(d => d.cliente_txt || "— sem cliente —", "Por cliente"),
      resumo(d => catLabel(d.categoria), "Por categoria"),
    ]);
    baixarBlob(blob, `gastos-${rotulo}.xlsx`);
  }
  function exportarCsv(linhas: Despesa[], nome: string) {
    const esc = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = ["data;pessoa;cliente;diligencia;categoria;meio;valor;status;lote;pago_em;obs", ...linhas.map(d => [d.data, d.pessoa_nome, d.cliente_txt, d.local, catLabel(d.categoria), meioLabel(d.meio), Number(d.valor).toFixed(2).replace(".", ","), d.status, d.lote_numero ?? "", d.pago_em ?? "", d.obs].map(esc).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = nome; a.click();
  }

  // ---- UI helpers ----
  const btn = "px-3 py-1.5 rounded-md text-xs font-semibold border disabled:opacity-50";
  const inp = "px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao w-full";
  const st = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const tab = (k: Aba, label: string, n?: number) => (
    <button key={k} type="button" onClick={() => setAba(k)} className="px-3 py-2 text-[12.5px] font-medium -mb-px border-b-2 whitespace-nowrap inline-flex items-center gap-1.5"
      style={{ color: aba === k ? "var(--acao)" : "var(--text-secondary)", borderColor: aba === k ? "var(--acao)" : "transparent", fontWeight: aba === k ? 600 : 500 }}>
      {label}{n ? <span className="text-[10px] font-bold px-1.5 rounded-full text-on-acao" style={{ background: "var(--atencao)" }}>{n}</span> : null}</button>
  );
  const Tag = ({ t, tom }: { t: string; tom: "amber" | "red" | "gray" | "green" | "blue" }) => { const m = { amber: ["var(--tag-amber-bg)", "var(--tag-amber-fg, var(--atencao))"], red: ["var(--tag-red-bg)", "var(--tag-red-fg)"], gray: ["var(--bg-page)", "var(--text-muted)"], green: ["var(--tag-green-bg)", "var(--tag-green-fg, var(--ok))"], blue: ["var(--tag-blue-bg)", "var(--tag-blue-fg)"] }[tom]; return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: m[0], color: m[1] }}>{t}</span>; };
  const Kpi = ({ v, l, s, tom }: { v: string; l: string; s?: string; tom?: "warn" | "ok" | "neg" }) => (
    <div className="rounded-lg border px-3.5 py-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[20px] font-bold leading-tight" style={{ color: tom === "warn" ? "var(--atencao)" : tom === "ok" ? "var(--ok)" : tom === "neg" ? "var(--alerta)" : "var(--text-primary)" }}>{v}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>{l}</div>
      {s && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{s}</div>}
    </div>
  );
  const Linha = ({ d, acoes, check, marcado, onMarcar }: { d: Despesa; acoes?: ReactNode; check?: boolean; marcado?: boolean; onMarcar?: () => void }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t text-[12.5px]" style={{ borderColor: "var(--border)", opacity: (check || onMarcar) && !d.comprovante_path ? 0.75 : 1 }}>
      {onMarcar && <input type="checkbox" disabled={!d.comprovante_path} checked={!!marcado && !!d.comprovante_path} onChange={onMarcar} />}
      {check && <input type="checkbox" disabled={!d.comprovante_path} checked={sel.has(d.id) && !!d.comprovante_path} onChange={() => setSel(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} />}
      <div className="w-[48px] shrink-0" style={{ color: "var(--text-secondary)" }}>{fmtDc(d.data)}</div>
      <div className="flex-1 min-w-[180px]">
        <div style={{ color: "var(--text-primary)" }}><b>{d.local}</b>{d.cliente_txt ? <span style={{ color: "var(--text-secondary)" }}> · {d.cliente_txt}</span> : ""}</div>
        <div className="text-[10.5px] flex flex-wrap gap-1.5 items-center mt-0.5" style={{ color: "var(--text-muted)" }}><Tag t={`${catIcon(d.categoria)} ${catLabel(d.categoria)}${d.meio ? " · " + meioLabel(d.meio) : ""}`} tom="blue" />{d.obs && <span className="italic">{d.obs}</span>}{d.status === "recusado" && <Tag t={`recusado · ${d.motivo_recusa ?? ""}`} tom="red" />}{d.status === "pago" && <Tag t={`pago ${fmtD(d.pago_em)} · lote #${d.lote_numero}`} tom="green" />}</div>
      </div>
      <div className="font-semibold tabular-nums w-[84px] text-right" style={{ color: "var(--text-primary)" }}>{brl(Number(d.valor))}</div>
      <div className="w-[110px] text-right">{d.comprovante_path ? <button type="button" onClick={() => verComprovante(d.comprovante_path!)} className="text-[11px] font-semibold underline" style={{ color: "var(--acao)" }}>comprovante</button> : <Tag t="sem comprovante" tom="red" />}</div>
      <div className="flex gap-1.5"><button type="button" onClick={() => setEditando(d)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Editar ou excluir">✎</button>{acoes}</div>
    </div>
  );

  // ---- relatórios ----
  const relLinhas = despesas.filter(d => d.status !== "recusado" && d.data.startsWith(String(anoRel)) && (mesRel === "todos" || d.data.slice(5, 7) === mesRel));
  const rotuloRel = mesRel === "todos" ? String(anoRel) : `${anoRel}-${mesRel}`;
  const relGrupos = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    for (const d of relLinhas) { const k = agrupRel === "pessoa" ? d.pessoa_nome : agrupRel === "cliente" ? (d.cliente_txt || "— sem cliente —") : agrupRel === "mes" ? d.data.slice(0, 7) : catLabel(d.categoria); const g = m.get(k) ?? { n: 0, v: 0 }; g.n++; g.v += Number(d.valor); m.set(k, g); }
    return [...m.entries()].sort((a, b) => agrupRel === "mes" ? a[0].localeCompare(b[0]) : b[1].v - a[1].v);
  }, [relLinhas, agrupRel]);
  const anos = [...new Set(despesas.map(d => d.data.slice(0, 4)))].sort();

  return (
    <div>
      {baixando && <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>{baixando}</div>}
      {aviso && <div className="fixed top-3 right-3 z-50 px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg text-on-acao" style={{ background: aviso.tom === "ok" ? "var(--ok)" : "var(--alerta)" }}>{aviso.t}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <Kpi v={brl(totalFila)} l="a reembolsar" s={`${fila.length} lançamento(s) · ${porPessoa.length} pessoa(s)`} tom="warn" />
        <Kpi v={brl(pagoAno)} l={`pago em ${new Date().getFullYear()}`} s={ultimoLote ? `último lote #${ultimoLote.numero} em ${fmtD(ultimoLote.data)}` : "nenhum lote ainda"} />
        <Kpi v={brl(saldo)} l="saldo da caixinha" s={saldo < 0 ? "negativo: o escritório deve ao coordenador" : ultimaConf ? `conferida em ${fmtD(ultimaConf.data)}` : "sem conferência registrada"} tom={saldo < 0 ? "neg" : "ok"} />
        <Kpi v={String(semComp)} l="sem comprovante" s="bloqueiam o pagamento até anexar" />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tab("fila", "A reembolsar", fila.length)}{tab("caixa", "Caixinha")}{tab("historico", "Histórico")}{tab("comprovantes", "Comprovantes")}{tab("relatorios", "Relatórios")}
        <Link href="/diligencias/lancar" className="ml-auto mb-1 px-3 py-1.5 rounded-md text-xs font-semibold text-on-acao" style={{ background: "var(--acao)" }}>+ Lançar gasto</Link>
      </div>

      {/* ======== FILA ======== */}
      {aba === "fila" && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          <div>
            {porPessoa.length === 0 && <div className="rounded-lg border px-4 py-10 text-center text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>Nada a reembolsar. ✓</div>}
            {porPessoa.map(([pessoa, itens]) => {
              const tot = itens.reduce((s, d) => s + Number(d.valor), 0); const sc = itens.filter(d => !d.comprovante_path).length; const todos = itens.filter(d => d.comprovante_path).every(d => sel.has(d.id)); const aberto = abertos.has(pessoa) || porPessoa.length <= 3;
              return (
                <div key={pessoa} className="rounded-lg border mb-2.5 overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 cursor-pointer" style={{ background: "var(--bg-page)" }} onClick={() => setAbertos(prev => { const n = new Set(prev); n.has(pessoa) ? n.delete(pessoa) : n.add(pessoa); return n; })}>
                    <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-on-acao shrink-0" style={{ background: corPessoa(pessoa) }}>{iniciais(pessoa)}</span>
                    <div className="min-w-0"><div className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{pessoa}</div><div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{itens.length} lançamento(s) · desde {fmtDc(itens[0].data)}{sc ? ` · ${sc} sem comprovante` : ""}</div></div>
                    <div className="ml-auto text-right"><b className="text-[15px]" style={{ color: "var(--atencao)" }}>{brl(tot)}</b></div>
                    <label className="text-[11px] inline-flex items-center gap-1 cursor-pointer" onClick={e => e.stopPropagation()}><input type="checkbox" checked={todos && itens.some(d => d.comprovante_path)} onChange={e => setSel(prev => { const n = new Set(prev); itens.filter(d => d.comprovante_path).forEach(d => e.target.checked ? n.add(d.id) : n.delete(d.id)); return n; })} /> todos</label>
                  </div>
                  {aberto && itens.map(d => <Linha key={d.id} d={d} check acoes={<button type="button" onClick={() => setRecusa({ id: d.id, motivo: "" })} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Recusar este lançamento">✕</button>} />)}
                </div>
              );
            })}
          </div>
          <div>
            <div className="rounded-lg border p-4 sticky top-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Pagamento</div>
              <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>{brl(totalSel)}</div>
              <div className="text-[11.5px] mb-3" style={{ color: "var(--text-secondary)" }}>{selecionadas.length} selecionado(s) · caixinha ficaria em <b style={{ color: saldo - totalSel < 0 ? "var(--alerta)" : "var(--ok)" }}>{brl(saldo - totalSel)}</b></div>
              {!pagar ? <button type="button" disabled={selecionadas.length === 0 || ocupado} onClick={() => setPagar(true)} className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>✓ Marcar como pago (gera lote)</button> : (
                <div className="space-y-2">
                  <div><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Forma</label><div className="flex gap-1.5">{["dinheiro", "pix"].map(f => <button key={f} type="button" onClick={() => setForma(f)} className="flex-1 py-1.5 rounded-md text-[12px] font-semibold border" style={{ background: forma === f ? "var(--acao)" : "var(--bg-page)", borderColor: forma === f ? "var(--acao)" : "var(--border)", color: forma === f ? "var(--on-acao)" : "var(--text-secondary)" }}>{f === "pix" ? "Pix" : "Dinheiro (caixinha)"}</button>)}</div></div>
                  <input className={inp} style={st} placeholder="observação do lote (opcional)" value={obsLote} onChange={e => setObsLote(e.target.value)} />
                  <div className="flex gap-1.5"><button type="button" disabled={ocupado} onClick={confirmarPagamento} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{ocupado ? "Gravando…" : `Confirmar ${brl(totalSel)}`}</button><button type="button" onClick={() => setPagar(false)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Voltar</button></div>
                </div>
              )}
              <button type="button" disabled={selecionadas.length === 0 || !!baixando} onClick={() => baixarZip(selecionadas, `comprovantes-a-reembolsar-${hoje}.zip`)} className={btn + " w-full mt-2"} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Baixar comprovantes selecionados (.zip)</button>
              <div className="text-[10.5px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>Cria um lote numerado, marca os lançamentos como pagos, debita a caixinha e gera o recibo para assinatura (aba Histórico). Lançamentos sem comprovante não entram.</div>
            </div>
          </div>
        </div>
      )}

      {/* ======== CAIXA ======== */}
      {aba === "caixa" && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3">
          <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b flex items-center gap-2" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>Movimentos <span className="ml-auto normal-case tracking-normal font-semibold text-[11px]" style={{ color: saldo < 0 ? "var(--alerta)" : "var(--ok)" }}>saldo {brl(saldo)}</span></div>
            {caixa.length === 0 && <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Nenhum movimento.</div>}
            {caixa.map(m => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t text-[12.5px]" style={{ borderColor: "var(--border)" }}>
                <div className="w-[48px]" style={{ color: "var(--text-secondary)" }}>{fmtDc(m.data)}</div>
                <Tag t={m.tipo} tom={m.tipo === "aporte" ? "green" : m.tipo === "lote" ? "amber" : m.tipo === "conferencia" ? "blue" : "gray"} />
                <div className="flex-1 min-w-[160px]" style={{ color: "var(--text-primary)" }}>{m.descricao}{m.responsavel_nome ? <span style={{ color: "var(--text-muted)" }}> · {m.responsavel_nome}</span> : ""}</div>
                <div className="font-semibold tabular-nums" style={{ color: m.tipo === "conferencia" ? "var(--text-muted)" : Number(m.valor) >= 0 ? "var(--ok)" : "var(--alerta)" }}>{m.tipo === "conferencia" ? `= ${brl(Number(m.valor))}` : (Number(m.valor) >= 0 ? "+ " : "− ") + brl(Math.abs(Number(m.valor)))}</div>
                {m.tipo !== "lote" ? <div className="flex gap-1"><button type="button" onClick={() => setMovEdit({ id: m.id, data: m.data, valor: Number(m.valor).toFixed(2).replace(".", ","), descricao: m.descricao ?? "" })} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Editar">✎</button><button type="button" onClick={() => excluirMov(m)} className={btn} style={{ borderColor: "var(--border)", color: "var(--alerta)" }} title="Excluir"></button></div>
                  : <span className="text-[10px]" style={{ color: "var(--text-muted)" }} title="Movimento gerado pelo lote — altere pelo Histórico (editar/estornar lote)">via lote</span>}
                {movEdit?.id === m.id && (
                  <div className="basis-full flex flex-wrap gap-1.5 items-center pt-1.5">
                    <input type="date" className={inp + " !w-[150px]"} style={st} value={movEdit.data} onChange={e => setMovEdit({ ...movEdit, data: e.target.value })} />
                    <input className={inp + " !w-[120px]"} style={st} inputMode="decimal" value={movEdit.valor} onChange={e => setMovEdit({ ...movEdit, valor: e.target.value })} placeholder="valor (negativo = saída)" />
                    <input className={inp + " flex-1 !w-auto min-w-[160px]"} style={st} value={movEdit.descricao} onChange={e => setMovEdit({ ...movEdit, descricao: e.target.value })} placeholder="descrição" />
                    <button type="button" onClick={salvarMov} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-on-acao" style={{ background: "var(--ok)" }}>Salvar</button><button type="button" onClick={() => setMovEdit(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
                  </div>)}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Saldo</div>
              <div className="text-[26px] font-bold" style={{ color: saldo < 0 ? "var(--alerta)" : "var(--ok)" }}>{brl(saldo)}</div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{saldo < 0 ? "Negativo: o coordenador adiantou do próprio bolso; um aporte do escritório zera." : "Dinheiro disponível para reembolsos."}{ultimaConf ? ` Última conferência: ${fmtD(ultimaConf.data)}.` : ""}</div>
              <div className="flex gap-1.5 mt-3"><button type="button" onClick={() => setAporte({ valor: "", data: hoje, desc: "" })} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao" style={{ background: "var(--acao)" }}>+ Aporte</button><button type="button" onClick={() => setConf({ contado: "" })} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>Conferir caixa</button></div>
            </div>
            {aporte && <div className="rounded-lg border p-4 space-y-2" style={{ background: "var(--bg-surface)", borderColor: "var(--acao)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--acao)" }}>Novo aporte</div>
              <input className={inp} style={st} inputMode="decimal" placeholder="valor (R$)" value={aporte.valor} onChange={e => setAporte({ ...aporte, valor: e.target.value })} />
              <input type="date" className={inp} style={st} value={aporte.data} onChange={e => setAporte({ ...aporte, data: e.target.value })} />
              <input className={inp} style={st} placeholder="descrição (ex.: reposição do escritório · Pix para Vinicius)" value={aporte.desc} onChange={e => setAporte({ ...aporte, desc: e.target.value })} />
              <div className="flex gap-1.5"><button type="button" onClick={salvarAporte} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao" style={{ background: "var(--ok)" }}>Salvar</button><button type="button" onClick={() => setAporte(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
            </div>}
            {conf && <div className="rounded-lg border p-4 space-y-2" style={{ background: "var(--bg-surface)", borderColor: "var(--acao)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--acao)" }}>Conferir caixa</div>
              <div className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>Quanto há em mãos agora? O sistema registra a conferência e, se houver diferença para o saldo ({brl(saldo)}), lança um ajuste.</div>
              <input className={inp} style={st} inputMode="decimal" placeholder="valor contado (R$)" value={conf.contado} onChange={e => setConf({ contado: e.target.value })} />
              <div className="flex gap-1.5"><button type="button" onClick={salvarConferencia} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao" style={{ background: "var(--ok)" }}>Registrar</button><button type="button" onClick={() => setConf(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
            </div>}
          </div>
        </div>
      )}

      {/* ======== HISTÓRICO ======== */}
      {aba === "historico" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>Lotes de reembolso pagos. Clique para ver os itens e imprimir o recibo.</span><button type="button" onClick={() => exportarCsv(despesas, `gastos-diligencias-${hoje}.csv`)} className={btn + " ml-auto"} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>Exportar tudo (CSV)</button></div>
          {lotes.length === 0 && <div className="rounded-lg border px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>Nenhum lote ainda.</div>}
          {lotes.map(l => { const itens = despesas.filter(d => d.lote_id === l.id); const aberto = loteAberto === l.id; return (
            <div key={l.id} className="rounded-lg border mb-2.5 overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 cursor-pointer" style={{ background: "var(--bg-page)" }} onClick={() => setLoteAberto(aberto ? null : l.id)}>
                <div className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>Lote #{l.numero}</div>
                <div className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{fmtD(l.data)} · {l.qtd} lançamento(s) · {l.forma} · {l.pago_por_nome ?? ""}{l.obs ? ` · ${l.obs}` : ""}</div>
                <div className="ml-auto font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{brl(Number(l.total))}</div>
                <button type="button" onClick={e => { e.stopPropagation(); imprimirRecibo(l); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>Recibo</button>
                <button type="button" onClick={e => { e.stopPropagation(); exportarCsv(itens, `lote-${l.numero}.csv`); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>CSV</button>
                <button type="button" disabled={!!baixando} onClick={e => { e.stopPropagation(); baixarZip(itens, `lote-${l.numero}-comprovantes.zip`); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Baixar todos os comprovantes deste lote num .zip">Zip</button>
                <button type="button" onClick={e => { e.stopPropagation(); setLoteEdit({ id: l.id, data: l.data, forma: l.forma, obs: l.obs ?? "" }); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Editar data, forma ou observação">✎</button>
                <button type="button" onClick={e => { e.stopPropagation(); setEstornando(l.id); }} className={btn} style={{ borderColor: "var(--alerta)", color: "var(--alerta)" }} title="Desfazer o pagamento: lançamentos voltam à fila">Estornar</button>
              </div>
              {loteEdit?.id === l.id && (
                <div className="flex flex-wrap gap-1.5 items-center px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                  <input type="date" className={inp + " !w-[150px]"} style={st} value={loteEdit.data} onChange={e => setLoteEdit({ ...loteEdit, data: e.target.value })} />
                  <select className={inp + " !w-[140px]"} style={st} value={loteEdit.forma} onChange={e => setLoteEdit({ ...loteEdit, forma: e.target.value })}><option value="dinheiro">dinheiro</option><option value="pix">pix</option></select>
                  <input className={inp + " flex-1 !w-auto min-w-[160px]"} style={st} value={loteEdit.obs} onChange={e => setLoteEdit({ ...loteEdit, obs: e.target.value })} placeholder="observação" />
                  <button type="button" onClick={salvarLote} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-on-acao" style={{ background: "var(--ok)" }}>Salvar</button><button type="button" onClick={() => setLoteEdit(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
                </div>)}
              {estornando === l.id && (
                <div className="flex flex-wrap gap-2 items-center px-4 py-2.5 border-t text-[12px]" style={{ borderColor: "var(--border)", background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>
                  <span>Estornar o lote #{l.numero}: os {l.qtd} lançamentos voltam para "a reembolsar", o movimento de {brl(Number(l.total))} sai da caixinha e o lote é apagado. Confirmar?</span>
                  <button type="button" disabled={ocupado} onClick={() => estornarLote(l)} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-on-acao ml-auto" style={{ background: "var(--alerta)" }}>Sim, estornar</button><button type="button" onClick={() => setEstornando(null)} className="px-2 py-1.5 underline">não</button>
                </div>)}
              {aberto && itens.sort((a, b) => a.pessoa_nome.localeCompare(b.pessoa_nome) || a.data.localeCompare(b.data)).map(d => <Linha key={d.id} d={d} acoes={<span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{d.pessoa_nome}</span>} />)}
            </div>); })}
          {despesas.some(d => d.status === "recusado") && <>
            <div className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-2" style={{ color: "var(--text-muted)" }}>Recusados</div>
            <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              {despesas.filter(d => d.status === "recusado").map(d => <Linha key={d.id} d={d} acoes={<><span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{d.pessoa_nome}</span><button type="button" onClick={() => devolverFila(d)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>↩ voltar à fila</button></>} />)}
            </div></>}
        </div>
      )}

      {/* ======== COMPROVANTES ======== */}
      {aba === "comprovantes" && (() => {
        const meses = [...new Set(despesas.map(d => d.data.slice(0, 7)))].sort().reverse();
        const pessoas = [...new Set(despesas.map(d => d.pessoa_nome))].sort();
        const lista = despesas.filter(d => d.status !== "recusado" && (fMes === "todos" || d.data.startsWith(fMes)) && (fPessoa === "todas" || d.pessoa_nome === fPessoa) && (fStatus === "todos" || d.status === fStatus)).sort((a, b) => b.data.localeCompare(a.data) || a.pessoa_nome.localeCompare(b.pessoa_nome));
        const comComp = lista.filter(d => d.comprovante_path); const marcados = lista.filter(d => selComp.has(d.id) && d.comprovante_path);
        const todosMarcados = comComp.length > 0 && comComp.every(d => selComp.has(d.id));
        const rotuloMes = fMes === "todos" ? "todos-os-meses" : fMes;
        const rotuloFiltro = [fMes === "todos" ? null : `${fMes.slice(5, 7)}/${fMes.slice(0, 4)}`, fPessoa === "todas" ? null : fPessoa, fStatus === "todos" ? null : fStatus].filter(Boolean).join(" · ") || "tudo";
        return (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={fMes} onChange={e => { setFMes(e.target.value); setSelComp(new Set()); }}><option value="todos">Todos os meses</option>{meses.map(m => <option key={m} value={m}>{m.slice(5, 7)}/{m.slice(0, 4)}</option>)}</select>
              <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={fPessoa} onChange={e => { setFPessoa(e.target.value); setSelComp(new Set()); }}><option value="todas">Todas as pessoas</option>{pessoas.map(p => <option key={p} value={p}>{p}</option>)}</select>
              <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={fStatus} onChange={e => { setFStatus(e.target.value as any); setSelComp(new Set()); }}><option value="todos">Pagos e a reembolsar</option><option value="pago">Só pagos</option><option value="aguardando">Só a reembolsar</option></select>
              <span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{lista.length} lançamento(s) · {comComp.length} com comprovante · <b style={{ color: "var(--text-primary)" }}>{brl(lista.reduce((s, d) => s + Number(d.valor), 0))}</b></span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button type="button" disabled={marcados.length === 0 || !!baixando} onClick={() => baixarZip(marcados, `comprovantes-${rotuloMes}-selecionados.zip`)} className="px-3 py-1.5 rounded-md text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>⬇ Baixar selecionados ({marcados.length})</button>
                <button type="button" disabled={comComp.length === 0 || !!baixando} onClick={() => baixarZip(comComp, `comprovantes-${rotuloMes}${fPessoa === "todas" ? "" : "-" + slugArquivo(fPessoa, 20)}.zip`)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} title={`Todos os comprovantes do filtro atual (${rotuloFiltro})`}>⬇ Baixar tudo do filtro (.zip)</button>
                <button type="button" onClick={() => exportarCsv(lista, `gastos-${rotuloMes}.csv`)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>CSV</button>
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-semibold" style={{ background: "var(--bg-page)", color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={todosMarcados} disabled={comComp.length === 0} onChange={() => setSelComp(todosMarcados ? new Set() : new Set(comComp.map(d => d.id)))} title="Marcar / desmarcar todos com comprovante" />
                <span>{todosMarcados ? "Desmarcar todos" : "Marcar todos com comprovante"}</span>
                {marcados.length > 0 && <span className="ml-auto">{marcados.length} marcado(s) · {brl(marcados.reduce((s, d) => s + Number(d.valor), 0))}</span>}
              </div>
              {lista.length === 0 && <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Nenhum lançamento com esses filtros.</div>}
              {lista.map(d => <Linha key={d.id} d={d} marcado={selComp.has(d.id)} onMarcar={() => setSelComp(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} acoes={<span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{d.pessoa_nome}</span>} />)}
            </div>
            <div className="text-[10.5px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>O .zip vem com uma pasta por pessoa e arquivos nomeados <i>data_cliente_valor</i>. Só entram lançamentos com comprovante anexado; recusados ficam de fora.</div>
          </div>
        );
      })()}

      {/* ======== RELATÓRIOS ======== */}
      {aba === "relatorios" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={anoRel} onChange={e => setAnoRel(Number(e.target.value))}>{(anos.length ? anos : [String(anoRel)]).map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={mesRel} onChange={e => { setMesRel(e.target.value); if (e.target.value !== "todos" && agrupRel === "mes") setAgrupRel("pessoa"); }}>
              <option value="todos">Ano inteiro</option>
              {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => <option key={m} value={m}>{["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][Number(m) - 1]}</option>)}
            </select>
            {(["pessoa", "cliente", "mes", "categoria"] as const).filter(k => k !== "mes" || mesRel === "todos").map(k => <button key={k} type="button" onClick={() => setAgrupRel(k)} className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold border" style={{ background: agrupRel === k ? "var(--acao)" : "var(--bg-surface)", borderColor: agrupRel === k ? "var(--acao)" : "var(--border)", color: agrupRel === k ? "var(--on-acao)" : "var(--text-secondary)" }}>{k === "pessoa" ? "por pessoa" : k === "cliente" ? "por cliente" : k === "mes" ? "por mês" : "por categoria"}</button>)}
            <span className="ml-auto text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{relLinhas.length} lançamentos · <b style={{ color: "var(--text-primary)" }}>{brl(relLinhas.reduce((s, d) => s + Number(d.valor), 0))}</b></span>
            <button type="button" disabled={relLinhas.length === 0} onClick={() => exportarXlsx(relLinhas, rotuloRel)} className={btn} style={{ borderColor: "var(--ok)", color: "var(--ok)" }} title="Planilha Excel: lançamentos do período + resumos por pessoa, cliente e categoria">Exportar Excel</button>
                <button type="button" onClick={() => exportarCsv(relLinhas, `gastos-${rotuloRel}.csv`)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>CSV</button>
          </div>
          <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            {relGrupos.map(([k, g]) => { const max = Math.max(...relGrupos.map(x => x[1].v)); return (
              <div key={k} className="grid items-center gap-3 px-4 py-2 border-t text-[12.5px]" style={{ gridTemplateColumns: "minmax(120px,1fr) 2fr auto auto", borderColor: "var(--border)" }}>
                <div className="truncate" style={{ color: "var(--text-primary)" }}>{agrupRel === "mes" ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : k}</div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-page)" }}><div className="h-full rounded-full" style={{ width: `${(g.v / max) * 100}%`, background: "var(--acao)" }} /></div>
                <div className="text-[11px] w-[64px] text-right" style={{ color: "var(--text-muted)" }}>{g.n} lanç.</div>
                <div className="font-semibold tabular-nums w-[96px] text-right" style={{ color: "var(--text-primary)" }}>{brl(g.v)}</div>
              </div>); })}
          </div>
          <div className="text-[10.5px] mt-2" style={{ color: "var(--text-muted)" }}>Inclui pagos e aguardando; exclui recusados. <b>Exportar Excel</b> gera a planilha do período escolhido (mês ou ano inteiro) com todos os lançamentos, total e abas de resumo por pessoa, cliente e categoria. "Por cliente" usa o nome digitado no lançamento — útil para repasse de custas.</div>
        </div>
      )}

      {editando && <EditarGastoModal d={editando} coordenador empresas={empresas} usuarios={usuarios} onClose={() => setEditando(null)}
        onSaved={async () => { setEditando(null); await recarregar(); toast("Gasto atualizado."); }}
        onDeleted={async () => { setEditando(null); await recarregar(); toast("Gasto excluído."); }} />}

      {/* modal recusa */}
      {recusa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} onClick={() => setRecusa(null)}>
          <div className="rounded-lg border p-4 w-full max-w-[420px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Recusar lançamento</div>
            <input className={inp} style={st} placeholder="motivo (a pessoa vai ver)" value={recusa.motivo} onChange={e => setRecusa({ ...recusa, motivo: e.target.value })} autoFocus />
            <div className="flex gap-1.5 mt-3"><button type="button" onClick={recusar} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao" style={{ background: "var(--alerta)" }}>Recusar</button><button type="button" onClick={() => setRecusa(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
