"use client";
import { CARTEIRAS } from "@/lib/equipe";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export type Contato = { nome: string; cargo: string; email: string };
export type Empresa = {
  id: string;
  nome: string;
  nome_exibicao: string | null;
  cnpj_raiz: string | null;
  banca: string | null;
  area: string | null;
  tags: string[] | null;
  contatos: Contato[] | null;
  observacoes: string | null;
  ativo: boolean;
  criado_em: string;
};

const CORES_CARTEIRA: [string, string][] = [["var(--tag-blue-bg)", "var(--tag-blue-fg)"], ["var(--tag-purple-bg)", "var(--tag-purple-fg)"], ["var(--tag-green-bg)", "var(--tag-green-fg)"], ["var(--tag-amber-bg)", "var(--tag-amber-fg)"], ["var(--tag-pink-bg)", "var(--tag-pink-fg)"]];
/** Carteiras de clientes (lib/equipe.ts), com a cor de cada uma. */
export const BANCAS: Record<string, { nome: string; bg: string; fg: string }> = Object.fromEntries(
  Object.entries(CARTEIRAS).map(([k, nome], i) => [k, { nome, bg: CORES_CARTEIRA[i % CORES_CARTEIRA.length][0], fg: CORES_CARTEIRA[i % CORES_CARTEIRA.length][1] }]),
);

