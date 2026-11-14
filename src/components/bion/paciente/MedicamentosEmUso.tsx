"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import {
  DIAS_SEMANA_CURTOS,
  OPCOES_FREQUENCIA,
  descricaoAvisos,
  horariosSugeridos,
  type ModoFrequencia,
  type Posologia,
} from "@/lib/saude-paciente";
import { apiSaude } from "./api-saude";
import { Esqueleto } from "./EstadosPaciente";
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
const chip =
  "rounded-full bg-bion-ink/8 px-3 py-1.5 text-xs font-bold dark:bg-white/10";
const chipAtivo = `rounded-full px-3 py-1.5 text-xs font-bold ${botaoPrincipal}`;

/* ---------- Editor de avisos (frequência estruturada + horários) ---------- */

type EstadoAvisos = { modo: ModoFrequencia; horarios: string[]; diaSemana: number };

const estadoNovoAvisos = (): EstadoAvisos => ({ modo: "1x", horarios: ["08:00"], diaSemana: new Date().getDay() });

/** Pré-preenche o editor a partir da posologia e dos lembretes que já tocam. */
function estadoDeMedicamento(m: MedicamentoWire, atuais: Lembrete[]): EstadoAvisos {
  const p = m.posologia;
  const tocando = atuais.map((l) => l.horario).sort();
  if (typeof p.diaSemana === "number") {
    return { modo: "semanal", horarios: [tocando[0] ?? p.horarios?.[0] ?? "08:00"], diaSemana: p.diaSemana };
  }
  const n = Math.min(4, Math.max(1, p.vezesAoDia ?? (tocando.length || p.horarios?.length || 1)));
  const base = tocando.length ? tocando : (p.horarios ?? []);
  const horarios = base.length === n ? base : horariosSugeridos(n, base[0] ?? "08:00");
  return { modo: `${n}x` as ModoFrequencia, horarios, diaSemana: new Date().getDay() };
}

/** Corpo p/ as rotas de criar (POST /medicamentos) e substituir (POST .../avisos). */
function corpoAvisos(e: EstadoAvisos): { horarios: string[]; vezesAoDia?: number; diaSemana?: number } {
  return e.modo === "semanal"
    ? { horarios: e.horarios.slice(0, 1), diaSemana: e.diaSemana }
    : { horarios: e.horarios, vezesAoDia: Number(e.modo[0]) };
}

function posologiaDoEstado(e: EstadoAvisos): Posologia {
  return e.modo === "semanal"
    ? { horarios: e.horarios.slice(0, 1), diaSemana: e.diaSemana }
    : { horarios: e.horarios, vezesAoDia: Number(e.modo[0]) };
}

/**
 * Os campos de "Como você toma?": chips de frequência, dia da semana no modo
 * semanal, um campo de hora por dose e o resumo ao vivo do que vai tocar.
 */
