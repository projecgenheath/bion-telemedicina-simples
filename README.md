# BION: Telemedicina Simples

Crie em Html o aplicativo " BION " do zero, faça um aplicativo moderno, minimalista e extremamente intuitivo. O objetivo seria que qualquer pessoa, mesmo sem familiaridade com tecnologia, conseguisse marcar ou realizar uma consulta em poucos minutos.

Conceito

"A telemedicina mais simples do Brasil."

A identidade visual deve transmitir:

Confiança

Tecnologia

Saúde

Humanização

Paleta de cores:

Azul (confiança)

Branco (simplicidade)

Verde como cor de destaque para ações positivas

---

Estrutura da plataforma

Uma única plataforma, com três perfis de acesso:

Administrador

Médico

Paciente

O menu e as funcionalidades mudam conforme o perfil do usuário.

---

Tela inicial

Após o login, cada perfil acessa seu próprio painel.

Paciente

Painel com:

Próxima consulta

Botão Agendar Consulta

Histórico

Exames enviados

Receitas

Atestados

Mensagens

Perfil

A próxima consulta deve aparecer em destaque.

---

Médico

Painel com:

Consultas de hoje

Próximo paciente

Agenda

Pacientes recentes

Receita do mês

Notificações

Botão principal:

Iniciar Consulta

---

Administrador

Painel com indicadores em tempo real:

Médicos ativos

Pacientes cadastrados

Consultas do dia

Consultas em andamento

Receita da plataforma

Chamados de suporte

---

Agendamento

Fluxo simples:

1. Escolher especialidade.

2. Escolher médico.

3. Escolher data.

4. Escolher horário.

5. Informar motivo da consulta.

6. Anexar exames (opcional).

7. Efetuar pagamento.

8. Confirmação.

Tudo em uma única sequência, com poucos passos.

---

Sala de espera

Após entrar:

Cronômetro até a consulta

Teste de câmera

Teste de microfone

Qualidade da internet

Informações do médico

Botão Entrar na Consulta (liberado no horário)

---

Tela da consulta

Uma interface organizada:

Lado esquerdo

Vídeo do paciente e do médico

Lado direito

Prontuário

Histórico

Exames anexados

Parte inferior

Chat

Compartilhamento de arquivos

Barra superior

Nome do paciente

Tempo de consulta

Indicador de conexão

Barra inferior

Microfone

Câmera

Compartilhar tela

Enviar arquivo

Prescrição

Solicitar exames

Emitir atestado

Encerrar consulta

---

Após a consulta

O paciente recebe:

Receita (quando emitida)

Solicitação de exames

Atestado

Resumo da consulta

Orientações

Próximo retorno (se houver)

---

Perfil do médico

Cada médico deve possuir uma página pública com:

Foto

Especialidade

CRM

Subespecialidades

Formação

Experiência

Idiomas

Valor da consulta

Horários disponíveis

Avaliações dos pacientes

---

Perfil do paciente

Histórico organizado:

Consultas

Receitas

Exames

Atestados

Medicamentos em uso

Alergias

Dados pessoais

---

Segurança

Login com e-mail, CPF ou telefone

Autenticação em dois fatores (opcional)

Criptografia dos dados

Criptografia da videoconferência

Conformidade com a LGPD

Logs de acesso para auditoria

---

Notificações

Lembrete de consulta

Confirmação de pagamento

Médico entrou na sala

Receita disponível

Exames solicitados

Mensagens

---

Inteligência Artificial (opcional)

Para o médico:

Transcrição da consulta (mediante consentimento)

Resumo do atendimento

Organização do prontuário

Para o paciente:

Resumo em linguagem simples

Lembretes de medicação

Lembretes de retorno

---

O diferencial da BION

O maior diferencial não deve ser apenas a videoconferência, mas a experiência. O paciente deve conseguir sair do download do aplicativo até a entrada na consulta em poucos minutos. Já o médico deve encontrar tudo o que precisa durante o atendimento em uma única tela, sem trocar de sistemas ou perder tempo procurando informações. Essa simplicidade e fluidez podem se tornar a principal marca da BION.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/71090397-0ec7-42e3-93d7-ee18e70fe592).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
