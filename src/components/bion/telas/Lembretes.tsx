"use client";
import { useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Clock,
  Droplets,
  Plus,
  Pill,
  Check,
  Trash2,
} from "lucide-react";
import { EstadoVazio } from "@/components/bion/ui/EstadoVazio";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { HORA } from "@/lib/saude-paciente";
import { resolverFeito } from "@/lib/lembrete-ciclo";
import { ModalBion } from "@/components/bion/ModalBion";

/** F7: feitoEm chega ao cliente quando a migração 20261104a for aplicada e
 *  o store repassar o campo; até lá, undefined → resolverFeito cai no
 *  comportamento resolvido pela data quando houver, sem quebrar. */
const feitoEmDe = (l: unknown): string | null => (l as { feitoEm?: string | null }).feitoEm ?? null;

/** B16: ícone por tipo de lembrete — antes era sempre `Pill`, mesmo para
 *  consulta, exame e hidratação. */
const ICONE_TIPO = {
  "Medicação": Pill,
  "Consulta": CalendarClock,
  "Exame": ClipboardList,
  "Hidratação": Droplets,
} as const;

/** B16: com frequência "a cada N horas" e um horário inicial, os demais
 *  horários do dia são derivados dele — o form precisa MOSTRÁ-los. */
function horariosDerivados(horario: string, frequencia: string): string[] {
  const m = frequencia.match(/a cada (8|12) horas/i);
  if (!m || !HORA.test(horario)) return [];
  const passo = Number(m[1]);
  const [h, min] = horario.split(":").map(Number);
  const lista: string[] = [];
  for (let t = h + passo; t < 24; t += passo) {
    lista.push(`${String(t).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return lista;
}

export function Lembretes() {
  const { lembretes, adicionarLembrete, alternarLembrete, removerLembrete } = useBion();
  const [modalNovo, setModalNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [horario, setHorario] = useState("08:00");
  const [tipo, setTipo] = useState<"Medicação" | "Consulta" | "Exame" | "Hidratação">("Medicação");
  const [frequencia, setFrequencia] = useState("Todos os dias");

  const [criando, setCriando] = useState(false);

  // A8: sucesso só depois da confirmação do servidor — em falha, o modal
  // fica aberto com o título preservado (o erro já virou toast no store).
  // F2: o toast anuncia o que foi GRAVADO, não o rótulo do formulário.
  // Intervalo ("A cada 12/8 horas") vira UM LEMBRETE POR HORÁRIO derivado,
  // todos "Todos os dias" — o modelo interno não tem frequência por
  // intervalo, e a API não converte mais nada em silêncio.
  const criarLembrete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || criando) return;
    // B16: mesma validação HORA do padrão do app (saude-paciente).
    if (!HORA.test(horario)) {
      toast.error("Informe um horário válido (ex.: 08:00).");
      return;
    }
    const derivados = horariosDerivados(horario, frequencia);
    const horarios = [horario, ...derivados];
    const frequenciaGravada = derivados.length ? "Todos os dias" : frequencia;
    setCriando(true);
    for (const h of horarios) {
      const ok = await adicionarLembrete({
        titulo: titulo.trim(),
        horario: h,
        tipo,
        frequencia: frequenciaGravada,
      });
      if (!ok) {
        setCriando(false);
        return;
      }
    }
    setCriando(false);
    const anuncio = derivados.length
      ? `às ${horarios.join(", ")} • ${frequencia.toLowerCase()}, todos os dias`
      : `às ${horario} • ${frequencia}`;
    toast.success(horarios.length > 1 ? "Lembretes criados" : "Lembrete criado", {
      description: `"${titulo.trim()}" ${anuncio}`,
    });
    setTitulo("");
    setModalNovo(false);
  };

  // F7: pendente = feito NÃO vigente hoje (o feito de ontem já venceu).
  const pendentes = lembretes.filter((i) => !resolverFeito({ feito: i.feito, feitoEm: feitoEmDe(i) })).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {/* F6: a tela se chamava "Lembretes & Alarmes", mas nada alarmava.
              Agora o job de avisos existe (pg_cron por minuto, como o toque
              da consulta): no horário, o lembrete vira notificação na
              central e push no celular inscrito. O nome para de prometer
              "alarme" e a linha abaixo diz o que acontece de verdade. */}
          <h1 className="text-3xl font-extrabold tracking-tight">Lembretes de Saúde</h1>
          <p className="text-muted-foreground mt-1">
            {/* B16: a contagem soma TODOS os pendentes (o lembrete não tem
                dia próprio) — o texto não promete mais que são "para hoje". */}
            {pendentes} lembrete{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            No horário marcado, você recebe uma notificação do BION aqui no app — e um aviso no celular, se os avisos do BION estiverem ativados nas configurações do aparelho.
          </p>
        </div>
        <button type="button"
          onClick={() => setModalNovo(true)}
          className="px-5 py-3 rounded-2xl text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center gap-1.5 self-start sm:self-auto"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Plus className="w-4 h-4" /> Criar Lembrete
        </button>
      </div>

      <div className="space-y-2.5">
        {lembretes.length === 0 && (
          <EstadoVazio
            titulo="Nenhum lembrete ainda"
            descricao="Crie lembretes de medicamentos, exames ou consultas para não perder o horário. No horário marcado, o BION avisa você com uma notificação."
          />
        )}
        {lembretes.map((l) => {
          const IconeTipo = ICONE_TIPO[l.tipo] ?? Pill;
          // F7: riscado/opaco só enquanto o feito de HOJE está vigente.
          const feito = resolverFeito({ feito: l.feito, feitoEm: feitoEmDe(l) });
          return (
          <div
            key={l.id}
            className={`bg-card border rounded-3xl p-4 flex items-center justify-between gap-4 shadow-sm transition ${
              feito ? "opacity-55" : ""
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
              <IconeTipo className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm text-foreground ${feito ? "line-through" : ""}`}>
                {l.titulo}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <Clock className="w-3.5 h-3.5" /> {l.horario}
                {horariosDerivados(l.horario, l.frequencia).length > 0
                  ? `, ${horariosDerivados(l.horario, l.frequencia).join(", ")}`
                  : ""}{" "}
                • {l.frequencia}
                <span className="px-2 py-0.5 rounded-lg bg-muted text-xs font-bold">
                  {l.tipo}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => alternarLembrete(l.id)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${
                  feito
                    ? "bg-emerald-500 dark:bg-emerald-600 text-white border-transparent"
                    : "border-border hover:border-primary"
                }`}
                title={feito ? "Marcar como pendente" : "Marcar como tomado/concluído"}
              >
                <Check className="w-4 h-4" />
              </button>
              <button type="button"
                onClick={() => {
                  removerLembrete(l.id);
                  toast.info("Lembrete removido");
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-muted transition"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {modalNovo && (
        <ModalBion
          aberto
          onFechar={() => setModalNovo(false)}
          titulo="Novo Lembrete de Saúde"
          largura="max-w-md"
          className="py-4"
        >
          <form
            onSubmit={criarLembrete}
            className="bg-card border rounded-3xl w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold">Novo Lembrete de Saúde</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Título / Medicamento</label>
                <input
                  aria-label="Título / Medicamento"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Losartana 50mg, Beber água, Medir Pressão"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Horário</label>
                  <input
                  aria-label="Horário"
                    type="time"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof tipo)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                  >
                    <option value="Medicação">Medicação</option>
                    <option value="Consulta">Consulta</option>
                    <option value="Exame">Exame</option>
                    <option value="Hidratação">Hidratação</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Frequência</label>
                {/* F2: os valores de dias/semana são as frequências
                    canônicas que a API grava de verdade (nada de alias
                    convertido em silêncio); os intervalos viram um
                    lembrete por horário derivado ao salvar. */}
                <select
                  value={frequencia}
                  onChange={(e) => setFrequencia(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                >
                  <option value="Todos os dias">Todos os dias</option>
                  <option value="Dias úteis">Dias úteis (segunda a sexta)</option>
                  <option value="A cada 12 horas">A cada 12 horas</option>
                  <option value="A cada 8 horas">A cada 8 horas</option>
                  <option value="Semanal">Semanalmente</option>
                </select>
                {/* B16+F2: frequência de intervalo — mostra os demais
                    horários derivados e diz o que será criado de verdade:
                    um lembrete diário para cada horário. */}
                {horariosDerivados(horario, frequencia).length > 0 && (
                  <p className="mt-1.5 text-muted-foreground">
                    Também às {horariosDerivados(horario, frequencia).join(", ")} — será criado um lembrete diário para cada horário.
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={criando}
              className="w-full py-3 rounded-2xl text-primary-foreground font-bold text-xs disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {criando ? "Salvando…" : "Salvar Lembrete"}
            </button>
          </form>
        </ModalBion>
      )}
    </div>
  );
}

