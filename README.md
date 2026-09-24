# BION Telemedicina

Plataforma completa de telemedicina: consultas por vídeo (WebRTC P2P), mensageria paciente↔médico, assistente de IA clínica, prontuário eletrônico, receitas/atestados em PDF, agendamento, lembretes, avaliações, suporte, auditoria e controles LGPD.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Prisma + PostgreSQL (Supabase, banco oficial em todos os ambientes) · z-ai-web-dev-sdk (LLM) · jsPDF.

---

## Como rodar

```bash
bun install                # ou npm install
bash scripts/dev.sh        # sobe em http://localhost:3000
```

O `scripts/dev.sh` garante que a `DATABASE_URL` do `.env` prevaleça sobre qualquer variável global do ambiente.

### Contas demo (senha: `bion123456`)

| Papel | E-mail |
|---|---|
| Paciente | `marina.silva@email.com` |
| Médica | `julia.lima@med.bion.app` |
| Admin | `admin@bion.app` |

Outros pacientes: `joao.pereira@email.com`, `carlos.souza@email.com`. Outros médicos: `ana.ribeiro@med.bion.app`, `carlos.mendes@med.bion.app`, etc. Novos usuários podem se registrar em `/entrar`.

---

## Funcionalidades

**Paciente**
- Agendamento com especialista (valor, pagamento, remarcação e cancelamento com motivo)
- Sala de espera e teleconsulta por vídeo real (P2P, com chat na sala, compartilhamento de tela, degradação para áudio/escuta quando não há câmera)
- Mensagens com a médica vinculada e com o Suporte BION (polling de 4s, não lidas, notificação ao destinatário)
- BION Saúde IA: assistente clínico com LLM real, ciente de medicamentos, alergias e próximas consultas do paciente (com fallback local por palavras-chave)
- Histórico clínico, receitas/atestados em PDF, anexo de exames, lembretes de medicação, avaliações, privacidade/consentimentos LGPD

**Médico**
- Painel com próximas consultas, pacientes vinculados, prontuário do paciente
- Emitir receita/atestado (PDF), concluir consulta com resumo clínico, anexar arquivos
- Responder mensagens e chamados

**Admin**
- Gestão de médicos e pacientes (criar, editar, suspender, excluir, anonimizar LGPD)
- Gestão de agendamentos (reagendar, trocar médico, status, pagamento)
- Relatórios operacionais, trilha de auditoria, atendimento de chamados, controles LGPD

---

## Arquitetura

```
src/
  app/
    page.tsx              # landing pública
    entrar/               # login e registro
    (app)/                # telas autenticadas (App Shell com sidebar)
      painel/ agendar/ consultas/ sala-espera/ consulta/ mensagens/
      bion-ia/ historico/ receitas/ prontuario/ lembretes/ avaliacoes/
      notificacoes/ perfil/ privacidade/ ajuda/ suporte/
      medico-pacientes/ medico-perfil/
      admin-agendamentos/ admin-medicos/ admin-pacientes/ usuarios/
      relatorios/ auditoria/
    api/
      bootstrap/          # GET — estado completo do usuário (carga inicial)
      auth/               # login, logout, registro, sessão (bcrypt + cookie httpOnly + Sessao no banco)
      consultas/          # POST criar (status/pagamento decididos no servidor) · [id] PATCH
      pagamentos/webhook/ # webhook do gateway de pagamento (HMAC-SHA256)
      telemedicina/[id]/sala/   # GET/POST — sinalização WebRTC (SDP, ICE, chat, controle)
      mensagens/          # GET/POST/PATCH — mensageria assíncrona
      bion-ia/            # POST — LLM com contexto clínico (backend-only)
      notificacoes/ documentos/ arquivos/ lembretes/ avaliacoes/
      consentimentos/ tickets/ perfil/
      pacientes/ medicos/ auditoria/ admin/lgpd/
  components/bion/        # telas e componentes de negócio
  lib/
    server/               # auth (sessões, papéis, auditoria), dados (carregarDados/side-effects), pagamentos
    use-teleconsulta.ts   # hook WebRTC completo (papéis fixos, reconexão, trickle ICE)
    bion-store.tsx        # store React (estado + mutações + polling)
    receita-pdf.ts / prontuario-pdf.ts
prisma/
  schema.prisma           # schema ÚNICO — provider PostgreSQL (Supabase)
  seed.ts                 # contas demo + dados iniciais
supabase/                 # guia de ativação do Supabase
scripts/                  # testes E2E, auditoria de API, ativação Supabase, verificação em navegador
```

