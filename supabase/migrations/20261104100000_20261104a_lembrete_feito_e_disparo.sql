-- BION — Errinhos F6/F7 (auditoria de errinhos bobos, paciente-fluxos):
-- o "feito" do lembrete nunca resetava e nenhum lembrete disparava aviso.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NÃO adicione os campos ao model Lembrete em prisma/schema.prisma antes
-- de aplicar esta migração — o client gerado passaria a selecioná-los e
-- TODA leitura de Lembrete quebraria contra o banco sem as colunas.
-- O código que usa as colunas já está pronto e se protege: ele lê/grava por
-- tipos estruturais e o job de avisos (src/lib/server/lembretes-aviso.ts)
-- verifica a existência das colunas antes de rodar (sem elas, responde
-- "inativo" e nada quebra).
--
-- Desenho:
-- 1) `feitoEm` (quando o paciente marcou "feito"): o feito só vale para o
--    dia da clínica (America/Sao_Paulo) em que foi marcado — no dia
--    seguinte o lembrete volta a pendente na exibição (regra pura em
--    src/lib/lembrete-ciclo.ts), sem cron de reset e sem apagar histórico.
--    Registros antigos (feito=true, feitoEm NULL) voltam a pendente: é o
--    comportamento esperado de um checklist diário.
-- 2) `ultimoDisparoEm` (última vez que o job de avisos disparou para a
--    ocorrência): torna o job por minuto idempotente — cada ocorrência
--    (dia + horário) dispara no máximo uma vez.
--
-- Sem backfill: as duas colunas nascem NULL em todas as linhas.

ALTER TABLE "Lembrete" ADD COLUMN "feitoEm" TIMESTAMP(3);
ALTER TABLE "Lembrete" ADD COLUMN "ultimoDisparoEm" TIMESTAMP(3);
