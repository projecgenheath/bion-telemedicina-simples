import type { Metadata } from "next";
import { PaginaDocumentoJuridico } from "@/components/bion/juridico/PaginaDocumentoJuridico";
import { VERSAO_PRIVACIDADE } from "@/lib/aceite-termos";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Política de Privacidade e de Cookies — BION" };

export default function PaginaPoliticaDePrivacidade() {
  return (
    <PaginaDocumentoJuridico
      versao={VERSAO_PRIVACIDADE}
      data="2026-10-27"
      arquivos={["03-politica-de-privacidade.md", "06-politica-de-cookies.md"]}
    />
  );
}
