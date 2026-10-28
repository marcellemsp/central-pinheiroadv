"use client";
import { useEffect, useState } from "react";

// Registra o service worker (torna o site instalável) e mostra um aviso discreto "Instalar como app"
// quando o navegador permitir. Dispensado uma vez, só volta depois de 30 dias.
const KEY = "pa_pwa_dispensado";

export default function PwaInstall() {
  const [prompt, setPrompt] = useState<any>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone) { setInstalado(true); return; }
    const dispensadoEm = Number(localStorage.getItem(KEY) || 0);
    const escondido = dispensadoEm && Date.now() - dispensadoEm < 30 * 864e5;
    const onPrompt = (e: Event) => { e.preventDefault(); if (!escondido) setPrompt(e); };
    const onInstalled = () => { setInstalado(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (instalado || !prompt) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-3 px-3.5 py-3 rounded-lg border shadow-2xl max-w-[360px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong, var(--text-secondary))", color: "var(--text-primary)" }}>
      <img src="/icons/icon-192-v3.png" alt="" width={36} height={36} className="rounded-lg shrink-0" />
      <div className="min-w-0 text-[12px] leading-snug">
        <b className="block">Instalar como app</b>
        <span style={{ color: "var(--text-muted)" }}>Janela própria e ícone na barra de tarefas, igual a um programa.</span>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={async () => { try { prompt.prompt(); await prompt.userChoice; } catch {} setPrompt(null); }} className="px-2.5 py-1.5 rounded text-[11px] font-semibold text-on-acao" style={{ background: "var(--acao)" }}>Instalar</button>
        <button onClick={() => { localStorage.setItem(KEY, String(Date.now())); setPrompt(null); }} className="px-2.5 py-1 rounded text-[11px]" style={{ color: "var(--text-muted)" }}>Agora não</button>
      </div>
    </div>
  );
}
