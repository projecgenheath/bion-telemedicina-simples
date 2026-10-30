"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  alergiasValidas,
  verificarPrescricao,
  type MedicamentoEmUsoResumo,
} from "@/lib/seguranca-prescricao";
import { buscarMedicamentos, type SugestaoMedicamento } from "@/lib/catalogo-medicamentos";
import {
  chaveKits,
  gravarBancoKits,
  kitDoFormulario,
  kitsVisiveis,
  lerBancoKits,
  pacoteDoFormulario,
  pacotesVisiveis,
  removerItemKit,
  salvarKitReceita,
  salvarPacoteExames,
  type ArmazenamentoKits,
  type BancoKits,
  type KitReceita,
  type PacoteExames,
} from "@/lib/kits-prescricao";

/**
 * Prescrição assistida (melhorias nº 14–16 da auditoria médica), usada nas
 * DUAS superfícies de emissão do médico: a folha EmitirDocumentoSheet e o
 * modal de receita/exame da sala (ChamadaMedico). Concentra:
 *  - dados de segurança do paciente (alergias + medicamentos em uso);
 *  - banner de alergias e alertas textuais NÃO bloqueantes (fase 1);
 *  - campo de medicamento com busca (frequentes do médico + catálogo);
 *  - kits de receita e pacotes de exames salvos NESTE APARELHO.
 */

export type DadosSegurancaPaciente = {
  alergias: string[];
  medicamentosEmUso: MedicamentoEmUsoResumo[];
};

/**
 * Alergias e medicamentos em uso do paciente da consulta, pelo MESMO
 * caminho que a sala já usa para o cartão clínico (GET da evolução).
 * Sem consulta identificada ou com qualquer falha, devolve null e a
 * emissão segue sem o apoio — nunca um erro inventado na tela.
 */
export function useDadosSegurancaPaciente(consultaId?: string | null): DadosSegurancaPaciente | null {
  const [dados, setDados] = useState<DadosSegurancaPaciente | null>(null);
  useEffect(() => {
    if (!consultaId) {
      setDados(null);
      return;
    }
    let vivo = true;
    fetch(`/api/medico/consultas/${encodeURIComponent(consultaId)}/evolucao`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: { paciente?: { alergias?: string[] }; medicamentosEmUso?: { nome: string; dose?: string | null }[] } | null) => {
          if (!vivo || !j?.paciente) return;
          setDados({
            alergias: j.paciente.alergias ?? [],
            medicamentosEmUso: (j.medicamentosEmUso ?? []).map((m) => ({ nome: m.nome, dose: m.dose ?? null })),
          });
        },
      )
      .catch(() => {
        /* apoio à decisão: sem os dados, a emissão segue como hoje */
      });
    return () => {
      vivo = false;
    };
  }, [consultaId]);
  return dados;
}

/** Faixa de alergias do paciente, visível enquanto prescreve. */
export function BannerAlergias({ alergias }: { alergias: string[] | null | undefined }) {
  if (alergias === null || alergias === undefined) return null;
  const validas = alergiasValidas(alergias);
  if (!validas.length) {
    return <p className="text-xs opacity-70">Alergias: nenhuma registrada.</p>;
  }
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-400/40 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="note">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
      <span>
        <span className="font-bold">Alergias registradas: </span>
        {validas.join(", ")}
      </span>
    </div>
  );
}

/**
 * Alertas textuais da prescrição em curso (melhoria nº 14, fase 1):
 * conflito possível com alergia registrada e duplicidade com medicamento
 * em uso. NÃO bloqueiam: o médico lê e decide.
 */
