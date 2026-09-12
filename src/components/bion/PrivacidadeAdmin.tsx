"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { useBion } from "@/lib/bion-store";

type Acao = { tipo: "anonimizar" | "excluir"; paciente: string };

export function PrivacidadeAdmin() {
  const { consultas, documentos, medicos, avaliacoes, anonimizarPaciente, excluirDadosPaciente } =
    useBion();
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState<Acao | null>(null);

  const pacientes = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; consultas: number; documentos: number; avaliacoes: number }
    >();
    consultas.forEach((c) => {
      const at = mapa.get(c.paciente) ?? {
        nome: c.paciente,
        consultas: 0,
        documentos: 0,
        avaliacoes: 0,
      };
      at.consultas += 1;
      mapa.set(c.paciente, at);
    });
    documentos.forEach((d) => {
      const at = mapa.get(d.paciente) ?? {
        nome: d.paciente,
        consultas: 0,
        documentos: 0,
        avaliacoes: 0,
      };
      at.documentos += 1;
      mapa.set(d.paciente, at);
    });
    avaliacoes.forEach((a) => {
      const at = mapa.get(a.paciente) ?? {
        nome: a.paciente,
        consultas: 0,
        documentos: 0,
        avaliacoes: 0,
      };
      at.avaliacoes += 1;
      mapa.set(a.paciente, at);
    });
    return Array.from(mapa.values())
      .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [consultas, documentos, avaliacoes, busca]);

  const confirmar = () => {
    if (!acao) return;
    if (acao.tipo === "anonimizar") {
      anonimizarPaciente(acao.paciente);
      toast.success("Dados anonimizados e registrados na auditoria.");
    } else {
      excluirDadosPaciente(acao.paciente);
      toast.success("Dados excluídos definitivamente e registrados na auditoria.");
    }
    setAcao(null);
  };

  const cards = [
    { icon: Users, rotulo: "Pacientes com dados", valor: pacientes.length },
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
          Panorama dos dados guardados na plataforma, com anonimização e exclusão registradas em
          auditoria.
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
          <p className="text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
        ) : (
          <div className="space-y-2">
            {pacientes.map((p) => (
              <div
                key={p.nome}
                className="flex items-center gap-3 flex-wrap bg-muted/60 rounded-2xl p-4"
              >
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-sm">{p.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.consultas} consultas • {p.documentos} documentos • {p.avaliacoes} avaliações
                  </div>
                </div>
                <button
                  onClick={() => setAcao({ tipo: "anonimizar", paciente: p.nome })}
                  className="px-4 py-2 rounded-xl border text-xs font-bold hover:bg-card transition flex items-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5" /> Anonimizar
                </button>
                <button
                  onClick={() => setAcao({ tipo: "excluir", paciente: p.nome })}
                  className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            ))}
          </div>
        )}
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
              <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                Dado profissional público
              </span>
            </div>
          ))}
        </div>
      </div>

      {acao && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold">
              {acao.tipo === "anonimizar" ? "Anonimizar dados" : "Excluir dados"} de {acao.paciente}?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {acao.tipo === "anonimizar"
                ? "O nome do paciente será substituído por um identificador anônimo em consultas, documentos e avaliações. As estatísticas continuam válidas."
                : "Consultas, documentos, avaliações e consentimentos desse paciente serão removidos em definitivo. Esta ação não pode ser desfeita."}{" "}
              O registro ficará salvo na auditoria.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAcao(null)}
                className="px-5 py-2.5 rounded-2xl border text-xs font-bold hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                className="px-5 py-2.5 rounded-2xl bg-destructive text-destructive-foreground text-xs font-bold shadow-md hover:opacity-90 transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
