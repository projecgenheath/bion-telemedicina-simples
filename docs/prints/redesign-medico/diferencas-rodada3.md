# Rodada 3: diferenças medidas (ref. 12/13/14 + 04) × prévia BION

**Método.** A ref. 12 é um mockup em perspectiva, então primeiro desentortei a tela com PIL (`Image.PERSPECTIVE`) usando os 4 cantos dela: (237,135) (949,165) (243,574) (961,620), levando para 1440×900. Isso dá 1 px = 1 px do desenho. Ajustei os cantos até as linhas da tabela ficarem horizontais.
Depois comparei com o print de 1440 de três formas:
- sobreposição a 50%;
- detecção de bordas (transições de cor por linha/coluna);
- perfis de linhas de texto (altura e passo das linhas).

As cores vieram de amostras de pixels.
As medidas abaixo estão em px de 1440 e têm erro de ±2 px, por causa do desfoque e da perspectiva do mockup.

| # | Item | Referência (medido) | Antes (9340dc1) | Depois (rodada 3) |
|---|---|---|---|---|
| 1 | Paleta dos cartões | #E4DFF5 / #D0E1F5 / #FADBCA chapados, sem degradê (amostrado em 3 linhas) | igual | igual (conferido) |
| 2 | Fundo / linhas do topo e do menu | fundo #EFF3F4; linha #E9ECEC | linha rgba(36,36,36,.08) ≈ #DFE3E3 | linha `--bm2-divisor` #E6EAEB |
| 3 | Largura do menu lateral | borda em x = 76 | 72 | **76** |
| 4 | Logo do menu | divisória na mesma altura da linha do topo (y = 88) | divisória em y = 72, com recuo | **y = 88, largura toda** |
| 5 | Ícones do menu | ~20 px, fundo ativo 40×40 raio ~10, passo 53 px, 1º no centro y ≈ 125 | 18 px, fundo 44, passo 52, 1º em y ≈ 112 | **20 px, 40×40 raio 10, passo 53, 1º em y ≈ 125** |
| 6 | Saudação | 2 linhas de ~42 px, topo em y = 127, nome termina em y = 203 | 37,6 px, topo em 121, fim em 190 | **42 px**, topo em 127, fim em 204 |
| 7 | Números do topo | rótulo 12 px; número de ~34 px (dígito com 24 px de altura) | rótulo 11 px; número 25,6 px | **rótulo 12 px; número 34 px** (Poppins 300) |
| 8 | Espaço entre a saudação e os cartões | 47 px (cartões começam em y = 250) | 27 px (y = 217) | **cartões em y = 249** |
| 9 | Margens laterais do conteúdo | esquerda x = 105, direita x = 1413 | 100 / 1403 | **104 / 1412** |
| 10 | Vão entre blocos | ~20 px na horizontal e ~19 px na vertical | 12–13 px | **20 px / 19 px** |
| 11 | Largura dos cartões | lavanda 537, azul 194, pêssego 191 | 534 / 205 / 205 | **536 / 193 / 194** (2,75fr : 1fr : 1fr) |
| 12 | Altura dos cartões coloridos | 208 px | 208 | 208 (igual) |
| 13 | Texto dos cartões | título 12 px; texto 15 px com passo de linha 18,5 | título 11; texto 16 com passo 21 | **título 12; texto 15 com passo 18,6** |
| 14 | Número grande dos cartões | ~50 px (dígito com 36 px de altura), base a 24 px do rodapé | 41,6 px | **49,6 px** |
| 15 | Pilha de avatares | ~34 px, sobreposição de 8 px, anel na cor do cartão | 30 px | **34 px, −8 px** |
| 16 | Sombra dos cartões brancos | escurece só 1–2 px na borda (#ECF0F1) | se espalhava por ~8 px | **0 0 0 1px + 0 1px 3px**: 1–2 px |
| 17 | Coluna Hoje | x 105–426 (321 px); topo em y = 246 | 100–420; topo em 217 | **104–429; topo em 249** |
| 18 | Itens da lista do dia | 70 px de altura, passo 83,5, raio ~12, nome e motivo 15 px, linha de baixo 13 px | ~52 px, passo 65, nome 14, linha de baixo 11 | **70 px, passo 82,5, raio 12, 15 / 13 px** |
| 19 | Cartão destacado | avatar 53 px, botão com 40 px de altura e raio ~8, relógio 40×40 | avatar 48, botão 44 | **avatar 52, botão 40 com raio 9, relógio 40** |
| 20 | Tabela "Meus pacientes" | 7 linhas; título em y = 508; cabeçalho em y = 556; 1ª linha em y = 589; passo 40 | 8 linhas; cabeçalho 12 px mais perto do título | **7 linhas; título 509, cabeçalho 555, 1ª linha 589, passo 40** |
| 21 | Celular (ref. 03): números | número em cima, rótulo embaixo | rótulo em cima | **número em cima** (leitor de tela continua lendo rótulo → valor) |
| 22 | Celular: botão do cartão azul | botão branco com texto azul | texto #242424 | **texto azul #2F62C4 sobre branco (5,73:1)**. O texto sobre o próprio azul continua #242424 |
| 23 | Celular: sino e mensagens | círculos com contorno fino | sem contorno | **contorno 1 px #DFE3E6** |
| 24 | Fonte | Poppins (ref. 04: Regular / Medium / SemiBold, e o fino nos números grandes) | Poppins 300–600 | igual |

## Ainda diferente (e por quê)
- **Fotos:** a ref. usa fotos de pacientes e médico. O app não guarda foto de paciente, então ficam as iniciais. Os avatares de iniciais parecem mais "vazios" que as fotos.
- **Cartão destacado ~12 px mais alto:** tem a linha "Sala aberta", que é um dado real e útil. Por isso a lista do dia começa ~12 px abaixo da ref.
- **"Ver todos os N pacientes":** fica embaixo da tabela, para não esconder pacientes. Por isso a coluna termina em y ≈ 885, e não em ~860.
- **Cores do texto:** cinzas e cores de texto ficam mais escuros que os da ref., por causa do AA. Rótulos #6E6E6E–#767676 contra #939696–#BBBBBB na ref. Laranja #B4500F e vermelho #C42B2B contra #F07B3F/#F03B3B na ref.
- **Botões sobre o azul #76A1F3:** texto #242424, e não o branco da ref., porque branco dá 2,57:1.
- **Peso dos números do topo:** ficou em Poppins 300, como pedido na rodada 2. Na ref. o traço mede ~3 px num dígito de 24 px, entre o 300 e o 400 (o desfoque engrossa o traço).
- **Celular:** mantém a saudação e não tem a barra inferior com "+" (etapa 5). No celular a ref. mostra só o mockup inclinado, então a comparação de 390 é visual.
- **Textos reais:** têm comprimentos diferentes dos da ref. Por exemplo, "Renovação de receita" e os motivos em português são mais longos, então às vezes cortam com "…".
