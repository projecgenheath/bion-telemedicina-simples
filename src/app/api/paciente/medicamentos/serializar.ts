import type { MedicamentoEmUso } from "@prisma/client";
import { lerPosologia } from "@/lib/saude-paciente";

export function serializarMedicamento(m: MedicamentoEmUso & { lembretes?: { id: string }[] }) {
  return {
    id: m.id,
    nome: m.nome,
    dose: m.dose,
    via: m.via,
    posologia: lerPosologia(m.posologia),
    usoContinuo: m.usoContinuo,
    controlado: m.controlado,
    inicio: m.inicio.toISOString(),
    fim: m.fim?.toISOString() ?? null,
    ativo: m.ativo,
    origem: m.origem,
    documentoId: m.documentoId,
    lembretes: m.lembretes?.length ?? 0,
  };
}
