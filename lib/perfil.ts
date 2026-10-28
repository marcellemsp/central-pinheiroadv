// Perfil do usuário logado: quem é coordenador e quais áreas cada perfil pode ver.
import { AREAS, type Area } from "./areas";

import { COORDENADORES } from "./equipe";

export const COORDS = COORDENADORES;
const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export const primeiroNome = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";
export const mesmoNome = (a?: string | null, b?: string | null) => !!a && !!b && norm(primeiroNome(a)) === norm(primeiroNome(b));
/** Aceita nome completo, primeiro nome ou o campo `banca` de usuarios. */
export const ehCoordenador = (nomeOuBanca?: string | null) => COORDS.some(c => mesmoNome(c, nomeOuBanca));

/** Áreas visíveis só para coordenadores (e para quem tiver liberação específica). */
export const AREAS_RESTRITAS: Area[] = ["consultoria"];
/** Advogados com acesso liberado à Consultoria. A permissão real está no banco (tabela acesso_consultoria); esta lista só ajusta a tela. */
export const CONSULTORIA_LIBERADA: string[] = [];
const liberadoNaArea = (nomeOuBanca: string | null | undefined, area: string | null | undefined) => area === "consultoria" && CONSULTORIA_LIBERADA.some(n => mesmoNome(n, nomeOuBanca));
export const podeVerArea = (nomeOuBanca: string | null | undefined, area: string | null | undefined) => ehCoordenador(nomeOuBanca) || liberadoNaArea(nomeOuBanca, area) || !AREAS_RESTRITAS.includes(area as Area);
export const areasVisiveis = (nomeOuBanca?: string | null) => AREAS.filter(a => podeVerArea(nomeOuBanca, a.key));
