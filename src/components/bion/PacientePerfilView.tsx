import { useState } from "react";
import {
  User,
  ShieldCheck,
  Heart,
  AlertTriangle,
  Pill,
  Edit3,
  Save,
  Phone,
  Mail,
  Calendar,
  FileText,
  Check,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function PacientePerfilView() {
  const { pacientePerfil, atualizarPacientePerfil } = useBion();

  const [editando, setEditando] = useState(false);
  const [telefone, setTelefone] = useState(pacientePerfil.telefone);
  const [email, setEmail] = useState(pacientePerfil.email);
  const [convenio, setConvenio] = useState(pacientePerfil.convenio);
  const [peso, setPeso] = useState(pacientePerfil.peso ?? "62 kg");
  const [altura, setAltura] = useState(pacientePerfil.altura ?? "1,68 m");
  const [novaAlergia, setNovaAlergia] = useState("");
  const [alergias, setAlergias] = useState<string[]>(pacientePerfil.alergias);

  const salvar = () => {
    atualizarPacientePerfil({
      telefone,
      email,
      convenio,
      peso,
      altura,
      alergias,
    });
    setEditando(false);
  };

  const adicionarAlergia = () => {
    if (!novaAlergia.trim()) return;
    setAlergias((prev) => [...prev, novaAlergia.trim()]);
    setNovaAlergia("");
  };

  const removerAlergia = (item: string) => {
    setAlergias((prev) => prev.filter((a) => a !== item));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header do Perfil */}
      <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center text-3xl font-extrabold shadow-sm shrink-0">
            {pacientePerfil.nome
              .split(" ")
              .slice(-2)
              .map((w) => w[0])
              .join("")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                {pacientePerfil.nome}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-soft text-emerald-700">
                Verificado
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pacientePerfil.idade} anos • {pacientePerfil.genero} • CPF: {pacientePerfil.cpf}
            </p>
          </div>
        </div>

        <div>
          {editando ? (
            <button
              onClick={salvar}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow hover:opacity-90 transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Salvar Dados
            </button>
          ) : (
            <button
              onClick={() => setEditando(true)}
              className="px-5 py-2.5 rounded-xl border font-bold text-xs hover:bg-muted transition flex items-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" /> Editar Perfil
            </button>
          )}
        </div>
      </div>

      {/* Grid de Informações */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Dados Pessoais & Contato */}
        <div className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Dados de Contato & Plano
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">E-mail:</span>
              {editando ? (
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-2 py-1 rounded-lg border bg-background text-right"
                />
              ) : (
                <span className="font-semibold text-foreground">{email}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">Telefone celular:</span>
              {editando ? (
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="px-2 py-1 rounded-lg border bg-background text-right"
                />
              ) : (
                <span className="font-semibold text-foreground">{telefone}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">Modalidade / Convênio:</span>
              {editando ? (
                <input
                  value={convenio}
                  onChange={(e) => setConvenio(e.target.value)}
                  className="px-2 py-1 rounded-lg border bg-background text-right"
                />
              ) : (
                <span className="font-semibold text-foreground">{convenio}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">Termos LGPD:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Aceito em 2025
              </span>
            </div>
          </div>
        </div>

        {/* Informações Clínicas Rápidas */}
        <div className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" /> Dados Físicos & Biomédicos
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">Tipo Sanguíneo:</span>
              <span className="font-bold text-primary">{pacientePerfil.tipoSanguineo}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">Peso corporal:</span>
              {editando ? (
                <input
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  className="px-2 py-1 rounded-lg border bg-background text-right w-24"
                />
              ) : (
                <span className="font-semibold text-foreground">{peso}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-1 border-b">
              <span className="text-muted-foreground">Altura:</span>
              {editando ? (
                <input
                  value={altura}
                  onChange={(e) => setAltura(e.target.value)}
                  className="px-2 py-1 rounded-lg border bg-background text-right w-24"
                />
              ) : (
                <span className="font-semibold text-foreground">{altura}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">Status do Prontuário:</span>
              <span className="font-semibold text-emerald-600">100% Atualizado</span>
            </div>
          </div>
        </div>

        {/* Alergias Conhecidas */}
        <div className="bg-card border rounded-3xl p-6 space-y-3 shadow-sm">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Alergias & Intolerâncias
          </div>
          <div className="flex flex-wrap gap-2">
            {alergias.map((a) => (
              <span
                key={a}
                className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-bold flex items-center gap-1.5"
              >
                {a}
                {editando && (
                  <button onClick={() => removerAlergia(a)} className="hover:text-red-600">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {editando && (
            <div className="flex gap-2 pt-2">
              <input
                value={novaAlergia}
                onChange={(e) => setNovaAlergia(e.target.value)}
                placeholder="Adicionar alergia..."
                className="px-3 py-1.5 rounded-xl border text-xs bg-background flex-1"
              />
              <button
                type="button"
                onClick={adicionarAlergia}
                className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
              >
                Adicionar
              </button>
            </div>
          )}
        </div>

        {/* Medicamentos em Uso */}
        <div className="bg-card border rounded-3xl p-6 space-y-3 shadow-sm">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <Pill className="w-4 h-4 text-primary" /> Medicamentos de Uso Contínuo
          </div>
          <div className="space-y-2">
            {pacientePerfil.medicamentos.map((med, i) => (
              <div
                key={i}
                className="p-3 rounded-2xl bg-muted/60 border text-xs font-semibold flex items-center gap-2"
              >
                <Pill className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{med}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
