"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { primeiroNome, mesmoNome } from "./CasoView";

// Aprovações › Exclusões — coordenador aprova/devolve pedidos; adv vê os próprios pedidos e pode cancelar.
export type Exclusao = {
  id: string; tabela: string; row_id: string; contexto: any; motivo: string;
  pedido_por: string; pedido_em: string; status: "pendente" | "aprovada" | "devolvida" | "cancelada";
  decidido_por: string | null; decidido_em: string | null; decisao_obs: string | null;
};

const TAB_LABEL: Record<string, string> = {
  caso_pendencias: "Pendência", caso_andamentos: "Andamento", casos: "Caso", empresas: "Cliente",
  alertes: "Publicação", providencias: "Providência", despesas: "Diligência",
  reembolso_lotes: "Lote de reembolso", caixa_movimentos: "Movimento da caixa", dias_nao_uteis: "Dia não útil",
};
const TAB_COR: Record<string, "blue" | "amber" | "purple" | "gray" | "green" | "red"> = {
  caso_pendencias: "blue", caso_andamentos: "amber", casos: "purple", empresas: "purple",
  alertes: "gray", providencias: "gray", despesas: "green", reembolso_lotes: "green", caixa_movimentos: "green", dias_nao_uteis: "gray",
};

const fmtDT = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const relTempo = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 36e5; if (h < 1) return `há ${Math.max(1, Math.round(h * 60))} min`; if (h < 24) return `há ${Math.round(h)} h`; return `há ${Math.round(h / 24)} d`; };

