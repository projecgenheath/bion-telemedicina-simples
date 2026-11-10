import type { Metadata } from "next";
import { PaginaDocumentoJuridico } from "@/components/bion/juridico/PaginaDocumentoJuridico";
import { ARQUIVOS_TERMOS_MEDICO, VERSAO_TERMOS_MEDICO } from "@/lib/aceite-termos";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Termos de Uso do Médico — BION" };

/**
 * Mesmo documento e mesma versão do portão de aceite do médico
 * (GuardaAceiteTermos → VERSAO_TERMOS_MEDICO). A data e o número da versão
 * saem do id da versão: não há data fixa aqui para não divergir do aceite.
 */
export default function PaginaTermosMedico() {
  return <PaginaDocumentoJuridico versao={VERSAO_TERMOS_MEDICO} arquivos={ARQUIVOS_TERMOS_MEDICO} />;
}
