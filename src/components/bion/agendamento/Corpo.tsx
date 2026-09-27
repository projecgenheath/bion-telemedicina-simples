"use client";

import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";
import { PassoEspecialidade } from "@/components/bion/agendamento/passos/PassoEspecialidade";
import { PassoMedico } from "@/components/bion/agendamento/passos/PassoMedico";
import { PassoData } from "@/components/bion/agendamento/passos/PassoData";
import { PassoHorario } from "@/components/bion/agendamento/passos/PassoHorario";
import { PassoMotivo } from "@/components/bion/agendamento/passos/PassoMotivo";
import { PassoAnexos } from "@/components/bion/agendamento/passos/PassoAnexos";
import { PassoPagamento } from "@/components/bion/agendamento/passos/PassoPagamento";
import { PassoConfirmacao } from "@/components/bion/agendamento/passos/PassoConfirmacao";

export type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";

export function AgendamentoCorpo(p: AgendamentoCorpoProps) {
  switch (p.step) {
    case 0:
      return <PassoEspecialidade {...p} />;
    case 1:
      return <PassoMedico {...p} />;
    case 2:
      return <PassoData {...p} />;
    case 3:
      return <PassoHorario {...p} />;
    case 4:
      return <PassoMotivo {...p} />;
    case 5:
      return <PassoAnexos {...p} />;
    case 6:
      return <PassoPagamento {...p} />;
    case 7:
      return <PassoConfirmacao {...p} />;
    default:
      return null;
  }
}