const inputCls = "w-full px-2.5 py-2 rounded text-[12.5px] border outline-none focus:border-acao";
const inputStyle = { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const labelCls = "text-[10px] font-semibold uppercase tracking-wider";

export default function ClientesListView({ empresas, erro }: { empresas: Empresa[]; erro?: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [banca, setBanca] = useState<string>("todas");
  const [verArquivados, setVerArquivados] = useState(false);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [menu, setMenu] = useState<{ e: Empresa; x: number; y: number } | null>(null);
  const [excluindo, setExcluindo] = useState<Empresa | null>(null);
  const [apagando, setApagando] = useState(false);
  const [senha, setSenha] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  async function arquivar(e: Empresa) {
    const { error } = await supabase.from("empresas").update({ ativo: !e.ativo }).eq("id", e.id);
    if (error) { alert("Erro: " + error.message); return; }
    router.refresh();
  }

  async function excluir() {
    if (!excluindo || !senha) return;
    setApagando(true); setErroSenha(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setApagando(false); setErroSenha("Sessão inválida. Entre novamente."); return; }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
    if (authErr) { setApagando(false); setErroSenha("Senha incorreta."); return; }
    const { error } = await supabase.from("empresas").delete().eq("id", excluindo.id);
    setApagando(false);
    if (error) { setErroSenha("Erro ao excluir: " + error.message); return; }
    setExcluindo(null); setSenha("");
    router.refresh();
  }

  const ativos = empresas.filter(e => e.ativo).length;
  const arquivados = empresas.length - ativos;

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return empresas
      .filter(e => verArquivados ? true : e.ativo)
      .filter(e => banca === "todas" || e.banca === banca)
      .filter(e => !s || e.nome.toLowerCase().includes(s) || (e.nome_exibicao ?? "").toLowerCase().includes(s) || (e.cnpj_raiz ?? "").includes(s))
      .sort((a, b) => (a.nome_exibicao ?? a.nome).localeCompare(b.nome_exibicao ?? b.nome, "pt-BR"));
  }, [empresas, q, banca, verArquivados]);

  const chip = (active: boolean, onClick: () => void, label: string, title?: string, key?: string) => (
    <button key={key ?? label} onClick={onClick} title={title}
      className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition whitespace-nowrap"
      style={active
        ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }
        : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
      {label}
    </button>
  );

  const iniciais = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const fmt = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <div className="p-6 relative">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[26px]">Clientes</h1>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {ativos} ativo{ativos === 1 ? "" : "s"} · {arquivados} arquivado{arquivados === 1 ? "" : "s"}
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>+ Nova empresa</button>
      </div>

      {erro && (
        <div className="mb-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>
          Erro ao carregar empresas: {erro}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, CNPJ ou CPF…"
          className="flex-1 min-w-[260px] px-3 py-1.5 rounded text-xs border outline-none"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
        {chip(banca === "todas", () => setBanca("todas"), "Todas")}
        {Object.keys(BANCAS).map(b => chip(banca === b, () => setBanca(b), `Carteira ${b}`, BANCAS[b].nome, b))}
        <span className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
        <button onClick={() => setVerArquivados(v => !v)} title="Mostrar também arquivados"
          className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition"
          style={verArquivados
            ? { background: "var(--text-muted)", borderColor: "var(--text-muted)", color: "var(--on-acao)" }
            : { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          Arquivados{arquivados > 0 ? ` (${arquivados})` : ""}
        </button>
      </div>

      <div className="rounded-md border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "var(--bg-page)" }}>
              {["Cliente", "CNPJ raiz / CPF", "Carteira", "Status", "Cadastrado em", ""].map((h, i) => (
                <th key={i} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
                  style={{ color: "var(--text-muted)", borderColor: "var(--border)", width: i === 0 ? "40%" : i === 5 ? 56 : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} className="px-3.5 py-10 text-center text-xs italic" style={{ color: "var(--text-muted)" }}>Nenhum cliente encontrado</td></tr>
            )}
            {lista.map(e => {
              const b = e.banca ? BANCAS[e.banca] : null;
              const nome = e.nome_exibicao || e.nome;
              return (
                <tr key={e.id} onClick={() => router.push(`/clientes/${e.id}`)}
                  className="cursor-pointer border-b last:border-b-0 hover:brightness-110"
                  style={{ borderColor: "var(--border)", opacity: e.ativo ? 1 : 0.55 }}>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                      <span className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-on-acao flex-shrink-0" style={{ background: "var(--acao)" }}>{iniciais(nome)}</span>
                      <span>{nome}{e.nome_exibicao && <span className="block text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>{e.nome}</span>}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{e.cnpj_raiz ?? "—"}</td>
                  <td className="px-3.5 py-2.5">
                    {b ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: b.bg, color: b.fg }} title={b.nome}>Carteira {e.banca}</span>
                       : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.ativo ? "var(--ok)" : "var(--text-muted)" }} />{e.ativo ? "Ativo" : "Arquivado"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5" style={{ color: "var(--text-muted)" }}>{fmt(e.criado_em)}</td>
                  <td className="px-2 py-2.5 text-right" onClick={ev => ev.stopPropagation()}>
                    <button title="Opções"
                      onClick={ev => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenu(menu?.e.id === e.id ? null : { e, x: r.right, y: r.bottom }); }}
                      className="w-8 h-8 rounded-md inline-flex items-center justify-center text-lg leading-none border transition hover:brightness-125"
                      style={{ color: "var(--text-secondary)", borderColor: menu?.e.id === e.id ? "var(--border)" : "transparent", background: menu?.e.id === e.id ? "var(--bg-page)" : "transparent" }}>⋯</button>
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
          <div className="fixed z-40 w-44 rounded-md border shadow-2xl py-1 text-xs"
            style={{ top: menu.y + 4, left: menu.x - 176, background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            {[
              { l: "Abrir", i: "→", fn: () => router.push(`/clientes/${menu.e.id}`) },
              { l: "Modificar", i: "✎", fn: () => setEditando(menu.e) },
              { l: menu.e.ativo ? "Arquivar" : "Desarquivar", i: "", fn: () => arquivar(menu.e) },
              { l: "Excluir", i: "", fn: () => { setSenha(""); setErroSenha(null); setExcluindo(menu.e); }, danger: true },
            ].map(op => (
              <button key={op.l} onClick={() => { setMenu(null); op.fn(); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:brightness-125"
                style={{ color: op.danger ? "var(--alerta)" : "var(--text-primary)", background: "transparent" }}>
                <span className="w-4 text-center" style={{ color: op.danger ? "var(--alerta)" : "var(--text-muted)" }}>{op.i}</span>{op.l}
              </button>
            ))}
          </div>
        </>
      )}

      {open && <NovaEmpresaDrawer onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); if (id) router.push(`/clientes/${id}`); else router.refresh(); }} supabase={supabase} />}
      {editando && <NovaEmpresaDrawer inicial={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); router.refresh(); }} supabase={supabase} />}

      {excluindo && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => !apagando && setExcluindo(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw] rounded-lg border shadow-2xl p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--alerta-tint)", color: "var(--alerta)" }}></div>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Excluir cliente?</h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{excluindo.nome_exibicao || excluindo.nome}</strong> será removido permanentemente, junto com frentes, pendências e documentos vinculados. Esta ação não pode ser desfeita.
                </p>
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>Se a ideia é só tirar da lista, use <strong>Arquivar</strong> no menu.</p>
                <label className={labelCls + " block mt-4 mb-1"} style={{ color: "var(--text-secondary)" }}>Confirme com sua senha de acesso</label>
                <input type="password" autoFocus value={senha} onChange={e => { setSenha(e.target.value); setErroSenha(null); }}
                  onKeyDown={e => { if (e.key === "Enter") excluir(); }}
                  placeholder="Senha do login" className={inputCls} style={inputStyle} />
                {erroSenha && <div className="text-[11px] mt-1.5" style={{ color: "var(--alerta)" }}>{erroSenha}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setExcluindo(null); setSenha(""); }} disabled={apagando} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={excluir} disabled={apagando || !senha} className="px-3 py-1.5 rounded text-xs font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--alerta)" }}>{apagando ? "Excluindo…" : "Excluir permanentemente"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function NovaEmpresaDrawer({ inicial, onClose, onSaved, supabase }: { inicial?: Empresa; onClose: () => void; onSaved: (novoId?: string) => void; supabase: ReturnType<typeof createClient> }) {
  const edit = !!inicial;
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [nomeExib, setNomeExib] = useState(inicial?.nome_exibicao ?? "");
  const [cnpj, setCnpj] = useState(inicial?.cnpj_raiz ?? "");
  const [banca, setBanca] = useState<string>(inicial?.banca ?? Object.keys(CARTEIRAS)[0] ?? "");
  const [tags, setTags] = useState<string[]>(inicial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [contatos, setContatos] = useState<Contato[]>(inicial?.contatos?.length ? inicial.contatos : [{ nome: "", cargo: "", email: "" }]);
  const [obs, setObs] = useState(inicial?.observacoes ?? "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cnpjDigits = cnpj.replace(/\D/g, "");
  const ehCpf = cnpjDigits.length === 11;
  const docOk = cnpjDigits.length === 0 || cnpjDigits.length === 8 || ehCpf;
  const cnpjFmt = cnpjDigits.length === 8 ? `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5, 8)}` : ehCpf ? `${cnpjDigits.slice(0, 3)}.${cnpjDigits.slice(3, 6)}.${cnpjDigits.slice(6, 9)}-${cnpjDigits.slice(9, 11)}` : cnpj;
  const valido = nome.trim().length > 1 && docOk && banca !== "";

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function salvar() {
    if (!valido) return;
    setSalvando(true); setErro(null);
    const dados = {
      nome: nome.trim(),
      nome_exibicao: nomeExib.trim() || null,
      cnpj_raiz: cnpjDigits.length ? cnpjFmt : null,
      banca,
      tags,
      contatos: contatos.filter(c => c.nome.trim() || c.email.trim()),
      observacoes: obs.trim() || null,
      ativo,
    };
    const res = edit
      ? await supabase.from("empresas").update(dados).eq("id", inicial!.id).select("id").single()
      : await supabase.from("empresas").insert(dados).select("id").single();
    setSalvando(false);
    if (res.error) {
      setErro(res.error.code === "23505" ? "Já existe um cliente com esse CNPJ raiz / CPF." : res.error.message);
      return;
    }
    onSaved(edit ? undefined : res.data?.id);
  }

  const seg = (opts: readonly (readonly [string, string, string?])[], val: string, set: (v: string) => void) => (
    <div className="flex gap-1.5">
      {opts.map(([k, l, sub]) => (
        <button key={k} type="button" onClick={() => set(k)}
          className="flex-1 py-1.5 rounded border text-[11px] font-semibold uppercase tracking-wide transition"
          style={val === k
            ? { background: "var(--acao)", borderColor: "var(--acao)", color: "var(--on-acao)" }
            : { background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          {l}{sub && <span className="block text-[9px] font-normal normal-case tracking-normal opacity-80">{sub}</span>}
        </button>
      ))}
    </div>
  );

  const Sec = ({ t }: { t: string }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 mt-4 first:mt-0 border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>{t}</div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[520px] max-w-full border-l shadow-2xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{edit ? "Modificar empresa" : "Nova empresa"}</h2>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Frentes, pendências e documentos são adicionados depois, dentro da página do cliente.</div>
          </div>
          <button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Sec t="Identificação" />
          <div className="mb-2.5">
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Razão social <span style={{ color: "var(--alerta)" }}>*</span></label>
            <input className={inputCls} style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nome de exibição</label>
              <input className={inputCls} style={inputStyle} value={nomeExib} onChange={e => setNomeExib(e.target.value)} placeholder="Ex.: Radu" />
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Opcional. Se vazio, usa a razão social.</div>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>CNPJ raiz ou CPF <span style={{ color: "var(--alerta)" }}>*</span></label>
              <input className={inputCls} style={inputStyle} value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000 (empresa) ou 000.000.000-00 (pessoa física)" inputMode="numeric" />
              <div className="text-[10px] mt-0.5" style={{ color: docOk ? "var(--ok)" : "var(--text-muted)" }}>
                {cnpjDigits.length === 8 ? "✓ CNPJ raiz · filiais entram automaticamente" : ehCpf ? "✓ CPF · pessoa física" : `${cnpjDigits.length} dígitos — 8 (CNPJ raiz) ou 11 (CPF)`}
              </div>
            </div>
          </div>

          <Sec t="Responsabilidade" />
          <div className="mb-2.5">
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Carteira responsável <span style={{ color: "var(--alerta)" }}>*</span></label>
            {seg(Object.entries(BANCAS).map(([k, b]) => [k, k, b.nome]), banca, v => setBanca(v))}
          </div>

          <Sec t="Teses / tags" />
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded border min-h-[38px]" style={inputStyle}>
            {tags.map(t => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
                {t} <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="ml-1" style={{ color: "var(--text-muted)" }}>×</button>
              </span>
            ))}
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              onBlur={addTag} placeholder="Digite e Enter…" className="flex-1 min-w-[120px] bg-transparent text-xs outline-none" style={{ color: "var(--text-primary)" }} />
          </div>

          <Sec t="Contatos no cliente" />
          {contatos.map((c, i) => (
            <div key={i} className="grid gap-2 mb-2 items-end" style={{ gridTemplateColumns: "1.2fr 1fr 1fr auto" }}>
              <div><label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nome</label><input className={inputCls} style={inputStyle} value={c.nome} onChange={e => setContatos(contatos.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} /></div>
              <div><label className={labelCls} style={{ color: "var(--text-secondary)" }}>Cargo</label><input className={inputCls} style={inputStyle} value={c.cargo} onChange={e => setContatos(contatos.map((x, j) => j === i ? { ...x, cargo: e.target.value } : x))} /></div>
              <div><label className={labelCls} style={{ color: "var(--text-secondary)" }}>E-mail</label><input className={inputCls} style={inputStyle} value={c.email} onChange={e => setContatos(contatos.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} /></div>
              <button type="button" onClick={() => setContatos(contatos.filter((_, j) => j !== i))} className="px-2 py-2 rounded border text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Remover">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setContatos([...contatos, { nome: "", cargo: "", email: "" }])} className="text-[11px] font-semibold" style={{ color: "var(--acao)" }}>+ Adicionar contato</button>

          {edit && (
            <>
              <Sec t="Situação" />
              {seg([["ativo", "Ativo"], ["arquivado", "Arquivado"]], ativo ? "ativo" : "arquivado", v => setAtivo(v === "ativo"))}
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Arquivado some da lista padrão, mas nada é apagado.</div>
            </>
          )}

          <Sec t="Observações" />
          <textarea className={inputCls + " min-h-[70px] resize-y"} style={inputStyle} value={obs} onChange={e => setObs(e.target.value)} placeholder="Contexto geral do cliente, histórico de relacionamento, particularidades…" />

          {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>{erro}</div>}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>* obrigatórios · CNPJ raiz é único</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancelar</button>
            <button onClick={salvar} disabled={!valido || salvando} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>
              {salvando ? "Salvando…" : edit ? "Salvar alterações" : "Salvar e abrir cliente →"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
