"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  Rocket,
  Video,
  CalendarCheck,
  Pill,
  MessageCircleQuestion,
  ShieldCheck,
  Bell,
  Star,
} from "lucide-react";

type Perfil = "paciente" | "medico" | "admin";

type Faq = {
  pergunta: string;
  resposta: string;
  categoria: string;
  perfis: Perfil[];
};

const FAQS: Faq[] = [
  {
    pergunta: "Como marco minha primeira consulta?",
    resposta:
      "Toque em Agendar no menu, escolha a especialidade, o médico, a data e o horário. Confirme e pronto: você recebe um lembrete automático antes da consulta.",
    categoria: "Consultas",
    perfis: ["paciente"],
  },
  {
    pergunta: "Como entro na videochamada?",
    resposta:
      "No horário da consulta, abra Consultas e toque em Entrar na sala de espera. Quando o médico iniciar, o botão Entrar na consulta fica verde. Autorize câmera e microfone quando o navegador pedir.",
    categoria: "Consultas",
    perfis: ["paciente"],
  },
  {
    pergunta: "Posso cancelar ou remarcar uma consulta?",
    resposta:
      "Sim. Em Consultas, escolha a consulta e toque em Cancelar ou Remarcar. A agenda do médico é atualizada automaticamente e ambos recebem uma notificação.",
    categoria: "Consultas",
    perfis: ["paciente", "medico"],
  },
  {
    pergunta: "Onde encontro minhas receitas e atestados?",
    resposta:
      "Em Receitas você vê todos os documentos do seu prontuário, com busca, filtros por médico, data e tipo, além de visualização e download em PDF.",
    categoria: "Documentos",
    perfis: ["paciente"],
  },
  {
    pergunta: "Como envio um exame para o médico?",
    resposta:
      "Durante a consulta, toque no clipe de anexos e selecione o arquivo. Fora da consulta, use a área de Arquivos. O médico vê o histórico completo vinculado ao atendimento.",
    categoria: "Documentos",
    perfis: ["paciente", "medico"],
  },
  {
    pergunta: "Como baixo meu prontuário completo em PDF?",
    resposta:
      "Abra Prontuário e toque em Baixar PDF. Por segurança, pedimos seu consentimento antes de gerar o arquivo e registramos esse acesso no histórico.",
    categoria: "Documentos",
    perfis: ["paciente"],
  },
  {
    pergunta: "Como emito uma receita durante a consulta?",
    resposta:
      "Na sala de consulta, abra o painel de documentos, preencha medicamento, posologia, duração e observações e confirme. O paciente é notificado na hora.",
    categoria: "Documentos",
    perfis: ["medico"],
  },
  {
    pergunta: "Onde vejo o feedback dos meus pacientes?",
    resposta:
      "Em Minhas Avaliações você acompanha média, distribuição de estrelas, tendência dos últimos 30 dias e os comentários de cada consulta.",
    categoria: "Avaliações",
    perfis: ["medico"],
  },
  {
    pergunta: "Como aprovo o cadastro de um novo médico?",
    resposta:
      "Em Usuários & CRM, filtre por médicos pendentes e toque em Aprovar. Você também pode suspender ou reativar contas a qualquer momento.",
    categoria: "Administração",
    perfis: ["admin"],
  },
  {
    pergunta: "Como exporto os relatórios de métricas?",
    resposta:
      "Em Relatórios & PDF, aplique os filtros de período, especialidade e médico e use os botões Exportar CSV ou Exportar PDF no topo da página.",
    categoria: "Administração",
    perfis: ["admin"],
  },
  {
    pergunta: "Meus dados estão seguros?",
    resposta:
      "Sim. Cada paciente só vê os próprios documentos, cada médico só acessa o que está vinculado aos seus atendimentos e todos os acessos sensíveis ficam registrados na Auditoria.",
    categoria: "Segurança",
    perfis: ["paciente", "medico", "admin"],
  },
  {
    pergunta: "Não recebi o lembrete da consulta. E agora?",
    resposta:
      "Abra Notificações no sino do topo para ver todos os avisos. Se ainda assim não encontrar, fale com a gente em Suporte e abra um chamado.",
    categoria: "Notificações",
    perfis: ["paciente", "medico"],
  },
];

const PASSOS: Record<
  Perfil,
  { titulo: string; passos: { icone: React.ComponentType<{ className?: string }>; texto: string }[] }
> = {
  paciente: {
    titulo: "Sua primeira consulta em 3 passos",
    passos: [
      { icone: CalendarCheck, texto: "Toque em Agendar e escolha especialidade, médico e horário." },
      { icone: Bell, texto: "Aguarde o lembrete e entre na sala de espera alguns minutos antes." },
      { icone: Video, texto: "Toque em Entrar na consulta e autorize câmera e microfone." },
    ],
  },
  medico: {
    titulo: "Seu primeiro atendimento em 3 passos",
    passos: [
      { icone: CalendarCheck, texto: "Confira sua agenda em Minha Agenda e inicie a consulta." },
      { icone: Video, texto: "Atenda por vídeo com chat, anexos e compartilhamento de tela." },
      { icone: Pill, texto: "Emita receitas e atestados direto da sala de consulta." },
    ],
  },
  admin: {
    titulo: "Primeiros passos da gestão",
    passos: [
      { icone: ShieldCheck, texto: "Aprove novos médicos em Usuários & CRM." },
      { icone: Star, texto: "Acompanhe satisfação e métricas em Relatórios & PDF." },
      { icone: MessageCircleQuestion, texto: "Responda chamados dos usuários em Suporte." },
    ],
  },
};

export function Ajuda({ perfil }: { perfil: Perfil }) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);

  const faqs = useMemo(() => {
    const doPerfil = FAQS.filter((f) => f.perfis.includes(perfil));
    const termo = busca.trim().toLowerCase();
    if (!termo) return doPerfil;
    return doPerfil.filter(
      (f) =>
        f.pergunta.toLowerCase().includes(termo) ||
        f.resposta.toLowerCase().includes(termo) ||
        f.categoria.toLowerCase().includes(termo),
    );
  }, [busca, perfil]);

  const guia = PASSOS[perfil];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guias rápidos e respostas para as dúvidas mais comuns.
        </p>
      </header>

      {/* Guia de primeiros passos */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Rocket className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-foreground">{guia.titulo}</h2>
        </div>
        <ol className="mt-4 space-y-3">
          {guia.passos.map((p, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <p.icone className="h-4 w-4" />
              </span>
              <p className="text-sm text-foreground">
                <span className="font-semibold text-primary">{i + 1}. </span>
                {p.texto}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Busque por consulta, receita, vídeo, segurança..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* FAQ */}
      <section className="space-y-2">
        {faqs.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhuma resposta encontrada para "{busca}". Tente outra palavra ou abra um chamado em Suporte.
          </p>
        )}
        {faqs.map((f, i) => {
          const isOpen = aberta === i;
          return (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <button
                type="button"
                onClick={() => setAberta(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={isOpen}
              >
                <div className="min-w-0">
                  <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {f.categoria}
                  </span>
                  <p className="text-sm font-medium text-foreground">{f.pergunta}</p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                  {f.resposta}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Não encontrou o que procurava? Abra um chamado na aba Suporte e nossa equipe responde em até 1 dia útil.
      </p>
    </div>
  );
}
