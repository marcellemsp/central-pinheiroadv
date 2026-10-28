"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { CATEGORIAS, MEIOS, type Despesa, brl, fmtD, hojeIso, catLabel, catIcon, meioLabel } from "@/lib/despesas";
import EditarGastoModal from "./EditarGastoModal";

// Lançar gasto de diligência (todos os usuários). Coordenador pode lançar em nome de outra pessoa.
type Emp = { id: string; nome: string };
type Usu = { id: string; nome: string };

export default function LancarGastoView({ userId, userName, coordenador, empresas, usuarios, minhas }: {
  userId: string; userName: string; coordenador: boolean; empresas: Emp[]; usuarios: Usu[]; minhas: Despesa[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lista, setLista] = useState<Despesa[]>(minhas);
  const [cat, setCat] = useState("transporte_ida");
  const [meio, setMeio] = useState("metro");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeIso());
  const [local, setLocal] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [clienteTxt, setClienteTxt] = useState("");
  const [obs, setObs] = useState("");
  const [pessoa, setPessoa] = useState(userId);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ t: string; tom: "ok" | "erro" } | null>(null);
  const [anexando, setAnexando] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState<Despesa | null>(null);

  function toast(t: string, tom: "ok" | "erro" = "ok") { setAviso({ t, tom }); setTimeout(() => setAviso(null), 3500); }
  const transporte = cat.startsWith("transporte");
  const valorNum = Number(valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  const aReembolsar = lista.filter(d => d.status === "aguardando").reduce((s, d) => s + Number(d.valor), 0);

  async function upload(file: File, uid: string): Promise<string> {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw new Error("Falha ao enviar o comprovante: " + error.message);
    return path;
  }

  async function lancar() {
    if (valorNum <= 0) { toast("Informe o valor.", "erro"); return; }
    if (!data) { toast("Informe a data.", "erro"); return; }
    if (!local.trim()) { toast("Informe onde foi a diligência (SEFAZ-RJ, TJRJ…).", "erro"); return; }
    if (!arquivo) { toast("Anexe a foto ou o PDF do comprovante — sem ele não há reembolso.", "erro"); return; }
    setSalvando(true);
    try {
      const uid = coordenador ? pessoa : userId;
      const nome = usuarios.find(u => u.id === uid)?.nome ?? userName;
      const path = await upload(arquivo, uid);
      const emp = empresas.find(e => e.id === empresaId);
      const { data: row, error } = await supabase.from("despesas").insert({
        data, usuario_id: uid, pessoa_nome: nome, empresa_id: empresaId || null, cliente_txt: emp ? emp.nome : (clienteTxt.trim() || null),
        local: local.trim(), categoria: cat, meio: transporte ? meio : null, valor: valorNum, comprovante_path: path, obs: obs.trim() || null, criado_por: userName,
      }).select("*").single();
      if (error) throw new Error(error.message);
      setLista(prev => [row as Despesa, ...prev]);
      setValor(""); setObs(""); setArquivo(null); if (fileRef.current) fileRef.current.value = "";
      // mantém categoria/meio/local/cliente para o lançamento seguinte (ida → volta)
      if (cat === "transporte_ida") setCat("transporte_volta");
      toast(`Gasto de ${brl(valorNum)} lançado. Fica "aguardando" até o coordenador pagar.`);
    } catch (e: any) { toast(e?.message ?? String(e), "erro"); }
    setSalvando(false);
  }

  async function anexar(d: Despesa, file: File) {
    setAnexando(d.id);
    try {
      const path = await upload(file, d.usuario_id ?? userId);
      const { error } = await supabase.from("despesas").update({ comprovante_path: path }).eq("id", d.id);
      if (error) throw new Error(error.message);
      setLista(prev => prev.map(x => x.id === d.id ? { ...x, comprovante_path: path } : x));
      toast("Comprovante anexado.");
    } catch (e: any) { toast(e?.message ?? String(e), "erro"); }
    setAnexando(null);
  }

  async function verComprovante(path: string) {
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast("Não consegui abrir o comprovante.", "erro"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const inp = "w-full px-3 py-2.5 rounded-lg text-[14px] border outline-none focus:border-acao";
  const st = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const lbl = "block text-[10px] font-bold uppercase tracking-wider mb-1";
  const chip = (on: boolean) => ({ background: on ? "var(--acao)" : "var(--bg-surface)", borderColor: on ? "var(--acao)" : "var(--border)", color: on ? "var(--on-acao)" : "var(--text-secondary)" });
  const statusTag = (d: Despesa) => d.status === "pago" ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg, var(--ok))" }}>pago {fmtD(d.pago_em)}{d.lote_numero ? ` · lote #${d.lote_numero}` : ""}</span>
    : d.status === "recusado" ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }} title={d.motivo_recusa ?? ""}>recusado{d.motivo_recusa ? ` · ${d.motivo_recusa}` : ""}</span>
    : !d.comprovante_path ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>sem comprovante</span>
    : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>aguardando</span>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,460px)_1fr] gap-5">
      {aviso && <div className="fixed top-3 right-3 z-50 px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg text-on-acao" style={{ background: aviso.tom === "ok" ? "var(--ok)" : "var(--alerta)" }}>{aviso.t}</div>}

      {/* formulário */}
      <div className="rounded-lg border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="flex items-baseline justify-between gap-2 mb-3"><div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Lançar gasto</div><div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>a reembolsar: <b style={{ color: "var(--atencao)" }}>{brl(aReembolsar)}</b></div></div>

        {coordenador && usuarios.length > 0 && (
          <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Quem gastou</label>
            <select className={inp} style={st} value={pessoa} onChange={e => setPessoa(e.target.value)}>{usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        )}

        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>O que foi</label>
          <div className="flex flex-wrap gap-1.5">{CATEGORIAS.map(([k, l, ic]) => <button key={k} type="button" onClick={() => setCat(k)} className="px-3 py-1.5 rounded-full text-[12px] font-semibold border" style={chip(cat === k)}>{ic} {l}</button>)}</div></div>

        {transporte && <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Meio</label>
          <div className="flex flex-wrap gap-1.5">{MEIOS.map(([k, l]) => <button key={k} type="button" onClick={() => setMeio(k)} className="px-3 py-1.5 rounded-full text-[12px] font-semibold border" style={chip(meio === k)}>{l}</button>)}</div></div>}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Valor (R$)</label><input inputMode="decimal" className={inp + " text-[20px] font-bold"} style={st} placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Data</label><input type="date" className={inp} style={st} value={data} onChange={e => setData(e.target.value)} /></div>
        </div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Diligência (onde)</label><input className={inp} style={st} placeholder="ex.: SEFAZ-RJ e TJRJ · Fórum de Niterói · PGFN" value={local} onChange={e => setLocal(e.target.value)} list="locais-sugeridos" />
          <datalist id="locais-sugeridos">{["SEFAZ-RJ", "TJRJ", "TRF-2 / JFRJ", "PGE-RJ", "PGFN", "CODIN", "Prefeitura do Rio", "Cartório", "Fórum de Niterói", "Fórum de Nova Iguaçu", "RFB", "MPRJ", "INEA"].map(s => <option key={s} value={s} />)}</datalist></div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Cliente</label>
          <select className={inp} style={st} value={empresaId} onChange={e => setEmpresaId(e.target.value)}><option value="">— escolher cliente cadastrado —</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
          {!empresaId && <input className={inp + " mt-1.5"} style={st} placeholder="ou digite (ex.: Exact e Mopi · escritório)" value={clienteTxt} onChange={e => setClienteTxt(e.target.value)} />}</div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Comprovante (obrigatório)</label>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed px-3 py-4 text-[12.5px] text-center" style={{ borderColor: arquivo ? "var(--ok)" : "var(--border)", color: arquivo ? "var(--text-primary)" : "var(--text-secondary)", background: "var(--bg-page)" }}>
            {arquivo ? <>✓ <b>{arquivo.name}</b> <span style={{ color: "var(--text-muted)" }}>({Math.round(arquivo.size / 1024)} KB)</span> · trocar</> : <>Tirar foto ou escolher PDF</>}
          </button></div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Observação (opcional)</label><input className={inp} style={st} value={obs} onChange={e => setObs(e.target.value)} /></div>
        <button type="button" disabled={salvando} onClick={lancar} className="w-full py-3 rounded-lg text-[14px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{salvando ? "Enviando…" : `Lançar${valorNum > 0 ? ` ${brl(valorNum)}` : ""}`}</button>
        <div className="text-[10.5px] mt-2" style={{ color: "var(--text-muted)" }}>Depois de lançar a ida, a categoria já muda para "volta" para agilizar. O gasto fica "aguardando" até um coordenador pagar o lote; você vê o status aqui ao lado.</div>
      </div>

      {/* meus lançamentos */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-2"><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{coordenador ? "Lançamentos recentes" : "Meus lançamentos"}</div>{coordenador && <Link href="/diligencias" className="text-[12px] underline" style={{ color: "var(--acao)" }}>ir para o painel de reembolsos →</Link>}</div>
        <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {lista.length === 0 && <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Nenhum gasto lançado ainda.</div>}
          {lista.map(d => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b text-[12.5px]" style={{ borderColor: "var(--border)" }}>
              <div className="w-[52px] shrink-0" style={{ color: "var(--text-secondary)" }}>{fmtD(d.data).slice(0, 5)}</div>
              <div className="flex-1 min-w-[180px]">
                <div style={{ color: "var(--text-primary)" }}><b>{d.local}</b>{d.cliente_txt ? <span style={{ color: "var(--text-secondary)" }}> · {d.cliente_txt}</span> : ""}</div>
                <div className="text-[10.5px] flex flex-wrap gap-1.5 items-center mt-0.5" style={{ color: "var(--text-muted)" }}>{catIcon(d.categoria)} {catLabel(d.categoria)}{d.meio ? ` · ${meioLabel(d.meio)}` : ""}{coordenador ? ` · ${d.pessoa_nome}` : ""} {statusTag(d)}</div>
              </div>
              <div className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{brl(Number(d.valor))}</div>
              <div className="flex gap-1.5">
                {(coordenador || d.status === "aguardando") && <button type="button" onClick={() => setEditando(d)} className="px-2 py-1 rounded text-[11px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} title="Editar ou excluir">✎</button>}
                {d.comprovante_path ? <button type="button" onClick={() => verComprovante(d.comprovante_path!)} className="px-2 py-1 rounded text-[11px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--acao)" }}>ver</button>
                  : d.status === "aguardando" && <><input type="file" accept="image/*,application/pdf" className="hidden" id={`anx-${d.id}`} onChange={e => { const f = e.target.files?.[0]; if (f) anexar(d, f); }} /><label htmlFor={`anx-${d.id}`} className="px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer" style={{ borderColor: "var(--alerta)", color: "var(--alerta)" }}>{anexando === d.id ? "enviando…" : "anexar comprovante"}</label></>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {editando && <EditarGastoModal d={editando} coordenador={coordenador} empresas={empresas} usuarios={usuarios} onClose={() => setEditando(null)}
        onSaved={n => { setLista(prev => prev.map(x => x.id === n.id ? n : x)); setEditando(null); toast("Gasto atualizado."); }}
        onDeleted={id => { setLista(prev => prev.filter(x => x.id !== id)); setEditando(null); toast("Gasto excluído."); }} />}
    </div>
  );
}
