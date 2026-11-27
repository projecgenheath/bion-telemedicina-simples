# Contrato de dados — pagamento no lado do paciente (modelo de 21/11/2026)

Referências: `C:/Users/Alisson/OpenBot/Shared/regras-pagamento-bion-2026-11.md` e
`C:/Users/Alisson/OpenBot/Shared/contrato-api-pagamento-2111.md` (contrato fechado pelo
Presidente em 27/11). Este documento registra o que a área do paciente precisa do motor
de pagamento (Admin) para ligar a chave `NEXT_PUBLIC_BION_PAGAMENTO_RETIDO=1`.

Alinhamento com o Admin (27/11): cobrança na plataforma, transferência só depois de
`realizada`, cron de 7 dias corridos, `medicoRecebe` falso para `falta_paciente` e fim da
devolução da taxa do #137 estão em implementação no servidor. Os campos
`Pagamento.liberadoEm/reembolsadoEm/motivoReembolso` e `Reembolso.origem="falta_automatica"`
**não entram** — não estão no contrato fechado.

Enquanto a chave estiver desligada, nenhuma tela muda de comportamento e o app não
promete o modelo novo.

## 1. Marcação com valor retido

- A cobrança do cartão passa a cair na conta da plataforma (não na conta conectada do
  médico). Nenhuma mudança de contrato para a tela: o checkout continua o mesmo.
- A tela do passo de pagamento mostra o texto de retenção (`TEXTO_RETENCAO_NA_MARCACAO`
  em `src/lib/pagamento-paciente.ts`).
- Não há campo novo no `Pagamento` para a tela: a origem é o stripeCheckoutSessionId já
  existente, e a cobrança passa a cair na conta da plataforma (`Pagamento.stripeContaMedico`
  fica nulo neste modelo). A tela do passo de pagamento mostra o texto de retenção
  (`TEXTO_RETENCAO_NA_MARCACAO` em `src/lib/pagamento-paciente.ts`).

## 2. Falta do médico — remarcar com outro médico, sem nova cobrança e sem diferença

- Na espera de 10 minutos, quando o médico não entra, hoje `POST
  /api/telemedicina/[consultaId]/espera/remarcar` cobra a diferença de preço
  (`diferencaEsperadaCentavos`). No modelo novo:
  - `diferencaCentavos` de `GET /api/medicos/livres-agora?consultaId=…` deve vir `0`
    para consulta em falta do médico;
  - `POST .../espera/remarcar` não cria cobrança nem reembolso de diferença: só troca o
    médico da consulta e mantém a data;
  - `POST .../espera/cancelar` continua criando o reembolso integral automático.
- O médico que atende a remarcação recebe ao fim da consulta dele (regra 2), sobre o
  valor original, sem segunda taxa de processamento.

## 3. Falta do paciente — reembolso automático em 7 dias

- Um job do servidor (cron do Admin), sem pedido do paciente, cria o reembolso integral e
  envia o estorno ao Stripe quando `dataInicio + 7 dias` vence e não houve remarcação.
  A data fica em `Consulta.reembolsoAutomaticoEm` (campo do contrato fechado); não há
  `Reembolso.origem` novo.
- `medicoRecebe()` (`src/lib/server/financeiro.ts`) passa a ser falso para
  `falta_paciente`, e a taxa do cartão não é devolvida (regra 6).
- `GET /api/consultas/[id]/reembolso` mantém `{ reembolso, podePedirAte }` e acrescenta
  `{ automatico: { ativo: boolean; prazo: string } }`, lido de
  `Consulta.reembolsoAutomaticoEm`. A tela usa esse bloco quando a chave estiver ligada;
  com ele, o cartão de falta não pede justificativa ao paciente.
- **Decisão do Presidente (27/11) sobre `POST /api/consultas/[id]/reembolso`:**
  - com reembolso automático, continua **409** (não vira 200 nem 422), com texto exato:
    "O reembolso desta consulta é automático — você não precisa pedir. Ele é processado no mesmo cartão."
    e corpo com `motivo: "reembolso_automatico"` e
    `automatico: { processadoEm: ISO | null, previstoPara: ISO | null }`.
  - sem reembolso automático, o texto atual fica exatamente como está
    ("Já existe um pedido de reembolso para esta consulta.").
  - a checagem do automático entra em `pedirReembolsoManual` **antes** da checagem de
    desfecho, logo depois da checagem de dono (na falta do médico o desfecho não é
    `falta_paciente`; sem isso a rota responderia "O reembolso pelo app é só para
    consultas marcadas como falta", o que é mentira quando o reembolso é automático).
    Gatilho único: `Consulta.reembolsoAutomaticoEm` preenchido.
  - como o campo só é preenchido pelo servidor novo, com a chave desligada o
    comportamento é idêntico ao de hoje; sem flag extra nessa rota.
  - `GET /api/consultas/[id]/reembolso` devolve `automatico: { ativo, prazo }`, com
    `ativo = reembolsoAutomaticoEm != null` e `prazo` = data de processamento quando
    houver. A tela usa isso para trocar o botão por texto de acompanhamento, sem redesenho.

## 4. O que a área do paciente já entrega neste PR

- `src/lib/pagamento-paciente.ts`: chave única de build, prazo de 7 dias e textos do
  modelo novo.
- Passo de pagamento, cartão de falta e espera do médico usam esses textos só com a
  chave ligada.
- Testes das contas de prazo e dos textos em `src/lib/pagamento-paciente.teste.ts`.

## 5. Pendências que não são da área do paciente

- Transferência à conta do médico depois do desfecho `realizada` (regra 2).
- Estorno automático pelo Stripe e cancelamento da compra (regras 4 e 5).
- Remoção da devolução da taxa do #137 (regra 6).
- Telas administrativas e resposta sobre saldo pendente da Stripe (regra 8).
