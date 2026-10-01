"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Shield,
  Users,
  Stethoscope,
  Calendar,
  EyeOff,
  Trash2,
  AlertTriangle,
  Database,
  Lock,
  Search,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { formatarDataNascimento } from "@/lib/idade";

/**
 * Data de nascimento guardada no cofre → "DD/MM/AAAA", sem conversão de fuso
 * (é dia de calendário "YYYY-MM-DD"). Registro antigo com texto livre da
 * anamnese em outro formato é mostrado como veio.
 */
function nascimentoCofre(v: string | null): string {
  if (!v) return "—";
  return formatarDataNascimento(v) || v;
}

/** Linha da lista LGPD vinda do servidor — uma por PACIENTE (id), nunca por nome. */
type PacienteLgpd = {
  id: string;
  nome: string;
  emailMascarado: string;
  cpfMascarado: string;
  cadastradoEm: string;
  status: string;
  anonimizado: boolean;
  consultas: number;
  documentos: number;
  avaliacoes: number;
  arquivos: number;
};

type Acao = { tipo: "anonimizar" | "excluir"; paciente: PacienteLgpd };

/** Resultado da busca no cofre de identificação (somente admin, auditado). */
type ResultadoCofre = {
  pacienteId: string;
  pseudonimo: string | null;
  status: string | null;
  cadastradoEm: string | null;
  guardadoNoCofreEm: string;
  identificacao: { nome: string; cpf: string; dataNascimento: string | null } | null;
  erroDecifrar: boolean;
  historico: {
    contagem: Record<"consultas" | "documentos" | "exames" | "anamneses" | "medicoes" | "arquivos", number>;
    consultas: { id: string; data: string; especialidade: string; medico: string; status: string }[];
    documentos: { id: string; tipo: string; titulo: string; data: string }[];
    exames: { id: string; titulo: string; data: string }[];
  };
};

const fmtData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
/** Trecho do id que o admin precisa digitar para confirmar (evita clicar na pessoa errada). */
const codigoConfirmacao = (id: string) => id.slice(-6);

