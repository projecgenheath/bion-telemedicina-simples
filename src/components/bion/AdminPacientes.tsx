"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, ClipboardList, Calendar, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useBion, type PacienteRegistro } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { formatarDataNascimento, hojeIsoSaoPaulo, idadeDeNascimento } from "@/lib/idade";

/** `dataNascimento` no formulário: "YYYY-MM-DD" ou "" (sem data). */
type Form = Omit<PacienteRegistro, "id" | "desde" | "dataNascimento"> & { dataNascimento: string };

const vazio: Form = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  idade: 30,
  dataNascimento: "",
  genero: "Feminino",
  convenio: "Particular",
  status: "ativo",
};

/**
 * Idade exibida: calculada pela data de nascimento (dia de calendário, hoje em
 * America/Sao_Paulo); sem data (cadastro legado), o campo `idade` gravado.
 */
function idadeExibida(p: { idade: number; dataNascimento?: string | null }): number {
  return (p.dataNascimento ? idadeDeNascimento(p.dataNascimento) : null) ?? p.idade;
}

/** "DD/MM/AAAA" sem conversão de fuso, ou "" se não houver data. */
function nascimento(p: { dataNascimento?: string | null }): string {
  return formatarDataNascimento(p.dataNascimento);
}

/** Campos que o admin pode alterar na edição (o e-mail/login não muda por aqui). */
const CAMPOS_EDITAVEIS = ["nome", "telefone", "cpf", "idade", "dataNascimento", "genero", "convenio", "status"] as const;

type Resposta = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };

/**
 * Chamada direta às rotas do admin (POST/PATCH /api/pacientes) para poder
 * enviar `dataNascimento` e manter o formulário aberto quando o servidor
 * recusa (400 CPF/telefone/data inválidos, 409 CPF/e-mail duplicado). O delta
 * devolvido é aplicado com `aplicarDelta` do store, como nas outras mutações.
 */
async function enviarPaciente(url: string, method: "POST" | "PATCH", corpo: Record<string, unknown>): Promise<Resposta> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const erro = typeof json?.erro === "string" ? json.erro : "Não foi possível concluir a operação.";
      return { ok: false, erro };
    }
    return { ok: true, dados: json ?? {} };
  } catch {
    return { ok: false, erro: "Falha de conexão com o servidor." };
  }
}

