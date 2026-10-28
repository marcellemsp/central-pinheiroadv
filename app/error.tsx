"use client";
import { useEffect } from "react";

// Error boundary: um erro em qualquer página mostra este aviso em vez de tela branca.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Central PinheiroAdv]", error); }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-[440px] w-full rounded-md border p-6 text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <h2 className="font-serif text-[20px] text-ink-heading">Algo deu errado nesta tela</h2>
        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>Nada foi perdido: os dados estão salvos no servidor. Tente de novo; se continuar, anote o código abaixo.</p>
        {error?.digest && <div className="text-[10.5px] mt-2 font-mono" style={{ color: "var(--text-muted)" }}>código: {error.digest}</div>}
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => reset()} className="px-3 py-1.5 rounded text-xs font-medium text-on-acao" style={{ background: "var(--acao)" }}>Tentar de novo</button>
          <a href="/home" className="px-3 py-1.5 rounded text-xs font-medium border" style={{ background: "var(--bg-page)", borderColor: "var(--border)", color: "var(--text-primary)" }}>Ir para o início</a>
        </div>
      </div>
    </div>
  );
}
