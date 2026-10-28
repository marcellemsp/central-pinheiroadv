import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Central PinheiroAdv", template: "%s · Central PinheiroAdv" },
  description: "Sistema interno do Pinheiro Advogados",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F3B3D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=Inter+Tight:wght@400;500;600&display=swap"
        />
        <style>{`:root{--font-serif:"Source Serif 4";--font-sans:"Inter Tight";}`}</style>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
