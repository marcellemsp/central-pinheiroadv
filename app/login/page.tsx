import RaizMark from "@/components/RaizMark";
import { entrarComSenha, enviarLink } from "./actions";

export const metadata = { title: "Entrar" };

type Busca = { enviado?: string; erro?: string; modo?: string };

const campo = "h-11 px-3 rounded-sm border border-line-strong bg-surface-200 text-ink";
const botao = "h-11 rounded-sm bg-petroleo text-on-brand font-semibold";

export default function LoginPage({ searchParams }: { searchParams: Busca }) {
  const modoLink = searchParams.modo === "link";
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-petroleo" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="h-1 bg-bordo" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <RaizMark size={44} />
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-2xl font-semibold text-ink-heading">Central</span>
              <span className="text-[11px] tracking-[0.3em] text-ink-muted">PINHEIROADV</span>
            </div>
          </div>

          {searchParams.enviado ? (
            <div className="border border-line bg-surface-200 rounded-md p-5 flex flex-col gap-2">
              <p className="label">Link enviado</p>
              <p className="text-ink-muted">Confira o seu e-mail e toque no link para entrar.</p>
              <a href="/login" className="text-sm text-petroleo font-semibold pt-2">Voltar</a>
            </div>
          ) : modoLink ? (
            <form action={enviarLink} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">E-mail</span>
                <input type="email" name="email" required autoComplete="email" className={campo} />
              </label>
              {searchParams.erro && <p className="text-sm text-bordo">{searchParams.erro}</p>}
              <button type="submit" className={botao}>Receber link por e-mail</button>
              <a href="/login" className="text-sm text-ink-muted text-center">Entrar com senha</a>
            </form>
          ) : (
            <form action={entrarComSenha} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">E-mail</span>
                <input type="email" name="email" required autoComplete="username" className={campo} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Senha</span>
                <input type="password" name="senha" required autoComplete="current-password" className={campo} />
              </label>
              {searchParams.erro && <p className="text-sm text-bordo">{searchParams.erro}</p>}
              <button type="submit" className={botao}>Entrar</button>
              <a href="/login?modo=link" className="text-sm text-ink-muted text-center">
                Entrar com link por e-mail
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
