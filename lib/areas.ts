// Definição das áreas de atuação, seus campos específicos, colunas de tabela e fluxos de situação.
export type Area = "contencioso" | "consultoria" | "incentivo" | "transacao" | "fiscalizacao";

export type FieldType = "text" | "date" | "select" | "seg" | "multi" | "textarea" | "number" | "tags";
export type Field = {
  k: string; label: string; type: FieldType;
  opts?: string[]; req?: boolean; hint?: string; ph?: string; half?: boolean; third?: boolean; section?: string;
  auto?: (d: Record<string, unknown>) => string | null;   // texto calculado exibido abaixo do campo
};

import { ADVOGADOS } from "./equipe";
export { ADVOGADOS };

export const CHECKLIST_9025 = [
  ["Carta consulta assinada", "CODIN"], ["Contrato social consolidado", "Lei 9.025 art. 5º"], ["CND Federal (RFB/PGFN)", "Lei 9.025 art. 5º"],
  ["CND Estadual (ICMS)", "Lei 9.025 art. 5º"], ["CND Municipal", "Lei 9.025 art. 5º"], ["CRF FGTS", "Decreto"], ["CNDT Trabalhista", "Decreto"],
  ["Projeto de investimento", "CODIN"], ["Comprovante de sede no município", "CODIN"], ["Relação de empregos previstos", "CODIN"],
  ["Balanço patrimonial último exercício", "CODIN"], ["Procuração ao escritório", "Interno"],
];

export type AreaDef = {
  key: Area; label: string; icon: string; sing: string; artigo: "o" | "a";
  bg: string; fg: string;
  fluxo: string[];
  fields: Field[];
  cols: { h: string; w?: string }[];
  row: (c: CasoLike) => (string | { pz: string; cls: "fatal" | "prox" | "ok" | "" } | { steps: number; fail?: string } | { bar: number; label: string })[];
  hint: string;
};

export type CasoLike = { titulo: string; numero: string | null; orgao: string | null; situacao: string; advogado: string | null; prazo_proximo: string | null; prazo_fatal?: boolean | null; dados: Record<string, any>; ativo: boolean };

const fmtD = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
// Próximo prazo = menor prazo entre as pendências abertas do caso (calculado na página, não guardado).
const prazo = (d?: string | null, fatal?: boolean | null) => {
  if (!d) return { pz: "—", cls: "" as const };
  const dias = Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 864e5);
  if (dias < 0) return { pz: "VENCIDO " + fmtD(d), cls: "fatal" as const };
  if (fatal && dias <= 7) return { pz: "FATAL " + fmtD(d), cls: "fatal" as const };
  return { pz: (dias <= 7 ? "próx. " : "") + fmtD(d), cls: dias <= 7 ? "prox" as const : "" as const };
};
const money = (v?: string) => v ? (v.startsWith("R$") ? v : "R$ " + v) : "—";

