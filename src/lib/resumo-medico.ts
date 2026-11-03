/**
 * Resumo da consulta (Consulta.resumoMedico): o texto de "Evolução
 * Clínica" que o médico escreve na sala e que é gravado na conclusão.
 *
 * Teto ÚNICO, compartilhado pelo cliente (maxLength + contador da
 * textarea) e pelo servidor (400 claro ao concluir, SEM truncar): antes
 * o servidor cortava o resumo em 300 caracteres em silêncio e o médico
 * perdia o restante do registro sem saber. A coluna é String? (texto
 * livre no Postgres, sem limite), então o teto é regra de produto —
 * generoso de propósito, só para barrar abuso/erro, não a prática.
 */
export const LIMITE_RESUMO_MEDICO = 10_000;
