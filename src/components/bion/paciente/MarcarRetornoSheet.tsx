"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import type { Consulta, Medico } from "@/lib/bion-tipos";
import { PRAZO_RETORNO_GRATIS_DIAS, escolherHorarioInicial, fimRetornoGratis, motivoSugerido, retornoEhGratis, ultimoDiaRetornoGratis } from "@/lib/atendimento-tipo";
import { agendaLivreDoMedico, type DiaAgenda } from "./agenda-medico";
import { useDiasBloqueados } from "./useDiasBloqueados";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { useArrastarFechar } from "./useArrastarFechar";

/**
 * "Marcar retorno" (Teleconsulta v2): mesma pessoa, mesmo médico, em poucos
 * toques. Já vem com o primeiro horário livre (a partir da data de retorno
 * sugerida pelo médico, quando existir) e com a queixa da consulta de origem.
 * A triagem é copiada da origem pelo servidor; o paciente só confirma ou edita.
 */
export function MarcarRetornoSheet({
  origem,
  retornoSugeridoEm,
  onFechar,
}: {
  origem: Consulta;
  /** ISO da data sugerida pelo médico (ainda não existe no banco: hoje vem null). */
  retornoSugeridoEm?: string | null;
  onFechar: () => void;
}) {
  const { medicos, consultas, adicionarConsulta } = useBion();
  const medico = medicos.find((m) => (origem.medicoId ? m.id === origem.medicoId : m.nome === origem.medico));
  const { bloqueados } = useDiasBloqueados(medico?.id);
  const agenda = useMemo(() => agendaLivreDoMedico(medico, consultas, undefined, 30, bloqueados), [medico, consultas, bloqueados]);
  // Só aviso: quem decide se é grátis é o servidor. Já existe retorno ativo
  // desta origem → o grátis (um por consulta) já foi usado.
  const jaUsouGratis = consultas.some((c) => c.consultaOrigemId === origem.id && c.tipoAtendimento === "retorno" && c.status !== "cancelada");
  return (
    <MarcarRetornoPainel
      jaUsouGratis={jaUsouGratis}
      origem={origem}
      medico={medico}
      agenda={agenda}
      retornoSugeridoEm={retornoSugeridoEm}
      onFechar={onFechar}
      onConfirmar={(m, data, hora, motivo) =>
        adicionarConsulta(
          { medico: m.nome, medicoId: m.id, especialidade: origem.especialidade, paciente: origem.paciente, data, hora, motivoConsulta: motivo },
          { tipoAtendimento: "retorno", consultaOrigemId: origem.id },
        )
      }
    />
  );
}