export const AREAS: AreaDef[] = [
  {
    key: "contencioso", label: "Contencioso", icon: "", sing: "processo", artigo: "o", bg: "var(--tag-blue-bg)", fg: "var(--tag-blue-fg)",
    fluxo: ["Em preparação", "Distribuído", "Em andamento", "Aguardando decisão", "Em recurso", "Encerrado"],
    hint: "Pode nascer sem número — fica \"Em preparação\" e recebe o CNJ quando distribuído.",
    fields: [
      { k: "titulo", label: "Título", type: "text", req: true, ph: "Ex.: Ação Anulatória — AI 03.9.98.104-1", section: "Identificação" },
      { k: "esfera", label: "Esfera", type: "seg", opts: ["Judicial", "Administrativo"], half: true },
      { k: "tipo_acao", label: "Tipo de ação", type: "select", opts: ["Ação Anulatória", "Execução Fiscal (defesa)", "Embargos à Execução", "Mandado de Segurança", "Ação Declaratória", "Impugnação / Recurso admin.", "Outra"], half: true },
      { k: "numero", label: "Nº do processo (CNJ / admin)", type: "text", ph: "0000000-00.0000.0.00.0000", half: true, hint: "Vazio = em preparação." },
      { k: "sistema", label: "Sistema", type: "select", opts: ["PJe", "e-SAJ", "e-Proc", "SEI / admin", "Outro"], half: true },
      { k: "tribunal", label: "Tribunal", type: "select", opts: ["TJRJ", "TRF2", "TJSP", "TRF3", "CARF", "SEFAZ/RJ", "Outro"], third: true },
      { k: "orgao", label: "Vara / órgão julgador", type: "text", ph: "Ex.: 1ª Vara Fazenda Pública", third: true },
      { k: "instancia", label: "Instância", type: "seg", opts: ["1ª", "2ª", "Superior"], third: true },
      { k: "posicao", label: "Posição do cliente", type: "seg", opts: ["Autor", "Réu / Executado", "Impetrante"], half: true, section: "Partes e valores" },
      { k: "adverso", label: "Adverso", type: "text", ph: "Ex.: Estado do Rio de Janeiro", half: true },
      { k: "valor", label: "Valor da causa / débito", type: "text", ph: "R$", half: true },
      { k: "origem", label: "Origem (AI / CDA / proc. admin)", type: "text", half: true },
      { k: "advogado", label: "Advogado responsável", type: "select", opts: ADVOGADOS, req: true, half: true, section: "Responsabilidade" },
      { k: "tese", label: "Tese / tags", type: "tags", ph: "Selecione ou digite uma nova e Enter", half: true },
      { k: "situacao", label: "Situação", type: "select", opts: [], half: true },
      { k: "observacoes", label: "Estratégia / observações", type: "textarea" },
    ],
    cols: [{ h: "Processo", w: "21%" }, { h: "Órgão / instância", w: "18%" }, { h: "Situação", w: "9%" }, { h: "Advogado", w: "8%" }, { h: "Adverso", w: "13%" }, { h: "Valor", w: "8%" }, { h: "Próx. prazo", w: "10%" }],
    row: c => [`${c.titulo}\n${c.numero ?? "sem número"}`, [c.dados.tribunal, c.orgao, c.dados.instancia ? c.dados.instancia + " inst." : null].filter(Boolean).join(" · ") || "—", c.situacao, c.advogado ?? "—", c.dados.adverso ?? "—", money(c.dados.valor), prazo(c.prazo_proximo, c.prazo_fatal)],
  },
  {
    key: "consultoria", label: "Consultoria", icon: "", sing: "consultoria", artigo: "a", bg: "var(--tag-purple-bg)", fg: "var(--tag-purple-fg)",
    fluxo: ["Em preparação", "Em análise", "Aguardando cliente", "Entregue", "Conta contínua"],
    hint: "Sem prazo fatal: o que manda é o prazo acordado e o entregável.",
    fields: [
      { k: "titulo", label: "Título", type: "text", req: true, ph: "Ex.: Revisão anual — Contrato Fornecedor XYZ" },
      { k: "sub_tipo", label: "Sub-tipo", type: "seg", opts: ["Por demanda", "Conta contínua"], req: true },
      { k: "solicitante", label: "Solicitante no cliente", type: "text", ph: "Nome · cargo", half: true },
      { k: "tema", label: "Tema", type: "select", opts: ["Contratos", "Tributário", "Societário", "Trabalhista", "Regulatório", "Outro"], half: true },
      { k: "entregaveis", label: "Entregável", type: "multi", opts: ["Parecer", "Minuta", "Memorando", "Reunião", "Planilha"], half: true, section: "Entrega" },
      { k: "prazo_proximo", label: "Prazo acordado", type: "date", half: true, hint: "Não é fatal — pode renegociar." },
      { k: "honorarios_modelo", label: "Modelo", type: "seg", opts: ["Fixo", "Por hora", "Mensal"], third: true, section: "Honorários" },
      { k: "honorarios_valor", label: "Valor", type: "text", ph: "R$", third: true },
      { k: "horas_estimadas", label: "Horas estimadas", type: "text", ph: "Ex.: 40h", third: true },
      { k: "advogado", label: "Advogado responsável", type: "select", opts: ADVOGADOS, req: true, half: true },
      { k: "situacao", label: "Situação", type: "select", opts: [], half: true },
      { k: "observacoes", label: "Escopo", type: "textarea" },
    ],
    cols: [{ h: "Consultoria", w: "28%" }, { h: "Sub-tipo" }, { h: "Solicitante" }, { h: "Entregável" }, { h: "Situação" }, { h: "Advogado" }, { h: "Prazo acordado" }, { h: "Horas" }],
    row: c => [c.titulo, c.dados.sub_tipo ?? "—", c.dados.solicitante ?? "—", (c.dados.entregaveis ?? []).join(" + ") || "—", c.situacao, c.advogado ?? "—", prazo(c.prazo_proximo, c.prazo_fatal), c.dados.horas_estimadas ? `0h / ${c.dados.horas_estimadas}` : "—"],
  },
  {
    key: "incentivo", label: "Incentivos", icon: "", sing: "incentivo", artigo: "o", bg: "var(--tag-green-bg)", fg: "var(--tag-green-fg)",
    fluxo: ["Carta consulta", "Documentação", "Protocolo", "Em análise", "Deferido", "Vigente"],
    hint: "Nasce na etapa \"Carta consulta\". O checklist documental é gerado a partir da lei.",
    fields: [
      { k: "titulo", label: "Título", type: "text", req: true, ph: "Ex.: RIOLOG — Adesão 2026" },
      { k: "programa", label: "Programa / lei", type: "select", opts: ["Lei RJ 9.025/2020 — RIOLOG", "Lei RJ 6.979/2015 — Fabricante vinculado", "Lei RJ 8.960 — Iguaçu / Baixada", "Programa de Compliance / Integridade", "TARE", "Outro"], req: true, half: true },
      { k: "modalidade", label: "Modalidade", type: "select", opts: ["Logística", "Industrial", "Atacadista", "Outra"], half: true },
      { k: "orgao", label: "Órgão", type: "text", ph: "CODIN / SEDEIS", third: true },
      { k: "numero", label: "Nº SEI", type: "text", ph: "preenchido no protocolo", third: true },
      { k: "situacao", label: "Etapa", type: "select", opts: [], third: true },
      { k: "municipio", label: "Município", type: "text", third: true, section: "Projeto" },
      { k: "investimento", label: "Investimento previsto", type: "text", ph: "R$", third: true },
      { k: "empregos", label: "Empregos previstos", type: "text", third: true },
      { k: "vigencia", label: "Vigência pretendida", type: "text", ph: "Ex.: 10 anos", half: true },
      { k: "advogado", label: "Advogado responsável", type: "select", opts: ADVOGADOS, req: true, half: true },
      { k: "gerar_checklist", label: "Checklist documental", type: "seg", opts: ["Gerar padrão da lei (12 itens)", "Começar vazio"], half: true, hint: "Certidões já em Documentos do cliente entram como obtido." },
      { k: "observacoes", label: "Observações", type: "textarea" },
    ],
    cols: [{ h: "Incentivo", w: "26%" }, { h: "Programa / lei" }, { h: "Órgão · nº SEI" }, { h: "Etapa" }, { h: "Checklist" }, { h: "Advogado" }, { h: "Próx. prazo" }],
    row: c => { const ck: any[] = c.dados.checklist ?? []; const ok = ck.filter(i => i.status === "obtido").length; return [c.titulo, c.dados.programa ?? "—", [c.orgao, c.numero].filter(Boolean).join(" · ") || "—", { steps: Math.max(0, ["Carta consulta", "Documentação", "Protocolo", "Em análise", "Deferido", "Vigente"].indexOf(c.situacao)) }, ck.length ? { bar: ok / ck.length, label: `${ok}/${ck.length}` } : "—", c.advogado ?? "—", prazo(c.prazo_proximo, c.prazo_fatal)]; },
  },
  {
    key: "transacao", label: "Transação", icon: "", sing: "transação", artigo: "a", bg: "var(--tag-pink-bg)", fg: "var(--tag-pink-fg)",
    fluxo: ["Em preparação", "Negociação", "Proposta enviada", "Homologada", "Em cumprimento", "Quitada", "Rescindida", "Prejudicada"],
    hint: "Cadastre a modalidade e os débitos. Parcelas são geradas depois da homologação.",
    fields: [
      { k: "titulo", label: "Título", type: "text", req: true, ph: "Ex.: Transação PGFN — Débitos previdenciários" },
      { k: "modalidade", label: "Modalidade", type: "select", opts: ["Transação Excepcional (PGFN)", "Transação por adesão — edital", "Transação individual", "Transação PGE/RJ", "Transação municipal", "Outra"], req: true, half: true },
      { k: "edital", label: "Edital / base legal", type: "text", half: true },
      { k: "orgao", label: "Órgão", type: "text", ph: "PGFN Regional RJ", third: true },
      { k: "numero", label: "Nº do requerimento", type: "text", ph: "preenchido na adesão", third: true },
      { k: "prazo_proximo", label: "Prazo de adesão (edital)", type: "date", third: true, hint: "Improrrogável." },
      { k: "cdas", label: "Débitos incluídos (uma CDA por linha: nº · tributo · valor)", type: "textarea", section: "Débitos", ph: "70.1.23.001234-56 · Contrib. prev. 2019 · R$ 1.250.000" },
      { k: "consolidado", label: "Consolidado", type: "text", ph: "R$", third: true },
      { k: "desconto", label: "Desconto", type: "text", ph: "%", third: true },
      { k: "transacionado", label: "Valor transacionado", type: "text", ph: "R$", third: true },
      { k: "entrada", label: "Entrada", type: "text", third: true },
      { k: "parcelas", label: "Parcelas", type: "text", third: true },
      { k: "valor_parcela", label: "Valor da parcela", type: "text", third: true },
      { k: "advogado", label: "Advogado responsável", type: "select", opts: ADVOGADOS, req: true, half: true },
      { k: "situacao", label: "Etapa", type: "select", opts: [], half: true },
      { k: "observacoes", label: "Observações", type: "textarea" },
    ],
    cols: [{ h: "Transação", w: "26%" }, { h: "Modalidade · edital" }, { h: "Órgão · nº" }, { h: "Consolidado → transacionado" }, { h: "CDAs" }, { h: "Etapa" }, { h: "Parcelas" }, { h: "Advogado" }],
    row: c => { const n = (c.dados.cdas ?? "").split("\n").filter((l: string) => l.trim()).length; return [c.titulo, [c.dados.modalidade, c.dados.edital].filter(Boolean).join(" · ") || "—", [c.orgao, c.numero].filter(Boolean).join(" · ") || "—", c.dados.consolidado ? `${money(c.dados.consolidado)} → ${money(c.dados.transacionado)}` : "—", n ? String(n) : "—", (["Rescindida", "Prejudicada"].includes(c.situacao) ? { steps: 6, fail: c.situacao } : { steps: Math.max(0, ["Em preparação", "Negociação", "Proposta enviada", "Homologada", "Em cumprimento", "Quitada"].indexOf(c.situacao)) }), c.dados.parcelas ? `0 / ${c.dados.parcelas}` : "—", c.advogado ?? "—"]; },
  },
  {
    key: "fiscalizacao", label: "Fiscalização", icon: "", sing: "fiscalização", artigo: "a", bg: "var(--tag-amber-bg)", fg: "var(--tag-amber-fg)",
    fluxo: ["TIF recebido", "Recebendo intimações", "Respostas enviadas", "Encerrada sem AI", "Encerrada com AI"],
    hint: "Começa pelo TIF. O prazo da fiscalização é contado automaticamente.",
    fields: [
      { k: "titulo", label: "Título", type: "text", req: true, ph: "Ex.: Fiscalização SEFAZ/RJ — Ordem 2026-0142" },
      { k: "numero", label: "Nº TIF / ordem de serviço", type: "text", req: true, third: true },
      { k: "orgao", label: "Órgão", type: "select", opts: ["SEFAZ/RJ", "Receita Federal", "Prefeitura", "RFB previdenciário", "Outro"], third: true },
      { k: "auditor", label: "Unidade / auditor", type: "text", third: true },
      { k: "periodo", label: "Período fiscalizado", type: "text", ph: "01/2023 a 12/2025", half: true, section: "Escopo" },
      { k: "tributos", label: "Tributos", type: "multi", opts: ["ICMS", "ICMS-ST", "PIS/COFINS", "IRPJ/CSLL", "ISS", "INSS"], half: true },
      { k: "tif_recebido", label: "TIF recebido em", type: "date", req: true, third: true },
      { k: "prazo_dias", label: "Prazo da fiscalização (dias)", type: "text", ph: "120", third: true, auto: d => d.tif_recebido && d.prazo_dias ? "→ até " + fmtD(addDays(String(d.tif_recebido), Number(d.prazo_dias) + Number(d.prorrogacoes_dias || 0))) : null },
      { k: "prorrogacoes_dias", label: "Prorrogações (dias)", type: "text", ph: "0", third: true },
      { k: "itens_tif", label: "Itens solicitados no TIF (um por linha)", type: "textarea", section: "Primeira intimação" },
      { k: "prazo_proximo", label: "Prazo de resposta", type: "date", half: true },
      { k: "advogado", label: "Advogado responsável", type: "select", opts: ADVOGADOS, req: true, half: true },
      { k: "fornecedor_docs", label: "Quem fornece os documentos", type: "text", ph: "Contador do cliente", half: true },
      { k: "situacao", label: "Situação", type: "select", opts: [], half: true },
      { k: "observacoes", label: "Observações", type: "textarea" },
    ],
    cols: [{ h: "Fiscalização", w: "26%" }, { h: "Órgão · auditor" }, { h: "Período · tributos" }, { h: "Prazo fiscalização" }, { h: "Situação" }, { h: "Próx. resposta" }, { h: "Advogado" }],
    row: c => [c.titulo + (c.numero ? `\nTIF ${c.numero}` : ""), [c.orgao, c.dados.auditor].filter(Boolean).join(" · ") || "—", [c.dados.periodo, (c.dados.tributos ?? []).join(", ")].filter(Boolean).join(" · ") || "—", c.dados.tif_recebido && c.dados.prazo_dias ? `até ${fmtD(addDays(c.dados.tif_recebido, Number(c.dados.prazo_dias) + Number(c.dados.prorrogacoes_dias || 0)))}${c.dados.prorrogacoes_dias ? " · prorrogada" : ""}` : "—", c.situacao, prazo(c.prazo_proximo, c.prazo_fatal), c.advogado ?? "—"],
  },
];

