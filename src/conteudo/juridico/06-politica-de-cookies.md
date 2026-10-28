---
title: "Política de Cookies e Armazenamento Local — BION"
subtitle: "Versão provisória v0 — 20/10/2026"
lang: pt-BR
---

# Resumo

- Hoje a BION usa **apenas cookies essenciais de login** e **armazenamento local de preferências**. **Não há cookies de publicidade, de análise (analytics) nem de terceiros.**
- Por serem estritamente necessários, eles não dependem de consentimento; você pode apagá-los no navegador, mas aí sai da conta.
- Se um dia usarmos ferramentas de marketing ou análise, mostraremos um **aviso com opção de recusar**, e **nunca** colocaremos rastreadores em **telas de saúde**.

# Sumário

1. O que são cookies e armazenamento local  
2. O que usamos hoje  
3. O que não usamos  
4. Base legal  
5. Como gerenciar  
6. Uso futuro de cookies não essenciais  
7. Contato

# 1. O que são

**Cookies** são pequenos arquivos que o site grava no seu navegador. **Armazenamento local** (*localStorage*) é um espaço do navegador onde o site guarda preferências. Nenhum deles é usado pela BION para rastrear você em outros sites.

# 2. O que usamos hoje

| Nome | Tipo | Finalidade | Duração | Categoria |
|---|---|---|---|---|
| `bion_sessao` | Cookie próprio, *httpOnly*, *SameSite=Lax*, *Secure* em produção | Manter você conectado com segurança (token de sessão) | 7 dias | Essencial |
| `sb-*` (Supabase Auth) | Cookie próprio do domínio, definido pela biblioteca do Supabase | Sessão de autenticação | Duração da sessão de login | Essencial |
| `bion-tema` | Armazenamento local | Tema claro/escuro | Até você apagar | Preferência (funcional) |
| `bion-densidade` | Armazenamento local | Densidade da tela | Até você apagar | Preferência |
| Dica de gestos / tour guiado | Armazenamento local | Não repetir dicas já vistas | Até você apagar | Preferência |
| Aviso de ativar o toque | Armazenamento local | Data em que você dispensou o aviso | Até você apagar | Preferência |
| Preferências da agenda e do painel | Armazenamento local | Preferências de exibição do médico/admin | Até você apagar | Preferência |
| Sincronização do push | Armazenamento local | Endereço técnico e data da inscrição de notificações | Apagado ao sair | Essencial ao push |

Além disso, o **Service Worker** do app (`sw.js`) recebe as notificações push quando você permite.

# 3. O que não usamos

Na data desta versão, a BION **não usa**: Google Analytics, Vercel Analytics, Meta Pixel, Google Ads, Hotjar, Sentry, PostHog ou qualquer outro rastreador, cookie de publicidade ou de terceiros. As fontes do site são servidas pelo próprio domínio. **[A CONFIRMAR antes de publicar: a tela de pagamento de demonstração carrega imagem de QR Code de serviço externo (api.qrserver.com), que recebe o IP do visitante — remover antes do lançamento.]**

# 4. Base legal

Cookies e armazenamento **essenciais** são necessários para prestar o serviço que você pediu (LGPD, art. 7º, V, e legítimo interesse, art. 7º, IX). As **preferências** são guardadas apenas no seu aparelho e não são enviadas a terceiros.

# 5. Como gerenciar

Você pode apagar cookies e dados do site nas configurações do navegador. Se apagar os cookies essenciais, será desconectado. Para desativar notificações, use as configurações do navegador ou do aparelho.

# 6. Uso futuro de cookies não essenciais

Se a BION passar a usar ferramentas de análise ou de marketing (ex.: Google Analytics, Google Ads, Meta Pixel):

a) mostraremos um **banner** com opções claras de **aceitar e recusar**, com a **recusa tão fácil quanto o aceite**, e categorias separadas;  
b) nada além do essencial será ativado **antes** do seu consentimento;  
c) **nunca** haverá rastreadores ou pixels em **telas de saúde** (consulta, triagem, prontuário, exames, receitas, BION IA, lembretes, mensagens) nem envio de dados de saúde a plataformas de publicidade;  
d) esta política será atualizada **antes** da ativação, com nome, finalidade, duração e destino de cada cookie, e eventual transferência internacional;  
e) você poderá mudar sua escolha a qualquer momento.

# 7. Contato

Encarregado (DPO): **[A DEFINIR: e-mail do Encarregado]**. Ver também a Política de Privacidade.

*Versão provisória v0 — Vigente a partir do seu aceite.*
