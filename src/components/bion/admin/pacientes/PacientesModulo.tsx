"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeartPulse, Info, Plus, Search } from "lucide-react";
import { useBion, type PacienteRegistro } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { TabelaAdmin, type ColunaAdmin } from "../ui/TabelaAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { SheetAdmin } from "../ui/SheetAdmin";
import { Avatar } from "../ui/Formulario";
import { useLargo } from "../ui/preferencias";
import { useDadosAdmin } from "../dados";
import { hora as horaDe, rotuloDia } from "../tempo";
import { iniciais } from "../medicos/medicos";
import { FichaPaciente, type ModoFichaPaciente } from "./FichaPaciente";
import { FormularioPaciente } from "./FormularioPaciente";
import { FILTROS_SITUACAO, contarSituacoes, estadoPaciente, filtrarPacientes, idadeExibida, situacaoDe, ultimaEProxima, type FiltroSituacao } from "./pacientes";

const PAGINA = 60;
/** O bootstrap do admin traz no máximo 500 pacientes, os mais recentes (dados.ts). */
const LIMITE_BOOTSTRAP = 500;

/**
 * Pacientes do admin (Torre BION): busca por nome, e-mail ou CPF, cards com
 * idade, convênio, última e próxima consulta; ficha com dados, consultas,
 * documentos e chamados; excluir vira "arquivar e anonimizar" na zona de cuidado.
 * ?paciente=ID abre a ficha.
 */
