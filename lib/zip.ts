// Gerador de .zip no navegador, sem dependências (método "store", sem compressão —
// fotos e PDFs já vêm comprimidos). Nomes em UTF-8 (flag bit 11). Suficiente para
// empacotar comprovantes; abre no Windows, macOS e em qualquer descompactador.

export type ZipEntry = { nome: string; dados: Uint8Array; data?: Date };

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function criarZip(entradas: ZipEntry[]): Blob {
  const enc = new TextEncoder(); const partes: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const e of entradas) {
    const nome = enc.encode(e.nome.replace(/\\/g, "/")); const crc = crc32(e.dados); const { time, date } = dosDateTime(e.data ?? new Date());
    const local = new Uint8Array(30 + nome.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true); lv.setUint32(18, e.dados.length, true); lv.setUint32(22, e.dados.length, true);
    lv.setUint16(26, nome.length, true); lv.setUint16(28, 0, true); local.set(nome, 30);
    const cd = new Uint8Array(46 + nome.length); const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, e.dados.length, true); cv.setUint32(24, e.dados.length, true);
    cv.setUint16(28, nome.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); cd.set(nome, 46);
    partes.push(local, e.dados); central.push(cd); offset += local.length + e.dados.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22); const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true); fv.setUint16(4, 0, true); fv.setUint16(6, 0, true); fv.setUint16(8, entradas.length, true); fv.setUint16(10, entradas.length, true);
  fv.setUint32(12, cdSize, true); fv.setUint32(16, offset, true); fv.setUint16(20, 0, true);
  return new Blob([...partes, ...central, fim] as BlobPart[], { type: "application/zip" });
}

/** Nome seguro para arquivo: sem acentos, sem barras, sem espaços duplos. */
export function slugArquivo(s: string | null | undefined, max = 40) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "sem-nome";
}
