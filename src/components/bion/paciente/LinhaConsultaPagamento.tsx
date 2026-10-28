"use client";

import { FileText } from "lucide-react";
import type { Consulta } from "@/lib/bion-tipos";
import { CLASSE_ETIQUETA, rotuloHistorico } from "./etiqueta-consulta";
import { EtiquetaTipo } from "./tipo-atendimento-ui";
import { BotaoPagarStripe } from "./BotaoPagarStripe";

/**
 * Consulta vista pelo paciente com a nota fiscal opcional.
 * TODO(nota fiscal): o Admin vai criar a tabela NotaFiscal e a rota protegida
 * GET /api/consultas/[id]/nota-fiscal (sessão do paciente, nunca URL pública).
 * Quando existir, o servidor manda `temNotaFiscal: true` e o link aponta para
 * essa rota. Até lá o campo vem ausente e nada é inventado no cliente.
 */
export type ConsultaComNota = Consulta & { temNotaFiscal?: boolean };

const rotaNotaFiscal = (id: string) => `/api/consultas/${encodeURIComponent(id)}/nota-fiscal`;

/** Retorno sem cobrança (retorno grátis): não tem nota nem pagamento. */
export function ehRetornoGratis(c: Consulta): boolean {
  if (c.tipoAtendimento !== "retorno") return false;
  const n = Number((c.valor ?? "").replace(/[^\d,]/g, "").replace(",", "."));
  return !c.valor || !Number.isFinite(n) || n === 0;
}

/** Texto de pagamento sem repetir o status (ex.: "Aguardando pagamento" já diz que está pendente). */
function textoPagamento(c: Consulta, aguardandoPagamento: boolean): string | null {
  if (c.status === "cancelada") return null;
  if (ehRetornoGratis(c)) return "Retorno sem custo";
  if (aguardandoPagamento) return c.valor ?? null;
  if (c.pago) return c.valor ? `Pago · ${c.valor}` : "Pago";
  return c.valor ? `Pendente · ${c.valor}` : "Pagamento pendente";
}

/**
 * Linha única de "Consultas e pagamentos" (Perfil e "Ver tudo"):
 * especialidade · médico, data/hora, status da consulta e do pagamento,
 * e a nota fiscal das consultas pagas e realizadas.
 */
export function LinhaConsultaPagamento({
  c,
  detalhada = false,
}: {
  c: ConsultaComNota;
  detalhada?: boolean;
}) {
  const e = rotuloHistorico(c.status, c.pago);
  const aguardando = e.tom === "pagamento" && e.texto === "Aguardando pagamento";
  const pag = textoPagamento(c, aguardando);
  const mostraNota = c.status === "concluida" && c.pago === true && !ehRetornoGratis(c);

  return (
    // `.bpp-linha` centraliza os filhos (align-items: center, com especificidade maior que
    // `items-stretch`); por isso cada filho leva `w-full min-w-0`, senão a linha fica mais
    // larga que o card e corta dos dois lados no celular.
    <div className="bpp-linha flex-col items-stretch gap-1.5 min-w-0">
      <div className="w-full min-w-0 flex flex-wrap items-start gap-x-2 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <div className="text-sm font-semibold text-bion-ink dark:text-bion-paper truncate">{c.especialidade} · {c.medico}</div>
          {detalhada && <EtiquetaTipo consulta={c} className="mt-0.5" />}
          <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">{c.data} às {c.hora}</div>
        </div>
        <span className={`max-w-full text-xs font-bold px-2.5 py-1 rounded-full break-words sm:shrink-0 ${CLASSE_ETIQUETA[e.tom]}`}>
          {e.texto}
          {pag ? ` · ${pag}` : ""}
        </span>
      </div>
      {aguardando && c.status !== "cancelada" && !ehRetornoGratis(c) ? (
        <BotaoPagarStripe consultaId={c.id} className="self-start" />
      ) : null}
      {mostraNota ? (
        c.temNotaFiscal === true ? (
          <a
            href={rotaNotaFiscal(c.id)}
            target="_blank"
            rel="noopener"
            className="bpp-toque self-start max-w-full inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-bion-sea dark:text-sky-300 underline"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden /> Nota fiscal / recibo do médico
          </a>
        ) : (
          <span className="w-full min-w-0 break-words text-xs text-bion-ink/75 dark:text-bion-paper/75">Nota fiscal / recibo do médico · Aguardando nota do médico</span>
        )
      ) : null}
    </div>
  );
}
