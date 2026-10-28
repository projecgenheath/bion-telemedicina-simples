---
title: "Política de Privacidade — BION Telemedicina (Pacientes, Médicos e Visitantes)"
subtitle: "Versão provisória v2 — 28/10/2026"
lang: pt-BR
---

> Esta política descreve o funcionamento real da Plataforma na data acima, levantado no código-fonte. Trechos **[A DEFINIR]** ou **[A CONFIRMAR]** precisam ser resolvidos antes da publicação (ver `pendencias.md`).

# Resumo em linguagem simples

- **Quem cuida dos seus dados:** a BION (**[A DEFINIR: razão social e CNPJ]**) e, no que é prontuário, o médico que atende você.
- **Onde ficam:** no **Brasil (São Paulo)**, nos servidores da Supabase e da Vercel. Algumas partes passam pelo exterior: a **IA da NVIDIA** (quando você usa a BION IA), servidores de conexão da chamada (**Cloudflare e Google**, que recebem o seu IP) e os **serviços de notificação** do seu navegador.
- **Dados de saúde** são usados para o seu atendimento, por médicos, com sigilo. **A administração da BION não vê o conteúdo clínico, não entra na sala e não lê o chat da consulta**, mas vê seus dados de cadastro (nome, e-mail, telefone, CPF, data de nascimento) para operar a plataforma.
- **O médico que atende você vê todo o seu histórico na BION**, inclusive com outros médicos. Médicos que nunca atenderam você não veem nada.
- **A videochamada não é gravada.** O chat da consulta vai para o prontuário.
- **A BION IA** só é usada se você consentir. Tiramos seu nome, e-mail, CPF, telefone, CEP e data de nascimento antes de enviar suas mensagens à NVIDIA. **Laudos de exame** enviados à IA **vão com o conteúdo como está** (inclusive o seu nome impresso) e **sempre pedem o seu consentimento antes de cada envio** — você pode recusar.
- **Não vendemos seus dados. Não usamos rastreadores de publicidade.** Só cookies de login.
- Você pode **ver, corrigir, baixar e excluir** seus dados. O botão **"Excluir minha conta"** está no seu perfil. O prontuário fica guardado **20 anos** sem o seu nome, porque a lei exige.
- Encarregado (DPO): **[A DEFINIR: nome] — [A DEFINIR: e-mail do Encarregado]**.

# Sumário

1. Quem somos e a quem esta política se aplica  
2. Papéis: quem é controlador e quem é operador  
3. Quais dados tratamos  
4. Para que usamos e com qual base legal  
5. Dados de saúde e sigilo  
6. Quem acessa seus dados dentro da Plataforma  
7. Inteligência artificial e decisões automatizadas  
8. Com quem compartilhamos (operadores e terceiros)  
9. Transferência internacional de dados  
10. Por quanto tempo guardamos  
11. Seus direitos e como exercê-los  
12. Excluir minha conta e anonimização  
13. Segurança da informação  
14. Incidentes de segurança  
15. Crianças e adolescentes  
16. Cookies e armazenamento no aparelho  
17. Comunicações e marketing  
18. Dados dos médicos  
19. Dados de administradores e da equipe  
20. Encarregado (DPO) e contato  
21. Alterações desta política  
Anexo — Mapa de dados por tabela/funcionalidade

# 1. Quem somos e a quem esta política se aplica

1.1. **Controladora:** **[A DEFINIR: razão social]**, CNPJ **[A DEFINIR]**, sede em **[A DEFINIR: endereço, cidade/UF]** ("**BION**"). Inscrição no CRM-**[A DEFINIR]** nº **[A DEFINIR]**; Responsável Técnico médico: Dr(a). **[A DEFINIR]**, CRM **[A DEFINIR]**.

1.2. Esta política vale para **pacientes** (e seus responsáveis legais), **médicos**, **administradores** e **visitantes** do site e do aplicativo BION. Ela segue a Lei Geral de Proteção de Dados (Lei 13.709/2018 — **LGPD**), o Marco Civil da Internet (Lei 12.965/2014), o Código de Defesa do Consumidor, a Lei 13.787/2018 (prontuário eletrônico), a Lei 14.510/2022 (telessaúde), a Resolução CFM 2.314/2022 e o Código de Ética Médica.

# 2. Papéis: quem é controlador e quem é operador

