"use client";
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

// Calculadora de prazos — v39 (layout em frase, estilo Legalcloud, com o motor da Central).
// O cálculo é feito no banco (public.pa_prazo) com os dias não úteis confirmados em dias_nao_uteis.
// Aqui: abas (processual / DJEN-DJE / administrativo), formulário em frase, termo final, tópico de tempestividade,
// lista "Verifique a simulação" e aviso de dias pendentes de confirmação dentro do período.

export const TRIBUNAIS: [string, string][] = [
  ["TJRJ", "TJRJ"], ["TRF2", "TRF2 / JFRJ"], ["STJ", "STJ"], ["STF", "STF"], ["OUTRO", "outro tribunal (nacionais + RJ)"],
];
export const ORGAOS: [string, string][] = [
  ["SEFAZ-RJ", "SEFAZ-RJ"], ["PGFN", "PGFN / Receita Federal"], ["CARF", "CARF"], ["OUTRO", "outro órgão (nacionais + RJ)"],
];
export const REGRAS: [string, string, string][] = [
  ["cpc", "Novo CPC (dias úteis)", "CPC arts. 219 e 224: exclui o dia do começo, conta só dias úteis do tribunal, vence em dia útil."],
  ["corridos", "CPP / CLT antiga (dias corridos)", "Exclui o dia do começo; se vencer em dia não útil, prorroga para o próximo útil."],
  ["clt2017", "CLT 2017 (dias úteis)", "Lei 13.467/2017, CLT art. 775: dias úteis, excluído o dia do começo."],
  ["juizado", "Juizado Especial (dias úteis)", "FONAJE 165 / CPC art. 219."],
  ["paf", "Decreto 70.235 / Dec. RJ 2.473 (corridos)", "Processo administrativo fiscal: prazos contínuos, excluído o dia do início; só iniciam e vencem em dia de expediente."],
];
const REGRAS_PROC = REGRAS.filter(r => r[0] !== "paf");
const REGRAS_ADM: [string, string, string][] = [REGRAS.find(r => r[0] === "paf")!, ["cpc", "dias úteis (quando o órgão adota)", "Contagem em dias úteis, excluído o dia do começo."]];
const SISTEMAS = ["PJe", "e-SAJ", "eproc", "DCP", "SEI", "e-CAC", "—"];
const EVENTOS_ADM = ["intimação", "ciência no SEI / e-CAC", "publicação no D.O.", "recebimento do AR"];

