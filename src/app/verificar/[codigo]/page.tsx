"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Ban, ShieldAlert, WifiOff } from "lucide-react";

type ResultadoVerificacao = {
  valido: boolean;
  cancelado?: boolean;
  canceladoEm?: string;
  indisponivel?: boolean;
  tipo?: string;
  emitidoEm?: string;
  medico?: string;
  crm?: string;
};

/**
 * Página pública de verificação de documento (item 26 da auditoria de
 * melhorias médicas): é o destino do código impresso nas vias em PDF.
 * Mostra apenas tipo, data de emissão e médico emissor — nenhum dado
 * clínico nem do paciente — e deixa claro que o código prova a emissão
 * pela plataforma, não é assinatura digital ICP-Brasil.
 */
export default function VerificarDocumentoPage() {
  const params = useParams();
  const codigo = params.codigo as string;
  const [resultado, setResultado] = useState<ResultadoVerificacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Falha de REDE (sem sinal, servidor inacessível, resposta ilegível) NÃO é
  // veredito sobre o documento: tem estado próprio, distinto de "código não
  // reconhecido" — quem confere uma receita sem internet não pode receber
  // "trate como não verificado" por causa da própria conexão.
  const [falhaConexao, setFalhaConexao] = useState(false);

  const verificar = useCallback(() => {
    if (!codigo) return;
    setCarregando(true);
    setFalhaConexao(false);
    fetch(`/api/publico/verificar/${encodeURIComponent(codigo)}`)
      .then(async (r) => {
        // 429 (muitas tentativas) e 503 (sem segredo) não são "código inválido".
        if (r.status === 429 || r.status === 503) return { valido: false, indisponivel: true };
        return (await r.json()) as ResultadoVerificacao;
      })
      .then((j: ResultadoVerificacao) => setResultado(j))
      .catch(() => setFalhaConexao(true))
      .finally(() => setCarregando(false));
  }, [codigo]);

  useEffect(() => {
    verificar();
  }, [verificar]);

  return (
    <div className="min-h-screen bg-[#0a1f44] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white/10 rounded-3xl p-6">
          <p className="text-2xl font-black">BION</p>
          <h1 className="text-sm text-white/80 mb-6">Emissão confirmada pela plataforma</h1>

          {carregando ? (
            <p className="text-sm text-white/80">Conferindo o código…</p>
          ) : resultado?.indisponivel ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-amber-300">
                <WifiOff className="w-6 h-6" /> Verificação indisponível
              </p>
              <p className="text-sm text-white/85 mt-3">
                A verificação de documentos está indisponível neste ambiente no momento. Isso não
                é um veredito sobre a emissão do documento. Tente de novo mais tarde.
              </p>
            </div>
          ) : falhaConexao ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-amber-300">
                <WifiOff className="w-6 h-6" /> Não foi possível verificar agora
              </p>
              <p className="text-sm text-white/85 mt-3">
                A verificação não respondeu — verifique sua conexão e tente de novo. Isso não
                é um veredito sobre a emissão do documento: nenhum veredito foi emitido.
              </p>
              <button
                type="button"
                onClick={verificar}
                className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0a1f44] hover:bg-white/85 transition"
              >
                Tentar de novo
              </button>
            </div>
          ) : resultado?.cancelado ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-red-300">
                <Ban className="w-6 h-6" /> Documento cancelado
              </p>
              <p className="text-sm text-white/85 mt-3">
                Este documento foi emitido pela plataforma BION, mas foi CANCELADO pelo médico
                {resultado.canceladoEm
                  ? ` em ${new Date(resultado.canceladoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                  : ""}
                . A emissão pela plataforma é confirmada, mas o documento foi cancelado e não deve
                ser aceito.
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Tipo</dt>
                  <dd className="font-bold text-right">{resultado.tipo}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Médico emissor</dt>
                  <dd className="font-bold text-right">{resultado.medico}</dd>
                </div>
                {resultado.crm ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">CRM</dt>
                    <dd className="font-bold text-right">{resultado.crm}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : resultado?.valido ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-emerald-300">
                <BadgeCheck className="w-6 h-6" /> Emissão confirmada pela plataforma
              </p>
              <p className="text-sm text-white/85 mt-3">
                Este código corresponde a um documento emitido pela plataforma BION:
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Tipo</dt>
                  <dd className="font-bold text-right">{resultado.tipo}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Emitido em</dt>
                  <dd className="font-bold text-right">
                    {resultado.emitidoEm
                      ? new Date(resultado.emitidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Médico emissor</dt>
                  <dd className="font-bold text-right">{resultado.medico}</dd>
                </div>
                {resultado.crm ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">CRM</dt>
                    <dd className="font-bold text-right">{resultado.crm}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-xs text-white/65 mt-6">
                A confirmação indica apenas que o documento foi emitido pela plataforma e que o
                registro está íntegro. Ela não atesta a validade jurídica do documento, não
                substitui a assinatura digital qualificada (ICP-Brasil) quando esta for exigida, e,
                por privacidade, não exibe o conteúdo do documento nem dados do paciente.
              </p>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-red-300">
                <ShieldAlert className="w-6 h-6" /> Código não reconhecido
              </p>
              <p className="text-sm text-white/85 mt-3">
                Este código não corresponde a nenhum documento emitido pela plataforma BION. Confira
                se o código foi digitado exatamente como está na via impressa — se a divergência
                persistir, trate o documento como não verificado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
