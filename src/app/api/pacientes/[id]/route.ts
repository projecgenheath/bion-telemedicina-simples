import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, pacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { anonimizarPacienteCompleto, estaAnonimizado } from "@/lib/server/lgpd";
import { cpfEmUsoPorOutroPaciente } from "@/lib/server/cpf-paciente";
import {
  campoDuplicadoPrisma,
  ERRO_CPF_DUPLICADO_ADMIN,
  validarPacienteAdmin,
} from "@/lib/server/validar-paciente-admin";
import { dataNascimentoParaIso, idadeDeNascimento } from "@/lib/idade";

/**
 * Edição de paciente pela administração (nome propaga para consultas/documentos via FK).
 *
 * Validação (mesmos helpers do perfil do paciente — #8, ver
 * src/lib/server/validar-paciente-admin.ts): CPF válido e único entre
 * pacientes (409), telefone brasileiro com DDD, data de nascimento
 * "YYYY-MM-DD" (não futura, idade razoável; null limpa) gravada como dia de
 * calendário. Dado inválido => 400. CPF/telefone reenviados iguais ao valor
 * gravado não são revalidados (cadastro legado continua editável).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);

    const paciente = await db.user.findFirst({
      where: { id, role: "PACIENTE" },
      include: { perfilPaciente: true },
    });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }
    // LGPD: conta anonimizada é definitiva — não pode ser reativada nem
    // re-identificada (nome/CPF/telefone) pela edição.
    if (estaAnonimizado(paciente)) {
      return Response.json(
        { erro: "Conta anonimizada (LGPD): não pode ser reativada nem editada." },
        { status: 409 },
      );
    }

    const perfilAtual = paciente.perfilPaciente;
    const validacao = validarPacienteAdmin(body, {
      atual: { cpf: perfilAtual?.cpf ?? "", telefone: perfilAtual?.telefone ?? "" },
    });
    if (!validacao.ok) {
      return Response.json({ erro: validacao.erro, campo: validacao.campo }, { status: 400 });
    }
    const { dados, campos } = validacao.valor;
    if (!campos.length) {
      return Response.json({ erro: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    // Com data de nascimento gravada, a idade é DERIVADA — um `idade` enviado
    // sozinho é substituído pela idade calculada (igual ao PATCH /api/perfil).
    if (dados.idade !== undefined && dados.dataNascimento === undefined) {
      const iso = dataNascimentoParaIso(perfilAtual?.dataNascimento);
      const calculada = iso ? idadeDeNascimento(iso) : null;
      if (calculada !== null) dados.idade = calculada;
    }

    // CPF único entre pacientes: checagem prévia; a corrida fica com o índice
    // único do #8 (P2002 tratado abaixo).
    if (dados.cpf && (await cpfEmUsoPorOutroPaciente(dados.cpf, id))) {
      return Response.json({ erro: ERRO_CPF_DUPLICADO_ADMIN, campo: "cpf" }, { status: 409 });
    }

    const { nome, status, ...perfil } = dados;
    try {
      await db.$transaction([
        db.user.update({
          where: { id },
          data: {
            ...(nome !== undefined ? { nome } : {}),
            ...(status !== undefined ? { status } : {}),
          },
        }),
        db.perfilPaciente.upsert({
          where: { userId: id },
          update: perfil,
          create: {
            userId: id,
            telefone: perfil.telefone ?? "",
            cpf: perfil.cpf ?? "",
            idade: perfil.idade ?? 0,
            dataNascimento: perfil.dataNascimento ?? null,
            genero: perfil.genero ?? "",
            convenio: perfil.convenio ?? "Particular",
          },
        }),
      ]);
    } catch (erro) {
      if (campoDuplicadoPrisma(erro) === "cpf") {
        return Response.json({ erro: ERRO_CPF_DUPLICADO_ADMIN, campo: "cpf" }, { status: 409 });
      }
      throw erro;
    }

    // Contrato delta (auditoria FASE 2): devolve APENAS o paciente atualizado
    // + auditoria — sem recarregar o estado inteiro do admin.
    const efeitosPatch = await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_ATUALIZADO",
      categoria: "admin",
      entidade: "paciente",
      entidadeId: id,
      // Só os campos ACEITOS (não as chaves cruas do cliente).
      detalhes: `Paciente ${paciente.nome}: campos atualizados (${campos.join(", ")})`,
    });

    const atualizado = await db.user.findFirst({
      where: { id },
      include: { perfilPaciente: true },
    });

    return ok({ ...(atualizado ? { paciente: pacienteWire(atualizado) } : {}), ...efeitosPatch });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * P1 (2026-09) — o DELETE de paciente NÃO destrói mais o cadastro em cascata
 * (prontuário não pode ser destruído — CFM / Lei 13.787/2018). Passa a
 * arquivar + anonimizar cadastro/login (LGPD art. 12), preservando o registro
 * clínico pseudonimizado. Ver src/lib/server/lgpd.ts.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;

    const paciente = await db.user.findFirst({ where: { id, role: "PACIENTE" } });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }

    const r = await anonimizarPacienteCompleto(id);
    // Contrato delta (auditoria FASE 2): o registro (agora anonimizado/inativo)
    // substitui o anterior na lista — mesmo efeito do estado fresco, sem
    // recarregar o app inteiro.
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_ARQUIVADO_ANONIMIZADO",
      categoria: "admin",
      severidade: "critical",
      // Só o id — o nome real não vai para a auditoria (LGPD).
      detalhes:
        `Cadastro do paciente id ${id} arquivado e anonimizado; ` +
        `${r.arquivosPessoaisRemovidos} arquivo(s) pessoal(is) removido(s); ` +
        `prontuário preservado (LGPD art. 12 / Lei 13.787/2018)`,
      entidade: "paciente",
      entidadeId: id,
    });

    const anonimizado = await db.user.findFirst({
      where: { id },
      include: { perfilPaciente: true },
    });

    return ok({ ...(anonimizado ? { paciente: pacienteWire(anonimizado) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
