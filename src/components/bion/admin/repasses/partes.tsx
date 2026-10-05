"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ChipEstado } from "../ui/ChipEstado";
import { estadoRepasse } from "../rotulos";
import { brl, competenciaCurta, hora, rotuloDia } from "../tempo";
import { formatarChavePix, formatarDocumento, rotuloPixTipo, rotuloTitular } from "./formatos";
import type { PixUsado, Recebimento, Totais } from "./tipos";

export const quando = (iso: string | null | undefined, agora: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? `${rotuloDia(t, agora)} às ${hora(t)}` : "—";
};

/** Avisos do recebimento. Âmbar: chave trocada < 24 h. Vermelho: CNPJ divergente ou sem chave (bloqueiam). */
export function AvisosRecebimento({ rec, compacto = false }: { rec: Recebimento | null; compacto?: boolean }) {
  const avisos: { tom: "critico" | "atencao"; titulo: string; texto: string }[] = [];
  if (!rec) avisos.push({ tom: "critico", titulo: "Sem chave PIX", texto: "O médico ainda não cadastrou a chave PIX. Não dá para pagar." });
  else {
    if (rec.cnpjDivergente)
      avisos.push({
        tom: "critico",
        titulo: "CNPJ divergente: pagamento bloqueado",
        texto: "A conta PIX é de pessoa jurídica, mas o CNPJ dela não é o CNPJ do perfil do médico. Peça para ele atualizar o recebimento.",
      });
    if (rec.chaveTrocadaRecente)
      avisos.push({
        tom: "atencao",
        titulo: "Chave PIX trocada nas últimas 24 h",
        texto: "Confirme a troca com o médico por outro canal antes de pagar.",
      });
  }
  if (!avisos.length) return null;
  return (
    <div className="space-y-2">
      {avisos.map((a) => (
        <div key={a.titulo} className="ba-aviso" data-tom={a.tom} role={a.tom === "critico" ? "alert" : "status"}>
          {a.tom === "critico" ? <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />}
          <div className="min-w-0">
            <p className="font-bold">{a.titulo}</p>
            {compacto ? null : <p className="mt-0.5">{a.texto}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chave PIX completa (só o admin vê) com botão copiar. */
export function ChavePix({ tipo, chave, grande = false }: { tipo: string | null | undefined; chave: string | null | undefined; grande?: boolean }) {
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(String(chave ?? ""));
      setCopiada(true);
      toast.success("Chave PIX copiada");
      window.setTimeout(() => setCopiada(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione a chave e copie manualmente.");
    }
  };
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="ba-rotulo !text-[10px]">{rotuloPixTipo(tipo)}</p>
        <p className={`font-mono font-bold break-all select-all ${grande ? "text-lg" : "text-sm"}`}>{formatarChavePix(tipo, chave)}</p>
      </div>
      {chave ? (
        <button type="button" onClick={() => void copiar()} className="ba-icone-botao !w-9 !h-9 shrink-0" aria-label="Copiar chave PIX">
          {copiada ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}

export function Titular({ rec, cnpjPerfil }: { rec: Recebimento | PixUsado; cnpjPerfil?: string | null }) {
  const tipo = "titularTipo" in rec ? rec.titularTipo : null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="ba-texto-2">Titular</dt>
      <dd className="font-bold break-words">{rec.titularNome || "—"}</dd>
      {tipo ? (
        <>
          <dt className="ba-texto-2">Tipo</dt>
          <dd>{rotuloTitular(tipo)}</dd>
        </>
      ) : null}
      <dt className="ba-texto-2">{tipo === "pj" ? "CNPJ" : tipo === "pf" ? "CPF" : "Documento"}</dt>
      <dd className="font-mono">{formatarDocumento(rec.titularDocumento)}</dd>
      {cnpjPerfil || (cnpjPerfil !== undefined && tipo === "pj") ? (
        <>
          <dt className="ba-texto-2">CNPJ do perfil</dt>
          <dd className="font-mono">{cnpjPerfil ? formatarDocumento(cnpjPerfil) : "não cadastrado"}</dd>
        </>
      ) : null}
    </dl>
  );
}

/** Bruto → descontos → líquido (fórmula do servidor: bruto − comissão − taxas − reembolsos + multas − ajustes). */
export function Composicao({ t }: { t: Totais }) {
  const linhas: [string, number, "+" | "−" | ""][] = [
    ["Bruto das consultas", t.brutoCentavos, ""],
    ["Comissão do app", t.comissaoCentavos, "−"],
    ["Taxas do pagamento", t.taxasCentavos, "−"],
    ["Reembolsos", t.reembolsosCentavos, "−"],
    ["Multas recebidas", t.multasCentavos, "+"],
    ["Descontos de ajustes", t.ajustesCentavos, "−"],
  ];
  return (
    <dl className="text-sm">
      {linhas
        .filter(([, v, s]) => v !== 0 || s === "")
        .map(([r, v, s]) => (
          <div key={r} className="flex justify-between gap-3 py-1">
            <dt className="ba-texto-2">{r}</dt>
            <dd className="tabular-nums">
              {s === "−" ? "− " : s === "+" ? "+ " : ""}
              {brl(v)}
            </dd>
          </div>
        ))}
      <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-[color:var(--ba-borda)] font-bold">
        <dt>Líquido ao médico</dt>
        <dd className="tabular-nums">{brl(t.liquidoCentavos)}</dd>
      </div>
    </dl>
  );
}

export type DadosCard = {
  chave: string;
  medico: string;
  competencia: string;
  status: string; // "previa" | "fechado" | "pago"
  totais: Totais;
  itens: number;
  pix: { tipo: string | null; chave: string | null } | null;
  rec: Recebimento | null;
  linhaExtra?: string;
};

export function CardRepasse({ d, agora, onAbrir }: { d: DadosCard; agora: number; onAbrir?: () => void }) {
  const tom = d.status === "pago" ? "ok" : d.rec?.cnpjDivergente || (!d.rec && d.status !== "pago") ? "critico" : d.rec?.chaveTrocadaRecente ? "atencao" : "dinheiro";
  const corpo = (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold leading-snug break-words">{d.medico}</p>
          <p className="text-xs ba-texto-2">
            {d.status === "previa" ? "Prévia de hoje" : `Competência ${competenciaCurta(d.competencia, agora)}`} · {d.itens} {d.itens === 1 ? "item" : "itens"}
          </p>
        </div>
        <ChipEstado estado={estadoRepasse(d.status)} className="shrink-0" />
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <div className="ba-numero text-2xl">{brl(d.totais.liquidoCentavos)}</div>
          <p className="text-xs ba-texto-2">bruto {brl(d.totais.brutoCentavos)}</p>
        </div>
        {onAbrir ? <ChevronRight className="w-5 h-5 ba-texto-3 shrink-0" aria-hidden /> : null}
      </div>
      {d.pix?.chave ? (
        <p className="text-xs mt-2 break-all">
          <span className="ba-texto-2">{rotuloPixTipo(d.pix.tipo)}: </span>
          <span className="font-mono font-bold">{formatarChavePix(d.pix.tipo, d.pix.chave)}</span>
        </p>
      ) : null}
      {d.linhaExtra ? <p className="text-xs ba-texto-2 mt-1">{d.linhaExtra}</p> : null}
      {d.status !== "pago" ? (
        <div className="mt-2">
          <AvisosRecebimento rec={d.rec} compacto />
        </div>
      ) : null}
    </>
  );
  if (!onAbrir)
    return (
      <div className="ba-card" data-tom={tom} data-denso="true">
        {corpo}
      </div>
    );
  return (
    <button type="button" onClick={onAbrir} className="ba-card w-full text-left" data-tom={tom} data-denso="true">
      {corpo}
    </button>
  );
}