export function AdminPacientes() {
  const {
    pacientes,
    aplicarDelta,
    excluirPaciente,
    consultas,
    documentos,
    avaliacoes,
  } = useBion();

  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ id?: string; form: Form } | null>(null);
  const [detalhe, setDetalhe] = useState<PacienteRegistro | null>(null);
  const [confirmar, setConfirmar] = useState<PacienteRegistro | null>(null);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(
    () =>
      pacientes.filter((p) =>
        `${p.nome} ${p.email} ${p.cpf}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [pacientes, busca],
  );

  const salvar = async () => {
    if (!modal || salvando) return;
    const f = modal.form;
    if (!f.nome.trim() || !f.email.trim()) {
      toast.error("Preencha nome e e-mail.");
      return;
    }

    setSalvando(true);
    try {
      if (modal.id) {
        // Edição: envia só o que mudou (data vazia => null limpa a data).
        const original = pacientes.find((p) => p.id === modal.id);
        const corpo: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITAVEIS) {
          const novo = campo === "dataNascimento" ? f.dataNascimento || null : f[campo];
          const antigo = campo === "dataNascimento" ? (original?.dataNascimento ?? null) : original?.[campo];
          if (novo !== antigo) corpo[campo] = novo;
        }
        if (Object.keys(corpo).length === 0) {
          toast.info("Nenhuma alteração para salvar.");
          setModal(null);
          return;
        }
        const r = await enviarPaciente(`/api/pacientes/${modal.id}`, "PATCH", corpo);
        if (!r.ok) {
          toast.error(r.erro);
          return; // formulário continua aberto para corrigir
        }
        aplicarDelta(r.dados);
        toast.success("Paciente atualizado.");
      } else {
        const r = await enviarPaciente("/api/pacientes", "POST", {
          nome: f.nome,
          email: f.email,
          telefone: f.telefone,
          cpf: f.cpf,
          idade: f.idade,
          ...(f.dataNascimento ? { dataNascimento: f.dataNascimento } : {}),
          genero: f.genero,
          convenio: f.convenio,
          status: f.status,
        });
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        // Auditoria admin (C2): credenciais temporárias exibidas UMA vez e descartadas.
        const { credenciais, ...delta } = r.dados as {
          credenciais?: { email: string; senhaTemporaria: string };
        } & Record<string, unknown>;
        aplicarDelta(delta);
        if (credenciais) {
          const texto = `Login: ${credenciais.email}\nSenha temporária: ${credenciais.senhaTemporaria}`;
          toast.success("Conta criada — anote a senha temporária (exibida só agora)", {
            description: `Login: ${credenciais.email} • Senha temporária: ${credenciais.senhaTemporaria}`,
            duration: Infinity,
            closeButton: true,
            action: {
              label: "Copiar",
              onClick: () => void navigator.clipboard?.writeText(texto).catch(() => {}),
            },
          });
        } else {
          toast.success("Paciente cadastrado.");
        }
      }
      setModal(null);
    } finally {
      setSalvando(false);
    }
  };

  if (detalhe) {
    const cons = consultas.filter((c) => c.paciente === detalhe.nome);
    const docs = documentos.filter((d) => d.paciente === detalhe.nome);
    const avs = avaliacoes.filter((a) => a.paciente === detalhe.nome);
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <button type="button"
          onClick={() => setDetalhe(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para pacientes
        </button>

        <div className="bg-card border rounded-3xl p-6 space-y-1">
          <h2 className="text-xl font-extrabold text-foreground">{detalhe.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {detalhe.email} • {detalhe.telefone} • {detalhe.cpf}
          </p>
          <p className="text-xs text-muted-foreground">
            {idadeExibida(detalhe)} anos
            {nascimento(detalhe) ? ` (nasc. ${nascimento(detalhe)})` : ""} • {detalhe.genero} •{" "}
            {detalhe.convenio} • paciente desde {detalhe.desde}
          </p>
        </div>

        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Histórico de consultas ({cons.length})
          </div>
          {cons.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma consulta registrada.</p>
          ) : (
            cons.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-2xl border bg-muted/40 text-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-foreground">{c.medico}</div>
                  <div className="text-muted-foreground">
                    {c.especialidade} • {c.data} às {c.hora}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary font-bold">
                  {c.status}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" /> Prontuário ({docs.length}{" "}
            documento(s))
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum documento emitido.</p>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="p-3 rounded-2xl border bg-muted/40 text-xs">
                <div className="font-bold text-foreground">{d.titulo}</div>
                <div className="text-muted-foreground">
                  {d.medico} • {d.data}
                </div>
              </div>
            ))
          )}
          {avs.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              {avs.length} avaliação(ões) enviada(s) por este paciente.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Administração de Pacientes</h2>
          <p className="text-xs text-muted-foreground">
            Cadastre, edite e remova pacientes da plataforma.
          </p>
        </div>
        <button type="button"
          onClick={() => setModal({ form: { ...vazio } })}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> Novo paciente
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
                  aria-label="Buscar"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou CPF"
          className="w-full pl-11 pr-4 py-3 rounded-2xl border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-3">
        {lista.map((p) => (
          <div
            key={p.id}
            className="bg-card border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">{p.nome}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.status === "ativo" ? "bg-accent-soft text-emerald-700" : "bg-muted text-muted-foreground"}`}
                >
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {p.email} • {p.telefone} • {p.convenio}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {idadeExibida(p)} anos
                {nascimento(p) ? ` • nasc. ${nascimento(p)}` : " • data de nascimento não informada"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setDetalhe(p)}
                className="px-3 py-2 rounded-xl border text-xs font-bold hover:bg-muted"
              >
                Histórico
              </button>
              <button type="button"
                onClick={() =>
                  setModal({
                    id: p.id,
                    form: {
                      nome: p.nome,
                      email: p.email,
                      telefone: p.telefone,
                      cpf: p.cpf,
                      idade: p.idade,
                      dataNascimento: p.dataNascimento ?? "",
                      genero: p.genero,
                      convenio: p.convenio,
                      status: p.status,
                    },
                  })
                }
                className="p-2 rounded-xl border hover:bg-muted"
                aria-label={`Editar ${p.nome}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button type="button"
                onClick={() => setConfirmar(p)}
                className="p-2 rounded-xl border text-destructive hover:bg-destructive/10"
                aria-label={`Excluir ${p.nome}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhum paciente encontrado.
          </p>
        )}
      </div>

      {modal && (
        <ModalBion
          aberto
          onFechar={() => setModal(null)}
          titulo={modal.id ? "Editar paciente" : "Novo paciente"}
          largura="max-w-lg"
          sheet
          overlay="bg-black/50"
          foraFecha={false}
        >
          <div className="bg-card border rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto sm:my-6">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-foreground">
                {modal.id ? "Editar paciente" : "Novo paciente"}
              </h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Fechar">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  ["nome", "Nome completo"],
                  ["email", "E-mail"],
                  ["telefone", "Telefone"],
                  ["cpf", "CPF"],
                  ["convenio", "Convênio"],
                  ["genero", "Gênero"],
                ] as const
              ).map(([campo, label]) => (
                <label key={campo} className="text-xs font-semibold space-y-1">
                  <span className="text-muted-foreground">{label}</span>
                  <input
                    value={modal.form[campo] as string}
                    onChange={(e) =>
                      setModal({ ...modal, form: { ...modal.form, [campo]: e.target.value } })
                    }
                    disabled={campo === "email" && !!modal.id}
                    title={
                      campo === "email" && modal.id ? "O e-mail (login) não é alterado por aqui." : undefined
                    }
                    className="w-full p-2.5 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold space-y-1">
                <span className="text-muted-foreground">Data de nascimento (opcional)</span>
                <input
                  type="date"
                  value={modal.form.dataNascimento}
                  max={hojeIsoSaoPaulo()}
                  onChange={(e) =>
                    setModal({ ...modal, form: { ...modal.form, dataNascimento: e.target.value } })
                  }
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                />
              </label>
              <label className="text-xs font-semibold space-y-1">
                <span className="text-muted-foreground">
                  Idade{modal.form.dataNascimento ? " (calculada pela data de nascimento)" : ""}
                </span>
                {modal.form.dataNascimento ? (
                  <input
                    type="number"
                    value={idadeDeNascimento(modal.form.dataNascimento) ?? ""}
                    readOnly
                    className="w-full p-2.5 rounded-xl border bg-muted/40 outline-none"
                  />
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={modal.form.idade}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        form: { ...modal.form, idade: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full p-2.5 rounded-xl border bg-background outline-none"
                  />
                )}
              </label>
              <label className="text-xs font-semibold space-y-1">
                <span className="text-muted-foreground">Status</span>
                <select
                  value={modal.form.status}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      form: { ...modal.form, status: e.target.value as "ativo" | "inativo" },
                    })
                  }
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                >
                  <option value="ativo">ativo</option>
                  <option value="inativo">inativo</option>
                </select>
              </label>
            </div>
            <button type="button"
              onClick={() => void salvar()}
              disabled={salvando}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </ModalBion>
      )}

      {confirmar && (
        <ModalBion
          aberto
          onFechar={() => setConfirmar(null)}
          titulo="Excluir paciente"
          largura="max-w-sm"
          overlay="bg-black/50"
          foraFecha={false}
          className="py-4"
        >
          <div className="bg-card border rounded-3xl w-full p-6 space-y-4 text-center">
            <h3 className="font-extrabold text-foreground">Excluir paciente?</h3>
            <p className="text-xs text-muted-foreground">
              {confirmar.nome} será removido do cadastro. Esta ação fica registrada na auditoria.
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setConfirmar(null)}
                className="flex-1 py-2.5 rounded-xl border text-xs font-bold"
              >
                Cancelar
              </button>
              <button type="button"
                onClick={() => {
                  excluirPaciente(confirmar.id);
                  toast.success("Paciente excluído.");
                  setConfirmar(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold"
              >
                Excluir
              </button>
            </div>
          </div>
        </ModalBion>
      )}
    </div>
  );
}
