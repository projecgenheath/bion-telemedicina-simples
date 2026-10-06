"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, CheckCircle2, Info, Plus, RotateCcw, Search, Star, Stethoscope } from "lucide-react";
import { useBion, type Medico } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { TabelaAdmin, type ColunaAdmin } from "../ui/TabelaAdmin";
import { CardDeslizavel } from "../ui/CardDeslizavel";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { SheetAdmin } from "../ui/SheetAdmin";
import { Avatar } from "../ui/Formulario";
import { useLargo } from "../ui/preferencias";
import { useDadosAdmin } from "../dados";
import { brl } from "../tempo";
import { FichaMedico, type ModoFicha } from "./FichaMedico";
import { FormularioMedico } from "./FormularioMedico";
import { useAcoesMedico } from "./acoes";
import { useEnviosPendentes } from "./adiadas";
import {
  ABAS_MEDICOS,
  acoesDoStatus,
  consultas30d,
  contarPorAba,
  especialidadesDe,
  estadoMedicoAdmin,
  filtrarMedicos,
  iniciais,
  lerAba,
  statusDe,
  type AbaMedicos,
} from "./medicos";

const PAGINA = 60;

/**
 * Médicos do admin (Torre BION). Junta a antiga "Usuários & CRM" (que era de
 * mentira) com a validação REAL: aprovar/reativar (com "Desfazer" de 5 s,
 * nada é enviado antes), suspender e arquivar com confirmação.
 * ?aba=ativos|validacao|suspensos|arquivados · ?medico=ID abre a ficha.
 */
