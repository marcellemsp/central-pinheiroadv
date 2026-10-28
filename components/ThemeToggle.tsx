"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";

type Tema = "claro" | "escuro" | "sistema";

// Claro, escuro ou o do sistema. A escolha fica neste aparelho.
export default function ThemeToggle({ claro }: { claro?: boolean }) {
  const [tema, setTema] = useState<Tema>("sistema");

  useEffect(() => {
    try {
      const t = localStorage.getItem("central-tema");
      if (t === "claro" || t === "escuro") setTema(t);
    } catch {}
  }, []);

  function aplicar(t: Tema) {
    setTema(t);
    try { localStorage.setItem("central-tema", t); } catch {}
    if (t === "sistema") document.documentElement.removeAttribute("data-tema");
    else document.documentElement.setAttribute("data-tema", t);
  }

  const opcoes: [Tema, string, typeof Sun][] = [["claro", "Tema claro", Sun], ["escuro", "Tema escuro", Moon], ["sistema", "Seguir o sistema", Laptop]];
  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-sm border ${claro ? "border-line" : "border-on-brand/25"}`}>
      {opcoes.map(([t, titulo, Icone]) => {
        const ativo = tema === t;
        const cor = claro
          ? ativo ? "bg-petroleo text-on-brand" : "text-ink-muted"
          : ativo ? "bg-on-brand text-petroleo" : "text-on-brand-muted";
        return (
          <button key={t} onClick={() => aplicar(t)} title={titulo} aria-label={titulo} aria-pressed={ativo} className={`p-1.5 rounded-sm ${cor}`}>
            <Icone size={13} />
          </button>
        );
      })}
    </div>
  );
}
