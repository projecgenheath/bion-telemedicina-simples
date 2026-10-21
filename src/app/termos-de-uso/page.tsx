import type { Metadata } from "next";
import { PaginaDocumentoJuridico } from "@/components/bion/juridico/PaginaDocumentoJuridico";
import { VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Termos de Uso do Paciente — BION" };

export default function PaginaTermosDeUso() {
  return <PaginaDocumentoJuridico versao={VERSAO_TERMOS_PACIENTE} data="2026-10-20" arquivos={["01-termos-de-uso-paciente.md"]} />;
}
