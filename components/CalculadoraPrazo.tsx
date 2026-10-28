"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { calcular, type Justica, type TipoPrazo } from "@/lib/prazos";
import { criarPendencia } from "@/app/(central)/pendencias/actions";
import { botao, campo, painel, rotuloCampo } from "@/lib/ui";

function br(isoData: string) {
  const [a, m, d] = isoData.split("-");
  return `${d}/${m}/${a}`;
}
function diaSemana(isoData: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(isoData + "T12:00:00Z"));
}

export default function CalculadoraPrazo({ hoje, clientes }: { hoje: string; clientes: { id: string; nome: string }[] }) {
  const [tipo, setTipo] = useState<TipoPrazo>("judicial");
  const [justica, setJustica] = useState<Justica>("estadual_rj");
  const [data, setData] = useState(hoje);
  const [dias, setDias] = useState(15);
  const [dje, setDje] = useState(false);
  const [extras, setExtras] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [salvando, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  const resultado = useMemo(() => {
    if (!data || !dias || dias < 1 || dias > 365) return null;
    const datasSemExpediente = extras
      .split(/[\s,;]+/)
      .map((t) => {
        const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
      })
      .filter(Boolean) as string[];
    return calcular({ tipo, justica, dataInicial: data, dias, disponibilizacaoDje: tipo === "judicial" && dje, datasSemExpediente });
  }, [tipo, justica, data, dias, dje, extras]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className={`${painel} flex flex-col gap-4`}>
        <div role="radiogroup" aria-label="Tipo de prazo" className="flex border border-line-strong rounded-sm overflow-hidden self-start">
          {(["judicial", "administrativo"] as TipoPrazo[]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className={`px-4 h-10 text-sm font-semibold ${tipo === t ? "bg-petroleo text-on-brand" : "bg-surface-200 text-ink-muted"}`}
            >
              {t === "judicial" ? "Judicial (dias úteis)" : "Administrativo (corridos)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>
              {tipo === "judicial" ? (dje ? "Disponibilização no DJe" : "Intimação ou publicação") : "Ciência da intimação"}
            </span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Prazo em dias</span>
            <input
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              className={campo}
            />
          </label>
        </div>

        {tipo === "judicial" && (
          <>
            <label className="flex flex-col gap-1">
              <span className={rotuloCampo}>Justiça</span>
              <select value={justica} onChange={(e) => setJustica(e.target.value as Justica)} className={campo}>
                <option value="estadual_rj">Estadual do Rio (TJRJ)</option>
                <option value="federal">Federal (TRF2)</option>
                <option value="outra">Outra (só feriados nacionais)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dje}
                onChange={(e) => setDje(e.target.checked)}
                className="w-4 h-4 accent-[rgb(var(--brand-bordo))]"
              />
              A data é a da disponibilização no DJe
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className={rotuloCampo}>Outros dias sem expediente (DD/MM/AAAA, separados por vírgula)</span>
          <input
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
            placeholder="Ex.: 03/12/2026, 04/12/2026"
            className={campo}
          />
        </label>
      </div>

      <div className="flex flex-col gap-4">
        {resultado ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="label">Vencimento</span>
              <span className="font-serif text-4xl text-ink-heading">{br(resultado.vencimento)}</span>
              <span className="text-ink-muted capitalize">{diaSemana(resultado.vencimento)}</span>
            </div>
            <ol className="border-t border-line text-sm">
              {resultado.passos.map((p, i) => (
                <li key={i} className="border-b border-line py-2 flex justify-between gap-4">
                  <span>{p.texto}</span>
                  <span className="text-ink-muted whitespace-nowrap">{br(p.data)}</span>
                </li>
              ))}
            </ol>
            {resultado.ignorados.filter((x) => !["sábado", "domingo"].includes(x.texto)).length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-muted">Dias pulados além dos fins de semana</summary>
                <ul className="pt-2 flex flex-col gap-1">
                  {resultado.ignorados
                    .filter((x) => !["sábado", "domingo"].includes(x.texto))
                    .filter((x, i, arr) => !(x.texto.startsWith("suspensão") && arr[i - 1]?.texto.startsWith("suspensão")))
                    .map((x) => (
                      <li key={x.data} className="flex justify-between gap-4">
                        <span>{x.texto.startsWith("suspensão") ? "Suspensão de 20/12 a 20/01 (CPC, art. 220)" : x.texto}</span>
                        <span className="text-ink-muted">{br(x.data)}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-ink-muted leading-relaxed">
              Confira no calendário do tribunal ou do órgão: feriados municipais, pontos facultativos e suspensões
              pontuais não entram no cálculo se não forem informados acima.
            </p>

            {salvo ? (
              <p className={`${painel} text-sm`}>Pendência criada com prazo em {br(resultado.vencimento)}.</p>
            ) : (
              <form
                ref={form}
                action={(fd) =>
                  startTransition(async () => {
                    fd.set("prazo", resultado.vencimento);
                    await criarPendencia(fd);
                    setSalvo(true);
                  })
                }
                className={`${painel} flex flex-col gap-3`}
              >
                <span className="text-sm font-semibold">Lançar como pendência</span>
                <input name="titulo" required placeholder="Ex.: Contrarrazões — Credsea" className={campo} />
                <div className="flex flex-wrap gap-3 items-center">
                  <select name="cliente_id" className={`${campo} flex-1`} defaultValue="">
                    <option value="">Sem cliente</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="prazo_fatal" defaultChecked className="w-4 h-4 accent-[rgb(var(--brand-bordo))]" />
                    Prazo fatal
                  </label>
                </div>
                <input type="hidden" name="bucket" value="producao" />
                <button type="submit" disabled={salvando} className={`${botao} self-start`}>
                  {salvando ? "Salvando…" : `Criar com prazo em ${br(resultado.vencimento)}`}
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="text-ink-muted">Informe a data e o número de dias.</p>
        )}
      </div>
    </div>
  );
}
