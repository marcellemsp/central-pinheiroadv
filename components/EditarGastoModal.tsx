"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { CATEGORIAS, MEIOS, type Despesa, brl } from "@/lib/despesas";

// Modal de edição/exclusão de um gasto. Usa as RPCs pa_editar_despesa / pa_excluir_despesa,
// que ajustam lote e caixinha quando o gasto já foi pago.
type Emp = { id: string; nome: string }; type Usu = { id: string; nome: string };

export default function EditarGastoModal({ d, coordenador, empresas = [], usuarios = [], onClose, onSaved, onDeleted }: {
  d: Despesa; coordenador: boolean; empresas?: Emp[]; usuarios?: Usu[]; onClose: () => void; onSaved: (novo: Despesa) => void; onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    data: d.data, usuario_id: d.usuario_id ?? "", pessoa_nome: d.pessoa_nome, empresa_id: d.empresa_id ?? "", cliente_txt: d.cliente_txt ?? "",
    local: d.local ?? "", categoria: d.categoria, meio: d.meio ?? "metro", valor: Number(d.valor).toFixed(2).replace(".", ","), obs: d.obs ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExcl, setConfirmarExcl] = useState(false);
  const transporte = f.categoria.startsWith("transporte");
  const valorNum = Number(f.valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  const podeExcluir = coordenador || d.status === "aguardando";

  async function salvar() {
    if (valorNum <= 0) { setErro("Informe o valor."); return; }
    if (!f.local.trim()) { setErro("Informe onde foi a diligência."); return; }
    setOcupado(true); setErro(null);
    const emp = empresas.find(e => e.id === f.empresa_id);
    const usu = usuarios.find(u => u.id === f.usuario_id);
    const p: Record<string, unknown> = {
      data: f.data, local: f.local.trim(), categoria: f.categoria, meio: transporte ? f.meio : "", valor: valorNum, obs: f.obs.trim(),
      empresa_id: f.empresa_id, cliente_txt: emp ? emp.nome : f.cliente_txt.trim(),
    };
    if (coordenador && usu) { p.usuario_id = usu.id; p.pessoa_nome = usu.nome; }
    const { error } = await supabase.rpc("pa_editar_despesa", { p_id: d.id, p });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    onSaved({ ...d, data: f.data, local: f.local.trim(), categoria: f.categoria, meio: transporte ? f.meio : null, valor: valorNum, obs: f.obs.trim() || null,
      empresa_id: f.empresa_id || null, cliente_txt: emp ? emp.nome : (f.cliente_txt.trim() || null), usuario_id: coordenador && usu ? usu.id : d.usuario_id, pessoa_nome: coordenador && usu ? usu.nome : d.pessoa_nome });
  }
  async function excluir() {
    setOcupado(true); setErro(null);
    const { error } = await supabase.rpc("pa_excluir_despesa", { p_id: d.id });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    onDeleted(d.id);
  }

  const inp = "w-full px-2.5 py-2 rounded text-[13px] border outline-none focus:border-acao";
  const st = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const lbl = "block text-[10px] font-bold uppercase tracking-wider mb-1";
  const chip = (on: boolean) => ({ background: on ? "var(--acao)" : "var(--bg-page)", borderColor: on ? "var(--acao)" : "var(--border)", color: on ? "var(--on-acao)" : "var(--text-secondary)" });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ background: "rgba(0,0,0,.5)" }} onClick={onClose}>
      <div className="rounded-t-2xl md:rounded-lg border p-4 w-full max-w-[560px] max-h-[92vh] overflow-y-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Editar gasto {d.status === "pago" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg, var(--ok))" }}>pago · lote #{d.lote_numero}</span>}</div>
          <button type="button" onClick={onClose} className="text-[18px] leading-none px-2" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        {d.status === "pago" && <div className="text-[11px] mb-3 px-3 py-2 rounded border" style={{ background: "var(--tag-amber-bg)", borderColor: "var(--atencao)", color: "var(--tag-amber-fg, var(--atencao))" }}>Este gasto já foi pago. Se o valor mudar, o total do lote #{d.lote_numero} e a caixinha são ajustados na mesma proporção.</div>}

        {coordenador && usuarios.length > 0 && <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Quem gastou</label><select className={inp} style={st} value={f.usuario_id} onChange={e => setF({ ...f, usuario_id: e.target.value })}>{!usuarios.some(u => u.id === f.usuario_id) && <option value="">{d.pessoa_nome} (sem usuário)</option>}{usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>O que foi</label><div className="flex flex-wrap gap-1.5">{CATEGORIAS.map(([k, l, ic]) => <button key={k} type="button" onClick={() => setF({ ...f, categoria: k })} className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border" style={chip(f.categoria === k)}>{ic} {l}</button>)}</div></div>
        {transporte && <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Meio</label><div className="flex flex-wrap gap-1.5">{MEIOS.map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, meio: k })} className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border" style={chip(f.meio === k)}>{l}</button>)}</div></div>}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Valor (R$)</label><input inputMode="decimal" className={inp + " text-[18px] font-bold"} style={st} value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></div>
          <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Data</label><input type="date" className={inp} style={st} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></div>
        </div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Diligência (onde)</label><input className={inp} style={st} value={f.local} onChange={e => setF({ ...f, local: e.target.value })} /></div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Cliente</label>
          <select className={inp} style={st} value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}><option value="">— cliente digitado / nenhum —</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
          {!f.empresa_id && <input className={inp + " mt-1.5"} style={st} placeholder="cliente (texto livre)" value={f.cliente_txt} onChange={e => setF({ ...f, cliente_txt: e.target.value })} />}</div>
        <div className="mb-3"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Observação</label><input className={inp} style={st} value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></div>
        {erro && <div className="text-[11.5px] mb-2 px-3 py-2 rounded" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{erro}</div>}
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" disabled={ocupado} onClick={salvar} className="px-4 py-2 rounded-md text-[12.5px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{ocupado ? "Salvando…" : `Salvar ${brl(valorNum)}`}</button>
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-[12.5px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
          {podeExcluir && (!confirmarExcl
            ? <button type="button" onClick={() => setConfirmarExcl(true)} className="ml-auto px-3 py-2 rounded-md text-[12.5px] font-semibold border" style={{ borderColor: "var(--alerta)", color: "var(--alerta)" }}>Excluir</button>
            : <span className="ml-auto flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{d.status === "pago" ? "Excluir e ajustar o lote e a caixinha?" : "Excluir de vez?"}<button type="button" disabled={ocupado} onClick={excluir} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-on-acao" style={{ background: "var(--alerta)" }}>Sim, excluir</button><button type="button" onClick={() => setConfirmarExcl(false)} className="px-2 py-1.5 text-[12px] underline">não</button></span>)}
        </div>
      </div>
    </div>
  );
}
