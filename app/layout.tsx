import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaInstall from "@/components/PwaInstall";

export const metadata: Metadata = {
  title: { default: "Central PinheiroAdv", template: "%s · Central PinheiroAdv" },
  description: "Sistema interno do Pinheiro Advogados",
  applicationName: "Central PinheiroAdv",
  appleWebApp: { capable: true, title: "Central", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon-v3.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F3B3D",
  viewportFit: "cover",
};

// Aplica o tema escolhido antes da primeira pintura (evita piscar).
const temaInicial = `try{var t=localStorage.getItem('central-tema');if(t==='claro'||t==='escuro')document.documentElement.setAttribute('data-tema',t);}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=Inter+Tight:wght@400;500;600;700&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: `:root{--font-serif:"Source Serif 4";--font-sans:"Inter Tight";}` }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
