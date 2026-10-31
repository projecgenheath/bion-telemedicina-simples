"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, CalendarCheck, Star } from "lucide-react";

type MedicoPublico = {
  id: string;
  nome: string;
  especialidade: string;
  crm: string;
  bio: string;
  subespecialidades?: string[];
  formacao?: string;
  experiencia?: string;
  idiomas?: string[];
  valor: number;
  avaliacao: number;
  numAvaliacoes: number;
  foto?: string;
  horariosDisponiveis: string[];
  horariosPorDia?: Record<string, string[]>;
};

export default function PerfilPublicoPage() {
  const params = useParams();
  const id = params.id as string;
  const [medico, setMedico] = useState<MedicoPublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/publico/medico/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Médico não encontrado");
        return r.json();
      })
      .then(setMedico)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [id]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0a1f44] text-white flex items-center justify-center">
        <p>Carregando perfil...</p>
      </div>
    );
  }

  if (erro || !medico) {
    return (
      <div className="min-h-screen bg-[#0a1f44] text-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-bold">Perfil não encontrado</p>
          <p className="text-sm text-white/70 mt-2">{erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1f44] text-white">
      <div className="max-w-md mx-auto p-6">
        <div className="bg-white/10 rounded-3xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-3xl bg-white/15 flex items-center justify-center text-2xl font-black overflow-hidden">
              {medico.foto ? (
                <img src={medico.foto} alt={medico.nome} className="w-full h-full object-cover" />
              ) : (
                medico.nome.split(" ").slice(-2).map((w) => w[0]).join("")
              )}
            </div>
            <div>
              <h1 className="text-xl font-black">{medico.nome}</h1>
              <p className="text-sm text-white/85">{medico.especialidade}</p>
              <p className="text-xs text-white/70 flex items-center gap-1 mt-1">
                <BadgeCheck className="w-3.5 h-3.5" /> {medico.crm}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="bg-white/10 rounded-2xl py-3">
              <div className="text-xs font-bold uppercase text-white/70">Nota</div>
              <div className="text-lg font-black flex items-center justify-center gap-1">
                <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
                {medico.numAvaliacoes > 0 ? medico.avaliacao.toFixed(1) : "—"}
              </div>
            </div>
            <div className="bg-white/10 rounded-2xl py-3">
              <div className="text-xs font-bold uppercase text-white/70">Avaliações</div>
              <div className="text-lg font-black">{medico.numAvaliacoes}</div>
            </div>
          </div>

          {medico.bio && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-white/70">Sobre</div>
              <p className="text-sm mt-1 leading-relaxed">{medico.bio}</p>
            </div>
          )}

          {medico.formacao?.trim() ? (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-white/70">Formação</div>
              <p className="text-sm mt-1 leading-relaxed whitespace-pre-line">{medico.formacao}</p>
            </div>
          ) : null}

          {medico.experiencia?.trim() ? (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-white/70">Experiência</div>
              <p className="text-sm mt-1 leading-relaxed whitespace-pre-line">{medico.experiencia}</p>
            </div>
          ) : null}

          {medico.idiomas?.length ? (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-white/70">Idiomas</div>
              <p className="text-sm mt-1">{medico.idiomas.join(", ")}</p>
            </div>
          ) : null}

          {medico.subespecialidades?.length ? (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-white/70">Subespecialidades</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {medico.subespecialidades.map((s) => (
                  <span key={s} className="text-xs font-bold px-2 py-1 rounded-full bg-white/10">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase text-white/70">Consulta</div>
              <div className="text-2xl font-black">
                {medico.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
            <a
              href="/"
              className="rounded-full bg-white text-[#0a1f44] px-4 py-3 text-sm font-bold flex items-center gap-2"
            >
              <CalendarCheck className="w-4 h-4" /> Agendar
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-white/60 mt-6">
          Perfil público BION Telemedicina
        </p>
      </div>
    </div>
  );
}