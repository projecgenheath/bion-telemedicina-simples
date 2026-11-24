# Etapa 5, rodada 2: o que mudou e o que ainda difere da referência

Branch `medico/redesign-celular-animacoes-previa` (PR #242, rascunho). Dados das prévias: APIs simuladas com dados fictícios, relógio em 25/11/2026 09:32.

## O que mudou

1. **A barra do celular segue a ref. 03.**
   - **Itens:** são 5, Início · Pacientes · **+** · Agenda · Relatórios.
   - **Posição:** fica rente à borda de baixo, sem flutuar e sem cantos arredondados. A altura é de 62 px mais a área segura do aparelho (`env(safe-area-inset-bottom)`).
   - **Proporções medidas na ref.:** 5 colunas de 70 px centralizadas, ícones de 21 px com traço 1,7, e um quadrado de 38 px atrás do item ativo, com cantos de 11 px. Cada alvo de toque tem 44×44 px.
   - **Fundo:** branco translúcido com desfoque, como na ref., onde a lista passa por baixo da barra. Sem suporte a desfoque, o fundo fica branco opaco. No escuro, o fundo é #181B20.
2. **Mensagens e Perfil foram para o topo.** Eles saíram da barra e viraram os botões redondos de 44 px ao lado do sino, como na ref. 03.
   - **Onde aparecem:** em todas as telas do celular que têm barra, isto é, Início, Relatórios, Pacientes, Perfil público, Agenda e Notificações.
   - **Mensagens:** mostra o contador real de não lidas, o mesmo total do menu do computador.
   - **Perfil:** é o avatar no topo. No Início ele já existia; nas outras telas ganhou um botão redondo. Documentos, Ajuda/Termos, Configurações, Suporte e Renovações continuam no painel do Perfil. O roteiro "alcance" abriu cada um deles a partir do avatar.
3. **O botão "+" tem fundo #76A1F3 e sinal #242424.**
   - **Tamanho:** 54×54 px com cantos de 16 px, igual à ref., sem ficar elevado acima da barra. Leva uma sombra azul suave (0 6px 14px).
   - **Contraste do sinal sobre o fundo:** 5,9:1. O mínimo para elementos que não são texto (WCAG 1.4.11) é 3:1, então passa.
   - **Contraste do botão contra a barra branca:** 2,6:1. Não é exigido, porque o que identifica o controle é o sinal "+", e ele tem 5,9:1. O botão também tem rótulo acessível: "Novo: receita, documento, medição ou horários".
   - **No escuro:** o botão continua #76A1F3 com o sinal #242424.
4. **A barra também aparece na Agenda e nas Notificações.**
   - **Como:** ela fica dentro da própria tela sobreposta, como rodapé, então não cobre conteúdo e o diálogo continua modal.
   - **O que segue funcionando:** Voltar, Esc e a troca de aba pela barra, que fecha a tela sobreposta e vai para a aba escolhida.
   - **Onde não aparece:** na conversa, para não cobrir o campo de mensagem, e na sala de vídeo.
5. **Ajuste fino com as refs. 03 e 12.**
   - Os títulos dos sheets, incluindo o do "+", agora usam Poppins 500 a 20 px, como os títulos da ref.
   - O chip "N não lidas" em Pacientes some no celular, porque o contador já está no botão redondo.
   - A dica de gestos sobe junto com a nova altura da barra.

## O que ainda difere da referência

- **Saudação:** a ref. 03 não tem "Bom dia, Dra. …" no celular. Mantivemos a saudação pela decisão anterior do Alisson.
- **Botões do topo:** a ref. 03 tem dois (sino e balão). A prévia tem três no Início (avatar, sino e Mensagens), porque o Perfil precisava de um lugar fora da barra. Em Perfil público, o título quebra em duas linhas a 390 px.
- **Cor do "+" na ref.:** o sinal é branco. Aqui ele é #242424, como foi pedido, o que também dá mais contraste.
- **Rótulos dos números:** na ref. 03 os rótulos têm duas linhas e letra maior, em inglês. Os nossos são "Consultas hoje", "Próximos 7 dias" e "Avaliação", em uma linha.
- **Sheet do "+":** a ref. não tem esse sheet. Ele segue o estilo da ref. 12, com cartões claros r16 e ícones em quadrados r12.
- **Sala de vídeo:** o painel lateral escuro não foi tocado e depende de decisão do Alisson.

## Verificações

| Verificação | Resultado |
|---|---|
| Typecheck (`tsc --noEmit`) | sem erros |
| Testes do médico (20 arquivos) | 20 passaram |
| Lint nos arquivos alterados | só o erro antigo de `MedicoApp.tsx:80` (ref no render), que já existia antes |
| Build (`next build --webpack`) | passou |
| axe | 0 violações em 1440 e 390, claro e escuro (Início, Pacientes, Gestão, Perfil público, Perfil, "+" e seus 4 caminhos, Agenda, Mensagens, Notificações, Documentos, Ajuda, Horários, trava da evolução, Evolução aberta); com movimento reduzido também 0 |
| Chamada real (Playwright, câmera e microfone falsos) | vídeo local e remoto ativos; microfone e câmera ligam e desligam (atalhos M e C); chat envia pela sala; Encerrar e Receita abrem; sem barra a 390 |

Arquivos de comparação: `etapa5-r2-comparacao-390.png`, `etapa5-r2-comparacao-1440.png`. Animação: `etapa5-r2-animacoes.gif`, com a barra agora também na agenda.
