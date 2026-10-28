import RaizMark from "@/components/RaizMark";
import { enviarLink, verificarCodigo } from "./actions";

export const metadata = { title: "Entrar" };

type Busca = { enviado?: string; erro?: string; email?: string };

export default function LoginPage({ searchParams }: { searchParams: Busca }) {
  const enviado = !!searchParams.enviado && !!searchParams.email;
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

          {enviado ? (
            <form action={verificarCodigo} className="flex flex-col gap-4">
              <p className="text-ink-muted leading-relaxed">
                Enviamos um e-mail para <strong className="text-ink">{searchParams.email}</strong>. Toque no link ou
                digite aqui o código de 6 dígitos.
              </p>
              <input type="hidden" name="email" value={searchParams.email} />
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Código</span>
                <input
                  name="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={8}
                  required
                  className="h-12 px-3 rounded-sm border border-line-strong bg-surface-200 text-ink text-xl tracking-[0.4em]"
                />
              </label>
              {searchParams.erro && <p className="text-sm text-bordo">{searchParams.erro}</p>}
              <button type="submit" className="h-11 rounded-sm bg-petroleo text-on-brand font-semibold">
                Entrar
              </button>
              <a href="/login" className="text-sm text-ink-muted text-center">
                Usar outro e-mail ou pedir novo código
              </a>
            </form>
          ) : (
            <form action={enviarLink} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">E-mail</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="h-11 px-3 rounded-sm border border-line-strong bg-surface-200 text-ink"
                />
              </label>
              {searchParams.erro && <p className="text-sm text-bordo">{searchParams.erro}</p>}
              <button type="submit" className="h-11 rounded-sm bg-petroleo text-on-brand font-semibold">
                Receber acesso por e-mail
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
