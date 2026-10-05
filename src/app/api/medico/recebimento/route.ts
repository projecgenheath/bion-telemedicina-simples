import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  ROTULO_TITULAR_TIPO,
  ehTitularTipo,
  recebimentoIgual,
  recebimentoWire,
  resumoChaveMascarada,
  validarRecebimento,
} from "@/lib/server/recebimento";

/** Teto do corpo (texto JSON) — 5 campos curtos. */
const CORPO_MAX_CHARS = 4_000;

const SELECAO = {
  pixTipo: true,
  pixChave: true,
  titularTipo: true,
  titularNome: true,
  titularDocumento: true,
  atualizadoEm: true,
} as const;

function naoEncontrado() {
  return Response.json({ erro: "Perfil de médico não encontrado." }, { status: 404 });
}

/**
 * GET /api/medico/recebimento — chave PIX de recebimento do PRÓPRIO médico
 * (repasse diário). Devolve só MÁSCARAS (chave e documento), nunca o valor
 * completo; `recebimento: null` se ainda não cadastrou.
 * `perfilTemCnpj`: o titular PJ só é aceito com o CNPJ do PerfilMedico.
 *
 * Privacidade: "DadosRecebimentoMedico" não entra no bootstrap, no
 * medicoWire nem no consultaWire. Acesso: só MEDICO, sempre a própria linha
 * (medicoId da sessão; sem id na URL) — admin/paciente → 403.
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const [perfil, linha] = await Promise.all([
      db.perfilMedico.findUnique({ where: { userId: medico.id }, select: { cnpj: true } }),
      db.dadosRecebimentoMedico.findUnique({ where: { medicoId: medico.id }, select: SELECAO }),
    ]);
    if (!perfil) return naoEncontrado();
    return ok({ recebimento: linha ? recebimentoWire(linha) : null, perfilTemCnpj: perfil.cnpj !== "" });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * PUT /api/medico/recebimento — cria ou troca a chave PIX do próprio médico.
 * Corpo: { pixTipo, pixChave, titularTipo, titularNome, titularDocumento }
 * (todos obrigatórios; chave desconhecida → 400). Erro de validação →
 * 400 { erro, campo }. Sem mudança → 200 sem gravar nem auditar.
 * Auditoria RECEBIMENTO_PIX_ALTERADO (warning) com antes/depois MASCARADOS.
 */
export async function PUT(req: NextRequest) {
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

    const perfil = await db.perfilMedico.findUnique({ where: { userId: medico.id }, select: { cnpj: true } });
    if (!perfil) return naoEncontrado();

    const validacao = validarRecebimento(corpo, { cnpjPerfil: perfil.cnpj });
    if (!validacao.ok) {
      return Response.json({ erro: validacao.erro, campo: validacao.campo }, { status: 400 });
    }
    const dados = validacao.valor;

    const antes = await db.dadosRecebimentoMedico.findUnique({ where: { medicoId: medico.id }, select: SELECAO });
    if (antes && recebimentoIgual(dados, antes)) {
      return ok({ recebimento: recebimentoWire(antes), perfilTemCnpj: perfil.cnpj !== "", alterado: false });
    }

    let linha;
    try {
      linha = await db.dadosRecebimentoMedico.upsert({
        where: { medicoId: medico.id },
        create: { medicoId: medico.id, ...dados },
        update: dados,
        select: SELECAO,
      });
    } catch (e) {
      // Dois PUTs simultâneos do primeiro cadastro: o segundo perde no único de medicoId.
      if ((e as { code?: string }).code === "P2002") {
        return Response.json({ erro: "A chave foi alterada ao mesmo tempo em outra tela. Tente de novo." }, { status: 409 });
      }
      throw e;
    }

    const titular = (t: string) => (ehTitularTipo(t) ? ROTULO_TITULAR_TIPO[t] : t);
    await aplicarSideEffects(medico, undefined, {
      acao: "RECEBIMENTO_PIX_ALTERADO",
      categoria: "usuario",
      severidade: "warning",
      entidade: "medico",
      entidadeId: medico.id,
      detalhes:
        `Chave PIX de recebimento ${antes ? "alterada" : "cadastrada"}: ` +
        `${antes ? `${resumoChaveMascarada(antes)} (${titular(antes.titularTipo)})` : "nenhuma"} → ` +
        `${resumoChaveMascarada(linha)} (${titular(linha.titularTipo)})`,
    });

    return ok({ recebimento: recebimentoWire(linha), perfilTemCnpj: perfil.cnpj !== "", alterado: true });
  } catch (erro) {
    return falha(erro);
  }
}
