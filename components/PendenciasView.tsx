"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { BUCKETS, type BucketId } from "@/lib/buckets";
import type { Cliente, Pendencia } from "@/lib/types";
import { criarPendencia, moverPendencia } from "@/app/(central)/pendencias/actions";

type Props = {
  pendencias: Pendencia[];
  clientes: Pick<Cliente, "id" | "nome">[];
  hoje: string;
};

type Modo = "tabela" | "quadro";

export default function PendenciasView({ pendencias, clientes, hoje }: Props) {
  const [modo, setModo] = useState<Modo>("tabela");
  const [, startTransition] = useTransition();
  // Cópia local para a mudança aparecer na hora; o servidor confirma em seguida.
  const [lista, setLista] = useState(pendencias);
  useEffect(() => setLista(pendencias), [pendencias]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem("pendencias-modo");
      if (salvo === "quadro" || salvo === "tabela") setModo(salvo);
    } catch {}
  }, []);

  function trocarModo(m: Modo) {
    setModo(m);
    try {
      localStorage.setItem("pendencias-modo", m);
    } catch {}
  }

  function moverPara(id: string, bucket: BucketId) {
    const anterior = lista;
    setLista((atual) => atual.map((p) => (p.id === id ? { ...p, bucket } : p)));
    startTransition(async () => {
      try {
        await moverPendencia(id, bucket);
      } catch {
        setLista(anterior);
        alert("Não foi possível mover a pendência. Tente de novo.");
      }
    });
  }

  const abertas = lista.filter((p) => p.bucket !== "concluido");

  return (
    <div className="flex flex-col gap-6">
      <NovaPendencia clientes={clientes} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {abertas.length} {abertas.length === 1 ? "pendência em aberto" : "pendências em aberto"}
        </p>
        <div role="tablist" aria-label="Modo de visualização" className="flex border border-line-strong rounded-sm overflow-hidden">
          {(["tabela", "quadro"] as Modo[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={modo === m}
              onClick={() => trocarModo(m)}
              className={`px-4 h-10 text-sm font-semibold ${
                modo === m ? "bg-petroleo text-on-brand" : "bg-surface-200 text-ink-muted"
              }`}
            >
              {m === "tabela" ? "Tabela" : "Quadro"}
            </button>
          ))}
        </div>
      </div>

      {modo === "tabela" ? (
        <Tabela lista={lista} hoje={hoje} onMover={moverPara} />
      ) : (
        <Quadro lista={lista} hoje={hoje} onMover={moverPara} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function NovaPendencia({ clientes }: { clientes: Pick<Cliente, "id" | "nome">[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [enviando, startTransition] = useTransition();
  return (
    <form
      ref={form}
      action={(fd) =>
        startTransition(async () => {
          await criarPendencia(fd);
          form.current?.reset();
        })
      }
      className="border border-line bg-surface-200 rounded-md p-4 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 flex-[3_1_260px] min-w-0">
        <span className="text-xs font-semibold text-ink-muted">Nova pendência</span>
        <input
          name="titulo"
          required
          placeholder="Ex.: Yasmin — proposta do carro"
          className="h-10 px-3 rounded-sm border border-line-strong bg-surface-100 text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 flex-[2_1_180px] min-w-0">
        <span className="text-xs font-semibold text-ink-muted">Cliente</span>
        <select name="cliente_id" className="h-10 px-2 rounded-sm border border-line-strong bg-surface-100 text-ink">
          <option value="">Sem cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 flex-[1_1_150px]">
        <span className="text-xs font-semibold text-ink-muted">Prazo</span>
        <input type="date" name="prazo" className="h-10 px-2 rounded-sm border border-line-strong bg-surface-100 text-ink" />
      </label>
      <label className="flex items-center gap-2 h-10 text-sm">
        <input type="checkbox" name="prazo_fatal" className="w-4 h-4 accent-[rgb(var(--brand-bordo))]" />
        Prazo fatal
      </label>
      <button
        type="submit"
        disabled={enviando}
        className="h-10 px-5 rounded-sm bg-petroleo text-on-brand font-semibold disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Adicionar"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function Prazo({ p, hoje }: { p: Pendencia; hoje: string }) {
  if (!p.prazo) return <span className="text-ink-muted">—</span>;
  const [a, m, d] = p.prazo.split("-");
  const texto = `${d}/${m}/${a}`;
  if (p.bucket === "concluido") return <span className="text-ink-muted">{texto}</span>;
  const urgente = p.prazo <= hoje;
  const vencido = p.prazo < hoje;
  return (
    <span className={`whitespace-nowrap ${urgente ? "text-bordo font-semibold" : ""}`}>
      {texto}
      {vencido ? " · vencido" : p.prazo === hoje ? " · hoje" : ""}
      {p.prazo_fatal && <span className="ml-1 text-bordo" title="Prazo fatal">●</span>}
    </span>
  );
}

function Tabela({
  lista,
  hoje,
  onMover,
}: {
  lista: Pendencia[];
  hoje: string;
  onMover: (id: string, bucket: BucketId) => void;
}) {
  const ordenada = [...lista].sort((x, y) => {
    if ((x.bucket === "concluido") !== (y.bucket === "concluido")) return x.bucket === "concluido" ? 1 : -1;
    if (x.prazo && y.prazo) return x.prazo.localeCompare(y.prazo);
    if (x.prazo) return -1;
    if (y.prazo) return 1;
    return x.ordem - y.ordem;
  });

  if (ordenada.length === 0) {
    return <p className="text-ink-muted border-t border-line pt-6">Nenhuma pendência por enquanto.</p>;
  }

  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="font-semibold py-3 pr-4">Pendência</th>
            <th className="font-semibold py-3 pr-4">Cliente</th>
            <th className="font-semibold py-3 pr-4">Prazo</th>
            <th className="font-semibold py-3 pr-4">Situação</th>
            <th className="py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {ordenada.map((p) => (
            <tr key={p.id} className={`border-t border-line ${p.bucket === "concluido" ? "text-ink-muted" : ""}`}>
              <td className={`py-3 pr-4 ${p.bucket === "concluido" ? "line-through" : "font-medium"}`}>{p.titulo}</td>
              <td className="py-3 pr-4 text-ink-muted">{p.cliente?.nome ?? "—"}</td>
              <td className="py-3 pr-4">
                <Prazo p={p} hoje={hoje} />
              </td>
              <td className="py-3 pr-4">
                <select
                  aria-label={`Situação de ${p.titulo}`}
                  value={p.bucket}
                  onChange={(e) => onMover(p.id, e.target.value as BucketId)}
                  className="h-9 px-2 rounded-sm border border-line bg-surface-200 text-ink"
                >
                  {BUCKETS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-3 text-right">
                {p.bucket !== "concluido" && (
                  <button
                    onClick={() => onMover(p.id, "concluido")}
                    className="h-9 px-3 rounded-sm border border-line-strong text-petroleo font-semibold whitespace-nowrap"
                  >
                    Concluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Quadro({
  lista,
  hoje,
  onMover,
}: {
  lista: Pendencia[];
  hoje: string;
  onMover: (id: string, bucket: BucketId) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function aoSoltar(e: DragEndEvent) {
    const destino = e.over?.id as BucketId | undefined;
    const id = String(e.active.id);
    const atual = lista.find((p) => p.id === id);
    if (destino && atual && atual.bucket !== destino) onMover(id, destino);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={aoSoltar}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BUCKETS.map((b) => (
          <Coluna key={b.id} id={b.id} nome={b.nome} itens={lista.filter((p) => p.bucket === b.id)} hoje={hoje} />
        ))}
      </div>
    </DndContext>
  );
}

function Coluna({ id, nome, itens, hoje }: { id: BucketId; nome: string; itens: Pendencia[]; hoje: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={nome}
      className={`flex-[0_0_240px] flex flex-col gap-2 rounded-md p-3 min-h-[200px] ${
        isOver ? "bg-surface-mist" : "bg-surface-200 border border-line"
      }`}
    >
      <header className="flex items-center justify-between pb-2 border-b border-line">
        <h2 className="text-sm font-semibold">{nome}</h2>
        <span className="text-xs text-ink-muted">{itens.length}</span>
      </header>
      {itens.map((p) => (
        <Cartao key={p.id} p={p} hoje={hoje} />
      ))}
    </section>
  );
}

function Cartao({ p, hoje }: { p: Pendencia; hoje: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-surface-100 border border-line rounded-sm p-3 text-sm flex flex-col gap-1 cursor-grab touch-none ${
        isDragging ? "opacity-70 shadow-lg relative z-10" : ""
      }`}
    >
      <span className={`font-medium ${p.bucket === "concluido" ? "line-through text-ink-muted" : ""}`}>{p.titulo}</span>
      {p.cliente?.nome && <span className="text-xs text-ink-muted">{p.cliente.nome}</span>}
      {p.prazo && (
        <span className="text-xs">
          <Prazo p={p} hoje={hoje} />
        </span>
      )}
    </article>
  );
}

