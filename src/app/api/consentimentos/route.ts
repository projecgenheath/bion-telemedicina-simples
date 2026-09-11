import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, pacienteIdPorNome, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de consentimento LGPD. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      finalidade: string;
      documentos: number;
      aceito: boolean;
      paciente?: string; // usado por médicos/admin ao registrar para um paciente
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    let pacienteId: string | null = null;
    if (usuario.role === "PACIENTE") {
      pacienteId = usuario.id;
    } else if (body.paciente) {
      pacienteId = await pacienteIdPorNome(body.paciente);
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

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "CONSENTIMENTO_REGISTRADO",
        categoria: "consentimento",
        severidade: body.aceito ? "info" : "warning",
        detalhes: `Consentimento ${body.aceito ? "aceito" : "recusado"} para ${registro.finalidade} (${registro.documentos} documento(s))`,
      }),
      entidade: "consentimento",
      entidadeId: registro.id,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
