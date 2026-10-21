import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { estaAnonimizado } from "@/lib/server/lgpd";
import { dataNascimentoParaIso } from "@/lib/idade";

const CAMPOS = ["cpf", "telefone", "dataNascimento"] as const;
type CampoRevelavel = (typeof CAMPOS)[number];

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 300;

/**
 * POST — revela ao admin UM dado pessoal completo do paciente (CPF, telefone
 * ou data de nascimento), que por padrão chega mascarado no painel (LGPD,
 * minimização — ver pacienteWire em src/lib/server/dados.ts).
 *
 * Exige `motivo` (10–300 caracteres) e registra na auditoria quem viu, qual
 * campo e por quê — sem gravar o valor revelado. Conta anonimizada não revela
 * nada (a identificação fica só no cofre cifrado).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { campo?: unknown; motivo?: unknown } | null;

    const campo = body?.campo;
    if (typeof campo !== "string" || !CAMPOS.includes(campo as CampoRevelavel)) {
      return Response.json({ erro: "Campo inválido.", campo: "campo" }, { status: 400 });
    }
    const motivo = typeof body?.motivo === "string" ? body.motivo.replace(/\s+/g, " ").trim() : "";
    if (motivo.length < MOTIVO_MIN || motivo.length > MOTIVO_MAX) {
      return Response.json(
        { erro: `Informe o motivo (de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).`, campo: "motivo" },
        { status: 400 },
      );
    }

    const paciente = await db.user.findFirst({ where: { id, role: "PACIENTE" }, include: { perfilPaciente: true } });
    if (!paciente) return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    if (estaAnonimizado(paciente)) {
      return Response.json({ erro: "Conta anonimizada (LGPD): não há dado pessoal para revelar." }, { status: 409 });
    }

    const perfil = paciente.perfilPaciente;
    const valor =
      campo === "cpf"
        ? (perfil?.cpf ?? "")
        : campo === "telefone"
          ? (perfil?.telefone ?? "")
          : (dataNascimentoParaIso(perfil?.dataNascimento) ?? "");

    // Auditoria ANTES de devolver o dado: sem registro, sem revelação.
    await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_DADO_REVELADO",
      categoria: "admin",
      severidade: "warning",
      entidade: "paciente",
      entidadeId: id,
      // Nunca o valor revelado nem o nome — só o id, o campo e o motivo.
      detalhes: `Admin revelou ${campo} do paciente id ${id}. Motivo: ${motivo}`,
    });

    const resp = ok({ campo, valor });
    resp.headers.set("Cache-Control", "no-store");
    return resp;
  } catch (erro) {
    return falha(erro);
  }
}
