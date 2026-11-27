# Contrato de dados — pagamento no lado do paciente (modelo de 21/11/2026)

Referência das regras: `C:/Users/Alisson/OpenBot/Shared/regras-pagamento-bion-2026-11.md`.
Este documento é o que a área do paciente precisa do motor de pagamento (Admin) para
ligar a chave `NEXT_PUBLIC_BION_PAGAMENTO_RETIDO=1`.

Enquanto a chave estiver desligada, nenhuma tela muda de comportamento e o app não
promete o modelo novo.

## 1. Marcação com valor retido

- A cobrança do cartão passa a cair na conta da plataforma (não na conta conectada do
  médico). Nenhuma mudança de contrato para a tela: o checkout continua o mesmo.
- A tela do passo de pagamento mostra o texto de retenção (`TEXTO_RETENCAO_NA_MARCACAO`
  em `src/lib/pagamento-paciente.ts`).
- O `Pagamento` precisa guardar o instante da liberação para o médico, para a tela de
  acompanhamento não inventar status. Proposta:
  - `Pagamento.liberadoEm DateTime?` — preenchido na transferência ao médico;
  - `Pagamento.reembolsadoEm DateTime?` — preenchido quando o estorno é enviado ao Stripe;
  - `Pagamento.motivoReembolso String?` — `falta_paciente_automatica` | `falta_medico` | `cancelamento`.
- A API pública da consulta (`GET /api/consultas`, `bion-tipos.ts` → `Consulta`) pode
  expor `pagamento: { retido: boolean; liberadoEm: string | null; reembolsadoEm: string | null }`.
  A tela só usa se existir; hoje ela não depende disso.

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
  Proposta de identificação: `Reembolso.origem = "falta_automatica"`, `status`
  `aprovado → processado`.
- `medicoRecebe()` (`src/lib/server/financeiro.ts`) passa a ser falso para
  `falta_paciente`, e a taxa do cartão não é devolvida (regra 6).
- `GET /api/consultas/[id]/reembolso` deve continuar respondendo `{ reembolso, podePedirAte }`
  e acrescentar `{ automatico: { ativo: boolean; prazo: string } }` para a tela saber que
  não há pedido a fazer. Sem esse campo a tela usa a chave de build.
- O pedido manual (`POST /api/consultas/[id]/reembolso`) fica só para consultas feitas
  antes da virada do modelo; para consultas do modelo novo, responde 409 com
  `{ erro: "O reembolso desta consulta é automático." }`.

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
