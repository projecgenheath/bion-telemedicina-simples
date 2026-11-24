# Etapa 4 do redesign do médico: agenda, mensagens e sala de vídeo

Referências usadas: **07** (agenda semanal), **06** (mensagens em três colunas) e **03** (telefone da videochamada).
Cada referência foi desentortada para a escala da prévia (`scripts/desentortar.py`):

| Ref. | Saída | Cantos (TL, TR, BR, BL) | Observação |
|---|---|---|---|
| 07 | `zoom/ref07-1440.png` (1440×900) | 345,266 · 768,110 · 766,460 · 350,638 | cartão em 99–1426 × 117–879 |
| 06 | `zoom/ref06-1440.png` (1440×900) | 457,152 · 1040,76 · 1045,548 · 451,535 | ~14 px de moldura em cima e à esquerda; a base do notebook cobre o rodapé |
| 03 | `zoom/ref03-390d.png` (390×844) | 655,103 · 925,138 · 785,766 · 499,712 | só o telefone (a ref. 03 não tem desktop) |

Comparações (referência à esquerda, prévia à direita, mesma escala): `agenda-comparacao-1440/390.png`,
`mensagens-comparacao-1440/390.png`, `video-comparacao-1440/390.png`. As referências 06 e 07 não têm
versão de celular; no 390 elas aparecem em blocos, na ordem em que o celular empilha.

Paleta: #76A1F3, #D0E1F5, #E4DFF5, #FADBCA, #242424. Fonte: Poppins. Texto sobre azul: #242424.

## 1. Agenda semanal (ref. 07)

Antes: a agenda era só a folha "Agenda e horários" (lista de horários e bloqueios), sem visão de calendário.
Agora: uma tela `AgendaSemanal` que abre pelo menu lateral (item "Agenda") e pelo "Ver agenda" da tela inicial.
A folha antiga continua lá, no botão "Horários e bloqueios".

