import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { pacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  anonimizarPacienteCompleto,
  estaAnonimizado,
  mascararCpfLgpd,
  mascararEmail,
} from "@/lib/server/lgpd";

const LIMITE_LISTA = 50;

/**
 * GET — lista de pacientes para a tela Privacidade & LGPD, SEMPRE por id
 * (nunca agrupada por nome: homônimos aparecem separados). Traz só o mínimo
 * para identificar a pessoa com segurança na confirmação: id, e-mail e CPF
 * mascarados, data de cadastro e contagens. `?busca=` filtra por nome,
 * e-mail ou id; no máximo 50 por vez (mais recentes primeiro).
 */
export async function GET(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const busca = (req.nextUrl.searchParams.get("busca") ?? "").trim().slice(0, 120);

    const where = {
      role: "PACIENTE",
      ...(busca
        ? {
            OR: [
              { id: busca },
              { nome: { contains: busca, mode: "insensitive" as const } },
              { email: { contains: busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: LIMITE_LISTA,
        select: {
          id: true,
          nome: true,
          email: true,
          status: true,
          createdAt: true,
          perfilPaciente: { select: { cpf: true } },
          _count: {
            select: {
              consultasComoPaciente: true,
              documentosRecebidos: true,
              avaliacoes: true,
              arquivos: true,
            },
          },
        },
      }),
    ]);

    return ok({
      total,
      limite: LIMITE_LISTA,
      pacientes: rows.map((u) => ({
        id: u.id,
        nome: u.nome,
        emailMascarado: mascararEmail(u.email),
        cpfMascarado: mascararCpfLgpd(u.perfilPaciente?.cpf ?? ""),
        cadastradoEm: u.createdAt.toISOString(),
        status: u.status,
        anonimizado: estaAnonimizado(u),
        consultas: u._count.consultasComoPaciente,
        documentos: u._count.documentosRecebidos,
        avaliacoes: u._count.avaliacoes,
        arquivos: u._count.arquivos,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * Operações LGPD da administração (PrivacidadeAdmin), sempre por `pacienteId`:
 * - anonimizar: cadastro/login anonimizados, login removido do Supabase Auth,
 *   arquivos pessoais removidos do Storage; PRONTUÁRIO PRESERVADO e
 *   pseudonimizado (Lei 13.787/2018 — ver src/lib/server/lgpd.ts).
 * - excluir: NÃO destrói nada (prontuário não pode ser destruído); é a mesma
 *   anonimização + arquivamento da conta.
 * A auditoria desta operação registra só o id — nunca o nome real.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json()) as {
      acao: "anonimizar" | "excluir";
      pacienteId: string;
    };
    if (!body?.pacienteId || (body.acao !== "anonimizar" && body.acao !== "excluir")) {
      return Response.json({ erro: "Informe a ação e o id do paciente." }, { status: 400 });
    }

    const paciente = await db.user.findFirst({
      where: { id: body.pacienteId, role: "PACIENTE" },
      select: { id: true },
    });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }

    const r = await anonimizarPacienteCompleto(paciente.id);
    const { aplicarSideEffects } = await import("@/lib/server/dados");
    const resumo =
      `login Supabase ${r.loginSupabaseRemovido ? "removido" : "inexistente"}; ` +
      `${r.arquivosPessoaisRemovidos} arquivo(s) pessoal(is) removido(s), ` +
      `${r.arquivosClinicosPreservados} clínico(s) preservado(s); prontuário preservado (Lei 13.787/2018)` +
      (r.jaEstavaAnonimizado ? "; reexecução em conta já anonimizada" : "");
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: body.acao === "excluir" ? "PACIENTE_DADOS_ANONIMIZADOS_ARQUIVADOS" : "PACIENTE_ANONIMIZADO",
      categoria: "admin",
      severidade: "critical",
      detalhes:
        body.acao === "excluir"
          ? `Exclusão do paciente id ${paciente.id} convertida em anonimização LGPD + arquivamento: ${resumo}`
          : `Paciente id ${paciente.id} anonimizado (LGPD art. 12): ${resumo}`,
      entidade: "paciente",
      entidadeId: paciente.id,
    });

    const anonimizado = await db.user.findFirst({
      where: { id: paciente.id },
      include: { perfilPaciente: true },
    });

    return ok({ ...(anonimizado ? { paciente: pacienteWire(anonimizado) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