export type Passo = { data: string; contado: boolean; n?: number; rotulo?: string | null; fonte?: string | null };
export type Pendente = { data: string; motivo: string; esferas: string[]; fonte?: string | null };
export type Resultado = {
  final: string; evento: string; publicacao?: string | null; dias: number; regra: string; tribunal: string; esferas: string[];
  incluir_municipais: boolean; djen: boolean; passos: Passo[]; pendentes?: Pendente[]; calendario_atualizado_em?: string | null;
  // preenchidos no cliente (não influenciam o cálculo; entram no tópico)
  meio?: string; sistema?: string; instancia?: string; evento_adm?: string;
};

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmt = (d?: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
const fmtCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtLonga = (d: string) => { const x = new Date(d + "T12:00:00"); return `${x.getDate()} de ${x.toLocaleDateString("pt-BR", { month: "long" })} de ${x.getFullYear()}`; };
const dow = (d: string) => DIAS[new Date(d + "T12:00:00").getDay()];
const dowCurto = (d: string) => DIAS_CURTO[new Date(d + "T12:00:00").getDay()];
const hoje = () => new Date().toISOString().slice(0, 10);
const ehAdm = (t: string) => ["SEFAZ-RJ", "PGFN", "CARF"].includes(t);

/** Deduz o tribunal/órgão a partir dos dados do caso (tribunal, órgão, sistema, número). */
export function inferirTribunal(...pistas: (string | null | undefined)[]): string {
  const s = pistas.filter(Boolean).join(" ").toUpperCase();
  if (/STF|SUPREMO/.test(s)) return "STF";
  if (/STJ|SUPERIOR TRIBUNAL/.test(s)) return "STJ";
  if (/TRF|JFRJ|JUSTI[ÇC]A FEDERAL|SE[ÇC][ÃA]O JUDICI[ÁA]RIA|\.4\.02\./.test(s)) return "TRF2";
  if (/CARF/.test(s)) return "CARF";
  if (/PGFN|RECEITA FEDERAL|DRJ|\bRFB\b/.test(s)) return "PGFN";
  if (/SEFAZ|SEI-RJ|SEI ?RJ|CONSELHO DE CONTRIBUINTES|JRF|AUDITORIA FISCAL/.test(s)) return "SEFAZ-RJ";
  if (/TJRJ|\.8\.19\./.test(s)) return "TJRJ";
  return "TJRJ";
}
/** Deduz o sistema processual a partir das pistas do caso. */
export function inferirSistema(...pistas: (string | null | undefined)[]): string {
  const s = pistas.filter(Boolean).join(" ").toUpperCase();
  if (/PJE/.test(s)) return "PJe"; if (/SAJ/.test(s)) return "e-SAJ"; if (/EPROC/.test(s)) return "eproc"; if (/DCP/.test(s)) return "DCP";
  if (/E-CAC|ECAC/.test(s)) return "e-CAC"; if (/SEI/.test(s)) return "SEI";
  return "—";
}

function baseLegal(regra: string) {
  return regra === "cpc" ? "CPC, arts. 219 e 224" : regra === "paf" ? "Decreto nº 70.235/1972, art. 5º" : regra === "clt2017" ? "CLT, art. 775" : regra === "juizado" ? "CPC, art. 219, c/c Enunciado 165 do FONAJE" : "contagem em dias corridos";
}

/** Tópico de tempestividade — texto pronto para a peça. */
export function memoriaCalculo(r: Resultado): string {
  const uteis = ["cpc", "clt2017", "juizado"].includes(r.regra);
  const trib = [...TRIBUNAIS, ...ORGAOS].find(x => x[0] === r.tribunal)?.[1] ?? r.tribunal;
  const pulados = r.passos.filter(p => !p.contado && p.rotulo && !/Dia do começo|Publicação|Disponibilização/.test(p.rotulo));
  const primeiro = r.passos.find(p => p.contado)?.data;
  const inicio = r.djen
    ? `a publicação em ${fmt(r.publicacao)} (${dow(r.publicacao!)}), primeiro dia útil seguinte à disponibilização no DJEN/DJE em ${fmt(r.evento)} (${dow(r.evento)}), nos termos do art. 224, §§ 2º e 3º, do CPC`
    : `${r.evento_adm ? `a ${r.evento_adm}` : "o evento"} de ${fmt(r.evento)} (${dow(r.evento)})`;
  const ctx = [r.meio, r.sistema && r.sistema !== "—" ? r.sistema : null, r.instancia].filter(Boolean).join(", ");
  const partes = [
    `O prazo de ${r.dias} dias${uteis ? " úteis" : ""} (${baseLegal(r.regra)}) teve como termo inicial ${inicio}, iniciando-se a contagem em ${fmt(primeiro)} (${dow(primeiro!)}), perante o ${trib}${ctx ? ` (${ctx})` : ""}${r.incluir_municipais ? ", consideradas as suspensões do município do Rio de Janeiro" : ""}.`,
    pulados.length ? `Não foram computados: ${pulados.map(p => `${fmt(p.data)} (${p.rotulo})`).join("; ")}.` : "Não houve dia não útil no período, além dos finais de semana.",
    `Termo final: ${fmt(r.final)} (${dow(r.final)}), sendo tempestiva a manifestação protocolada até essa data.`,
  ];
  return partes.join(" ");
}

type Modo = "proc" | "djen" | "adm";

const CAMPO = "inline-block align-middle mx-1 font-semibold text-center bg-transparent border-0 border-b-2 outline-none focus:border-acao px-1.5 py-0.5";
const ST_CAMPO: CSSProperties = { borderColor: "var(--border-strong, var(--text-muted))", color: "var(--acao)" };
const ST_SEL: CSSProperties = { appearance: "none", WebkitAppearance: "none", paddingRight: 16, cursor: "pointer",
  backgroundImage: "linear-gradient(45deg, transparent 50%, var(--acao) 50%), linear-gradient(135deg, var(--acao) 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 7px) 55%, calc(100% - 3px) 55%", backgroundSize: "4px 4px, 4px 4px", backgroundRepeat: "no-repeat" };
function Sel({ value, onChange, children, fs }: { value: string; onChange: (v: string) => void; children: ReactNode; fs: number }) {
  return <select className={CAMPO} style={{ ...ST_CAMPO, ...ST_SEL, fontSize: fs }} value={value} onChange={e => onChange(e.target.value)}>{children}</select>;
}

export default function CalculadoraPrazo({ supabase, tribunalInicial, sistemaInicial, eventoInicial, contexto, onUsar, compacto }: {
  supabase?: ReturnType<typeof createClient>; tribunalInicial?: string; sistemaInicial?: string; eventoInicial?: string; contexto?: string;
  onUsar?: (final: string, memoria: string, r: Resultado) => void; compacto?: boolean;
}) {
  const sb = useMemo(() => supabase ?? createClient(), [supabase]);
  const tribIni = tribunalInicial && [...TRIBUNAIS, ...ORGAOS].some(t => t[0] === tribunalInicial) ? tribunalInicial : "TJRJ";
  const [modo, setModo] = useState<Modo>(ehAdm(tribIni) ? "adm" : "proc");
  const [evento, setEvento] = useState(eventoInicial ?? hoje());
  const [dias, setDias] = useState(ehAdm(tribIni) ? 30 : 15);
  const [regra, setRegra] = useState(ehAdm(tribIni) ? "paf" : "cpc");
  const [tribunal, setTribunal] = useState(tribIni);
  const [meio, setMeio] = useState("eletrônico");
  const [sistema, setSistema] = useState(sistemaInicial && SISTEMAS.includes(sistemaInicial) ? sistemaInicial : "PJe");
  const [instancia, setInstancia] = useState("1ª instância");
  const [eventoAdm, setEventoAdm] = useState(EVENTOS_ADM[0]);
  const [municipais, setMunicipais] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { if (tribunalInicial && [...TRIBUNAIS, ...ORGAOS].some(t => t[0] === tribunalInicial)) { setTribunal(tribunalInicial); if (ehAdm(tribunalInicial)) { setModo("adm"); setRegra("paf"); } } }, [tribunalInicial]);
  useEffect(() => { if (sistemaInicial && SISTEMAS.includes(sistemaInicial)) setSistema(sistemaInicial); }, [sistemaInicial]);

  function trocarModo(m: Modo) {
    setModo(m); setR(null); setErro(null);
    if (m === "adm") { if (!ehAdm(tribunal)) setTribunal("SEFAZ-RJ"); setRegra("paf"); setDias(30); }
    else { if (ehAdm(tribunal)) setTribunal("TJRJ"); if (regra === "paf") setRegra("cpc"); }
  }

  async function simular() {
    if (!evento || !dias || dias < 1) return;
    setCarregando(true); setErro(null); setR(null);
    const { data, error } = await sb.rpc("pa_prazo", { evento, dias: Number(dias), regra, tribunal, incluir_municipais: modo === "adm" ? false : municipais, djen: modo === "djen" });
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    const res = data as Resultado;
    if (modo === "adm") res.evento_adm = eventoAdm; else { res.meio = meio; res.sistema = sistema; res.instancia = instancia; }
    setR(res);
  }
  function limpar() { setR(null); setErro(null); }
  async function copiar() { if (!r) return; try { await navigator.clipboard.writeText(memoriaCalculo(r)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {} }

  const fs = compacto ? 14 : 15;
  const stCampo = { ...ST_CAMPO, fontSize: fs } as CSSProperties;
  const stData = { ...stCampo, color: "var(--text-primary)" } as CSSProperties;
  const regrasDoModo = modo === "adm" ? REGRAS_ADM : REGRAS_PROC;
  const uteis = ["cpc", "clt2017", "juizado"].includes(regra);
  const tab = (m: Modo, label: string) => (
    <button type="button" key={m} onClick={() => trocarModo(m)} className="px-3 py-2 text-[12.5px] font-medium -mb-px border-b-2 whitespace-nowrap"
      style={{ color: modo === m ? "var(--acao)" : "var(--text-secondary)", borderColor: modo === m ? "var(--acao)" : "transparent", fontWeight: modo === m ? 600 : 500 }}>{label}</button>
  );
  const passosVis = r?.passos ?? [];
  const pendentes = r?.pendentes ?? [];

  return (
    <div className={compacto ? "" : "max-w-[1100px]"}>
      {/* abas */}
      <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tab("proc", "Prazos processuais")}{tab("djen", "Publicação DJEN/DJE")}{tab("adm", "Processo administrativo")}
      </div>

      {/* frase */}
      <div className="mt-3" style={{ fontSize: compacto ? 14 : 15, lineHeight: 2.5, color: "var(--text-secondary)" }}>
        {contexto && <span className="inline-flex items-center align-middle gap-1.5 rounded-full px-2.5 py-0.5 mr-2 text-[11px] font-semibold" style={{ background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)", lineHeight: 1.5 }}>{contexto}</span>}
        {modo !== "adm" ? (
          <>
            Prazo de <input type="number" min={1} max={365} className={CAMPO} style={{ ...stCampo, width: 64 }} value={dias} onChange={e => setDias(Number(e.target.value))} /> dias no{" "}
            <Sel fs={fs} value={regra} onChange={setRegra}>{regrasDoModo.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>{" "}
            e {modo === "djen" ? "disponibilização no DJEN/DJE" : "data do evento"} em{" "}
            <input type="date" className={CAMPO} style={{ ...stData, width: 150 }} value={evento} onChange={e => setEvento(e.target.value)} />.
            <br />
            O processo está no <Sel fs={fs} value={tribunal} onChange={setTribunal}>{TRIBUNAIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>, é{" "}
            <Sel fs={fs} value={meio} onChange={setMeio}><option value="eletrônico">eletrônico</option><option value="físico">físico</option></Sel>{" "}
            no sistema <Sel fs={fs} value={sistema} onChange={setSistema}>{SISTEMAS.map(s => <option key={s} value={s}>{s}</option>)}</Sel>, de{" "}
            <Sel fs={fs} value={instancia} onChange={setInstancia}><option>1ª instância</option><option>2ª instância</option><option>instância superior</option></Sel>,
            <br />
            e <Sel fs={fs} value={municipais ? "1" : "0"} onChange={v => setMunicipais(v === "1")}><option value="0">não incluir</option><option value="1">incluir</option></Sel> suspensões do município do Rio.
          </>
        ) : (
          <>
            Prazo de <input type="number" min={1} max={365} className={CAMPO} style={{ ...stCampo, width: 64 }} value={dias} onChange={e => setDias(Number(e.target.value))} /> dias{" "}
            <Sel fs={fs} value={regra} onChange={setRegra}>{regrasDoModo.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>{" "}
            contados da <Sel fs={fs} value={eventoAdm} onChange={setEventoAdm}>{EVENTOS_ADM.map(s => <option key={s} value={s}>{s}</option>)}</Sel> em{" "}
            <input type="date" className={CAMPO} style={{ ...stData, width: 150 }} value={evento} onChange={e => setEvento(e.target.value)} />,
            <br />
            no órgão <Sel fs={fs} value={tribunal} onChange={setTribunal}>{ORGAOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>. Só inicia e vence em dia de expediente.
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mt-2">
        <button type="button" onClick={simular} disabled={carregando} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-on-acao disabled:opacity-50" style={{ background: "var(--acao)" }}>{carregando ? "Calculando…" : "Simular"}</button>
        {r && <button type="button" onClick={limpar} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-surface)" }}>Simular novo prazo</button>}
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {modo === "djen" ? "DJEN/DJE: publicação = 1º dia útil após a disponibilização; o prazo começa no dia útil seguinte à publicação (CPC art. 224, §§ 2º e 3º)." : regrasDoModo.find(x => x[0] === regra)?.[2]}
        </span>
      </div>
      {erro && <div className="mt-3 px-3 py-2 rounded text-xs border" style={{ background: "var(--tag-red-bg)", borderColor: "var(--alerta)", color: "var(--tag-red-fg)" }}>Não foi possível calcular: {erro}</div>}

      {r && (
        <div className={`mt-5 grid gap-4 ${compacto ? "grid-cols-1" : "grid-cols-1 md:grid-cols-[1fr_380px]"}`}>
          {/* coluna resultado */}
          <div className="min-w-0">
            <div className="rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="px-4 py-3 text-[12px] border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                <b style={{ color: "var(--text-primary)" }}>Dados da simulação:</b> prazo de <b style={{ color: "var(--text-primary)" }}>{r.dias} dias{uteis ? " úteis" : " corridos"}</b> — {REGRAS.find(x => x[0] === r.regra)?.[1] ?? r.regra} — {r.djen ? "disponibilizado no DJEN/DJE em" : modo === "adm" ? `${r.evento_adm} em` : "evento em"} <b style={{ color: "var(--text-primary)" }}>{fmt(r.evento)}</b> ({dow(r.evento)}){r.djen && r.publicacao ? <>, publicado em <b style={{ color: "var(--text-primary)" }}>{fmt(r.publicacao)}</b></> : null}, {modo === "adm" ? "órgão" : "tribunal"} <b style={{ color: "var(--text-primary)" }}>{[...TRIBUNAIS, ...ORGAOS].find(x => x[0] === r.tribunal)?.[1] ?? r.tribunal}</b>{modo !== "adm" ? ` · ${r.meio} · ${r.sistema} · ${r.instancia}` : ""}{r.incluir_municipais ? " · com suspensões municipais" : ""}.
              </div>
              <div className="px-4 pt-5 pb-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Termo final</div>
                <div className="font-bold leading-tight mt-1.5" style={{ color: "var(--text-primary)", fontSize: compacto ? 24 : 32, letterSpacing: "-0.01em" }}>{fmtLonga(r.final)}</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{dow(r.final)}</div>
                <div className="flex flex-wrap gap-2 justify-center mt-3.5">
                  {onUsar && <button type="button" onClick={() => onUsar(r.final, memoriaCalculo(r), r)} className="px-3 py-1.5 rounded-md text-xs font-semibold text-on-acao" style={{ background: "var(--ok)" }}>✓ Usar como prazo da pendência</button>}
                  <button type="button" onClick={copiar} className="px-3 py-1.5 rounded-md text-xs font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-page)" }}>{copiado ? "Copiado ✓" : "Copiar tópico de tempestividade"}</button>
                </div>
              </div>
              {pendentes.length > 0 && (
                <div className="mx-4 mb-3 px-3 py-2 rounded-md border text-[11.5px] leading-relaxed" style={{ background: "var(--tag-amber-bg)", borderColor: "var(--atencao)", color: "var(--tag-amber-fg, var(--atencao))" }}>
                  <b>Atenção:</b> {pendentes.length === 1 ? "há 1 dia" : `há ${pendentes.length} dias`} neste período aguardando confirmação e ainda <u>não</u> descontado{pendentes.length > 1 ? "s" : ""} da contagem: {pendentes.map(p => `${fmtCurto(p.data)} (${p.motivo})`).join("; ")}. Se confirmado{pendentes.length > 1 ? "s" : ""}, o termo final avança. <Link href="/configuracoes/feriados" className="underline font-semibold">Confirmar em Configurações › Feriados</Link>.
                </div>
              )}
              <div className="px-4 py-3 text-[11.5px] leading-relaxed border-t" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                <b style={{ color: "var(--text-primary)" }}>Tópico de tempestividade.</b> {memoriaCalculo(r)}
              </div>
            </div>
            <div className="text-[10.5px] mt-2 px-1" style={{ color: "var(--text-muted)" }}>
              Calendário: feriados nacionais, estaduais (RJ) e municipais (Rio), recesso forense e suspensões confirmadas em Configurações › Feriados{r.calendario_atualizado_em ? ` · atualizado em ${fmt(r.calendario_atualizado_em.slice(0, 10))}` : ""}. Ferramenta de apoio — confira com o tribunal em prazos críticos.
            </div>
          </div>

          {/* coluna lista */}
          <div className="rounded-lg border min-w-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] border-b flex justify-between" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}><span>Verifique a simulação</span><span>{passosVis.length} dias</span></div>
            <div className={compacto ? "max-h-[300px] overflow-y-auto" : "max-h-[460px] overflow-y-auto"}>
              {passosVis.map((p, i) => {
                const ultimo = i === passosVis.length - 1;
                const ini = !!p.rotulo && /Dia do começo|Publicação|Disponibilização/.test(p.rotulo);
                const tag = ultimo ? "fim" : ini ? "ini" : p.rotulo ? (/Final de semana/.test(p.rotulo) ? "fds" : "fer") : "";
                const tagSt = tag === "fim" ? { background: "var(--tag-green-bg)", color: "var(--tag-green-fg, var(--ok))" } : tag === "ini" ? { background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" } : tag === "fer" ? { background: "var(--tag-red-bg)", color: "var(--tag-red-fg)" } : { background: "var(--bg-page)", color: "var(--text-muted)" };
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-1.5 border-b text-[12px]" style={{ borderColor: "var(--border)" }}>
                    <span className="w-[26px] h-[26px] shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-bold" style={p.contado ? { background: "var(--acao)", color: "var(--on-acao)" } : { color: "var(--text-muted)", border: "1.5px dashed var(--border-strong, var(--text-muted))" }}>{p.contado ? p.n : "–"}</span>
                    <span className="flex-1 min-w-0" style={{ color: p.contado ? "var(--text-primary)" : "var(--text-muted)" }}><b className={p.contado ? "font-semibold" : "font-medium"}>{fmtCurto(p.data)}</b> · {dowCurto(p.data)}</span>
                    {(p.rotulo || ultimo) && (() => {
                      const texto = ultimo ? (p.rotulo && !/Vencimento/.test(p.rotulo) ? `termo final · ${p.rotulo}` : p.rotulo ?? "termo final") : p.rotulo?.replace("Dia do começo (excluído)", "dia do começo").replace("Final de semana", "fim de semana").replace("Publicação (1º dia útil após a disponibilização)", "publicação · 1º dia útil");
                      const cls = "text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[55%] inline-flex items-center gap-1";
                      const fonteUrl = p.fonte && /^https?:\/\//i.test(p.fonte) ? p.fonte.split(" · ")[0] : null;
                      const temFonte = !!p.fonte && !/fim de semana|Final de semana/.test(p.rotulo ?? "");
                      if (fonteUrl) return <a href={fonteUrl} target="_blank" rel="noreferrer" className={cls} style={tagSt} title={`Abrir fonte: ${p.fonte}`}>{texto} <span aria-hidden>↗</span></a>;
                      if (temFonte) return <Link href={`/configuracoes/feriados?aba=calendario&ano=${p.data.slice(0, 4)}&busca=${encodeURIComponent((p.rotulo ?? "").split(" · ")[0].slice(0, 40))}`} className={cls} style={tagSt} title={`Fonte: ${p.fonte} — clique para ver no calendário`}>{texto} <span aria-hidden>↗</span></Link>;
                      return <span className={cls} style={tagSt} title={p.rotulo ?? undefined}>{texto}</span>;
                    })()}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 text-[10.5px] border-t flex flex-wrap gap-3" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>
              <span><i className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: "var(--acao)" }} /> dia contado</span>
              <span><i className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ border: "1.5px dashed var(--border-strong, var(--text-muted))" }} /> desconsiderado (começo, fim de semana, feriado, suspensão)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