| Dados | Controlador | Operador | Por quê |
|---|---|---|---|
| Cadastro, login, pagamentos, reembolsos, suporte, avaliações, segurança, logs | **BION** | Supabase, Vercel, gateway etc. | A BION decide por que e como tratar esses dados para oferecer a Plataforma. |
| Prontuário (evolução, CID, conduta, receitas, atestados, triagem, chat da sala, arquivos da consulta) | **Médico** que atendeu | **BION** (e seus suboperadores) | O registro clínico é dever e decisão técnica do médico (CFM; Lei 13.787/2018); a BION guarda e protege seguindo as instruções dele. |
| Compartilhamento do histórico entre médicos que atendem você | **BION e médicos, em conjunto** | — | A regra de compartilhamento é definida pela BION, com o seu consentimento, para o cuidado da sua saúde. |
| BION IA, leitura de exames, lembretes, IMC, medições por conta própria | **BION** | NVIDIA (IA), Supabase, Vercel, serviços de push | São funcionalidades oferecidas pela própria BION. |
| Dados pessoais do médico (cadastro, conta Stripe conectada, recebimentos) | **BION** | Supabase, Vercel | Necessários ao contrato com o médico. |
| NFS-e/recibo emitido ao paciente | **Médico** | BION (se autorizada a emitir em nome do médico — recurso futuro) | A obrigação fiscal é do médico. |

# 3. Quais dados tratamos

## 3.1. Pacientes

| Categoria | Dados |
|---|---|
| Conta e login | nome completo, e-mail, senha (guardada só em *hash* bcrypt), papel, situação da conta, datas, identificador no Supabase Auth, sessões |
| Cadastro | CPF (opcional no cadastro; pode ser exigido para consulta e documento fiscal), telefone, data de nascimento, idade, gênero, profissão, estado civil, convênio, foto |
| 🩺 Saúde no perfil | alergias, comorbidades, medicamentos em uso, tipo sanguíneo, peso, altura |
| Agendamento | médico, especialidade, data e hora, tipo (padrão, retorno, renovação, segunda opinião), 🩺 motivo da consulta, motivo de cancelamento, remarcações, multas, histórico de eventos |
| 🩺 Triagem / anamnese | respostas da triagem pré-consulta e documentos anexados |
| 🩺 Teleconsulta | chat da consulta (vai para o prontuário), arquivos trocados, registros de presença (entrada e permanência na sala), registros de chamada ("toque"); **sinalização técnica da chamada com endereços IP**; o **áudio e o vídeo não são gravados** |
| 🩺 Prontuário pelo médico | evolução, CID, conduta, exames, medicamentos prescritos, receitas, atestados, pedidos de exame, retorno sugerido, pedidos de medição |
| 🩺 Exames e medições | laudos enviados, resultados extraídos (título, data de coleta, valores), medições (pressão, glicemia, peso, altura etc.) |
| 🩺 Medicamentos e lembretes | medicamentos em uso (dose, via, posologia, uso contínuo, controlado), lembretes (título, horário, tipo, frequência) |
| 🩺 Renovação de receita | receita anterior, observação do paciente, resposta do médico, pagamento |
| Mensagens | mensagens com médicos (🩺 podem conter saúde) e com o suporte |
| Pagamentos | valor, forma de pagamento (cartão), status, identificador no gateway, reembolsos, multas, justificativas e decisões. **Os dados do cartão não são guardados pela BION** |
| Avaliações | nota, critérios e comentário |
| Suporte | chamados (assunto, categoria, mensagem, resposta) |
| Consentimentos | finalidade, aceite/recusa, data, quem registrou |
| Notificações e push | notificações do app; inscrição de push (endereço técnico do serviço de push, chaves de criptografia, plataforma, *user agent*) |
| Técnicos e segurança | endereço IP, data e hora de acesso, *user agent*, URLs acessadas, registros de auditoria, eventos de erro |
| BION IA | **a conversa não é guardada pela BION**; guardamos só metadados técnicos (horário, duração, modelo, tamanho do texto, erro), sem o conteúdo e sem o seu identificador |

## 3.2. Médicos

nome, e-mail, senha (*hash*), CRM/UF, especialidade e subespecialidades, formação, experiência, idiomas, biografia, foto, preço, horários e bloqueios de agenda (com motivo), **data de nascimento, sexo/gênero, telefone, CNPJ (opcional)**, identificador da conta Stripe conectada do médico, avaliações recebidas, registros de presença na sala, mensagens, uso do Copilot IA (só metadados), dados técnicos e de segurança e, no futuro e só com autorização expressa, **certificado digital A1** (guardado criptografado). Os dados bancários ficam com a Stripe.

## 3.3. Visitantes

dados técnicos de acesso (IP, data e hora, navegador), preferências de tela salvas no aparelho.

# 4. Para que usamos e com qual base legal

Dados pessoais "comuns" seguem o **art. 7º** da LGPD; **dados de saúde** (sensíveis) seguem **somente o art. 11**.