| Medida | Ref. 07 | Prévia |
|---|---|---|
| Margem da página (desktop) | 37 / 14 / 21 / 24 | 37 / 14 / 21 / 24 px |
| Cartão | raio 20, branco, sombra leve | raio 20, mesma sombra do cartão v2 |
| Coluna lateral (minicalendário + "de hoje") | 245 px | 245 px |
| Cabeçalho do cartão | 13 px de respiro; título 20/500 + ano 20/300 cinza | igual ("Novembro, 2026") |
| Seletor Dia/Semana/Mês | pílula cinza; ativo branco; botões ~76 px | min 76 px, `aria-pressed` |
| Cabeçalho do dia | 52 px; sigla 11/400, número 20/500; hoje em azul com sublinhado 2 px | igual (hoje: #76A1F3 + sublinhado #76A1F3) |
| Calha das horas | 66 px; rótulos 10/400 cinza | 66 px no desktop, 52 no celular |
| Altura da hora | 46,5 px | **56 px** (as consultas reais duram 30 min: o bloco fica com 28 px e cabem nome + horário) |
| Evento | raio 6; barra 3 px à esquerda; nome 11/500, horário 9/400 | igual; abaixo de 24 px vira uma linha (`bm2-agenda-ev-curto`) |
| Cores do evento | azul, lavanda, pêssego, verde | azul (consulta), lavanda (retorno/2ª opinião), pêssego (renovação); bordas #76A1F3, #A493DF, #EEA27A |
| Fim de semana | faixa cinza | `--bm2-fds` (cinza claro; no escuro, 4% de branco) |
| Linha da hora atual | linha fina com ponto | linha 1 px + ponto 7 px, trecho escuro de 2 px na coluna de hoje |
| Minicalendário | 7×6, hoje com anel, semana atual em cinza | igual; dia selecionado em #D0E1F5, dias bloqueados riscados |
| "Today's appointments" | contador à direita; cartões 38 px coloridos | "Consultas de hoje" + contagem real; cartões no tom do tipo |

Celular (390): abre direto em **Dia**, com a faixa dos 7 dias em cima (dia escolhido em #76A1F3 com texto #242424
e pontinho nos dias com consulta). Semana e Mês continuam disponíveis; o minicalendário e as consultas de hoje
vêm depois do cartão.

Comportamento: clicar num evento abre a ficha do paciente; a agenda fica montada por baixo, então "Voltar" e
o botão voltar do navegador retornam a ela. Esc fecha só a camada de cima. A busca escurece os eventos que não
batem. O filtro "Mostrar canceladas" fica desligado por padrão.

Regra preservada: **nada entre 23:00 e 00:00**. A faixa de horas vai de 07 a 19 e só se alarga para caber
consultas reais, nunca passando de 23:00. Os blocos são cortados em 23:00, e o rodapé avisa:
"Sem atendimento entre 23:00 e 00:00". Isso está coberto por testes em `agenda-dados.teste.ts`.

## 2. Mensagens em três colunas (ref. 06)

Antes: conversa numa coluna só, dentro da ficha, com balões simples.
Agora, a partir de 1024 px e na aba "Conversa", são três colunas:

| Medida | Ref. 06 | Prévia |
|---|---|---|
| Grade | lista ~350 · conversa · resumo ~268; espaço 18 | `350px 1fr 268px`, espaço 18 px |
| Lista: título | "All Messages ▾" 15/500 + botões filtro e busca (32 px, contorno) | "Todas as mensagens" / "Não lidas" + filtro (`aria-pressed`) e busca |
| Item da lista | 60 px; avatar 42; nome 13/500; prévia 11/400 cinza; hora 10/400 à direita | 60 px; avatar 42 (iniciais); a conversa aberta tem anel de 2 px #76A1F3 |
| Cabeçalho da conversa | 60 px; avatar 32 + nome 14/500; busca em pílula | 60 px; avatar + nome + "Próxima consulta: …"; "Buscar…" filtra as mensagens |
| Separador de dia | "TODAY" 10/500 cinza, centralizado | "HOJE", "ONTEM", "dd/mm" |
| Balão do paciente | #E8EEFA, raio 14 com canto de baixo 4 | `--bm2-balao-pac` #E3EDF9 (escuro #23324A), mesmo raio |
| Balão do médico | #5B86E5 com texto branco | **#76A1F3 com texto #242424** (regra de contraste da paleta) |
| Hora da mensagem | 9/400 cinza, embaixo | HH:MM embaixo (`m.quando` completo fica para leitor de tela) + "· lida/enviada" |
| Resumo: avatar | foto 110 px | iniciais 110 px em #D0E1F5 |
| Blocos | 2 × 112 px em #EFF4FE: diagnóstico e próxima consulta | motivo da consulta e próxima/última consulta |
| "Open more" | botão de largura total #EFF4FE | "Ver mais", que mostra os dados reais do paciente |
| Registros | linhas de 55 px, ícone de 39 px em tons claros | Receitas, Exames solicitados, Atestados, Arquivos do paciente e Ficha completa, com contagens reais (tons lavanda, pêssego, azul, cinza e forte) |

Abaixo de 1024 px nada muda: continua a conversa de uma coluna, agora com os mesmos balões e separadores. O
compositor, os modelos de resposta e o envio são os mesmos (o compositor só mudou de lugar). Trocar de conversa
pela lista reaproveita a entrada do histórico, então o "voltar" fecha a tela normalmente (veja `TelaSobreposta`).

## 3. Sala de vídeo e telefone (ref. 03)

Antes, o médico usava a mesma sala do paciente (`SalaConsultaTela`). Agora ele tem uma apresentação própria,
`sala/SalaMedicoTela.tsx`. A sala compartilhada **não foi alterada**, então a sala do paciente continua idêntica.

| Medida | Ref. 03 | Prévia (390) | Prévia (1440) |
|---|---|---|---|
| Palco | vídeo em tela cheia | 100dvh, fundo escuro em degradê | grade `1fr 384px`, 20 px de respiro, palco com raio 24 |
| Miniatura própria (PiP) | 113×155, raio 14, a 22 do topo e 20 da direita | 113×155, raio 14, 22/20 | 240×160 |
| Pílula do paciente | 354×63, vidro claro, avatar 50, nome 15/500, detalhe azul 12/400, hora com ponto vermelho | 354×63 com avatar de iniciais, "Clínica Geral • Teleconsulta", "restam N min" e cronômetro com ponto | mesma pílula, centralizada sobre os controles |
| Controles | 5 círculos de 55, espaço 18, brancos; desligar #E5242A | 5 × 55, espaço 18; desligar #E5242A com o telefone girado 135°; desligado = #242424 com ícone branco | 56 px; mais "tela" e "anexar", pílulas de documentos e a dica de atalhos |
| Rodapé | 34 px do fundo | 34 px | dentro do palco |

## Trocas por falta de dado real

- **Agenda.** O "sino" da ref. 07 virou "Horários e bloqueios", porque não há notificações específicas da agenda.
  As cores seguem o tipo de atendimento (azul, lavanda e pêssego); o verde da referência fica fora da paleta, então
  consultas concluídas ou faltas aparecem com borda tracejada. A altura da hora é 56 px, não 46,5. Entraram as
  setas e o botão "Hoje" para trocar de semana. O horário das 23 às 24 nunca aparece.
- **Mensagens.** Não existe dado de "online" nem de favorito, então o ponto verde e a estrela deram lugar ao número
  de não lidas e ao filtro "Não lidas". Não há foto do paciente: o avatar usa iniciais. O "diagnóstico" virou o
  motivo da consulta (para o médico; o admin continua sem `motivoConsulta`). Os "Medical Records" com tamanhos de
  arquivo viraram contagens de documentos reais. O menu "…" do topo da conversa ficou de fora, porque as ações já
  estão na barra de cima (Medição, Emitir).
- **Vídeo.** A seta de voltar da ref. 03 virou o selo "Sala aberta": sair tem que passar por "Encerrar" e pelas
  travas. "Trocar câmera" virou "Mais", porque o motor da sala não troca de câmera; o menu traz Compartilhar tela,
  Anexar, Receita, Atestado e Exame. Sem a outra pessoa conectada, a prévia mostra o estado de espera (as iniciais
  no palco) e a câmera falsa do Chrome na miniatura. O painel lateral (Prontuário, Exames, Chat, IA) é o componente
  compartilhado e continua escuro.

## O que ainda difere

- Fotos: a referência usa fotos; a prévia usa iniciais (não há foto real cadastrada).
- Na agenda, a hora é mais alta (56 contra 46,5 px), então cabem menos horas por tela (cerca de 11 contra 13 a 1440×900).
- No celular da agenda, a referência não tem versão; a vista Dia é uma adaptação.
- Nas mensagens, o cabeçalho de cima da página (abas Conversa/Triagem/Ficha e ações) continua; na ref. 06 essa faixa é só a busca.
- Na sala, o painel lateral do desktop é escuro e tem quatro abas; a ref. 03 não mostra desktop.
- A aba flutuante "Evolução" continua na borda direita, como antes (ela é a trava da evolução e não foi mexida).

## Como foi conferido

- Prints 1440×900 e 390×844 (2x), no claro e no escuro: `docs/prints/redesign-medico/etapa4/`.
- axe (regras WCAG 2 A/AA) na agenda (Semana, Mês e Dia), nas mensagens e na sala, em 1440 e 390, claro e
  escuro: **0 violações**. Duas foram corrigidas no caminho: os dias de outro mês no minicalendário (#848484 → #6B6B6B)
  e o link "Inserir modelo de evolução" no painel escuro, que usava o roxo do tema claro (1,1:1) e agora usa #76A1F3,
  só dentro da sala do médico.
- Fiação da sala com Playwright e mídia falsa do Chrome, em 1440 e 390:
  - os dois `<video>` existem e a câmera local tem trilhas de áudio e vídeo ativas;
  - `/sala` recebeu 4 GET e 1 POST;
  - o microfone desliga a trilha (`enabled` passa a false e o botão vira "Ativar microfone"), e o atalho M religa;
  - a câmera e o atalho C fazem o mesmo;
  - o chat abre o painel, o campo aparece e o envio sai como `sinal:chat` pela sala, ou seja, fica guardado com a consulta;
  - "Encerrar" abre o diálogo de encerramento e "Receita" abre o modal;
  - com uma evolução pendente, a trava continua mostrando "Conclua a evolução de …".
