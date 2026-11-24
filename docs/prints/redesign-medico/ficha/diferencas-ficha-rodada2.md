# Ficha do paciente, rodada 2: diferenças medidas (ref. 17 + 15/16/08) × prévia BION

**Método.** A ref. 17 é frontal (sem perspectiva). Recortei a tela do mockup e levei para 1440 px de largura (`zoom/ref17-1440.png`, escala 1067 → 1440). Assim, 1 px = 1 px do print de 1440×900. As refs. 15 e 16 são inclinadas e serviram só para detalhes (botões redondos, anéis, linha destacada, passo da tabela). A 08 serviu para tablet e celular.
Comparei de três formas:
- caixas dos glifos (`scripts/medir-ficha.py`);
- perfis de linhas de texto (`linhas2.py` / `textrows.py`);
- transições de cor (`bordas.py`).

Em cada glifo, a "cor" é o pixel mais escuro. Erro de ±1–2 px, por causa do desfoque do mockup.
- **Antes** = head 46cec23 (`previa/ficha/ficha-1440-f.png`).
- **Depois** = rodada 2 (`previa/ficha/ficha-1440.png`).

| # | Item | Referência (medido) | Antes (46cec23) | Depois (rodada 2) |
|---|---|---|---|---|
| 1 | Topo | ← · divisória · busca "Search something" (ícone x≈153, texto 14 px) · sino · divisória · foto 38 px + nome 13 px / cargo 11 px + seta | ← · nome do paciente + "Próxima consulta" · abas · Medição · Emitir (sem busca e sem perfil) | **← · divisória · busca "Buscar paciente…" (14 px, ícone x≈122) · abas · Medição · Emitir · divisória · iniciais 40 px + nome 13 px / especialidade 11 px + seta**. Na aba Ficha, o nome do paciente sai do topo (fica no canto do cartão e continua para o leitor de tela). Em Conversa e Triagem, ele aparece entre a busca e as abas |
| 2 | Rótulos do cartão (Próxima consulta, Motivo, Pressão…) | ~11 px, cinza-azulado claro (pixel mais escuro #798593) | 12 px, #595959 (cinza neutro) | **11 px / 14 px de linha, #4C5A6A** (cinza-azulado, AA 4,56:1 no ponto mais escuro do degradê) |
| 3 | Valores dos campos | 13 px, peso médio; caixa de 14 px (y 244–257) | 14 px regular; caixa de 15 px (y 243–257) | **13 px / 500; caixa de 13 px (y 246–258)** |
| 4 | Números dos sinais | ~31 px (dígito de 22 px), regular; unidade ~20 px fina e clara | 32 px / 400; unidade 20 px / 300 #595959 | **31 px / 400; unidade 20 px / 300 #4C5A6A** |
| 5 | Nome e idade no canto | nome ~14 px / 500 (caixa de 11 px); legenda 12 px #7B828D; canto inferior direito, ~20 px das bordas | nome 16 px; legenda 12 px #595959 | **nome 14 px / 500, legenda 12 px #4C5A6A**, no canto inferior direito (x 832–951, y 308–337) |
| 6 | Avatar / foto | foto recortada de ~260×257 px, centro do cartão à direita | círculo de **196 px** (x 597…, transbordando 14 px para baixo), letras de 64 px | **círculo de 120 px** (x 623–743, y 211–327), letras de 38 px / 300, fundo branco 34 %. Fica menos dominante e não encosta no nome |
| 7 | Histórico: título → cabeçalho → 1ª linha | título y 400; cabeçalho y 445; 1ª linha y 476 | título 402; aviso em 438–462; cabeçalho **490**; 1ª linha **525** | **título 402; cabeçalho 445; 1ª linha 476** |
| 8 | Passo das linhas da tabela | 37 px (476 → 513 → 550…) | 37 px | **37 px** (igual) |
| 9 | Seta por linha | só ícone de download na linha destacada | seta ⌄ em todas as 8 linhas | **seta só na linha em hover/foco/aberta**. A linha inteira abre o detalhe e o botão continua no teclado. Em tela de toque sem hover, a seta aparece na linha aberta |
| 10 | "+" azul do histórico | círculo azul de 32 px ao lado do filtro | não existia | **círculo azul de 32 px**, abre o menu "Novo registro": *Emitir receita ou documento* e *Pedir medição ao paciente* (as duas ações já existem; ver "Trocas") |
| 11 | Selos na tabela | não tem | "outro" 11 px | **10,5 px, 16 px de altura**, à direita do texto (menos peso visual) |
| 12 | Aviso de consentimento | não existe na ref. | 12 px em 2 linhas **entre o título e a tabela** (empurrava a tabela 45 px) | **rodapé fixo do cartão**: 11 px / 15 px, cadeado de 12 px, linha divisória. Sempre visível, mesmo com a tabela rolada. #767676 sobre branco = 4,54:1 (AA) |
| 13 | Laudos: passo dos itens | 64 px (455 → 518; 689 → 754) | 70 px (492 → 562 → 633) | **64 px** (488 → 551 → 616 → 679) |
| 14 | Laudos: nome / linha de baixo | nome 15 px / 500; linha de baixo 12 px clara, "data · situação" | nome 15 px / 400; linha de baixo 13 px | **nome 15 px / 20 px / 500; linha de baixo 12 px / 16 px** |
| 15 | Laudos: ícone de abrir | "+" cinza fino; aberto vira "×" preto | "+" 32 px; aberto "×" cinza | **"+" 28 px** (botão), aberto **"×" #242424**. Itens do exame aberto num bloco branco 55 % com raio 12 (como o bloco interno da ref.) |
| 16 | Laudos: subtítulos | não tem | 12 px / 500 | **11 px / 500**, mais discretos (continuam separando exames, documentos e arquivos) |
| 17 | Celular (390): cartão do paciente | título e botões em cima; foto e nome/idade à direita; campos à esquerda; sinais embaixo | avatar + nome no topo, à esquerda; campos em 2 colunas; sinais | **título e botões em cima; avatar de 56 px e nome/idade no canto direito; campos empilhados à esquerda; linha divisória; sinais embaixo (24 px)** |
| 18 | Celular: ordem | paciente → medicamentos → histórico → laudos | igual | igual (conferido), e as medições no fim |
| 19 | Celular: lista do histórico | (tabela) | data em negrito 13 px; seta; 1ª linha colada no título | **data 12,5 px cinza; motivo 14 px; profissional 12,5 px com "…"; 8 px entre o título e a 1ª linha; sem traço na 1ª linha** |
| 20 | Escape com menu aberto | não se aplica | fechava a ficha inteira | **fecha só o menu** (filtro, "+" ou resultados da busca) |

Conferido no print (DOM): `.bm2-ficha-paciente 102,102,868,257` · `.bm2-ficha-meds 988,102,425,257` · `.bm2-ficha-historico 102,377,979,496` · `.bm2-ficha-relatorios 1100,377,313,496` · topo 76,0,1364,75. A grade da rodada 1 não mudou.

## Ainda diferente (e por quê)
- **Foto do paciente:** o cadastro não tem foto. Ficam as iniciais num círculo de 120 px, menor e mais claro, mas ainda é um círculo e não um retrato recortado.
- **Sino de notificações no topo:** não entrou. O pedido era busca e perfil, e o sino já está no menu lateral.
- **O que a busca do topo procura:** busca **pacientes** (a lista do médico que já está no cliente) e abre a ficha do escolhido, como a busca do Início. A ref. diz "Search something", sem dizer o quê.
- **Abas Conversa / Triagem / Ficha e botões Medição / Emitir no topo:** não existem na ref. Continuam porque são a navegação real do paciente.
- **Cores dos textos:** são mais escuras que as da ref., por causa do AA.
  - Rótulos do cartão: #4C5A6A, contra #798593 na ref.
  - Legendas: #646464 / #767676, contra ~#9A9A9A.
  - Ficaram com o mesmo tom cinza-azulado e o mesmo tamanho da ref., o que dá o ar "leve".
- **Datas nos rótulos dos sinais ("Pressão · 22/11"):** a ref. não tem datas, mas é dado real e importante: diz quando foi a medição.
- **Tabela com 8 linhas:** é o histórico real do paciente fictício. A ref. mostra 10 e corta a última.
- **Laudos sem miniaturas nem "Open full list":** os exames são estruturados (sem imagem). Ao abrir, aparecem os itens com a faixa de referência. A linha com o médico (avatar + nome) só existe nos documentos.
- **Aviso de consentimento:** a ref. não tem. Ficou no rodapé, em 2 linhas de 11 px.

## Trocas por falta de dado real (sem inventar)
- **"+" do histórico:** não existe ação de "novo registro de histórico" (a evolução só é escrita na sala da consulta). O "+" abre as duas ações reais que geram registro do paciente:
  - *Emitir receita ou documento*, a mesma folha do "Emitir";
  - *Pedir medição ao paciente*, que abre o pedido na Conversa, com a mesma API (`POST /api/medico/pedidos-medicao`). Só aparece quando há consulta não cancelada, a mesma regra do botão "Medição".
- **Perfil do médico:** mostra a foto quando o cadastro tem, senão as iniciais. Embaixo do nome vem a especialidade (no lugar do "Therapist" da ref.). Tocar leva ao Perfil, como no Início.
- **Foto do paciente → iniciais. Heart rate / Blood sugar / SpO2 → pressão / peso / altura. Treatment phase / Diagnosis → consulta / motivo / último CID.** São as mesmas trocas da rodada 1.

## Contraste (AA) dos tons novos
| Texto | Fundo | Razão |
|---|---|---|
| `#4C5A6A` rótulos e unidade do cartão | `#BDD2EA` (ponto mais escuro do degradê) | 4,56:1 |
| `#4C5A6A` | `#DCECFE` (ponto mais claro) | 5,9:1 |
| `#767676` aviso de consentimento | `#FFFFFF` | 4,54:1 |
| `#646464` linha de baixo dos laudos | `#E4DFF5` | 4,56:1 |
| `#242424` "+" e aba ativa | `#76A1F3` | 6,0:1 |

axe (Ficha, Conversa e Triagem; 1440 e 390; claro e escuro): **0 violações**.
