"use client";

import { useState } from "react";
import { AlertTriangle, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { chamarApi } from "../repasses/recurso";
import { SheetAdmin } from "../ui/SheetAdmin";
import { TITULO_ACAO, codigoConfere, codigoConfirmacao, dataLgpd, explicacaoAcao, sucessoAcao, type PacienteLgpd, type TipoAcaoLgpd } from "./lgpd";

export type AcaoAberta = { tipo: TipoAcaoLgpd; paciente: PacienteLgpd };

/**
 * Anonimizar / anonimizar e arquivar — IRREVERSÍVEL, sempre por id do
 * paciente (POST /api/admin/lgpd). Confirmação explícita: digitar os 6
 * últimos caracteres do id + marcar "Entendi". Nunca por gesto; sem "Desfazer".
 */
export function AcaoLgpd({ acao, onFechar, onFeito }: { acao: AcaoAberta | null; onFechar: () => void; onFeito: () => void }) {
  return (
    <SheetAdmin
      aberto={Boolean(acao)}
      onFechar={onFechar}
      titulo={acao ? `${TITULO_ACAO[acao.tipo]} — ${acao.paciente.nome}` : "Ação LGPD"}
      descricao="Ação irreversível, registrada na auditoria."
    >
      {acao ? <Formulario key={`${acao.tipo}-${acao.paciente.id}`} acao={acao} onFechar={onFechar} onFeito={onFeito} /> : null}
    </SheetAdmin>
  );
}

function Formulario({ acao, onFechar, onFeito }: { acao: AcaoAberta; onFechar: () => void; onFeito: () => void }) {
  const { aplicarDelta } = useBion();
  const [codigo, setCodigo] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const p = acao.paciente;
  const esperado = codigoConfirmacao(p.id);
  const confere = codigoConfere(codigo, p.id);
  const Icone = acao.tipo === "anonimizar" ? EyeOff : Trash2;

  const confirmar = async () => {
    if (!confere || !entendi || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<Record<string, unknown>>("/api/admin/lgpd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: acao.tipo, pacienteId: p.id }),
    });
    setEnviando(false);
    if (!r.dados) {
      setErro(r.status === 404 ? "Paciente não encontrado. A lista pode estar desatualizada." : (r.erro ?? "Não foi possível concluir."));
      return;
    }
    aplicarDelta(r.dados);
    toast.success(sucessoAcao(acao.tipo));
    onFeito();
  };

  return (
    <div className="space-y-4">
      <dl className="ba-card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm" data-denso="true">
        <dt className="ba-texto-2">ID</dt>
        <dd className="font-mono text-xs break-all">{p.id}</dd>
        <dt className="ba-texto-2">E-mail</dt>
        <dd className="break-all">{p.emailMascarado}</dd>
        {p.cpfMascarado ? (
          <>
            <dt className="ba-texto-2">CPF</dt>
            <dd>{p.cpfMascarado}</dd>
          </>
        ) : null}
        <dt className="ba-texto-2">Cadastro</dt>
        <dd>{dataLgpd(p.cadastradoEm)}</dd>
        <dt className="ba-texto-2">Registros</dt>
        <dd>
          {p.consultas} consultas · {p.documentos} documentos · {p.arquivos} arquivos
        </dd>
      </dl>

      <div className="ba-aviso" data-tom="critico">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>
          <b>Isto não pode ser desfeito.</b> {explicacaoAcao(acao.tipo)}
        </p>
      </div>

      <div>
        <label htmlFor="lgpd-codigo" className="text-sm block">
          Para confirmar, digite os 6 últimos caracteres do ID: <b className="font-mono">{esperado}</b>
        </label>
        <input
          id="lgpd-codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="ba-entrada mt-1 font-mono"
          aria-describedby="lgpd-codigo-estado"
        />
        <p id="lgpd-codigo-estado" className="text-xs mt-1 ba-texto-2" aria-live="polite">
          {codigo ? (confere ? "Código confere." : "Ainda não confere.") : " "}
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-critico)]" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
        <span>Entendi que é definitivo e que o prontuário continua preservado, sem identificação.</span>
      </label>
      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onFechar} disabled={enviando} className="ba-botao ba-botao-secundario">
          Cancelar
        </button>
        <button type="button" onClick={() => void confirmar()} disabled={!confere || !entendi || enviando} className="ba-botao ba-botao-perigo flex-1">
          <Icone className="w-4 h-4" aria-hidden /> {enviando ? "Processando…" : TITULO_ACAO[acao.tipo]}
        </button>
      </div>
    </div>
  );
}
