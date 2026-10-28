import type { Config } from "tailwindcss";

// Cores vêm dos tokens do design system Pinheiro Advogados (app/globals.css).
// Cada classe aponta para uma variável CSS, que muda sozinha entre claro e escuro.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-tema="escuro"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "surface-100": token("surface-100"),
        "surface-200": token("surface-200"),
        "surface-mist": token("surface-mist"),
        petroleo: token("brand-petroleo"),
        bordo: token("brand-bordo"),
        ink: token("ink"),
        "ink-muted": token("ink-muted"),
        "ink-heading": token("ink-heading"),
        "on-brand": token("on-brand"),
        "on-acao": token("on-brand"),
        "on-brand-muted": token("on-brand-muted"),
        line: token("line"),
        "line-strong": token("line-strong"),
        "pattern-tile": token("pattern-tile"),
        "pattern-accent": token("pattern-accent"),
        acao: token("acao-rgb"),
        alerta: token("alerta-rgb"),
        ok: token("ok-rgb"),
        atencao: token("atencao-rgb"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        label: "0.18em",
      },
    },
    // Marca: tudo reto. Botões e campos com 4px, painéis com 6px, nada mais redondo que isso.
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "4px",
      md: "6px",
      lg: "6px",
      xl: "6px",
      "2xl": "6px",
      "3xl": "6px",
      full: "2px",
    },
    // Marca: sem sombras.
    boxShadow: {
      sm: "none",
      DEFAULT: "none",
      md: "none",
      lg: "none",
      xl: "none",
      "2xl": "none",
      inner: "none",
      none: "none",
    },
  },
  plugins: [],
};

export default config;
