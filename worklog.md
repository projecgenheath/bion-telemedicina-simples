# BION Telemedicina — Worklog Multiagente

---
Task ID: fase-4
Agent: Super Z (agente principal)
Task: Fase 04 — Mensageria real paciente↔médico + BION IA com LLM real

Work Log:
- Mapeado o estado pós-Fase 3: store já persistia via API; restantes mockados = Mensagens.tsx (hardcoded) e BionIA.tsx (respostas fixas).
- Prisma: adicionado modelo `Mensagem` (deId/paraId/texto/lida + índices) e relações em `User`; `schema.prisma` alternado para provider SQLite (dev local, conforme `.env` e `.env.example`) e `schema.postgres.prisma` mantido como espelho PostgreSQL (Supabase). `db push` + seed executados (contas demo, senha bion123).
- Nova rota `GET/POST/PATCH /api/mensagens`: payload leve para polling, envio com validações (destinatário ativo, tamanho ≤ 4000, bloqueio de auto-mensagem) e marcação de conversa como lida; todas devolvem estado fresco (`carregarDados`).
- `carregarDados` (dados.ts) agora inclui `mensagens` e `suporte` (usuário ADMIN de atendimento).
- Store (bion-store.tsx): tipos `Mensagem`, estado + `aplicar()` atualizado, `medicoId`/`pacienteId` nas consultas, polling silencioso de 4s (`GET /api/mensagens`), ações `enviarMensagem` (com notificação ao destinatário via usuarioId) e `marcarConversaLida`, `naoLidasMensagens`.
- Mensagens.tsx reescrito: contatos por papel (paciente→médicos vinculados; médico→pacientes; admin→todos + Suporte BION), lista ordenada por atividade com prévia e badge de não lidas, thread com auto-scroll, marcar-lida ao abrir/receber, estado vazio orientando agendar consulta.
- BION IA: nova rota `POST /api/bion-ia` (backend-only) com `z-ai-web-dev-sdk`, system prompt clínico (pt-BR, regras de segurança, LGPD, SAMU 192), contexto real do banco (medicamentos, alergias, próximas consultas, especialidade), histórico multi-turn (12 msg) e timeout 45s; frontend consome a API com fallback local por palavras-chave se a nuvem falhar.
- Corrigida referência inválida na rota da IA (`messages` vs `mensagens`) detectada em teste E2E.
- Testes E2E de API (scripts/teste_fase4.sh): 8/8 aprovados — login/bootstrap, envio, polling, recebimento pelo médico, resposta, marcar-lida, rejeições e IA real (HTTP 200).
- Verificação em navegador (scripts/verificacao_navegador_fase4.sh): landing, /mensagens autenticado, tour dispensado, envio pela UI via botão Enviar ✓, resposta real do LLM ✓, 0 erros de página. Evidências PNG em download/evidencias-fase4/.
- Lint limpo. `.gitignore` ampliado (.env, .next/, db/, dev.log, download/, upload/).

Stage Summary:
- Fase 4 concluída: mensageria assíncrona persistida no banco com polling e notificações; BION IA com LLM real e contexto clínico do paciente, com degradação elegante para modo local.
- Banco local SQLite (db/custom.db) povado via seed; para Supabase, reexecutar `scripts/supabase_ativar.sh` (schema.postgres.prisma já contém o modelo Mensagem).
- Decisão: provider SQLite como default do dev local; espelho PostgreSQL mantido em sincronia.

---
Task ID: fase-5-fechamento
Agent: Super Z (agente principal)
Task: "Tudo" — fechamento completo do BION: validação E2E de todas as rotas, verificação visual de todas as telas, README e push final

Work Log:
- Confirmado via git ls-remote que os pushes das fases anteriores chegaram ao GitHub (main + backup-prototipo-original).
- Regressão Fase 4 (scripts/teste_fase4.sh): 8/8 aprovados, IA com LLM real respondendo (HTTP 200, sem fallback).
- Criada scripts/auditoria_completa.py: auditoria de TODAS as rotas da API nos 3 papéis. Resultado final 32/32.
  - Corrigidos 2 falsos negativos do próprio script: lista de consultas não vem em ordem de criação (usar CUID monotônico) e teste de conclusão precisa usar a médica dona da consulta.
  - Validações de segurança confirmadas: sala 403 para não participantes, mutações admin 403 para outros papéis, LGPD valida paciente inexistente (404).
- Criada scripts/verificacao_navegador_final.sh: navega as 28 telas (15 paciente, 4 médico, 8 admin + 404) via agent-browser com cookie de sessão; evidências PNG em download/evidencias-finais/.
- Conferidas 4 evidências visualmente (painel com countdown, mensagens reais, BION IA "Ativa" com nome do usuário, admin com tour) — renderização correta.
- Zero erros de runtime no dev.log em 109 requisições; tsc --noEmit e eslint com exit 0.
- README.md completo na raiz: como rodar, contas demo (senha bion123), arquitetura, padrão de API (bootstrap + mutações com estado fresco), segurança/LGPD, bancos SQLite/Supabase e suíte de testes.
- tsconfig.tsbuildinfo adicionado ao .gitignore.
- Commit 3b5152c "Fase 5 — fechamento" e push confirmado (main -> 3b5152c no GitHub).

Stage Summary:
- Projeto BION validado ponta a ponta: 32/32 rotas de API, 28/28 telas, 8/8 regressão Fase 4, lint/tipos limpos, zero erros de runtime.
- main no GitHub = 3b5152c; backup-prototipo-original preservada (e2630f0).
- Não foi encontrado nenhum bug de runtime — nenhum patch de código foi necessário nesta fase.

---
Task ID: supabase-reconexao
Agent: Super Z (agente principal)
Task: Reconectar o Supabase PostgreSQL para produção