export function MedicosModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { medicos, consultas } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const largo = useLargo();
  const contagem = useMemo(() => contarPorAba(medicos), [medicos]);
  const aba: AbaMedicos = lerAba(params.get("aba")) ?? (contagem.validacao ? "validacao" : "ativos");
  const idAberto = params.get("medico");
  const [modoInicial, setModoInicial] = useState<ModoFicha>("ficha");
  const [busca, setBusca] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [limite, setLimite] = useState(PAGINA);
  const [cadastro, setCadastro] = useState(false);
  const [cadastroSujo, setCadastroSujo] = useState(false);

  const irPara = (p: { aba?: AbaMedicos; medico?: string | null }) => {
    const q = new URLSearchParams();
    q.set("aba", p.aba ?? aba);
    const m = p.medico === undefined ? idAberto : p.medico;
    if (m) q.set("medico", m);
    router.replace(`/admin-medicos?${q.toString()}`, { scroll: false });
  };
  const abrir = (m: Medico, modo: ModoFicha = "ficha") => {
    setModoInicial(modo);
    irPara({ medico: m.id });
  };

  const lista = filtrarMedicos(medicos, { aba, busca, especialidade });
  const visiveis = lista.slice(0, limite);
  const especialidades = useMemo(() => especialidadesDe(medicos), [medicos]);

  const teclaAbas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = ABAS_MEDICOS.findIndex((a) => a.id === aba);
    const nova = ABAS_MEDICOS[(i + (e.key === "ArrowRight" ? 1 : ABAS_MEDICOS.length - 1)) % ABAS_MEDICOS.length].id;
    setLimite(PAGINA);
    irPara({ aba: nova, medico: null });
    document.getElementById(`aba-med-${nova}`)?.focus();
  };

  return (
    <TelaModulo
      titulo="Médicos"
      icone={Stethoscope}
      subtitulo={`${contagem.ativos} ${contagem.ativos === 1 ? "ativo" : "ativos"} · ${contagem.validacao} em validação`}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      acoes={
        <button type="button" onClick={() => setCadastro(true)} className="ba-botao ba-botao-primario" aria-label="Novo médico">
          <Plus className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Novo médico</span>
        </button>
      }
      ferramentas={
        <div className="space-y-3 w-full">
          <div role="tablist" aria-label="Situação dos médicos" className="ba-abas max-w-full overflow-x-auto" onKeyDown={teclaAbas}>
            {ABAS_MEDICOS.map((a) => (
              <button
                key={a.id}
                id={`aba-med-${a.id}`}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                aria-controls="painel-medicos"
                tabIndex={aba === a.id ? 0 : -1}
                onClick={() => {
                  setLimite(PAGINA);
                  irPara({ aba: a.id, medico: null });
                }}
                className="ba-aba"
              >
                {a.rotulo}
                <span className="ml-1 tabular-nums opacity-80">· {contagem[a.id]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col lg:flex-row gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Buscar por nome, CRM ou especialidade</span>
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setLimite(PAGINA);
                }}
                placeholder="Buscar nome, CRM ou especialidade"
                className="ba-entrada !pl-10"
              />
            </label>
            <label className="lg:w-72">
              <span className="sr-only">Especialidade</span>
              <select value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} className="ba-entrada" aria-label="Especialidade">
                <option value="">Todas as especialidades</option>
                {especialidades.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      }
    >
      <div role="tabpanel" id="painel-medicos" aria-labelledby={`aba-med-${aba}`} className="space-y-4">
        {aba === "validacao" && contagem.validacao ? (
          <div className="ba-aviso" data-tom="atencao">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              Confira o CRM antes de aprovar. Aprovar libera a agenda e avisa o médico pelo app; você tem 5 segundos para desfazer antes de qualquer envio.
              {largo ? "" : " No celular, deslize o card para a direita para aprovar."}
            </p>
          </div>
        ) : null}
        <p className="text-sm ba-texto-2" aria-live="polite">
          {lista.length} {lista.length === 1 ? "médico" : "médicos"}
          {lista.length > visiveis.length ? ` · mostrando ${visiveis.length}` : ""}
        </p>
        {lista.length === 0 ? (
          <div className="ba-card" data-denso="true">
            <EstadoVazio
              icone={aba === "validacao" ? CheckCircle2 : Stethoscope}
              tom={aba === "validacao" ? "ok" : "sinal"}
              titulo={busca || especialidade ? "Nenhum médico com esses filtros" : aba === "validacao" ? "Nenhum cadastro esperando validação" : "Nenhum médico aqui"}
              texto={busca || especialidade ? "Limpe a busca ou troque a especialidade." : aba === "validacao" ? "Quando um médico novo se cadastrar, ele aparece aqui." : undefined}
            />
          </div>
        ) : largo ? (
          <TabelaMedicos linhas={visiveis} agora={agora} selecionado={idAberto} onAbrir={(m) => abrir(m)} />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visiveis.map((m) => (
              <CardMedico key={m.id} medico={m} agora={agora} consultas30={consultas30d(consultas, m.id, agora)} onAbrir={abrir} />
            ))}
          </div>
        )}
        {lista.length > visiveis.length ? (
          <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full">
            Mostrar mais {Math.min(PAGINA, lista.length - visiveis.length)}
          </button>
        ) : null}
      </div>
      <FichaMedico id={idAberto} agora={agora} modoInicial={modoInicial} onFechar={() => irPara({ medico: null })} />
      <SheetAdmin
        aberto={cadastro}
        onFechar={() => {
          setCadastro(false);
          setCadastroSujo(false);
        }}
        titulo="Novo médico"
        descricao="Identificação, dados profissionais e revisão."
        alteracoesPendentes={cadastroSujo}
      >
        {cadastro ? (
          <FormularioMedico
            onCancelar={() => {
              setCadastro(false);
              setCadastroSujo(false);
            }}
            onSalvo={() => {
              setCadastro(false);
              setCadastroSujo(false);
            }}
            onSujo={setCadastroSujo}
          />
        ) : null}
      </SheetAdmin>
    </TelaModulo>
  );
}

