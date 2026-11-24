"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { BarraLateralPaciente } from "./inicio/BarraLateralPaciente";
import { BarraInferiorPaciente } from "./inicio/BarraInferiorPaciente";
import { destinoAtivoPaciente, destinoBarraPaciente } from "./inicio/destino";
import { poppinsPaciente } from "./inicio/fonte-paciente";
import "./paciente.css";
import "./paciente-v2.css";

/**
 * Moldura sem AppShell para telas abertas a partir do app do paciente
 * (Suporte, Termos e privacidade, Ajuda). Redesign (etapa 1): a mesma
 * navegação do app — menu lateral no computador e barra de baixo no
 * celular —, com "Ajuda" ativo no menu. Os itens levam de volta ao app
 * pelos links diretos (/paciente?tela=...).
 */
export function PacienteFrame({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { naoLidasMensagens } = useBion();
  const ir = (tela: string) => router.push(`/paciente?tela=${tela}`);
  const ativo = destinoAtivoPaciente({ painel: 1, secao: 0, pagina: "ajuda" });
  return (
    <div className={`bp-app-paciente bp2-app bp2-moldura ${poppinsPaciente.variable} min-h-dvh bp-painel text-bion-ink dark:text-bion-paper`}>
      <BarraLateralPaciente
        ativo={ativo}
        onInicio={() => ir("inicio")}
        onMensagens={() => ir("mensagens")}
        onSaude={() => ir("saude")}
        onExames={() => ir("exames")}
        onDocumentos={() => ir("documentos")}
        onAgendar={() => ir("agenda")}
        onPerfil={() => ir("perfil")}
        onAjuda={() => router.push("/ajuda")}
        onTermos={() => router.push("/privacidade")}
        onSuporte={() => router.push("/suporte")}
        naoLidas={naoLidasMensagens}
      />
      <header className="bp2-frame-topo sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.replace("/paciente?tela=perfil")}
          className="bp2-redondo bp2-redondo-topo bp2-frame-voltar"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
        </button>
        <h1 className="bp2-frame-titulo">{titulo}</h1>
      </header>
      <main className="p-4 max-w-2xl mx-auto">{children}</main>
      <BarraInferiorPaciente
        fixa
        ativo={destinoBarraPaciente(ativo)}
        onInicio={() => ir("inicio")}
        onSaude={() => ir("saude")}
        onAgendar={() => ir("agenda")}
        onExames={() => ir("exames")}
        onDocumentos={() => ir("documentos")}
        naoLidas={naoLidasMensagens}
      />
    </div>
  );
}
