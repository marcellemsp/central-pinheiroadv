"use client";

import { useEffect, useMemo, useState, CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { NovaEmpresaDrawer, BANCAS, type Empresa } from "./ClientesListView";

type Grupo = { id: string; nome: string; banca: string | null; descricao: string | null };
type Resumo = { empresa_id: string; total: number; ativos: number };
type GrupoLite = { id: string; nome: string };

const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle: CSSProperties = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" };
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const ini = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmt = (d: string) => new Date(d).toLocaleDateString("pt-BR");

export default function GrupoDetalheView({ grupoId }: { grupoId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [todosGrupos, setTodosGrupos] = useState<GrupoLite[]>([]);
  const [q, setQ] = useState("");
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [menu, setMenu] = useState<{ e: Empresa; x: number; y: number } | null>(null);
  const [movendo, setMovendo] = useState<Empresa | null>(null);
  const [novoGrupoDest, setNovoGrupoDest] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const [g, e, c, tg] = await Promise.all([
      supabase.from("grupos").select("id, nome, banca, descricao").eq("id", grupoId).maybeSingle(),
      supabase.from("empresas").select("*").eq("grupo_id", grupoId).order("nome"),
      supabase.from("empresa_casos_resumo").select("empresa_id, total, ativos"),
      supabase.from("grupos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    if (g.error) setErro(g.error.message);
    setGrupo((g.data ?? null) as Grupo | null);
    setEmpresas((e.data ?? []) as Empresa[]);
    setResumo((c.data ?? []) as Resumo[]);
    setTodosGrupos((tg.data ?? []) as GrupoLite[]);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [grupoId]);

  const casosPorEmpresa = useMemo(() => {
    const m: Record<string, number> = {};
    resumo.forEach((r) => { m[r.empresa_id] = r.total; });
    return m;
  }, [resumo]);

  const ativas = empresas.filter((e) => e.ativo).length;
  const arquivadas = empresas.length - ativas;
  const totalCasos = empresas.reduce((s, e) => s + (casosPorEmpresa[e.id] || 0), 0);

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return empresas
      .filter((e) => (verArquivadas ? true : e.ativo))
      .filter((e) => !s || e.nome.toLowerCase().includes(s) || (e.nome_exibicao ?? "").toLowerCase().includes(s) || (e.cnpj_raiz ?? "").includes(s))
      .sort((a, b) => (a.nome_exibicao ?? a.nome).localeCompare(b.nome_exibicao ?? b.nome, "pt-BR"));
  }, [empresas, q, verArquivadas]);

  async function confirmarMover() {
    if (!movendo || !novoGrupoDest) return;
    const { error } = await supabase.from("empresas").update({ grupo_id: novoGrupoDest }).eq("id", movendo.id);
    if (error) { alert("Erro: " + error.message); return; }
    setMovendo(null);
    setNovoGrupoDest("");
    carregar();
  }

  async function arquivar(e: Empresa) {
    const { error } = await supabase.from("empresas").update({ ativo: !e.ativo }).eq("id", e.id);
    if (error) { alert("Erro: " + error.message); return; }
    carregar();
  }

  if (loading) return <div className="p-6 text-xs" style={{ color: "var(--text-muted)" }}>Carregando grupo...</div>;
  if (!grupo) return (
    <div className="p-6">
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Grupo n&atilde;o encontrado{erro ? `: ${erro}` : "."}</div>
      <Link href="/clientes" className="text-xs" style={{ color: "var(--acao)" }}>&larr; Voltar</Link>
    </div>
  );

  const b = grupo.banca ? BANCAS[grupo.banca as string] : null;

  return (
    <div className="p-6 max-w-[1400px] relative">
      <div className="text-[11px] flex items-center gap-1.5 mb-3" style={{ color: "var(--text-muted)" }}>
        <Link href="/clientes" style={{ color: "var(--acao)" }}>Clientes</Link>
        <span>&rsaquo;</span>
        <span>{grupo.nome}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex gap-3.5 items-start min-w-0">
          <div className="w-[52px] h-[52px] rounded-[10px] flex items-center justify-center text-on-acao font-bold text-lg flex-shrink-0" style={{ background: "var(--acao)" }}>{ini(grupo.nome)}</div>
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight">{grupo.nome}</h1>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {ativas} empresa{ativas === 1 ? "" : "s"} ativa{ativas === 1 ? "" : "s"}
              {arquivadas > 0 && <> &middot; {arquivadas} arquivada{arquivadas === 1 ? "" : "s"}</>}
              {" · "}{totalCasos} caso{totalCasos === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2 text-[11px] items-center" style={{ color: "var(--text-secondary)" }}>
              {b && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: b.bg, color: b.fg }} title={b.nome}>Carteira {grupo.banca}</span>}
              {grupo.descricao && <span>{grupo.descricao}</span>}
            </div>
          </div>
        </div>
        <button onClick={() => setNovaEmpresa(true)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Nova empresa</button>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa ou CNPJ..."
          className="flex-1 min-w-[260px] px-3 py-1.5 rounded text-xs border outline-none"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
        <button onClick={() => setVerArquivadas((v) => !v)} title="Mostrar tamb&eacute;m arquivadas"
          className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition"
          style={verArquivadas
            ? { background: "var(--text-muted)", borderColor: "var(--text-muted)", color: "var(--on-acao)" }
            : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          Arquivadas{arquivadas > 0 ? ` (${arquivadas})` : ""}
        </button>
      </div>

      <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "var(--bg-page)" }}>
              {["Empresa", "CNPJ raiz", "Carteira", "Casos", "Status", "Cadastrada em", ""].map((h, i) => (
                <th key={i} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
                  style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "35%" : i === 6 ? 56 : undefined }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={7} className="px-3.5 py-10 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>Nenhuma empresa neste grupo{q ? " para o filtro" : ""}.</td></tr>
            )}
            {lista.map((e) => {
              const b2 = e.banca ? BANCAS[e.banca] : null;
              const nome = e.nome_exibicao || e.nome;
              return (
                <tr key={e.id} onClick={() => router.push(`/clientes/${e.id}`)}
                    className="cursor-pointer border-b last:border-b-0 hover:brightness-110"
                    style={{ borderColor: "var(--border)", opacity: e.ativo ? 1 : 0.55 }}>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                      <span className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-on-acao flex-shrink-0" style={{ background: "var(--acao)" }}>{ini(nome)}</span>
                      <span>
                        {nome}
                        {e.nome_exibicao && <span className="block text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>{e.nome}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{e.cnpj_raiz ?? "—"}</td>
                  <td className="px-3.5 py-2.5">
                    {b2 ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: b2.bg, color: b2.fg }} title={b2.nome}>Carteira {e.banca}</span>
                        : <span style={{ color: "var(--text-muted)" }}>&mdash;</span>}
                  </td>
                  <td className="px-3.5 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{casosPorEmpresa[e.id] ?? 0}</td>
                  <td className="px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.ativo ? "var(--ok)" : "var(--text-muted)" }} />
                      {e.ativo ? "Ativo" : "Arquivado"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5" style={{ color: "var(--text-muted)" }}>{fmt(e.criado_em)}</td>
                  <td className="px-2 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <button title="Op&ccedil;&otilde;es"
                      onClick={(ev) => {
                        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenu(menu?.e.id === e.id ? null : { e, x: r.right, y: r.bottom });
                      }}
                      className="w-8 h-8 rounded-md inline-flex items-center justify-center text-lg leading-none border transition hover:brightness-125"
                      style={{
                        color: "var(--text-secondary)",
                        borderColor: menu?.e.id === e.id ? "var(--border)" : "transparent",
                        background: menu?.e.id === e.id ? "var(--bg-page)" : "transparent",
                      }}>
                      &#x22ef;
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
          <div className="fixed z-40 w-52 rounded-md border shadow-2xl py-1 text-xs"
            style={{ top: menu.y + 4, left: menu.x - 208, background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <button onClick={() => { setMenu(null); router.push(`/clientes/${menu.e.id}`); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125"
              style={{ color: "var(--text-primary)", background: "transparent" }}>
              <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&rarr;</span>Abrir
            </button>
            <button onClick={() => { setEditando(menu.e); setMenu(null); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125"
              style={{ color: "var(--text-primary)", background: "transparent" }}>
              <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&#x270e;</span>Modificar
            </button>
            <button onClick={() => { setNovoGrupoDest(""); setMovendo(menu.e); setMenu(null); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125"
              style={{ color: "var(--text-primary)", background: "transparent" }}>
              <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&harr;</span>Mover para outro grupo
            </button>
            <button onClick={() => { arquivar(menu.e); setMenu(null); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125"
              style={{ color: "var(--text-primary)", background: "transparent" }}>
              <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&#x1F5C4;</span>{menu.e.ativo ? "Arquivar" : "Desarquivar"}
            </button>
          </div>
        </>
      )}

      {novaEmpresa && <NovaEmpresaDrawer onClose={() => setNovaEmpresa(false)} onSaved={(id) => { setNovaEmpresa(false); if (id) { supabase.from("empresas").update({ grupo_id: grupoId }).eq("id", id).then(() => router.push(`/clientes/${id}`)); } else carregar(); }} supabase={supabase} />}
      {editando && <NovaEmpresaDrawer inicial={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); carregar(); }} supabase={supabase} />}

      {movendo && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setMovendo(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-2xl p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", width: 420, maxWidth: "92vw" }}>
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", margin: 0 }}>Mover empresa para outro grupo</h3>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{movendo.nome_exibicao || movendo.nome}</strong> ser&aacute; movida de <b>{grupo.nome}</b> para o grupo escolhido abaixo.
            </p>
            <div className="mt-4">
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Grupo de destino</label>
              <select value={novoGrupoDest} onChange={(e) => setNovoGrupoDest(e.target.value)} autoFocus className={inputCls} style={inputStyle}>
                <option value="">Selecione um grupo...</option>
                {todosGrupos.filter((g) => g.id !== grupoId).map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setMovendo(null)} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={confirmarMover} disabled={!novoGrupoDest} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>Mover</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
