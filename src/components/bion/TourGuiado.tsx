"use client";

import { useState } from "react";
import { Calendar, Video, FileText, Users, TrendingUp, Shield, Sparkles, X } from "lucide-react";
import { ModalBion } from "@/components/bion/ModalBion";

type Role = "paciente" | "medico" | "admin";

type Passo = {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
};

const passos: Record<Role, Passo[]> = {
  paciente: [
    {
      icon: Sparkles,
      titulo: "Bem-vinda ao BION",
      texto:
        "Em poucos minutos você marca e faz sua consulta por vídeo, sem sair de casa. Vamos ver as telas principais?",
    },
    {
      icon: Calendar,
      titulo: "1. Agendar consulta",
      texto:
        "Toque em Agendar, escolha a especialidade, o médico e o horário. A confirmação é imediata.",
    },
    {
      icon: Video,
      titulo: "2. Entrar na consulta",
      texto:
        "No horário marcado, a sala de espera libera o botão de entrada. Câmera e microfone são testados antes.",
    },
    {
      icon: FileText,
      titulo: "3. Receitas e prontuário",
      texto:
        "Receitas, atestados e o histórico completo ficam salvos em Receitas e Prontuário, prontos para baixar.",
    },
  ],
  medico: [
    {
      icon: Sparkles,
      titulo: "Bem-vinda, doutora",
      texto: "Um tour rápido pelas telas que você mais vai usar no dia a dia de atendimento.",
    },
    {
      icon: Calendar,
      titulo: "1. Minha agenda",
      texto: "Veja os horários do dia, remarcações e cancelamentos atualizados em tempo real.",
    },
    {
      icon: Video,
      titulo: "2. Atendimento por vídeo",
      texto:
        "Durante a consulta você compartilha tela, recebe exames anexados e emite documentos na hora.",
    },
    {
      icon: TrendingUp,
      titulo: "3. Suas avaliações",
      texto:
        "Acompanhe a nota média, os comentários dos pacientes e a tendência ao longo dos meses.",
    },
  ],
  admin: [
    {
      icon: Sparkles,
      titulo: "Bem-vindo ao painel",
      texto: "Veja onde ficam a gestão de usuários, os indicadores e os controles de privacidade.",
    },
    {
      icon: Users,
      titulo: "1. Usuários & CRM",
      texto: "Aprove cadastros de médicos, valide CRM e suspenda contas quando necessário.",
    },
    {
      icon: TrendingUp,
      titulo: "2. Relatórios",
      texto:
        "Filtre por período, especialidade e médico, abra o detalhe de cada número e exporte em CSV ou PDF.",
    },
    {
      icon: Shield,
      titulo: "3. Privacidade & LGPD",
      texto:
        "Consulte os dados guardados de cada pessoa e faça anonimização ou exclusão com registro em auditoria.",
    },
  ],
};

const chave = (role: Role) => `bion-tour-${role}`;

export function TourGuiado({ role }: { role: Role }) {
  const [aberto, setAberto] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !localStorage.getItem(chave(role));
    } catch {
      return false;
    }
  });
  const [i, setI] = useState(0);

  const fechar = () => {
    try {
      localStorage.setItem(chave(role), "visto");
    } catch {
      /* ignora */
    }
    setAberto(false);
  };

  if (!aberto) return null;

  const lista = passos[role];
  const passo = lista[i];
  const ultimo = i === lista.length - 1;

  return (
    <ModalBion
      aberto
      onFechar={fechar}
      titulo={`Tour guiado — ${passo.titulo}`}
      largura="max-w-md"
      sheet
      overlay="bg-foreground/50 backdrop-blur-sm"
      foraFecha={false}
    >
      <div className="bg-card border rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5 sm:my-6">
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary flex items-center justify-center">
            <passo.icon className="w-6 h-6" />
          </div>
          <button
            onClick={fechar}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition"
            title="Fechar"
            aria-label="Fechar tour guiado"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-extrabold tracking-tight">{passo.titulo}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{passo.texto}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {lista.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={fechar}
            className="text-xs font-bold text-muted-foreground hover:text-foreground transition px-2 py-2"
          >
            Pular
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                onClick={() => setI((v) => v - 1)}
                className="px-4 py-2.5 rounded-2xl border text-xs font-bold hover:bg-muted transition"
              >
                Voltar
              </button>
            )}
            <button
              onClick={() => (ultimo ? fechar() : setI((v) => v + 1))}
              className="px-6 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:opacity-90 transition"
            >
              {ultimo ? "Começar a usar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </ModalBion>
  );
}
