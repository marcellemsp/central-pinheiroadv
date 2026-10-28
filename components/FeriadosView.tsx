"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

// Configurações › Feriados e suspensões — fila de confirmação dos dias não úteis (tabela dias_nao_uteis).
// A rotina de calendário grava atos de tribunal como "pendente"; a calculadora só usa "confirmado".
// Confirmar/rejeitar/adicionar: só coordenador (RLS dnu_update). Os botões aparecem para todos; sem permissão → aviso.

export type DiaNaoUtil = {
  id: string; data: string; motivo: string; esferas: string[]; tipo: string; fonte: string | null;
  status: "confirmado" | "pendente" | "rejeitado"; observacao: string | null; criado_em: string; criado_por: string | null;
};

export const ESFERAS: [string, string][] = [
  ["nacional", "Nacional"], ["rj", "Estado RJ"], ["rio", "Município do Rio"], ["forense", "Forense (todos os tribunais)"],
  ["tjrj", "TJRJ"], ["trf2", "TRF2 / JFRJ"], ["stj", "STJ"], ["stf", "STF"], ["sefaz", "SEFAZ-RJ"], ["pgfn", "PGFN / RFB / CARF"],
];
const TIPOS: [string, string][] = [["feriado", "Feriado"], ["ponto_facultativo", "Ponto facultativo"], ["suspensao", "Suspensão de prazos"], ["recesso", "Recesso"]];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const dow = (d: string) => DIAS[new Date(d + "T12:00:00").getDay()];
const hojeIso = () => new Date().toISOString().slice(0, 10);
const MSG_SEM_PERMISSAO = "Você não tem permissão para esta ação. Peça a um coordenador.";

function Tag({ children, tom }: { children: ReactNode; tom: "blue" | "amber" | "red" | "gray" | "green" }) {
  const m = { blue: ["var(--tag-blue-bg)", "var(--tag-blue-fg)"], amber: ["var(--tag-amber-bg)", "var(--tag-amber-fg, var(--atencao))"], red: ["var(--tag-red-bg)", "var(--tag-red-fg)"], gray: ["var(--bg-page)", "var(--text-muted)"], green: ["var(--tag-green-bg)", "var(--tag-green-fg, var(--ok))"] }[tom];
  return <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: m[0], color: m[1] }}>{children}</span>;
}
const esferaLabel = (e: string) => ESFERAS.find(x => x[0] === e)?.[1] ?? e;
const ESFERAS_VALIDAS = new Set(ESFERAS.map(e => e[0]));
const TIPOS_VALIDOS = new Set(TIPOS.map(t => t[0]));

// ---- Importação do arquivo da rotina (04 Inteligência/_calendario_import.json) ----
type ItemImport = { data: string; motivo: string; esferas: string[]; tipo: string; fonte: string | null; status: "confirmado" | "pendente"; op?: string; ano?: number };
type Classificado = {
  item: ItemImport; futuro: boolean;
  acao: "novo" | "ampliacao" | "repetido" | "rejeitado" | "invalido";
  esferasFinais: string[]; alvo?: DiaNaoUtil; nota?: string; sel: boolean;
};
const uniq = (a: string[]) => [...new Set(a)].sort();
const superset = (a: string[], b: string[]) => b.every(x => a.includes(x));
const intersecta = (a: string[], b: string[]) => a.some(x => b.includes(x));

