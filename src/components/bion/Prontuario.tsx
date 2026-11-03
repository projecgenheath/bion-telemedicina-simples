"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pill,
  Award,
  Stethoscope,
  FileText,
  Eye,
  Download,
  ShieldCheck,
  X,
  History,
} from "lucide-react";
import { gerarProntuarioPDF, type MedicamentoUso } from "@/lib/prontuario-pdf";
import type { ComDataNascimento } from "@/lib/idade";
import { useBion, type Documento } from "@/lib/bion-store";
import { apiSaude } from "./paciente/api-saude";
import type { MedicamentoWire } from "./paciente/MedicamentosEmUso";
import { ModalBion } from "@/components/bion/ModalBion";
import { VisualizadorDoc, dataDoc } from "./Receitas";

type Evento = {
  id: string;
  quando: string;
  ordem: number;
  tipo: "receita" | "atestado" | "consulta" | "exame" | "exame_solicitado";
  titulo: string;
  detalhe: string;
  doc?: Documento;
};

const ICONES = {
  receita: Pill,
  atestado: Award,
  consulta: Stethoscope,
  exame: FileText,
  exame_solicitado: FileText,
};
const ROTULOS = {
  receita: "Receita",
  atestado: "Atestado",
  consulta: "Consulta",
  exame: "Exame",
  exame_solicitado: "Pedido de Exame",
};

// Meses em português do rótulo de data do store ("10 Nov 2025").
const MESES_PT: Record<string, number> = {
  Jan: 0,
  Fev: 1,
  Mar: 2,
  Abr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Ago: 7,
  Set: 8,
  Out: 9,
  Nov: 10,
  Dez: 11,
};

/** Timestamp de um rótulo de data real; 0 quando não dá para determinar (ordena por último, nunca inventa data). */
function tsDataLonga(data: string | undefined): number {
  if (!data) return 0;
  const m = data.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return 0;
  const mes = MESES_PT[m[2]];
  if (mes === undefined) return 0;
  // Meia-noite LOCAL (não UTC): mesmo critério do M26 no HistoricoClinico —
  // com UTC o rótulo valia 21h do dia anterior em São Paulo e o arquivo
  // ordenava deslocado em relação aos eventos com timestamp real.
  return new Date(Number(m[3]), mes, Number(m[1])).getTime();
}