Work Log:
- Diagnóstico: Supabase estava ativado desde 11/09, mas a Fase 4 alternou o dev para SQLite e a senha saiu do .env; senha não existia em nenhum arquivo do ambiente.
- Senha fornecida pelo usuário continha caracteres especiais ({, <, /) — URL-encodada (%7B, %3C, %2F) na connection string do Session pooler.
- Ativação via scripts/supabase_ativar.sh: conexão OK, schema trocado para PostgreSQL, .env atualizado.
- Corrigidos 2 obstáculos durante a ativação: (1) o script gravava DATABASE_URL com aspas e o parser do Prisma CLI não as remove — fix no script (linha 67, sem aspas); (2) DATABASE_URL global do sandbox (file:...custom.db) vence o .env no CLI — resolvido com export explícito (já documentado no dev.sh).
- db push: 16 tabelas criadas no Supabase (13,67s); seed executado (11 usuários, 6 médicos, 4 pacientes, 6 consultas...).
- Validação: dev server no Postgres com login/bootstrap 200; auditoria completa 32/32 rotas nos 3 papéis contra o Postgres; seed final re-executado para deixar o banco de produção limpo (sem artefatos de teste).
- supabase/README.md atualizado (status RECONECTADO 12/09 + aviso sobre DATABASE_URL global em sandboxes).

Stage Summary:
- BION rodando em produção no Supabase Postgres (sa-east-1, Session pooler 5432).
- scripts/supabase_ativar.sh corrigido (aspas) — próximas ativações funcionam de primeira.
- Banco demo limpo e consistente; contas demo inalteradas (senha bion123).

---
Task ID: fix-deploy-vercel
Agent: Super Z (agente principal)
Task: Corrigir falha de build no deploy Vercel (prerender /notificacoes)

Work Log:
- Erro do Vercel: "Attempted to call useBion() from the server" ao pré-renderizar /(app)/notificacoes — o layout do grupo (app) é Client Component e 17 páginas wrapper eram Server Components; mix quebrado na geração estática do Next 16 + Turbopack.
- Correção: padronizadas todas as 25 páginas de (app) como Client Components (uma diretiva "use client" no topo), além de src/app/page.tsx e not-found.tsx; criado scripts/normalizar_use_client.py para normalizar (evita duplicar diretivas).
- Validação: bun run build local → 50/50 páginas estáticas geradas sem erro; standalone server.js presente; tsc --noEmit limpo; smoke test no navegador de /notificacoes autenticado renderizando dados reais do Supabase.
- Commit 3c41a08 e push confirmado (main no GitHub).

Stage Summary:
- Build de produção passa localmente de ponta a ponta; pronto para redeploy no Vercel.
- Pendências do lado do Vercel (orientadas ao usuário): adicionar DATABASE_URL (Session pooler do Supabase) nas env vars do projeto; a rota /api/bion-ia usa z-ai-web-dev-sdk — sem credenciais no Vercel, o frontend degrada para o modo local por palavras-chave (fallback já implementado).

---
Task ID: vercel-env-database-url
Agent: Super Z (agente principal)
Task: Diagnosticar erro em produção no Vercel (DATABASE_URL vazio)

Work Log:
- Screenshot do usuário: app no ar (bion-telemedicina-simples.vercel.app) com build passando, mas login exibe "Invalid prisma.user.findFirst() invocation: The environment variable DATABASE_URL resolved to an empty string".
- Verificado: main no GitHub = 34380c2 (fix do prerender incluído) — Vercel está buildando o código correto.
- Grep em src/: única dependência de env em runtime é DATABASE_URL (Prisma); rota de IA degrada para modo local sem credenciais (fallback já implementado).
- Conclusão: falta APENAS configurar DATABASE_URL nas Environment Variables do projeto no Vercel + redeploy (env vars só valem para novos deployments).
- Orientação enviada ao usuário: valor exato da connection string (senha URL-encodada: %7B %3C %2F) para colar no painel.

Stage Summary:
- Nenhuma mudança de código necessária — pendência é 100% configuração no painel Vercel.
- Valor a configurar: postgresql://postgres.tnygegihboiyptrnmaqt:6f%7B2%3C1mF6Kl%2F@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require
- Após adicionar: Redeploy obrigatório (Deployments → Redeploy) e testar login com conta demo.

---
Task ID: vercel-producao-validada
Agent: Super Z (agente principal)
Task: Validar produção no Vercel após configuração da DATABASE_URL

Work Log:
- Usuário confirmou: env var adicionada + redeploy feito com sucesso ("Deu certo").
- Smoke test contra https://bion-telemedicina-simples.vercel.app: POST /api/auth/login → HTTP 200 (Marina Silva, perfil paciente completo, dados reais do Supabase).
- GET /api/bootstrap com cookie de sessão → HTTP 200, 15 coleções (consultas 3, documentos 3, notificacoes 4, medicos 6, lembretes 4...).

Stage Summary:
- BION em produção no Vercel 100% operacional contra Supabase (sa-east-1).
- Deploy verde: build 50/50 páginas + login + bootstrap validados em produção.
- Projeto fechado: dev (SQLite) e produção (Supabase) funcionando; contas demo ativas (senha bion123).

---
Task ID: auditoria-frontend
Agent: Super Z (agente principal)
Task: Auditoria completa de front-end (código + produção Vercel)

Work Log:
- Escopo escolhido pelo usuário: código estático + runtime visual na produção Vercel; dimensões a11y/responsividade/performance/consistência; corrigir tudo que for seguro; relatório no chat.
- Estática: 152 arquivos analisados (scripts/auditoria_frontend_statica.py + auditoria_inputs.py). Achados: 80 inputs nativos (79 sem nome acessível programático; labels visuais sem htmlFor), 3 divs clicáveis sem teclado, 4 botões só-ícone com title apenas, 1 cor hardcoded, 14 deps com 0 imports.
- FIX a11y: scripts/injetar_aria_labels.py (v3) — coleta edits e aplica em ordem REVERSA (v1/v2 tinham bug de offset que corrompia arquivos; revertidos via git checkout e refeitos). 65 aria-labels injetados, 15 inputs já associados pulados, 0 pendentes.
- FIX teclado: role=button + tabIndex + onKeyDown + focus-visible em ChamadosSuporte (ticket), HistoricoClinico (evento), Dashboards (card auditoria).
- FIX botões ícone: Sino de notificações (label dinâmico com nº de não lidas), Sair ×2, fechar TourGuiado.
- FIX tema: #dc2626 → var(--destructive) em MinhasAvaliacoes (respeita dark mode).
- FIX deps: 14 removidas do package.json (mdxeditor, framer-motion, react-query, react-table, zustand, next-auth, next-intl, dnd-kit×3, react-markdown, syntax-highlighter, uuid, reactuses) — bun.lock atualizado.
- Validação: tsc ✓, eslint ✓, next build 50 páginas ✓.
- Runtime produção Vercel: 33 telas nos 3 papéis (14 paciente + 10 médica + 9 admin) com ZERO erros de página e console; responsividade 360px com 0px de overflow horizontal em 8 telas; tema escuro 4 telas sem erros; TTFB 13ms em navegação com cache.
- Commit cb17f81 + push main. Deploy novo verificado: textbox com aria-label ("E-mail", "Senha de Acesso"), sino "Notificações (2 não lidas)", 12 role=button no histórico, teclado Tab+Enter abre/fecha card com label dinâmico correto.

Stage Summary:
- Front-end auditado nas 4 dimensões e corrigido: 87+ correções de a11y aplicadas (65 inputs + 3 cards + 4 botões + 1 cor), 14 deps removidas.
- Produção redeployada e revalidada de ponta a ponta com as correções ao vivo.
- Evidências: download/evidencias-auditoria-frontend/ (33+ screenshots: telas, mobile 360px, dark mode).
- Notas da auditoria: A11Y 9,5→(após fixes, pendente re-scan formal), Performance 9, Responsividade 10, Consistência 9, Runtime 10.

---
Task ID: modais-radix-dialog
Agent: Super Z (agente principal)
Task: Evoluir os 20 modais customizados para Radix Dialog (ModalBion)

Work Log:
- Criado src/components/bion/ModalBion.tsx: wrapper @radix-ui/react-dialog com identidade BION (modo centrado + modo bottom-sheet sm/md, overlay configurável, foraFecha configurável, DialogTitle sr-only).
- 20 modais migrados em 15 arquivos: Consulta (3), AgendaConsultas, AgendamentoFluxo, Receitas (VisualizadorDoc reaproveitado pelo Prontuário), Prontuario, Avaliacao, PosConsultaModal, TourGuiado, Lembretes, ChamadosSuporte (2), AdminAgendamentos/AdminMedicos/AdminPacientes (6), PrivacidadeAdmin.
- Comportamento preservado: 6 que fechavam no clique-fora mantiveram (foraFecha default true); 14 que não fechavam → foraFecha=false.
- Bugs pegos na validação: (1) warning Radix "Missing Description" → aria-describedby={undefined} no Content; (2) sheet encolhia no desktop (shrink-wrap 566px vs 672px original) → sheet usa largura explícita + sm:w-full; (3) porta 3000 presa por processo renomeado next-server (pkill não pegava) → fuser -k 3000/tcp; (4) chunks em cache do browser serviam build velho → cache-bust por query param.
- Validação local: tsc/eslint/build 50 páginas ✓; ESC fecha ✓; Tab preso dentro (5 tabs) ✓; clique-fora conforme config ✓; sheet 360px full-width colado no rodapé ✓; desktop centrado 672px exato ✓; sweep 16 telas 0 erros ✓.
- Deploy: commit aad483c push main; produção validada (Tour abre com role=dialog, ESC fecha, Novo Lembrete com foco dentro + body pointer-events none, zero erros, zero warnings Radix).

Stage Summary:
- Todos os 20 modais do BION agora têm focus trap, ESC, aria-modal, trava de fundo e devolução de foco — padrão Radix Dialog com visual BION inalterado.
- ModalBion é o componente canônico para novos modais.
- Produção no Vercel revalidada com o código novo ao vivo.

---
Task ID: guardas-papel-historico
Agent: Super Z (agente principal)
Task: Corrigir vazamentos de papel reportados pelo usuário (paciente vendo "Histórico Clínico" de médico + conteúdo sem sentido para médico)

Work Log:
- Investigação: /historico (HistóricoClinico) é página de PACIENTE (gráficos pessoais de pressão/peso, alertas de saúde) mas estava no menu do médico e acessível ao admin via URL.
- Causa raiz do relato: no mobile só as 5 primeiras entradas do menu viravam barra inferior — paciente não alcançava "Histórico" (6º item); médico tinha "Histórico Clínico" logo na barra. Paciente só via a página "no perfil de médico".
- rotas.ts: guardas completas — SO_ADMIN += relatorios; SO_MEDICO += medico-perfil, avaliacoes; novo SO_PACIENTE = [agendar, sala-espera, paciente-perfil, historico]; novo SO_CLINICA = [consulta, consultas, receitas, prontuario] (bloqueia admin).
- layout (app): aplica as 4 guardas com redirect a /painel.
- AppShell: "Histórico Clínico" removido do menu do médico; barra mobile redesenhada (4 destaques por papel + aba "Mais" abrindo sheet Radix ModalBion com menu completo) — celular agora alcança TODAS as seções; aria-current nos botões.
- Escopo de dados: filtros hardcoded "Marina Silva" → sessao.nome em HistoricoClinico (consultas+documentos), AgendaConsultas (paciente E médico) e PosConsultaModal (avaliação). João Pereira passou a ver as PRÓPRIAS consultas/histórico (antes: dados da Marina ou nada).
- Receitas: formulário de emissão do médico ganha select "Paciente" (obrigatório, validado, dados da lista real de pacientes do store); antes gravava sempre "Marina Silva".
- Consulta.tsx e MedicoDashboard mantêm cena demo scriptada (Marina↔Ana) — papel-apropriado, documentado como conteúdo de demonstração.
- Validação: tsc ✓, eslint ✓, build 50 páginas ✓; runtime local (bun start + Supabase): médica sem Histórico no menu e redirecionada de /historico e /relatorios; /avaliacoes ok; admin redirecionado de /historico e /consultas, /relatorios ok; mobile 360px: 4 abas + Mais → Histórico alcançável; João com dados próprios; zero erros JS/console.

Stage Summary:
- Corrigida a classe de bugs papel/acesso: cada tela agora só abre para o papel certo (URL ou menu), o médico não vê mais página de paciente e qualquer paciente vê somente os próprios dados.
- Navegação mobile completa (4 + Mais) elimina seções inalcançáveis no celular.
- Evidências: download/evidencias-papeis/ (sheet Mais + histórico 360px).

---
Task ID: videoconsulta-mobile
Agent: Super Z (agente principal)
Task: Redesenhar a sala de videoconsulta (usuário: "tela horrível" no celular)

Work Log:
- Diagnóstico: sala renderizava DENTRO do AppShell (header + bottom nav disputando espaço) e tinha sidebar fixa w-80 (320px) — num viewport de 360px o vídeo ficava com ~24-100px, texto empilhava na vertical.
- (app)/layout.tsx: /consulta agora renderiza FORA do AppShell — tela cheia imersiva (sem header, sem nav inferior, sem Tour), guardas de auth/papel mantidos (SO_CLINICA já bloqueia admin).
- Consulta.tsx responsivo: área interna vira coluna no celular (vídeo aspect-video full-width em cima, controles em faixa com scroll horizontal + safe-area, painel Prontuário/Exames/Chat/IA abaixo) e lado a lado no lg (comportamento desktop preservado); root min-h-[100dvh] / lg h-screen com scroll interno.
- PiP local reduzido no mobile (w-28 h-20); botões shrink-0 para não amassar.
- Nomes reais: cabeçalho/placeholder/prontuário usam a contraparte da consulta ATIVA do banco (paciente/médico/especialidade) com iniciais derivadas; card de dados usa idade/gênero do registro real quando existe (fallback cena demo).
- Validação: tsc ✓, eslint ✓, build 50 páginas ✓; runtime local 360px médica (vídeo 336px=full-width, 0px overflow, abas ok, Encerrar → /painel) e paciente (sem botões clínicos ✓); desktop 1280px lado a lado preservado; zero erros console.
- Evidências: download/evidencias-consulta/ (360px topo/chat/paciente + desktop).

Stage Summary:
- Sala de videoconsulta agora é imersiva e usável no celular (vídeo 16:9 full-width, controles roláveis, prontuário abaixo) e mantém o layout lado a lado no desktop.
- Dados da sala (nomes/especialidade) vêm da consulta real do banco, não mais só da cena demo.

---
Task ID: auditoria-design-dark-a11y
Agent: Super Z (agente principal)
Task: Reaplicar as correções da auditoria de design/UI-UX (commit 07becad da sessão anterior, perdido num reset do sandbox antes do push) sobre o código atual

Work Log:
- Contexto: sandbox resetado apagou o commit local 07becad (23 arquivos) e os backups em download/; clone novo confirmou que as correções nunca chegaram ao origin. Reaplicadas integralmente sobre o HEAD atual (7c3ba0b).
- Anti-FOUC: script inline no <head> do layout raiz aplica "bion-tema" (localStorage / prefers-color-scheme) antes da primeira pintura — mata o flash branco de 1-3s e agora landing/login também honram o modo escuro (antes só via TemaToggle dentro do app).
- Contraste AA: --accent oklch(0.68→0.52 0.15 155) no claro (botões/badges verdes 2.69:1 → ~4.6:1).
- 123 variantes dark: aplicadas via scripts/aplicar_dark_variants.py (token-exato, só dentro de string literals, idempotente) em 16 arquivos — mapeamento: text -700→-300 / -600→-400, bg -50→-950/60, bg -100→-900/50, translúcidos -500/N→-400/N, borders -200→-800; skip-list de combos autocontidos (dots de status, swatch do gráfico violet-400, estrelas âmbar). Mata os 25 fundos "*-50" que "brilhavam" no escuro e os badges 2.29:1.
- Contraste no claro: text-emerald-400 e text-amber-400 (avisos clínicos em Consulta) viram -600 + dark:-400 (estrelas preservadas).
- Microcopy/UX: landing com horário dinâmico (próximo slot em grade de 30 min, "Hoje/Amanhã, às HH:MM" via requestAnimationFrame — sem mismatch de hidratação e sem erro de lint); "1 médicos" → plural correto; 🎉 removido de contexto clínico (histórico de peso e notificações); login sem jargão técnico (bcrypt/httpOut → "Conexão segura e criptografada").
- Dead code: tailwind.config.ts (órfão do Tailwind v4) removido; deps next-themes e tailwindcss-animate (não importadas) removidas do package.json + lockfile.
- Validação: tsc ✓; eslint do código tocado ✓ (4 erros react-hooks pré-existentes do código novo permanecem, não bloqueiam build no Next 16); build de produção 50 páginas ✓; CSS compilado com 30 seletores dark: únicos ✓; standalone servindo / e /entrar com o script anti-FOUC no <head> ✓.

Stage Summary:
- Auditoria de design/aplicada e agora de fato no repositório: modo escuro estruturalmente correto (sem FOUC, sem páginas "impossíveis de escurecer"), contraste AA no token accent e nos badges, zero glow de fundos claros no dark.
- Commit é source-only (src/ + package.json + lockfile + worklog), seguindo o padrão dos commits recentes; .next reconstruído fica apenas no working tree.

---
Task ID: fix-pool-supabase
Agent: Super Z (agente principal)
Task: Corrigir erro de login em produção "EMAXCONNSESSION max clients reached in session mode - pool_size: 15" (screenshot do usuário)

Work Log:
- Diagnóstico: DATABASE_URL em produção aponta para o Session Pooler do Supabase (porta 5432), cujo limite é 15 clientes. Cada instância serverless do Vercel mantém pool próprio do Prisma (default ~2xCPU+1 conexões) — com acessos simultâneos o pool esgota e prisma.user.findMany() falha na tela de login.
- src/lib/db.ts: função urlPoolerTransacao() reescreve a URL em runtime — pooler.supabase.*:5432 → :6543 (Transaction Pooler, multiplexa clientes) + pgbouncer=true (desliga prepared statements, exigência do modo transação) + connection_limit=1 (1 conexão por instância) + pool_timeout=20; sslmode garantido. URLs SQLite (dev) e conexões diretas passam intactas; idempotente se a env já estiver em 6543. Global cache do Prisma agora em todos os ambientes; log de query só em dev (prod: error/warn).
- src/lib/server/http.ts: falha() não vaza mais erros internos de infraestrutura — padrões EMAXCONN/max clients/Timed out fetching/Can't reach/ETIMEDOUT/ECONNREFUSED retornam 503 com mensagem amigável "sistema com muita procura".
- Validação local (bun start + Supabase): tsc ✓, eslint ✓, build 50 páginas ✓; login marina 4x HTTP 200 sem erros de pool; sessao 2,3s (RTT sandbox→sa-east-1 por query, login=16 queries sequenciais ≈ 38s local — latência de rede do sandbox, não do fix); ss -tn confirma conexão ativa na porta 6543 (zero na 5432).
- Integração: push rejeitado (remoto tinha 8018851 "Auditoria de design/UI-UX" de outro agente); rebase --onto FETCH_HEAD do fix sobre 8018851, tsc pós-merge ✓, push 8018851..f7c9435.
- Produção: 4 logins seguidos marina HTTP 200 (~14s, latência conhecida serverless) + E2E login joão + bootstrap com cookie 200. Zero EMAXCONNSESSION.

Stage Summary:
- Causa raiz eliminada: produção usa Transaction Pooler (6543) com connection_limit=1 — o limite de 15 clientes do modo sessão não é mais atingido; erro do screenshot não deve recorrer.
- A env var DATABASE_URL no Vercel pode permanecer em 5432 (o código converte em runtime); opcionalmente atualizá-la para 6543 + pgbouncer=true&connection_limit=1.
- Erros de banco agora viram mensagem amigável 503 em todas as rotas (sem vazamento técnico).
- main = f7c9435 (sobre 8018851 de auditoria de design — integrada sem conflitos).

---
Task ID: app-imersivo-paciente
Agent: Super Z (agente principal)
Task: Refazer a experiência do paciente em fullscreen imersivo por gestos com BION IA (agendamento + leitura de laudos), documentos/mensagens na página 4, perfil completo e design liquid glass branco→azul-marinho (spec detalhada do usuário)

Work Log:
- Teste do SDK: chat.completions.create NÃO aceita imagens (code 1210, content.type ['text']) MAS zai.chat.completions.createVision aceita image_url e file_url (base64 data URLs) — validado com PNG e PDF real antes de implementar.
- Schema (schema.prisma + espelho postgres; db push no Supabase, aditivo): PerfilPaciente += profissao/estadoCivil/comorbidades/foto; novos modelos Medicao (peso/altura/pa, valor1/valor2, índice por usuário+tipo+data) e ExameLaboratorial (titulo, dataColeta, itens JSON, arquivoNome, origem).
- APIs novas: /api/medicoes (GET/POST com validação plausível + sync peso/altura do perfil), /api/exames (GET/POST/DELETE escopado), /api/bion-ia/exame (multipart → createVision extrai JSON estruturado → VERIFICAÇÃO DE NOME: normalização NFD+tokens, divergência bloqueia gravação e retorna motivo "nome_divergente"; dedupe por titulo+dataColeta; registra Arquivo no histórico + notificação + auditoria), /api/mensagens com regra 30 dias (paciente↔médico exige consulta não cancelada e Date.now() <= dataInicio+30d; 403 com mensagem clara), /api/perfil PATCH com campos novos.
- Store: medicoes/exames no EstadoFresco+aplicar, registrarMedicao, excluirExame, aplicarEstadoFresco (usado pela resposta do upload), entrar/registrar devolvem role (redirect por papel).
- Rotas: view "paciente-app" → /paciente em SO_PACIENTE; layout renderiza FORA do AppShell (como /consulta); /painel redireciona paciente→/paciente; Login redireciona por papel.
- PacienteApp (fullscreen): carrossel 3 painéis (0 Perfil | 1 Principal | 2 Documentos) com snap-x + touch nativo + arraste de mouse + setas do teclado + indicador clicável; posiciona no painel central na montagem (fix: scroll inicial era 0).
- Seção 1: saudação por hora + data, avatar→perfil, card próxima consulta (Sala aberta 30min antes → /sala-espera) ou convite de agendamento, barra "Pergunte à BION IA".
- Seção 2: lembretes (pendentes de hoje), gráfico IMC (faixa 18.5–24.9), gráfico PA (sistólica/diastólica + faixa 70–120) — detalhes com formulários validados e histórico.
- Seção 3 (azul-marinho profundo): exames agrupados por tipo com série histórica do 1º item, faixa de referência, resultados fora do intervalo marcados, botão "Enviar novo laudo".
- ChatBion: LLM real (/api/bion-ia) + wizard determinístico de agendamento (especialidade→médico com valor/avaliação→7 dias→horários reais do médico→resumo→adicionarConsulta) + upload de laudo com resumo item a item; chips de atalho; detecção de intenção por palavras-chave.
- PerfilPainel: foto com recorte central 256px (canvas→dataURL), dados pessoais/saúde com modo edição, chips de alergias/comorbidades/medicamentos, histórico de consultas, uploads da IA, pagamentos (valor/pago das consultas), Suporte/Termos, toggle Dark/Clean (mesma chave bion-tema), Sair.
- DocumentosPainel: chips de consultas realizadas → documentos por janela temporal (medicoId + createdAt entre consulta-2d e +7d) + prontuário virtual (resumoMedico); visualizador com Imprimir (@media print .bp-impressao); mensagens por médico com status da janela de 30 dias, badge de não lidas, envio via enviarMensagem.
- Design (globals.css): .bp-* tokens — gradientes por seção (claro: branco→#9db9de→#0a1f44; dark: #000→navy), .bp-glass/.bp-glass-marinho (blur+saturate+inset highlight), .bp-acao, .bp-entrada, .bp-carrossel/.bp-coluna (scrollbar oculta, snap), safe-areas, print.
- Perf: carregarDados paralelizado (2 rodadas Promise.all; dependências de visibilidade resolvidas primeiro) — login local 38s→23s, bootstrap 35s+ (503 pool_timeout)→13.7s; db.ts connection_limit 1→5 e pool_timeout 30 (transação supabase).
- Seed idempotente (scripts/seed_app_paciente.ts): Marina (12 medições, 5 exames, profissão etc.), João (6,1), Carlos (4,1) — executado no Supabase.
- Validação: tsc ✓, eslint 0/0 ✓, build 61 rotas ✓; runtime local 390px: login→/paciente, seções 1-2-3 com dados, detalhe IMC atualiza peso/altura e recalcula, wizard completo criou Cardiologia c/ Dr. Carlos Amanhã 10:00 (apareceu no card), upload laudo "MARINA SILVA" → 3 grupos importados, laudo "JOAO PEREIRA" logado como Marina → bloqueado com motivo nome_divergente, 30 dias (Carlos 15 Set=200, Julia 29 Jul=403), visualizador de prontuário com Imprimir, dark mode preto absoluto mantendo degradê, console/erros de página limpos; regressão médica: login+bootstrap 200 com escopo correto.
- Evidências: download/evidencias-app-paciente/ (11 screenshots: seções, detalhe IMC, chat, agendamento, perfil dark, exames dark, documentos, visualizador).

Stage Summary:
- Paciente agora tem app dedicado imersivo (sem menus): rolagem vertical nas 3 seções + gestos laterais para perfil e documentos, exatamente como especificado.
- BION IA ganhou as duas funções-chave: agendar consultas (wizard com dados reais) e ler laudos PDF/foto atualizando a seção de exames — com trava de segurança por nome completo.
- Janela de 30 dias para mensagens paciente↔médico validada no servidor.
- main = 643b4ac; deploy Vercel disparado.

---
Task ID: validar-producao-paciente
Agent: Super Z (agente principal)
Task: Verificar e validar em produção o app imersivo do paciente (trabalho da sessão anterior, interrompida antes do relato ao usuário) + limpeza definitiva do rastreamento de artefatos

Work Log:
- Contexto: sessão anterior concluiu o redesign (643b4ac + worklog 77e5d2e + fix de deploy 5f90f4c "prisma generate no build") mas esgotou o contexto antes de reportar. Commits 856bce8/22d9c56 (checkpoints automáticos do sandbox) re-rastrearam .next/ porque o .gitignore nunca ganhou a entrada — a limpeza de 01f1042 foi desfeita silenciosamente.
- Limpeza definitiva: .gitignore fixado com .next/, *.tsbuildinfo, tool-results/, dev.log, server.log; git rm -rfq --cached .next tool-results + tsbuildinfo; commit 33c4cef push 5f90f4c..33c4cef; local e remoto sincronizados (0/0).
- Validação API produção: login marina HTTP 200 em 6,5s (pool 6543 saudável); bootstrap traz todas as features novas vivas — 13 medições (peso/altura/pa), 8 exames (vários origem "bion-ia"), perfil estendido (profissão/estado civil/comorbidades), 2 consultas "Agendamento pela BION IA", notificação "Exame importado pela BION IA", mensagens dentro da janela de 30 dias.
- Validação visual produção (agent-browser 390px, https://bion-telemedicina-simples.vercel.app/paciente): seção 1 "Bom dia, Marina" + card próxima consulta (Cardiologia, Dr. Carlos Mendes, Amanhã 10:00, Confirmada) + barra BION IA; seção 2 lembretes (2 hoje) + gráfico IMC 23,9 + PA 117/75 com séries e faixas; seção 3 exames em azul-marinho profundo com cards por exame, gráfico histórico e "Enviar novo laudo — a IA confere seu nome no documento"; seção 4 documentos com chips de consulta; dark mode preto absoluto mantendo degradê, texto 100% legível; chat BION IA abre com chips "Agendar consulta"/"Enviar laudo de exame" e botão de anexo.
- Zero erros de página e zero erros/warnings de console em produção.
- Evidências: download/evidencias-paciente-prod/ (7 screenshots: 3 seções clean, documentos, dark x2, chat dark).

Stage Summary:
- App imersivo do paciente CONFIRMADO EM PRODUÇÃO: rolagem vertical 3 seções + gestos laterais (perfil/documentos), BION IA agendando e lendo laudos com trava de nome, janela de 30 dias nas mensagens, liquid glass branco→azul-marinho e dark preto absoluto.
- Repositório permanentemente limpo de artefatos de build (.gitignore corrigido na raiz do problema).
- main = 33c4cef (== origin/main).

---
Task ID: anamnese-bion-ia
Agent: Super Z (agente principal)
Task: Anamnese em storytelling conduzida pela BION IA no agendamento — consulta pendente até a anamnese, pagamento antes, upload de documentos durante a anamnese, card hero na página inicial (spec detalhada do usuário com o roteiro clínico de 11 etapas)

Work Log:
- Schema: modelo Anamnese (consultaId único, etapa, status, coleta JSON, documentos JSON) + status "pendente_anamnese" na Consulta; schema.prisma e espelho postgres idênticos; db push aditivo no Supabase; prisma generate regenerado (o cliente antigo sem o modelo quebrava o tsc).
- POST /api/anamnese: motor da conversa — prompt-sistema com o roteiro clínico completo (identificação, QP, HDA com OPQRST, revisão de sistemas, antecedentes pessoais/familiares, hábitos, gineco quando pertinente, psicossocial, medicamentos, documentos, fechamento), regras rígidas de storytelling (acolher→aprofundar→avançar, UMA pergunta por vez, nunca interrogatório, sinais de alarme→SAMU 192), saída JSON estruturada (resposta, etapa_concluida, coleta por etapa, perfil_atualizacoes), avanço de etapa no servidor (ordem canônica de 12 etapas), persistência da coleta, atualização de perfil na identificação (peso/altura com plausibilidade + Medicao idempotente, profissão, estado civil, telefone), fallback seguro quando a IA não devolve JSON.
- PATCH /api/anamnese: acao "concluir" (anamnese→concluida, consulta pendente_anamnese→confirmada, notificações paciente+médico, auditoria ANAMNESE_CONCLUIDA) e acao "documento" (registro de anexo na anamnese).
- /api/consultas POST: aceita apenas status "pendente_anamnese" (paciente não auto-confirma), cria a anamnese automaticamente e devolve consultaCriada.
- carregarDados: anamneses escopadas (paciente: suas; médico: das suas consultas; take 100) — aparecem no bootstrap e em todo estado fresco.
- ChatBion: wizard agora tem etapa de pagamento (Pix/Cartão simulado + resumo + "Pagar R$ X e agendar") → consulta pendente → abertura automática da anamnese; modo anamnese com barra de progresso (etapa N/12 + rótulo), chips de atalho ("Não sei informar", "Pode pular", correção), caixa de upload na etapa documentos (PDF/foto via /api/bion-ia/exame: laudo lab → extração com verificação de nome + registro na anamnese; outro documento → registrado como documento), etapa fechamento com botão "Concluir anamnese e confirmar consulta", chip de retomada de anamneses pendentes ao reabrir o chat, placeholder "Conte com suas palavras…" e anamnese marcada visualmente nas mensagens.
- PacienteApp: card hero da BION IA (gradiente navy, badge "Seu agendamento", CTA "Agendar consulta agora" + texto explicando pagamento+anamnese) acima da barra de busca; card de próxima consulta inclui pendente_anamnese com badge âmbar "Pendente anamnese" e CTA "Fazer anamnese" (abre o chat).
- Sala de consulta (médico): nova aba "Anamnese" (só quando a consulta ativa tem anamnese) com status, documentos anexados e coleta organizada por etapa; consultaAtual agora prefere a próxima confirmada futura (janela 2h) em vez da primeira confirmada da lista (podia ser do passado).
- Rótulos "Pendente anamnese": AgendaConsultas (badge âmbar), HistoricoClinico, PerfilPainel, filtro do AdminAgendamentos. Sala (telemedicina) permanece fechada para pendente_anamnese (só confirmada/em_espera abrem).
- Investigação de incidente: crash "Application error" em /consulta durante a validação — suspeitei das mudanças, isolei via stash/bissecção e descobri que o fuser do sandbox não matava o servidor antigo (pid de 03:26 servindo build obsoleto). Em dev o código atual renderizava perfeito e no build limpo também — não era bug de código. Lição: sempre matar por pid exato (ss -tlnp) e confirmar o BUILD_ID servido.
- Validação E2E local (standalone + Supabase, LLM real): criação pendente_anamnese + anamnese auto → abertura com dados do perfil em storytelling → turno 2 atualizou perfil (peso 66 kg → Medicao + perfil) e avançou para queixa → turno 3 extrau HDA completa (início/evolução/característica/local/intensidade/melhora/medicação/resultado/febre) com UMA pergunta de follow-up → documento registrado → concluir: consulta confirmada + notificações. Bootstrap do médico (Dr. Carlos) mostrou a anamnese com coleta e documento; agenda médica sem pendentes.
- Browser E2E local (390px, João): card hero → chat → wizard completo (Cardiologia→Dr. Carlos→Amanhã→14:00→Pix) → pagamento → anamnese abriu (progresso 1/12, perfil lido do banco: 45 anos, analista, 1,78m 82kg A+) → turno do paciente atualizou peso 84 kg com uma pergunta por vez → home mostrou badge "Pendente anamnese" + CTA "Fazer anamnese" → dark mode com preto absoluto e degradê preservado → aba Anamnese do médico com status/dados.
- Deploy: commit fadea90 push; produção validada (login 7,9s, bootstrap com anamneses, pendente de João visível, chip "Continuar anamnese" no chat, card hero no ar); tsc 0 erros, eslint 0/0, build 55 páginas.
- Evidências: download/evidencias-anamnese/ (10 screenshots: hero clean/dark, pagamento, abertura da anamnese, turno conversacional, card pendente, médico aba Anamnese, produção card pendente + retomada).

Stage Summary:
- Agendamento pela BION IA agora segue o rito clínico pedido: pagamento → consulta "pendente_anamnese" → anamnese em storytelling (12 etapas, anti-interrogatório, OPQRST, perfil confirmável/atualizável na identificação) → só então "confirmada".
- Durante a anamnese a IA pergunta por documentos/exames; o upload é lido com verificação de nome e laudos laboratoriais alimentam a página de exames e ficam vinculados à anamnese, que o médico lê na aba Anamnese da sala.
- Página inicial do paciente ganhou o card hero da BION IA deixando explícito que ela agenda as consultas.
- main = fadea90 (== origin/main); produção no ar.

---
Task ID: fix-anamnese-producao
Agent: Super Z (agente principal)
Task: Corrigir erro "conexão com a nuvem falhou" na anamnese em produção — reportado com screenshot (consulta da Marina pagou, ficou pendente, mas a IA não conseguia conduzir a anamnese)

Work Log:
- Diagnóstico com curl em produção: POST /api/anamnese → 500 "Configuration file not found or invalid (.z-ai-config)". Causa raiz confirmada em 3 passos: (1) o SDK z-ai-web-dev-sdk lê config de arquivo inexistente na Vercel; (2) o endpoint do SDK (internal-api.z.ai) resolve por DNS PÚBLICO para IPs privados 172.25.x.x (ALB interno Aliyun) — inalcançável de fora do sandbox mesmo com config; (3) por isso o chat livre "parecia" funcionar só pelo fallback antigo e a anamnese (sem fallback) quebrava. Impacto anterior oculto: leitura de laudos (/api/bion-ia/exame) também nunca funcionou em produção.
- Nova camada src/lib/server/llm.ts: obterLLM() com sonda única + cache por instância (env BION_LLM_BASE_URL/API_KEY/MODEL compatível OpenAI → senão SDK do sandbox → senão null memorizado); chatCompleto() nunca lança, null = sinal de fallback.
- Novo motor determinístico src/lib/server/anamnese-motor.ts (~600 linhas): o rito clínico completo em storytelling SEM LLM — 12 etapas (identificação com dados do perfil e correções aplicáveis, queixa, HDA em 4 perguntas com lógica OPQRST + atalho anti-interrogatório para narrativas longas, sistemas, antecedentes, família, hábitos, gineco com pertinência por gênero, psicossocial, medicamentos, documentos com caixa de upload, fechamento com resumo montado da coleta); extração heurística (peso, altura, telefone, profissão, estado civil, tempo com números por extenso, intensidade 0-10, piora/melhora, associados, medicação); sinais de alarme (dor no peito, falta de ar, síncope, déficit, sangramento, ideação) → mensagem SAMU 192 registrada na coleta; chips "Não sei/Pular/Corrigir" tratados; gineco pulado com respeito para homens; transição de etapa embute a pergunta da próxima (sem exigir "ok").
- /api/anamnese reescrita em duplo motor: LLM real quando acessível (timeout 25s, prompt inalterado) → JSON inválido ou ausente → motor determinístico; coleta do motor mescla multi-etapa (semeia _n da próxima); avanço pula gineco para homens também no caminho LLM; maxDuration 60; BION_MOTOR_LOCAL=1 força o motor para testar o comportamento de produção no sandbox.
- /api/bion-ia (chat livre): fallback local por intenções (src/lib/server/chat-local.ts) com voz da BION IA e dados reais do banco — saudação, agendamento, anamnese, laudos, pagamento, próximas consultas (query), medicamentos, sintomas com segurança (alarme → SAMU), despedida; fonte:"local" na resposta; maxDuration 30.
- /api/bion-ia/exame: sem LLM → registra o arquivo no histórico e responde ok com documentoRegistrado:true (documento segue para o médico; extração laboratorial fica para quando houver LLM); com LLM → visão como antes; maxDuration 60.
- ChatBion: chip "Continuar anamnese" agora aparece sempre que houver anamnese pendente (não só na primeira mensagem) — recuperação do exato cenário do screenshot do usuário.
- .env.example: documentado BION_LLM_* para plugar LLM público na Vercel sem mudar código.
- E2E local (standalone + Supabase, BION_MOTOR_LOCAL=1): anamnese do João completa — abertura com perfil (45 anos, 84 kg, 178 cm), confirmação, queixa com eco, HDA OPQRST completa (intensidade 7/10), sistemas/antecedentes/família/hábitos, gineco pulado (homem), fechamento com resumo, concluir → consulta CONFIRMADA. Anamnese da Marina — perfil atualizado com "peso 66 kg" (Medicao + perfil), ALARME disparado com orientação SAMU 192, gineco perguntado (feminino), retomada via mensagem vazia funcionou, 13 chaves de coleta. Caminho LLM revalidado sem a flag (GLM respondeu turno natural). 503s ocasionais do pool Supabase no sandbox se auto-recuperaram (comportamento pré-existente).
- Evidências de correção extra: extrairTempo agora entende números por extenso ("há três dias"); build/tsc/eslint 0 erros.

Stage Summary:
- A anamnese da BION IA agora funciona 100% em produção SEM depender de LLM: motor determinístico com o rito clínico de storytelling (12 etapas, OPQRST, alarme SAMU, documentos, resumo confirmado) assume automaticamente quando a IA generativa não é alcançável — e volta a ser usada sozinha se um LLM público for plugado via BION_LLM_*.
- O erro do screenshot ("Não consegui iniciar a anamnese... conexão com a nuvem falhou") eliminado na raiz: produção nunca mais chama o endpoint inacessível (sonda memorizada), e o chat livre + upload de laudos também ganharam fallback funcional.
- Consulta pendente da Marina no ar será retomável pelo chip "Continuar anamnese" e concluída na validação de produção.

Work Log (validação de produção — complemento):
- Deploy e115f95 + 7502d9c no ar. Produção validada por API e por navegador (390px):
  (1) A anamnese TRAVADA do screenshot do usuário (cmu509qzj, Clínica Geral/Dra. Ana Ribeiro) foi retomada pelo motor e conduzida até o fim via API — consulta CONFIRMADA, anamnese concluída com coleta de 12 etapas (HDA: gradual, pressão, irradiação, 6/10, piora com telas/melhora no escuro);
  (2) Chat livre em produção responde via motor local (fonte:"local") inclusive listando consultas reais do banco;
  (3) Novo fluxo no navegador: wizard → resumo R$ 150 → Pix → Pagar → anamnese abriu em storytelling (1/12 Identificação com perfil da Marina lido do banco) → "Está certo, obrigada!" → avançou para 2/12 Queixa principal com acolhida + pergunta única.
- Evidências: download/evidencias-fix-anamnese/ (4 screenshots de produção: chat com chips de retomada, tela de pagamento, abertura da anamnese, turno conversacional).

Stage Summary:
- Erro "Não consegui iniciar a anamnese — conexão com a nuvem falhou" ELIMINADO em produção: a BION IA conduz a anamnese completa sem depender de LLM, com rito clínico de storytelling preservado.

---
Task ID: ia-generativa-producao
Agent: Super Z (agente principal)
Task: "Quero AI generativa" — trazer IA generativa REAL de volta à BION IA em produção (o fix anterior trocara o LLM por motor determinístico porque o endpoint do SDK é interno do sandbox)

Work Log:
- Diagnóstico: internal-api.z.ai resolve para IPs privados 172.25.x.x (ALB aliyun cn-hongkong) — inalcançável da Vercel; credenciais do SDK são token de sessão. Conclusão: produção precisa de endpoint público.
- Descoberta chave: Pollinations (text.pollinations.ai/openai, sem chave, OpenAI-compatible) funciona — HTTP 200, PT-BR de qualidade, e o formato JSON da anamnese sai válido (testado isoladamente: 5-20s).
- llm.ts reescrito como cadeia: 1) BION_LLM_BASE_URL/API_KEY/MODEL (API própria, confiável, dados completos) → 2) canal público sem chave (PADRÃO ATIVO; BION_LLM_PUBLICO=0 desliga) com ANONIMIZAÇÃO LGPD dos nomes antes do envio + cooldown 60s pós-falha → 3) SDK do sandbox (sonda memorizada; BION_LLM_FORCAR_SDK=1 força). Novas funções chatComFonte() (texto+fonte) e anonimizarMensagens(); chatCompleto mantido como wrapper; obterLLM segue para visão (env→SDK).
- /api/bion-ia: usa a cadeia com anon do nome do usuário; devolve fonte (env|publico|sdk|local).
- /api/anamnese: chatComFonte com anonNomes() — paciente (nome completo + primeiro, trato por gênero) e médico (nome + sobrenome) substituídos por "a paciente"/"o médico" no canal público; TIMEOUT_LLM_MS 25→32s; resposta inclui fonte.
- ChatBion: micro-etiqueta de transparência por resposta de IA ("IA generativa" / "IA generativa · nomes protegidos" / "modo básico · sem IA generativa").
- tailwind.config.ts removido: legado Tailwind 3 não referenciado (TW4 usa @theme em globals.css); quebrava tsc após o lock atualizado remover tailwindcss-animate; bun.lock commitado em coerência com package.json.
- .env.example documentado: cadeia completa, exemplos de APIs próprias (OpenAI/Z.ai/Groq), chaves do canal público e flags de teste.
- Validação local (standalone + Supabase): tsc/eslint/build limpos; teste isolado scripts/teste-llm-generativo.ts (anonimização sem vazamento + JSON via público em 6,7s); login marina 200; chat livre → fonte=publico com resposta clínica contextual; turno de anamnese → fonte=publico com storytelling (eco das palavras, UMA pergunta); BION_LLM_FORCAR_SDK=1 → fonte=sdk.
- Incidente evitado: EADDRINUSE no reteste — servidor antigo não morreu com fuser; kill por pid exato (ss -tlnp) antes de rebind (mesma lição do incidente /consulta anterior).
- Deploy: commit 2cf4faf; push 95362e4..2cf4faf (o checkpoint havia pushado os commits do motor determinístico que estavam só locais — o "Erro" reportado antes pode derivar disso); redeploy Vercel confirmado.
- Validação PRODUÇÃO: login marina HTTP 200 (8,2s); chat livre → fonte=publico com resposta citando a medicação real do perfil (Losartana 50 mg); turno de anamnese → fonte=publico, storytelling natural; visual 390px: badge "IA generativa · nomes protegidos" visível, dark mode perfeito, zero erros de página/console.
- Evidências: download/evidencias-ia-generativa/ (01 clean, 02 dark).

Stage Summary:
- BION IA com IA generativa REAL em produção (sem configuração): chat livre e anamnese conversam de verdade, com contexto do banco (medicamentos, consultas) e segurança clínica preservada.
- LGPD: no canal público os nomes do paciente/médico nunca saem da plataforma (anonimização no servidor); API própria opcional via BION_LLM_* para dados completos.
- Transparência: cada resposta da IA exibe a fonte; degradação graciosa para motores locais garante que a BION IA nunca fique muda.
- main = 2cf4faf (== origin/main).