| Finalidade | Dados | Base legal |
|---|---|---|
| Criar e manter a conta, autenticar | conta, cadastro | Execução de contrato (art. 7º, V) |
| Prevenir fraude, proteger o login, limitar tentativas | IP, e-mail, eventos de segurança | Legítimo interesse (art. 7º, IX); para dado sensível, prevenção à fraude e segurança do titular (art. 11, II, "g") |
| Agendar, remarcar, cancelar, retorno | agendamento | Execução de contrato (art. 7º, V) |
| Teleconsulta, triagem para o médico, prontuário, documentos médicos, renovação de receita | 🩺 saúde | **Tutela da saúde**, em procedimento por profissionais de saúde (art. 11, II, "f") |
| Guardar o prontuário por 20 anos | 🩺 prontuário + identificação | Cumprimento de obrigação legal (art. 11, II, "a"; Lei 13.787/2018, art. 6º) |
| Mostrar ao médico que atende você seu histórico com outros médicos | 🩺 histórico | Tutela da saúde (art. 11, II, "f") **e** seu **consentimento** (art. 11, I), registrado na Plataforma |
| BION IA (chat), triagem assistida por IA | 🩺 mensagens sem identificadores diretos | **Consentimento específico e destacado** (art. 11, I) |
| Leitura de exames pela BION IA | 🩺 laudo completo | **Consentimento específico e destacado, pedido antes de cada envio** (art. 11, I) |
| Lembretes, IMC, gráficos de medições feitos por você | 🩺 medicamentos, medições | Consentimento (art. 11, I), dado ao ativar a função |
| Melhorar a BION IA com dados **anonimizados** | 🩺 dados antes de anonimizar | **Consentimento específico** (art. 11, I), revogável a qualquer momento **[ver pendências: opt-in × opt-out]** |
| Cobrança, reembolso, divisão do pagamento entre o médico e a BION, feita pela Stripe | pagamento, identificador da conta Stripe conectada | Execução de contrato (art. 7º, V) |
| Emissão de NFS-e/recibo Receita Saúde | nome, CPF, valor | Obrigação legal (art. 7º, II) do médico/BION |
| Verificar CRM e situação do médico | CRM, nome | Obrigação regulatória (art. 7º, II; Res. CFM 2.314/2022) e legítimo interesse |
| Guardar registros de acesso (IP, data e hora) | logs | Obrigação legal (art. 7º, II; Marco Civil, art. 15) |
| Auditoria das ações administrativas | trilha de auditoria | Legítimo interesse (art. 7º, IX) e exercício regular de direitos (art. 7º, VI; art. 11, II, "d") |
| Suporte e atendimento ao consumidor | chamados | Execução de contrato e obrigação legal (CDC; Decreto 11.034/2022) |
| Avaliações | nota, comentário | Legítimo interesse (art. 7º, IX), com opção de não avaliar |
| Notificações operacionais e push | notificações, inscrição | Execução de contrato; o push depende da sua permissão no navegador |
| Marketing (e-mail, WhatsApp, push promocional) | e-mail, telefone | **Consentimento separado** (art. 7º, I) — **hoje não fazemos** |
| Defesa em processos e pedidos de autoridades | os necessários | Exercício regular de direitos (art. 7º, VI; art. 11, II, "d") e obrigação legal |

Quando a base é o consentimento, você pode **retirá-lo a qualquer momento**, na Central de Privacidade ou pelo Encarregado, sem prejuízo das consultas médicas. A retirada não afeta o que já foi feito antes.

# 5. Dados de saúde e sigilo

5.1. Dados de saúde são tratados **com sigilo médico** (Código de Ética Médica, arts. 73 a 79) e só para o cuidado da sua saúde e para cumprir a lei.

5.2. **Nunca** usamos dados de saúde para publicidade, para selecionar riscos em contratação de seguros ou planos, nem os vendemos ou compartilhamos para obter vantagem econômica (LGPD, art. 11, §§ 4º e 5º).

5.3. O prontuário é **do paciente** quanto ao acesso: você vê e baixa seus documentos e o prontuário em PDF; cada download fica registrado.

# 6. Quem acessa seus dados dentro da Plataforma

| Quem | O que vê | O que NÃO vê |
|---|---|---|
| **Você (paciente)** | Todos os seus dados, documentos, exames, consultas, consentimentos | — |
| **Médico que atende ou atendeu você** | Seu perfil (com CPF mascarado), triagem, **histórico completo na BION, inclusive com outros médicos** (exames, evoluções, documentos com CID, consultas anteriores, medições, medicamentos, arquivos), chat da consulta | Seu e-mail; dados de pagamento além do valor |
| **Médicos que nunca atenderam você** | Nada | Tudo |
| **Administração da BION (Torre BION)** | Nome, e-mail, telefone, **CPF e data de nascimento completos**, idade, gênero, convênio, agenda, status, pagamentos, motivos de cancelamento e reembolso, tipo e título de documentos, chamados de suporte, avaliações | **Conteúdo clínico** (triagem, evolução, CID, texto de receitas e atestados, arquivos clínicos), **sala de vídeo** e **chat da consulta** |