export function PacientesModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { pacientes, consultas } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const largo = useLargo();
  const idAberto = params.get("paciente");
  const [modoInicial, setModoInicial] = useState<ModoFichaPaciente>("ficha");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("ativo");
  const [limite, setLimite] = useState(PAGINA);
  const [cadastro, setCadastro] = useState(false);
  const [cadastroSujo, setCadastroSujo] = useState(false);

  const abrir = (p: PacienteRegistro | null, modo: ModoFichaPaciente = "ficha") => {
    setModoInicial(modo);
    router.replace(p ? `/admin-pacientes?paciente=${encodeURIComponent(p.id)}` : "/admin-pacientes", { scroll: false });
  };
  const contagem = useMemo(() => contarSituacoes(pacientes), [pacientes]);
  const lista = useMemo(() => filtrarPacientes(pacientes, busca, situacao), [pacientes, busca, situacao]);
  const visiveis = lista.slice(0, limite);
  const fecharCadastro = () => {
    setCadastro(false);
    setCadastroSujo(false);
  };

  return (
    <TelaModulo
      titulo="Pacientes"
      icone={HeartPulse}
      subtitulo={`${contagem.ativo} ${contagem.ativo === 1 ? "conta ativa" : "contas ativas"} · ${pacientes.length} carregados`}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      acoes={
        <button type="button" onClick={() => setCadastro(true)} className="ba-botao ba-botao-primario" aria-label="Novo paciente">
          <Plus className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Novo paciente</span>
        </button>
      }
      ferramentas={
        <div className="flex flex-col lg:flex-row gap-2 w-full">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Buscar por nome, e-mail ou CPF</span>
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setLimite(PAGINA);
              }}
              placeholder="Buscar nome, e-mail ou CPF"
              className="ba-entrada !pl-10"
            />
          </label>
          <div role="group" aria-label="Situação da conta" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {FILTROS_SITUACAO.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={situacao === f.id}
                onClick={() => {
                  setSituacao(f.id);
                  setLimite(PAGINA);
                }}
                className="ba-aba ba-aba-solta shrink-0"
              >
                {f.rotulo}
                <span className="ml-1 tabular-nums opacity-80">· {contagem[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {pacientes.length >= LIMITE_BOOTSTRAP ? (
          <div className="ba-aviso" data-tom="atencao">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>O servidor carrega no máximo {LIMITE_BOOTSTRAP} pacientes (os cadastros mais recentes). Pacientes mais antigos podem não aparecer aqui.</p>
          </div>
        ) : null}
        <p className="text-sm ba-texto-2" aria-live="polite">
          {lista.length} {lista.length === 1 ? "paciente" : "pacientes"}
          {lista.length > visiveis.length ? ` · mostrando ${visiveis.length}` : ""}
        </p>
        {lista.length === 0 ? (
          <div className="ba-card" data-denso="true">
            <EstadoVazio
              icone={HeartPulse}
              titulo={busca ? "Nenhum paciente com essa busca" : "Nenhum paciente nesta situação"}
              texto={busca ? "Confira a grafia, o e-mail ou os números do CPF." : "Troque o filtro de situação."}
            />
          </div>
        ) : largo ? (
          <TabelaPacientes linhas={visiveis} agora={agora} selecionado={idAberto} onAbrir={(p) => abrir(p)} />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visiveis.map((p) => {
              const s = situacaoDe(p);
              const { ultima, proxima } = ultimaEProxima(consultas, p.id, agora);
              return (
                <button key={p.id} type="button" onClick={() => abrir(p)} className="ba-card" data-tom={estadoPaciente(s).tom} data-denso="true">
                  <span className="flex gap-3">
                    <Avatar iniciais={iniciais(p.nome)} tom={estadoPaciente(s).tom} />
                    <span className="flex-1 min-w-0">
                      <span className="font-bold leading-snug break-words block">{p.nome}</span>
                      <span className="text-xs ba-texto-2 block">
                        {idadeExibida(p, agora)} anos · {p.convenio || "Particular"}
                      </span>
                      <span className="text-xs ba-texto-2 block mt-1">
                        Próxima: {proxima ? `${rotuloDia(proxima.ts, agora)} ${horaDe(proxima.ts)}` : "nenhuma"} · Última: {ultima ? rotuloDia(ultima.ts, agora) : "nenhuma"}
                      </span>
                      <span className="flex flex-wrap gap-1.5 mt-1.5">
                        <ChipEstado estado={estadoPaciente(s)} />
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {lista.length > visiveis.length ? (
          <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full">
            Mostrar mais {Math.min(PAGINA, lista.length - visiveis.length)}
          </button>
        ) : null}
      </div>
      <FichaPaciente id={idAberto} agora={agora} modoInicial={modoInicial} onFechar={() => abrir(null)} />
      <SheetAdmin aberto={cadastro} onFechar={fecharCadastro} titulo="Novo paciente" descricao="A conta nasce com senha temporária." alteracoesPendentes={cadastroSujo}>
        {cadastro ? <FormularioPaciente onCancelar={fecharCadastro} onSalvo={fecharCadastro} onSujo={setCadastroSujo} /> : null}
      </SheetAdmin>
    </TelaModulo>
  );
}

function TabelaPacientes({ linhas, agora, selecionado, onAbrir }: { linhas: PacienteRegistro[]; agora: number; selecionado: string | null; onAbrir: (p: PacienteRegistro) => void }) {
  const { consultas } = useBion();
  const colunas: ColunaAdmin<PacienteRegistro>[] = [
    {
      id: "nome",
      titulo: "Paciente",
      render: (p) => (
        <span className="flex items-center gap-2.5 py-0.5">
          <Avatar iniciais={iniciais(p.nome)} tamanho="w-8 h-8" tom={estadoPaciente(situacaoDe(p)).tom} />
          <span className="min-w-0">
            <span className="font-bold whitespace-nowrap block">{p.nome}</span>
            <span className="text-xs ba-texto-2 block truncate max-w-[18rem]">{p.email}</span>
          </span>
        </span>
      ),
    },
    { id: "idade", titulo: "Idade", tipo: "num", largura: "5rem", render: (p) => idadeExibida(p, agora) },
    { id: "convenio", titulo: "Convênio", render: (p) => <span className="whitespace-nowrap">{p.convenio || "Particular"}</span> },
    {
      id: "ultima",
      titulo: "Última consulta",
      secundaria: true,
      render: (p) => {
        const u = ultimaEProxima(consultas, p.id, agora).ultima;
        return u ? <span className="whitespace-nowrap ba-texto-2">{rotuloDia(u.ts, agora)}</span> : <span className="ba-texto-3">—</span>;
      },
    },
    {
      id: "proxima",
      titulo: "Próxima consulta",
      render: (p) => {
        const x = ultimaEProxima(consultas, p.id, agora).proxima;
        return x ? (
          <span className="whitespace-nowrap">
            <span className="ba-texto-2">{rotuloDia(x.ts, agora)}</span> <b className="tabular-nums">{horaDe(x.ts)}</b>
          </span>
        ) : (
          <span className="ba-texto-3">—</span>
        );
      },
    },
    { id: "situacao", titulo: "Situação", largura: "11rem", render: (p) => <ChipEstado estado={estadoPaciente(situacaoDe(p))} /> },
  ];
  return <TabelaAdmin rotulo="Pacientes" colunas={colunas} linhas={linhas} chave={(p) => p.id} onAbrir={onAbrir} selecionada={selecionado} alturaMax="none" />;
}
