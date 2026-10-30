import "server-only";
import { registrarAudit, type UsuarioSessao } from "./auth";
import { usuarioSemNome } from "./audit-sem-nome";
import { carregarDados } from "./dados";

/* ------------------------------------------------------------------ */
/* B13 (auditoria da área do paciente) — Exportação/portabilidade dos  */
/* dados do PRÓPRIO paciente (LGPD art. 18, II e V).                   */
/*                                                                     */
/* Reusa o escopo do `carregarDados` (a mesma visibilidade do          */
/* bootstrap, já filtrada pela sessão), mas devolve SOMENTE uma        */
/* whitelist de coleções do próprio paciente: o retorno completo do    */
/* bootstrap inclui também o diretório de médicos, broadcasts e o      */
/* contato de suporte, que NÃO são dados pessoais do titular e ficam   */
/* fora do dossiê. Nenhum campo de credencial existe no wire do        */
/* `carregarDados` (nunca inclui senhaHash nem segredos).              */
/* ------------------------------------------------------------------ */

/**
 * Monta o dossiê exportável do paciente da sessão e registra a
 * exportação na auditoria (só id e contagens — nenhum dado clínico vai
 * para o `detalhes` do AuditLog).
 *
 * Pré-condição: `usuario` é o PACIENTE da própria sessão (a rota garante
 * com `exigirPapel("PACIENTE")`; o id nunca vem de parâmetro).
 */
export async function montarExportacaoPaciente(usuario: UsuarioSessao) {
  if (usuario.role !== "PACIENTE") {
    const err = new Error("Acesso negado") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  const dados = await carregarDados(usuario);

  const dossie = {
    formato: "bion-exportacao-paciente/v1",
    exportadoEm: new Date().toISOString(),
    baseLegal: "LGPD art. 18, II (acesso) e V (portabilidade)",
    titular: { id: dados.usuario.id, nome: dados.usuario.nome, email: dados.usuario.email },
    cadastro: dados.pacientePerfil,
    medicoes: dados.medicoes,
    exames: dados.exames,
    consultas: dados.consultas,
    anamneses: dados.anamneses,
    documentos: dados.documentos,
    // Metadados dos arquivos do paciente (o mesmo escopo de visibilidade
    // do bootstrap), sem o caminho interno de storage.
    arquivos: dados.arquivos.map((a) => ({
      id: a.id,
      nome: a.nome,
      tipo: a.tipo,
      tamanhoKb: a.tamanhoKb,
      enviadoPor: a.enviadoPor,
      consulta: a.consulta,
      pacienteId: a.pacienteId,
      createdAt: a.createdAt,
    })),
    mensagens: dados.mensagens,
    lembretes: dados.lembretes,
    consentimentos: dados.consentimentos,
    avaliacoes: dados.avaliacoes,
    // Só as notificações DIRIGIDAS a este paciente — broadcasts
    // (usuarioId nulo) são linhas compartilhadas e ficam fora.
    notificacoes: dados.notificacoes.filter((n) => n.usuarioId === usuario.id),
    chamadosSuporte: dados.tickets,
  };

  await registrarAudit(usuarioSemNome(usuario), {
    acao: "DADOS_PACIENTE_EXPORTADOS",
    categoria: "usuario",
    severidade: "warning",
    entidade: "paciente",
    entidadeId: usuario.id,
    detalhes: `Exportação LGPD (art. 18, II e V) em JSON pelo próprio paciente id ${usuario.id}: ${JSON.stringify({
      medicoes: dossie.medicoes.length,
      exames: dossie.exames.length,
      consultas: dossie.consultas.length,
      documentos: dossie.documentos.length,
      arquivos: dossie.arquivos.length,
      mensagens: dossie.mensagens.length,
      lembretes: dossie.lembretes.length,
      consentimentos: dossie.consentimentos.length,
    })}`,
  });

  return dossie;
}
