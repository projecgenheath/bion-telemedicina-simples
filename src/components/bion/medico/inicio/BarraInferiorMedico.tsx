"use client";

import { CalendarClock, FileChartColumn, LayoutGrid, Plus, UsersRound } from "lucide-react";
import type { ComponentType } from "react";
import type { DestinoMenu } from "./BarraLateralMedico";

type Item = {
  id: DestinoMenu;
  nome: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
};

/**
 * Barra inferior do celular — ref. 03 (telefone da esquerda), rodada 2:
 * só os 5 itens da referência (Início, Pacientes, "+", Agenda, Relatórios),
 * encostada na borda de baixo (com a área segura), ícones de linha fina sem
 * rótulo e o "+" #76A1F3 com o sinal em #242424 (5,9:1). Mensagens e Perfil
 * ficam nos botões redondos do topo, como na ref. Só abaixo de 1024 px.
 * `naTela`: dentro de uma sobreposição (agenda, notificações) a barra entra
 * no fluxo, no rodapé do diálogo, em vez de ficar absoluta no app.
 */
export function BarraInferiorMedico({
  ativo,
  onInicio,
  onPacientes,
  onAcoes,
  acoesAbertas,
  onAgenda,
  onRelatorios,
  naTela = false,
}: {
  ativo: DestinoMenu | null;
  onInicio: () => void;
  onPacientes: () => void;
  onAcoes: () => void;
  acoesAbertas: boolean;
  onAgenda: () => void;
  onRelatorios: () => void;
  naTela?: boolean;
}) {
  const esquerda: Item[] = [
    { id: "inicio", nome: "Início", Icone: LayoutGrid, onClick: onInicio },
    { id: "pacientes", nome: "Pacientes", Icone: UsersRound, onClick: onPacientes },
  ];
  const direita: Item[] = [
    { id: "agenda", nome: "Agenda", Icone: CalendarClock, onClick: onAgenda },
    { id: "relatorios", nome: "Relatórios: gestão e receita", Icone: FileChartColumn, onClick: onRelatorios },
  ];
  const botao = (it: Item) => {
    const aqui = ativo === it.id;
    return (
      <li key={it.id}>
        <button
          type="button"
          onClick={it.onClick}
          aria-label={it.nome}
          aria-current={aqui ? "page" : undefined}
          data-destino={it.id}
          className={`bm2-barra-item ${aqui ? "bm2-barra-ativo" : ""}`}
        >
          <it.Icone className="bm2-barra-icone" aria-hidden />
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Navegação principal" className={`bm-v2 bm2-barra ${naTela ? "bm2-barra-na-tela" : ""}`}>
      <ul>
        {esquerda.map(botao)}
        <li>
          <button
            type="button"
            onClick={onAcoes}
            aria-label="Novo: receita, documento, medição ou horários"
            aria-haspopup="dialog"
            aria-expanded={acoesAbertas}
            className="bm2-barra-mais"
          >
            <Plus className="bm2-barra-mais-icone" aria-hidden />
          </button>
        </li>
        {direita.map(botao)}
      </ul>
    </nav>
  );
}