6.1. Todas as ações da administração ficam em **trilha de auditoria**. O acesso ao cofre de identificação de contas excluídas exige justificativa e gera registro crítico.

6.2. **Dica de privacidade:** evite escrever detalhes de saúde no **motivo de cancelamento**, nos **chamados de suporte** e nas **avaliações**, pois esses campos podem ser vistos pela equipe da BION. **[A CONFIRMAR: se o "motivo da consulta" aparece na tela de agendamentos do admin.]**

# 7. Inteligência artificial e decisões automatizadas

7.1. **Provedor.** A BION IA usa o modelo Nemotron, da **NVIDIA Corporation** (EUA), pela API da NVIDIA. Hoje a BION usa essa API na modalidade de avaliação, e nessa modalidade a NVIDIA **pode guardar e usar o conteúdo enviado** conforme os termos dela. Por isso, removemos seus identificadores diretos das mensagens antes do envio. A BION vai migrar para uma contratação que proíba o uso dos dados para treinar modelos, e esta política será atualizada quando isso acontecer. Se a NVIDIA não responder, entram respostas automáticas pré-programadas. A BION não usa outro provedor sem antes avisar você nesta política.

7.2. **Chat e triagem com IA.** Antes de enviar ao provedor, removemos **seu nome, e-mail, CPF, telefone, CEP e data de nascimento exata**. Seguem o texto que você digita e um contexto clínico (medicamentos em uso, alergias, convênio e as próximas consultas, com especialidade, **nome do médico** e data). **Endereços e dados de terceiros digitados em texto livre podem não ser detectados** — evite digitá-los. A conversa **não é guardada** pela BION.

7.3. **Leitura de exames.** **Antes de cada envio pedimos o seu consentimento específico**, e você pode **recusar**. **O conteúdo do laudo vai à NVIDIA como está**, inclusive com o nome e outros dados impressos, porque a IA precisa ler o documento e conferir se ele é seu. Quando possível, removemos o nome do arquivo e metadados técnicos, **mas não garantimos a anonimização do conteúdo**. O arquivo original não é guardado por essa função; ficam os valores extraídos.

7.4. **Copilot IA do médico.** O texto digitado pelo médico vai à NVIDIA com a especialidade e o CRM dele; os médicos são proibidos de inserir dados identificáveis de pacientes.

7.5. **O que a IA não faz.** A IA **não diagnostica, não prescreve e não decide** sobre o seu atendimento. Nenhuma decisão que afete seus interesses é tomada **unicamente** por tratamento automatizado. Você pode pedir **explicação e revisão** de qualquer resultado automatizado (LGPD, art. 20) pelo Encarregado.

7.6. **Dados anonimizados.** Com o seu consentimento, a BION pode usar dados **anonimizados** (que não permitem identificar você por meios razoáveis — LGPD, arts. 5º, III, e 12) para melhorar a BION IA. Esses dados não são vendidos nem entregues para treinar modelos de terceiros.

# 8. Com quem compartilhamos (operadores e terceiros)

| Empresa / serviço | Para quê | Dados | Onde |
|---|---|---|---|
| **Supabase** | Banco de dados, login, arquivos, mensagens em tempo real | Todos os dados da Plataforma | **Brasil — São Paulo (sa-east-1)** |
| **Vercel** | Hospedagem do site/app e das APIs; registros de execução | Tudo o que trafega; logs com IP, URL e *user agent* | Processamento em **São Paulo (gru1)**; logs da plataforma podem ficar no **exterior (EUA)** 🌐 |
| **NVIDIA Corporation — API NVIDIA (Nemotron)** | BION IA (chat, triagem assistida, leitura de exames, Copilot do médico) | Mensagens sem identificadores diretos; **laudos completos (com consentimento)**; contexto clínico | **Exterior** 🌐 |
| **Google — STUN** | Estabelecer a conexão da videochamada | **Endereço IP** | **Exterior** 🌐 |
| **Cloudflare** | STUN/TURN: conexão e retransmissão da chamada quando a conexão direta falha | **Endereço IP**; áudio e vídeo **criptografados em trânsito** (não acessíveis à Cloudflare, não gravados) | **Global/exterior** 🌐 |
| **Serviços de push** (Google FCM, Apple, Mozilla etc., conforme o seu navegador) | Entregar notificações | Mensagem **genérica e criptografada**, endereço técnico do aparelho | **Exterior** 🌐 |
| **Upstash** (quando ativo) | Limitar tentativas (segurança) | **Endereço IP**, por pouco tempo | **[A DEFINIR: região]** 🌐 |
| **Stripe, Inc. e afiliadas (Stripe)** | Processar pagamentos com cartão e reembolsos (operadora dos dados de pagamento; ver 8.3) | Nome, e-mail, dados do cartão e valor da consulta | **Estados Unidos e outros países** 🌐 |
| **Emissor Nacional da NFS-e** (Receita Federal/Municípios) e **Receita Saúde** | Documentos fiscais | Nome, CPF, valor, descrição do serviço | Brasil (órgão público) |
| **Médicos** | Atendimento | Conforme a seção 6 | — |
| **Autoridades** | Ordem judicial, requisição legal, CRM, ANPD | O estritamente exigido | — |

