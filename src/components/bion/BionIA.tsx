"use client";

import { useState } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Pill,
  ClipboardList,
  Stethoscope,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Shield,
  RefreshCw,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";

type MensagemIA = {
  id: string;
  remetente: "usuario" | "ia";
  texto: string;
  hora: string;
  sugestoes?: string[];
};

const RESPOSTAS_BASE: Record<string, string> = {
  losartana: `A **Losartana Potássica** é um medicamento anti-hipertensivo indicado para controle da pressão arterial e proteção renal.

📌 **Orientações Importantes:**
• **Como tomar:** 1 comprimido pela manhã com um copo de água, com ou sem alimentos.
• **Regularidade:** Tome todos os dias no mesmo horário para manter o nível estável no organismo.
• **O que evitar:** Não interrompa o uso por conta própria, mesmo que a pressão esteja normalizada.
• **Efeitos colaterais comuns:** Tontura leve nas primeiras semanas ao se levantar rapidamente.

⚠️ *Esta orientação é informativa. Siga rigorosamente a prescrição da sua médica.*`,

  jejum: `📋 **Preparo para Exames de Sangue (Hemograma e outros):**

• **Hemograma Completo:** Não exige jejum obrigatório (3 horas de jejum leve são suficientes).
• **Glicemia de Jejum:** Exige jejum de **8 a 12 horas**.
• **Perfil Lipídico (Colesterol e Triglicérides):** A maioria dos laboratórios atuais não exige mais 12h de jejum estrito, mas recomenda-se não ingerir alimentos gordurosos 24h antes.
• **Água:** Beber água pura em quantidade moderada é totalmente liberado e não quebra o jejum!

💡 *Se tiver dúvidas específicas sobre o pedido emitido, fale com o suporte ou envie mensagem para o médico.*`,

  atestado: `📄 **Regras e Validação de Atestados Médicos Digitais BION:**

• Todos os atestados emitidos na plataforma contêm assinatura digital qualificada (padrão ICP-Brasil) e hash SHA-256 de validação.
• São aceitos nacionalmente por empresas, órgãos públicos e instituições de ensino conforme as resoluções do CFM nº 2.299/2021 e nº 2.314/2022.
• O empregador pode validar o documento escaneando o QR Code timbrado ou pelo portal de validação oficial.`,

  dor: `🩺 **Orientações Gerais sobre Cefaleia (Dor de Cabeça):**

• **Medidas imediatas:** Descanse em ambiente escuro e silencioso, hidrate-se bem com água fresca e evite telas brilhantes de celular ou computador.
• **Medicação:** Utilize apenas analgésicos já prescritos pelo seu médico.
• **Sinais de Alerta:** Procure atendimento de urgência presencial se a dor for súbita e a mais forte da vida, acompanhada de febre alta, rigidez na nuca ou alterações visuais.`,

  cid: `🔍 **Busca Rápida de Códigos CID-10 Frequentes em Telemedicina:**

• **J00:** Nasofaringite aguda (Resfriado comum)
• **J06.9:** Infecção aguda das vias aéreas superiores, não especificada
• **I10:** Hipertensão essencial (primária)
• **R51:** Cefaleia (Dor de cabeça)
• **K29.7:** Gastrite não especificada
• **F41.1:** Ansiedade generalizada
• **Z76.0:** Emissão de prescrição de repetição (Receita)

Copie e cole o código desejado no campo de emissão de atestado ou prontuário!`,
};

