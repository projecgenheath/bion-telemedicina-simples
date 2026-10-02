import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { dataNascimentoParaIso } from "@/lib/idade";
import { validarPatchPerfilMedico } from "@/lib/server/validar-perfil-medico";
import { ehGeneroMedico, type DadosPessoaisMedico } from "@/components/bion/medico/dados-pessoais";

/** Teto do corpo (texto JSON) — 4 campos curtos. */
const CORPO_MAX_CHARS = 4_000;

const SELECAO = { dataNascimento: true, genero: true, telefone: true, cnpj: true } as const;

function wire(p: { dataNascimento: Date | null; genero: string | null; telefone: string; cnpj: string }): DadosPessoaisMedico {
  return {
    dataNascimento: dataNascimentoParaIso(p.dataNascimento),
    genero: ehGeneroMedico(p.genero) ? p.genero : null,
    telefone: p.telefone,
    cnpj: p.cnpj,
  };
}

function naoEncontrado() {
  return Response.json({ erro: "Perfil de médico não encontrado." }, { status: 404 });
}

/**
 * GET /api/medico/perfil — dados pessoais do PRÓPRIO médico da sessão
 * (data de nascimento, sexo, telefone, CNPJ).
 *
 * Privacidade: estes campos são PRIVADOS. Nunca entram no diretório público
 * de médicos (medicoWire / bootstrap / /api/medicos), que pacientes recebem.
 * Acesso: só MEDICO, sempre a própria linha (userId da sessão; sem id na URL).
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const perfil = await db.perfilMedico.findUnique({ where: { userId: medico.id }, select: SELECAO });
    if (!perfil) return naoEncontrado();
    return ok({ dados: wire(perfil) });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * PATCH /api/medico/perfil — atualiza os dados pessoais do próprio médico.
 * Corpo: subconjunto de { dataNascimento, genero, telefone, cnpj }; chaves
 * desconhecidas → 400. Erros de validação → 400 { erro, campo }.
 * Auditoria MEDICO_DADOS_PESSOAIS_ATUALIZADOS lista só os NOMES dos campos.
 */
export async function PATCH(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");

    const bruto = await req.text();
    if (bruto.length > CORPO_MAX_CHARS) {
      return Response.json({ erro: "Dados enviados excedem o tamanho permitido." }, { status: 413 });
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    const validacao = validarPatchPerfilMedico(corpo);
    if (!validacao.ok) {
      return Response.json({ erro: validacao.erro, campo: validacao.campo }, { status: 400 });
    }
    const { dados, campos } = validacao.valor;

    const existe = await db.perfilMedico.findUnique({ where: { userId: medico.id }, select: { id: true } });
    if (!existe) return naoEncontrado();

    const perfil = await db.perfilMedico.update({
      where: { userId: medico.id },
      data: dados,
      select: SELECAO,
    });

    await aplicarSideEffects(medico, undefined, {
      acao: "MEDICO_DADOS_PESSOAIS_ATUALIZADOS",
      categoria: "usuario",
      entidade: "medico",
      entidadeId: medico.id,
      detalhes: `Dados pessoais atualizados: ${campos.join(", ")}`,
    });

    return ok({ dados: wire(perfil) });
  } catch (erro) {
    return falha(erro);
  }
}
