import RaizMark from "@/components/RaizMark";
import { enviarLink } from "./actions";

export const metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: { searchParams: { enviado?: string; erro?: string } }) {
  return (
    <div className="min-h-screen flex flex-col">
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
            <div className="border border-line bg-surface-200 rounded-md p-5">
              <p className="label mb-2">Link enviado</p>
              <p className="text-ink-muted">Confira o seu e-mail e toque no link para entrar.</p>
            </div>
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
                Receber link de acesso
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
