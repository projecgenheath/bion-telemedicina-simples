# Etapa 5 — celular, animações, trava da evolução e revisão de consistência

Base: PR #241 (`medico/redesign-agenda-video-previa`, 855a761). Só front-end do médico; nada de banco, API, globals.css, consulta/*, paciente ou admin. O painel lateral escuro da sala (`.bms-painel`) não foi tocado: depende de decisão do Alisson.

## 1. Barra inferior do celular (ref. 03, telefone da esquerda)
- Componente novo `inicio/BarraInferiorMedico.tsx` (abaixo de 1024 px). Ícones sem rótulo visível (nome acessível em cada um) e o "+" azul elevado no meio.
- Ordem: Início · Pacientes · Mensagens (contador real de não lidas) · **+** · Agenda · Relatórios · Perfil. Não se perde nada da pílula antiga (Perfil, Início e Pacientes).
- O item ativo é o mesmo `destinoAtivo` do menu lateral: Início, Pacientes, Relatórios (Gestão), Perfil (Meu perfil e Perfil público).
- A barra some com sheet ou sobreposição aberta (agenda, conversa, notificações), igual à pílula antiga. A conversa tem a caixa de mensagem embaixo, e as sobreposições são `aria-modal`. Dentro delas vale o "Voltar".
- O "+" abre `sheets/AcoesRapidasSheet.tsx`, só com ações que já existem:
  - **Emitir receita ou documento**: escolhe o paciente (só os com pacienteId) e abre a ficha dele com o EmitirDocumentoSheet já aberto.
  - **Pedir medição**: só aparece se algum paciente cumpre a regra atual da ficha (pacienteId e uma consulta não cancelada). A ficha abre com o pedido aberto e rolado para a vista.
  - **Horários e bloqueios**: abre o AgendaSheet.
- Área segura e padding: a barra fica a 12 px + `env(safe-area-inset-bottom)`. As telas (`.bm-tela`, Perfil, lista de Pacientes) ganharam `padding-bottom: calc(6.5rem + safe-area)`, então o conteúdo termina acima da barra. A dica de gestos subiu para cima dela.
- A sala de vídeo (/consulta) é outra página e não tem barra.
- Pílula de pontos (Perfil · Início · Pacientes): removida. Os pontos de seção à direita ficaram, do roxo #C4B5FD para o azul.

## 2. Animações (só CSS, nada de biblioteca)
- Entrada dos cartões em cascata curta: grade do Início, Gestão, Perfil público, painéis e cartões das sobreposições. Usa `animation-fill-mode: backwards`, então não sobra transform depois.
- Troca de tela: as sobreposições (agenda, ficha/mensagens, notificações, renovações, suporte) entram com um deslize de 12 px.
- Hover e toque: itens da barra, do menu lateral, ícones do topo, botão azul e linhas do "+" (scale 0,92–0,94 no :active). Sombra no hover dos cartões no computador.
- Sheets do médico abrem e **fecham** animando: o Radix espera o `animationend` no estado `closed`. No celular sobem e descem; a partir de 768 px é fade com escala. O fundo escurecido acompanha.
- Gavetas Perfil e Pacientes (≥ 1024 px): entram pelo lado de onde vêm e saem por ele (`data-gaveta-saindo`, 200 ms, sem clique).
- Menus: o da Ajuda (lateral) e a lista da busca do topo entram com um "pop" de 160 ms.
- `prefers-reduced-motion: reduce`: `animation` e `transition` ficam `none` no app do médico, nas sheets e nos fundos. Também não há escala no toque, e a gaveta fecha sem o estado de saída. Nenhuma animação usa :focus, e o contorno de foco é o mesmo.
- Vídeos: `previa/etapa5-animacoes.gif` e `.mp4` (390) e `previa/etapa5-animacoes-1440.mp4` (gavetas, Ajuda, agenda).

## 3. Trava da evolução fora da sala (/consulta com evolução pendente)
- A aba lateral "Evolução" passou do roxo `--primary` para **#76A1F3 com texto #242424** (7,0:1). Medido no teste: fundo rgb(118,161,243) e texto rgb(36,36,36).
- A tela da trava e a de erro da conferência viraram um cartão branco sobre o fundo claro do redesign, com botão #76A1F3 / #242424 e Poppins.
- Escopo: classe `bms-trava` (só no ChamadaMedico, que é do médico). O PainelEvolucao é só do médico; o paciente não o usa.

## 4. Revisão de consistência (telas do médico)