export function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }

// Documentos do cliente
export const TIPOS_DOC: { k: string; label: string; fields: Field[]; validadeDias?: Record<string, number> }[] = [
  { k: "procuracao", label: "Procuração", fields: [
    { k: "outorgados", label: "Outorgados", type: "multi", opts: ADVOGADOS, req: true },
    { k: "tipo_poderes", label: "Tipo de poderes", type: "seg", opts: ["Ad judicia et extra", "Ad judicia", "Específica"], half: true },
    { k: "poderes_especiais", label: "Poderes especiais", type: "text", ph: "transigir, receber citação…", half: true },
    { k: "outorgante", label: "Outorgante", type: "text", third: true },
    { k: "assinada_em", label: "Assinada em", type: "date", third: true },
    { k: "validade", label: "Validade", type: "date", third: true, hint: "Alerta 30 dias antes." },
  ] },
  { k: "certidao", label: "Certidão", validadeDias: { "CND Federal (RFB/PGFN)": 180, "CND Estadual — ICMS": 180, "CND Municipal": 90, "CRF FGTS": 30, "CNDT Trabalhista": 180 }, fields: [
    { k: "subtipo", label: "Tipo de certidão", type: "select", opts: ["CND Federal (RFB/PGFN)", "CND Estadual — ICMS", "CND Municipal", "CRF FGTS", "CNDT Trabalhista", "Outra"], req: true, half: true },
    { k: "orgao", label: "Órgão emissor", type: "text", half: true },
    { k: "emitida_em", label: "Emitida em", type: "date", req: true, third: true },
    { k: "validade", label: "Validade", type: "date", third: true, hint: "Calculada pelo tipo; pode ajustar." },
    { k: "codigo", label: "Código de controle", type: "text", third: true },
  ] },
  { k: "contrato_social", label: "Contrato social", fields: [
    { k: "alteracao", label: "Nº da alteração", type: "text", ph: "Ex.: 15ª", third: true },
    { k: "assinada_em", label: "Assinada em", type: "date", third: true },
    { k: "registro_em", label: "Registro (JUCERJA)", type: "date", third: true },
    { k: "registro_num", label: "Nº do registro", type: "text", half: true },
    { k: "consolidacao", label: "Substitui a consolidação vigente?", type: "seg", opts: ["Sim", "Não"], half: true },
    { k: "objeto", label: "Objeto da alteração", type: "textarea" },
  ] },
  { k: "documento_socio", label: "Documento de sócio", fields: [
    { k: "socio", label: "Sócio", type: "text", req: true, half: true },
    { k: "subtipo", label: "Tipo", type: "select", opts: ["RG/CPF", "Comprovante de residência", "Certidão de casamento", "Outro"], half: true },
    { k: "validade", label: "Validade", type: "date", half: true },
  ] },
  { k: "relatorio_cliente", label: "Relatório ao cliente", fields: [
{ k: "referencia", label: "Mês de referência", type: "text", ph: "Ex.: out/2026", half: true },
{ k: "enviado_em", label: "Enviado em", type: "date", half: true },
] },
{ k: "outros", label: "Outro", fields: [{ k: "validade", label: "Validade", type: "date", half: true }] },
];
