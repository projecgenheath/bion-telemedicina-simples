"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gavel, ShieldAlert } from "lucide-react";
import { ChipEstado } from "../ui/ChipEstado";
import { Esqueleto, EstadoErro } from "../ui/Estados";
import { chamarApi, useRecurso } from "../repasses/recurso";
import { useDadosAdmin } from "../dados";
import { brl, dataLonga, hora as horaDe } from "../tempo";
import { avisoMotivo, destaqueDinheiro, textoAvisos, textoConfirmacao, validarMotivoCorrecao, type DesfechoAlvo, type PlanoWire, type PreviaDesfechoWire } from "./desfecho";

const TOM_ATUAL: Record<string, "ok" | "atencao" | "critico" | "neutro"> = {
  realizada: "ok",
  falta_paciente: "atencao",
  falha_tecnica: "critico",
  falta_medico: "critico",
  sem_desfecho: "atencao",
  encerrada: "neutro",
};

/**
 * "Corrigir desfecho" (só admin; regras do Alisson: só o admin corrige o que
 * o sistema ou o médico marcou). Mostra o desfecho atual, os desfechos
 * possíveis com a PRÉVIA do servidor (efeito no dinheiro, no repasse e nos
 * avisos), pede o motivo e a confirmação explícita. Mexe com dinheiro: sem
 * gesto e sem "Desfazer" (corrigir de novo é outra correção, com outro motivo).
 * Funciona só com o id: abre também consultas fora das 500 carregadas (Fila).
 */
