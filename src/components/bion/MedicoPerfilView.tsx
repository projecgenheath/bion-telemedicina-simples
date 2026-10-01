"use client";

import { useState } from "react";
import {
  Star,
  Stethoscope,
  Globe,
  Award,
  Calendar,
  Clock,
  Check,
  Edit3,
  Save,
  ShieldCheck,
  Heart,
  User,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useBion, type Medico } from "@/lib/bion-store";

/** Limite da foto de perfil (o servidor recusa data URLs maiores). */
const FOTO_MAX_BYTES = 500 * 1024;

export function MedicoPerfilView({ medicoId }: { medicoId?: string }) {
  const { medicos, sessao, atualizarMedico, avaliacoes } = useBion();

  // Identificação por ID (nunca por nome — homônimos); nome só se a sessão
  // ainda não trouxe o id.
  const medico =
    medicos.find((m) =>
      medicoId ? m.id === medicoId : sessao.id ? m.id === sessao.id : m.nome === sessao.nome,
    ) ?? medicos[0];

  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(medico.valor);
  const [bio, setBio] = useState(medico.bio);
  const [formacao, setFormacao] = useState(medico.formacao);
  const [foto, setFoto] = useState(medico.foto ?? "");

  const avaliacoesDoMedico = avaliacoes.filter((a) => a.medico === medico.nome);

  const lerFoto = (file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > FOTO_MAX_BYTES) {
      toast.error("Foto inválida", { description: "Use PNG, JPEG ou WebP com até 500 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  // Autoedição do médico: só campos permitidos pelo servidor
  // (PATCH /api/medicos/:id). Nome, CRM e especialidade são do administrador.
  const salvar = () => {
    if (!Number.isFinite(valor) || valor < 1 || valor > 5000) {
      toast.error("Valor inválido", { description: "Informe um valor entre R$ 1 e R$ 5.000." });
      return;
    }
    atualizarMedico(medico.id, {
      valor,
      bio,
      formacao,
      ...(foto && foto !== medico.foto ? { foto } : {}),
    });
    setEditando(false);
  };

  const isProprioMedico =
    sessao.role === "medico" && (sessao.id ? sessao.id === medico.id : sessao.nome === medico.nome);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Card Principal */}
      <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="shrink-0 space-y-2">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center text-4xl font-extrabold shadow-md overflow-hidden">
              {(editando ? foto : medico.foto) ? (
                <img
                  src={editando ? foto : medico.foto}
                  alt={`Foto de ${medico.nome}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                medico.nome
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")
              )}
            </div>
            {editando && (
              <label className="block text-xs font-bold text-primary cursor-pointer text-center">
                Trocar foto
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => lerFoto(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                {medico.nome}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-soft text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> CRM Verificado
              </span>
            </div>

            {editando ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {medico.especialidade} • {medico.crm}
                </p>
                <p className="text-xs text-muted-foreground">
                  Nome, CRM e especialidade são alterados pelo administrador.
                </p>
                <input
                  aria-label="Valor da consulta (R$)"
                  type="number"
                  min={1}
                  max={5000}
                  value={valor}
                  onChange={(e) => setValor(Number(e.target.value))}
                  placeholder="Valor da consulta"
                  className="text-xs bg-background border rounded-xl px-3 py-2 outline-none"
                />
              </div>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                {medico.especialidade} • {medico.crm}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground flex-wrap pt-1">
              <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold">
                <Star className="w-4 h-4 fill-amber-500" /> {medico.avaliacao} (
                {avaliacoesDoMedico.length || medico.numAvaliacoes} avaliações)
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-primary" /> {medico.idiomas.join(", ")}
              </span>
            </div>

            <div className="pt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-primary">R$ {medico.valor},00</span>
              <span className="text-xs text-muted-foreground">/ consulta particular</span>
            </div>
          </div>

          {isProprioMedico && (
            <div className="self-start md:self-auto">
              {editando ? (
                <button type="button"
                  onClick={salvar}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" /> Salvar Perfil
                </button>
              ) : (
                <button type="button"
                  onClick={() => setEditando(true)}
                  className="px-5 py-2.5 rounded-xl border font-bold text-xs hover:bg-muted transition flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" /> Editar Perfil
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detalhes & Edição */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Biografia / Sobre */}
        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Sobre o Profissional
          </div>
          {editando ? (
            <textarea
                  aria-label="Bio do médico"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="w-full p-3 rounded-2xl border text-xs bg-background outline-none focus:ring-2 focus:ring-primary/20"
            />
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">{medico.bio}</p>
          )}
        </div>

        {/* Subespecialidades */}
        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Subespecialidades & Foco
          </div>
          <div className="flex flex-wrap gap-2">
            {medico.subespecialidades.map((sub) => (
              <span
                key={sub}
                className="px-3 py-1 rounded-xl bg-primary-soft text-primary text-xs font-semibold"
              >
                {sub}
              </span>
            ))}
          </div>
        </div>

        {/* Formação Acadêmica */}
        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" /> Formação & Títulos
          </div>
          {editando ? (
            <textarea
                  aria-label="Formação"
              value={formacao}
              onChange={(e) => setFormacao(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-2xl border text-xs bg-background outline-none"
            />
          ) : (
            <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
              <p className="font-medium text-foreground">{medico.formacao}</p>
              <p>{medico.experiencia}</p>
            </div>
          )}
        </div>

        {/* Horários de Atendimento */}
        <div className="bg-card border rounded-3xl p-6 space-y-3">
          <div className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Horários de Atendimento
          </div>
          <div className="grid grid-cols-3 gap-2">
            {medico.horariosDisponiveis.map((h) => (
              <span
                key={h}
                className="p-2.5 rounded-xl border bg-muted/50 text-xs font-bold text-center"
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Avaliações Recentes */}
      <div className="bg-card border rounded-3xl p-6 md:p-8 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">Depoimentos dos Pacientes</h3>
            <p className="text-xs text-muted-foreground">
              Avaliações verificadas de consultas realizadas na BION
            </p>
          </div>
          <span className="text-xs font-bold text-primary">
            {avaliacoesDoMedico.length} avaliação(ões)
          </span>
        </div>

        <div className="space-y-3 pt-2">
          {avaliacoesDoMedico.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum comentário recebido ainda.
            </p>
          ) : (
            avaliacoesDoMedico.map((av) => (
              <div key={av.id} className="p-4 rounded-2xl bg-muted/60 border text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{av.paciente}</span>
                  <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> {av.nota}.0
                  </div>
                </div>
                {av.comentario && (
                  <p className="text-muted-foreground leading-relaxed italic">“{av.comentario}”</p>
                )}
                <div className="text-xs text-muted-foreground">{av.quando}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