8.1. **Não usamos** ferramentas de *analytics*, pixels de publicidade (Meta, Google Ads), Sentry ou provedores de e-mail/SMS na data desta versão. O Supabase Auth pode enviar e-mails de conta **[A CONFIRMAR]**. Qualquer novo operador será incluído nesta política antes de começar a ser usado.

8.2. Em caso de reorganização societária, os dados podem ser transferidos ao sucessor, que ficará sujeito a esta política.

8.3. Pagamentos. Os pagamentos com cartão são processados pela Stripe, Inc. e por suas afiliadas (Stripe), que atuam como operadoras dos dados de pagamento. A Stripe recebe o seu nome, e-mail, os dados do cartão e o valor da consulta. Os dados completos do cartão vão direto para a Stripe e não ficam guardados na BION. A BION guarda apenas os identificadores da transação, o valor e as taxas. A Stripe pode tratar esses dados nos Estados Unidos e em outros países, com as garantias do art. 33 da LGPD, como as cláusulas contratuais da Stripe. Ela também pode usar os dados para prevenir fraudes e cumprir obrigações legais, conforme a política de privacidade dela.

# 9. Transferência internacional de dados

9.1. Há transferência internacional para **NVIDIA** (IA), **Stripe** (pagamentos com cartão), **Google** (STUN), **Cloudflare** (STUN/TURN), **serviços de push**, **Vercel** (logs) e, quando houver, **Upstash**.

9.2. Essas transferências ocorrem com base no **art. 33 da LGPD**, preferencialmente por **cláusulas-padrão contratuais** aprovadas pela ANPD (**Resolução CD/ANPD nº 19/2024**), incorporadas aos contratos com esses operadores **[A CONFIRMAR: assinatura/aceite das cláusulas com cada fornecedor]**. Para a BION IA e a leitura de exames, além disso, o seu **consentimento específico e destacado** informa que os dados serão tratados no exterior (art. 33, VIII).

9.3. Você pode pedir informações sobre as garantias de cada transferência ao Encarregado.

# 10. Por quanto tempo guardamos

| Dado | Prazo | Fundamento |
|---|---|---|
| **Prontuário** (consultas, triagem, evolução, CID, documentos, chat da consulta, arquivos clínicos, exames, medições, medicamentos, mensagens com médicos) | **No mínimo 20 anos a partir do último registro**; depois, eliminação ou anonimização | Lei 13.787/2018, art. 6º; LGPD, art. 16, I |
| **Identificação de conta excluída** (nome, CPF, data de nascimento no cofre criptografado) | Enquanto durar a guarda do prontuário (20 anos do último registro); depois, eliminação | Lei 13.787/2018; LGPD, art. 16, I |
| Conta e cadastro (paciente) | Enquanto a conta existir; anonimizados ao excluir a conta | Contrato |
| Registros de pagamentos, recebimentos e, para consultas anteriores a 28/10/2026, repasses e chaves PIX; dados fiscais | **5 anos**, contados do primeiro dia do exercício seguinte | CTN, arts. 173 e 174; legislação fiscal |
| **Trilha de auditoria administrativa** | **5 anos**; o **nome do paciente no assunto de chamados é pseudonimizado após 6 meses** | CDC, art. 27 (prescrição); exercício regular de direitos |
| **Registros de acesso** (IP, data e hora) | **6 meses** | Marco Civil, art. 15 |
| **Monitor de IA** (só metadados, sem conteúdo) | **6 meses** | Legítimo interesse (segurança e qualidade) |
| Conversa com a BION IA | **Não guardada pela BION** (fica só na tela). No provedor: conforme o contrato **[A CONFIRMAR]** | — |
| Sinalização técnica da chamada (inclui IP) | Apagada **30 minutos** após consumida | Minimização |
| Presença na sala (entrada/permanência) | Registros ativos apagados **1 hora** após o desfecho; o desfecho fica no prontuário | Minimização / prova de atendimento |
| Contador de tentativas (IP) | Minutos a horas | Segurança |
| Chamados de suporte | Enquanto a conta existir, até **5 anos** após o encerramento; apagados na exclusão da conta | CDC, art. 27 |
| Lembretes e notificações | Enquanto a conta existir; apagados na exclusão | Contrato/consentimento |
| Inscrição de push | Até você sair, revogar a permissão ou o serviço recusar o endereço | Consentimento |
| Registros de consentimento | Enquanto vigente + **5 anos** | Prova (LGPD, art. 8º, § 2º) |
| Avaliações | Nota mantida na média; **comentário apagado** na exclusão da conta | Legítimo interesse |
| Dados do médico (cadastro) | Contrato + **5 anos** após o término | CDC/Código Civil; defesa de direitos |
| Certificado A1 do médico (futuro) | Até a revogação, o vencimento ou o fim do contrato; apagado em **5 dias úteis** | Autorização expressa |
| Logs da Vercel | Conforme o plano contratado **[A DEFINIR]** | — |
| Cópias de segurança (*backups*) | **[A DEFINIR]** dias, depois sobrescritas | Segurança |

