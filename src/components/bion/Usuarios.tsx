import { useMemo, useState } from "react";
import { Search, Stethoscope, User, Check, Ban, ShieldCheck } from "lucide-react";

type Situacao = "ativo" | "pendente" | "suspenso";
type Pessoa = { id: string; nome: string; tipo: "medico" | "paciente"; detalhe: string; situacao: Situacao };

const iniciais: Pessoa[] = [
  { id: "u1", nome: "Dra. Ana Ribeiro", tipo: "medico", detalhe: "Clínica Geral • CRM 12345", situacao: "ativo" },
  { id: "u2", nome: "Dr. Carlos Mendes", tipo: "medico", detalhe: "Cardiologia • CRM 23456", situacao: "ativo" },
  { id: "u3", nome: "Dra. Julia Lima", tipo: "medico", detalhe: "Dermatologia • CRM 34567", situacao: "pendente" },
  { id: "u4", nome: "Marina Silva", tipo: "paciente", detalhe: "32 anos • marina@email.com", situacao: "ativo" },
  { id: "u5", nome: "João Pereira", tipo: "paciente", detalhe: "45 anos • joao@email.com", situacao: "ativo" },
  { id: "u6", nome: "Rita Souza", tipo: "paciente", detalhe: "28 anos • rita@email.com", situacao: "suspenso" },
];

const cor: Record<Situacao, string> = {
  ativo: "bg-accent-soft text-foreground",
  pendente: "bg-primary-soft text-primary",
  suspenso: "bg-muted text-muted-foreground",
};

export function Usuarios() {
  const [lista, setLista] = useState<Pessoa[]>(iniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "medico" | "paciente">("todos");

  const visiveis = useMemo(
    () =>
      lista.filter(
        (p) =>
          (filtro === "todos" || p.tipo === filtro) &&
          (p.nome + p.detalhe).toLowerCase().includes(busca.toLowerCase()),
      ),
    [lista, busca, filtro],
  );

  const mudar = (id: string, situacao: Situacao) =>
    setLista((prev) => prev.map((p) => (p.id === id ? { ...p, situacao } : p)));

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold">Usuários</h1>
      <p className="text-muted-foreground mt-1">Aprove médicos, gerencie pacientes e controle acessos</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CRM..."
            className="bg-transparent outline-none text-sm flex-1" />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {(["todos", "medico", "paciente"] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${filtro === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {f === "medico" ? "Médicos" : f === "paciente" ? "Pacientes" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {visiveis.map((p) => (
          <div key={p.id} className="bg-card border rounded-2xl p-4 flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
              {p.tipo === "medico" ? <Stethoscope className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{p.nome}</div>
              <div className="text-sm text-muted-foreground truncate">{p.detalhe}</div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${cor[p.situacao]}`}>{p.situacao}</span>
            <div className="flex gap-2">
              {p.situacao === "pendente" && (
                <button onClick={() => mudar(p.id, "ativo")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-primary-foreground"
                  style={{ backgroundColor: "var(--accent)" }}>
                  <Check className="w-4 h-4" /> Aprovar
                </button>
              )}
              {p.situacao === "ativo" && (
                <button onClick={() => mudar(p.id, "suspenso")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium hover:border-destructive hover:text-destructive transition">
                  <Ban className="w-4 h-4" /> Suspender
                </button>
              )}
              {p.situacao === "suspenso" && (
                <button onClick={() => mudar(p.id, "ativo")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium hover:border-primary hover:text-primary transition">
                  <ShieldCheck className="w-4 h-4" /> Reativar
                </button>
              )}
            </div>
          </div>
        ))}
        {visiveis.length === 0 && (
          <div className="text-center text-muted-foreground py-10">Nenhum usuário encontrado.</div>
        )}
      </div>
    </div>
  );
}