export function PrivacidadeAdmin() {
  const { consultas, documentos, medicos, anonimizarPaciente, excluirDadosPaciente } = useBion();
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [pacientes, setPacientes] = useState<PacienteLgpd[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);

  // ---- Busca no cofre (ordem judicial) ----
  const [cofreCriterio, setCofreCriterio] = useState<"cpf" | "nome">("cpf");
  const [cofreTermo, setCofreTermo] = useState("");
  const [cofreMotivo, setCofreMotivo] = useState("");
  const [cofreBuscando, setCofreBuscando] = useState(false);
  const [cofreResultados, setCofreResultados] = useState<ResultadoCofre[] | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);
  const cofrePronto = cofreTermo.trim().length >= 3 && cofreMotivo.trim().length >= 5 && !cofreBuscando;

  const buscarCofre = async () => {
    if (!cofrePronto) return;
    setCofreBuscando(true);
    setHistoricoAberto(null);
    try {
      const res = await fetch("/api/admin/lgpd/cofre/busca", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [cofreCriterio]: cofreTermo.trim(), motivo: cofreMotivo.trim() }),
      });
      const json = (await res.json().catch(() => null)) as
        | { resultados?: ResultadoCofre[]; erro?: string }
        | null;
      if (!res.ok) {
        toast.error(json?.erro ?? "Não foi possível consultar o cofre.");
        return;
      }
      setCofreResultados(json?.resultados ?? []);
      toast.message("Consulta ao cofre registrada na auditoria.");
    } catch {
      toast.error("Falha de conexão com o servidor.");
    } finally {
      setCofreBuscando(false);
    }
  };

  const limparCofre = () => {
    setCofreResultados(null);
    setCofreTermo("");
    setCofreMotivo("");
    setHistoricoAberto(null);
  };

  const carregar = useCallback(async (termo: string) => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/admin/lgpd?busca=${encodeURIComponent(termo)}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as
        | { pacientes?: PacienteLgpd[]; total?: number; erro?: string }
        | null;
      if (!res.ok) {
        toast.error(json?.erro ?? "Não foi possível carregar os pacientes.");
        return;
      }
      setPacientes(json?.pacientes ?? []);
      setTotal(json?.total ?? 0);
    } catch {
      toast.error("Falha de conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(busca), 300);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  const abrir = (tipo: Acao["tipo"], paciente: PacienteLgpd) => {
    setCodigo("");
    setAcao({ tipo, paciente });
  };

  const confirmar = async () => {
    if (!acao || enviando) return;
    if (codigo.trim() !== codigoConfirmacao(acao.paciente.id)) return;
    setEnviando(true);
    const okServidor =
      acao.tipo === "anonimizar"
        ? await anonimizarPaciente(acao.paciente.id)
        : await excluirDadosPaciente(acao.paciente.id);
    setEnviando(false);
    if (!okServidor) return; // erro já exibido pelo store
    toast.success(
      acao.tipo === "anonimizar"
        ? "Cadastro e login anonimizados; prontuário preservado. Auditoria registrada."
        : "Dados anonimizados e conta arquivada; prontuário preservado. Auditoria registrada.",
    );
    setAcao(null);
    void carregar(busca);
  };

  const cards = [
    { icon: Users, rotulo: "Pacientes cadastrados", valor: total },
    { icon: Stethoscope, rotulo: "Médicos cadastrados", valor: medicos.length },
    { icon: Calendar, rotulo: "Consultas registradas", valor: consultas.length },
    { icon: Database, rotulo: "Documentos clínicos", valor: documentos.length },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Shield className="w-7 h-7 text-primary" /> Privacidade & LGPD
        </h1>
        <p className="text-muted-foreground mt-1">
          Panorama dos dados guardados na plataforma, com anonimização (por id do paciente)
          registrada em auditoria. O prontuário é sempre preservado.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.rotulo} className="bg-card border rounded-3xl p-5">
            <c.icon className="w-5 h-5 text-primary" />
            <div className="text-3xl font-extrabold mt-3 tabular-nums">{c.valor}</div>
            <div className="text-xs text-muted-foreground font-semibold mt-1">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold">Dados por paciente</h2>
          <input
                  aria-label="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente..."
            className="px-4 py-2.5 rounded-2xl border bg-background text-sm w-full sm:w-64"
          />
        </div>

        {pacientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {carregando ? "Carregando..." : "Nenhum paciente encontrado."}
          </p>
        ) : (
          <div className="space-y-2">
            {total > pacientes.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando os {pacientes.length} cadastros mais recentes de {total}. Refine a busca
                por nome, e-mail ou id.
              </p>
            )}
            {pacientes.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 flex-wrap bg-muted/60 rounded-2xl p-4"
              >
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-sm">
                    {p.nome}
                    {p.anonimizado && (
                      <span className="ml-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                        anonimizado
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    id {p.id} • {p.emailMascarado} • cadastro {fmtData(p.cadastradoEm)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.consultas} consultas • {p.documentos} documentos • {p.avaliacoes} avaliações •{" "}
                    {p.arquivos} arquivos
                  </div>
                </div>
                <button type="button"
                  disabled={p.anonimizado}
                  onClick={() => abrir("anonimizar", p)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold hover:bg-card transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <EyeOff className="w-3.5 h-3.5" /> Anonimizar
                </button>
                <button type="button"
                  disabled={p.anonimizado}
                  onClick={() => abrir("excluir", p)}
                  className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Anonimizar e arquivar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-4">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Busca no cofre (ordem judicial)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Reidentifica um paciente ANONIMIZADO por obrigação legal (ordem judicial, ofício, pedido
            do titular). Busca exata por CPF ou nome completo. Toda consulta é registrada na
            auditoria com seu usuário e o motivo; não repita o CPF ou o nome no motivo.
          </p>
        </div>
        <div className="grid sm:grid-cols-[auto,1fr] gap-2">
          <select
            aria-label="Critério da busca no cofre"
            value={cofreCriterio}
            onChange={(e) => setCofreCriterio(e.target.value as "cpf" | "nome")}
            className="px-3 py-2.5 rounded-2xl border bg-background text-sm"
          >
            <option value="cpf">CPF</option>
            <option value="nome">Nome completo</option>
          </select>
          <input
            aria-label="Termo da busca no cofre"
            value={cofreTermo}
            onChange={(e) => setCofreTermo(e.target.value)}
            placeholder={cofreCriterio === "cpf" ? "000.000.000-00" : "Nome completo exato"}
            autoComplete="off"
            className="px-4 py-2.5 rounded-2xl border bg-background text-sm"
          />
        </div>
        <textarea
          aria-label="Motivo da consulta ao cofre"
          value={cofreMotivo}
          onChange={(e) => setCofreMotivo(e.target.value)}
          placeholder="Motivo obrigatório — ex.: Processo nº 0000000-00.0000.0.00.0000 / Ofício nº ..."
          rows={2}
          maxLength={300}
          className="w-full px-4 py-2.5 rounded-2xl border bg-background text-sm"
        />
        <div className="flex justify-end gap-2">
          {cofreResultados && (
            <button type="button"
              onClick={limparCofre}
              className="px-4 py-2 rounded-xl border text-xs font-bold hover:bg-muted transition"
            >
              Limpar
            </button>
          )}
          <button type="button"
            disabled={!cofrePronto}
            onClick={() => void buscarCofre()}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search className="w-3.5 h-3.5" /> {cofreBuscando ? "Buscando..." : "Buscar no cofre"}
          </button>
        </div>

        {cofreResultados && cofreResultados.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado no cofre.</p>
        )}
        {cofreResultados?.map((r) => (
          <div key={r.pacienteId} className="bg-muted/60 rounded-2xl p-4 space-y-2 text-xs">
            <div className="font-mono break-all">id {r.pacienteId}</div>
            {r.erroDecifrar || !r.identificacao ? (
              <div className="text-destructive font-bold">
                Não foi possível descriptografar (chave diferente ou registro adulterado).
              </div>
            ) : (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className="font-bold">Nome</dt>
                <dd>{r.identificacao.nome}</dd>
                <dt className="font-bold">CPF</dt>
                <dd>{r.identificacao.cpf || "—"}</dd>
                <dt className="font-bold">Nascimento</dt>
                <dd>{nascimentoCofre(r.identificacao.dataNascimento)}</dd>
              </dl>
            )}
            <div className="text-muted-foreground">
              Pseudônimo: {r.pseudonimo ?? "—"} • cadastro {r.cadastradoEm ? fmtData(r.cadastradoEm) : "—"} •
              no cofre desde {fmtData(r.guardadoNoCofreEm)}
            </div>
            <div className="text-muted-foreground">
              Histórico preservado: {r.historico.contagem.consultas} consultas •{" "}
              {r.historico.contagem.anamneses} anamneses • {r.historico.contagem.exames} exames •{" "}
              {r.historico.contagem.documentos} documentos • {r.historico.contagem.medicoes} medições •{" "}
              {r.historico.contagem.arquivos} arquivos
            </div>
            <button type="button"
              onClick={() => setHistoricoAberto(historicoAberto === r.pacienteId ? null : r.pacienteId)}
              className="px-3 py-1.5 rounded-xl border font-bold hover:bg-card transition"
            >
              {historicoAberto === r.pacienteId ? "Fechar histórico" : "Abrir histórico"}
            </button>
            {historicoAberto === r.pacienteId && (
              <div className="space-y-2 pt-1">
                <div>
                  <div className="font-bold">Consultas</div>
                  {r.historico.consultas.length === 0 ? "—" : r.historico.consultas.map((c) => (
                    <div key={c.id}>
                      {fmtData(c.data)} • {c.especialidade} • {c.medico} • {c.status}{" "}
                      <span className="font-mono text-muted-foreground">({c.id})</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-bold">Documentos clínicos</div>
                  {r.historico.documentos.length === 0 ? "—" : r.historico.documentos.map((d) => (
                    <div key={d.id}>
                      {fmtData(d.data)} • {d.tipo} • {d.titulo}{" "}
                      <span className="font-mono text-muted-foreground">({d.id})</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-bold">Exames</div>
                  {r.historico.exames.length === 0 ? "—" : r.historico.exames.map((e) => (
                    <div key={e.id}>
                      {fmtData(e.data)} • {e.titulo}{" "}
                      <span className="font-mono text-muted-foreground">({e.id})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-primary" /> Dados de médicos
        </h2>
        <div className="space-y-2">
          {medicos.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-muted/60 rounded-2xl p-4 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-bold text-sm">{m.nome}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {m.especialidade} • {m.crm} • status {m.status}
                </div>
              </div>
              <span className="text-xs uppercase font-black tracking-widest text-muted-foreground">
                Dado profissional público
              </span>
            </div>
          ))}
        </div>
      </div>

      {acao && (
        <ModalBion
          aberto
          onFechar={() => !enviando && setAcao(null)}
          titulo={`${acao.tipo === "anonimizar" ? "Anonimizar dados" : "Anonimizar e arquivar"} — id ${acao.paciente.id}`}
          largura="max-w-md"
          overlay="bg-foreground/50 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <div className="bg-card border rounded-3xl shadow-2xl w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold">
              {acao.tipo === "anonimizar" ? "Anonimizar dados" : "Anonimizar e arquivar"} — {acao.paciente.nome}?
            </h3>
            <dl className="text-xs grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 bg-muted/60 rounded-2xl p-3">
              <dt className="font-bold">ID</dt>
              <dd className="font-mono break-all">{acao.paciente.id}</dd>
              <dt className="font-bold">E-mail</dt>
              <dd>{acao.paciente.emailMascarado}</dd>
              {acao.paciente.cpfMascarado && (
                <>
                  <dt className="font-bold">CPF</dt>
                  <dd>{acao.paciente.cpfMascarado}</dd>
                </>
              )}
              <dt className="font-bold">Cadastro</dt>
              <dd>{fmtData(acao.paciente.cadastradoEm)}</dd>
              <dt className="font-bold">Registros</dt>
              <dd>
                {acao.paciente.consultas} consultas • {acao.paciente.documentos} documentos •{" "}
                {acao.paciente.arquivos} arquivos
              </dd>
            </dl>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nome, e-mail, CPF, data de nascimento, telefone e demais dados cadastrais serão
              substituídos por um pseudônimo ou apagados (nome, CPF e data de nascimento ficam
              guardados cifrados no cofre de identificação; a idade permanece no prontuário); o
              login é removido (inclusive no Supabase Auth), os arquivos pessoais são apagados do
              Storage e o nome sai dos consentimentos e da auditoria. O prontuário
              (consultas, anamnese, exames, documentos clínicos e receitas) é preservado por 20 anos
              (Lei 13.787/2018), apenas pseudonimizado.
              {acao.tipo === "excluir" ? " A conta é arquivada sem acesso." : ""} Esta ação não pode
              ser desfeita e a conta não poderá ser reativada. O registro ficará salvo na auditoria.
            </p>
            <label className="block text-xs font-bold">
              Para confirmar, digite os 6 últimos caracteres do ID (
              <span className="font-mono">{codigoConfirmacao(acao.paciente.id)}</span>)
              <input
                aria-label="Código de confirmação"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full px-3 py-2 rounded-xl border bg-background text-sm font-mono"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button"
                disabled={enviando}
                onClick={() => setAcao(null)}
                className="px-5 py-2.5 rounded-2xl border text-xs font-bold hover:bg-muted transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button type="button"
                onClick={() => void confirmar()}
                disabled={enviando || codigo.trim() !== codigoConfirmacao(acao.paciente.id)}
                className="px-5 py-2.5 rounded-2xl bg-destructive text-destructive-foreground text-xs font-bold shadow-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </ModalBion>
      )}
    </div>
  );
}
