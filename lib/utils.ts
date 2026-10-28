// Parse YYYY-MM-DD como local (evita timezone shift)
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // Se YYYY-MM-DD puro, parsear como local (evita timezone offset)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function diasAteFatal(fatal: string | null): number | null {
  if (!fatal) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fatal);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(fatal);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export function classFatal(fatal: string | null): string {
  const d = diasAteFatal(fatal);
  if (d === null) return "text-slate-400";
  if (d < 0) return "text-red-600 font-bold";
  if (d <= 2) return "text-red-500 font-semibold";
  if (d <= 7) return "text-amber-600 font-medium";
  return "text-slate-600";
}

export function adicionarDiasUteis(dataISO: string, dias: number): string | null {
  if (!dataISO) return null;
  const d = new Date(dataISO + (dataISO.length === 10 ? "T12:00:00" : ""));
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) restantes--;
  }
  return d.toISOString().slice(0, 10);
}

export function diferencaDiasUteis(deISO: string, ateISO: string): number {
  if (!deISO || !ateISO) return 0;
  const de = new Date(deISO + "T12:00:00");
  const ate = new Date(ateISO + "T12:00:00");
  let count = 0;
  const c = new Date(de);
  while (c < ate) {
    c.setDate(c.getDate() + 1);
    if (c.getDay() !== 0 && c.getDay() !== 6) count++;
  }
  return count;
}

export function calcularDataEntrega(dataCiencia: string | null, fatal: string | null): string | null {
  if (!dataCiencia || !fatal) return null;
  const dias = diferencaDiasUteis(dataCiencia, fatal);
  let folga = 1;
  if (dias > 5 && dias <= 10) folga = 3;
  else if (dias > 10) folga = 5;
  return adicionarDiasUteis(dataCiencia, folga);
}
