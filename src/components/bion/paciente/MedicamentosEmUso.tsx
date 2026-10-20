"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellPlus, Loader2, Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { FREQUENCIAS_LEMBRETE, type Posologia } from "@/lib/saude-paciente";
import { apiSaude } from "./api-saude";
import type { Lembrete } from "@/lib/bion-tipos";

export type MedicamentoWire = {
  id: string;
  nome: string;
  dose: string | null;
  via: string | null;
  posologia: Posologia;
  usoContinuo: boolean;
  controlado: boolean;
  inicio: string;
  fim: string | null;
  ativo: boolean;
  origem: string;
  documentoId: string | null;
  lembretes: number;
};

const botaoPrincipal = "bg-bion-ink text-bion-paper dark:bg-bion-paper dark:text-bion-ink";
const campo =
  "w-full min-w-0 rounded-xl border border-bion-ink/15 bg-white/70 px-3 py-2 text-base text-bion-ink outline-none focus-visible:ring-2 focus-visible:ring-bion-ink/40 dark:border-white/15 dark:bg-white/10 dark:text-bion-paper";

/**
 * Card "Medicamentos em uso" da seção Saúde: os que vieram da receita
 * (origem "receita") + os que o paciente adicionou, com lembrete direto.
 */
export function MedicamentosEmUso({ onGerenciarLembretes }: { onGerenciarLembretes?: () => void } = {}) {
  const { aplicarDelta, lembretes } = useBion();
  const [lista, setLista] = useState<MedicamentoWire[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [lembreteDe, setLembreteDe] = useState<string | null>(null);
  const [mostrarSuspensos, setMostrarSuspensos] = useState(false);

  const carregar = useCallback(async () => {
    const d = await apiSaude<{ medicamentos: MedicamentoWire[] }>("/api/paciente/medicamentos", undefined, true);
    setLista(d?.medicamentos ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const trocar = (m: MedicamentoWire) => setLista((l) => (l ?? []).map((x) => (x.id === m.id ? m : x)));

  const alternarAtivo = async (m: MedicamentoWire) => {
    const d = await apiSaude<{ medicamento: MedicamentoWire }>(`/api/paciente/medicamentos/${m.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: !m.ativo }),
    });
    if (d) trocar(d.medicamento);
  };
  const remover = async (m: MedicamentoWire) => {
    if (!window.confirm(`Remover ${m.nome} da lista?`)) return;
    const d = await apiSaude(`/api/paciente/medicamentos/${m.id}`, { method: "DELETE" });
    if (d) setLista((l) => (l ?? []).filter((x) => x.id !== m.id));
  };

  const ativos = (lista ?? []).filter((m) => m.ativo);
  const suspensos = (lista ?? []).filter((m) => !m.ativo);

  // Só lembretes de medicação; consulta/exame/hidratação ficam fora deste card.
  const lembretesMed = lembretes.filter((l) => l.tipo === "Medicação");
  const chave = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const horariosDe = (m: MedicamentoWire) =>
    lembretesMed.filter((l) => chave(l.medicamento) === chave(m.nome)).sort((x, y) => x.horario.localeCompare(y.horario));
  // Lembretes de medicação sem medicamento correspondente na lista: uma linha por remédio, sem repetir.
  const nomesAtivos = new Set(ativos.map((m) => chave(m.nome)));
  const avulsos = new Map<string, { nome: string; lembretes: Lembrete[] }>();
  for (const l of lembretesMed) {
    const nome = l.medicamento?.trim() || l.titulo;
    const k = chave(nome);
    if (nomesAtivos.has(k)) continue;
    const g = avulsos.get(k) ?? { nome, lembretes: [] };
    g.lembretes.push(l);
    avulsos.set(k, g);
  }
  const listaAvulsos = [...avulsos.values()].map((g) => ({ ...g, lembretes: g.lembretes.sort((x, y) => x.horario.localeCompare(y.horario)) }));

  return (
    <section className="bp-glass p-5 w-full" aria-label="Medicamentos em uso">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold">
          <Pill className="w-4 h-4" aria-hidden /> Medicamentos em uso
        </h3>
        <button
          type="button"
          onClick={() => setAdicionando((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-bion-ink/8 px-3 py-1.5 text-xs font-bold dark:bg-white/10"
          aria-expanded={adicionando}
        >
          <Plus className="size-3.5" aria-hidden /> Adicionar
        </button>
      </div>

      {adicionando && (
        <FormNovo
          onCancelar={() => setAdicionando(false)}
          onCriado={(m) => {
            setLista((l) => [m, ...(l ?? [])]);
            setAdicionando(false);
            toast.success("Medicamento adicionado.");
          }}
        />
      )}

      {lista === null ? (
        <p className="py-2 text-sm opacity-80">Carregando…</p>
      ) : ativos.length === 0 && listaAvulsos.length === 0 ? (
        <p className="text-sm opacity-80">
          Nenhum medicamento em uso. Os da receita do médico aparecem aqui sozinhos; você também pode adicionar.
        </p>
      ) : (
        <ul className="divide-y divide-bion-ink/10 dark:divide-white/10">
          {ativos.map((m) => (
            <ItemMedicamento
              key={m.id}
              m={m}
              horarios={horariosDe(m)}
              lembreteAberto={lembreteDe === m.id}
              onLembrete={() => setLembreteDe((v) => (v === m.id ? null : m.id))}
              onLembreteCriado={(lembrete) => {
                aplicarDelta({ lembrete });
                trocar({ ...m, lembretes: m.lembretes + 1 });
                setLembreteDe(null);
                toast.success("Lembrete criado.");
              }}
              onSuspender={() => void alternarAtivo(m)}
              onRemover={() => void remover(m)}
            />
          ))}
          {listaAvulsos.map((g) => (
            <li key={`avulso-${g.nome}`} className="py-3">
              <p className="truncate text-sm font-bold">{g.nome}</p>
              <Horarios lembretes={g.lembretes} />
            </li>
          ))}
        </ul>
      )}

      {onGerenciarLembretes && lembretesMed.length > 0 && (
        <button type="button" onClick={onGerenciarLembretes} className="mt-2 text-xs font-semibold underline opacity-80">
          Gerenciar lembretes
        </button>
      )}

      {suspensos.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setMostrarSuspensos((v) => !v)} className="text-xs font-semibold underline opacity-80">
            {mostrarSuspensos ? "Ocultar" : "Ver"} os que parei de tomar ({suspensos.length})
          </button>
          {mostrarSuspensos && (
            <ul className="mt-2 space-y-1.5">
              {suspensos.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm opacity-80">
                  <span className="truncate line-through">{m.nome}</span>
                  <button type="button" onClick={() => void alternarAtivo(m)} className="ml-2 shrink-0 text-xs font-bold underline">
                    Voltei a tomar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ItemMedicamento({
  m,
  horarios,
  lembreteAberto,
  onLembrete,
  onLembreteCriado,
  onSuspender,
  onRemover,
}: {
  m: MedicamentoWire;
  horarios: Lembrete[];
  lembreteAberto: boolean;
  onLembrete: () => void;
  onLembreteCriado: (lembrete: unknown) => void;
  onSuspender: () => void;
  onRemover: () => void;
}) {
  const detalhe = [m.dose, m.via, m.posologia.frequencia].filter(Boolean).join(" · ");
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{m.nome}</p>
          {detalhe && <p className="text-xs opacity-80">{detalhe}</p>}
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10">
              {m.origem === "receita" ? "Da receita" : "Adicionado por você"}
            </span>
            {m.usoContinuo && <span className="rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10">Uso contínuo</span>}
          </p>
          <Horarios lembretes={horarios} />
          {m.posologia.instrucoes && <p className="mt-1 text-xs opacity-80">{m.posologia.instrucoes}</p>}
        </div>
        <button
          type="button"
          onClick={onLembrete}
          aria-expanded={lembreteAberto}
          aria-label={`Criar lembrete para ${m.nome}`}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-bion-ink/8 dark:bg-white/10"
        >
          <BellPlus className="size-4" aria-hidden />
        </button>
      </div>
      {lembreteAberto && <FormLembrete m={m} onCriado={onLembreteCriado} />}
      <div className="mt-2 flex gap-3 text-xs font-semibold opacity-80">
        <button type="button" onClick={onSuspender} className="underline">
          Parei de tomar
        </button>
        {m.origem === "paciente" && (
          <button type="button" onClick={onRemover} className="inline-flex items-center gap-1 underline">
            <Trash2 className="size-3" aria-hidden /> Remover
          </button>
        )}
      </div>
    </li>
  );
}

/** Horários de lembrete na própria linha do medicamento (feitos aparecem riscados). */
function Horarios({ lembretes }: { lembretes: Lembrete[] }) {
  if (lembretes.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold" aria-label={`Lembretes: ${lembretes.map((l) => `${l.horario}${l.feito ? " (feito)" : ""}`).join(", ")}`}>
      <Bell className="size-3.5 opacity-80" aria-hidden />
      {lembretes.map((l) => (
        <span key={l.id} className={`rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10 ${l.feito ? "line-through opacity-60" : ""}`}>
          {l.horario}
        </span>
      ))}
    </p>
  );
}

function FormLembrete({ m, onCriado }: { m: MedicamentoWire; onCriado: (lembrete: unknown) => void }) {
  const [horario, setHorario] = useState(m.posologia.horarios?.[0] ?? "08:00");
  const [frequencia, setFrequencia] = useState<string>(FREQUENCIAS_LEMBRETE[0]);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const d = await apiSaude<{ lembrete: unknown }>(`/api/paciente/medicamentos/${m.id}/lembrete`, {
          method: "POST",
          body: JSON.stringify({ horario, frequencia }),
        });
        setEnviando(false);
        if (d) onCriado(d.lembrete);
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Horário
        <input type="time" required value={horario} onChange={(e) => setHorario(e.target.value)} className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Frequência
        <select value={frequencia} onChange={(e) => setFrequencia(e.target.value)} className={campo}>
          {FREQUENCIAS_LEMBRETE.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={enviando} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-60 ${botaoPrincipal}`}>
        {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Criar lembrete
      </button>
    </form>
  );
}

function FormNovo({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: (m: MedicamentoWire) => void }) {
  const [nome, setNome] = useState("");
  const [dose, setDose] = useState("");
  const [frequencia, setFrequencia] = useState("");
  const [usoContinuo, setUsoContinuo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="mb-4 space-y-3 rounded-2xl border border-bion-ink/10 p-3 dark:border-white/10"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const d = await apiSaude<{ medicamento: MedicamentoWire }>("/api/paciente/medicamentos", {
          method: "POST",
          body: JSON.stringify({ nome, dose, frequencia, usoContinuo }),
        });
        setEnviando(false);
        if (d) onCriado(d.medicamento);
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Nome
        <input required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder="Ex.: Losartana" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Dose
          <input maxLength={80} value={dose} onChange={(e) => setDose(e.target.value)} className={campo} placeholder="50 mg" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Como toma
          <input maxLength={80} value={frequencia} onChange={(e) => setFrequencia(e.target.value)} className={campo} placeholder="1x ao dia" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={usoContinuo} onChange={(e) => setUsoContinuo(e.target.checked)} /> Uso contínuo
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-full px-4 py-2 text-xs font-bold opacity-80">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-60 ${botaoPrincipal}`}>
          {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Salvar
        </button>
      </div>
    </form>
  );
}