**[Ver pendências: os descartes automáticos por prazo ainda precisam ser implementados no sistema.]**

# 11. Seus direitos e como exercê-los

Você tem direito a (LGPD, art. 18): **(I)** confirmar se tratamos seus dados; **(II)** acessar; **(III)** corrigir dados incompletos, inexatos ou desatualizados; **(IV)** anonimizar, bloquear ou eliminar dados desnecessários, excessivos ou ilegais; **(V)** portabilidade; **(VI)** eliminar dados tratados com consentimento (salvo as exceções do art. 16, como o prontuário); **(VII)** saber com quem compartilhamos; **(VIII)** saber que pode não consentir e as consequências; **(IX)** revogar o consentimento; e ainda **(X)** pedir revisão de decisões automatizadas (art. 20) e **(XI)** se opor a tratamento irregular.

**Como pedir:**

- **No app:** Central de Privacidade (ver dados, consentimentos, baixar prontuário em PDF, alterar senha) e **"Excluir minha conta"** no perfil.
- **Pelo Encarregado:** **[A DEFINIR: e-mail do Encarregado]**. Podemos pedir confirmação de identidade.
- **Prazo de resposta:** confirmação e acesso simplificado imediatamente quando possível; declaração completa em até **15 dias** (art. 19, II).
- Você também pode reclamar à **ANPD** (www.gov.br/anpd).

**Correção de prontuário:** informações clínicas registradas pelo médico só podem ser complementadas ou retificadas pelo próprio médico, com registro da alteração.

# 12. Excluir minha conta e anonimização

12.1. No seu perfil, o botão **"Excluir minha conta"** pede uma confirmação forte (por exemplo, a senha) e avisa sobre consultas futuras e reembolsos pendentes.

12.2. **O que acontece:** seu acesso é encerrado; nome e e-mail são substituídos por dados anônimos; **CPF, data de nascimento, telefone, foto, profissão, estado civil e convênio são apagados do cadastro**; seu usuário de login é removido; arquivos pessoais não ligados a consultas são apagados; chamados, comentários de avaliações, lembretes, notificações, sessões e mensagens com o suporte são removidos.

12.3. **O que fica (por lei):** o **prontuário**, **pseudonimizado** (sem seu nome), por 20 anos; e os registros financeiros e fiscais pelo prazo legal. Sua identificação (nome, CPF e data de nascimento) passa a ficar **criptografada em um cofre separado** (AES-256-GCM), acessível só à administração, com justificativa registrada, para cumprir obrigação legal, atender autoridade ou atender você.

12.4. **Limites:** a exclusão **não apaga** o que já foi enviado ao provedor de IA (sujeito à retenção dele) nem os logs técnicos da Vercel (que expiram conforme o plano).

12.5. **Importante:** enquanto a conta está ativa, o **CPF e a data de nascimento ficam no banco de dados com controle de acesso e criptografia de disco do provedor, mas sem criptografia própria no campo**. A criptografia do cofre só se aplica depois da exclusão.

# 13. Segurança da informação

