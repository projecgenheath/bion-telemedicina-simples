"use client";

import { CalendarClock, FileChartColumn, LayoutGrid, MessageCircle, Plus, UserRound, UsersRound } from "lucide-react";
import type { ComponentType } from "react";
import type { DestinoMenu } from "./BarraLateralMedico";

type Item = {
  id: DestinoMenu;
  nome: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
  contador?: number;
};

/**
 * Etapa 5 — barra inferior do celular (ref. 03, telefone da esquerda):
 * ícones sem rótulo visível e o "+" azul em destaque no meio. Substitui a
 * pílula de pontos (Perfil · Início · Pacientes) sem perder nenhum desses
 * destinos e soma Mensagens (contador real de não lidas), Agenda e
 * Relatórios. Só abaixo de 1024 px (no computador quem navega é o menu
 * lateral). O item ativo é o mesmo `destinoAtivo` do menu lateral.
 */
export function BarraInferiorMedico({
  ativo,
  onInicio,
  onPacientes,
  onMensagens,
  onAcoes,
  acoesAbertas,
  onAgenda,
  onRelatorios,
  onPerfil,
  naoLidas,
}: {
  ativo: DestinoMenu | null;
  onInicio: () => void;
  onPacientes: () => void;
  onMensagens: () => void;
  onAcoes: () => void;
  acoesAbertas: boolean;
  onAgenda: () => void;
  onRelatorios: () => void;
  onPerfil: () => void;
  naoLidas: number;
}) {
  const esquerda: Item[] = [
    { id: "inicio", nome: "Início", Icone: LayoutGrid, onClick: onInicio },
    { id: "pacientes", nome: "Pacientes", Icone: UsersRound, onClick: onPacientes },
    { id: "mensagens", nome: "Mensagens", Icone: MessageCircle, onClick: onMensagens, contador: naoLidas },
  ];
  const direita: Item[] = [
    { id: "agenda", nome: "Agenda", Icone: CalendarClock, onClick: onAgenda },
    { id: "relatorios", nome: "Relatórios: gestão e receita", Icone: FileChartColumn, onClick: onRelatorios },
    { id: "configuracoes", nome: "Meu perfil e configurações", Icone: UserRound, onClick: onPerfil },
  ];
  const botao = (it: Item) => {
    const aqui = ativo === it.id;
    const nome = it.contador ? `${it.nome}: ${it.contador} não lida${it.contador > 1 ? "s" : ""}` : it.nome;
    return (
      <li key={it.id}>
        <button
          type="button"
          onClick={it.onClick}
          aria-label={nome}
          aria-current={aqui ? "page" : undefined}
          data-destino={it.id}
          className={`bm2-barra-item ${aqui ? "bm2-barra-ativo" : ""}`}
        >
          <it.Icone className="h-[22px] w-[22px]" aria-hidden />
          {it.contador ? (
            <span aria-hidden className="bm2-contador">
              {it.contador > 99 ? "99+" : it.contador}
            </span>
          ) : null}
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Navegação principal" className="bm-v2 bm2-barra">
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
            <Plus className="h-6 w-6" aria-hidden />
          </button>
        </li>
        {direita.map(botao)}
      </ul>
    </nav>
  );
}
