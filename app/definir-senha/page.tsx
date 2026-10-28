"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import RaizMark from "@/components/RaizMark";

// Tela aberta a partir do link de convite (ou de recuperação de senha): define nome e senha e entra.
export default function DefinirSenhaPage() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);
  // Fluxo PKCE: convite chega com ?code=; troca por sessao antes do timer.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).finally(() => {
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, []);

  useEffect(() => {
    let achou = false;
    const carregar = async (uid: string, email: string | null, meta: Record<string, string>) => {
      achou = true; setEmail(email);
      const { data: u } = await supabase.from("usuarios").select("nome_completo").eq("id", uid).maybeSingle();
      const atual = u?.nome_completo ?? meta.nome ?? "";
      if (atual && !atual.includes("@") && atual !== (email ?? "").split("@")[0]) setNome(atual);
    };
    // O link de convite chega com o token no #hash da URL; o cliente processa e dispara o evento abaixo.
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => { if (session?.user) carregar(session.user.id, session.user.email ?? null, (session.user.user_metadata ?? {}) as Record<string, string>); });
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) carregar(user.id, user.email ?? null, (user.user_metadata ?? {}) as Record<string, string>); });
    const t = setTimeout(() => { if (!achou) setSemSessao(true); }, 6000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = nome.trim().split(/\s+/).length >= 2 && senha.length >= 10 && senha === senha2;

  async function salvar() {
    if (!ok) return; setSalvando(true); setErro(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSemSessao(true); setSalvando(false); return; }
    const { error } = await supabase.auth.updateUser({ password: senha, data: { nome: nome.trim() } });
    if (error) { setErro(error.message === "New password should be different from the old password." ? "Escolha uma senha diferente da anterior." : error.message); setSalvando(false); return; }
    await supabase.from("usuarios").upsert({ id: user.id, email: user.email, nome_completo: nome.trim(), ativo: true }, { onConflict: "id" });
    window.location.href = "/home";
  }

  const campo = "w-full h-11 px-3 rounded-sm border border-line-strong bg-surface-200 text-ink outline-none focus:border-acao";
  const rotulo = "block text-sm font-semibold mb-1.5";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-petroleo" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="h-1 bg-bordo" />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <RaizMark size={44} />
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-2xl font-semibold text-ink-heading">Central</span>
              <span className="text-[11px] tracking-[0.3em] text-ink-muted">PINHEIROADV</span>
            </div>
          </div>
          <div>
            <p className="label">Nome e senha</p>
            <p className="text-sm text-ink-muted mt-2">{semSessao ? "Este link não está mais válido." : email ? <>Defina seu nome e sua senha para <b className="text-ink">{email}</b>.</> : "Carregando…"}</p>
          </div>
          {semSessao ? (
            <a href="/login" className="text-sm text-petroleo font-semibold">Entrar com e-mail e senha</a>
          ) : (
            <form onSubmit={e => { e.preventDefault(); salvar(); }} className="flex flex-col gap-4">
              <label><span className={rotulo}>Nome completo</span><input className={campo} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" /></label>
              <label><span className={rotulo}>Nova senha</span><input type="password" className={campo} value={senha} onChange={e => setSenha(e.target.value)} placeholder="mínimo 10 caracteres" autoComplete="new-password" /></label>
              <label><span className={rotulo}>Repita a senha</span><input type="password" className={campo} value={senha2} onChange={e => setSenha2(e.target.value)} autoComplete="new-password" />{senha2 && senha !== senha2 && <span className="block text-xs mt-1 text-bordo">As senhas não coincidem.</span>}</label>
              {erro && <p className="text-sm text-bordo">{erro}</p>}
              <button type="submit" disabled={!ok || salvando} className="h-11 rounded-sm bg-petroleo text-on-brand font-semibold disabled:opacity-50">{salvando ? "Salvando…" : "Salvar e entrar"}</button>
              <a href="/home" className="text-sm text-ink-muted text-center">Voltar para a Central</a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