### O que trocou
| Antes | Depois | Onde |
|---|---|---|
| Fundos em degradê branco → roxo #7C5CBF/#24058D (telas 1, 2 e 3, painéis e sobreposições) | Fundo liso #EFF3F4 (escuro #0E1013) | medico.css |
| Bloco "Fase 4": auroras, brilhos, gradiente roxo do nome, anel e ECG roxos, `--bm-grad-*`/`--bm-hero-*`/`--bm-aurora-*` | Removido (nenhuma tela usava) | medico.css |
| `--primary` roxo #24058D (bg-primary e text-primary: 12 + 18 usos) | #2F62C4 (escuro #9DBCF7), só no escopo `.bm-app`/`.bm-sheet`/`.bms-trava`/`.bms-modal`/painel de evolução | medico.css, sala-medico.css |
| `--bion-ink` marinho #0A1F44 (236 usos de `bion-ink`) e `--bion-sea` | #242424 e #2F62C4 no mesmo escopo | medico.css |
| `bp-acao` (pílula degradê marinho) e `bp-entrada` | Azul liso #2F62C4 e campos com borda e foco azuis | medico.css |
| `bp-glass` (vidro r24 com blur) | Cartão branco r20 com borda e sombra do redesign, sem blur | medico.css |
| Sheets: texto marinho e raio 28 | #242424, raio 20, escuro #181B20, Poppins | medico.css, SheetMedico |
| Inter e font-black 800/900 nas telas antigas | Poppins em todo o app do médico; 800/900 vira 600 (a Poppins carregada vai até 600) | medico.css |
| Gestão e Perfil público: texto branco sobre roxo, `bp-glass-marinho`, `text-sky-200`, estrelas amber-300 | Texto #242424/#5F5F5F, cartões brancos, links #2F62C4, estrelas amber-400/500 | TelaGestao, TelaPerfilPublico |
| Saldo dos Repasses em vidro marinho | Cartão azul #2F62C4 (escuro #23324A), texto branco/90 (5,1:1) | RepassesSheet, medico.css |
| `dark:text-sky-300`/`dark:bg-sky-300`/`sky-400` (43 usos) | #9DBCF7 | 10 arquivos do médico |
| Modal "Solicitar exame" da sala em violet-500/600/700 | #2F62C4 / #9DBCF7 | ChamadaMedico |
| Modais da sala (receita, atestado, exame, sair sem concluir, modelo de evolução) com `--primary` roxo | Escopo `bms-modal` → azul | ChamadaMedico, SalaMedicoTela |
| Painel branco da evolução aberto na sala com botões roxos | Tokens azuis (`.bms aside[aria-label="Evolução"]`) | sala-medico.css |
| Indicador de seções roxo #C4B5FD | Azul #2F62C4 / #9DBCF7 sobre pílula branca | IndicadorTelas |
| Textos `text-bion-ink/50–60` e `opacity-60` (com #242424 caíam abaixo de 4,5:1) | /75 | Gestão, Notificações, Resultados, Agenda, Renovações, nota de prescrição, painel de evolução |

### O que ficou (e por quê)
- **Painel lateral escuro da sala** (`.bms-painel`, chat e anotações, botão de envio roxo): ficou, porque depende de decisão do Alisson.
- **Diálogo "Encerrar atendimento"** (`consulta/EncerrarAtendimento.tsx`) com `--primary` roxo: ficou, porque é consulta/* e é proibido mexer. Resolver isso pede mexer nesse arquivo ou escopar o `--primary` na raiz `.bms`, e a raiz `.bms` alcançaria o painel escuro.
- **Tokens globais** (`--primary` #24058D e `--bion-ink` em globals.css): ficaram, porque globals.css é proibido. A troca vale só no escopo do médico, e paciente e admin seguem iguais.
- **Nomes de classe antigos** (`bion-ink` 236, `bp-entrada` 19, `bp-acao` 10, `font-black` 38): ficaram no JSX. Agora apontam para os valores novos, e renomear tudo seria só ruído no diff.
- **Logo BION** do menu lateral: é a marca.
- **Roxo de "Retorno" (`--bm2-t-roxo` #8A2BB0) e cartões lavanda**: vêm da própria ref. 12 ("Initial inspection" roxo e cartão "Requires immediate attention" lavanda).
- **Dica de gestos** em cartão escuro: tooltip de primeira visita, só com o ícone recolorido.
- **Seta "Seu perfil público abaixo"** com `motion-safe:animate-bounce` na Gestão: ficou, e já some com movimento reduzido.

## O que ainda difere da ref. 03
- O "+" da ref. é #76A1F3 com "+" branco (2,5:1, abaixo de 3:1). Aqui é #3D72D9 (4,6:1), elevado 26 px com aro da cor do fundo, para destacar e passar no AA.
- A ref. tem 5 itens (Início, Pacientes, +, Agenda, Relatórios) numa barra encostada na borda. Aqui são 7 (Mensagens e Perfil entram, como pedido), numa barra flutuante branca r22 com 12 px de margem.
- Na ref. a barra aparece em todas as telas. Aqui ela some nas sobreposições (agenda, conversa, notificações), como a pílula antiga, e nelas vale o "Voltar".
- Documentos (renovações) e Ajuda não estão na barra. Seguem no painel Perfil, como antes da etapa 5.

## Trocas por falta de dado
- Nenhuma. Os pacientes do "+" vêm de `listaPacientes`, o contador de `naoLidasPorPaciente` e a regra de medição é a mesma da ficha. Os textos do "+" e o subtítulo da trava ("Novos atendimentos ficam segurados até a evolução ser concluída") descrevem regras que já existem.
