"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { Usuario } from "@/lib/types";
import { HomeAcompanhamentos, SugestoesAcomp, DrawerIncluir, useConsultasHome, useEu } from "./Acompanhamento";
import { contarVermelhas } from "@/lib/certidoes";

export default function HomeView(props: HomeCoordProps) {
  return <HomeCoord {...props} />;
}

// ─── Home de coordenação ─────────
type HomeCoordProps = {
  usuario: Usuario | null;
  totalPendencias: number;
  totalProcessos: number;
  fataisHoje: number;
  fatais7d: number;
  liminares?: number;
  decisoesFav?: number;
  aprovacoesPend: number;
  solicitacoesPend?: number;
  minhaRevisao: number;
  alertesRecentes: number;
  emailsRequeremAcao: number;
};

type Aprovacao = {
  id: string;
  tipo: "revisao" | "alinhamento" | "sugerida";
  titulo: string;
  origem: string;
  preview: string;
  tempo: string;
  cliente?: string;
  banca?: string;
  cnj?: string;
  casoId?: string | null;
};

type EventoDia = {
  data: string;
  label: string;
  eventos: { titulo: string; extra?: string; tipo: "crit" | "warn" | "rev" | "comp" | "normal" }[];
};

const TABS = [
  { key: "aprovacoes", label: "Para revisar" },
  { key: "alertes",    label: "Publicações" },
  { key: "acomp",      label: "Acompanhamentos" },
];

// v45: card de alerte na Home — mostra proposta inline quando aguarda aprovação
type AlerteHome = {
  id: string;
  data: string;
  cliente: string | null;
  processo: string | null;
  tribunal: string | null;
  tipo: string | null;
  teor: string | null;
  status: string;
  proposta: any | null;
  proposto_por: string | null;
  proposto_em: string | null;
  aprovado_em: string | null;
  devolucao_obs: string | null;
  segurar_para: string | null;
  caso_id: string | null;
};

