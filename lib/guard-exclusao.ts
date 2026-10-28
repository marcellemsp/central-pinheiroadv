// Exclusão com aprovação (v44).
// Coordenador (Marcelle/Vinícius/Alan) apaga direto — comportamento antigo.
// Não-coordenador que dispara .delete() no cliente Supabase vê um prompt pedindo o motivo;
// se preencher, o pedido vai para pa_solicitar_exclusao (fila em Aprovações → Exclusões),
// o item ganha exclusao_id no banco e some do fluxo ativo até o coordenador aprovar ou devolver.
// A garantia real é o RLS de DELETE (public.eh_coordenador()); este arquivo é só a UX.

type Papel = boolean | undefined;
const KEY = "__paCoordenador";

export function marcarCoordenador(v: boolean) {
  if (typeof window !== "undefined") (window as any)[KEY] = v;
}
export function ehCoordenadorLogado(): Papel {
  return typeof window === "undefined" ? undefined : ((window as any)[KEY] as Papel);
}

// Tabelas que aceitam pedido de exclusão (mesma lista da RPC no banco).
const TABELAS_APROVACAO = new Set([
  "caso_pendencias", "caso_andamentos", "casos", "empresas",
  "alertes", "providencias", "despesas", "reembolso_lotes", "caixa_movimentos", "dias_nao_uteis",
]);

const NEGADO = { data: null, error: { message: "Você não tem permissão para excluir.", code: "MDV_SEM_PERMISSAO", details: "", hint: "" }, count: null, status: 403, statusText: "Forbidden" };
const OK = { data: null, error: null, count: null, status: 200, statusText: "OK" };

// Toast simples reutilizado (verde ou vermelho).
let toastEl: HTMLDivElement | null = null;
let toastTimer: any = null;
export function avisar(msg: string, tom: "ok" | "erro" = "ok") {
  if (typeof document === "undefined") return;
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.setAttribute("role", "alert");
    toastEl.style.cssText = "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,460px);padding:10px 14px;border-radius:4px;border:1px solid;background:var(--bg-surface);color:var(--text-primary);font:13px/1.45 'Inter Tight',system-ui,sans-serif;";
    document.body.appendChild(toastEl);
  }
  toastEl.style.borderColor = tom === "ok" ? "var(--ok)" : "var(--alerta)";
  toastEl.innerHTML = msg;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (toastEl) toastEl.style.display = "none"; }, 5000);
}

// Builder falso p/ o caso de exclusão negada sem RPC (tabelas fora do escopo).
function builderNegado(): any {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(NEGADO).then(res, rej);
      if (prop === "catch") return (rej: any) => Promise.resolve(NEGADO).catch(rej);
      if (prop === "finally") return (f: any) => Promise.resolve(NEGADO).finally(f);
      if (prop === "throwOnError") return () => p;
      return () => p;
    },
    apply() { return p; },
  });
  return p;
}

// Builder que engole o .eq('id', X)/… e pergunta o motivo — depois chama a RPC.
function builderPedirExclusao(client: any, tabela: string): any {
  const filtros: { col: string; op: string; val: any }[] = [];
  const disp = () => {
    // dispara: só continua se houver id concreto.
    const idFiltro = filtros.find(f => f.col === "id" && f.op === "eq" && typeof f.val === "string");
    if (!idFiltro) {
      // sem id explícito não sabemos o alvo — bloqueia com aviso genérico
      avisar("Para pedir exclusão, o botão precisa saber o id da linha. Fale com o time técnico.", "erro");
      return Promise.resolve(NEGADO);
    }
    const motivo = window.prompt(`Excluir precisa de aprovação da coordenação.\n\nPor que você quer excluir? (obrigatório)`, "");
    if (motivo === null) return Promise.resolve(OK); // cancelou — nada feito
    const m = motivo.trim();
    if (m.length < 3) { avisar("Motivo é obrigatório (mín. 3 letras).", "erro"); return Promise.resolve(NEGADO); }
    return (async () => {
      const { data, error } = await client.rpc("pa_solicitar_exclusao", { p_tabela: tabela, p_id: idFiltro.val, p_motivo: m });
      if (error) { avisar("Não foi possível pedir a exclusão: " + error.message, "erro"); return { ...NEGADO, error: { ...NEGADO.error, message: error.message } }; }
      avisar(`Pedido enviado à coordenação. Você acompanha em <b>Aprovações › Exclusões</b>.`, "ok");
      return { data, error: null, count: null, status: 200, statusText: "OK" };
    })();
  };
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => disp().then(res, rej);
      if (prop === "catch") return (rej: any) => disp().catch(rej);
      if (prop === "finally") return (f: any) => disp().finally(f);
      if (prop === "throwOnError") return () => p;
      return (...args: any[]) => { if (typeof prop === "string" && args.length >= 2) filtros.push({ col: String(args[0]), op: prop, val: args[1] }); return p; };
    },
  });
  return p;
}

/** Envolve o cliente Supabase do navegador. Idempotente. */
export function protegerExclusao<T extends { from: (t: string) => any }>(client: T): T {
  if ((client as any).__paProtegido) return client;
  const fromOriginal = client.from.bind(client);
  (client as any).from = (table: string) => {
    const b = fromOriginal(table);
    if (b && typeof b.delete === "function") {
      const deleteOriginal = b.delete.bind(b);
      b.delete = (...args: any[]) => {
        if (ehCoordenadorLogado() === false) {
          if (TABELAS_APROVACAO.has(table)) return builderPedirExclusao(client, table);
          avisar("Você não tem permissão para excluir.", "erro"); return builderNegado();
        }
        return deleteOriginal(...args);
      };
    }
    return b;
  };
  (client as any).__paProtegido = true;
  return client;
}

/** Helper para chamar diretamente com prompt customizado (para casos que não passam por .delete()). */
export async function pedirExclusao(client: any, tabela: string, id: string, motivoPreset?: string): Promise<{ ok: boolean; erro?: string }> {
  const motivo = motivoPreset ?? window.prompt(`Excluir precisa de aprovação da coordenação.\n\nPor que você quer excluir? (obrigatório)`, "");
  if (motivo === null) return { ok: false };
  const m = motivo.trim();
  if (m.length < 3) { avisar("Motivo é obrigatório (mín. 3 letras).", "erro"); return { ok: false, erro: "motivo-curto" }; }
  const { error } = await client.rpc("pa_solicitar_exclusao", { p_tabela: tabela, p_id: id, p_motivo: m });
  if (error) { avisar("Não foi possível pedir a exclusão: " + error.message, "erro"); return { ok: false, erro: error.message }; }
  avisar(`Pedido enviado à coordenação. Você acompanha em <b>Aprovações › Exclusões</b>.`, "ok");
  return { ok: true };
}

// Compat com o nome antigo, para não quebrar quem já importava.
export const avisarSemPermissao = (msg?: string) => avisar(msg ?? "Você não tem permissão para excluir.", "erro");
export const MSG_SEM_PERMISSAO = "Você não tem permissão para excluir.";
