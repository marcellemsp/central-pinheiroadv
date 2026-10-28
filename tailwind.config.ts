import type { Config } from "tailwindcss";

// Cores vêm dos tokens do design system Pinheiro Advogados (app/globals.css).
// Cada classe aponta para uma variável CSS, que muda sozinha entre claro e escuro.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
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
        "on-brand-muted": token("on-brand-muted"),
        line: token("line"),
        "line-strong": token("line-strong"),
        "pattern-tile": token("pattern-tile"),
        "pattern-accent": token("pattern-accent"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
      },
      letterSpacing: {
        label: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