/** Regra 5b: classifica cada candidata contra as linhas existentes da mesma data. */
export function classificarImport(itens: ItemImport[], existentes: DiaNaoUtil[], hoje: string): Classificado[] {
  const porData = new Map<string, DiaNaoUtil[]>();
  for (const d of existentes) { if (!porData.has(d.data)) porData.set(d.data, []); porData.get(d.data)!.push(d); }
  const out: Classificado[] = [];
  const vistos = new Set<string>();
  for (const raw of itens) {
    if (raw.op === "semear") continue;
    const item: ItemImport = { ...raw, esferas: uniq((raw.esferas ?? []).map(e => String(e).toLowerCase())), status: raw.status === "confirmado" ? "confirmado" : "pendente", tipo: TIPOS_VALIDOS.has(raw.tipo) ? raw.tipo : "suspensao", fonte: raw.fonte ?? null };
    const futuro = item.data >= hoje;
    const chave = item.data + "|" + item.esferas.join(",");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.data) || !item.motivo || item.esferas.length === 0 || item.esferas.some(e => !ESFERAS_VALIDAS.has(e))) { out.push({ item, futuro, acao: "invalido", esferasFinais: item.esferas, nota: "data, motivo ou esferas inválidos", sel: false }); continue; }
    if (vistos.has(chave)) { out.push({ item, futuro, acao: "repetido", esferasFinais: item.esferas, nota: "duplicado dentro do arquivo", sel: false }); continue; }
    vistos.add(chave);
    const linhas = porData.get(item.data) ?? [];
    const ativas = linhas.filter(l => l.status !== "rejeitado");
    const cobre = ativas.find(l => superset(l.esferas, item.esferas));
    if (cobre) { out.push({ item, futuro, acao: "repetido", esferasFinais: item.esferas, alvo: cobre, nota: `já coberto (${cobre.status})`, sel: false }); continue; }
    const rejeitada = linhas.find(l => l.status === "rejeitado" && superset(l.esferas, item.esferas));
    if (rejeitada) { out.push({ item, futuro, acao: "rejeitado", esferasFinais: item.esferas, alvo: rejeitada, nota: "rejeitado anteriormente por um coordenador", sel: false }); continue; }
    const pend = ativas.find(l => l.status === "pendente" && intersecta(l.esferas, item.esferas));
    if (pend) { out.push({ item, futuro, acao: "ampliacao", esferasFinais: uniq([...pend.esferas, ...item.esferas]), alvo: pend, nota: `amplia linha pendente [${pend.esferas.join(", ")}]`, sel: futuro }); continue; }
    const confs = ativas.filter(l => l.status === "confirmado" && intersecta(l.esferas, item.esferas));
    if (confs.length) {
      const cobertas = new Set(confs.flatMap(l => l.esferas));
      const faltam = item.esferas.filter(e => !cobertas.has(e));
      if (faltam.length === 0) { out.push({ item, futuro, acao: "repetido", esferasFinais: item.esferas, nota: "esferas já confirmadas em linhas separadas", sel: false }); continue; }
      out.push({ item: { ...item, status: "pendente" }, futuro, acao: "novo", esferasFinais: faltam, nota: `só as esferas que faltam [${faltam.join(", ")}], como pendente`, sel: futuro }); continue;
    }
    out.push({ item, futuro, acao: "novo", esferasFinais: item.esferas, sel: futuro });
  }
  return out.sort((a, b) => a.item.data.localeCompare(b.item.data));
}

