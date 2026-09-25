import { db } from "@/lib/db";

/**
 * Respostas locais da BION IA (sem LLM) — usadas como fallback quando o
 * LLM não está acessível (ex.: produção/Vercel, onde o endpoint do SDK
 * pertence à rede interna do sandbox).
 *
 * Cobre as intenções mais comuns com a mesma voz da BION IA e, sempre que
 * possível, dados reais do banco (próximas consultas, perfil). Nunca inventa
 * informação clínica; sintomas recebem orientação segura + recomendação de
 * consulta; sinais de alarme → SAMU 192.
 */

type Msg = { remetente: string; texto: string };

const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const ALARME = /(dor (no|na) peito|aperto no peito|falta de ar|nao consigo respirar|sufocando|desmai|s[íi]ncope|fala embolada|rosto torto|sangramento|sangrando muito|quero morrer|suicid)/;

function proximasConsultas(usuarioId: string): Promise<string> {
  return db.consulta
    .findMany({
      where: { pacienteId: usuarioId, status: "confirmada", dataInicio: { gte: new Date() } },
      include: { medico: { select: { nome: true } } },
      orderBy: { dataInicio: "asc" },
      take: 3,
    })
    .then((cs) =>
      cs.length
        ? cs
            .map(
              (c) =>
                `• **${c.especialidade}** com ${c.medico.nome} — ${c.dataInicio.toLocaleDateString("pt-BR")} às ${c.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
            )
            .join("\n")
        : "",
    );
}

export async function respostaLocal(
  usuario: { id: string; nome: string; role: string },
  historico: Msg[],
): Promise<string> {
  const ultima = [...historico].reverse().find((m) => m.remetente === "usuario");
  const t = normalizar(ultima?.texto ?? "");
  const primeiro = usuario.nome.split(" ")[0] ?? usuario.nome;

  if (ALARME.test(t)) {
    return `O que você descreveu pode ser sinal de urgência, ${primeiro}. **Não espere** — ligue para o **SAMU 192** ou vá ao pronto-socorro mais próximo agora mesmo.\n\nDepois que estiver seguro, eu te ajudo com o que precisar por aqui.`;
  }

  // RENOVAÇÃO DE RECEITA: intenção comum que antes caía em ramos errados
  // ("oi" no início ativava o menu de saudação; "sem sintomas" ativava o
  // ramo de sintomas) — a resposta ignorava o pedido (bug real 2026-09).
  // {0,40}? cobre palavras entre o verbo e o objeto ("renovar MINHA receita",
  // "renovação DA RECEITA antiga") — antes, só o adjacente casava e a
  // mensagem caía no ramo de medicamentos (bug real 2026-09-24).
  // Política clínica: prescrição sem avaliação não é permitida; o caminho
  // seguro é a teleconsulta de reavaliação.
  if (
    /(renov\w*.{0,40}?(receita|prescri|remedio|medica)|receita\s*(medica|vencid|antig)|renovacao)/.test(t)
  ) {
    return `Para **renovar uma receita**, ${primeiro}, é necessária uma avaliação médica — nem que seja rápida: por segurança, nenhuma prescrição é emitida sem consulta.\n\nO caminho mais simples é uma **teleconsulta de reavaliação**: o médico revisa seu histórico e, se for o caso, emite a receita atualizada na hora.\n\nToque em **“Agendar consulta”** aqui embaixo que eu te guio no resto — e, se o remédio é de uso contínuo, mencione isso ao médico na consulta.`;
  }

  // Saudação APENAS quando a mensagem é só a saudação — antes, qualquer
  // mensagem começando com "oi" (ex.: "Oi! Quero renovar receita...") caía
  // no menu genérico e ignorava o pedido.
  if (/^(oi|ola|opa|hey|eai|e ai|bom dia|boa tarde|boa noite)[\s!.,:;?-]*(tudo bem|tudo bom|beleza)?[\s!.,:;?-]*$/.test(t)) {
    return `Olá, ${primeiro}! Sou a **BION IA**. Posso:\n• **Agendar sua consulta** (pagamento + anamnese guiada por mim)\n• **Ler seus laudos** em PDF ou foto\n• Tirar dúvidas sobre a plataforma e sua agenda\n\nO que você precisa hoje?`;
  }

  if (/(agend|marcar|marcacao|consulta com|quero uma consulta|nova consulta)/.test(t)) {
    return `Vamos agendar, ${primeiro}! Toque no botão **“Agendar consulta”** aqui embaixo — eu te guio na escolha da especialidade, do profissional e do horário.\n\nDepois do pagamento, sua consulta fica **pendente da anamnese**, que faremos juntos aqui no chat — é uma conversa tranquila que prepara o médico para te atender melhor.`;
  }

  if (/(anamnese|questionario|formulario|formulário)/.test(t)) {
    return `A **anamnese** é uma conversa guiada por mim, depois do pagamento da consulta: você confirma seus dados do perfil, conta o que está sentindo com suas palavras e eu organizo tudo para o médico.\n\nEla leva poucos minutos, é no seu ritmo — e, quando termina, sua consulta é **confirmada** no agenda automaticamente.`;
  }

  if (/(laudo|exame|documento|pdf|foto|resultado)/.test(t)) {
    return `Pode me enviar! Toque no **clip 📎 ao lado do campo de mensagem** (ou no botão “Enviar laudo de exame”).\n\nAceito **PDF ou foto**. Por segurança, confiro o **nome completo impresso no documento** antes de importar resultados para sua linha do tempo de exames — o nome precisa ser igual ao da sua conta.`;
  }

  if (/(pagamento|pagar|pix|cartao|cartão|valor|preco|preço|quanto custa)/.test(t)) {
    return `O pagamento é feito na hora do agendamento, direto no chat: escolha **Pix** ou **cartão** no resumo da consulta.\n\nSua consulta fica **reservada** após o pagamento e é **confirmada** assim que a anamnese comigo terminar. Se algo der errado no processo, nada é cobrado.`;
  }

  if (/(minha consulta|proxima consulta|próxima consulta|horario|horário|quando e|quando é|minha agenda)/.test(t)) {
    const lista = await proximasConsultas(usuario.id);
    if (lista) {
      return `Aqui estão suas próximas consultas **confirmadas**, ${primeiro}:\n\n${lista}\n\nConsultas pagas que ainda estão **pendentes de anamnese** aparecem no seu app com um selo âmbar — toque em “Fazer anamnese” para confirmá-las.`;
    }
    return `Você não tem consultas confirmadas no momento, ${primeiro}. Quer que eu te guie no **agendamento**? É só tocar em “Agendar consulta” aqui embaixo.`;
  }

  if (/(medicamento|remedio|remédio|dose|posologia|tarja)/.test(t)) {
    return `Sobre medicamentos, ${primeiro}: **não prescrevo nem ajusto doses** — siga sempre a orientação do seu médico e da bula.\n\nSe estiver com efeitos colaterais ou dúvidas sobre um remédio em uso, o melhor caminho é uma **consulta** com o profissional que o acompanha. Posso te ajudar a agendar?`;
  }

  if (/(quanto|sintoma|dor|febre|tosse|gripe|tontura|enjoo|cansaco|cansaço|cabeca|cabeça|barriga|pressao|pressão)/.test(t)) {
    return `Entendo, ${primeiro}. Sobre sintomas, eu não faço **diagnóstico** — mas posso te dar um caminho seguro:\n• Se for algo **leve e sem fatores de risco**, acompanhe por 24–48h com repouso e hidratação.\n• Se piorar, persistir ou vier com **dor no peito, falta de ar, desmaio ou sangramento**, busque **urgência presencial** (SAMU 192).\n\nPara uma avaliação de verdade, agende uma **consulta** — e, durante a anamnese, conte tudo com suas palavras: o médico já vai te conhecer antes do atendimento. Quer que eu agende?`;
  }

  if (/(obrigad|valeu|thank|muito bom|otimo|ótimo|perfeito)/.test(t)) {
    return `Eu que agradeço, ${primeiro}! Estou sempre por aqui — seja para **agendar**, **ler laudos** ou esclarecer dúvidas da plataforma. Cuide-se!`;
  }

  return `Entendi sua mensagem, ${primeiro} — e quero te responder com segurança. Por aqui posso:\n• **Agendar consultas** (com pagamento e anamnese guiada)\n• **Ler laudos** de exames (PDF ou foto)\n• Consultar sua **agenda**\n\nTente reformular em uma dessas frentes, ou toque em um dos botões abaixo. Em caso de **urgência**, ligue **SAMU 192**.`;
}
