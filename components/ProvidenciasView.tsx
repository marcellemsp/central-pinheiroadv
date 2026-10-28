"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { TIPOS_PEND } from "./CasoView";
import type { Providencia } from "@/lib/alertes";

// Configurações › Providências: lista "o que vai ser feito → quantos dias" usada na destinação dos Alertes.
export default function ProvidenciasView({ itens: ini, coordenador }: { itens: Providencia[]; coordenador: boolean }) {
  const router = useRouter(); const supabase = useMemo(() => createClient(), []);
  const [itens, setItens] = useState<Providencia[]>(ini);
  const [edit, setEdit] = useState<Partial<Providencia> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inp = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
  const st = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const lbl = "block text-[10px] font-bold uppercase tracking-wider mb-1";
  const btn = "px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap disabled:opacity-50";

  async function salvar() {
    if (!edit) return; if (!edit.nome?.trim()) { setErro("Dê um nome."); return; }
    setOcupado(true); setErro(null);
    const row = { nome: edit.nome.trim(), dias: edit.dias === null || edit.dias === undefined || (edit.dias as any) === "" ? null : Number(edit.dias), contagem: edit.contagem ?? "uteis", tipo_pend: edit.tipo_pend ?? "peca", titulo_padrao: edit.titulo_padrao?.trim() || null, ler_prazo_do_teor: !!edit.ler_prazo_do_teor, ordem: Number(edit.ordem ?? 100), ativo: edit.ativo ?? true };
    const q = edit.id ? supabase.from("providencias").update(row).eq("id", edit.id).select("*").single() : supabase.from("providencias").insert(row).select("*").single();
    const { data, error } = await q; setOcupado(false);
    if (error) { setErro(error.message); return; }
    setItens(prev => { const n = prev.filter(x => x.id !== (data as any).id); n.push(data as Providencia); return n.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)); });
    setEdit(null); router.refresh();
  }
  async function excluir(p: Providencia) {
    if (!confirm(`Excluir "${p.nome}"? Destinações já feitas não mudam.`)) return;
    const { error } = await supabase.from("providencias").delete().eq("id", p.id); if (error) { setErro(error.message); return; }
    setItens(prev => prev.filter(x => x.id !== p.id));
  }
  async function toggle(p: Providencia) {
    const { error } = await supabase.from("providencias").update({ ativo: !p.ativo }).eq("id", p.id); if (error) { setErro(error.message); return; }
    setItens(prev => prev.map(x => x.id === p.id ? { ...x, ativo: !x.ativo } : x));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>Na destinação de um alerte, quem escolhe a providência recebe o prazo daqui, contado da publicação em dias úteis do tribunal (calendário de feriados). Sempre editável antes de enviar e na aprovação.</div>
        {coordenador && <button onClick={() => setEdit({ nome: "", dias: 15, contagem: "uteis", tipo_pend: "peca", titulo_padrao: "", ler_prazo_do_teor: false, ordem: 100, ativo: true })} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Nova providência</button>}
      </div>
      <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><table className="w-full text-[12.5px] table-fixed min-w-[760px]">
        <colgroup><col style={{ width: "30%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /><col style={{ width: "24%" }} /><col style={{ width: "8%" }} /><col style={{ width: "12%" }} /></colgroup>
        <thead><tr style={{ background: "var(--bg-page)" }}>{["Providência", "Prazo", "Tipo", "Título padrão da pendência", "Ordem", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{h}</th>)}</tr></thead>
        <tbody>{itens.map(p => <tr key={p.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", opacity: p.ativo ? 1 : 0.5 }}>
          <td className="px-3 py-2.5 font-semibold" style={{ color: "var(--text-primary)" }}>{p.nome}{!p.ativo && <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(inativa)</span>}</td>
          <td className="px-3 py-2.5">{p.ler_prazo_do_teor ? <span style={{ color: "var(--atencao)" }}>lê do teor{p.dias ? `, senão ${p.dias}` : ""}</span> : p.dias ? `${p.dias} dias ${p.contagem === "corridos" ? "corridos" : "úteis"}` : <span style={{ color: "var(--text-muted)" }}>a digitar</span>}</td>
          <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{TIPOS_PEND.find(t => t[0] === p.tipo_pend)?.[1] ?? p.tipo_pend}</td>
          <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{p.titulo_padrao ?? "—"}</td>
          <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{p.ordem}</td>
          <td className="px-3 py-2.5 text-right whitespace-nowrap">{coordenador && <><button onClick={() => setEdit(p)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>✎</button> <button onClick={() => toggle(p)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title={p.ativo ? "Desativar" : "Reativar"}>{p.ativo ? "" : "▶"}</button> <button onClick={() => excluir(p)} className={btn} style={{ borderColor: "var(--alerta)", color: "var(--alerta)" }}></button></>}</td>
        </tr>)}</tbody></table></div>
      {erro && <div className="mt-2 px-3 py-2 rounded text-xs" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{erro}</div>}
      <div className="text-[10.5px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>Regra geral CPC: recursos 15 dias úteis; embargos de declaração 5; manifestação sem prazo expresso 5 (art. 218 §3º). Embargos à execução fiscal 30 (LEF art. 16). Processo administrativo fiscal em dias corridos (Dec. 70.235). "Lê do teor" pega "no prazo de N dias" da própria publicação.</div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} onClick={() => setEdit(null)}>
          <div className="rounded-lg border p-4 w-full max-w-[520px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{edit.id ? "Editar providência" : "Nova providência"}</div>
            <div className="mb-2.5"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Nome (como aparece na lista)</label><input className={inp} style={st} value={edit.nome ?? ""} onChange={e => setEdit({ ...edit, nome: e.target.value })} autoFocus /></div>
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Dias</label><input inputMode="numeric" className={inp} style={st} value={edit.dias ?? ""} onChange={e => setEdit({ ...edit, dias: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} placeholder="vazio = digitar" /></div>
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Contagem</label><select className={inp} style={st} value={edit.contagem ?? "uteis"} onChange={e => setEdit({ ...edit, contagem: e.target.value as any })}><option value="uteis">dias úteis</option><option value="corridos">corridos</option></select></div>
              <div><label className={lbl} style={{ color: "var(--text-secondary)" }}>Tipo de pendência</label><select className={inp} style={st} value={edit.tipo_pend ?? "peca"} onChange={e => setEdit({ ...edit, tipo_pend: e.target.value })}>{TIPOS_PEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            </div>
            <div className="mb-2.5"><label className={lbl} style={{ color: "var(--text-secondary)" }}>Título padrão da pendência</label><input className={inp} style={st} value={edit.titulo_padrao ?? ""} onChange={e => setEdit({ ...edit, titulo_padrao: e.target.value })} placeholder="ex.: Embargos de declaração" /></div>
            <div className="flex items-center gap-4 mb-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={!!edit.ler_prazo_do_teor} onChange={e => setEdit({ ...edit, ler_prazo_do_teor: e.target.checked })} /> ler prazo do teor da publicação</label>
              <label className="inline-flex items-center gap-1.5">Ordem <input inputMode="numeric" className={inp + " !w-[70px]"} style={st} value={edit.ordem ?? 100} onChange={e => setEdit({ ...edit, ordem: Number(e.target.value.replace(/\D/g, "") || 0) })} /></label>
            </div>
            {erro && <div className="mb-2 px-3 py-2 rounded text-xs" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{erro}</div>}
            <div className="flex gap-1.5"><button disabled={ocupado} onClick={salvar} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--ok)" }}>{ocupado ? "Salvando…" : "Salvar"}</button><button onClick={() => setEdit(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
