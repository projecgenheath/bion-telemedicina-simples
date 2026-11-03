"use client";

import { crmComRotulo } from "@/lib/medico-exibicao";
import { useState } from "react";
import { Award, BadgeCheck, Briefcase, CalendarCheck, Copy, Globe, ListChecks, Pencil, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { useBion, type Medico } from "@/lib/bion-store";
import { completudePerfil, fmtBRL, iniciais, nomeAnonimo, resumoAvaliacoes } from "../metricas";
import { Campo, SheetMedico } from "../sheets/SheetMedico";
import { useConfirmarSalvamento, type Confirmar } from "../sheets/useConfirmarSalvamento";
import type { DadosMedico } from "../useDadosMedico";

const TAM_BIO = 2000; // limite do servidor
const TAM_TEXTO = 2000; // formação/experiência: mesmo limite do servidor

type CamposPerfil = Pick<Medico, "formacao" | "experiencia" | "idiomas" | "subespecialidades">;

/** Chave de confirmação do salvamento: os 4 campos normalizados (trim) como uma string só. */
const chaveCamposPerfil = (c: CamposPerfil) =>
  JSON.stringify({
    f: c.formacao.trim(),
    e: c.experiencia.trim(),
    i: c.idiomas.map((x) => x.trim()).filter(Boolean),
    s: c.subespecialidades.map((x) => x.trim()).filter(Boolean),
  });

const listaDeTexto = (texto: string) =>
  texto
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

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
  // Mesmo cuidado que em TelaGestao: medico undefined durante o
  // bootstrap não é cadastro pendente — só depois do carregamento o
  // undefined significa "ainda não aprovado/ativo".
  const { carregando } = useBion();
  const [editandoBio, setEditandoBio] = useState(false);
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const resumo = resumoAvaliacoes(avaliacoes);
  const completude = medico ? completudePerfil(medico) : null;
  // Confirmação do salvamento dos campos do perfil (formação etc.): o hook
  // mora AQUI (componente que continua montado), como o confirmarBio do
  // MedicoApp — a folha só fecha quando o delta do servidor confirma.
  const confirmarPerfil = useConfirmarSalvamento(medico ? chaveCamposPerfil(medico) : "", (a, b) => a === b);

  return (
    <section className="bm-tela bm-tela-3 flex flex-col px-5 pt-10 pb-20 text-white" aria-labelledby="bm-t3-titulo">
      <h2 id="bm-t3-titulo" className="text-2xl font-black">
        Seu perfil público
      </h2>
      <p className="text-sm text-white/80 mb-5">Prévia de como os pacientes veem você ao agendar.</p>

      {medico && (
        <button
          type="button"
          onClick={async () => {
            const link = `${window.location.origin}/p/${medico.id}`;
            // M-6: aguarda a promise e trata a permissão negada — antes o
            // sucesso era anunciado mesmo com a cópia rejeitada.
            try {
              await navigator.clipboard.writeText(link);
              toast.success("Link copiado", { description: "Cole em qualquer rede social." });
            } catch {
              toast.error("Não foi possível copiar", {
                description: "Copie manualmente: " + link,
                duration: 10_000,
              });
            }
          }}
          className="mb-4 text-xs font-bold inline-flex items-center gap-1.5 text-sky-200"
        >
          <Copy className="w-3.5 h-3.5" /> Copiar link do perfil
        </button>
      )}

      {medico && completude ? (
        <div className="bp-glass-marinho p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white/80 inline-flex items-center gap-1.5">
              <ListChecks className="w-4 h-4" /> Perfil {completude.percentual}% completo
            </span>
            {completude.faltantes.length ? (
              <button
                type="button"
                onClick={() => setEditandoPerfil(true)}
                className="text-xs font-bold text-sky-200"
              >
                Completar perfil
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-300">Completo</span>
            )}
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={completude.percentual} aria-valuemin={0} aria-valuemax={100} aria-label={`Perfil ${completude.percentual}% completo`}>
            <div className="h-full bg-emerald-300 rounded-full" style={{ width: `${completude.percentual}%` }} />
          </div>
          {completude.faltantes.length ? (
            <p className="text-xs text-white/80 mt-2">Falta: {completude.faltantes.join(", ")}.</p>
          ) : null}
        </div>
      ) : null}

      {carregando ? (
        <div className="bp-glass-marinho p-5 text-sm text-white/85">
          Carregando seu cadastro…
        </div>
      ) : !medico ? (
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
                  <BadgeCheck className="w-3.5 h-3.5" /> {crmComRotulo(medico.crm)}
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

            {(medico.formacao?.trim() || medico.experiencia?.trim() || medico.idiomas.length || medico.subespecialidades.length) ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/80">Formação e atuação</span>
                  <button
                    type="button"
                    onClick={() => setEditandoPerfil(true)}
                    className="text-xs font-bold inline-flex items-center gap-1 text-sky-200"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>
                {medico.formacao?.trim() ? (
                  <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">
                    <Award className="w-4 h-4 inline mr-1.5 -mt-0.5" aria-hidden />
                    {medico.formacao}
                  </p>
                ) : null}
                {medico.experiencia?.trim() ? (
                  <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">
                    <Briefcase className="w-4 h-4 inline mr-1.5 -mt-0.5" aria-hidden />
                    {medico.experiencia}
                  </p>
                ) : null}
                {medico.idiomas.length ? (
                  <p className="text-sm text-white/90">
                    <Globe className="w-4 h-4 inline mr-1.5 -mt-0.5" aria-hidden />
                    {medico.idiomas.join(", ")}
                  </p>
                ) : null}
                {medico.subespecialidades.length ? (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-white/80 mb-1.5 inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Subespecialidades
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {medico.subespecialidades.map((s) => (
                        <span key={s} className="text-xs font-bold px-2 py-1 rounded-full bg-white/10">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditandoPerfil(true)}
                className="mt-4 text-xs font-bold inline-flex items-center gap-1 text-sky-200"
              >
                <Pencil className="w-3.5 h-3.5" /> Adicionar formação, experiência, idiomas e subespecialidades
              </button>
            )}

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
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">Suas avaliações</span>
              <span className="text-xs font-bold text-white/80">
                {resumo.total} recebida(s){resumo.media !== null ? ` · média ${resumo.media.toFixed(1).replace(".", ",")}` : ""}
              </span>
            </div>
            {avaliacoes.length === 0 ? (
              <p className="text-sm text-white/85">Nenhuma avaliação recebida ainda.</p>
            ) : (
              <>
                {(resumo.pontualidade !== null || resumo.atencao !== null || resumo.clareza !== null) && (
                  <div className="space-y-1.5 mb-3">
                    <DimensaoAvaliacao rotulo="Pontualidade" valor={resumo.pontualidade} />
                    <DimensaoAvaliacao rotulo="Atenção" valor={resumo.atencao} />
                    <DimensaoAvaliacao rotulo="Clareza" valor={resumo.clareza} />
                  </div>
                )}
                <div className="space-y-1 mb-3" aria-label="Distribuição de estrelas">
                  {resumo.distribuicao
                    .map((n, i) => ({ estrelas: i + 1, n }))
                    .reverse()
                    .map(({ estrelas, n }) => (
                      <div key={estrelas} className="flex items-center gap-2 text-xs text-white/80">
                        <span className="w-6 tabular-nums">{estrelas}★</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                          <div
                            className="h-full bg-amber-300 rounded-full"
                            style={{ width: `${resumo.total ? (n / resumo.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-6 text-right tabular-nums">{n}</span>
                      </div>
                    ))}
                </div>
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {avaliacoes.map((a) => (
                    <li key={a.id} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">{nomeAnonimo(a.paciente)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Estrelas nota={a.nota} />
                          <span className="sr-only">{a.nota} de 5</span>
                        </span>
                      </div>
                      {(a.pontualidade || a.atencao || a.clareza) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {a.pontualidade ? <Subnota rotulo="Pontualidade" valor={a.pontualidade} /> : null}
                          {a.atencao ? <Subnota rotulo="Atenção" valor={a.atencao} /> : null}
                          {a.clareza ? <Subnota rotulo="Clareza" valor={a.clareza} /> : null}
                        </div>
                      )}
                      {a.comentario?.trim() ? (
                        <p className="text-sm text-white/90 italic mt-1">“{a.comentario}”</p>
                      ) : null}
                      <p className="text-xs text-white/70 mt-1">{a.quando}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-xs text-white/80 mt-3">Lista completa das suas avaliações; na prévia pública, o nome do paciente aparece abreviado.</p>
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

      {editandoPerfil && medico ? (
        <PerfilCompletoSheet
          onFechar={() => setEditandoPerfil(false)}
          medico={medico}
          confirmar={confirmarPerfil}
        />
      ) : null}
    </section>
  );
}

/** Média de uma dimensão das avaliações (barra 0–5). Sem avaliações da dimensão, não renderiza. */
function DimensaoAvaliacao({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  if (valor === null) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-white/85">
      <span className="w-24">{rotulo}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
        <div className="h-full bg-amber-300 rounded-full" style={{ width: `${(valor / 5) * 100}%` }} />
      </div>
      <span className="w-7 text-right font-bold tabular-nums">{valor.toFixed(1).replace(".", ",")}</span>
    </div>
  );
}

function Subnota({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10">
      {rotulo} {valor}★
    </span>
  );
}

/**
 * Editor completo do perfil público: formação, experiência, idiomas e
 * subespecialidades — campos que o servidor já aceita na autoedição
 * (PATCH /api/medicos/[id]) e a página pública exibe. Salvar aguarda a
 * confirmação real (delta do servidor), como BioSheet/PrecoSheet.
 */
function PerfilCompletoSheet({
  onFechar,
  medico,
  confirmar,
}: {
  onFechar: () => void;
  medico: Medico;
  confirmar: Confirmar<string>;
}) {
  const { atualizarMedico } = useBion();
  const [formacao, setFormacao] = useState(medico.formacao ?? "");
  const [experiencia, setExperiencia] = useState(medico.experiencia ?? "");
  const [idiomas, setIdiomas] = useState((medico.idiomas ?? []).join(", "));
  const [subespecialidades, setSubespecialidades] = useState((medico.subespecialidades ?? []).join(", "));
  const [erro, setErro] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  const campos: CamposPerfil = {
    formacao: formacao.trim(),
    experiencia: experiencia.trim(),
    idiomas: listaDeTexto(idiomas),
    subespecialidades: listaDeTexto(subespecialidades),
  };
  const alterado = chaveCamposPerfil(campos) !== chaveCamposPerfil(medico);

  const fechar = () => {
    if (!salvando) onFechar();
  };
  const salvar = async () => {
    setErro(undefined);
    setSalvando(true);
    atualizarMedico(medico.id, campos);
    const ok = await confirmar(chaveCamposPerfil(campos), "Salvando perfil…", "Perfil atualizado");
    setSalvando(false);
    if (ok) onFechar();
    else setErro("Não foi possível confirmar o salvamento. Verifique sua conexão e toque em Salvar novamente.");
  };

  const entrada = "bp-entrada !rounded-2xl w-full px-4 py-3 text-sm";
  return (
    <SheetMedico aberto onFechar={fechar} titulo="Formação e atuação" subtitulo="Aparece no seu perfil público, abaixo da apresentação.">
      <div className="space-y-4">
        <Campo rotulo="Formação e títulos" ajuda={`${formacao.length}/${TAM_TEXTO} caracteres`}>
          <textarea
            value={formacao}
            onChange={(e) => setFormacao(e.target.value.slice(0, TAM_TEXTO))}
            rows={3}
            placeholder="Ex.: Medicina na FMUSP · Residência em Clínica Médica no HC"
            className={entrada}
          />
        </Campo>
        <Campo rotulo="Experiência" ajuda={`${experiencia.length}/${TAM_TEXTO} caracteres`}>
          <textarea
            value={experiencia}
            onChange={(e) => setExperiencia(e.target.value.slice(0, TAM_TEXTO))}
            rows={3}
            placeholder="Ex.: 10 anos de pronto-socorro e atenção primária"
            className={entrada}
          />
        </Campo>
        <Campo rotulo="Idiomas" ajuda="Separe por vírgula. Ex.: Português, Inglês, Espanhol">
          <input
            value={idiomas}
            onChange={(e) => setIdiomas(e.target.value)}
            placeholder="Português, Inglês"
            className={entrada}
          />
        </Campo>
        <Campo rotulo="Subespecialidades e focos" ajuda="Separe por vírgula. Ex.: Check-up, Saúde do homem" erro={erro}>
          <input
            value={subespecialidades}
            onChange={(e) => setSubespecialidades(e.target.value)}
            placeholder="Check-up, Medicina preventiva"
            className={entrada}
          />
        </Campo>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !alterado}
          className="bp-acao w-full py-3 text-sm disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar perfil"}
        </button>
      </div>
    </SheetMedico>
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
  const [erro, setErro] = useState<string>();
  const [salvando, setSalvando] = useState(false);
  // Mesmo padrão de PrecoSheet/AgendaSheet: salvar AGUARDA a confirmação
  // real (delta do servidor) e só então fecha. Sem confirmação em tempo, a
  // folha fica aberta com erro + retry, em vez de fechar fingindo sucesso —
  // e fechar à mão (X/ESC/fundo) também fica travado enquanto salva.
  const fechar = () => {
    if (!salvando) onFechar();
  };
  const salvar = async () => {
    const novo = texto.trim().slice(0, TAM_BIO);
    setErro(undefined);
    setSalvando(true);
    atualizarMedico(id, { bio: novo });
    const ok = await confirmar(novo, "Salvando apresentação…", "Apresentação atualizada");
    setSalvando(false);
    if (ok) onFechar();
    else setErro("Não foi possível confirmar o salvamento. Verifique sua conexão e toque em Salvar novamente.");
  };
  return (
    <SheetMedico aberto onFechar={fechar} titulo="Sua apresentação" subtitulo={`Aparece no perfil público de ${nome}.`}>
      <Campo rotulo="Sobre você" erro={erro} ajuda={`${texto.length}/${TAM_BIO} caracteres`}>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value.slice(0, TAM_BIO));
            setErro(undefined);
          }}
          rows={6}
          className="bp-entrada !rounded-2xl w-full px-4 py-3 text-sm"
        />
      </Campo>
      <button
        type="button"
        onClick={salvar}
        disabled={salvando || texto.trim() === bio.trim()}
        className="bp-acao w-full py-3 text-sm mt-4 disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar apresentação"}
      </button>
    </SheetMedico>
  );
}
