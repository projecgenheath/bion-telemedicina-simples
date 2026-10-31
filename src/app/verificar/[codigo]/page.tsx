"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, ShieldAlert } from "lucide-react";

type ResultadoVerificacao = {
  valido: boolean;
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

  useEffect(() => {
    if (!codigo) return;
    fetch(`/api/publico/verificar/${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((j: ResultadoVerificacao) => setResultado(j))
      .catch(() => setResultado({ valido: false }))
      .finally(() => setCarregando(false));
  }, [codigo]);

  return (
    <div className="min-h-screen bg-[#0a1f44] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white/10 rounded-3xl p-6">
          <p className="text-2xl font-black">BION</p>
          <p className="text-sm text-white/80 mb-6">Verificação de documento</p>

          {carregando ? (
            <p className="text-sm text-white/80">Conferindo o código…</p>
          ) : resultado?.valido ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-emerald-300">
                <BadgeCheck className="w-6 h-6" /> Documento válido
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
                A verificação confirma a emissão e a integridade do registro na plataforma. Ela não
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
