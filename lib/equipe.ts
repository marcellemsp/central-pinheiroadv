// Equipe do Pinheiro Advogados. Hoje só a Marcelle; quando entrar alguém, inclua aqui
// (e no banco, em usuarios + usuarios_autorizados).
//
// COORDENADORES: revisam peças, aprovam exclusões e pagam reembolsos, na ordem da cadeia de revisão.
// ADVOGADOS: quem pode ser responsável por caso, pendência, acompanhamento ou certidão.
// CARTEIRAS: carteira de clientes (o antigo "banca"). Chave curta → advogado dono.

export const COORDENADORES = ["Marcelle"];
export const ADVOGADOS = ["Marcelle"];
export const CARTEIRAS: Record<string, string> = { MP: "Marcelle" };
export const RESPONSAVEIS_EXTERNOS = ["Estagiário", "Contador do cliente", "Cliente", "Financeiro"];
export const REVISOR_PADRAO = COORDENADORES[0];

const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().split(/\s+/)[0] ?? "";
export const ehCoordenadorNome = (nome?: string | null) => COORDENADORES.some(c => norm(c) === norm(nome));