export default function ExclusoesView({ pedidos: ini, userName, coordenador }: { pedidos: Exclusao[]; userName: string; coordenador: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const eu = primeiroNome(userName);
  const [aba, setAba] = useState<"pendentes" | "historico">("pendentes");
  const [decidindo, setDecidindo] = useState<null | { p: Exclusao; acao: "aprovar" | "devolver"; obs: string }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase.channel("exclusoes-live").on("postgres_changes", { event: "*", schema: "public", table: "exclusoes_pendentes" }, () => router.refresh()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendentes = ini.filter(p => p.status === "pendente").sort((a, b) => b.pedido_em.localeCompare(a.pedido_em));
  const historico = ini.filter(p => p.status !== "pendente").sort((a, b) => (b.decidido_em ?? "").localeCompare(a.decidido_em ?? ""));
  const meusPedidos = pendentes.filter(p => mesmoNome(p.pedido_por, eu)).length;

  async function decidir() {
    if (!decidindo) return; setOcupado(true); setErro(null);
    const fn = decidindo.acao === "aprovar" ? "pa_aprovar_exclusao" : "pa_devolver_exclusao";
    const { error } = await supabase.rpc(fn, { p_id: decidindo.p.id, p_obs: decidindo.obs.trim() });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    setAviso(decidindo.acao === "aprovar" ? "✓ Item apagado." : "↩ Devolvido — o item voltou ao normal."); setTimeout(() => setAviso(null), 3500);
    setDecidindo(null); router.refresh();
  }
  async function cancelar(p: Exclusao) {
    if (!confirm(`Cancelar seu pedido de exclusão?\n\n${resumoLinha(p)}\n\nO item volta ao normal.`)) return;
    const { error } = await supabase.rpc("pa_cancelar_exclusao", { p_id: p.id });
    if (error) { alert(error.message); return; }
    setAviso("↩ Pedido cancelado — item voltou ao normal."); setTimeout(() => setAviso(null), 3500);
    router.refresh();
  }

  // ---- helpers de UI ----
  const btn = "px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap disabled:opacity-50";
  const stcss = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
  const Tag = ({ t, cls }: { t: string; cls: "gray" | "blue" | "amber" | "red" | "green" | "purple" }) => { const m = { gray: ["var(--bg-page)", "var(--text-muted)"], blue: ["var(--tag-blue-bg)", "var(--tag-blue-fg)"], amber: ["var(--tag-amber-bg)", "var(--tag-amber-fg)"], red: ["var(--tag-red-bg)", "var(--tag-red-fg)"], green: ["var(--tag-green-bg)", "var(--tag-green-fg)"], purple: ["var(--destaque-tint)", "var(--destaque)"] }[cls]; return <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide whitespace-nowrap" style={{ background: m[0], color: m[1] }}>{t}</span>; };
  const Kpi = ({ v, l, c }: { v: string | number; l: string; c?: string }) => <div className="rounded-lg border px-3.5 py-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><div className="text-[20px] font-bold leading-tight" style={{ color: c ?? "var(--text-primary)" }}>{v}</div><div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>{l}</div></div>;
  const label = (t: string) => TAB_LABEL[t] ?? t; const cor = (t: string) => TAB_COR[t] ?? "gray";

  function detalheItem(p: Exclusao): React.ReactNode {
    const c = p.contexto || {}; const empresa = c.empresa ?? c.nome_exibicao ?? c.cliente ?? "—";
    switch (p.tabela) {
      case "caso_pendencias": return <><b>{c.titulo ?? "(pendência)"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{empresa}{c.caso ? ` · ${c.caso}` : ""}{c.responsavel ? ` · ${c.responsavel}` : ""}{c.prazo ? ` · prazo ${c.prazo}` : ""}</div>{c.caso_id && <Link href={`/casos/${c.caso_id}`}  className="text-[11px]" style={{ color: "var(--acao)" }}>abrir caso ↗</Link>}</>;
      case "caso_andamentos": return <><b>{c.data ?? ""} — {c.descricao ?? "(andamento)"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{empresa}{c.caso ? ` · ${c.caso}` : ""}{c.fonte ? ` · fonte: ${c.fonte}` : ""}</div>{c.caso_id && <Link href={`/casos/${c.caso_id}`}  className="text-[11px]" style={{ color: "var(--acao)" }}>abrir caso ↗</Link>}</>;
      case "casos": return <><b>{c.titulo ?? "(caso)"} {c.numero ? <span className="font-mono text-[11px]" style={{ color: "var(--acao-claro)" }}>· {c.numero}</span> : null}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{empresa}{c.area ? ` · ${c.area}` : ""}{c.situacao ? ` · ${c.situacao}` : ""}</div>{c.cascata && <div className="text-[11px] mt-1 px-2 py-1 rounded-sm" style={{ border: "1px solid var(--atencao)", background: "var(--bg-page)", color: "var(--atencao)" }}><b>Vão junto:</b> {c.cascata.pendencias ?? 0} pendência(s) aberta(s), {c.cascata.pendencias_todas ?? 0} pendência(s) no total, {c.cascata.andamentos ?? 0} andamento(s)</div>}</>;
      case "empresas": return <><b>{c.nome_exibicao ?? c.nome ?? "(cliente)"}</b>{c.cascata && <div className="text-[11px] mt-1 px-2 py-1 rounded-sm" style={{ border: "1px solid var(--atencao)", background: "var(--bg-page)", color: "var(--atencao)" }}><b>Vão junto:</b> {c.cascata.casos ?? 0} caso(s) e todo o histórico deles</div>}</>;
      case "alertes": return <><b>{label(p.tabela)}: {c.tipo ?? "—"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.cliente ?? "—"}{c.tribunal ? ` · ${c.tribunal}` : ""}{c.processo ? ` · ${c.processo}` : ""}{c.data ? ` · ${c.data}` : ""}</div></>;
      case "despesas": return <><b>{c.local ?? "(diligência)"} — R$ {typeof c.valor === "number" ? c.valor.toFixed(2).replace(".", ",") : c.valor}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.pessoa ?? ""}{c.data ? ` · ${c.data}` : ""}{c.lote_numero ? ` · pago no lote #${c.lote_numero}` : c.status ? ` · ${c.status}` : ""}</div></>;
      case "reembolso_lotes": return <><b>Lote #{c.numero} — R$ {typeof c.total === "number" ? c.total.toFixed(2).replace(".", ",") : c.total}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.data} · {c.qtd} lançamento(s) — estornar apaga o lote e devolve os itens à fila</div></>;
      case "caixa_movimentos": return <><b>{c.tipo ?? "movimento"} — R$ {typeof c.valor === "number" ? c.valor.toFixed(2).replace(".", ",") : c.valor}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.data}{c.descricao ? ` · ${c.descricao}` : ""}</div></>;
      case "providencias": return <><b>{c.nome ?? "(providência)"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.dias != null ? `${c.dias} dias` : "sem prazo fixo"}{c.tipo_pend ? ` · ${c.tipo_pend}` : ""}</div></>;
      case "dias_nao_uteis": return <><b>{c.data} — {c.motivo ?? "dia não útil"}</b><div className="text-[11px]" style={{ color: "var(--text-muted)" }}>esferas: {(c.esferas || []).join(", ") || "—"}{c.status ? ` · ${c.status}` : ""}</div></>;
      default: return <b>{label(p.tabela)}</b>;
    }
  }
  function resumoLinha(p: Exclusao): string {
    const c = p.contexto || {};
    return `${label(p.tabela)}: ${c.titulo ?? c.nome_exibicao ?? c.nome ?? c.local ?? c.descricao ?? p.row_id}`;
  }

  return (
    <div>
      {aviso && <div className="fixed top-3 right-3 z-[60] px-4 py-2.5 rounded-md text-xs font-semibold shadow-lg text-on-acao" style={{ background: "var(--ok)" }}>{aviso}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <Kpi v={pendentes.length} l={coordenador ? "aguardando você" : "aguardando aprovação"} c={pendentes.length ? "var(--alerta)" : undefined} />
        <Kpi v={meusPedidos} l={coordenador ? "pedidos meus" : "pedidos que fiz"} />
        <Kpi v={pendentes.filter(p => (Date.now() - new Date(p.pedido_em).getTime()) > 7 * 864e5).length} l="parados há +7 dias" c={pendentes.some(p => (Date.now() - new Date(p.pedido_em).getTime()) > 7 * 864e5) ? "var(--atencao)" : undefined} />
        <Kpi v={historico.length} l="decididos" />
      </div>

      <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={() => setAba("pendentes")} className="px-3 py-2 text-[12.5px] -mb-px border-b-2 whitespace-nowrap inline-flex items-center gap-1.5" style={{ color: aba === "pendentes" ? "var(--acao)" : "var(--text-secondary)", borderColor: aba === "pendentes" ? "var(--acao)" : "transparent", fontWeight: aba === "pendentes" ? 600 : 500 }}>Pendentes{pendentes.length ? <span className="text-[10px] font-bold px-1.5 rounded-full text-on-acao" style={{ background: "var(--alerta)" }}>{pendentes.length}</span> : null}</button>
        <button onClick={() => setAba("historico")} className="px-3 py-2 text-[12.5px] -mb-px border-b-2 whitespace-nowrap" style={{ color: aba === "historico" ? "var(--acao)" : "var(--text-secondary)", borderColor: aba === "historico" ? "var(--acao)" : "transparent", fontWeight: aba === "historico" ? 600 : 500 }}>Histórico</button>
      </div>

      {aba === "pendentes" && <div className="mt-3">
        {pendentes.length === 0 && <div className="rounded-lg border px-4 py-10 text-center text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>Nada aqui. ✓</div>}
        <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>{pendentes.length > 0 && <table className="w-full text-[12.5px] table-fixed min-w-[900px]">
          <colgroup><col style={{ width: "13%" }} /><col style={{ width: "41%" }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /></colgroup>
          <thead><tr style={{ background: "var(--bg-page)" }}>{["Tipo", "Item · contexto", "Motivo", "Quem · quando", ""].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{h}</th>)}</tr></thead>
          <tbody>{pendentes.map(p => { const meu = mesmoNome(p.pedido_por, eu); return (
            <tr key={p.id} className="border-b last:border-b-0 hover:brightness-110 align-top" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2.5"><Tag t={label(p.tabela)} cls={cor(p.tabela)} /></td>
              <td className="px-3 py-2.5 break-words">{detalheItem(p)}</td>
              <td className="px-3 py-2.5 text-[11.5px] italic break-words" style={{ color: "var(--text-secondary)" }}>"{p.motivo}"</td>
              <td className="px-3 py-2.5 text-[11px]"><b style={{ color: "var(--text-primary)" }}>{p.pedido_por}</b><div style={{ color: "var(--text-muted)" }}>{relTempo(p.pedido_em)} · {fmtDT(p.pedido_em)}</div></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">{coordenador ? <>
                <button onClick={() => setDecidindo({ p, acao: "devolver", obs: "" })} className={btn} style={{ ...stcss, color: "var(--atencao)", borderColor: "var(--atencao)" }}>↩ Devolver</button>{" "}
                <button onClick={() => setDecidindo({ p, acao: "aprovar", obs: "" })} className={btn + " text-on-acao"} style={{ background: "var(--alerta)", borderColor: "var(--alerta)" }}>Apagar</button>
              </> : (meu ? <button onClick={() => cancelar(p)} className={btn} style={{ ...stcss, color: "var(--text-muted)" }}>↩ Cancelar</button> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>aguardando coordenação</span>)}</td>
            </tr>
          ); })}</tbody></table>}</div>
      </div>}

      {aba === "historico" && <div className="mt-3">
        <div className="rounded-md border overflow-x-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><table className="w-full text-[12.5px] table-fixed min-w-[900px]">
          <colgroup><col style={{ width: "13%" }} /><col style={{ width: "40%" }} /><col style={{ width: "18%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /></colgroup>
          <thead><tr style={{ background: "var(--bg-page)" }}>{["Tipo", "Item", "Motivo · comentário", "Decisão", "Aprovado por"].map((h, i) => <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{h}</th>)}</tr></thead>
          <tbody>{historico.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Sem histórico ainda.</td></tr>}
            {historico.map(p => <tr key={p.id} className="border-b last:border-b-0 align-top" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2.5"><Tag t={label(p.tabela)} cls={cor(p.tabela)} /></td>
              <td className="px-3 py-2.5 break-words">{detalheItem(p)}<div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>pedido por <b>{p.pedido_por}</b> em {fmtDT(p.pedido_em)}</div></td>
              <td className="px-3 py-2.5 text-[11.5px] italic break-words" style={{ color: "var(--text-secondary)" }}>"{p.motivo}"{p.decisao_obs && <div className="not-italic mt-1" style={{ color: "var(--text-secondary)" }}><b>Resposta:</b> {p.decisao_obs}</div>}</td>
              <td className="px-3 py-2.5">{p.status === "aprovada" ? <Tag t="apagada" cls="green" /> : p.status === "devolvida" ? <Tag t="devolvida" cls="red" /> : <Tag t="cancelada" cls="gray" />}</td>
              <td className="px-3 py-2.5 text-[11px]">{p.decidido_por ?? "—"}{p.decidido_em && <div style={{ color: "var(--text-muted)" }}>{fmtDT(p.decidido_em)}</div>}</td>
            </tr>)}</tbody></table></div>
      </div>}

      {decidindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} onClick={() => setDecidindo(null)}>
          <div className="rounded-lg border p-4 w-full max-w-[520px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{decidindo.acao === "aprovar" ? "Apagar de vez" : "↩ Devolver pedido"}</div>
            <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{label(decidindo.p.tabela)} · pedido por {decidindo.p.pedido_por}</div>
            <div className="text-[12px] px-3 py-2 rounded mb-2.5" style={{ background: "var(--bg-page)", color: "var(--text-secondary)" }}>{detalheItem(decidindo.p)}<div className="text-[11.5px] mt-1 italic">"{decidindo.p.motivo}"</div></div>
            {decidindo.acao === "aprovar" && decidindo.p.tabela === "casos" && <div className="text-[11.5px] mb-2 px-3 py-2 rounded" style={{ background: "var(--alerta-tint)", color: "var(--alerta)", border: "1px solid var(--alerta)" }}>Apagar um caso apaga todas as pendências e andamentos ligados a ele.</div>}
            {decidindo.acao === "aprovar" && decidindo.p.tabela === "empresas" && <div className="text-[11.5px] mb-2 px-3 py-2 rounded" style={{ background: "var(--alerta-tint)", color: "var(--alerta)", border: "1px solid var(--alerta)" }}>Apagar um cliente apaga todos os casos, pendências e andamentos dele.</div>}
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-secondary)" }}>{decidindo.acao === "aprovar" ? "Comentário (opcional)" : "Motivo da devolução (aparece para quem pediu)"}</label>
            <textarea className="w-full px-2.5 py-2 rounded text-[12.5px] border outline-none min-h-[70px]" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }} value={decidindo.obs} onChange={e => setDecidindo({ ...decidindo, obs: e.target.value })} autoFocus />
            {erro && <div className="mt-2 px-3 py-2 rounded text-xs" style={{ background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" }}>{erro}</div>}
            <div className="flex gap-1.5 mt-3">
              <button disabled={ocupado} onClick={decidir} className="flex-1 py-2 rounded-md text-[12.5px] font-semibold text-on-acao disabled:opacity-50" style={{ background: decidindo.acao === "aprovar" ? "var(--alerta)" : "var(--atencao)" }}>{ocupado ? "Gravando…" : (decidindo.acao === "aprovar" ? "Apagar de vez" : "↩ Devolver")}</button>
              <button onClick={() => setDecidindo(null)} className={btn} style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