export function Prontuario() {
  const {
    documentosVisiveis: documentos,
    consultas,
    arquivos,
    sessao,
    consentimentosVisiveis,
    registrarConsentimento,
    registrarAudit,
    pacientePerfil,
    carregando,
  } = useBion();
  // M4: nascimento/idade só no prontuário do PRÓPRIO paciente ("YYYY-MM-DD" do
  // payload; o tipo do store não declara o campo — mesmo padrão do PerfilPainel).
  const perfilProprio =
    sessao.role === "paciente"
      ? (pacientePerfil as (typeof pacientePerfil & ComDataNascimento) | undefined)
      : undefined;
  const [filtro, setFiltro] = useState<"todos" | Evento["tipo"]>("todos");
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const [consentAberto, setConsentAberto] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erroConsent, setErroConsent] = useState<string | null>(null);

  const docs = useMemo(() => documentos, [documentos]);

  // Derivação antiga (todas as receitas já emitidas, sem vigência): mantida
  // só para médico/admin — o endpoint de ativos é escopado ao próprio paciente.
  const medicamentosReceitas = useMemo(
    () =>
      documentos
        .filter((d) => d.tipo === "receita")
        .map((d) => ({
          id: d.id,
          nome: d.medicamento ?? d.titulo.replace(/^Receita\s*—\s*/, ""),
          posologia: d.posologia ?? d.conteudo,
          duracao: d.duracao ?? "—",
          medico: d.medico,
        })),
    [documentos],
  );

  // A10: para o paciente, "Medicamentos em uso" vem da lista de ATIVOS do
  // servidor (/api/paciente/medicamentos — MedicamentoEmUso com vigência;
  // mesma fonte de PrivacidadePaciente e do card MedicamentosEmUso), não de
  // todas as receitas já emitidas. null = ainda não carregou; falha é erro
  // visível, nunca uma lista inventada a partir das receitas.
  const [medsWire, setMedsWire] = useState<MedicamentoWire[] | null>(null);
  const [medsErro, setMedsErro] = useState(false);
  const carregarMeds = useCallback(async () => {
    if (sessao.role !== "paciente") return;
    setMedsErro(false);
    const d = await apiSaude<{ medicamentos: MedicamentoWire[] }>(
      "/api/paciente/medicamentos",
      undefined,
      true,
    );
    if (!d?.medicamentos) {
      setMedsErro(true);
      return;
    }
    setMedsWire(d.medicamentos);
  }, [sessao.role]);
  useEffect(() => {
    // Mesmo padrão do card MedicamentosEmUso: adia a busca para fora do
    // corpo síncrono do efeito.
    const t = setTimeout(() => void carregarMeds(), 0);
    return () => clearTimeout(t);
  }, [carregarMeds]);

  const medicamentosAtivos = useMemo<(MedicamentoUso & { id: string })[] | null>(() => {
    if (sessao.role !== "paciente" || !medsWire) return null;
    return medsWire
      .filter((m) => m.ativo)
      .map((m) => ({
        id: m.id,
        nome: m.nome,
        posologia:
          [m.dose, m.via, m.posologia.frequencia, m.posologia.instrucoes]
            .filter(Boolean)
            .join(" · ") || "—",
        duracao: m.usoContinuo
          ? "Uso contínuo"
          : m.fim
            ? `Até ${new Date(m.fim).toLocaleDateString("pt-BR")}`
            : m.posologia.duracaoDias
              ? `${m.posologia.duracaoDias} dias`
              : "—",
        // Médico real quando a receita de origem está entre os documentos;
        // o endpoint não devolve nome de médico.
        medico: m.documentoId
          ? (documentos.find((x) => x.id === m.documentoId)?.medico ?? "Receita médica")
          : m.origem === "paciente"
            ? "Adicionado por você"
            : "Receita médica",
      }));
  }, [sessao.role, medsWire, documentos]);

  const medicamentos: (MedicamentoUso & { id: string })[] =
    sessao.role === "paciente" ? (medicamentosAtivos ?? []) : medicamentosReceitas;

  // Filtro por contexto (ID primeiro; nome só para registros antigos sem ID):
  // paciente vê só as próprias consultas/arquivos; médico, só as suas
  // consultas (por medicoId) e arquivos de pacientes vinculados a ele
  // (pacienteId presente nos seus documentos/consultas). O bootstrap já
  // escopa as coleções por papel no servidor; isto é a segunda camada, no
  // componente, para nada de outro paciente/médico misturar na linha do tempo.
  const mesmoPaciente = (pacienteId?: string | null, nome?: string) =>
    sessao.id
      ? pacienteId
        ? pacienteId === sessao.id
        : nome === sessao.nome
      : nome === sessao.nome;
  const mesmoMedico = (medicoId?: string, nome?: string) =>
    sessao.id ? (medicoId ? medicoId === sessao.id : nome === sessao.nome) : nome === sessao.nome;
  const pacientesVinculados = useMemo(() => {
    const ids = new Set<string>();
    consultas.forEach((c) => {
      if (c.pacienteId) ids.add(c.pacienteId);
    });
    documentos.forEach((d) => {
      if (d.pacienteId) ids.add(d.pacienteId);
    });
    return ids;
  }, [consultas, documentos]);

  const eventos = useMemo<Evento[]>(() => {
    const list: Evento[] = [];
    documentos.forEach((d) =>
      list.push({
        id: d.id,
        quando: d.data,
        // M27: data ilegível → ordem 0 (ordena por último, como
        // tsDataLonga) — nunca "hoje" no topo da linha do tempo.
        ordem: dataDoc(d)?.getTime() ?? 0,
        tipo: d.tipo,
        titulo: d.titulo,
        detalhe: `${d.medico}${d.posologia ? ` • ${d.posologia}` : ""}`,
        doc: d,
      }),
    );
    consultas
      .filter((c) => {
        if (c.status !== "concluida") return false;
        if (sessao.role === "paciente") return mesmoPaciente(c.pacienteId, c.paciente);
        if (sessao.role === "medico") return mesmoMedico(c.medicoId, c.medico);
        return true;
      })
      .forEach((c) =>
        list.push({
          id: c.id,
          quando: `${c.data} • ${c.hora}`,
          // Data real da consulta (timestamp do início), nunca ordem arbitrária.
          ordem: Number.isFinite(c.ts) ? c.ts : 0,
          tipo: "consulta",
          titulo: `Consulta de ${c.especialidade}`,
          detalhe: c.medico,
        }),
      );
    arquivos
      .filter((a) => {
        if (sessao.role === "paciente") {
          // Arquivo com destinatário: só o próprio. Sem destinatário
          // (legado), só o enviado pelo paciente — o servidor já escopa a
          // lista por quem enviou/destinatário; nunca um arquivo de outro
          // paciente com destinatário diferente.
          return a.pacienteId ? a.pacienteId === sessao.id : a.enviadoPor === "paciente";
        }
        if (sessao.role === "medico") {
          // Sem destinatário: arquivo próprio/legado do escopo do servidor.
          // Com destinatário: só paciente vinculado a este médico.
          return !a.pacienteId || pacientesVinculados.has(a.pacienteId);
        }
        return true;
      })
      .forEach((a) =>
        list.push({
          id: a.id,
          quando: a.data,
          ordem: tsDataLonga(a.data),
          tipo: "exame",
          titulo: a.nome,
          detalhe: `${a.tipo} • enviado pelo ${a.enviadoPor}`,
        }),
      );
    return list.sort((a, b) => b.ordem - a.ordem);
  }, [documentos, consultas, arquivos, sessao, pacientesVinculados]);

  const visiveis = filtro === "todos" ? eventos : eventos.filter((e) => e.tipo === filtro);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Prontuário</h1>
          <p className="text-muted-foreground mt-1">
            Receitas, atestados, exames e consultas em uma linha do tempo única.
          </p>
        </div>
        <button type="button"
          onClick={() => {
            setAceite(false);
            setErroConsent(null);
            setConsentAberto(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-primary-foreground font-medium"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Download className="w-4 h-4" /> Baixar PDF
        </button>
      </div>

      <div className="mt-6 bg-card border rounded-2xl p-5">
        <div className="font-semibold flex items-center gap-2">
          <Pill className="w-4 h-4 text-primary" /> Medicamentos em uso
        </div>
        <div className="mt-3 space-y-2">
          {sessao.role === "paciente" && medsErro ? (
            <div>
              <p className="text-sm text-destructive">
                Não foi possível carregar seus medicamentos em uso agora.
              </p>
              <button type="button"
                onClick={() => void carregarMeds()}
                className="mt-1 text-sm font-medium text-primary underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : sessao.role === "paciente" && medsWire === null ? (
            <p className="text-sm text-muted-foreground">Carregando medicamentos…</p>
          ) : (
            <>
              {/* M24 (só médico/admin, cuja lista deriva do bootstrap):
                  durante a carga, vazio é "carregando" — o "Nenhum
                  medicamento ativo" fica para a carga concluída. O paciente
                  não passa por aqui sem a lista do endpoint (A10 tem os
                  estados próprios acima), então nada muda para ele. */}
              {medicamentos.length === 0 &&
                (sessao.role !== "paciente" && carregando ? (
                  <p className="text-sm text-muted-foreground">Carregando medicamentos…</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum medicamento ativo.</p>
                ))}
              {medicamentos.map((m) => (
                <div key={m.id} className="rounded-xl border p-3">
                  <div className="font-medium">{m.nome}</div>
                  <div className="text-sm text-muted-foreground">{m.posologia}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Duração: {m.duracao} • {m.medico}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        {(["todos", "receita", "atestado", "exame", "consulta", "exame_solicitado"] as const).map(
          (t) => (
            <button type="button"
              key={t}
              onClick={() => setFiltro(t)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border ${filtro === t ? "bg-primary-soft text-primary border-transparent" : "text-muted-foreground"}`}
            >
              {t === "todos"
                ? "Tudo"
                : t === "exame_solicitado"
                  ? "Pedidos de Exame"
                  : `${ROTULOS[t]}s`}
            </button>
          ),
        )}
      </div>

      <div className="mt-4 relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-3">
          {/* M24: linha do tempo vazia durante o bootstrap é carga. */}
          {carregando && eventos.length === 0 && (
            <p className="text-sm text-muted-foreground" role="status">
              Carregando prontuário…
            </p>
          )}
          {visiveis.map((e) => {
            const Icon = ICONES[e.tipo];
            const docIndex = e.doc ? docs.findIndex((d) => d.id === e.doc!.id) : -1;
            return (
              <div
                key={`${e.tipo}-${e.id}`}
                className="relative bg-card border rounded-2xl p-4 flex items-start gap-3"
              >
                <span className="absolute -left-[18px] top-6 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {ROTULOS[e.tipo]} • {e.quando}
                  </div>
                  <div className="font-semibold truncate">{e.titulo}</div>
                  <div className="text-sm text-muted-foreground">{e.detalhe}</div>
                </div>
                {docIndex >= 0 && (
                  <button type="button"
                    onClick={() => setVisualizando(docIndex)}
                    className="p-2 rounded-lg hover:bg-muted shrink-0"
                    title="Abrir documento"
                  >
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 bg-card border rounded-2xl p-5">
        <div className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-primary" /> Histórico de consentimentos e acessos ao PDF
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Cada geração do prontuário em PDF exige consentimento e fica registrada aqui.
        </p>
        <div className="mt-3 space-y-2">
          {consentimentosVisiveis.length === 0 &&
            (carregando ? (
              <p className="text-sm text-muted-foreground">Carregando registros…</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum registro de consentimento até o momento.
              </p>
            ))}
          {consentimentosVisiveis.map((c) => (
            <div key={c.id} className="rounded-xl border p-3 flex items-start gap-3">
              <span
                className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${c.aceito ? "bg-primary" : "bg-destructive"}`}
              />
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {c.aceito ? "Consentimento concedido" : "Consentimento recusado"} • {c.quando}
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.quem} ({c.perfil}) • paciente: {c.paciente} • {c.documentos} documento(s)
                </div>
                <div className="text-xs text-muted-foreground mt-1">Finalidade: {c.finalidade}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {consentAberto && (
        <ModalBion
          aberto
          onFechar={() => setConsentAberto(false)}
          titulo="Consentimento para gerar o PDF do prontuário"
          largura="max-w-md"
          overlay="bg-foreground/40"
          foraFecha={false}
          className="py-4"
        >
          <div className="bg-card border rounded-2xl w-full p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> Consentimento para gerar o PDF
              </div>
              <button type="button"
                onClick={() => setConsentAberto(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              O arquivo reunirá {documentos.length} documento(s) clínico(s) e os medicamentos em uso{" "}
              {sessao.role === "paciente"
                ? "seus"
                : sessao.role === "medico"
                  ? "dos pacientes vinculados a você"
                  : "listados aqui"}
              . Ao autorizar, o download fica registrado no histórico de acessos com
              data, hora e responsável.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={aceite}
                onChange={(e) => setAceite(e.target.checked)}
                className="mt-1"
              />
              <span>
                Autorizo a geração e o download do prontuário em PDF e o registro deste
                consentimento.
              </span>
            </label>
            {erroConsent && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {erroConsent}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button"
                disabled={registrando}
                onClick={async () => {
                  setRegistrando(true);
                  setErroConsent(null);
                  const registrado = await registrarConsentimento({
                    paciente: sessao.role === "paciente" ? sessao.nome : "Pacientes vinculados",
                    finalidade: "Geração e download do prontuário em PDF",
                    documentos: documentos.length,
                    aceito: false,
                  });
                  setRegistrando(false);
                  if (!registrado) {
                    setErroConsent(
                      "Não foi possível registrar sua recusa agora. Tente novamente.",
                    );
                    return;
                  }
                  setConsentAberto(false);
                }}
                className="px-4 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50"
              >
                Recusar
              </button>
              <button type="button"
                disabled={!aceite || registrando}
                onClick={async () => {
                  // A10: sem a lista de ativos carregada, o PDF sairia com
                  // os medicamentos errados — não gera no escuro.
                  if (sessao.role === "paciente" && medicamentosAtivos === null) {
                    setErroConsent(
                      "Não foi possível carregar seus medicamentos em uso, então o PDF não foi gerado. Tente novamente.",
                    );
                    return;
                  }
                  setRegistrando(true);
                  setErroConsent(null);
                  // A9 (LGPD): o PDF só é gerado DEPOIS que o servidor
                  // confirma o registro do consentimento; em falha, o modal
                  // fica aberto com o erro e nenhum arquivo é baixado.
                  const registrado = await registrarConsentimento({
                    paciente: sessao.role === "paciente" ? sessao.nome : "Pacientes vinculados",
                    finalidade: "Geração e download do prontuário em PDF",
                    documentos: documentos.length,
                    aceito: true,
                  });
                  if (!registrado) {
                    setRegistrando(false);
                    setErroConsent(
                      "Não foi possível registrar seu consentimento agora, então o PDF não foi gerado. Tente novamente.",
                    );
                    return;
                  }
                  gerarProntuarioPDF({
                    // Para o médico, o PDF reúne vários pacientes: não o
                    // rotula com o nome do médico como se fosse o paciente.
                    paciente: sessao.role === "paciente" ? sessao.nome : "Pacientes vinculados",
                    documentos,
                    medicamentos,
                    dataNascimento: perfilProprio?.dataNascimento ?? null,
                    idade: perfilProprio?.idade ?? null,
                  });
                  registrarAudit({
                    acao: "PRONTUARIO_PDF_EXPORTADO",
                    categoria: "prontuario",
                    severidade: "warning",
                    entidade: "prontuario",
                    detalhes: `PDF do prontuário exportado com ${documentos.length} documento(s)`,
                  });
                  setRegistrando(false);
                  setConsentAberto(false);
                }}
                className="px-4 py-2.5 rounded-xl text-primary-foreground text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {registrando ? "Registrando…" : "Autorizar e baixar"}
              </button>
            </div>
          </div>
        </ModalBion>
      )}

      {visualizando !== null && (
        <VisualizadorDoc
          docs={docs}
          index={visualizando}
          onIndex={setVisualizando}
          onClose={() => setVisualizando(null)}
        />
      )}
    </div>
  );
}
