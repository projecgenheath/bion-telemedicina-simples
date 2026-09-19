import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de consentimento LGPD.
 *  Paciente identificado por ID (sessão do próprio; ou ID informado por
 *  médico/admin — nunca por nome). Eventos gerados PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      finalidade: string;
      documentos: number;
      aceito: boolean;
      pacienteId?: string; // usado por médicos/admin ao registrar para um paciente
    };

    let pacienteId: string | null = null;
    if (usuario.role === "PACIENTE") {
      pacienteId = usuario.id;
    } else if (body.pacienteId) {
      const paciente = await db.user.findFirst({
        where: { id: body.pacienteId, role: "PACIENTE" },
        select: { id: true },
      });
      pacienteId = paciente?.id ?? null;
    }

    const registro = await db.consentimento.create({
      data: {
        pacienteId,
        quem: usuario.nome,
        perfil: usuario.role,
        finalidade: body.finalidade || "Geração de prontuário em PDF",
        documentos: Math.max(0, Math.round(body.documentos || 0)),
        aceito: !!body.aceito,
      },
    });

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "receita",
          titulo: registro.aceito ? "Consentimento registrado" : "Consentimento recusado",
          texto: registro.aceito
            ? `${usuario.nome} autorizou a geração do prontuário em PDF (${registro.documentos} documento(s)).`
            : `${usuario.nome} recusou o consentimento para gerar o prontuário em PDF.`,
          usuarioId: pacienteId ?? usuario.id,
        },
      ],
      {
        acao: "CONSENTIMENTO_REGISTRADO",
        categoria: "consentimento",
        severidade: registro.aceito ? "info" : "warning",
        entidade: "consentimento",
        entidadeId: registro.id,
        detalhes: `Consentimento ${registro.aceito ? "aceito" : "recusado"} por ${usuario.nome} para ${registro.finalidade} (${registro.documentos} documento(s))`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