**Padrão de API:** `GET /api/bootstrap` devolve o estado completo (consultas, mensagens, notificações, documentos, lembretes, avaliacoes, consentimentos, tickets, perfil…). Mutações frequentes respondem em DELTA (apenas a entidade criada/atualizada): `POST /api/consultas`, `PATCH /api/consultas/[id]`, `PATCH /api/notificacoes` e `POST /api/mensagens`. Notificações e trilha de auditoria são geradas PELO SERVIDOR a partir do evento real — o cliente não as envia.

**Segurança:** senhas com bcrypt (custo 10), sessões opacas de 32 bytes no banco com cookie httpOnly (`secure` em produção, 7 dias) e revogação imediata quando a conta é desativada/suspensa, autorização por papel em cada rota (`exigirPapel`), sala de teleconsulta restrita aos participantes 1:1 (403 para terceiros, inclusive admin), limites por minuto na sinalização, auditoria com identidade da sessão (cliente só registra eventos leves de interface, via whitelist), pagamento confirmado exclusivamente no servidor (gateway simulado ou webhook assinado com HMAC — o cliente nunca define `pago`), status de consulta imposto pelo servidor (paciente nasce `pendente_anamnese`; só a conclusão da anamnese confirma), relacionamentos sempre por ID (nunca por nome), mídia WebRTC cifrada (DTLS-SRTP).

---

## Banco de dados

- **PostgreSQL (Supabase) é o banco oficial em todos os ambientes** — o `prisma/schema.prisma` é o schema único (provider `postgresql`). Não há mais alternância nem fallback SQLite.
- **Produção:** ver `supabase/README.md` para trocar a `DATABASE_URL` e rodar `bash scripts/supabase_ativar.sh`.
- **Local:** aponte o `.env` para o Session Pooler do Supabase e rode `bun prisma db push && bun prisma/seed.ts`.

## Hardening (auditoria de produção)

Regras importantes que o servidor impõe (o cliente não decide):

1. **Sessão** — cookie `secure` em produção; sessão revogada na hora se a conta for desativada/suspensa.
2. **Pagamento** — o cliente não envia `pago`; o servidor cria a cobrança (modelo `Pagamento`) e confirma via gateway simulado (demo) ou `POST /api/pagamentos/webhook` assinado com HMAC (`BION_PAGAMENTO_WEBHOOK_SECRET`). Idempotente.
3. **Status da consulta** — criação pelo paciente nasce sempre `pendente_anamnese`; só a conclusão da anamnese (servidor) confirma. Remarcar não auto-confirma; `atualizar` (admin) valida status contra whitelist.
4. **Notificações** — geradas pelo servidor a partir do evento real; `POST /api/notificacoes` foi removido (405).
5. **Auditoria** — eventos críticos gerados pelo servidor; `POST /api/auditoria` só aceita eventos leves de interface via whitelist (categoria/severidade forçadas pelo servidor).
6. **Identidade por ID** — documentos, consentimentos e troca de médico usam `pacienteId`/`medicoId`; lookups por nome foram removidos.

**Roadmap (pós-hardening):** dividir `src/lib/bion-store.tsx` em módulos (consultas, mensagens, documentos…), migrar as demais mutações para resposta delta, sinalização WebRTC em WebSocket/Realtime + TURN para escala.

## Testes e verificação

```bash
bash scripts/teste_fase4.sh            # E2E de mensageria + IA (8 verificações)
python3 scripts/auditoria_completa.py  # auditoria de todas as rotas nos 3 papéis (32 verificações)
bash scripts/verificacao_navegador_final.sh  # navega pelas 28 telas e captura evidências PNG
bash scripts/teste_sala_webrtc.mjs     # sinalização da sala de teleconsulta
```

Evidências visuais em `download/evidencias-fase4/` e `download/evidencias-finais/`.