function CamposAvisos({ estado, onMudar }: { estado: EstadoAvisos; onMudar: (e: EstadoAvisos) => void }) {
  const trocarModo = (modo: ModoFrequencia) => {
    if (modo === "semanal") onMudar({ ...estado, modo, horarios: [estado.horarios[0] ?? "08:00"] });
    else onMudar({ ...estado, modo, horarios: horariosSugeridos(Number(modo[0]), estado.horarios[0] ?? "08:00") });
  };
  const trocarHorario = (i: number, v: string) =>
    onMudar({ ...estado, horarios: estado.horarios.map((h, j) => (j === i ? v : h)) });
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-xs font-semibold">Como você toma?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OPCOES_FREQUENCIA.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={estado.modo === o.id}
              onClick={() => trocarModo(o.id)}
              className={estado.modo === o.id ? chipAtivo : chip}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </fieldset>
      {estado.modo === "semanal" && (
        <fieldset>
          <legend className="text-xs font-semibold">Qual dia da semana?</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DIAS_SEMANA_CURTOS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={estado.diaSemana === i}
                onClick={() => onMudar({ ...estado, diaSemana: i })}
                className={estado.diaSemana === i ? chipAtivo : chip}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        {estado.horarios.map((h, i) => (
          <label key={i} className="flex flex-col gap-1 text-xs font-semibold">
            {estado.horarios.length === 1 ? "Horário" : `Horário ${i + 1}`}
            <input type="time" required value={h} onChange={(e) => trocarHorario(i, e.target.value)} className={campo} />
          </label>
        ))}
      </div>
      {descricaoAvisos(posologiaDoEstado(estado)) && (
        <p className="flex items-center gap-1.5 text-xs font-semibold opacity-90" aria-live="polite">
          <Bell className="size-3.5 shrink-0" aria-hidden /> Você recebe {descricaoAvisos(posologiaDoEstado(estado))}.
        </p>
      )}
    </div>
  );
}

/**
 * Card "Medicamentos em uso" da seção Saúde: os que vieram da receita
 * (origem "receita") + os que o paciente adicionou, com lembrete direto.
 */
export function MedicamentosEmUso({ onGerenciarLembretes }: { onGerenciarLembretes?: () => void } = {}) {
  const { aplicarDelta, lembretes } = useBion();
  const [lista, setLista] = useState<MedicamentoWire[] | null>(null);
  // M19: falha de carga tem estado próprio — antes `?? []` transformava
  // erro (rede/401/5xx) em "Nenhum medicamento em uso", sem retry.
  const [erroCarga, setErroCarga] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [lembreteDe, setLembreteDe] = useState<string | null>(null);
  const [mostrarSuspensos, setMostrarSuspensos] = useState(false);

  const carregar = useCallback(async () => {
    const d = await apiSaude<{ medicamentos: MedicamentoWire[] }>("/api/paciente/medicamentos", undefined, true);
    if (d) {
      setLista(d.medicamentos);
      setErroCarga(false);
    } else {
      // A lista NÃO é tocada: quem já tinha medicamentos continua vendo-os;
      // sem lista, a tela mostra o erro com "tentar de novo" (abaixo).
      setErroCarga(true);
    }
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
  // O lembrete pode ter sido gravado com "nome + dose" (ex.: "Losartana 50mg")
  // enquanto o medicamento guarda nome e dose separados — casar das duas formas,
  // senão o mesmo remédio aparece duas vezes na lista (uma como avulso).
  const chavesDe = (m: MedicamentoWire) => {
    const ks = [chave(m.nome)];
    if (m.dose?.trim()) ks.push(chave(`${m.nome} ${m.dose}`));
    return ks;
  };
  const horariosDe = (m: MedicamentoWire) => {
    const ks = new Set(chavesDe(m));
    return lembretesMed.filter((l) => ks.has(chave(l.medicamento))).sort((x, y) => x.horario.localeCompare(y.horario));
  };
  // Lembretes de medicação sem medicamento correspondente na lista: uma linha por remédio, sem repetir.
  const nomesAtivos = new Set(ativos.flatMap(chavesDe));
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
          onCriado={(m, novos) => {
            setLista((l) => [m, ...(l ?? [])]);
            for (const l of novos) aplicarDelta({ lembrete: l });
            setAdicionando(false);
            toast.success("Medicamento adicionado.");
          }}
        />
      )}

      {lista === null ? (
        erroCarga ? (
          <div className="py-2 text-sm" role="alert">
            <p className="font-semibold text-red-700 dark:text-red-300">Não foi possível carregar seus medicamentos.</p>
            <p className="mt-0.5 opacity-80">Pode ser uma falha de conexão — sua lista não está vazia por causa disso.</p>
            <button type="button" onClick={() => void carregar()} className="mt-2 font-bold underline">
              Tentar de novo
            </button>
          </div>
        ) : (
          <div role="status" aria-live="polite" className="py-2 space-y-2">
            <span className="sr-only">Carregando seus medicamentos…</span>
            <Esqueleto className="h-4 w-2/3" />
            <Esqueleto className="h-3 w-1/2" />
          </div>
        )
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
              onAvisosSalvos={(atualizado, criados, removidos) => {
                for (const id of removidos) aplicarDelta({ lembreteRemovido: id });
                for (const l of criados) aplicarDelta({ lembrete: l });
                trocar(atualizado);
                setLembreteDe(null);
                toast.success("Avisos atualizados.");
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

      {onGerenciarLembretes && (
        <button type="button" onClick={onGerenciarLembretes} className="mt-2 block text-left text-xs font-semibold underline opacity-80">
          {lembretes.length > 0 ? "Gerenciar lembretes" : "Gerenciar lembretes · Toque para criar o primeiro lembrete"}
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
  onAvisosSalvos,
  onSuspender,
  onRemover,
}: {
  m: MedicamentoWire;
  horarios: Lembrete[];
  lembreteAberto: boolean;
  onLembrete: () => void;
  onAvisosSalvos: (atualizado: MedicamentoWire, criados: Lembrete[], removidos: string[]) => void;
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
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className="rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10">
              {m.origem === "receita" ? "Da receita" : "Adicionado por você"}
            </span>
            {m.usoContinuo && <span className="rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10">Uso contínuo</span>}
          </p>
          {horarios.length > 0 ? (
            <Horarios lembretes={horarios} />
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold opacity-70">
              <BellOff className="size-3.5" aria-hidden /> Sem avisos
            </p>
          )}
          {m.posologia.instrucoes && <p className="mt-1 text-xs opacity-80">{m.posologia.instrucoes}</p>}
        </div>
        <button
          type="button"
          onClick={onLembrete}
          aria-expanded={lembreteAberto}
          aria-label={`Avisos de ${m.nome}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bion-ink/8 px-3 py-2 text-xs font-bold dark:bg-white/10"
        >
          <Bell className="size-4" aria-hidden /> Avisos
        </button>
      </div>
      {lembreteAberto && (
        <EditorAvisos m={m} atuais={horarios} onSalvo={onAvisosSalvos} onCancelar={onLembrete} />
      )}
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
        <span key={l.id} className={`rounded-full bg-bion-ink/8 px-2 py-0.5 dark:bg-white/10 ${l.feito ? "line-through opacity-80" : ""}`}>
          {l.horario}
        </span>
      ))}
    </p>
  );
}

/**
 * Editor do conjunto de avisos de um medicamento já cadastrado: o mesmo
 * editor do cadastro novo, salvando pela rota que substitui o conjunto
 * (POST .../avisos). Desmarcar "Receber avisos" e salvar desliga todos.
 */
function EditorAvisos({
  m,
  atuais,
  onSalvo,
  onCancelar,
}: {
  m: MedicamentoWire;
  atuais: Lembrete[];
  onSalvo: (atualizado: MedicamentoWire, criados: Lembrete[], removidos: string[]) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoAvisos>(() => estadoDeMedicamento(m, atuais));
  const [ligados, setLigados] = useState(true);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="mt-3 space-y-3 rounded-2xl border border-bion-ink/10 p-3 dark:border-white/10"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const d = await apiSaude<{ medicamento: MedicamentoWire; lembretes: Lembrete[]; removidos: string[] }>(
          `/api/paciente/medicamentos/${m.id}/avisos`,
          { method: "POST", body: JSON.stringify(ligados ? corpoAvisos(estado) : { horarios: [] }) },
        );
        setEnviando(false);
        if (d) onSalvo(d.medicamento, d.lembretes ?? [], d.removidos ?? []);
      }}
    >
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={ligados} onChange={(e) => setLigados(e.target.checked)} /> Receber avisos
      </label>
      {ligados ? (
        <CamposAvisos estado={estado} onMudar={setEstado} />
      ) : (
        <p className="text-xs opacity-80">Sem avisos para este medicamento. Ao salvar, os avisos atuais são apagados.</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-full px-4 py-2 text-xs font-bold opacity-80">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-60 ${botaoPrincipal}`}>
          {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Salvar avisos
        </button>
      </div>
    </form>
  );
}

function FormNovo({
  onCancelar,
  onCriado,
}: {
  onCancelar: () => void;
  onCriado: (m: MedicamentoWire, lembretes: Lembrete[]) => void;
}) {
  const [nome, setNome] = useState("");
  const [dose, setDose] = useState("");
  const [avisos, setAvisos] = useState<EstadoAvisos>(estadoNovoAvisos);
  const [usoContinuo, setUsoContinuo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="mb-4 space-y-3 rounded-2xl border border-bion-ink/10 p-3 dark:border-white/10"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const d = await apiSaude<{ medicamento: MedicamentoWire; lembretes?: Lembrete[] }>("/api/paciente/medicamentos", {
          method: "POST",
          body: JSON.stringify({ nome, dose, usoContinuo, ...corpoAvisos(avisos) }),
        });
        setEnviando(false);
        if (d) onCriado(d.medicamento, d.lembretes ?? []);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Nome
          <input required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder="Ex.: Losartana" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Dose
          <input maxLength={80} value={dose} onChange={(e) => setDose(e.target.value)} className={campo} placeholder="50 mg" />
        </label>
      </div>
      <CamposAvisos estado={avisos} onMudar={setAvisos} />
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
