# Menu lateral do médico — rodada do menu (PR #241)

## Destinos: antes × depois

| Antes (ordem antiga) | Depois | Onde abre |
|---|---|---|
| Início | **Início** (1º) | Início, seção 0 |
| Pacientes e mensagens (ponto = não lidas) | **Pacientes** (2º) | gaveta Pacientes |
| — (mensagens só pela lista de pacientes) | **Mensagens** (3º, balão, contador de não lidas reais) | última conversa nas 3 colunas; sem conversa nenhuma, a lista de Pacientes |
| Agenda e horários | **Agenda** (4º) | agenda semanal |
| Gestão e receita | **Relatórios** (5º) | Início, seção Gestão |
| Renovações de receita (ponto = pendentes) | **Documentos** (6º, ponto = pendentes) | renovações de receita |
| Notificações (ponto) | **saiu do menu → sino no topo** ao lado do perfil, em todas as telas | notificações |
| Meu perfil | **Configurações** (após o separador) | gaveta Meu perfil |
| Termos e ajuda | **Ajuda** → menu com "Termos e ajuda" | termos e ajuda |
| Suporte | **Ajuda** → menu com "Suporte" | chamados de suporte |

Nenhuma função sumiu: as 9 ações antigas continuam a 1 clique (Termos/Suporte a 2, dentro da Ajuda) e ganhou-se Mensagens.

## Item ativo = tela atual (testado no Playwright, claro e escuro)
Início → Início · gaveta Pacientes → Pacientes · conversa (Mensagens ou paciente aberto) → Mensagens ·
Triagem/Ficha do paciente → Pacientes · Agenda → Agenda (e de volta da ficha aberta pela agenda) ·
Gestão → Relatórios · Renovações → Documentos · Meu perfil / Perfil público → Configurações ·
Termos / Suporte → Ajuda · Notificações → nenhum item (o sino fica marcado).

## Sino no topo
Início (já tinha) · conversa/ficha/agenda (ao lado do perfil) · renovações, termos, suporte, notificações
(topo padrão das sobreposições: sino + perfil) · Gestão/Perfil público e gavetas no computador (topo fixo no
canto) · celular: Início, conversa, ficha, agenda, Pacientes, Perfil e sobreposições.
Sala de vídeo (/consulta): não tem topo nem menu (nunca teve); fica como está — a chamada não foi tocada.

## Celular
Não há menu lateral: a pílula (Perfil · Início · Pacientes) continua igual. O topo do Início mostra sino e
Mensagens (contador numérico) — Mensagens abre a última conversa, como no computador. Na ficha e na agenda os
botões Medição/Emitir/Horários ficam só com ícone (nome acessível mantido) para caber o sino sem cortar o nome.

## Ainda diferente da referência
- Rótulos "Relatórios" e "Documentos" apontam para Gestão e Renovações (não existem telas novas de relatórios/documentos).
- Ajuda abre um menu pequeno (Termos + Suporte) em vez de uma tela única.
- Nas gavetas (computador) o topo do Início fica sob o fundo escuro; o sino + perfil aparecem num topo fixo por cima.
- Notificações do tipo "mensagem" continuam abrindo a lista de Pacientes (onde também ficam os resultados a revisar).
