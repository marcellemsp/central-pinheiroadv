import Link from "next/link";
import RaizMark from "./RaizMark";
import NavLink from "./NavLink";
import { sair } from "@/app/(central)/sair/actions";

const ITENS = [
  { href: "/", rotulo: "Início" },
  { href: "/pendencias", rotulo: "Pendências" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-petroleo" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="h-1 bg-bordo" />
      <header className="bg-petroleo text-on-brand">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 no-underline text-on-brand">
            <RaizMark size={34} sobre="petroleo" />
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-xl font-semibold">Central</span>
              <span className="text-[11px] tracking-[0.3em] text-on-brand-muted">PINHEIROADV</span>
            </span>
          </Link>
          <nav aria-label="Principal" className="flex flex-wrap items-center gap-1">
            {ITENS.map((i) => (
              <NavLink key={i.href} href={i.href}>
                {i.rotulo}
              </NavLink>
            ))}
            <span className="ml-2 pl-2 border-l border-on-brand-muted/30" />
            <NavLink href="/senha">Senha</NavLink>
            <form action={sair}>
              <button type="submit" className="px-3 py-2 rounded-sm text-sm text-on-brand-muted hover:text-on-brand">
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center gap-2 text-xs text-ink-muted">
          <RaizMark size={18} />
          Pinheiro Advogados · Central PinheiroAdv
        </div>
      </footer>
    </div>
  );
}
