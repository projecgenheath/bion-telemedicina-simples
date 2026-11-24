"use client";

import { ClipboardList, FileText, HeartPulse, LayoutGrid, Plus } from "lucide-react";
import type { ComponentType } from "react";
import type { DestinoBarra } from "./destino";

type Item = {
  id: DestinoBarra;
  nome: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
  contador?: number;
};

/**
 * Barra de baixo do celular — ref. 03 (telefone da esquerda), igual à do
 * médico: 5 itens encostados na borda (com a área segura), ícones de linha
 * fina sem rótulo e o "+" #76A1F3 com o sinal em #242424 (5,9:1).
 * Paciente: Início, Saúde, "+" (agenda própria do paciente), Exames, Documentos.
 * Mensagens e Perfil ficam nos botões redondos do topo, como na ref.
 * Só abaixo de 1024 px. `fixa`: nas páginas fora do app (Suporte, Termos,
 * Ajuda) a barra fica presa à janela em vez de absoluta na casca.
 */
export function BarraInferiorPaciente({
  ativo,
  onInicio,
  onSaude,
  onAgendar,
  agendarAberto = false,
  onExames,
  onDocumentos,
  naoLidas = 0,
  fixa = false,
}: {
  ativo: DestinoBarra | null;
  onInicio: () => void;
  onSaude: () => void;
  onAgendar: () => void;
  agendarAberto?: boolean;
  onExames: () => void;
  onDocumentos: () => void;
  /** Mensagens não lidas: ponto no ícone de Documentos (as conversas moram lá). */
  naoLidas?: number;
  fixa?: boolean;
}) {
  const esquerda: Item[] = [
    { id: "inicio", nome: "Início", Icone: LayoutGrid, onClick: onInicio },
    { id: "saude", nome: "Minha saúde", Icone: HeartPulse, onClick: onSaude },
  ];
  const direita: Item[] = [
    { id: "exames", nome: "Exames", Icone: ClipboardList, onClick: onExames },
    { id: "documentos", nome: "Documentos e mensagens", Icone: FileText, onClick: onDocumentos, contador: naoLidas },
  ];
  const botao = (it: Item) => {
    const aqui = ativo === it.id;
    const nome = it.contador ? `${it.nome}: ${it.contador} mensage${it.contador > 1 ? "ns" : "m"} não lida${it.contador > 1 ? "s" : ""}` : it.nome;
    return (
      <li key={it.id}>
        <button
          type="button"
          onClick={it.onClick}
          aria-label={nome}
          aria-current={aqui ? "page" : undefined}
          data-destino={it.id}
          className={`bp2-barra-item ${aqui ? "bp2-barra-ativo" : ""}`}
        >
          <it.Icone className="bp2-barra-icone" aria-hidden />
          {it.contador ? <span aria-hidden className="bp2-barra-ponto" /> : null}
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Navegação principal" className={`bp2-v2 bp2-barra ${fixa ? "bp2-barra-fixa" : ""}`}>
      <ul>
        {esquerda.map(botao)}
        <li>
          <button
            type="button"
            onClick={onAgendar}
            aria-label="Agendar consulta"
            aria-current={ativo === "agendar" || agendarAberto ? "page" : undefined}
            data-destino="agendar"
            className={`bp2-barra-mais ${ativo === "agendar" || agendarAberto ? "bp2-barra-mais-ativo" : ""}`}
          >
            <Plus className="bp2-barra-mais-icone" aria-hidden />
          </button>
        </li>
        {direita.map(botao)}
      </ul>
    </nav>
  );
}
