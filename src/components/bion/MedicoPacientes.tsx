"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  Search,
  Star,
  User,
  Users,
  FileText,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function MedicoPacientes() {
  const { consultas, documentos, avaliacoes, pacientes, sessao } = useBion();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const meusPacientes = useMemo(() => {
    const nomes = new Set(
      consultas.filter((c) => c.medico === sessao.nome).map((c) => c.paciente),
    );
    const lista = Array.from(nomes);
    return lista
      .filter((n) => n.toLowerCase().includes(busca.toLowerCase()))
      .map((nome) => {
        const doPaciente = consultas.filter((c) => c.medico === sessao.nome && c.paciente === nome);
        const registro = pacientes.find((p) => p.nome === nome);
        return {
          nome,
          registro,
          total: doPaciente.length,
          ultima: doPaciente.sort((a, b) => b.ts - a.ts)[0],
        };
      });
  }, [consultas, pacientes, busca, sessao.nome]);

  if (selecionado) {
    const consultasPaciente = consultas
      .filter((c) => c.paciente === selecionado)
      .sort((a, b) => b.ts - a.ts);
    const docsPaciente = documentos.filter((d) => d.paciente === selecionado);
    const avalsPaciente = avaliacoes.filter((a) => a.paciente === selecionado);
    const registro = pacientes.find((p) => p.nome === selecionado);

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => setSelecionado(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para a lista
        </button>

        <div className="bg-card border rounded-3xl p-6 md:p-8 flex items-center gap-5 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-extrabold shrink-0">
            {selecionado
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-extrabold text-foreground">{selecionado}</h1>
            <p className="text-xs text-muted-foreground">
              {registro
                ? `${registro.idade} anos • ${registro.genero} • ${registro.convenio}`
                : "Paciente atendido na BION"}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Metrica icon={Calendar} label="Consultas" valor={consultasPaciente.length} />
          <Metrica icon={FileText} label="Documentos" valor={docsPaciente.length} />
          <Metrica icon={Star} label="Avaliações" valor={avalsPaciente.length} />
        </div>

        <Bloco titulo="Histórico de consultas" icon={Calendar}>
          {consultasPaciente.length === 0 ? (
            <Vazio texto="Nenhuma consulta registrada." />
          ) : (
            consultasPaciente.map((c) => (
              <div key={c.id} className="p-4 rounded-2xl bg-muted/60 border text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {c.data} às {c.hora}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary font-bold">
                    {c.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {c.especialidade} • {c.medico}
                </p>
                {c.resumoMedico && (
                  <p className="text-muted-foreground italic">{c.resumoMedico}</p>
                )}
              </div>
            ))
          )}
        </Bloco>

        <Bloco titulo="Prontuário e documentos" icon={ClipboardList}>
          {docsPaciente.length === 0 ? (
            <Vazio texto="Nenhum documento emitido." />
          ) : (
            docsPaciente.map((d) => (
              <div key={d.id} className="p-4 rounded-2xl bg-muted/60 border text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{d.titulo}</span>
                  <span className="text-muted-foreground">{d.data}</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">{d.conteudo}</p>
              </div>
            ))
          )}
        </Bloco>

        <Bloco titulo="Avaliações recebidas" icon={Star}>
          {avalsPaciente.length === 0 ? (
            <Vazio texto="Este paciente ainda não avaliou consultas." />
          ) : (
            avalsPaciente.map((a) => (
              <div key={a.id} className="p-4 rounded-2xl bg-muted/60 border text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{a.medico}</span>
                  <span className="flex items-center gap-1 text-amber-500 font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> {a.nota}.0
                  </span>
                </div>
                {a.comentario && (
                  <p className="text-muted-foreground italic">“{a.comentario}”</p>
                )}
                <div className="text-[10px] text-muted-foreground">{a.quando}</div>
              </div>
            ))
          )}
        </Bloco>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> Meus Pacientes
        </h1>
        <p className="text-xs text-muted-foreground">
          Consulte o histórico, o prontuário e as avaliações de cada paciente atendido.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
                  aria-label="Buscar"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar paciente pelo nome..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-3">
        {meusPacientes.length === 0 ? (
          <Vazio texto="Nenhum paciente encontrado." />
        ) : (
          meusPacientes.map((p) => (
            <button
              key={p.nome}
              onClick={() => setSelecionado(p.nome)}
              className="w-full text-left bg-card border rounded-2xl p-4 flex items-center gap-4 hover:border-primary/50 transition"
            >
              <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center font-extrabold shrink-0">
                {p.nome
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-foreground truncate">{p.nome}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.total} consulta(s) • última em {p.ultima?.data ?? "—"}
                </div>
              </div>
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Metrica({
  icon: Icon,
  label,
  valor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valor: number;
}) {
  return (
    <div className="bg-card border rounded-2xl p-4">
      <Icon className="w-4 h-4 text-primary" />
      <div className="text-2xl font-extrabold text-foreground mt-1">{valor}</div>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function Bloco({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-3xl p-6 space-y-3">
      <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" /> {titulo}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground text-center py-4">{texto}</p>;
}