Adotamos medidas técnicas e administrativas (LGPD, art. 46), entre elas: conexão **HTTPS/TLS**; videochamada **WebRTC criptografada** de ponta a ponta entre os aparelhos, e criptografada também quando retransmitida; **sem gravação** de vídeo; canais em tempo real **privados**; arquivos clínicos em armazenamento **privado** com links temporários (1 hora); senhas com *hash* bcrypt; sessões com cookie *httpOnly*; **controle de acesso por papel** (admin sem acesso clínico; médico só com vínculo); CPF mascarado para o médico; **trilha de auditoria**; limite de tentativas de login; credenciais de TURN temporárias; segredos fora do código; cofre de identificação com AES-256-GCM; dados no Brasil. Nenhum sistema é 100% seguro; se algo acontecer, seguiremos a seção 14.

# 14. Incidentes de segurança

Se houver incidente que possa causar risco ou dano relevante, a BION comunicará a **ANPD** e **os titulares afetados** em até **3 dias úteis** do conhecimento, nos termos do art. 48 da LGPD e da Resolução CD/ANPD 15/2024, informando o que aconteceu, os dados envolvidos, os riscos e as medidas adotadas. Os médicos controladores serão avisados em até 24 horas.

# 15. Crianças e adolescentes

15.1. A conta só pode ser criada por **maiores de 18 anos**.

15.2. Dados de **crianças e adolescentes** só são tratados no seu **melhor interesse**, com o **consentimento específico de pelo menos um dos pais ou do responsável legal** (LGPD, art. 14), por meio da conta do responsável, que acompanha a teleconsulta. **[A DEFINIR: a Plataforma ainda não tem fluxo de "dependente" — ver pendências.]**

15.3. Se soubermos que uma conta foi criada por menor sem responsável, poderemos suspendê-la.

# 16. Cookies e armazenamento no aparelho

Usamos **apenas cookies essenciais de login** (`bion_sessao` e cookies `sb-*` do Supabase) e armazenamento local para preferências (tema, densidade da tela, dicas vistas, aviso de notificação, sincronização do push). **Não usamos cookies de publicidade ou de análise.** Detalhes na **Política de Cookies**.

# 17. Comunicações e marketing

17.1. Enviamos **avisos operacionais** necessários ao serviço. As notificações **push têm texto genérico**, sem seu nome, especialidade ou dado de saúde.

17.2. **Marketing** por e-mail, WhatsApp ou push só com **consentimento separado**, que você pode retirar facilmente (link ou opção no app). Hoje não fazemos marketing.

# 18. Dados dos médicos

18.1. Os dados dos médicos são tratados para o **contrato** (cadastro, agenda, repasses), **obrigações regulatórias** (verificação do CRM), **obrigações fiscais**, **segurança** (alertas de troca de identificador da conta Stripe (e, no histórico anterior a 28/10/2026, a chave PIX) e de CNPJ divergente) e **divulgação do perfil público** (nome, CRM, especialidade, preço, formação, experiência, idiomas, biografia, foto, horários e avaliação média).

18.2. Data de nascimento, sexo, telefone, CNPJ e dados de recebimento **não são públicos**; são vistos só pelo médico e pela administração. **O identificador da conta Stripe (e, no histórico anterior a 28/10/2026, a chave PIX) e o CPF/CNPJ do titular ficam no banco sem criptografia própria no campo**, e uma cópia é registrada em cada repasse como prova do pagamento.

18.3. O certificado A1 (recurso futuro) só será tratado com autorização expressa, criptografado, e usado exclusivamente para emitir NFS-e em nome do médico.

18.4. **Encerramento da conta do médico:** feito mediante solicitação; os dados são mantidos pelos prazos da seção 10 e depois eliminados ou anonimizados. **[Ver pendências: rotina de anonimização do médico ainda não existe.]** Evoluções e documentos produzidos pelo médico permanecem nos prontuários dos pacientes.

# 19. Dados de administradores e da equipe

As ações dos administradores (inclusive acessos ao cofre, correções de desfecho, pagamentos de repasse e reembolsos) são registradas em auditoria com nome, papel e data, por 5 anos. A equipe está sujeita a dever de confidencialidade.

# 20. Encarregado (DPO) e contato

Encarregado pelo tratamento de dados pessoais: **[A DEFINIR: nome]** — **[A DEFINIR: e-mail do Encarregado]** — **[A DEFINIR: endereço para correspondência]**.

# 21. Alterações desta política

Podemos atualizar esta política. Mudanças relevantes serão avisadas no app com antecedência razoável e, quando a mudança exigir, pediremos novo consentimento.

*Vigente a partir do seu aceite*

---

# Anexo — Mapa de dados por tabela/funcionalidade (referência interna e de transparência)