/** Parte visual (sem store), também usada no harness de screenshots. */
export function MarcarRetornoPainel({
  origem,
  medico,
  agenda,
  retornoSugeridoEm,
  onFechar,
  onConfirmar,
  jaUsouGratis = false,
}: {
  jaUsouGratis?: boolean;
  origem: Consulta;
  medico: Medico | undefined;
  agenda: DiaAgenda[];
  retornoSugeridoEm?: string | null;
  onFechar: () => void;
  onConfirmar: (medico: Medico, data: string, hora: string, motivo: string) => Promise<boolean>;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, raizRef);
  const painelRef = useRef<HTMLDivElement>(null);
  useArrastarFechar(painelRef, onFechar);
  const inicial = useMemo(() => escolherHorarioInicial(agenda, retornoSugeridoEm), [agenda, retornoSugeridoEm]);

  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [motivo, setMotivo] = useState(() => motivoSugerido("retorno", origem));
  const [enviando, setEnviando] = useState(false);

  const diaSel = agenda.find((d) => d.iso === (dia ?? inicial?.dia.iso)) ?? inicial?.dia;
  const horaSel = diaSel && hora && diaSel.horarios.includes(hora) ? hora : diaSel?.horarios[0];

  // Retorno grátis até 30 dias da consulta de origem (regra do servidor).
  const origemISO = origem.dataISO ?? null;
  const gratisAte = origemISO && !jaUsouGratis && Date.now() < fimRetornoGratis(origemISO).getTime() ? ultimoDiaRetornoGratis(origemISO) : null;
  const instanteSel = diaSel && horaSel ? new Date(`${diaSel.iso}T${horaSel}:00-03:00`) : null;
  const gratis = !!(origemISO && instanteSel && retornoEhGratis(origemISO, instanteSel, jaUsouGratis));
  // Por que este retorno é cobrado (só quando a origem tem data conhecida).
  const avisoCobrado = !origemISO
    ? null
    : jaUsouGratis
      ? "O retorno grátis desta consulta já foi usado. Este retorno é cobrado."
      : Date.now() >= fimRetornoGratis(origemISO).getTime()
        ? `O retorno grátis vale até ${PRAZO_RETORNO_GRATIS_DIAS} dias após a consulta. Este retorno é cobrado.`
        : null;
  const preco = medico ? `R$ ${medico.valor.toFixed(2).replace(".", ",")}` : null;

  async function confirmar() {
    if (!medico || !diaSel || !horaSel) return;
    setEnviando(true);
    const ok = await onConfirmar(medico, diaSel.iso, horaSel, motivo.trim() || motivoSugerido("retorno", origem));
    setEnviando(false);
    if (ok) {
      toast.success(`Retorno marcado${gratis ? " (grátis)" : ""}: ${diaSel.rotulo} às ${horaSel}.`);
      onFechar();
    }
  }

  return (
    <div ref={raizRef} className="bpp-sheet-raiz absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-retorno">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={onFechar} />
      <div
        ref={painelRef} className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div data-arrastar className="-mx-5 -mt-3 mb-1 pt-3 pb-3 touch-none"><div className="mx-auto h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden /></div>
        <h2 data-arrastar id="titulo-retorno" className="text-lg font-bold">Marcar retorno</h2>
        <p className="text-sm bpp-sheet-suave mt-1">
          {origem.especialidade} com {origem.medico} · consulta de {origem.data}
        </p>

        {!medico ? (
          <p className="mt-4 text-sm">Este médico não está mais disponível. Agende uma consulta nova pela BION IA.</p>
        ) : agenda.length === 0 ? (
          <p className="mt-4 text-sm">{medico.nome} não tem horário livre nos próximos 30 dias. Tente mais tarde ou mande uma mensagem.</p>
        ) : (
          <>
            {retornoSugeridoEm ? (
              <p className="mt-3 text-xs font-semibold inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" aria-hidden /> O médico sugeriu o retorno a partir dessa data.</p>
            ) : null}
            <div className="mt-4 text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Dia</div>
            <div className="mt-2 flex gap-2 overflow-x-auto bp-coluna pb-1">
              {agenda.map((d) => (
                <button
                  type="button"
                  key={d.iso}
                  onClick={() => setDia(d.iso)}
                  aria-pressed={diaSel?.iso === d.iso}
                  className={`bpp-toque shrink-0 rounded-2xl px-3 py-2 min-h-11 text-left text-sm font-bold ${diaSel?.iso === d.iso ? "bp-acao" : "bp-glass"}`}
                >
                  <span className="block">{d.rotulo}</span>
                  <span className="block text-xs font-semibold opacity-80">{d.sub}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Horário</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {diaSel?.horarios.map((h) => (
                <button
                  type="button"
                  key={h}
                  onClick={() => setHora(h)}
                  aria-pressed={horaSel === h}
                  className={`bpp-toque rounded-full px-4 min-h-11 text-sm font-bold ${horaSel === h ? "bp-acao" : "bp-glass"}`}
                >
                  {h}
                </button>
              ))}
            </div>

            <label className="block mt-4 text-xs font-bold uppercase tracking-wider bpp-sheet-suave" htmlFor="motivo-retorno">Motivo</label>
            <textarea
              id="motivo-retorno"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
              rows={2}
              className="mt-2 w-full rounded-2xl bp-glass p-3 text-sm"
            />
            <p className="mt-2 text-xs bpp-sheet-suave inline-flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              Sua triagem já vem preenchida com as respostas da consulta anterior. Você só confirma ou corrige o que mudou.
            </p>

            {!gratis && avisoCobrado ? (
              <p className="mt-4 text-xs bpp-sheet-suave" data-teste="aviso-retorno-cobrado">{avisoCobrado}</p>
            ) : null}
            <p className={`${!gratis && avisoCobrado ? "mt-1" : "mt-4"} text-sm font-semibold`} data-teste="preco-retorno">
              {gratis
                ? `Retorno grátis até ${gratisAte ?? ultimoDiaRetornoGratis(origemISO!)} · sem pagamento`
                : gratisAte
                  ? `Retorno grátis até ${gratisAte}. Neste dia o valor é ${preco}.`
                  : `Valor da consulta: ${preco}`}
            </p>
            <button
              type="button"
              disabled={enviando || !horaSel}
              onClick={confirmar}
              className="bpp-toque bp-acao mt-5 w-full min-h-12 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
              Confirmar retorno{gratis ? " grátis" : ""} · {diaSel?.rotulo} às {horaSel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
