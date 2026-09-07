import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, ClipboardList, Calendar, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useBion, type PacienteRegistro } from "@/lib/bion-store";

type Form = Omit<PacienteRegistro, "id" | "desde">;

const vazio: Form = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  idade: 30,
  genero: "Feminino",
  convenio: "Particular",
  status: "ativo",
};

export function AdminPacientes() {
  const {
    pacientes,
    adicionarPaciente,
    atualizarPaciente,
    excluirPaciente,
    consultas,
    documentos,
    avaliacoes,
  } = useBion();

  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ id?: string; form: Form } | null>(null);
  const [detalhe, setDetalhe] = useState<PacienteRegistro | null>(null);
  const [confirmar, setConfirmar] = useState<PacienteRegistro | null>(null);

  const lista = useMemo(
    () =>
      pacientes.filter((p) =>
        `${p.nome} ${p.email} ${p.cpf}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [pacientes, busca],
  );

  const salvar = () => {
    if (!modal) return;
    const f = modal.form;
    if (!f.nome.trim() || !f.email.trim()) {
      toast.error("Preencha nome e e-mail.");
      return;
    }
    if (modal.id) {
      atualizarPaciente(modal.id, f);
      toast.success("Paciente atualizado.");
    } else {
      adicionarPaciente(f);
      toast.success("Paciente cadastrado.");
    }
    setModal(null);
  };

  if (detalhe) {
    const cons = consultas.filter((c) => c.paciente === detalhe.nome);
    const docs = documentos.filter((d) => d.paciente === detalhe.nome);
    const avs = avaliacoes.filter((a) => a.paciente === detalhe.nome);
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <button
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
            {detalhe.idade} anos • {detalhe.genero} • {detalhe.convenio} • paciente desde{" "}
            {detalhe.desde}
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
            <p className="text-[11px] text-muted-foreground pt-1">
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
        <button
          onClick={() => setModal({ form: { ...vazio } })}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> Novo paciente
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
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
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === "ativo" ? "bg-accent-soft text-emerald-700" : "bg-muted text-muted-foreground"}`}
                >
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {p.email} • {p.telefone} • {p.convenio}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetalhe(p)}
                className="px-3 py-2 rounded-xl border text-xs font-bold hover:bg-muted"
              >
                Histórico
              </button>
              <button
                onClick={() => setModal({ id: p.id, form: { ...p } })}
                className="p-2 rounded-xl border hover:bg-muted"
                aria-label={`Editar ${p.nome}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-foreground">
                {modal.id ? "Editar paciente" : "Novo paciente"}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Fechar">
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
                    className="w-full p-2.5 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold space-y-1">
                <span className="text-muted-foreground">Idade</span>
                <input
                  type="number"
                  value={modal.form.idade}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      form: { ...modal.form, idade: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                />
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
            <button
              onClick={salvar}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <h3 className="font-extrabold text-foreground">Excluir paciente?</h3>
            <p className="text-xs text-muted-foreground">
              {confirmar.nome} será removido do cadastro. Esta ação fica registrada na auditoria.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmar(null)}
                className="flex-1 py-2.5 rounded-xl border text-xs font-bold"
              >
                Cancelar
              </button>
              <button
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
        </div>
      )}
    </div>
  );
}
