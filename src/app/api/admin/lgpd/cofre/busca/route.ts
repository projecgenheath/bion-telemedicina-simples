import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  decifrarIdentificacao,
  exigirChaveCofre,
  hashCpf,
  hashNome,
  normalizarCpf,
  normalizarNome,
  type IdentificacaoClara,
} from "@/lib/server/cofre";

const LIMITE_RESULTADOS = 20;
const LIMITE_ITENS_HISTORICO = 50;

/**
 * POST /api/admin/lgpd/cofre/busca — SOMENTE ADMIN (checado no servidor).
 * Reidentificação de paciente ANONIMIZADO por obrigação legal (ordem
 * judicial, ofício, pedido do titular). Corpo: { cpf? | nome?, motivo }.
 * Busca EXATA pelo hash HMAC (CPF só dígitos / nome sem acento, minúsculo),
 * sem descriptografar a tabela. Toda busca — com ou sem resultado — grava
 * AuditLog COFRE_CONSULTADO (crítica) com ator, motivo e ids encontrados;
 * o CPF/nome pesquisado NUNCA vai em texto claro para o log.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    exigirChaveCofre(); // 503 se a chave não estiver no servidor

    const body = (await req.json().catch(() => null)) as {
      cpf?: string;
      nome?: string;
      motivo?: string;
    } | null;
    const cpf = normalizarCpf(body?.cpf ?? "");
    const nome = normalizarNome(body?.nome ?? "");
    const motivoBruto = (body?.motivo ?? "").trim();

    if (motivoBruto.length < 5 || motivoBruto.length > 300) {
      return Response.json(
        { erro: "Informe o motivo da consulta (ex.: nº do processo/ofício), entre 5 e 300 caracteres." },
        { status: 400 },
      );
    }
    if ((cpf ? 1 : 0) + (nome ? 1 : 0) !== 1) {
      return Response.json({ erro: "Informe o CPF OU o nome completo (apenas um)." }, { status: 400 });
    }
    if (cpf && cpf.length !== 11) {
      return Response.json({ erro: "CPF deve ter 11 dígitos." }, { status: 400 });
    }
    if (nome && nome.length < 3) {
      return Response.json({ erro: "Informe o nome completo." }, { status: 400 });
    }

    const criterio = cpf ? "cpf" : "nome";
    const hash = cpf ? hashCpf(cpf) : hashNome(nome);
    const registros = hash
      ? await db.identificacaoCofre.findMany({
          where: cpf ? { cpfHash: hash } : { nomeHash: hash },
          orderBy: { createdAt: "desc" },
          take: LIMITE_RESULTADOS,
        })
      : [];

    const resultados = await Promise.all(
      registros.map(async (r) => {
        let identificacao: IdentificacaoClara | null = null;
        let erroDecifrar = false;
        try {
          identificacao = decifrarIdentificacao(r.userId, r.dadosCifrados);
        } catch {
          erroDecifrar = true; // chave trocada ou registro adulterado (GCM)
        }
        const [paciente, consultas, documentos, exames, nConsultas, nDocumentos, nExames, nAnamneses, nMedicoes, nArquivos] =
          await Promise.all([
            db.user.findUnique({ where: { id: r.userId }, select: { id: true, nome: true, status: true, createdAt: true } }),
            db.consulta.findMany({
              where: { pacienteId: r.userId },
              orderBy: { dataInicio: "desc" },
              take: LIMITE_ITENS_HISTORICO,
              select: { id: true, dataInicio: true, especialidade: true, status: true, medico: { select: { nome: true } } },
            }),
            db.documento.findMany({
              where: { pacienteId: r.userId },
              orderBy: { createdAt: "desc" },
              take: LIMITE_ITENS_HISTORICO,
              select: { id: true, tipo: true, titulo: true, createdAt: true },
            }),
            db.exameLaboratorial.findMany({
              where: { usuarioId: r.userId },
              orderBy: { dataColeta: "desc" },
              take: LIMITE_ITENS_HISTORICO,
              select: { id: true, titulo: true, dataColeta: true },
            }),
            db.consulta.count({ where: { pacienteId: r.userId } }),
            db.documento.count({ where: { pacienteId: r.userId } }),
            db.exameLaboratorial.count({ where: { usuarioId: r.userId } }),
            db.anamnese.count({ where: { usuarioId: r.userId } }),
            db.medicao.count({ where: { usuarioId: r.userId } }),
            db.arquivo.count({ where: { usuarioId: r.userId } }),
          ]);
        return {
          pacienteId: r.userId,
          pseudonimo: paciente?.nome ?? null,
          status: paciente?.status ?? null,
          cadastradoEm: paciente?.createdAt.toISOString() ?? null,
          guardadoNoCofreEm: r.createdAt.toISOString(),
          identificacao,
          erroDecifrar,
          historico: {
            contagem: {
              consultas: nConsultas,
              documentos: nDocumentos,
              exames: nExames,
              anamneses: nAnamneses,
              medicoes: nMedicoes,
              arquivos: nArquivos,
            },
            consultas: consultas.map((c) => ({
              id: c.id,
              data: c.dataInicio.toISOString(),
              especialidade: c.especialidade,
              medico: c.medico.nome,
              status: c.status,
            })),
            documentos: documentos.map((d) => ({
              id: d.id,
              tipo: d.tipo,
              titulo: d.titulo,
              data: d.createdAt.toISOString(),
            })),
            exames: exames.map((e) => ({ id: e.id, titulo: e.titulo, data: e.dataColeta.toISOString() })),
          },
        };
      }),
    );

    // Auditoria ANTES de devolver os dados: sem registro, sem resposta.
    // O termo pesquisado é omitido do motivo, caso o admin o tenha repetido ali.
    const termosOmitir = [body?.cpf?.trim() ?? "", cpf, body?.nome?.trim() ?? ""].filter((t) => t.length >= 3);
    let motivo = motivoBruto;
    for (const t of termosOmitir) motivo = motivo.split(t).join("[omitido]");
    const ids = resultados.map((r) => r.pacienteId);
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "COFRE_CONSULTADO",
      categoria: "admin",
      severidade: "critical",
      entidade: "paciente",
      ...(ids[0] ? { entidadeId: ids[0] } : {}),
      detalhes:
        `Busca no cofre de identificação por ${criterio} (termo não registrado). ` +
        `Motivo: ${motivo}. Resultados: ${ids.length}${ids.length ? ` (ids: ${ids.join(", ")})` : ""}.`,
    });

    return ok({ resultados, ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
