// lib/cnj.ts — validação de número de processo no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO),
// com conferência do dígito verificador (módulo 97, Resolução CNJ 65/2008) e grau pela origem.
export const soDigitos = (n?: string | null) => (n ?? "").replace(/\D/g, "");

// "Parece" uma tentativa de CNJ: tem o padrão <sequencial>-DD.<ano>… — distingue de números
// administrativos (SEI, TIF, requerimento), que não entram nesta validação.
// Só o que tem cara de CNJ (NNNNNNN-DD.AAAA.J.TR…) é validado; SEI/TIF/requerimento passam direto. Mesma regex do trigger pa_casos_cnj no banco.
export const pareceCNJ = (n?: string | null) => /\d{5,7}-\d{2}\.\d{4,5}\.\d\.\d{2}/.test(n ?? "");

export function cnjValido(n?: string | null): boolean {
  const d = soDigitos(n);
  if (d.length !== 20) return false;
  const seq = d.slice(0, 7), dd = d.slice(7, 9), ano = d.slice(9, 13), j = d.slice(13, 14), tr = d.slice(14, 16), orig = d.slice(16, 20);
  if (ano < "1900" || ano > "2200") return false;
  // mod 97 dígito a dígito (sem BigInt: o target do projeto é ES2017)
  let resto = 0; for (const ch of seq + ano + j + tr + orig + "00") resto = (resto * 10 + Number(ch)) % 97;
  return Number(dd) === 98 - resto;
}

export function cnjGrau(n?: string | null): 1 | 2 | null {
  const d = soDigitos(n);
  if (d.length !== 20) return null;
  return d.slice(16, 20) === "0000" ? 2 : 1;
}
