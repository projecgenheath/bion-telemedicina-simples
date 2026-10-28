import type { Metadata } from "next";
import { PaginaDocumentoJuridico } from "@/components/bion/juridico/PaginaDocumentoJuridico";
import { VERSAO_TERMOS_MEDICO } from "@/lib/aceite-termos";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Termos de Uso e Contrato de Intermediação do Médico — BION" };

export default function PaginaTermosMedico() {
  return (
    <PaginaDocumentoJuridico
      versao={VERSAO_TERMOS_MEDICO}
      data="2026-10-20"
      arquivos={["02-termos-medico-contrato-intermediacao.md"]}
    />
  );
}
