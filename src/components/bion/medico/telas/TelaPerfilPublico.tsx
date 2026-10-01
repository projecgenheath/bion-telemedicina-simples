"use client";

import { useState } from "react";
import { BadgeCheck, CalendarCheck, Pencil, Star } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { fmtBRL, iniciais, nomeAnonimo } from "../metricas";
import { Campo, SheetMedico } from "../sheets/SheetMedico";
import type { Confirmar } from "../sheets/useConfirmarSalvamento";
import type { DadosMedico } from "../useDadosMedico";

const TAM_BIO = 2000; // limite do servidor

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-4 h-4 ${i <= Math.round(nota) ? "fill-amber-300 text-amber-300" : "text-white/40"}`} />
      ))}
    </span>
  );
}

/** Tela 3 — prévia do perfil PÚBLICO (o que o paciente vê ao agendar). */
export function TelaPerfilPublico({
  dados,
  onAgendar,
  confirmarBio,
}: {
  dados: DadosMedico;
  onAgendar: () => void;
  confirmarBio: Confirmar<string>;
}) {
  const { medico, sessao, avaliacoes, atendimentos30d } = dados;
  const [editandoBio, setEditandoBio] = useState(false);
  const comentarios = avaliacoes.filter((a) => a.comentario?.trim()).slice(0, 3);

  return (
    <section className="bm-tela bm-tela-3 flex flex-col px-5 pt-10 pb-8 text-white" aria-labelledby="bm-t3-titulo">
      <h2 id="bm-t3-titulo" className="text-2xl font-black">
        Seu perfil público
      </h2>
      <p className="text-sm text-white/80 mb-5">Prévia de como os pacientes veem você ao agendar.</p>

      {!medico ? (
        <div className="bp-glass-marinho p-5 text-sm text-white/85">
          Seu perfil público aparece aqui quando o cadastro for aprovado pela equipe BION.
        </div>
      ) : (
        <>
          <div className="bp-glass-marinho p-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-3xl overflow-hidden bg-white/15 shrink-0 inline-flex items-center justify-center text-2xl font-black">
                {medico.foto ? <img src={medico.foto} alt={`Foto de ${medico.nome}`} className="w-full h-full object-cover" /> : iniciais(medico.nome)}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-black leading-tight">{medico.nome}</div>
                <div className="text-sm text-white/85">{medico.especialidade}</div>
                <div className="text-xs text-white/80 mt-0.5 inline-flex items-center gap-1">
                  <BadgeCheck className="w-3.5 h-3.5" /> CRM {medico.crm}
                </div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/10 py-2.5">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-white/80">Nota</dt>
                <dd className="text-lg font-black">{medico.numAvaliacoes > 0 ? medico.avaliacao.toFixed(1) : "—"}</dd>
              </div>
              <div className="rounded-2xl bg-white/10 py-2.5">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-white/80">Avaliações</dt>
                <dd className="text-lg font-black">{medico.numAvaliacoes}</dd>
              </div>
              <div className="rounded-2xl bg-white/10 py-2.5">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-white/80">30 dias</dt>
                <dd className="text-lg font-black">{atendimentos30d}</dd>
              </div>
            </dl>
            <p className="text-xs text-white/80 mt-2">"30 dias" = consultas concluídas por você no período.</p>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white/80">Sobre</span>
                <button
                  type="button"
                  onClick={() => setEditandoBio(true)}
                  className="text-xs font-bold inline-flex items-center gap-1 text-sky-200"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              </div>
              <p className="text-sm text-white/90 mt-1 leading-relaxed whitespace-pre-line">
                {medico.bio?.trim() ? medico.bio : "Você ainda não escreveu sua apresentação."}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-white/80">Consulta</div>
                <div className="text-2xl font-black tabular-nums">{fmtBRL(medico.valor)}</div>
              </div>
              <button
                type="button"
                onClick={onAgendar}
                className="rounded-full bg-white text-bion-ink px-4 py-3 text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <CalendarCheck className="w-4 h-4" /> Agendar consulta
              </button>
            </div>
          </div>

          <div className="bp-glass-marinho p-5 mt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white/80 mb-2">Avaliações dos pacientes</div>
            {comentarios.length === 0 ? (
              <p className="text-sm text-white/85">Nenhum comentário recebido ainda.</p>
            ) : (
              <ul className="space-y-3">
                {comentarios.map((a) => (
                  <li key={a.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{nomeAnonimo(a.paciente)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Estrelas nota={a.nota} />
                        <span className="sr-only">{a.nota} de 5</span>
                      </span>
                    </div>
                    <p className="text-sm text-white/90 italic">“{a.comentario}”</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-white/80 mt-3">Na prévia, o nome do paciente aparece abreviado.</p>
          </div>
        </>
      )}

      {editandoBio && medico ? (
        <BioSheet
          onFechar={() => setEditandoBio(false)}
          id={medico.id}
          bio={medico.bio ?? ""}
          nome={sessao.nome}
          confirmar={confirmarBio}
        />
      ) : null}
    </section>
  );
}

function BioSheet({
  onFechar,
  id,
  bio,
  nome,
  confirmar,
}: {
  onFechar: () => void;
  id: string;
  bio: string;
  nome: string;
  confirmar: Confirmar<string>;
}) {
  const { atualizarMedico } = useBion();
  const [texto, setTexto] = useState(bio);
  const salvar = () => {
    const novo = texto.trim().slice(0, TAM_BIO);
    atualizarMedico(id, { bio: novo });
    confirmar(novo, "Salvando apresentação…", "Apresentação atualizada");
    onFechar();
  };
  return (
    <SheetMedico aberto onFechar={onFechar} titulo="Sua apresentação" subtitulo={`Aparece no perfil público de ${nome}.`}>
      <Campo rotulo="Sobre você" ajuda={`${texto.length}/${TAM_BIO} caracteres`}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, TAM_BIO))}
          rows={6}
          className="bp-entrada !rounded-2xl w-full px-4 py-3 text-sm"
        />
      </Campo>
      <button type="button" onClick={salvar} disabled={texto.trim() === bio.trim()} className="bp-acao w-full py-3 text-sm mt-4">
        Salvar apresentação
      </button>
    </SheetMedico>
  );
}
