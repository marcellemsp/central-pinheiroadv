// Calculadora de prazos da Central PinheiroAdv.
//
// Judicial (CPC): só dias úteis (art. 219), exclui o dia do começo e inclui o do
// vencimento (art. 224), com o prazo suspenso de 20/12 a 20/01 (art. 220).
// No DJe, a publicação é o primeiro dia útil seguinte à disponibilização
// (Lei 11.419/2006, art. 4º, § 3º), e o prazo começa no dia útil seguinte.
//
// Administrativo federal (Decreto 70.235/1972, art. 5º): prazos contínuos,
// excluindo o dia do início e incluindo o do vencimento, e só começam ou
// vencem em dia de expediente normal.
//
// O resultado é uma conferência. Feriados locais, pontos facultativos e
// suspensões do tribunal precisam ser checados no calendário oficial.

export type Justica = "estadual_rj" | "federal" | "outra";
export type TipoPrazo = "judicial" | "administrativo";

export type Entrada = {
  tipo: TipoPrazo;
  justica: Justica;
  dataInicial: string; // AAAA-MM-DD: intimação, publicação, disponibilização ou ciência
  dias: number;
  disponibilizacaoDje: boolean; // a data informada é a da disponibilização no DJe
  datasSemExpediente: string[]; // datas extras informadas pela usuária
};

export type Passo = { data: string; texto: string };
export type Resultado = { vencimento: string; inicio: string; passos: Passo[]; ignorados: Passo[] };

// ---------------------------------------------------------------------------
// Datas sem fuso: tudo em UTC ao meio-dia para não escorregar de dia.

export function d(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}
export function iso(x: Date): string {
  return x.toISOString().slice(0, 10);
}
function mais(x: Date, n: number): Date {
  const y = new Date(x);
  y.setUTCDate(y.getUTCDate() + n);
  return y;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

export function feriados(ano: number, justica: Justica): Map<string, string> {
  const f = new Map<string, string>();
  const fixo = (mm: number, dd: number, nome: string) =>
    f.set(`${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, nome);
  const movel = (delta: number, nome: string) => f.set(iso(mais(pascoa(ano), delta)), nome);

  fixo(1, 1, "Confraternização Universal");
  fixo(4, 21, "Tiradentes");
  fixo(5, 1, "Dia do Trabalho");
  fixo(9, 7, "Independência");
  fixo(10, 12, "Nossa Senhora Aparecida");
  fixo(11, 2, "Finados");
  fixo(11, 15, "Proclamação da República");
  fixo(11, 20, "Dia da Consciência Negra");
  fixo(12, 25, "Natal");
  movel(-48, "Carnaval (segunda)");
  movel(-47, "Carnaval (terça)");
  movel(-2, "Sexta-feira Santa");
  movel(60, "Corpus Christi");

  if (justica === "estadual_rj") {
    fixo(4, 23, "São Jorge (RJ)");
  }
  if (justica === "federal") {
    // Lei 5.010/1966, art. 62.
    movel(-4, "Quarta-feira Santa (Justiça Federal)");
    movel(-3, "Quinta-feira Santa (Justiça Federal)");
    fixo(8, 11, "Dia da Justiça (Justiça Federal)");
    fixo(11, 1, "Todos os Santos (Justiça Federal)");
    fixo(12, 8, "Dia da Justiça (Justiça Federal)");
  }
  return f;
}

function motivoSemExpediente(x: Date, e: Entrada, cache: Map<number, Map<string, string>>, comRecesso: boolean): string | null {
  const s = iso(x);
  const dow = x.getUTCDay();
  if (dow === 0) return "domingo";
  if (dow === 6) return "sábado";
  const ano = x.getUTCFullYear();
  if (!cache.has(ano)) cache.set(ano, feriados(ano, e.justica));
  const fer = cache.get(ano)!.get(s);
  if (fer) return fer;
  if (e.datasSemExpediente.includes(s)) return "sem expediente (informado)";
  if (comRecesso) {
    const mmdd = s.slice(5);
    if (mmdd >= "12-20" || mmdd <= "01-20") return "suspensão de 20/12 a 20/01 (CPC, art. 220)";
  }
  return null;
}

export function calcular(e: Entrada): Resultado {
  const cache = new Map<number, Map<string, string>>();
  const passos: Passo[] = [];
  const ignorados: Passo[] = [];
  const judicial = e.tipo === "judicial";
  const util = (x: Date) => motivoSemExpediente(x, e, cache, judicial) === null;
  const proximoUtil = (x: Date) => {
    let y = mais(x, 1);
    for (let i = 0; i < 400 && !util(y); i++) {
      ignorados.push({ data: iso(y), texto: motivoSemExpediente(y, e, cache, judicial)! });
      y = mais(y, 1);
    }
    return y;
  };

  let base = d(e.dataInicial);

  if (judicial) {
    if (e.disponibilizacaoDje) {
      passos.push({ data: iso(base), texto: "Disponibilização no DJe" });
      base = proximoUtil(base);
      passos.push({ data: iso(base), texto: "Publicação (primeiro dia útil seguinte)" });
    } else {
      passos.push({ data: iso(base), texto: "Intimação ou publicação" });
    }
    let dia = proximoUtil(base);
    const inicio = iso(dia);
    passos.push({ data: inicio, texto: "1º dia do prazo" });
    for (let n = 2; n <= e.dias; n++) dia = proximoUtil(dia);
    const vencimento = iso(dia);
    passos.push({ data: vencimento, texto: `${e.dias}º dia útil: vencimento` });
    return { vencimento, inicio, passos, ignorados };
  }

  // Administrativo: dias corridos.
  passos.push({ data: iso(base), texto: "Ciência da intimação" });
  let inicio = mais(base, 1);
  if (!util(inicio)) {
    ignorados.push({ data: iso(inicio), texto: motivoSemExpediente(inicio, e, cache, false)! });
    inicio = proximoUtil(inicio);
  }
  passos.push({ data: iso(inicio), texto: "1º dia do prazo (primeiro dia de expediente)" });
  let venc = mais(inicio, e.dias - 1);
  if (!util(venc)) {
    passos.push({ data: iso(venc), texto: `${e.dias}º dia corrido, sem expediente` });
    venc = proximoUtil(venc);
    passos.push({ data: iso(venc), texto: "Vencimento prorrogado para o primeiro dia de expediente" });
  } else {
    passos.push({ data: iso(venc), texto: `${e.dias}º dia corrido: vencimento` });
  }
  return { vencimento: iso(venc), inicio: iso(inicio), passos, ignorados };
}