/** Crachá de vidro (celular/tablet) com gesto: direita aprova/reativa (com Desfazer), esquerda abre a suspensão. */
function CardMedico({ medico: m, consultas30, onAbrir }: { medico: Medico; agora: number; consultas30: number; onAbrir: (m: Medico, modo?: ModoFicha) => void }) {
  const { aprovarComDesfazer, desfazerAprovacao } = useAcoesMedico();
  const pendentes = useEnviosPendentes();
  const s = statusDe(m);
  const acoes = acoesDoStatus(s);
  const chave = `medico:${m.id}`;
  const pendente = pendentes.has(chave);
  const estado = pendente ? { rotulo: s === "pendente" ? "Aprovando…" : "Reativando…", tom: "sinal" as const } : estadoMedicoAdmin(s);
  return (
    <CardDeslizavel
      rotulo={`${m.nome}, ${estadoMedicoAdmin(s).rotulo.toLowerCase()}`}
      tom={estado.tom}
      denso
      onAbrir={() => onAbrir(m)}
      direita={
        !pendente && (acoes.aprovar || acoes.reativar)
          ? {
              id: "aprovar",
              rotulo: acoes.aprovar ? "Aprovar" : "Reativar",
              icone: acoes.aprovar ? CheckCircle2 : RotateCcw,
              tom: "ok",
              modo: "direto",
              executar: () => aprovarComDesfazer(m, acoes.aprovar ? "aprovar" : "reativar"),
            }
          : undefined
      }
      esquerda={!pendente && acoes.suspender ? { id: "suspender", rotulo: "Suspender…", icone: Ban, tom: "critico", modo: "confirmar", executar: () => onAbrir(m, "suspender") } : undefined}
      rodape={
        pendente ? (
          <button type="button" className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs mt-2 ml-[3.75rem]" onClick={() => desfazerAprovacao(m)}>
            Desfazer
          </button>
        ) : null
      }
    >
      <div className="flex gap-3">
        <Avatar foto={m.foto} iniciais={iniciais(m.nome)} tom={estado.tom} />
        <div className="flex-1 min-w-0">
          <p className="font-bold leading-snug break-words">{m.nome}</p>
          <p className="text-xs ba-texto-2 break-words">
            {m.especialidade} · CRM {m.crm}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <ChipEstado estado={estado} />
            {s !== "pendente" ? (
              <ChipEstado tom="neutro" ponto={false}>
                <Star className="w-3 h-3 inline -mt-0.5" aria-hidden /> {m.numAvaliacoes ? m.avaliacao.toFixed(1) : "—"}
              </ChipEstado>
            ) : null}
            {s === "ativo" ? (
              <ChipEstado tom="neutro" ponto={false}>
                {consultas30} em 30 dias
              </ChipEstado>
            ) : null}
            <ChipEstado tom="neutro" ponto={false}>
              {brl(Math.round(m.valor * 100))}
            </ChipEstado>
          </div>
        </div>
      </div>
    </CardDeslizavel>
  );
}

/** Desktop: tabela densa; a ficha abre no painel à direita. Na validação, o botão Aprovar fica na linha. */
function TabelaMedicos({ linhas, agora, selecionado, onAbrir }: { linhas: Medico[]; agora: number; selecionado: string | null; onAbrir: (m: Medico) => void }) {
  const { consultas } = useBion();
  const { aprovarComDesfazer, desfazerAprovacao } = useAcoesMedico();
  const pendentes = useEnviosPendentes();
  const colunas: ColunaAdmin<Medico>[] = [
    {
      id: "medico",
      titulo: "Médico",
      render: (m) => (
        <span className="flex items-center gap-2.5 py-0.5">
          <Avatar foto={m.foto} iniciais={iniciais(m.nome)} tamanho="w-8 h-8" />
          <span className="font-bold whitespace-nowrap">{m.nome}</span>
        </span>
      ),
    },
    { id: "crm", titulo: "CRM", render: (m) => <span className="whitespace-nowrap tabular-nums">{m.crm}</span> },
    { id: "esp", titulo: "Especialidade", render: (m) => <span className="ba-texto-2 whitespace-nowrap">{m.especialidade}</span> },
    { id: "nota", titulo: "Nota", tipo: "num", largura: "5.5rem", render: (m) => (m.numAvaliacoes ? `★ ${m.avaliacao.toFixed(1)}` : "—") },
    { id: "c30", titulo: "30 dias", tipo: "num", largura: "6rem", secundaria: true, render: (m) => consultas30d(consultas, m.id, agora) },
    { id: "valor", titulo: "Valor", tipo: "num", largura: "7rem", render: (m) => brl(Math.round(m.valor * 100)) },
    {
      id: "status",
      titulo: "Situação",
      largura: "13rem",
      render: (m) => {
        const s = statusDe(m);
        const a = acoesDoStatus(s);
        const chave = `medico:${m.id}`;
        if (pendentes.has(chave)) {
          return (
            <span className="flex items-center gap-2">
              <ChipEstado tom="sinal">{s === "pendente" ? "Aprovando…" : "Reativando…"}</ChipEstado>
              <button
                type="button"
                className="ba-botao ba-botao-secundario !min-h-8 !px-3 !text-xs"
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  desfazerAprovacao(m);
                }}
              >
                Desfazer
              </button>
            </span>
          );
        }
        return (
          <span className="flex items-center gap-2">
            <ChipEstado estado={estadoMedicoAdmin(s)} />
            {a.aprovar || a.reativar ? (
              <button
                type="button"
                className="ba-botao ba-botao-primario !min-h-8 !px-3 !text-xs"
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  aprovarComDesfazer(m, a.aprovar ? "aprovar" : "reativar");
                }}
              >
                {a.aprovar ? "Aprovar" : "Reativar"}
              </button>
            ) : null}
          </span>
        );
      },
    },
  ];
  return <TabelaAdmin rotulo="Médicos" colunas={colunas} linhas={linhas} chave={(m) => m.id} onAbrir={onAbrir} selecionada={selecionado} alturaMax="none" />;
}
