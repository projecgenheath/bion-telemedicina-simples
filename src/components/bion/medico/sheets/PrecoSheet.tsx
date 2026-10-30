"use client";

import { useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import { faixaPrecosEspecialidade, fmtBRL } from "../metricas";
import { Campo, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

const VALOR_MIN = 1;
const VALOR_MAX = 5000;

/**
 * B-10: leitura de preço sem ambiguidade. Com VÍRGULA, o ponto é separador
 * de milhar ("1.234,56" → 1234.56). Sem vírgula, o ponto é decimal
 * ("1234.56" → 1234.56; "12.50" → 12.5, não 1250). Antes, todo ponto era
 * descartado como milhar, e "12.50" virava R$ 1.250.
 */
export function lerValorReais(texto: string): number {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return Number.NaN;
  const temVirgula = t.includes(",");
  const limpo = temVirgula
    ? t.replace(/\./g, "").replace(",", ".") // 1.234,56 → 1234.56
    : t.replace(/,/g, ""); // 1234.56 → 1234.56
  return Number.parseFloat(limpo);
}

export function PrecoSheet({
  aberto,
  onFechar,
  medico,
  confirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  medico: Medico;
  confirmar: Confirmar<number>;
}) {
  const { atualizarMedico, medicos } = useBion();
  // Referência de mercado INTERNA: faixa dos outros médicos ativos da mesma
  // especialidade no diretório que o cliente já carrega (o mesmo que o
  // paciente navega ao agendar). Com menos de 2 colegas, não vira "faixa".
  const faixa = faixaPrecosEspecialidade(medicos, medico.especialidade, medico.id);
  const [texto, setTexto] = useState(() => String(medico.valor).replace(".", ","));
  const [erro, setErro] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  // Prévia do valor que será salvo (o médico vê como o texto é interpretado).
  const previa = lerValorReais(texto);
  const previaValida = Number.isFinite(previa) && texto.trim() !== "";

  const salvar = async () => {
    const v = lerValorReais(texto);
    if (!Number.isFinite(v) || v < VALOR_MIN || v > VALOR_MAX) {
      setErro(`Informe um valor entre ${fmtBRL(VALOR_MIN)} e ${fmtBRL(VALOR_MAX)}.`);
      return;
    }
    const valor = Math.round(v * 100) / 100;
    setErro(undefined);
    setSalvando(true);
    atualizarMedico(medico.id, { valor });
    // Só fecha com a confirmação real (delta do servidor). Sem confirmação
    // em tempo, o sheet fica aberto com erro + retry, em vez de fechar
    // fingindo sucesso.
    const ok = await confirmar(valor, "Salvando preço…", `Preço atualizado para ${fmtBRL(valor)}`);
    setSalvando(false);
    if (ok) onFechar();
    else setErro("Não foi possível confirmar o salvamento. Verifique sua conexão e toque em Salvar novamente.");
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Preço da consulta"
      subtitulo={`Atual: ${fmtBRL(medico.valor)}. Vale para os próximos agendamentos.`}
    >
      <div className="space-y-4">
        <Campo
          rotulo="Novo valor (R$)"
          erro={erro}
          ajuda={
            previaValida
              ? `Será salvo: ${fmtBRL(Math.round(previa * 100) / 100)}. Consultas já agendadas mantêm o valor pago.`
              : "Consultas já agendadas mantêm o valor pago."
          }
        >
          <input
            inputMode="decimal"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setErro(undefined);
            }}
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Novo valor da consulta em reais"
          />
        </Campo>
        {faixa && faixa.n >= 2 ? (
          <div className="rounded-2xl bg-bion-ink/5 dark:bg-white/10 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70">
              Na sua especialidade ({medico.especialidade})
            </div>
            <div className="mt-1 text-sm">
              de <strong>{fmtBRL(faixa.min)}</strong> a <strong>{fmtBRL(faixa.max)}</strong> · mediana{" "}
              <strong>{fmtBRL(faixa.mediana)}</strong>
            </div>
            <div className="text-xs text-bion-ink/70 dark:text-bion-paper/70 mt-0.5">
              Preços de {faixa.n} outros médicos ativos na BION — referência, não sugestão.
            </div>
          </div>
        ) : null}
        <button type="button" onClick={salvar} disabled={salvando} className="bp-acao w-full py-3 text-sm disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar preço"}
        </button>
      </div>
    </SheetMedico>
  );
}
