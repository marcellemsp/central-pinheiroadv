"use client";

// Erro no layout raiz (raro). Aqui o globals.css não carrega, então as cores vão direto,
// com os valores do design system Pinheiro Advogados.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR"><body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FAFBFA", color: "#17211F", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", borderTop: "3px solid #6E1F2B" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 500, fontSize: 22, color: "#0F3B3D", margin: "8px 0 6px" }}>A Central encontrou um erro</h2>
        <p style={{ fontSize: 14, color: "#53605D", lineHeight: 1.5 }}>Os dados estão salvos no servidor. Recarregue a página.{error?.digest ? ` Código: ${error.digest}` : ""}</p>
        <button onClick={() => reset()} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 4, border: 0, background: "#0F3B3D", color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Recarregar</button>
      </div>
    </body></html>
  );
}
