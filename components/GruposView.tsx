"use client";

import { useEffect, useMemo, useState, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { BANCAS } from "./ClientesListView";

export type Grupo = { id: string; nome: string; banca: string | null; descricao: string | null; ativo: boolean };
type Empresa = { id: string; nome: string; nome_exibicao: string | null; cnpj_raiz: string | null; banca: string | null; grupo_id: string | null; ativo: boolean };
type Resumo = { empresa_id: string; total: number; ativos: number };

const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle: CSSProperties = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" };
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider mb-1";
const ini = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const segOn: CSSProperties = { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" };
const segOff: CSSProperties = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" };

export default function GruposView() {
  const supabase = createClient();
  const router = useRouter();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [q, setQ] = useState("");
  const [banca, setBanca] = useState<string>("todas");
  const [verArquivados, setVerArquivados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [novoGrupo, setNovoGrupo] = useState(false);
  const [editando, setEditando] = useState<Grupo | null>(null);
  const [menu, setMenu] = useState<{ g: Grupo; x: number; y: number } | null>(null);
  const [excluir, setExcluir] = useState<Grupo | null>(null);
  const [senha, setSenha] = useState(""); const [erroSenha, setErroSenha] = useState<string | null>(null); const [apagando, setApagando] = useState(false);

  async function carregar() {
    const [g, e, c] = await Promise.all([
      supabase.from("grupos").select("id, nome, banca, descricao, ativo").order("nome"),
      supabase.from("empresas").select("id, nome, nome_exibicao, cnpj_raiz, banca, grupo_id, ativo"),
      supabase.from("empresa_casos_resumo").select("empresa_id, total, ativos"),
    ]);
    setGrupos((g.data ?? []) as Grupo[]);
    setEmpresas((e.data ?? []) as Empresa[]);
    setResumo((c.data ?? []) as Resumo[]);
    setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const empsPorGrupo = useMemo(() => {
    const m: Record<string, Empresa[]> = {};
    empresas.forEach((e) => { if (e.grupo_id) (m[e.grupo_id] = m[e.grupo_id] || []).push(e); });
    return m;
  }, [empresas]);
  const casosPorEmpresa = useMemo(() => {
    const m: Record<string, number> = {};
    resumo.forEach((r) => { m[r.empresa_id] = r.total; });
    return m;
  }, [resumo]);
  const totalCasosGrupo = (gid: string) => (empsPorGrupo[gid] || []).reduce((s, e) => s + (casosPorEmpresa[e.id] || 0), 0);

  const ativos = grupos.filter((g) => g.ativo);
  const arquivados = grupos.length - ativos.length;
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    return grupos
      .filter((g) => (verArquivados ? !g.ativo : g.ativo))
      .filter((g) => banca === "todas" || g.banca === banca)
      .filter((g) => {
        if (!s) return true;
        if (g.nome.toLowerCase().includes(s)) return true;
        return (empsPorGrupo[g.id] || []).some((e) => e.nome.toLowerCase().includes(s) || (e.nome_exibicao ?? "").toLowerCase().includes(s) || (e.cnpj_raiz ?? "").includes(s));
      });
  }, [grupos, q, banca, verArquivados, empsPorGrupo]);

  async function arquivar(g: Grupo) {
    const { error } = await supabase.from("grupos").update({ ativo: !g.ativo }).eq("id", g.id);
    if (error) { alert("Erro: " + error.message); return; }
    carregar();
  }
  async function confirmarExclusao() {
    if (!excluir || !senha) return; setApagando(true); setErroSenha(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setApagando(false); setErroSenha("Sessão inválida."); return; }
    const { error: aErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (aErr) { setApagando(false); setErroSenha("Senha incorreta."); return; }
    const { error } = await supabase.from("grupos").delete().eq("id", excluir.id);
    setApagando(false); if (error) { setErroSenha(error.message); return; }
    setExcluir(null); setSenha(""); carregar();
  }

  if (loading) return <div className="p-6 text-xs" style={{ color: "var(--text-muted)" }}>Carregando grupos...</div>;

  const totalEmpresas = empresas.filter((e) => e.grupo_id && e.ativo).length;
  const totalCasos = resumo.reduce((s, r) => s + r.total, 0);

  return (
    <div className="p-6 max-w-[1400px] relative">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[26px]">Clientes</h1>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {ativos.length} grupo{ativos.length === 1 ? "" : "s"} &middot; {totalEmpresas} empresa{totalEmpresas === 1 ? "" : "s"} &middot; {totalCasos} caso{totalCasos === 1 ? "" : "s"}
          </div>
        </div>
        <button onClick={() => setNovoGrupo(true)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Novo grupo</button>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo, empresa ou CNPJ..."
          className="flex-1 min-w-[260px] px-3 py-1.5 rounded text-xs border outline-none"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
        <button onClick={() => setBanca("todas")} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition whitespace-nowrap"
          style={banca === "todas" ? segOn : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Todas</button>
        {Object.keys(BANCAS).map((b) => (
          <button key={b} onClick={() => setBanca(b)} title={BANCAS[b].nome} className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition whitespace-nowrap"
            style={banca === b ? segOn : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Carteira {b}</button>
        ))}
        <button onClick={() => setVerArquivados((v) => !v)} title="Mostrar grupos arquivados" className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition whitespace-nowrap ml-auto"
          style={verArquivados ? { background: "var(--text-muted)", borderColor: "var(--text-muted)", color: "var(--on-acao)" } : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          Arquivados{arquivados > 0 ? ` (${arquivados})` : ""}
        </button>
      </div>

      <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "var(--bg-page)" }}>
              {["Grupo", "Carteira", "Empresas", "Casos", ""].map((h, i) => (
                <th key={i} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
                  style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "50%" : i === 4 ? 56 : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={5} className="px-3.5 py-10 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>{verArquivados ? "Nenhum grupo arquivado" : "Nenhum grupo encontrado"}</td></tr>
            )}
            {filtrados.map((g) => {
              const b = g.banca ? BANCAS[g.banca as string] : null;
              const numEmpresas = (empsPorGrupo[g.id] || []).filter((e) => e.ativo).length;
              const numCasos = totalCasosGrupo(g.id);
              return (
                <tr key={g.id} onClick={() => router.push(`/grupo/${g.id}`)} className="cursor-pointer border-b last:border-b-0 hover:brightness-110" style={{ borderColor: "var(--border)", opacity: g.ativo ? 1 : 0.6 }}>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                      <span className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-on-acao flex-shrink-0" style={{ background: g.ativo ? "var(--acao)" : "var(--text-muted)" }}>{ini(g.nome)}</span>
                      <span>{g.nome}{g.descricao && <span className="block text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>{g.descricao}</span>}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {b ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: b.bg, color: b.fg }} title={b.nome}>Carteira {g.banca}</span> : <span style={{ color: "var(--text-muted)" }}>&mdash;</span>}
                  </td>
                  <td className="px-3.5 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{numEmpresas}</td>
                  <td className="px-3.5 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{numCasos}</td>
                  <td className="px-2 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <button title="Opções"
                      onClick={(ev) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenu(menu?.g.id === g.id ? null : { g, x: r.right, y: r.bottom }); }}
                      className="w-8 h-8 rounded-md inline-flex items-center justify-center text-lg leading-none border transition hover:brightness-125"
                      style={{ color: "var(--text-secondary)", borderColor: menu?.g.id === g.id ? "var(--border)" : "transparent", background: menu?.g.id === g.id ? "var(--bg-page)" : "transparent" }}>&#x22ef;</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (() => { const vazio = (empsPorGrupo[menu.g.id] || []).length === 0; return (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
          <div className="fixed z-40 w-56 rounded-md border shadow-2xl py-1 text-xs" style={{ top: menu.y + 4, left: menu.x - 224, background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <button onClick={() => { setMenu(null); router.push(`/grupo/${menu.g.id}`); }} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&rarr;</span>Abrir</button>
            <button onClick={() => { setEditando(menu.g); setMenu(null); }} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&#x270e;</span>Renomear / editar</button>
            <button onClick={() => { const g = menu.g; setMenu(null); arquivar(g); }} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125" style={{ color: "var(--text-primary)" }}><span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>&#x1F5C4;</span>{menu.g.ativo ? "Arquivar" : "Desarquivar"}</button>
            <button disabled={!vazio} title={vazio ? "" : "Mova ou arquive as empresas antes de excluir o grupo"} onClick={() => { const g = menu.g; setMenu(null); setSenha(""); setErroSenha(null); setExcluir(g); }} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125 border-t disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: "var(--alerta)", borderColor: "var(--border)" }}><span className="w-4 text-center">&#x1F5D1;</span>Excluir{vazio ? "" : " (grupo não está vazio)"}</button>
          </div>
        </>
      ); })()}

      {novoGrupo && <GrupoDrawer onClose={() => setNovoGrupo(false)} onSaved={(id) => { setNovoGrupo(false); if (id) router.push(`/grupo/${id}`); else carregar(); }} supabase={supabase} />}
      {editando && <GrupoDrawer inicial={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); carregar(); }} supabase={supabase} />}

      {excluir && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !apagando && setExcluir(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--alerta-tint)", color: "var(--alerta)" }}>&#x1F5D1;</div>
              <div className="flex-1"><h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Excluir grupo?</h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{excluir.nome}</strong> será removido permanentemente. O grupo está vazio, nenhuma empresa ou caso será afetado.</p>
                <label className={labelCls + " mt-4"} style={{ color: "var(--text-secondary)" }}>Confirme com sua senha de acesso</label>
                <input type="password" autoFocus value={senha} onChange={(e) => { setSenha(e.target.value); setErroSenha(null); }} onKeyDown={(e) => { if (e.key === "Enter") confirmarExclusao(); }} placeholder="Senha do login" className={inputCls} style={inputStyle} />
                {erroSenha && <div className="text-[11px] mt-1.5" style={{ color: "var(--alerta)" }}>{erroSenha}</div>}</div></div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => { setExcluir(null); setSenha(""); }} disabled={apagando} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button><button onClick={confirmarExclusao} disabled={apagando || !senha} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{apagando ? "Excluindo…" : "Excluir permanentemente"}</button></div>
          </div>
        </>
      )}
    </div>
  );
}

/* Criar ou editar grupo (nome, banca, descrição). Ao editar, opção de aplicar a banca às empresas do grupo sem banca. */
export function GrupoDrawer({ inicial, onClose, onSaved, supabase }: { inicial?: Grupo; onClose: () => void; onSaved: (novoId?: string) => void; supabase: ReturnType<typeof createClient> }) {
  const edit = !!inicial;
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [banca, setBanca] = useState<string>((inicial?.banca as string | null) ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [herdar, setHerdar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valido = nome.trim().length > 1;

  async function salvar() {
    if (!valido) return;
    setSalvando(true); setErro(null);
    const payload = { nome: nome.trim(), banca: banca || null, descricao: descricao.trim() || null };
    if (edit) {
      const { error } = await supabase.from("grupos").update(payload).eq("id", inicial!.id);
      if (error) { setSalvando(false); setErro(error.message); return; }
      if (herdar && banca && banca !== inicial!.banca) await supabase.from("empresas").update({ banca }).eq("grupo_id", inicial!.id).is("banca", null);
      setSalvando(false); onSaved(); return;
    }
    const { data, error } = await supabase.from("grupos").insert(payload).select("id").single();
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    onSaved(data?.id);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[460px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{edit ? "Editar grupo" : "Novo grupo"}</h2>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{edit ? "Renomear ou ajustar banca e descrição. Empresas e casos não mudam." : "Um grupo é um guarda-chuva de empresas do mesmo cliente."}</div>
          </div>
          <button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3">
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nome do grupo <span style={{ color: "var(--alerta)" }}>*</span></label>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} placeholder="Ex.: Ourense" className={inputCls} style={inputStyle} />
          </div>
          <div className="mb-3">
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Carteira responsável</label>
            <div className="flex gap-1.5 flex-wrap">
              <button type="button" onClick={() => setBanca("")} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={banca === "" ? segOn : segOff}>&mdash;</button>
              {Object.keys(BANCAS).map((b) => (
                <button key={b} type="button" onClick={() => setBanca(b)} className="px-2.5 py-1.5 rounded border text-[10.5px] font-semibold uppercase tracking-wide" style={banca === b ? segOn : segOff}>{b} &middot; {BANCAS[b].nome}</button>
              ))}
            </div>
            {edit && banca && banca !== inicial!.banca && (
              <label className="flex items-center gap-2 mt-2 text-[11.5px]" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={herdar} onChange={(e) => setHerdar(e.target.checked)} />aplicar esta banca às empresas do grupo que estão sem banca</label>
            )}
          </div>
          <div className="mb-3">
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Descrição (opcional)</label>
            <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Contexto do grupo..." className={inputCls + " min-h-[70px] resize-y"} style={inputStyle} />
          </div>
          {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
          <button onClick={salvar} disabled={!valido || salvando} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{salvando ? "Salvando..." : edit ? "Salvar alterações" : "Salvar e abrir grupo →"}</button>
        </div>
      </aside>
    </>
  );
}
