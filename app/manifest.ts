import type { MetadataRoute } from "next";

// Permite instalar a Central como app no iPhone, iPad, Mac e Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Central PinheiroAdv",
    short_name: "Central",
    description: "Sistema interno do Pinheiro Advogados",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAFBFA",
    theme_color: "#0F3B3D",
    icons: [
      { src: "/icons/icon-192-v3.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-v3.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512-v3.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pendências", short_name: "Pendências", url: "/pendencias" },
    ],
  };
}