export default function FeriadosView({ dias: inicial, coordenador, userEmail, params }: { dias: DiaNaoUtil[]; coordenador: boolean; userEmail: string; params?: { aba?: string; ano?: string; busca?: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [dias, setDias] = useState<DiaNaoUtil[]>(inicial);
  const [aba, setAba] = useState<"pendentes" | "calendario" | "rejeitados">(params?.aba === "calendario" || params?.aba === "rejeitados" ? params.aba : "pendentes");
  const [ano, setAno] = useState(params?.ano && /^\d{4}$/.test(params.ano) ? Number(params.ano) : new Date().getFullYear());
  const [esfera, setEsfera] = useState("");
  const [busca, setBusca] = useState(params?.busca ?? "");
  const [soFuturos, setSoFuturos] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ t: string; tom: "ok" | "erro" } | null>(null);
  const [novo, setNovo] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ data: "", motivo: "", esferas: [] as string[], tipo: "suspensao", fonte: "" });
  const [imp, setImp] = useState<{ nome: string; geradoEm?: string; fontes?: { nome: string; url?: string; status?: string; erro?: string }[]; itens: Classificado[]; semear: number[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toast(t: string, tom: "ok" | "erro" = "ok") { setAviso({ t, tom }); setTimeout(() => setAviso(null), 3500); }

  const hoje = hojeIso();
  const pendentes = dias.filter(d => d.status === "pendente" && (!soFuturos || d.data >= hoje)).sort((a, b) => a.data.localeCompare(b.data));
  const porFonte = useMemo(() => {
    const m = new Map<string, DiaNaoUtil[]>();
    for (const d of pendentes) { const k = d.fonte || "(sem fonte)"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); }
    return [...m.entries()];
  }, [pendentes]);
  const anos = useMemo(() => [...new Set(dias.map(d => Number(d.data.slice(0, 4))))].sort(), [dias]);
  const lista = dias
    .filter(d => (aba === "calendario" ? d.status === "confirmado" : d.status === "rejeitado"))
    .filter(d => Number(d.data.slice(0, 4)) === ano)
    .filter(d => !esfera || d.esferas.includes(esfera))
    .filter(d => !busca || (d.motivo + " " + (d.fonte ?? "")).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.data.localeCompare(b.data));

  async function mudarStatus(ids: string[], status: "confirmado" | "rejeitado" | "pendente") {
    if (!coordenador) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
    setOcupado(ids.join(","));
    const obs = `${status} por ${userEmail} em ${fmt(hoje)}`;
    const { data, error } = await supabase.from("dias_nao_uteis").update({ status, observacao: obs }).in("id", ids).select("id");
    setOcupado(null);
    if (error) { toast(/permission|policy|denied/i.test(error.message) ? MSG_SEM_PERMISSAO : error.message, "erro"); return; }
    const ok = new Set((data ?? []).map((x: any) => x.id));
    if (ok.size === 0) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
    setDias(prev => prev.map(d => ok.has(d.id) ? { ...d, status, observacao: obs } : d));
    toast(`${ok.size} dia${ok.size > 1 ? "s" : ""} ${status === "confirmado" ? "confirmado" : status === "rejeitado" ? "rejeitado" : "devolvido à fila"}${ok.size > 1 ? "s" : ""}. A calculadora já considera.`);
  }

  async function salvar() {
    if (!f.data || !f.motivo.trim() || f.esferas.length === 0) { toast("Preencha data, motivo e ao menos uma esfera.", "erro"); return; }
    setOcupado("novo");
    if (editId) {
      const { data: upd, error: eUpd } = await supabase.from("dias_nao_uteis").update({ data: f.data, motivo: f.motivo.trim(), esferas: f.esferas, tipo: f.tipo, fonte: f.fonte.trim() || null }).eq("id", editId).select("*").maybeSingle();
      setOcupado(null);
      if (eUpd) { toast(/permission|policy|denied/i.test(eUpd.message) ? MSG_SEM_PERMISSAO : /duplicate|unique/i.test(eUpd.message) ? "Já existe um registro para esta data com as mesmas esferas." : eUpd.message, "erro"); return; }
      if (!upd) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
      setDias(prev => prev.map(d => d.id === editId ? (upd as DiaNaoUtil) : d));
      setNovo(false); setEditId(null); setF({ data: "", motivo: "", esferas: [], tipo: "suspensao", fonte: "" });
      toast("Dia atualizado. A calculadora já considera."); return;
    }
    const status = coordenador ? "confirmado" : "pendente";
    const { data, error } = await supabase.from("dias_nao_uteis").insert({ data: f.data, motivo: f.motivo.trim(), esferas: f.esferas, tipo: f.tipo, fonte: f.fonte.trim() || null, status, criado_por: userEmail, observacao: coordenador ? `confirmado na inclusão por ${userEmail}` : null }).select("*").maybeSingle();
    setOcupado(null);
    if (error) { toast(/duplicate|unique/i.test(error.message) ? "Já existe um registro para esta data com as mesmas esferas." : error.message, "erro"); return; }
    if (data) setDias(prev => [...prev, data as DiaNaoUtil]);
    setNovo(false); setF({ data: "", motivo: "", esferas: [], tipo: "suspensao", fonte: "" });
    toast(coordenador ? "Dia incluído e confirmado." : "Dia incluído como pendente — um coordenador precisa confirmar.");
  }

  function abrirEdicao(d: DiaNaoUtil) {
    if (!coordenador) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
    setEditId(d.id); setImp(null);
    setF({ data: d.data, motivo: d.motivo, esferas: d.esferas, tipo: d.tipo, fonte: d.fonte ?? "" });
    setNovo(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluir(d: DiaNaoUtil) {
    if (!coordenador) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
    if (!confirm(`Excluir definitivamente ${fmt(d.data)} — ${d.motivo}? Esta ação não pode ser desfeita.`)) return;
    setOcupado(d.id);
    const { error } = await supabase.from("dias_nao_uteis").delete().eq("id", d.id);
    setOcupado(null);
    if (error) { toast(/permission|policy|denied/i.test(error.message) ? MSG_SEM_PERMISSAO : error.message, "erro"); return; }
    setDias(prev => prev.filter(x => x.id !== d.id));
    if (editId === d.id) { setEditId(null); setNovo(false); }
    toast("Dia excluído.");
  }

  async function recarregar() {
    const anoIni = new Date().getFullYear() - 1;
    const { data } = await supabase.from("dias_nao_uteis").select("*").gte("data", `${anoIni}-01-01`).order("data").limit(2000);
    if (data) setDias(data as DiaNaoUtil[]);
  }

  async function abrirArquivo(file: File) {
    try {
      const txt = await file.text(); const j = JSON.parse(txt);
      const itens: ItemImport[] = Array.isArray(j) ? j : (j.itens ?? []);
      if (!Array.isArray(itens)) throw new Error("arquivo sem lista 'itens'");
      const semear = itens.filter((i: any) => i.op === "semear" && Number(i.ano) > 2000).map((i: any) => Number(i.ano));
      setImp({ nome: file.name, geradoEm: j.gerado_em, fontes: j.fontes, itens: classificarImport(itens, dias, hoje), semear });
      setNovo(false);
    } catch (e: any) { toast("Não consegui ler o arquivo: " + (e?.message ?? e), "erro"); }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function gravarImport() {
    if (!imp) return;
    if (!coordenador) { toast(MSG_SEM_PERMISSAO, "erro"); return; }
    const novos = imp.itens.filter(c => c.sel && c.acao === "novo");
    const ampl = imp.itens.filter(c => c.sel && c.acao === "ampliacao" && c.alvo);
    if (!novos.length && !ampl.length && !imp.semear.length) { toast("Nada selecionado para gravar.", "erro"); return; }
    setOcupado("import");
    const origem = `importado de ${imp.nome}${imp.geradoEm ? ` (gerado em ${imp.geradoEm.slice(0, 10)})` : ""} por ${userEmail} em ${fmt(hoje)}`;
    let ins = 0, upd = 0, erros: string[] = [];
    if (novos.length) {
      const linhas = novos.map(c => ({ data: c.item.data, motivo: c.item.motivo.trim(), esferas: c.esferasFinais, tipo: c.item.tipo, fonte: c.item.fonte, status: c.item.status, criado_por: "rotina calendario-prazos", observacao: origem }));
      for (let i = 0; i < linhas.length; i += 50) {
        const { data, error } = await supabase.from("dias_nao_uteis").insert(linhas.slice(i, i + 50)).select("id");
        if (error) erros.push(error.message); else ins += (data ?? []).length;
      }
    }
    for (const c of ampl) {
      const obs = `${c.alvo!.observacao ? c.alvo!.observacao + " | " : ""}esferas ampliadas [${c.item.esferas.join(", ")}] — ${c.item.fonte ?? "sem fonte"} — ${origem}`;
      const { data, error } = await supabase.from("dias_nao_uteis").update({ esferas: c.esferasFinais, observacao: obs }).eq("id", c.alvo!.id).eq("status", "pendente").select("id");
      if (error) erros.push(error.message); else upd += (data ?? []).length;
    }
    for (const ano of imp.semear) { const { error } = await supabase.rpc("pa_semear_feriados", { ano }); if (error) erros.push(`semear ${ano}: ${error.message}`); }
    await recarregar();
    setOcupado(null); setImp(null);
    if (erros.length) toast(`Gravado parcialmente (${ins} novos, ${upd} ampliações). Erros: ${erros[0]}`, "erro");
    else toast(`Importação concluída: ${ins} novo${ins !== 1 ? "s" : ""}, ${upd} ampliaç${upd !== 1 ? "ões" : "ão"}${imp.semear.length ? `, ${imp.semear.length} ano(s) semeado(s)` : ""}. Atos de tribunal ficaram em "Aguardando confirmação".`);
  }
  const toggleImp = (i: number) => setImp(prev => prev ? { ...prev, itens: prev.itens.map((c, k) => k === i ? { ...c, sel: !c.sel } : c) } : prev);
  const selGrupo = (filtro: (c: Classificado) => boolean, v: boolean) => setImp(prev => prev ? { ...prev, itens: prev.itens.map(c => filtro(c) && (c.acao === "novo" || c.acao === "ampliacao") ? { ...c, sel: v } : c) } : prev);

  const inp = "px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao w-full";
  const st = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const btn = "px-3 py-1.5 rounded-md text-xs font-semibold border disabled:opacity-50";
  const tab = (k: typeof aba, label: string, n?: number) => (
    <button key={k} type="button" onClick={() => setAba(k)} className="px-3 py-2 text-[12.5px] font-medium -mb-px border-b-2 whitespace-nowrap inline-flex items-center gap-1.5"
      style={{ color: aba === k ? "var(--acao)" : "var(--text-secondary)", borderColor: aba === k ? "var(--acao)" : "transparent", fontWeight: aba === k ? 600 : 500 }}>
      {label}{n !== undefined && n > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full text-on-acao" style={{ background: k === "pendentes" ? "var(--atencao)" : "var(--text-muted)" }}>{n}</span>}
    </button>
  );

  const Linha = ({ d, acoes }: { d: DiaNaoUtil; acoes: ReactNode }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t text-[12.5px]" style={{ borderColor: "var(--border)" }}>
      <div className="w-[92px] shrink-0"><b style={{ color: "var(--text-primary)" }}>{fmt(d.data)}</b> <span style={{ color: "var(--text-muted)" }}>{dow(d.data)}</span></div>
      <div className="flex-1 min-w-[200px]">
        <div style={{ color: "var(--text-primary)" }}>{d.motivo}</div>
        <div className="text-[10.5px] mt-0.5 flex flex-wrap gap-1 items-center" style={{ color: "var(--text-muted)" }}>
          <Tag tom="gray">{TIPOS.find(t => t[0] === d.tipo)?.[1] ?? d.tipo}</Tag>
          {d.esferas.map(e => <Tag key={e} tom="blue">{esferaLabel(e)}</Tag>)}
          {d.fonte && <span className="truncate max-w-[420px]" title={d.fonte}>· {d.fonte}</span>}
          {d.observacao && <span className="italic">· {d.observacao}</span>}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0 ml-auto">{acoes}{coordenador && <><button type="button" disabled={!!ocupado} onClick={() => abrirEdicao(d)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Editar">✎</button><button type="button" disabled={!!ocupado} onClick={() => excluir(d)} className={btn} style={{ borderColor: "var(--border)", color: "var(--alerta)" }} title="Excluir"></button></>}</div>
    </div>
  );

  return (
    <div>
      {aviso && <div className="fixed top-3 right-3 z-50 px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg text-on-acao" style={{ background: aviso.tom === "ok" ? "var(--ok)" : "var(--alerta)" }}>{aviso.t}</div>}

      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tab("pendentes", "Aguardando confirmação", dias.filter(d => d.status === "pendente" && d.data >= hoje).length)}
        {tab("calendario", "Calendário confirmado")}
        {tab("rejeitados", "Rejeitados")}
        <div className="ml-auto mb-1 flex gap-1.5">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f0 = e.target.files?.[0]; if (f0) abrirArquivo(f0); }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-md text-xs font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-surface)" }} title="Arquivo _calendario_import.json gerado pela rotina semanal (04 Inteligência)">⇪ Importar arquivo da rotina</button>
          <button type="button" onClick={() => { if (!novo) { setEditId(null); setF({ data: "", motivo: "", esferas: [], tipo: "suspensao", fonte: "" }); } setNovo(v => !v); setImp(null); }} className="px-3 py-1.5 rounded-md text-xs font-semibold text-on-acao" style={{ background: "var(--acao)" }}>{novo ? "Fechar" : "+ Adicionar dia"}</button>
        </div>
      </div>

      {imp && (() => {
        const grupos: [string, string, (c: Classificado) => boolean][] = [
          ["futuros", "Novos — datas futuras", c => c.acao === "novo" && c.futuro],
          ["ampliacoes", "Ampliações de linhas pendentes (regra 5b)", c => c.acao === "ampliacao"],
          ["historicos", "Novos — históricos (datas passadas)", c => c.acao === "novo" && !c.futuro],
          ["ignorados", "Ignorados — repetidos, rejeitados ou inválidos", c => ["repetido", "rejeitado", "invalido"].includes(c.acao)],
        ];
        const nSel = imp.itens.filter(c => c.sel).length;
        const fontesFalha = (imp.fontes ?? []).filter(f0 => f0.status && f0.status !== "ok");
        return (
          <div className="mt-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--acao)" }}>
            <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--acao)" }}>Prévia da importação</div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>{imp.nome}</b>{imp.geradoEm ? ` · gerado em ${fmt(imp.geradoEm.slice(0, 10))}` : ""} · {imp.itens.length} candidatas · {nSel} selecionada{nSel !== 1 ? "s" : ""}{imp.semear.length ? ` · semear ${imp.semear.join(", ")}` : ""}</div>
                {fontesFalha.length > 0 && <div className="text-[11px] mt-1" style={{ color: "var(--tag-amber-fg, var(--atencao))" }}>Fontes que a rotina não conseguiu ler: {fontesFalha.map(f0 => f0.nome).join("; ")} — conferir manualmente.</div>}
              </div>
              <button type="button" disabled={!!ocupado || nSel === 0} onClick={gravarImport} className="px-4 py-2 rounded-md text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{ocupado === "import" ? "Gravando…" : `Gravar ${nSel} selecionada${nSel !== 1 ? "s" : ""}`}</button>
              <button type="button" onClick={() => setImp(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
            </div>
            {grupos.map(([k, titulo, filtro]) => {
              const lista2 = imp.itens.map((c, i) => [c, i] as const).filter(([c]) => filtro(c));
              if (!lista2.length) return null;
              const selecionavel = k !== "ignorados";
              return (
                <div key={k}>
                  <div className="px-4 py-2 text-[10.5px] font-bold uppercase tracking-widest flex items-center gap-3 border-b" style={{ color: "var(--text-muted)", background: "var(--bg-page)", borderColor: "var(--border)" }}>
                    <span>{titulo} · {lista2.length}</span>
                    {selecionavel && <span className="ml-auto flex gap-2 normal-case tracking-normal font-semibold"><button type="button" className="underline" onClick={() => selGrupo(filtro, true)}>marcar todos</button><button type="button" className="underline" onClick={() => selGrupo(filtro, false)}>desmarcar</button></span>}
                  </div>
                  {lista2.map(([c, i]) => (
                    <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b text-[12px]" style={{ borderColor: "var(--border)", opacity: selecionavel ? 1 : 0.6 }}>
                      {selecionavel ? <input type="checkbox" checked={c.sel} onChange={() => toggleImp(i)} /> : <span className="w-[13px]" />}
                      <div className="w-[88px] shrink-0"><b style={{ color: "var(--text-primary)" }}>{fmt(c.item.data)}</b> <span style={{ color: "var(--text-muted)" }}>{dow(c.item.data)}</span></div>
                      <div className="flex-1 min-w-[200px]">
                        <div style={{ color: "var(--text-primary)" }}>{c.item.motivo}</div>
                        <div className="text-[10.5px] mt-0.5 flex flex-wrap gap-1 items-center" style={{ color: "var(--text-muted)" }}>
                          <Tag tom={c.item.status === "confirmado" ? "green" : "amber"}>{c.item.status === "confirmado" ? "entra confirmado (lei)" : "entra pendente"}</Tag>
                          <Tag tom="gray">{TIPOS.find(t => t[0] === c.item.tipo)?.[1] ?? c.item.tipo}</Tag>
                          {c.esferasFinais.map(e => <Tag key={e} tom="blue">{esferaLabel(e)}</Tag>)}
                          {c.item.fonte && (/^https?:/.test(c.item.fonte) ? <a href={c.item.fonte.split(" ")[0]} target="_blank" rel="noreferrer" className="underline truncate max-w-[380px]" title={c.item.fonte}>fonte ↗</a> : <span className="truncate max-w-[380px]" title={c.item.fonte}>· {c.item.fonte}</span>)}
                          {c.nota && <span className="italic">· {c.nota}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="px-4 py-2 text-[10.5px]" style={{ color: "var(--text-muted)" }}>Históricos vêm desmarcados por padrão (servem só de registro). Repetidos e rejeitados nunca são gravados. Nada aqui altera linhas já confirmadas.</div>
          </div>
        );
      })()}

      {novo && (
        <div className="mt-3 rounded-lg border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>{editId ? "Editar dia não útil" : "Novo dia não útil"}{editId ? "" : (coordenador ? " (entra confirmado)" : " (entra como pendente)")}</div>
          <div className="grid grid-cols-1 md:grid-cols-[150px_1fr_180px] gap-2.5">
            <div><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Data</label><input type="date" className={inp} style={st} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Motivo</label><input className={inp} style={st} placeholder="ex.: Suspensão de prazos — Ato TJRJ nº 123/2026" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Tipo</label><select className={inp} style={st} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="md:col-span-2"><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Fonte (ato, portaria, link)</label><input className={inp} style={st} placeholder="ex.: https://www.tjrj.jus.br/… ou Portaria PRES/TRF2 nº 32/2026" value={f.fonte} onChange={e => setF({ ...f, fonte: e.target.value })} /></div>
            <div className="md:col-span-3"><label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Vale para</label>
              <div className="flex flex-wrap gap-1.5">{ESFERAS.map(([k, l]) => { const on = f.esferas.includes(k); return <button key={k} type="button" onClick={() => setF({ ...f, esferas: on ? f.esferas.filter(x => x !== k) : [...f.esferas, k] })} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ background: on ? "var(--acao)" : "var(--bg-page)", borderColor: on ? "var(--acao)" : "var(--border)", color: on ? "var(--on-acao)" : "var(--text-secondary)" }}>{l}</button>; })}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3"><button type="button" disabled={ocupado === "novo"} onClick={salvar} className="px-4 py-2 rounded-md text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>Salvar</button><button type="button" onClick={() => { setNovo(false); setEditId(null); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
        </div>
      )}

      {aba === "pendentes" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] mb-2 px-1" style={{ color: "var(--text-secondary)" }}>
            <span>Dias gravados pela rotina de calendário (atos de tribunal e órgãos) que ainda <b>não</b> entram na calculadora. Confirme após conferir a fonte.</span>
            <label className="inline-flex items-center gap-1.5 ml-auto cursor-pointer"><input type="checkbox" checked={soFuturos} onChange={e => setSoFuturos(e.target.checked)} /> só datas futuras</label>
          </div>
          {porFonte.length === 0 && <div className="rounded-lg border px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>Nada aguardando confirmação{soFuturos ? " (datas futuras)" : ""}. ✓</div>}
          {porFonte.map(([fonte, itens]) => (
            <div key={fonte} className="rounded-lg border mb-3 overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ background: "var(--bg-page)" }}>
                <div className="min-w-0 flex-1 text-[11.5px]" style={{ color: "var(--text-secondary)" }}><b style={{ color: "var(--text-primary)" }}>Fonte:</b> {/^https?:/.test(fonte) ? <a href={fonte} target="_blank" rel="noreferrer" className="underline break-all">{fonte}</a> : fonte} <Tag tom="amber">{itens.length} pendente{itens.length > 1 ? "s" : ""}</Tag></div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" disabled={!!ocupado} onClick={() => mudarStatus(itens.map(i => i.id), "confirmado")} className={btn} style={{ background: "var(--ok)", borderColor: "var(--ok)", color: "var(--on-acao)" }}>✓ Confirmar todos ({itens.length})</button>
                  <button type="button" disabled={!!ocupado} onClick={() => mudarStatus(itens.map(i => i.id), "rejeitado")} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Rejeitar todos</button>
                </div>
              </div>
              {itens.map(d => <Linha key={d.id} d={d} acoes={<>
                <button type="button" disabled={!!ocupado} onClick={() => mudarStatus([d.id], "confirmado")} className={btn} style={{ background: "var(--tag-green-bg)", borderColor: "transparent", color: "var(--tag-green-fg, var(--ok))" }}>✓ Confirmar</button>
                <button type="button" disabled={!!ocupado} onClick={() => mudarStatus([d.id], "rejeitado")} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Rejeitar</button>
              </>} />)}
            </div>
          ))}
        </div>
      )}

      {aba !== "pendentes" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={ano} onChange={e => setAno(Number(e.target.value))}>{(anos.length ? anos : [ano]).map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select className="px-2.5 py-1.5 rounded text-[12px] border" style={st} value={esfera} onChange={e => setEsfera(e.target.value)}><option value="">todas as esferas</option>{ESFERAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="px-2.5 py-1.5 rounded text-[12px] border flex-1 min-w-[160px]" style={st} placeholder="buscar motivo ou fonte…" value={busca} onChange={e => setBusca(e.target.value)} />
            <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>{lista.length} dia{lista.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            {lista.length === 0 && <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Nenhum registro com esses filtros.</div>}
            {lista.map(d => <Linha key={d.id} d={d} acoes={aba === "calendario"
              ? <button type="button" disabled={!!ocupado} onClick={() => { if (confirm(`Devolver ${fmt(d.data)} à fila de pendentes? A calculadora deixa de descontar este dia até nova confirmação.`)) mudarStatus([d.id], "pendente"); }} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Devolver à fila">↩ Rever</button>
              : <button type="button" disabled={!!ocupado} onClick={() => mudarStatus([d.id], "pendente")} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>↩ Voltar à fila</button>} />)}
          </div>
        </div>
      )}

      <div className="text-[10.5px] mt-3 px-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Feriados por lei (nacionais, São Jorge, São Sebastião), Carnaval, Corpus Christi, recesso forense (CPC art. 220) e férias de julho do STJ/STF são semeados automaticamente por ano. Atos de tribunal chegam pela rotina semanal e ficam aqui até um coordenador confirmar. A <Link href="/prazos/calculadora" className="underline">calculadora de prazos</Link> avisa quando há dia pendente dentro de um período contado.
      </div>
    </div>
  );
}
