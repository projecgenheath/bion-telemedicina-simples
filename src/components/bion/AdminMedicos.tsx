"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, ArrowLeft, Star, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useBion, type Medico } from "@/lib/bion-store";

type Form = Omit<Medico, "id" | "avaliacao" | "numAvaliacoes">;

const vazio: Form = {
  nome: "",
  crm: "",
  especialidade: "",
  subespecialidades: [],
  valor: 150,
  formacao: "",
  experiencia: "",
  idiomas: ["Português"],
  bio: "",
  status: "pendente",
  horariosDisponiveis: ["09:00", "10:00", "14:00"],
};

export function AdminMedicos() {
  const { medicos, adicionarMedico, atualizarMedico, excluirMedico, consultas, avaliacoes } =
    useBion();
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ id?: string; form: Form } | null>(null);
  const [detalhe, setDetalhe] = useState<Medico | null>(null);
  const [confirmar, setConfirmar] = useState<Medico | null>(null);

  const lista = useMemo(
    () =>
      medicos.filter((m) =>
        `${m.nome} ${m.crm} ${m.especialidade}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [medicos, busca],
  );

  const salvar = () => {
    if (!modal) return;
    const f = modal.form;
    if (!f.nome.trim() || !f.crm.trim() || !f.especialidade.trim()) {
      toast.error("Preencha nome, CRM e especialidade.");
      return;
    }
    if (modal.id) {
      atualizarMedico(modal.id, f);
      toast.success("Médico atualizado.");
    } else {
      adicionarMedico(f);
      toast.success("Médico cadastrado.");
    }
    setModal(null);
  };

  if (detalhe) {
    const cons = consultas.filter((c) => c.medico === detalhe.nome);
    const avs = avaliacoes.filter((a) => a.medico === detalhe.nome);
    const media = avs.length ? avs.reduce((s, a) => s + a.nota, 0) / avs.length : detalhe.avaliacao;
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <button
          onClick={() => setDetalhe(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para médicos
        </button>
        <div className="bg-card border rounded-3xl p-6 space-y-1">
          <h2 className="text-xl font-extrabold text-foreground">{detalhe.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {detalhe.especialidade} • {detalhe.crm} • R$ {detalhe.valor},00
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> {media.toFixed(1)} em{" "}
            {avs.length || detalhe.numAvaliacoes} avaliações
          </p>
        </div>

        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Consultas realizadas ({cons.length})
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
                  <div className="font-bold text-foreground">{c.paciente}</div>
                  <div className="text-muted-foreground">
                    {c.data} às {c.hora}
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
          <div className="font-bold text-sm">Avaliações recebidas</div>
          {avs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma avaliação ainda.</p>
          ) : (
            avs.map((a) => (
              <div key={a.id} className="p-3 rounded-2xl border bg-muted/40 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{a.paciente}</span>
                  <span className="text-amber-500 font-bold">{a.nota}.0</span>
                </div>
                {a.comentario && <p className="text-muted-foreground italic">“{a.comentario}”</p>}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Administração de Médicos</h2>
          <p className="text-xs text-muted-foreground">
            Cadastre, edite e remova profissionais da plataforma.
          </p>
        </div>
        <button
          onClick={() => setModal({ form: { ...vazio } })}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> Novo médico
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CRM ou especialidade"
          className="w-full pl-11 pr-4 py-3 rounded-2xl border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-3">
        {lista.map((m) => (
          <div
            key={m.id}
            className="bg-card border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">{m.nome}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === "ativo" ? "bg-accent-soft text-emerald-700" : "bg-muted text-muted-foreground"}`}
                >
                  {m.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {m.especialidade} • {m.crm} • R$ {m.valor},00
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetalhe(m)}
                className="px-3 py-2 rounded-xl border text-xs font-bold hover:bg-muted"
              >
                Histórico
              </button>
              <button
                onClick={() => setModal({ id: m.id, form: { ...m } })}
                className="p-2 rounded-xl border hover:bg-muted"
                aria-label={`Editar ${m.nome}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmar(m)}
                className="p-2 rounded-xl border text-destructive hover:bg-destructive/10"
                aria-label={`Excluir ${m.nome}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhum médico encontrado.</p>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-foreground">
                {modal.id ? "Editar médico" : "Novo médico"}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Fechar">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  ["nome", "Nome"],
                  ["crm", "CRM"],
                  ["especialidade", "Especialidade"],
                  ["formacao", "Formação"],
                ] as const
              ).map(([campo, label]) => (
                <label key={campo} className="text-xs font-semibold space-y-1">
                  <span className="text-muted-foreground">{label}</span>
                  <input
                    value={modal.form[campo]}
                    onChange={(e) =>
                      setModal({ ...modal, form: { ...modal.form, [campo]: e.target.value } })
                    }
                    className="w-full p-2.5 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold space-y-1">
                <span className="text-muted-foreground">Valor da consulta (R$)</span>
                <input
                  type="number"
                  value={modal.form.valor}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      form: { ...modal.form, valor: Number(e.target.value) || 0 },
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
                      form: { ...modal.form, status: e.target.value as Medico["status"] },
                    })
                  }
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                >
                  <option value="ativo">ativo</option>
                  <option value="pendente">pendente</option>
                  <option value="suspenso">suspenso</option>
                </select>
              </label>
              <label className="text-xs font-semibold space-y-1 sm:col-span-2">
                <span className="text-muted-foreground">Subespecialidades (separadas por “,”)</span>
                <input
                  value={modal.form.subespecialidades.join(", ")}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      form: {
                        ...modal.form,
                        subespecialidades: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                />
              </label>
              <label className="text-xs font-semibold space-y-1 sm:col-span-2">
                <span className="text-muted-foreground">Bio</span>
                <textarea
                  rows={3}
                  value={modal.form.bio}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, bio: e.target.value } })}
                  className="w-full p-2.5 rounded-xl border bg-background outline-none"
                />
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
            <h3 className="font-extrabold text-foreground">Excluir médico?</h3>
            <p className="text-xs text-muted-foreground">
              {confirmar.nome} será removido da plataforma. A ação fica registrada na auditoria.
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
                  excluirMedico(confirmar.id);
                  toast.success("Médico excluído.");
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
