import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { aplicarSideEffects, consentimentoWire } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";

/** B5: finalidades aceitas — a notificação e o registro afirmam geração de
 *  prontuário em PDF; finalidade livre permitia registrar qualquer texto. */
const FINALIDADES_CONSENTIMENTO = [
  "Geração de prontuário em PDF",
  // Texto que o cliente atual (Prontuario.tsx) realmente envia.
  "Geração e download do prontuário em PDF",
] as const;
const MAX_DOCUMENTOS_CONSENTIMENTO = 500;
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";

/** Registro de consentimento LGPD.
 *  Paciente identificado por ID (sessão do próprio; ou ID informado por
 *  médico/admin — nunca por nome). Eventos gerados PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    // M9 (auditoria): teto por usuário — registrar consentimento é ato
    // ocasional (exportar prontuário, autorizar em nome de paciente);
    // 60/h atende a clínica movimentada e barra loop de registros forjados
    // em sequência a partir de uma conta autenticada.
    const teto = await limitarAsync(`consentimentos:${usuario.id}`, 60, 3_600_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    // B1: guarda de objeto/tipo — `Math.round` de documentos string virava
    // NaN e finalidade não-string quebrava o registro.
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      finalidade: textoDoCorpo(bruto.finalidade),
      documentos: typeof bruto.documentos === "number" && Number.isFinite(bruto.documentos) ? bruto.documentos : 0,
      aceito: bruto.aceito === true,
      pacienteId: textoDoCorpo(bruto.pacienteId), // usado por médicos/admin ao registrar para um paciente
    };

    // B5: finalidade com allowlist (ausente = padrão) e teto de documentos.
    const finalidade = body.finalidade?.trim() || "Geração de prontuário em PDF";
    if (!(FINALIDADES_CONSENTIMENTO as readonly string[]).includes(finalidade)) {
      return Response.json({ erro: "Finalidade de consentimento inválida." }, { status: 400 });
    }
    const documentos = Math.min(MAX_DOCUMENTOS_CONSENTIMENTO, Math.max(0, Math.round(body.documentos)));

    let pacienteId: string | null = null;
    if (usuario.role === "PACIENTE") {
      pacienteId = usuario.id;
    } else if (body.pacienteId) {
      const paciente = await db.user.findFirst({
        where: { id: body.pacienteId, role: "PACIENTE" },
        select: { id: true },
      });
      // HARDENING (V5): médico só registra consentimento EM NOME DE paciente
      // com quem tem vínculo assistencial (consulta não cancelada) — impede
      // registro LGPD forjado em conta de terceiro. Admin (operador) fica isento.
      if (paciente) {
        if (usuario.role === "MEDICO") {
          const vinculo = await db.consulta.findFirst({
            where: { medicoId: usuario.id, pacienteId: paciente.id, status: { not: "cancelada" } },
            select: { id: true },
          });
          if (!vinculo) {
            return Response.json(
              { erro: "Você só pode registrar consentimento de pacientes com consulta agendada ou realizada com você." },
              { status: 403 },
            );
          }
        }
        pacienteId = paciente.id;
      } else {
        // B5: pacienteId informado por MEDICO/ADMIN que não resolve era
        // gravado como órfão (pacienteId null) sem erro — agora é 404.
        return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
      }
    }

    const registro = await db.consentimento.create({
      data: {
        pacienteId,
        quem: usuario.nome,
        perfil: usuario.role,
        finalidade,
        documentos,
        aceito: body.aceito,
      },
      include: { paciente: { select: { nome: true } } },
    });

    // Contrato delta (auditoria FASE 2): devolve APENAS o consentimento criado
    // + efeitos — sem recarregar o estado inteiro.
    const efeitos = await aplicarSideEffects(
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

    return ok({ consentimento: consentimentoWire(registro), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