export function CorrigirDesfecho({
  consultaId,
  onVoltar,
  onCorrigido,
  onSujo,
}: {
  consultaId: string;
  onVoltar: () => void;
  onCorrigido: () => void;
  onSujo: (sujo: boolean) => void;
}) {
  const { atualizar } = useDadosAdmin();
  const previa = useRecurso<PreviaDesfechoWire>(`/api/admin/consultas/${encodeURIComponent(consultaId)}/corrigir-desfecho`);
  const [novo, setNovo] = useState<DesfechoAlvo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocouMotivo, setTocouMotivo] = useState(false);

  if (previa.carregando && !previa.dados) return <Esqueleto variante="lista" quantidade={3} rotulo="Calculando a prévia…" />;
  if (previa.erro && !previa.dados) return <EstadoErro mensagem={previa.erro} onTentar={previa.recarregar} />;
  const p = previa.dados;
  if (!p) return null;

  const ts = Date.parse(p.consulta.dataInicio);
  const opcaoSel = p.opcoes.find((o) => o.novo === novo) ?? null;
  const plano = opcaoSel?.ok ? opcaoSel.plano : null;
  const erroMotivo = validarMotivoCorrecao(motivo, p.motivoMin);
  const aviso = avisoMotivo(plano);
  const algumaPossivel = p.opcoes.some((o) => o.ok);
  const pronto = Boolean(plano) && !erroMotivo && entendi && !enviando;

  const escolher = (d: DesfechoAlvo) => {
    setNovo(d);
    setEntendi(false); // confirmação vale para UMA prévia: trocou o desfecho, confirma de novo
    setErro(null);
    onSujo(true);
  };

  const confirmar = async () => {
    if (!plano || erroMotivo || !entendi) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<{ jaAplicado: boolean; rotulo: string }>(`/api/admin/consultas/${encodeURIComponent(consultaId)}/corrigir-desfecho`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novo: plano.novo, motivo: motivo.trim(), esperado: p.atual }),
    });
    setEnviando(false);
    if (r.dados) {
      toast.success(r.dados.jaAplicado ? `A consulta já estava como "${r.dados.rotulo}".` : `Desfecho corrigido: ${r.dados.rotulo}.`);
      onSujo(false);
      void atualizar();
      onCorrigido();
      return;
    }
    setErro(r.erro);
    setEntendi(false);
    if (r.status === 409) previa.recarregar(); // o estado mudou: a prévia nova mostra o que vale agora
  };

  return (
    <div className="space-y-4">
      <div className="ba-card" data-denso="true" data-tom={TOM_ATUAL[p.atual] ?? "neutro"}>
        <p className="font-bold break-words">{p.consulta.paciente}</p>
        <p className="text-sm ba-texto-2 break-words">
          {dataLonga(ts)} às {horaDe(ts)} · {p.consulta.medico} · {p.consulta.especialidade}
          {p.consulta.pago ? ` · ${brl(Math.round(p.consulta.valor * 100))} pago` : " · não pago"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="ba-rotulo !text-[10px]">Desfecho atual</span>
          <ChipEstado estado={{ rotulo: p.rotuloAtual, tom: TOM_ATUAL[p.atual] ?? "neutro" }} />
        </div>
      </div>

      {!algumaPossivel ? (
        <div className="ba-aviso" data-tom="atencao" role="status">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{p.opcoes[0] && !p.opcoes[0].ok ? p.opcoes[0].erro : "Não há desfecho para corrigir nesta consulta."}</p>
        </div>
      ) : (
        <fieldset className="space-y-2">
          <legend className="ba-rotulo mb-1.5">Corrigir para</legend>
          {p.opcoes.map((o) => (
            <label
              key={o.novo}
              className={`ba-card ba-opcao flex items-start gap-3 ${o.ok ? "cursor-pointer" : "opacity-70"}`}
              data-denso="true"
              data-selecionada={novo === o.novo}
            >
              <input
                type="radio"
                name="novo-desfecho"
                value={o.novo}
                checked={novo === o.novo}
                disabled={!o.ok || enviando}
                onChange={() => escolher(o.novo)}
                className="mt-1 w-5 h-5 accent-[var(--ba-sinal)] shrink-0"
              />
              <span className="min-w-0">
                <span className="block font-bold">{o.rotulo}</span>
                {o.ok ? null : <span className="block text-xs ba-texto-2 mt-0.5 break-words">{o.erro}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {plano ? <PreviaPlano plano={plano} /> : null}

      {algumaPossivel ? (
        <label className="block">
          <span className="ba-rotulo">{aviso.vaiParaPaciente ? "Motivo da correção (auditoria e paciente)" : "Motivo da correção (fica na auditoria)"}</span>
          <textarea
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              onSujo(true);
            }}
            onBlur={() => setTocouMotivo(true)}
            maxLength={p.motivoMax}
            rows={3}
            placeholder="Ex.: o suporte confirmou que o paciente entrou e a consulta aconteceu."
            aria-invalid={tocouMotivo && Boolean(erroMotivo)}
            aria-describedby="motivo-desfecho-dica"
            className="ba-entrada mt-1 w-full !rounded-2xl py-2"
          />
          <span id="motivo-desfecho-dica" className={`block text-xs mt-1 ${tocouMotivo && erroMotivo ? "" : "ba-texto-3"}`} style={tocouMotivo && erroMotivo ? { color: "var(--ba-critico)" } : undefined}>
            {tocouMotivo && erroMotivo
              ? erroMotivo
              : erroMotivo
                ? `${motivo.trim().length} de ${p.motivoMin} caracteres no mínimo.`
                : `${motivo.trim().length} caracteres.`}{" "}
            {!(tocouMotivo && erroMotivo) ? (
              <span
                data-testid="aviso-motivo"
                className={aviso.vaiParaPaciente ? "font-semibold" : undefined}
                style={aviso.vaiParaPaciente ? { color: "var(--ba-atencao)" } : undefined}
              >
                {aviso.texto}
              </span>
            ) : null}
          </span>
        </label>
      ) : null}

      {plano ? (
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 accent-[var(--ba-sinal)] shrink-0"
            checked={entendi}
            disabled={enviando}
            onChange={(e) => {
              setEntendi(e.target.checked);
              onSujo(true);
            }}
          />
          <span>{textoConfirmacao(plano)}</span>
        </label>
      ) : null}

      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{erro}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button type="button" onClick={onVoltar} disabled={enviando} className="ba-botao ba-botao-secundario">
          Voltar
        </button>
        {algumaPossivel ? (
          <button type="button" onClick={() => void confirmar()} disabled={!pronto} className="ba-botao ba-botao-primario flex-1">
            <Gavel className="w-4 h-4" aria-hidden />
            {enviando ? "Corrigindo…" : "Corrigir desfecho"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Prévia do servidor: destaque do dinheiro + o que muda, frase por frase. */
function PreviaPlano({ plano }: { plano: PlanoWire }) {
  const d = destaqueDinheiro(plano.dinheiro);
  return (
    <section className="ba-card" data-denso="true" data-tom={d.tom} aria-labelledby="previa-desfecho-titulo" aria-live="polite">
      <h3 id="previa-desfecho-titulo" className="ba-rotulo">
        Prévia do efeito
      </h3>
      <p className="ba-numero text-3xl mt-1" style={d.tom === "neutro" ? undefined : { color: "var(--ba-tom)" }}>
        {d.valor}
      </p>
      <p className="text-sm ba-texto-2">{d.legenda}</p>
      <ul className="mt-3 space-y-1.5 text-sm list-disc pl-5">
        {plano.efeitos.map((e) => (
          <li key={e} className="break-words">
            {e}
          </li>
        ))}
        <li>{textoAvisos(plano)}</li>
      </ul>
    </section>
  );
}
