# Etapa 4, rodada 2: agenda, mensagens e sala do médico

Comparação ponto a ponto com as referências **07** (agenda), **06** (mensagens) e **03** (videochamada),
desentortadas para 1440×900 e 390×844, as mesmas da rodada 1. As comparações foram regeneradas:
`agenda-comparacao-1440/390.png`, `mensagens-comparacao-1440/390.png` e `video-comparacao-1440/390.png`.

## Agenda (ref. 07)

| Ponto | Ref. 07 | Antes (rodada 1) | Depois (rodada 2) |
|---|---|---|---|
| Altura da hora | 46,5 px (eventos de 1 h) | 56 px | **72 px**: a consulta real de 30 min vira um bloco de 34 px |
| Altura mínima do bloco | — | 22 px (linha única abaixo de 24 px) | **34 px**: sempre duas linhas, nome e horário |
| Largura sem conflito | coluna inteira | coluna inteira menos 4 px | coluna inteira menos 6 px (3 px de cada lado) |
| Conflito | — | dividia em partes iguais com o nome completo cortado ("Miguel…", "Guilhe…") | divide a coluna e mostra **primeiro nome + hora de início**; o nome completo e o intervalo ficam no rótulo acessível e na dica (`title`) |
| Bloco | raio 6, borda esquerda 3 px | raio 4, padding 1/6/1/8 | raio 6, borda 3 px, padding 5/4/4/8 e contorno de 1 px na cor do cartão, para separar blocos vizinhos |
| Nome | ~12 px, peso 500 | 12 px / 500, linha 13 | **12,5 px / 600**, linha 17 (sem corte de descendentes) |
| Horário | ~10 px, cinza, embaixo | 10 px, #555 | **11 px**, #4A4A4A, embaixo |
| Número do dia | grande e leve; hoje em azul com sublinhado | 18 px / 500 | **24 px / 300** (celular: 20 px); hoje em #2F62C4 / 400, com sublinhado de 2 px #76A1F3 |
| Nome do dia | 11 px, cinza | 11 px | 11 px / 400 |
| Coluna das horas | 10 px, cinza | 10 px, 14 px da borda | 11 px, 12 px da borda, alinhada à linha da hora |
| Linha do agora | linha fina em toda a largura, marcada na coluna de hoje | contínua, 1 px | **tracejada, 1 px**, em toda a semana; **sólida, 2 px**, na coluna de hoje, com ponto de 8 px; **etiqueta com a hora** (#76A1F3, texto #242424, 10 px / 600) na calha |
| Consultas de hoje | cartões coloridos, raio 8, nome 12 / 500, hora embaixo | padding 8/10, raio 7, mesma cor do evento | padding 8/12, raio 8, tons um pouco mais fortes (#E6EEFC, #EFEAFB, #FDE9DD); nome 12,5 / 500, hora 11 #4A4A4A |
| Faixa dos dias (celular) | — | 15 px / 500 | 20 px / 300 (o dia escolhido fica em 400) |
| Semana no celular | — | nome cortado | primeiro nome, sem reticências; em conflito fica só a cor, porque a coluna tem cerca de 50 px (o nome está no rótulo e na vista Dia) |

Regra mantida: **nada entre 23:00 e 00:00**. A faixa nunca passa de 23:00 e os blocos são cortados nesse
horário; os testes de `agenda-dados.teste.ts` seguem passando. Com a hora de 72 px, cabem cerca de 9 horas na
tela de 1440×900; na referência são 13.

## Mensagens (ref. 06)

| Ponto | Ref. 06 | Antes | Depois |
|---|---|---|---|
| Balão do paciente | azul bem claro, raio ~12 | #E3EDF9, raio 11, canto 4 embaixo | **#E8EFFC**, raio 12, canto 4 em cima (lado de quem fala), padding 10/15/11, 13 px, linha 20 |
| Balão do médico | azul forte, texto branco | #76A1F3, texto #242424 | igual: a paleta pede texto #242424 sobre azul, então não vai texto branco |
| Mensagens seguidas | juntas; só a última leva a hora | cada uma com a hora | **agrupadas** (mesma pessoa, até 5 min): 6 px entre os balões e a hora só no último (a hora completa continua para leitor de tela) |
| Hora | 9–10 px, sob o balão | colada à borda | 10,5 px, 6 px para dentro |
| Espaço entre grupos | ~14 px | 12 px | 14 px; padding do registro 16/22/14 |
| Termos em negrito | remédios em azul e negrito | — | **remédios do próprio paciente em negrito** (no balão do paciente também em #2F62C4, 4,9:1) |
| Lista: conversa ativa | anel azul no avatar e linhas separadoras | fundo cinza e anel | fundo **#EEF3FD** (escuro #1F2A3C), anel de 1,5 px #76A1F3, nome em 600, **separadores de 1 px** entre os itens; item com 64 px e avatar de 44 |
| Painel direito: avatar | foto de 110 px com anel fino | iniciais em 110 px | iniciais em **112 px**, 34 px, anel de 1 px #D0E1F5 afastado 5 px |
| Cartões (motivo / próxima consulta) | ~112 px, fundo claro com borda | #EFF4FE, raio 12 | #F0F5FE com borda interna de 1 px #E1E9F7, raio 14, padding 13/12 |
| "Ver mais" / "Ver menos" | botão de largura total, fundo claro | **o "Ver menos" encolhia e perdia o fundo** (o painel rolava e o flex encolhia o botão) | nada encolhe no painel (`flex-shrink: 0`); altura mínima de 38 px, com o mesmo fundo e a mesma borda dos cartões |
| Ícones dos registros | quadrado pastel com o traço colorido | fundo cheio e traço #242424 | quadrado pastel com o traço na cor: lavanda #6045C2, pêssego #B4541F, azul #2F62C4, cinza #555; "Ficha completa" em #D0E1F5 com #242424 |

**De onde vêm os termos em negrito:** só de dados reais que o cliente já carrega, e de mais nada.
- **Receitas do paciente:** o campo `medicamento` dos documentos que a tela já recebe.
- **Medicamentos em uso:** `medicamentosEmUso`, lidos do mesmo `GET /api/medico/consultas/:id/evolucao` que a ficha já usa. Nenhuma rota nova ou alterada.

A função `nomeFarmaco` tira a dose ("Amitriptilina 25 mg (controlado)" vira "Amitriptilina"). A
`destacarTermos` compara palavra inteira, sem diferenciar maiúsculas nem acentos. Sem dados, nada é
destacado. Há testes em `mensagens-dados.teste.ts`.

## Sala de vídeo do médico (ref. 03)

| Ponto | Ref. 03 | Antes | Depois |
|---|---|---|---|
| Botões redondos | vidro claro e translúcido | brancos e opacos | **vidro**: `rgba(255,255,255,.78)` com `backdrop-filter: blur(18px) saturate(1.5)`, borda interna de 1 px `rgba(255,255,255,.65)`, brilho de 1 px no topo e sombra de 24 px; 55 px no celular e 56 no desktop |
| Pílula do paciente | vidro claro | `rgba(255,255,255,.86)`, blur 14 | o mesmo vidro dos botões; detalhe em **#2553A8** e tempos em **#4D4D4D** (AA sobre o vidro) |
| Sem backdrop-filter | — | — | `@supports not (backdrop-filter)`: vidro a **0,94** de opacidade |
| Selo "Sala aberta" | vidro claro (seta da ref.) | vidro escuro com texto branco | vidro claro, texto #242424 |
| Microfone ou câmera desligados | — | #242424 | `rgba(36,36,36,.86)`, ícone branco |
| Desligar | #E5242A | #E5242A | #E5242A, sem vidro, com sombra vermelha |
| Tela de espera (claro) | — (sempre há vídeo) | degradê chumbo #3A4350 → #1C2026, texto branco | **degradê da paleta #E4ECFA → #C3D6F4 → #94B4EA**, texto #242424, avatar branco com halo de 8 px |
| Tela de espera (escuro) | — | chumbo | azul-marinho **#41567C → #2C3B59 → #1D2638**, texto #F2F4F7 |
| Pontinho de status | — | **solto à esquerda quando o texto quebrava** | o ponto fica na mesma linha do texto (`inline-block`); texto 13/19 com `text-wrap: balance` |
| Aba "Evolução" | — | roxo escuro (`bg-primary`) | **#76A1F3 com texto #242424** (hover #8FB3F6), sobrescrita só em `.bms` (sala do médico); o componente `PainelEvolucao` não mudou |

## Trocas por falta de dado real

- Fotos (lista, resumo e sala): usamos iniciais, porque não existe foto do paciente.
- Ponto verde "online" e estrela de favorito: não existem esses dados; o lugar fica com o número de não lidas e o filtro "Não lidas".
- Remédios em negrito: só os nomes que vieram do paciente (receitas e medicamentos em uso), sem lista fixa.
- Agenda: as cores seguem o tipo de atendimento (azul, lavanda, pêssego); o verde da ref. está fora da paleta.
- Sala: "trocar câmera" virou "Mais" (o motor não troca de câmera) e a seta de voltar virou o selo "Sala aberta" (sair passa por "Encerrar").

## O que ainda difere

- Agenda: a hora é mais alta que a da ref. (72 contra 46,5 px), porque as consultas reais duram 30 min. Cabem menos horas na tela, e a grade rola até a hora atual.
- Agenda: em conflito, cada bloco mostra só o primeiro nome. Na semana do celular, um conflito vira só a cor.
- Mensagens: o balão do médico segue #76A1F3 com texto #242424 (a ref. usa azul forte com texto branco).
- Mensagens: o topo da página continua com as abas Conversa/Triagem/Ficha.
- Sala: o painel lateral do desktop (componente compartilhado) segue escuro.
- Sala: sem o paciente conectado, a prévia mostra a tela de espera. A miniatura usa a câmera falsa do Chrome.
- A aba "Evolução" da tela de trava (evolução pendente), fora da sala, continua no roxo antigo: o pedido era só na sala.