| Tabela / função | Titular | Sensível? | Quem acessa | Terceiros | Retenção |
|---|---|---|---|---|---|
| `User`, `Sessao`, Supabase Auth | todos | não | próprio, admin; médico vê nome | Supabase | conta; anonimiza na exclusão |
| `PerfilPaciente` (cadastro) | paciente | não | próprio, admin (completo), médico vinculado (CPF mascarado) | Supabase | conta |
| `PerfilPaciente` (alergias, comorbidades, medicamentos, tipo sanguíneo, peso, altura) | paciente | **sim** | próprio, médico vinculado | Supabase; NVIDIA (alergias e medicamentos no contexto da IA) | prontuário 20 anos |
| `Consulta`, `EventoConsulta`, `RemarcacaoPendente`, `EsperaMedico` | paciente/médico | motivo/resumo: **sim** | paciente, médico; admin sem conteúdo clínico | Supabase | prontuário 20 anos |
| `Anamnese` | paciente | **sim** | paciente, médico | Supabase; NVIDIA se a triagem com IA estiver ativa | 20 anos |
| `Evolucao` (CID, conduta, exames, medicamentos) | paciente | **sim** | médico autor e médicos vinculados; paciente (documentos) | Supabase | 20 anos |
| `Documento`, `PedidoRenovacao` | paciente | **sim** | paciente, médicos vinculados; admin só tipo/título/data | Supabase | 20 anos |
| `Arquivo` + bucket privado `documentos` | paciente | **sim** | paciente, médicos vinculados | Supabase | 20 anos (clínico) |
| `ExameLaboratorial` | paciente | **sim** | paciente, médicos vinculados | NVIDIA (no envio, com consentimento) | 20 anos |
| `Medicao`, `PedidoMedicao` | paciente | **sim** | paciente, médicos vinculados | Supabase | 20 anos |
| `MedicamentoEmUso`, `Lembrete` | paciente | **sim** | paciente, médicos vinculados | NVIDIA (nomes no contexto da IA); push | medicamentos 20 anos; lembretes até a exclusão |
| `SinalSala` | paciente/médico | chat: **sim**; IP | sistema | Supabase | 30 min após consumido |
| `ChatConsulta` | paciente/médico | **sim** | paciente, médico; **admin não** | Supabase | prontuário 20 anos (não apagável) |
| `PresencaSala`, `ChamadaConsulta` | paciente/médico | não | paciente, médico; admin status | Supabase; push | 1 h após desfecho (presença) |
| `Mensagem` | paciente/médico/suporte | pode ser | participantes | Supabase | com médico: 20 anos; com suporte: até exclusão |
| `Pagamento`, `Reembolso` | paciente | não | paciente, admin; médico (valor) | gateway (futuro) | 5 anos |
| `Repasse`, `RepasseItem`, `RepasseAjuste`, `DadosRecebimentoMedico` (histórico de pagamentos anteriores a 28/10/2026, mantido por obrigação fiscal) | médico | não | médico, admin | Supabase | 5 anos |
| `Pagamento` (colunas `stripeCheckoutSessionId`, `stripePaymentIntentId`, `stripeChargeId`, `stripeTaxaCentavos`), `Reembolso` (coluna `stripeRefundId`) | paciente | não | admin; sistema | Supabase; Stripe 🌐 | 5 anos |
| `PerfilMedico` (coluna `stripeAccountId`) | médico | não | médico, admin | Supabase; Stripe 🌐 | contrato + 5 anos |
| `StripeEvento` (identificadores dos avisos da Stripe já processados) | — | não | sistema | Supabase; Stripe 🌐 | **[A DEFINIR]** |
| `PerfilMedico` | médico | não | público (perfil); privado: médico e admin | Supabase | contrato + 5 anos |
| `Avaliacao` | paciente/médico | pode ser | médico, admin; média pública | Supabase | nota mantida; comentário apagado na exclusão |
| `Ticket` | paciente/médico | pode ser | admin | Supabase | até 5 anos; apagado na exclusão |
| `Consentimento` | paciente | não | paciente, admin | Supabase | vigência + 5 anos |
| `Notificacao`, `NotificacaoLeitura` | todos | não | próprio | Supabase | até a exclusão |
| `PushInscricao` | todos | não (*user agent*) | sistema | serviços de push | até revogar/falhar |
| `AuditLog` (inclui monitor de IA `LLM_TURNO`) | todos | pode citar especialidade | admin | Supabase | auditoria 5 anos; IA 6 meses; nome em assunto de chamado pseudonimizado após 6 meses |
| `IdentificacaoCofre` | paciente excluído | não (identificação) | admin com justificativa | Supabase | 20 anos do último registro do prontuário |
| Rate limit (IP) | todos | não | sistema | Upstash (se ativo) | minutos/horas |
| Logs Vercel (IP, URL, *user agent*) | todos | não | equipe técnica | Vercel | conforme plano **[A DEFINIR]** |