export function AlertasPrescricao({
  medicamento,
  dados,
}: {
  medicamento: string;
  dados: DadosSegurancaPaciente | null;
}) {
  const alertas = useMemo(
    () => (dados ? verificarPrescricao(medicamento, dados.alergias, dados.medicamentosEmUso) : []),
    [medicamento, dados],
  );
  if (!alertas.length) return null;
  return (
    <div className="space-y-2">
      {alertas.map((a, i) =>
        a.tipo === "alergia" ? (
          <div
            key={i}
            className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-400/40 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            role="alert"
          >
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
            <span>
              <span className="font-bold">Possível conflito com alergia registrada: </span>
              {a.referencia}. Confira antes de emitir — este alerta é uma checagem de nome e não bloqueia a emissão.
            </span>
          </div>
        ) : (
          <div
            key={i}
            className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-400/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
            role="alert"
          >
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
            <span>
              <span className="font-bold">Este paciente já usa {a.referencia}. </span>
              Confira se é duplicidade ou a continuação intencional do tratamento.
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Campo de medicamento com busca (melhoria nº 15): sugestões dos
 * frequentes do próprio médico primeiro e do catálogo local depois;
 * selecionar preenche o nome e sugere posologia/duração (editáveis) e
 * marca o controlado quando o item é controlado.
 */
export function CampoMedicamentoBusca({
  valor,
  onChange,
  onSelecionar,
  frequentes,
  className,
  placeholder,
  ariaLabel,
  maxLength,
  required,
}: {
  valor: string;
  onChange: (v: string) => void;
  onSelecionar: (s: SugestaoMedicamento) => void;
  frequentes: SugestaoMedicamento[];
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const sugestoes = useMemo(() => buscarMedicamentos(valor, frequentes), [valor, frequentes]);
  const mostrar = aberto && sugestoes.length > 0;
  return (
    <div className="relative">
      <input
        value={valor}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
        }}
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        required={required}
        autoComplete="off"
      />
      {mostrar ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-bion-ink/15 dark:border-white/15 bg-white dark:bg-zinc-900 shadow-xl py-1">
          {sugestoes.map((s, i) => (
            <li key={`${s.fonte}-${s.nome}-${i}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-bion-ink/5 dark:hover:bg-white/10"
                onMouseDown={(e) => {
                  // mousedown (não click): chega antes do blur do campo.
                  e.preventDefault();
                  onSelecionar(s);
                  setAberto(false);
                }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {s.nome}
                  {s.fonte === "frequente" ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-px">
                      Seu frequente{s.vezes ? ` · ${s.vezes}×` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-bion-ink/10 dark:bg-white/10 px-2 py-px opacity-80">
                      Catálogo
                    </span>
                  )}
                  {s.controlado ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-px">
                      Controlado
                    </span>
                  ) : null}
                </span>
                {s.posologia ? <span className="block text-xs opacity-70 mt-0.5">{s.posologia}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** localStorage tolerante (modo privado/SSR): sem ele, os kits somem. */
const armazenamentoLocal: ArmazenamentoKits = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* sem persistência neste aparelho */
    }
  },
};

function useBancoKits(medicoId: string) {
  const [banco, setBanco] = useState<BancoKits>({ kits: [], pacotes: [], exemplosOcultos: [] });
  useEffect(() => {
    setBanco(lerBancoKits(armazenamentoLocal, medicoId));
  }, [medicoId]);
  const persistir = (novo: BancoKits) => {
    setBanco(novo);
    gravarBancoKits(armazenamentoLocal, medicoId, novo);
  };
  return { banco, persistir, chave: chaveKits(medicoId) };
}

function ChipModelo({
  rotulo,
  detalhe,
  exemplo,
  onAplicar,
  onRemover,
}: {
  rotulo: string;
  detalhe: string;
  exemplo?: boolean;
  onAplicar: () => void;
  onRemover: () => void;
}) {
  return (
    <span className="inline-flex items-stretch rounded-full border border-bion-ink/15 dark:border-white/15 overflow-hidden">
      <button type="button" onClick={onAplicar} className="px-3 py-1.5 text-left hover:bg-bion-ink/5 dark:hover:bg-white/10" title={detalhe}>
        <span className="block text-xs font-semibold leading-tight">{rotulo}</span>
        <span className="block text-[11px] opacity-70 leading-tight max-w-52 truncate">{detalhe}</span>
      </button>
      <button
        type="button"
        onClick={onRemover}
        className="px-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10"
        title={exemplo ? "Ocultar este exemplo" : "Apagar este modelo"}
        aria-label={`Remover modelo ${rotulo}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

function LinhaSalvarModelo({
  rotuloBotao,
  aberto,
  setAberto,
  nome,
  setNome,
  onSalvar,
  erro,
}: {
  rotuloBotao: string;
  aberto: boolean;
  setAberto: (v: boolean) => void;
  nome: string;
  setNome: (v: string) => void;
  onSalvar: () => void;
  erro: string | null;
}) {
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1 text-xs font-bold text-primary">
        <Plus className="w-3.5 h-3.5" /> {rotuloBotao}
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-1 w-full">
      <span className="flex items-center gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do modelo (ex.: Sinusite — amoxicilina)"
          maxLength={60}
          className="flex-1 min-w-0 rounded-lg border border-bion-ink/20 dark:border-white/20 bg-transparent px-2.5 py-1.5 text-xs"
          aria-label="Nome do modelo"
        />
        <button type="button" onClick={onSalvar} className="text-xs font-bold text-primary shrink-0">
          Salvar
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs font-bold opacity-70 shrink-0"
        >
          Cancelar
        </button>
      </span>
      {erro ? (
        <span className="text-xs font-semibold text-red-700 dark:text-red-300" role="alert">
          {erro}
        </span>
      ) : null}
    </span>
  );
}

const NOTA_APARELHO = "Modelos salvos neste aparelho — não sincronizam entre aparelhos.";

/** Kits de receita: aplicar com 1 toque e salvar o formulário atual. */
export function SecaoKitsReceita({
  medicoId,
  atual,
  onAplicar,
}: {
  medicoId: string;
  atual: { medicamento: string; posologia: string; duracao: string; controlado: boolean };
  onAplicar: (kit: KitReceita) => void;
}) {
  const { banco, persistir } = useBancoKits(medicoId);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const kits = kitsVisiveis(banco);

  const salvar = () => {
    const kit = kitDoFormulario({ nome, ...atual });
    if (!kit) {
      setErro("Preencha medicamento, posologia e duração, e dê um nome ao kit.");
      return;
    }
    persistir(salvarKitReceita(banco, kit));
    setNome("");
    setErro(null);
    setSalvando(false);
    toast.success("Kit salvo neste aparelho");
  };

  return (
    <div className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider opacity-75">Kits de receita</span>
        <LinhaSalvarModelo
          rotuloBotao="Salvar atual como kit"
          aberto={salvando}
          setAberto={(v) => {
            setSalvando(v);
            setErro(null);
          }}
          nome={nome}
          setNome={setNome}
          onSalvar={salvar}
          erro={erro}
        />
      </div>
      {kits.length ? (
        <div className="flex flex-wrap gap-1.5">
          {kits.map((k) => (
            <ChipModelo
              key={k.id}
              rotulo={k.nome}
              detalhe={`${k.medicamento} — ${k.posologia}`}
              exemplo={k.exemplo}
              onAplicar={() => onAplicar(k)}
              onRemover={() => persistir(removerItemKit(banco, k.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs opacity-70">Nenhum kit. Preencha a receita e salve como kit para reaplicar com 1 toque.</p>
      )}
      <p className="text-[11px] opacity-60">{NOTA_APARELHO}</p>
    </div>
  );
}

/** Pacotes de exames: idem, para a solicitação de exames. */
export function SecaoPacotesExames({
  medicoId,
  atualExames,
  onAplicar,
}: {
  medicoId: string;
  atualExames: string;
  onAplicar: (pacote: PacoteExames) => void;
}) {
  const { banco, persistir } = useBancoKits(medicoId);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const pacotes = pacotesVisiveis(banco);

  const salvar = () => {
    const pacote = pacoteDoFormulario({ nome, exames: atualExames });
    if (!pacote) {
      setErro("Preencha a lista de exames e dê um nome ao pacote.");
      return;
    }
    persistir(salvarPacoteExames(banco, pacote));
    setNome("");
    setErro(null);
    setSalvando(false);
    toast.success("Pacote salvo neste aparelho");
  };

  return (
    <div className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider opacity-75">Pacotes de exames</span>
        <LinhaSalvarModelo
          rotuloBotao="Salvar atual como pacote"
          aberto={salvando}
          setAberto={(v) => {
            setSalvando(v);
            setErro(null);
          }}
          nome={nome}
          setNome={setNome}
          onSalvar={salvar}
          erro={erro}
        />
      </div>
      {pacotes.length ? (
        <div className="flex flex-wrap gap-1.5">
          {pacotes.map((p) => (
            <ChipModelo
              key={p.id}
              rotulo={p.nome}
              detalhe={p.exames}
              exemplo={p.exemplo}
              onAplicar={() => onAplicar(p)}
              onRemover={() => persistir(removerItemKit(banco, p.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs opacity-70">Nenhum pacote. Preencha os exames e salve como pacote para reaplicar com 1 toque.</p>
      )}
      <p className="text-[11px] opacity-60">{NOTA_APARELHO}</p>
    </div>
  );
}
