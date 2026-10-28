// Gerador de .xlsx no navegador, sem dependências: monta o pacote OOXML mínimo e empacota com criarZip().
// Suporta várias abas, texto, número (com formato) e data. Abre no Excel, LibreOffice e Google Sheets.
import { criarZip } from "./zip";

export type Celula = string | number | null | undefined | { v: number; fmt?: "brl" | "int" } | { d: string };
export type Aba = { nome: string; colunas: string[]; linhas: Celula[][]; larguras?: number[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (n: number) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
// estilos: 0 normal · 1 cabeçalho (negrito, fundo) · 2 moeda R$ · 3 data dd/mm/aaaa · 4 inteiro · 5 total (negrito + moeda)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const serialData = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };

function celula(ref: string, c: Celula, negrito?: boolean): string {
  if (c === null || c === undefined || c === "") return "";
  if (typeof c === "object" && "d" in c) return c.d ? `<c r="${ref}" s="3"><v>${serialData(c.d)}</v></c>` : "";
  if (typeof c === "object") return `<c r="${ref}" s="${c.fmt === "int" ? 4 : negrito ? 5 : 2}"><v>${c.v}</v></c>`;
  if (typeof c === "number") return `<c r="${ref}" s="${negrito ? 5 : 0}"><v>${c}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${negrito ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(String(c))}</t></is></c>`;
}

function folha(a: Aba): string {
  const larg = a.larguras ?? a.colunas.map(() => 16);
  const cols = `<cols>${larg.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const linhas: string[] = [];
  linhas.push(`<row r="1">${a.colunas.map((h, i) => celula(`${col(i)}1`, h, true)).join("")}</row>`);
  a.linhas.forEach((ln, r) => {
    const negrito = (ln as any).__total === true;
    linhas.push(`<row r="${r + 2}">${ln.map((c, i) => celula(`${col(i)}${r + 2}`, c, negrito)).join("")}</row>`);
  });
  const ultima = `${col(a.colunas.length - 1)}${a.linhas.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols}<sheetData>${linhas.join("")}</sheetData>
<autoFilter ref="A1:${ultima}"/>
</worksheet>`;
}

/** Marca uma linha como total (negrito, moeda em negrito). */
export const linhaTotal = (ln: Celula[]) => Object.assign(ln, { __total: true });

export function criarXlsx(abas: Aba[]): Blob {
  const enc = new TextEncoder(); const agora = new Date();
  const nomeAba = (s: string) => s.replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31);
  const arquivos: { nome: string; dados: Uint8Array; data: Date }[] = [
    { nome: "[Content_Types].xml", data: agora, dados: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`) },
    { nome: "_rels/.rels", data: agora, dados: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { nome: "xl/workbook.xml", data: agora, dados: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${abas.map((a, i) => `<sheet name="${esc(nomeAba(a.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`) },
    { nome: "xl/_rels/workbook.xml.rels", data: agora, dados: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`) },
    { nome: "xl/styles.xml", data: agora, dados: enc.encode(STYLES) },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, data: agora, dados: enc.encode(folha(a)) })),
  ];
  const zip = criarZip(arquivos);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