export function BionIA() {
  const { sessao, registrarAudit } = useBion();
  const isMedico = sessao.role === "medico";

  const promptsSugeridos = isMedico
    ? [
        "Buscar código CID-10 para Cefaleia e Gripe",
        "Sugestão de conduta para Hipertensão Estágio 1",
        "Como funciona a validade jurídica da receita digital CFM?",
        "Gerar modelo de anamnese para teleconsulta de retorno",
      ]
    : [
        "Como devo tomar minha Losartana 50mg?",
        "Preciso de quanto tempo de jejum para fazer exames?",
        "O atestado digital é aceito na minha empresa?",
        "O que fazer em caso de dor de cabeça constante?",
      ];

  const [mensagens, setMensagens] = useState<MensagemIA[]>([
    {
      id: "ia-intro",
      remetente: "ia",
      texto: isMedico
        ? `Olá, **${sessao.nome}**! Sou o **BION Copilot IA**. Posso ajudar com consulta rápida de CID-10, sugestão de condutas clínicas baseadas em diretrizes, modelos de prescrição e resumos de prontuário.`
        : `Olá, **${sessao.nome}**! Sou a **BION Saúde IA**. Estou aqui para esclarecer dúvidas sobre seus remédios, explicar como se preparar para exames laboratoriais e fornecer orientações preventivas em linguagem simples.`,
      hora: "Agora",
    },
  ]);
  const [entrada, setEntrada] = useState("");
  const [digitando, setDigitando] = useState(false);

  const enviarMensagem = (textoEnviar?: string) => {
    const txt = textoEnviar ?? entrada;
    if (!txt.trim()) return;

    const novaMsgUsuario: MensagemIA = {
      id: `usr-${Date.now()}`,
      remetente: "usuario",
      texto: txt.trim(),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };

    setMensagens((prev) => [...prev, novaMsgUsuario]);
    if (!textoEnviar) setEntrada("");
    setDigitando(true);
    registrarAudit({
      acao: "IA_CONSULTA_REALIZADA",
      categoria: "sistema",
      severidade: "info",
      entidade: "bion-ia",
      detalhes: `Consulta à IA: "${txt.trim().slice(0, 100)}"`,
    });

    setTimeout(() => {
      const lower = txt.toLowerCase();
      let resposta = "";

      if (
        lower.includes("losartana") ||
        lower.includes("medicamento") ||
        lower.includes("remédio") ||
        lower.includes("tomar")
      ) {
        resposta = RESPOSTAS_BASE.losartana!;
      } else if (
        lower.includes("jejum") ||
        lower.includes("exame") ||
        lower.includes("sangue") ||
        lower.includes("laborat")
      ) {
        resposta = RESPOSTAS_BASE.jejum!;
      } else if (
        lower.includes("atestado") ||
        lower.includes("empresa") ||
        lower.includes("cfm") ||
        lower.includes("aceit")
      ) {
        resposta = RESPOSTAS_BASE.atestado!;
      } else if (
        lower.includes("cid") ||
        lower.includes("código") ||
        lower.includes("diagnóstico")
      ) {
        resposta = RESPOSTAS_BASE.cid!;
      } else if (
        lower.includes("dor") ||
        lower.includes("cabeça") ||
        lower.includes("enxaqueca") ||
        lower.includes("sintoma")
      ) {
        resposta = RESPOSTAS_BASE.dor!;
      } else {
        resposta = isMedico
          ? `Compreendido, Dr(a). Na prática de telemedicina BION, recomenda-se registro detalhado na anamnese, confirmação de consentimento e inclusão de orientações claras com prazo de retorno. Se precisar do código CID ou modelo de prescrição, basta solicitar!`
          : `Entendido! Para orientações específicas para o seu caso individual, você pode enviar uma mensagem direta para seu médico na aba **Mensagens** ou agendar uma teleconsulta de retorno em poucos minutos. Como posso ajudar com mais alguma dúvida de saúde?`;
      }

      const novaMsgIA: MensagemIA = {
        id: `ia-${Date.now()}`,
        remetente: "ia",
        texto: resposta,
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };

      setMensagens((prev) => [...prev, novaMsgIA]);
      setDigitando(false);
    }, 700);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Inteligência Artificial Clínica BION</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {isMedico ? "BION Copilot Médico IA" : "BION Saúde IA"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isMedico
              ? "Apoio clínico à decisão, CID-10, posologia e elaboração de conduta rápida."
              : "Tire dúvidas sobre receitas, preparo de exames e orientações de saúde."}
          </p>
        </div>
      </div>

      {/* Caixa do Chat */}
      <div className="bg-card border rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[520px]">
        {/* Banner informativo */}
        <div className="bg-muted/70 px-5 py-2.5 border-b flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-primary" /> Suas interações são confidenciais e
            protegidas pela LGPD.
          </span>
          <span className="font-semibold text-emerald-600">● IA Ativa</span>
        </div>

        {/* Mensagens */}
        <div className="flex-1 p-5 md:p-6 space-y-4 overflow-y-auto">
          {mensagens.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.remetente === "usuario" ? "justify-end" : "justify-start"}`}
            >
              {msg.remetente === "ia" && (
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-3xl px-5 py-3.5 text-xs md:text-sm leading-relaxed shadow-sm ${
                  msg.remetente === "usuario"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted border text-foreground rounded-tl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.texto}</div>
                <div
                  className={`text-[10px] mt-2 text-right ${
                    msg.remetente === "usuario"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {msg.hora}
                </div>
              </div>

              {msg.remetente === "usuario" && (
                <div
                  className="w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}

          {digitando && (
            <div className="flex gap-3 items-center">
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-muted border rounded-2xl px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1">BION IA pensando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Sugestões Rápidas */}
        <div className="px-5 py-2.5 border-t bg-muted/40 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold text-muted-foreground shrink-0">Sugestões:</span>
          {promptsSugeridos.map((p, i) => (
            <button
              key={i}
              onClick={() => enviarMensagem(p)}
              className="text-xs px-3 py-1.5 rounded-full bg-card border hover:border-primary hover:text-primary transition shrink-0 whitespace-nowrap"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Campo de Entrada */}
        <div className="p-4 border-t bg-card flex items-center gap-3">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviarMensagem();
            }}
            placeholder={
              isMedico
                ? "Pergunte sobre CID-10, orientações de posologia ou diretrizes clínicas..."
                : "Tire dúvidas sobre receitas, como tomar remédios ou preparo de exames..."
            }
            className="flex-1 bg-muted px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background border border-transparent focus:border-border transition"
          />
          <button
            onClick={() => enviarMensagem()}
            className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-sm shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
