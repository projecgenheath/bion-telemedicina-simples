"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Inbox, LifeBuoy, Search, Stethoscope, User } from "lucide-react";
import { toast } from "sonner";
import { useBion, type TicketSuporte } from "@/lib/bion-store";
import { urlDa, type View } from "@/lib/rotas";
import { TelaModulo } from "../ui/TelaModulo";
import { KpiAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { SheetAdmin } from "../ui/SheetAdmin";
import { useLargo } from "../ui/preferencias";
import { useDadosAdmin } from "../dados";
import { estadoChamado } from "../rotulos";
import {
  CATEGORIAS_CHAMADO,
  FILTROS_CHAMADO_VAZIOS,
  FILTROS_STATUS,
  contarChamados,
  duracaoCurta,
  esperaMaisAntiga,
  estadoEspera,
  filtrarChamados,
  filtrosChamadoAtivos,
  rotuloCategoriaChamado,
  rotuloPerfilChamado,
  tsDoChamado,
  type FiltroStatusChamado,
  type FiltrosChamado,
} from "./chamados";
import { Conversa, Resposta } from "./Conversa";

const PAGINA = 40;
const lerStatus = (v: string | null): FiltroStatusChamado => (v === "aberto" || v === "em_andamento" || v === "resolvido" ? v : "todos");

/**
 * Chamados (Suporte) do admin no visual Torre BION: lista → conversa.
 * Mesmas funções do admin no ChamadosSuporte compartilhado (que não muda):
 * ver todos os chamados, buscar, filtrar por status, abrir e responder
 * (a resposta marca como resolvido — PATCH /api/tickets/[id], só ADMIN).
 * Responder notifica a pessoa e não dá para desfazer: pede confirmação.
 * ?chamado=ID abre a conversa; ?status=aberto já filtra.
 */
export function SuporteModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { tickets } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const largo = useLargo();
  const idAberto = params.get("chamado");
  const [filtros, setFiltros] = useState<FiltrosChamado>(() => ({ ...FILTROS_CHAMADO_VAZIOS, status: lerStatus(params.get("status")) }));
  // Veio de um atalho com ?status= estando já na tela: aplica o filtro (ajuste durante o render).
  const statusUrl = params.get("status");
  const [statusUrlAntes, setStatusUrlAntes] = useState(statusUrl);
  if (statusUrl !== statusUrlAntes) {
    setStatusUrlAntes(statusUrl);
    if (statusUrl) setFiltros((f) => ({ ...f, status: lerStatus(statusUrl) }));
  }
  const [limite, setLimite] = useState(PAGINA);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});

  const contagem = useMemo(() => contarChamados(tickets), [tickets]);
  const lista = useMemo(() => filtrarChamados(tickets, filtros, agora), [tickets, filtros, agora]);
  const visiveis = lista.slice(0, limite);
  const espera = esperaMaisAntiga(tickets, agora);
  const pendentes = contagem.aberto + contagem.em_andamento;
  const aberto = idAberto ? (tickets.find((t) => t.id === idAberto) ?? null) : null;

  const abrir = (t: TicketSuporte | null) =>
    router.replace(t ? `${urlDa("suporte")}?chamado=${encodeURIComponent(t.id)}` : urlDa("suporte"), { scroll: false });
  const ir = (destino: string) => {
    const [v, q] = destino.split("?");
    router.push(q ? `${urlDa(v as View)}?${q}` : urlDa(v as View));
  };
  const mudar = (p: Partial<FiltrosChamado>) => {
    setFiltros((f) => ({ ...f, ...p }));
    setLimite(PAGINA);
  };
  const limpar = () => {
    const antes = filtros;
    setFiltros(FILTROS_CHAMADO_VAZIOS);
    setLimite(PAGINA);
    toast("Filtros limpos.", { duration: 5000, action: { label: "Desfazer", onClick: () => setFiltros(antes) } });
  };
  const rascunho = aberto ? (rascunhos[aberto.id] ?? "") : "";
  const setRascunho = (v: string) => aberto && setRascunhos((r) => ({ ...r, [aberto.id]: v }));

  // ↑/↓ andam entre os chamados da lista (Enter/Espaço abrem — são botões).
  const listaRef = useRef<HTMLUListElement>(null);
  const aoTeclarLista = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const botoes = Array.from(listaRef.current?.querySelectorAll<HTMLButtonElement>("button[data-chamado]") ?? []);
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    botoes[Math.max(0, Math.min(botoes.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const listaChamados =
    lista.length === 0 ? (
      <div className="ba-card" data-denso="true">
        {tickets.length === 0 ? (
          <EstadoVazio icone={LifeBuoy} titulo="Nenhum chamado ainda" texto="Quando um paciente ou médico abrir um chamado, ele aparece aqui." />
        ) : (
          <EstadoVazio
            icone={Search}
            titulo="Nenhum chamado com esses filtros"
            texto="Troque o status ou limpe a busca."
            acao={
              <button type="button" onClick={limpar} className="ba-botao ba-botao-secundario">
                Limpar filtros
              </button>
            }
          />
        )}
      </div>
    ) : (
      <>
        <ul ref={listaRef} onKeyDown={aoTeclarLista} className={largo ? "space-y-2" : "grid grid-cols-1 gap-2 md:grid-cols-2"} aria-label="Chamados">
          {visiveis.map((t) => (
            <li key={t.id} className="min-w-0">
              <CartaoChamado t={t} agora={agora} selecionado={largo && t.id === idAberto} temRascunho={Boolean(rascunhos[t.id]?.trim())} onAbrir={() => abrir(t)} />
            </li>
          ))}
        </ul>
        {lista.length > visiveis.length ? (
          <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full mt-2">
            Mostrar mais {Math.min(PAGINA, lista.length - visiveis.length)}
          </button>
        ) : null}
      </>
    );

  return (
    <TelaModulo
      titulo="Chamados"
      icone={LifeBuoy}
      subtitulo={`${pendentes} ${pendentes === 1 ? "pendente" : "pendentes"} · ${tickets.length} no total`}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      ferramentas={
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col lg:flex-row gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Buscar por assunto, pessoa ou mensagem</span>
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
              <input type="search" value={filtros.busca} onChange={(e) => mudar({ busca: e.target.value })} placeholder="Buscar assunto, pessoa ou mensagem" className="ba-entrada !pl-10" />
            </label>
            <div className="grid grid-cols-2 gap-2 lg:w-[26rem]">
              <select value={filtros.perfil} onChange={(e) => mudar({ perfil: e.target.value as FiltrosChamado["perfil"] })} className="ba-entrada" aria-label="Perfil de quem abriu">
                <option value="todos">Pacientes e médicos</option>
                <option value="paciente">Só pacientes</option>
                <option value="medico">Só médicos</option>
              </select>
              <select value={filtros.categoria} onChange={(e) => mudar({ categoria: e.target.value as FiltrosChamado["categoria"] })} className="ba-entrada" aria-label="Categoria">
                <option value="todas">Todas as categorias</option>
                {CATEGORIAS_CHAMADO.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Status do chamado">
            {FILTROS_STATUS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtros.status === f.id}
                onClick={() => mudar({ status: f.id })}
                className="ba-filtro shrink-0"
                data-tom={f.id !== "todos" ? estadoChamado(f.id).tom : undefined}
              >
                {f.id !== "todos" ? <span className="ba-chip-ponto" aria-hidden /> : null}
                {f.rotulo}
                <span className="tabular-nums opacity-80">{contagem[f.id]}</span>
              </button>
            ))}
            {filtrosChamadoAtivos(filtros) ? (
              <button type="button" onClick={limpar} className="ba-botao ba-botao-secundario shrink-0 !min-h-9 !px-3 !text-xs">
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiAdmin denso rotulo="Abertos" valor={contagem.aberto} tom={contagem.aberto ? "atencao" : undefined} detalhe="esperando resposta" onAbrir={() => mudar({ status: "aberto" })} />
          <KpiAdmin denso rotulo="Em atendimento" valor={contagem.em_andamento} tom={contagem.em_andamento ? "sinal" : undefined} detalhe="em análise" onAbrir={() => mudar({ status: "em_andamento" })} />
          <KpiAdmin denso rotulo="Resolvidos" valor={contagem.resolvido} tom={contagem.resolvido ? "ok" : undefined} detalhe="com resposta" onAbrir={() => mudar({ status: "resolvido" })} />
          <KpiAdmin
            denso
            rotulo="Espera mais longa"
            valor={espera === null ? "—" : duracaoCurta(espera)}
            tom={estadoEspera(espera)?.tom}
            detalhe={espera === null ? "nenhum pendente" : "do pendente mais antigo"}
          />
        </div>
        <p className="text-sm ba-texto-2" aria-live="polite">
          {lista.length} {lista.length === 1 ? "chamado" : "chamados"}
          {lista.length > visiveis.length ? ` · mostrando ${visiveis.length}` : ""}
        </p>

        {largo ? (
          <div className="grid grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] gap-4 items-start">
            <div className="min-w-0">{listaChamados}</div>
            <section className="ba-card sticky top-4 max-h-[calc(100dvh-7rem)] flex flex-col min-h-[24rem] p-0 overflow-hidden" aria-label="Conversa do chamado">
              {aberto ? (
                <>
                  <div className="flex-1 overflow-y-auto px-5 pt-5 pb-3">
                    <Conversa t={aberto} agora={agora} onIr={ir} onAbrirOutro={abrir} />
                  </div>
                  <div className="shrink-0 px-5 py-4 border-t" style={{ borderColor: "var(--ba-borda)" }}>
                    <Resposta key={aberto.id} t={aberto} valor={rascunho} onMudar={setRascunho} onEnviado={() => setRascunhos((r) => ({ ...r, [aberto.id]: "" }))} />
                  </div>
                </>
              ) : (
                <EstadoVazio
                  icone={Inbox}
                  titulo={idAberto ? "Chamado não encontrado" : "Escolha um chamado"}
                  texto={idAberto ? "Ele pode ter sido removido. Atualize a lista." : "A conversa aparece aqui. Use ↑ e ↓ para andar na lista."}
                />
              )}
            </section>
          </div>
        ) : (
          listaChamados
        )}
      </div>

      {!largo ? (
        <SheetAdmin
          aberto={Boolean(idAberto)}
          onFechar={() => abrir(null)}
          titulo={aberto?.assunto || (idAberto ? "Chamado não encontrado" : "Chamado")}
          descricao={aberto ? `${aberto.usuario} · ${rotuloPerfilChamado(aberto.perfil)}` : undefined}
          alteracoesPendentes={Boolean(rascunho.trim())}
          rodape={aberto ? <Resposta key={aberto.id} t={aberto} valor={rascunho} onMudar={setRascunho} onEnviado={() => setRascunhos((r) => ({ ...r, [aberto.id]: "" }))} /> : undefined}
        >
          {aberto ? <Conversa t={aberto} agora={agora} onIr={ir} onAbrirOutro={abrir} semTitulo /> : <p className="text-sm ba-texto-2">Ele pode ter sido removido. Atualize a lista.</p>}
        </SheetAdmin>
      ) : null}
    </TelaModulo>
  );
}

function CartaoChamado({ t, agora, selecionado, temRascunho, onAbrir }: { t: TicketSuporte; agora: number; selecionado: boolean; temRascunho: boolean; onAbrir: () => void }) {
  const e = estadoChamado(t.status);
  const ts = tsDoChamado(t.data, agora);
  const espera = t.status !== "resolvido" && ts !== null ? estadoEspera(Math.max(0, agora - ts)) : null;
  const Icone = t.perfil === "medico" ? Stethoscope : User;
  return (
    <button
      type="button"
      data-chamado={t.id}
      onClick={onAbrir}
      aria-current={selecionado ? "true" : undefined}
      className="ba-card w-full text-left"
      data-tom={e.tom}
      data-denso="true"
    >
      <span className="flex gap-3">
        <span className="ba-estado-icone !w-10 !h-10 shrink-0" data-tom="sinal" aria-hidden>
          <Icone className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span className="font-bold leading-snug break-words flex-1 min-w-0">{t.assunto || "Chamado sem assunto"}</span>
            <span className="text-xs ba-texto-2 shrink-0 tabular-nums">{t.data}</span>
          </span>
          <span className="text-xs ba-texto-2 block truncate">
            {t.usuario} ({rotuloPerfilChamado(t.perfil).toLowerCase()}) · {rotuloCategoriaChamado(t.categoria)}
          </span>
          <span className="text-sm ba-texto-2 block mt-1 line-clamp-2">{t.mensagem}</span>
          <span className="flex flex-wrap gap-1.5 mt-2">
            <ChipEstado estado={e} />
            {espera ? (
              <ChipEstado tom={espera.tom} ponto={false}>
                <Clock className="w-3 h-3 inline -mt-0.5 mr-1" aria-hidden />
                {espera.rotulo}
              </ChipEstado>
            ) : null}
            {temRascunho ? (
              <ChipEstado tom="sinal" ponto={false}>
                Rascunho
              </ChipEstado>
            ) : null}
          </span>
        </span>
      </span>
    </button>
  );
}