function HomeCoord({
  usuario,
  totalPendencias,
  totalProcessos,
  fataisHoje,
  fatais7d,
  minhaRevisao,
}: HomeCoordProps) {
  const supabase = createClient();
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = usuario?.nome_completo?.split(" ")[0] ?? "você";

  const [tab, setTab] = useState<string>("aprovacoes");
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [calendario, setCalendario] = useState<EventoDia[]>([]);
  const [emElaboracao, setEmElaboracao] = useState(0);
  const [prontasProtocolar, setProntasProtocolar] = useState(0);
  const [alertesHoje, setAlertesHoje] = useState<AlerteHome[]>([]);
  const [aviso, setAviso] = useState<{ t: string; tom: "ok" | "erro" } | null>(null);
  useEffect(() => { if (!aviso) return; const tm = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(tm); }, [aviso]);
  const euAc = useEu(); const acDado = useConsultasHome(euAc);
  const nAtrAc = acDado.itens.filter(i => i.status !== "sugerido" && i.sit.st === "atras").length;
  const nSug = euAc?.coord ? acDado.itens.filter(i => i.status === "sugerido").length : 0;
  const [incluirAc, setIncluirAc] = useState<string | null>(null);
  const [nCert, setNCert] = useState(0);
  useEffect(() => { if (!euAc) return; contarVermelhas(supabase, euAc.coord ? undefined : euAc.primeiro).then(setNCert).catch(() => setNCert(0)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [euAc?.id]);

  useEffect(() => {
    (async () => {
      const eu = (usuario?.nome_completo ?? "").trim().split(/\s+/)[0] || "Marcelle";
      const { data: abertas } = await supabase.from("caso_pendencias").select("status").in("status", ["em_elaboracao", "pronta_protocolar"]).limit(3000);
      setEmElaboracao((abertas ?? []).filter((p: any) => p.status === "em_elaboracao").length);
      setProntasProtocolar((abertas ?? []).filter((p: any) => p.status === "pronta_protocolar").length);

      const { data: rev } = await supabase.from("caso_pendencias")
        .select("id, titulo, responsavel, subida_por, enviado_em, prazo_interno, prazo, caso_id, empresa_id, versao, tipo")
        .eq("status", "revisao_pendente").ilike("revisor", eu + "%")
        .order("prazo_interno", { ascending: true, nullsFirst: false })
        .limit(8);
      const empRev = Array.from(new Set((rev ?? []).map((p: any) => p.empresa_id).filter(Boolean)));
      const { data: empsRev } = empRev.length ? await supabase.from("empresas").select("id, nome, nome_exibicao").in("id", empRev) : { data: [] as any[] };
      const nomeEmp = new Map((empsRev ?? []).map((e: any) => [e.id, e.nome_exibicao || e.nome]));
      const apr: Aprovacao[] = (rev ?? []).map((p: any) => ({
        id: p.id,
        tipo: "revisao",
        titulo: p.titulo ?? "(sem título)",
        origem: `Enviada por ${p.subida_por ?? p.responsavel ?? "—"}${p.versao ? ` · v${p.versao}` : ""}`,
        preview: p.prazo_interno ? `Prazo interno ${p.prazo_interno.slice(8, 10)}/${p.prazo_interno.slice(5, 7)}${p.prazo ? ` · prazo ${p.prazo.slice(8, 10)}/${p.prazo.slice(5, 7)}` : ""}` : p.prazo ? `Prazo ${p.prazo.slice(8, 10)}/${p.prazo.slice(5, 7)}` : "Sem prazo",
        tempo: relTime(p.enviado_em),
        cliente: nomeEmp.get(p.empresa_id) as string | undefined,
        casoId: p.caso_id,
      }));
      setAprovacoes(apr);

      const hoje = new Date();
      const d7 = new Date(hoje); d7.setDate(d7.getDate() + 7);
      const hojeStr = isoLocal(hoje);
      const d7Str = isoLocal(d7);
      // últimos 3 dias úteis: pega alertes de até 5 dias atrás (aproximação simples)
      const dm5 = new Date(hoje); dm5.setDate(dm5.getDate() - 5);
      const dm5Str = isoLocal(dm5);
      const { data: als } = await supabase.from("alertes")
        .select("id, data, cliente, processo, tribunal, tipo, teor, status, proposta, proposto_por, proposto_em, aprovado_em, devolucao_obs, segurar_para, caso_id")
        .gte("data", dm5Str)
        .order("data", { ascending: false })
        .limit(80);
      // Regra: mostra tudo do dia atual + tudo sem destinação/aguardando aprov. dos últimos dias.
      // Aprovadas/devolvidas de dias anteriores não entram (evita ruído).
      const alertesFiltrados = (als ?? []).filter((a: any) => {
        if (a.data === hojeStr) return true;
        return a.status === "novo" || a.status === "proposta" || a.status === "devolvida";
      });
      setAlertesHoje(alertesFiltrados as AlerteHome[]);
      // Prazos · 7 dias: mesma fonte do Panorama (caso_pendencias com prazo, não concluídas).
      // A Google Agenda entra como acréscimo quando a tabela tiver dados.
      const { data: cp } = await supabase.from("caso_pendencias")
        .select("titulo, prazo, fatal, caso_id")
        .gte("prazo", hojeStr)
        .lte("prazo", d7Str)
        .neq("status", "concluida")
        .order("prazo", { ascending: true })
        .limit(300);
      const casoIds = Array.from(new Set((cp ?? []).map((p: any) => p.caso_id).filter(Boolean)));
      let casosRows: any[] = [];
      if (casoIds.length) { const r = await supabase.from("casos").select("id, titulo, empresa_id").in("id", casoIds); casosRows = r.data ?? []; }
      const empIds = Array.from(new Set(casosRows.map((c: any) => c.empresa_id).filter(Boolean)));
      let empRows: any[] = [];
      if (empIds.length) { const r = await supabase.from("empresas").select("id, nome, nome_exibicao").in("id", empIds); empRows = r.data ?? []; }
      const casoMap = new Map<string, any>(); casosRows.forEach((c: any) => casoMap.set(c.id, c));
      const empMap = new Map<string, any>(); empRows.forEach((e: any) => empMap.set(e.id, e));
      const pz = (cp ?? []).map((p: any) => {
        const c = casoMap.get(p.caso_id); const e = c ? empMap.get(c.empresa_id) : null;
        return { titulo: p.titulo, cliente: e?.nome_exibicao || e?.nome || c?.titulo || "", fatal: p.prazo };
      });
      const dias = agruparPorDiaPend(pz, hoje);
      const { data: evs, error: errEvs } = await supabase.from("eventos_agenda")
        .select("subject, data_inicio, categories")
        .gte("data_inicio", hojeStr)
        .lte("data_inicio", d7Str + "T23:59:59")
        .order("data_inicio", { ascending: true })
        .limit(60);
      if (!errEvs && evs && evs.length) {
        const ext = agruparPorDia(evs, hoje);
        dias.forEach((d, i) => { d.eventos = [...d.eventos, ...ext[i].eventos]; });
      }
      setCalendario(dias);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 flex flex-col">
      <div className="flex flex-wrap gap-2 items-center mb-3 px-1" style={{ fontSize: 11 }}>
        <span className="uppercase tracking-wider font-semibold mr-1" style={{ color: "var(--text-muted)", fontSize: 10 }}>Panorama</span>
        <MicroKpi label="casos ativos" value={totalProcessos.toLocaleString("pt-BR")} />
        <MicroKpi label="no fluxo" value={totalPendencias} tone="warn" />
        <MicroKpi label="prazos ≤7d" value={fatais7d} tone="crit" />
      </div>

      <div className="grid gap-3 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] items-start">
        <div className="flex flex-col min-w-0">
          <div className="p-3 rounded-md border mb-3 flex flex-wrap gap-3 items-center"
               style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="text-sm font-semibold">
              <span className="text-bordo">{minhaRevisao + nSug} esperando você aprovar</span>
              {fataisHoje > 0 && <> · <span className="text-atencao">{fataisHoje} prazo{fataisHoje > 1 ? "s" : ""} vence{fataisHoje > 1 ? "m" : ""} hoje</span></>}
            {nAtrAc > 0 && <> · <button onClick={() => setTab("acomp")} className="px-1.5 rounded text-on-acao" style={{ background: "var(--alerta)" }}>{nAtrAc} consulta{nAtrAc > 1 ? "s" : ""} atrasada{nAtrAc > 1 ? "s" : ""}{euAc?.coord ? " da equipe" : ""}</button></>}
            {nCert > 0 && <> · <Link href="/certidoes" className="px-1.5 rounded text-on-acao" style={{ background: "var(--alerta)" }}>{nCert} certid{nCert > 1 ? "ões" : "ão"} para renovar</Link></>}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {emElaboracao} em elaboração · {prontasProtocolar} prontas pra protocolar
            </div>
            <Link href="/pendencias" className="ml-auto text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
              ver todas as pendências →
            </Link>
          </div>

          <div className="mb-2">
            <h1 className="text-[26px]">{saudacao}, {primeiroNome}</h1>
            <p className="text-xs first-letter:uppercase" style={{ color: "var(--text-secondary)" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="flex flex-wrap gap-0 border-b mb-2" style={{ borderColor: "var(--border)" }}>
            {TABS.map(t => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 font-medium transition"
                style={{
                  color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
                  borderColor: tab === t.key ? "var(--accent)" : "transparent",
                }}>
                {t.label}
                {t.key === "acomp" && nAtrAc > 0 && <span className="ml-1 text-[10px] px-1.5 rounded-full font-bold text-on-acao" style={{ background: "var(--alerta)" }}>{nAtrAc}</span>}
                {t.key === "aprovacoes" && nSug > 0 && <span className="ml-1 text-[10px] px-1.5 rounded-full font-bold text-on-acao" style={{ background: "var(--acao)" }}>{nSug}</span>}
              </button>
            ))}
          </div>

          <div className="space-y-2 pb-4">
            {tab === "aprovacoes" && <SugestoesAcomp eu={euAc} dado={acDado} />}
          {tab === "aprovacoes" && aprovacoes.length === 0 && nSug === 0 && (
              <div className="text-center py-10">
             <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Nada esperando aprovação sua no momento</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Tá tudo em dia por aqui.</div>
              </div>
            )}
            {tab === "aprovacoes" && aprovacoes.map(a => (
              <Link key={a.id} href={a.casoId ? `/casos/${a.casoId}` : "/revisao"} className="block p-3 rounded-md border hover:border-acao transition"
                   style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--acao-tint)", color: "var(--acao)" }}>
                    Revisão
                  </span>
                  <span>{a.origem}</span>
                  <span className="ml-auto">{a.tempo}</span>
                </div>
                <div className="text-sm font-semibold mb-1">
                  {a.cliente && <span>{a.cliente} · </span>}
                  {a.cnj && <span className="text-xs" style={{ color: "var(--accent)" }}>{a.cnj} · </span>}
                  {a.titulo}
                </div>
                <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                  {a.preview}
                </div>
                <div className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Abrir para revisar →</div>
              </Link>
            ))}
            {tab === "alertes" && (() => {
              const propostas   = alertesHoje.filter(a => a.status === "proposta");
              const semDest     = alertesHoje.filter(a => a.status === "novo").sort((a,b) => a.data.localeCompare(b.data));
              const devolvidos  = alertesHoje.filter(a => a.status === "devolvida");
              const aprovHoje   = alertesHoje.filter(a => a.status === "aprovada");
              const total       = alertesHoje.length;
              if (total === 0) {
                return (
                  <div className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>
                    <div className="text-2xl mb-1">✓</div>
                    <div style={{ color: "var(--text-secondary)" }}>Sem publicações hoje.</div>
                    <div className="text-xs mt-1"><Link href="/alertes" style={{ color: "var(--accent)" }}>ver histórico →</Link></div>
                  </div>
                );
              }
              const hojeIso = isoLocal(new Date());
              async function aprovar(id: string) {
                const a = alertesHoje.find(x => x.id === id); if (!a?.proposta) return;
                const { error } = await supabase.rpc("pa_alerte_aprovar", { p_id: id, p: a.proposta });
                if (error) return setAviso({ t: error.message, tom: "erro" });
                setAviso({ t: "Aprovado.", tom: "ok" });
                setAlertesHoje(list => list.map(x => x.id === id ? { ...x, status: "aprovada", aprovado_em: new Date().toISOString() } : x));
              }
              async function devolver(id: string) {
                const nota = window.prompt("Por que devolver? (aparece pro advogado)", "");
                if (nota === null) return;
                const { error } = await supabase.rpc("pa_alerte_devolver", { p_id: id, p_obs: nota.trim() });
                if (error) return setAviso({ t: error.message, tom: "erro" });
                setAviso({ t: "Devolvido.", tom: "ok" });
                setAlertesHoje(list => list.map(x => x.id === id ? { ...x, status: "devolvida", devolucao_obs: nota.trim() } : x));
              }
              return (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <MiniKpi n={propostas.length}  l="aguard. sua aprovação" c={propostas.length ? "var(--acao)" : undefined} />
                    <MiniKpi n={semDest.length}    l="sem destinação"        c={semDest.length ? "var(--atencao)" : undefined} />
                    <MiniKpi n={aprovHoje.length}  l="aprovados hoje"        c={aprovHoje.length ? "var(--ok)" : undefined} />
                    <MiniKpi n={total}             l={`publicações · ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`} />
                  </div>
                  {[...propostas, ...semDest, ...devolvidos, ...aprovHoje].map(a => (
                    <AlerteCard key={a.id} a={a} hojeIso={hojeIso} onAprovar={aprovar} onDevolver={devolver} onAcompanhar={setIncluirAc} />
                  ))}
                  <div className="text-center pt-2">
                    <Link href="/alertes" className="text-xs" style={{ color: "var(--accent)" }}>ver todas as publicações →</Link>
                  </div>
                </>
              );
            })()}
            {tab === "acomp" && <HomeAcompanhamentos eu={euAc} dado={acDado} />}
          {incluirAc && <DrawerIncluir casoId={incluirAc} origem="Publicação" eu={euAc} onClose={() => setIncluirAc(null)} onDone={m => { setIncluirAc(null); acDado.reload(); setAviso({ t: m, tom: "ok" }); }} />}

            {aviso && (
              <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded text-xs font-semibold text-on-acao shadow"
                   style={{ background: aviso.tom === "ok" ? "var(--ok)" : "var(--alerta)" }}
                   onAnimationEnd={() => setAviso(null)}>
                {aviso.t}
              </div>
            )}
          </div>
        </div>

        <aside className="rounded border p-3 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Prazos · 7 dias</div>
            <Link href="/prazos" className="text-xs" style={{ color: "var(--accent)" }}>Prazos →</Link>
          </div>
          <div className="space-y-1.5">
            {calendario.map(d => (
              <div key={d.data} className="p-2 border rounded" style={{ borderColor: "var(--border)" }}>
                <div className="flex justify-between items-baseline text-xs uppercase font-semibold tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>
                  <span>{d.label}</span>
                  <span>{d.eventos.length || "—"}</span>
                </div>
                {d.eventos.slice(0, 3).map((e, i) => (
                  <div key={i} className="text-[11px] px-1.5 py-0.5 rounded mb-0.5 truncate" title={`${e.titulo}${e.extra ? " · " + e.extra : ""}`}
                       style={{
                         background: "var(--bg-page)",
                         color: corTipo(e.tipo),
                       }}>
                    <b>{e.titulo}</b>
                    {e.extra && <span style={{ color: "var(--text-secondary)" }}> · {e.extra}</span>}
                  </div>
                ))}
                {d.eventos.length > 3 && (
                  <Link href="/prazos" className="block text-[11px] mt-0.5 hover:underline" style={{ color: "var(--accent)" }}>
                    +{d.eventos.length - 3} · ver todos em Prazos →
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Ações rápidas</div>
            <div className="grid grid-cols-2 gap-1.5">
              <Link href="/pendencias" className="px-2 py-1.5 rounded-sm border text-xs hover:opacity-80" style={{ borderColor: "var(--border)" }}>+ Pendência</Link>
              <Link href="/clientes" className="px-2 py-1.5 rounded-sm border text-xs hover:opacity-80" style={{ borderColor: "var(--border)" }}>+ Cliente</Link>
              <Link href="/alertes" className="px-2 py-1.5 rounded-sm border text-xs hover:opacity-80" style={{ borderColor: "var(--border)" }}>Publicações</Link>
              <Link href="/prazos/calculadora" className="px-2 py-1.5 rounded-sm border text-xs hover:opacity-80" style={{ borderColor: "var(--border)" }}>Calcular prazo</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MicroKpi({ label, value, tone, chip }: { label?: string; value: any; tone?: "warn" | "crit"; chip?: React.ReactNode }) {
  const color = tone === "crit" ? "var(--alerta)" : tone === "warn" ? "var(--atencao)" : "var(--text-primary)";
  return (
    <span className="px-2.5 py-1 rounded border inline-flex items-center gap-1.5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {chip}
      <b style={{ color }}>{value}</b>
      {label && <span style={{ color: "var(--text-secondary)" }}>{label}</span>}
    </span>
  );
}


function EmptyMsg({ text }: { text: string }) {
  return <div className="text-center py-8 text-sm italic" style={{ color: "var(--text-muted)" }}>{text}</div>;
}

function MiniKpi({ n, l, c }: { n: number; l: string; c?: string }) {
  return (
    <div className="rounded border px-2 py-1.5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-lg font-bold leading-none" style={{ color: c ?? "var(--text-primary)" }}>{n}</div>
      <div className="text-[9px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: "var(--text-muted)" }}>{l}</div>
    </div>
  );
}

function AlerteTag({ text, tom }: { text: string; tom: "gray" | "blue" | "amber" | "green" | "red" | "pink" }) {
  const cores = {
    gray:  ["var(--bg-page)", "var(--text-muted)"],
    blue:  ["var(--acao-tint)", "var(--acao-claro)"],
    amber: ["var(--atencao-tint)", "var(--atencao)"],
    green: ["var(--ok-tint)", "var(--ok)"],
    red:   ["var(--alerta-tint)", "var(--alerta)"],
    pink:  ["var(--alerta-tint)", "var(--alerta)"],
  }[tom];
  return <span className="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: cores[0], color: cores[1] }}>{text}</span>;
}

function AlerteCard({ a, hojeIso, onAprovar, onDevolver, onAcompanhar }: {
  a: AlerteHome; hojeIso: string;
  onAprovar: (id: string) => void; onDevolver: (id: string) => void; onAcompanhar?: (casoId: string) => void;
}) {
  const p = a.proposta;
  const bg = a.status === "proposta" ? "var(--acao-tint)"
           : a.status === "devolvida" ? "var(--alerta-tint)"
           : "var(--bg-surface)";
  const border = a.status === "proposta" ? "var(--acao)"
               : a.status === "devolvida" ? "var(--alerta)"
               : "var(--border)";
  const opacity = a.status === "aprovada" ? 0.7 : 1;
  const diasAtras = a.data === hojeIso ? 0 : Math.max(1, Math.floor((Date.parse(hojeIso) - Date.parse(a.data)) / 86400000));
  return (
    <div className="p-2.5 rounded-md border mb-2" style={{ background: bg, borderColor: border, opacity }}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        {a.status === "novo"      && <AlerteTag text="sem destinação" tom="gray" />}
        {a.status === "proposta"  && <AlerteTag text="aguardando sua aprovação" tom="blue" />}
        {a.status === "devolvida" && <AlerteTag text={`devolvida ${a.devolucao_obs ? "·" : ""}`} tom="red" />}
        {a.status === "aprovada"  && <AlerteTag text={`✓ aprovada${a.aprovado_em ? " " + relTime(a.aprovado_em) : ""}`} tom="green" />}
        {a.tipo && <AlerteTag text={a.tipo} tom="blue" />}
        {diasAtras > 0 && a.status === "novo" && <AlerteTag text={`desde ${a.data.slice(8, 10)}/${a.data.slice(5, 7)} · ${diasAtras}d`} tom="amber" />}
        {p?.prazo && <AlerteTag text={`prazo ${String(p.prazo).slice(8, 10)}/${String(p.prazo).slice(5, 7)}${p.dias ? " · " + p.dias + "d" : ""}`} tom={p.dias && p.dias <= 5 ? "amber" : "blue"} />}
        {p?.destino === "naf" && <AlerteTag text="NAF · sem prazo" tom="pink" />}
      </div>
      <div className="text-sm font-bold uppercase tracking-wide">{a.cliente ?? "—"}</div>
      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {a.processo && <span className="font-mono" style={{ color: "var(--accent)" }}>{a.processo}</span>}
        {a.tribunal && <span> · {a.tribunal}</span>}
        {a.status === "proposta" && a.proposto_por && (
          <span> · <b style={{ color: "var(--alerta)" }}>proposta por {a.proposto_por}{a.proposto_em ? " · " + relTime(a.proposto_em) : ""}</b></span>
        )}
      </div>
      {a.status === "proposta" && p && (
        <div className="mt-1.5 p-2 rounded text-[11px]" style={{ background: "var(--bg-page)" }}>
          {p.providencia_nome && <div><b>Providência:</b> {p.providencia_nome}</div>}
          <div><b>Andamento:</b> <span style={{ color: "var(--text-secondary)" }}>{p.texto_andamento}</span></div>
          {(p.responsavel || p.revisor) && <div><b>Responsável:</b> {p.responsavel ?? "—"}{p.revisor ? ` · Revisor: ${p.revisor}` : ""}</div>}
        </div>
      )}
      {a.status === "novo" && a.teor && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.teor}</div>
      )}
      {a.status === "devolvida" && a.devolucao_obs && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--alerta)" }}>Sua nota: “{a.devolucao_obs}”</div>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {a.status === "proposta" && (
          <>
            <button onClick={() => onAprovar(a.id)} className="px-2.5 py-1 rounded text-[11px] font-semibold text-on-acao" style={{ background: "var(--ok)" }}>✓ Aprovar</button>
            <button onClick={() => onDevolver(a.id)} className="px-2.5 py-1 rounded text-[11px] font-semibold border" style={{ borderColor: "var(--atencao)", color: "var(--atencao)" }}>↺ Devolver</button>
            <Link href={`/alertes?open=${a.id}`} className="px-2.5 py-1 rounded text-[11px] border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>detalhes</Link>
          </>
        )}
        {a.status === "novo" && (
          <>
            <Link href={`/alertes?open=${a.id}`} className="px-2.5 py-1 rounded text-[11px] font-semibold text-on-acao" style={{ background: "var(--acao)" }}>Dar destinação</Link>
            {a.caso_id && <Link href={`/casos/${a.caso_id}`} className="px-2.5 py-1 rounded text-[11px] border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>abrir caso ↗</Link>}
          {a.caso_id && onAcompanhar && <button onClick={() => onAcompanhar(a.caso_id!)} className="px-2.5 py-1 rounded text-[11px] border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Acompanhar</button>}
          </>
        )}
        {(a.status === "aprovada" || a.status === "devolvida") && a.caso_id && (
          <Link href={`/casos/${a.caso_id}`} className="px-2.5 py-1 rounded text-[11px] border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>abrir caso ↗</Link>
        )}
      </div>
    </div>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  return `${days}d`;
}

function corTipo(tipo: string): string {
  return ({ crit: "var(--alerta)", warn: "var(--atencao)", rev: "var(--destaque)", comp: "var(--ok)", normal: "var(--acao)" } as Record<string, string>)[tipo] || "var(--acao)";
}

function agruparPorDia(eventos: any[], hoje: Date): EventoDia[] {
  const dias: EventoDia[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i);
    const key = isoLocal(d);
    const label = i === 0 ? `${diaSemana(d)} ${d.getDate()} · hoje`
                : i === 1 ? `${diaSemana(d)} ${d.getDate()} · amanhã`
                : `${diaSemana(d)} ${d.getDate()}`;
    const evs = eventos
      .filter(e => (e.data_inicio || "").slice(0, 10) === key)
      .map(e => ({
        titulo: e.subject || "(sem título)",
        tipo: catToTipo(e.categories),
      }));
    dias.push({ data: key, label: label, eventos: evs });
  }
  return dias;
}

function agruparPorDiaPend(pends: any[], hoje: Date): EventoDia[] {
  const dias: EventoDia[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i);
    const key = isoLocal(d);
    const label = i === 0 ? `${diaSemana(d)} ${d.getDate()} · hoje`
                : i === 1 ? `${diaSemana(d)} ${d.getDate()} · amanhã`
                : `${diaSemana(d)} ${d.getDate()}`;
    const evs = pends
      .filter(p => (p.fatal || "").slice(0, 10) === key)
      .map(p => ({
        titulo: p.titulo || p.cliente,
        extra: p.cliente,
        tipo: (i === 0 ? "crit" : i === 1 ? "warn" : "normal") as "crit" | "warn" | "normal",
      }));
    dias.push({ data: key, label: label, eventos: evs });
  }
  return dias;
}

function diaSemana(d: Date): string {
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
}

function catToTipo(cats: any): "crit" | "warn" | "rev" | "comp" | "normal" {
  if (!cats) return "normal";
  const s = String(cats).toUpperCase();
  if (s.includes("PRAZO")) return "crit";
  if (s.includes("REVISÃO")) return "rev";
  if (s.includes("COMPROVAÇÃO")) return "comp";
  return "normal";
}

// Data local (Brasília) em AAAA-MM-DD — toISOString() usa UTC e vira o dia depois das 21h.
function isoLocal(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
