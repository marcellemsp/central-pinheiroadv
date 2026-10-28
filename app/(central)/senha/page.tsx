import { definirSenha } from "./actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Senha" };

const campo = "h-11 px-3 rounded-sm border border-line-strong bg-surface-200 text-ink";

export default async function SenhaPage({ searchParams }: { searchParams: { ok?: string; erro?: string } }) {
  const email = (await createClient()?.auth.getUser())?.data.user?.email ?? "";
  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex flex-col gap-2">
        <span className="label">Acesso</span>
        <h1 className="font-serif text-4xl font-medium text-ink-heading">Senha da Central</h1>
        <p className="text-ink-muted leading-relaxed">
          Com a senha você entra direto, inclusive pelo app instalado no iPhone. Guarde no Chaves do iCloud quando o
          aparelho oferecer.
        </p>
      </div>
      {searchParams.ok ? (
        <p className="border border-line bg-surface-200 rounded-md p-4">Senha salva.</p>
      ) : (
        <form action={definirSenha} className="flex flex-col gap-4">
          <input type="email" name="username" autoComplete="username" value={email} hidden readOnly />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Nova senha</span>
            <input type="password" name="senha" required minLength={10} autoComplete="new-password" className={campo} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Repita a senha</span>
            <input type="password" name="confirmacao" required minLength={10} autoComplete="new-password" className={campo} />
          </label>
          {searchParams.erro && <p className="text-sm text-bordo">{searchParams.erro}</p>}
          <button type="submit" className="h-11 rounded-sm bg-petroleo text-on-brand font-semibold">
            Salvar senha
          </button>
        </form>
      )}
    </div>
  );
}
