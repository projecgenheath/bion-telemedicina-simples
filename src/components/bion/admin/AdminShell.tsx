"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Inbox,
  Info,
  LayoutGrid,
  MessageCircle,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";
import { SheetAdmin } from "./ui/SheetAdmin";
import { useDensidadeAdmin } from "./ui/preferencias";
import { useAtalhoBusca } from "./ui/atalho";
import { poppinsAdmin } from "./fonte-admin";
import { ROTULO_TIPO, casa, type ResultadoBusca, type TipoResultado } from "./busca";
import type { Tom } from "./rotulos";
import { CampoBusca } from "./ui/CampoBusca";
import "./admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type ItemNavAdmin = {
  id: string;
  rotulo: string;
  icone: Icone;
  selo?: number;
  tomSelo?: Tom;
  /** Sinônimos para a busca do lançador (ex.: "lgpd cofre"). */
  palavras?: string;
};
export type GrupoNavAdmin = { rotulo: string; itens: ItemNavAdmin[] };
export type Migalha = { rotulo: string; onClick?: () => void };
/** Módulo aberto (no celular mostra topo com "Voltar"). */
export type ModuloAberto = { titulo: string; icone?: Icone; onVoltar: () => void };
/** Id reservado: abre a Fila (sheet lateral no desktop ou bottom sheet no celular). */
export const ID_FILA = "fila";

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

/** Quem está dentro da casca (Fila, Conta) pode fechar as camadas antes de navegar. */
const CamadasCtx = createContext<{ fechar: () => void; abrirFila: () => void }>({
  fechar: () => {},
  abrirFila: () => {},
});
export const useCamadasAdmin = () => useContext(CamadasCtx);

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * Casca da Torre BION — alinhada ao redesign de Médicos e Pacientes:
 * - Desktop (≥ 1024 px): barra lateral fixa só com ícones (76 px), topo limpo
 *   com busca (Ctrl K / ⌘K), Fila, Mensagens, Notificações e Perfil.
 * - Celular / Tablet (< 1024 px): topo limpo + barra inferior fixa de 5 itens
 *   com botão central azul (#76A1F3) para o lançador de busca e módulos.
 * - Conta e Fila abrem em drawers/sheets acessíveis (SheetAdmin).
 */
export function AdminShell({
  grupos,
  ativo,
  onNavegar,
  migalhas = [],
  usuario,
  conta,
  fila,
  filaContagem = 0,
  notificacoesNaoLidas = 0,
  mensagensNaoLidas = 0,
  onNotificacoes,
  onMensagens,
  onBuscar,
  acoesBarra,
  modulo,
  abrirNaFila = false,
  buscar,
  children,
}: {
  grupos: GrupoNavAdmin[];
  ativo: string;
  onNavegar: (id: string) => void;
  migalhas?: Migalha[];
  usuario: { nome: string; foto?: string | null };
  conta: ReactNode;
  fila: ReactNode;
  filaContagem?: number;
  notificacoesNaoLidas?: number;
  mensagensNaoLidas?: number;
  onNotificacoes?: () => void;
  onMensagens?: () => void;
  onBuscar?: () => void;
  acoesBarra?: ReactNode;
  modulo?: ModuloAberto;
  abrirNaFila?: boolean;
  buscar?: (termo: string) => ResultadoBusca[];
  children: ReactNode;
}) {
  const atalho = useAtalhoBusca();
  const { densidade } = useDensidadeAdmin();
  const [lateral, setLateral] = useState<"conta" | "fila" | null>(abrirNaFila ? "fila" : null);
  const [lancador, setLancador] = useState(false);

  // Trocou de módulo: fecha painel lateral e lançador (ajuste durante o render).
  const [ativoAntes, setAtivoAntes] = useState(ativo);
  if (ativo !== ativoAntes) {
    setAtivoAntes(ativo);
    setLateral(null);
    setLancador(false);
  }

  const fecharCamadas = useCallback(() => {
    setLateral(null);
    setLancador(false);
  }, []);

  const abrirFila = useCallback(() => {
    setLancador(false);
    setLateral("fila");
  }, []);

  const camadas = useMemo(() => ({ fechar: fecharCamadas, abrirFila }), [fecharCamadas, abrirFila]);
  const abrirBusca = useCallback(() => (onBuscar ? onBuscar() : setLancador(true)), [onBuscar]);

  // ⌘K / Ctrl K abre a busca em qualquer tamanho de tela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrirBusca();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [abrirBusca]);

  const navegar = useCallback(
    (id: string) => {
      setLancador(false);
      if (id === ID_FILA) abrirFila();
      else onNavegar(id);
    },
    [abrirFila, onNavegar],
  );

  // Separa os itens principais (Operação/Dinheiro/Comando) dos de Sistema para o trilho lateral.
  const principais = useMemo(
    () =>
      grupos
        .filter((g) => g.rotulo !== "Sistema")
        .flatMap((g) => g.itens)
        .filter((it) => it.id !== ID_FILA),
    [grupos],
  );
  const sistemaItens = useMemo(
    () => grupos.find((g) => g.rotulo === "Sistema")?.itens ?? [],
    [grupos],
  );



  return (
    <CamadasCtx.Provider value={camadas}>
      <div className={`ba-app ${poppinsAdmin.variable}`} data-densidade={densidade}>
        <a
          href="#ba-conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] ba-botao ba-botao-primario"
        >
          Pular para o conteúdo
        </a>

        <BarraLateralAdmin
          principais={principais}
          sistema={sistemaItens}
          ativo={ativo}
          onNavegar={navegar}
          onConta={() => setLateral("conta")}
        />

        {/* Topo desktop (≥ 1024 px) — mesmo desenho de Médico e Paciente */}
        <header className="ba2-topo hidden lg:flex flex-wrap items-center gap-x-3 gap-y-2 px-7 shrink-0">
          {modulo ? (
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={modulo.onVoltar}
                aria-label="Voltar ao início"
                className="ba2-icone-topo ba2-icone-topo-borda grid h-10 w-10 shrink-0 place-items-center rounded-full"
              >
                <ArrowLeft className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              </button>
              <nav aria-label="Você está em" className="min-w-0 pr-3 border-r border-[var(--ba-divisor)]">
                <ol className="flex flex-wrap items-center gap-1.5 text-[13px] min-w-0">
                  {migalhas.map((m, i) => {
                    const ultima = i === migalhas.length - 1;
                    return (
                      <li key={`${m.rotulo}-${i}`} className="flex items-center gap-1.5 min-w-0">
                        {i > 0 ? <ChevronRight className="w-3.5 h-3.5 shrink-0 ba-texto-3" aria-hidden /> : null}
                        {m.onClick && !ultima ? (
                          <button type="button" onClick={m.onClick} className="ba-texto-2 hover:underline text-left leading-snug">
                            {m.rotulo}
                          </button>
                        ) : (
                          <span className={`leading-snug ${ultima ? "font-medium" : "ba-texto-2"}`} aria-current={ultima ? "page" : undefined}>
                            {m.rotulo}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
          ) : null}

          <button
            type="button"
            onClick={abrirBusca}
            className="flex min-w-0 flex-1 max-w-md items-center gap-2.5 py-2 text-left text-[13px] ba-texto-2 hover:text-[var(--ba-texto)]"
            aria-label={`Buscar ou ir para (${atalho.falado})`}
            aria-keyshortcuts="Control+K Meta+K"
            title={`Buscar ou ir para (${atalho.falado})`}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 leading-snug">Buscar módulo, pessoa, consulta…</span>
            <kbd
              className="ml-auto hidden xl:inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ba-texto-3"
              style={{ borderColor: "var(--ba-borda)", background: "var(--ba-card)" }}
              aria-hidden
            >
              {atalho.curto}
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLateral("fila")}
              className="inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors"
              style={{
                background: filaContagem > 0 ? "var(--ba-azul-ativo)" : "var(--ba-card)",
                color: filaContagem > 0 ? "var(--ba-sinal)" : "var(--ba-texto)",
                border: "1px solid var(--ba-borda)",
              }}
              aria-label={`Fila de decisões${filaContagem ? ` (${filaContagem})` : ""}`}
            >
              <Inbox className="h-4 w-4" aria-hidden />
              <span>Fila</span>
              {filaContagem > 0 ? (
                <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-[#c42b2b] px-1.5 text-[11px] font-semibold text-white tabular-nums">
                  {filaContagem > 99 ? "99+" : filaContagem}
                </span>
              ) : null}
            </button>

            {onMensagens ? (
              <button
                type="button"
                onClick={onMensagens}
                aria-label={
                  mensagensNaoLidas > 0
                    ? `Mensagens: ${mensagensNaoLidas} não lida${mensagensNaoLidas > 1 ? "s" : ""}`
                    : "Mensagens"
                }
                aria-current={ativo === "mensagens" ? "page" : undefined}
                className="ba2-icone-topo ba2-icone-topo-borda relative grid h-10 w-10 shrink-0 place-items-center rounded-full"
              >
                <MessageCircle className="h-[1.1rem] w-[1.1rem]" aria-hidden />
                {mensagensNaoLidas > 0 ? (
                  <span aria-hidden className="ba2-contador">
                    {mensagensNaoLidas > 99 ? "99+" : mensagensNaoLidas}
                  </span>
                ) : null}
              </button>
            ) : null}

            {onNotificacoes ? (
              <button
                type="button"
                onClick={onNotificacoes}
                aria-label={`Notificações${notificacoesNaoLidas ? ` (${notificacoesNaoLidas} não lidas)` : ""}`}
                aria-current={ativo === "notificacoes" ? "page" : undefined}
                className="ba2-icone-topo ba2-icone-topo-borda relative grid h-10 w-10 shrink-0 place-items-center rounded-full"
              >
                <Bell className="h-[1.1rem] w-[1.1rem]" aria-hidden />
                {notificacoesNaoLidas > 0 ? (
                  <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#c42b2b]" />
                ) : null}
              </button>
            ) : (
              acoesBarra
            )}

            <span aria-hidden className="h-8 w-px bg-[var(--ba-borda)] mx-1" />

            <button
              type="button"
              onClick={() => setLateral("conta")}
              aria-label="Abrir sua conta e aparência"
              className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left hover:bg-[var(--ba-card)] transition-colors"
            >
              <AvatarShell usuario={usuario} tamanho="h-10 w-10" />
              <span className="min-w-0">
                <span className="block max-w-[14rem] text-[13px] font-medium leading-snug">{usuario.nome}</span>
                <span className="block max-w-[14rem] text-[11px] ba-texto-2 leading-snug">Administrador</span>
              </span>
              <ChevronDown className="ml-2 h-4 w-4 ba-texto-2" aria-hidden />
            </button>
          </div>
        </header>

        {/* Topo celular / tablet (< 1024 px): ícones numa linha, título inteiro na de baixo. */}
        <header className="ba2-topo flex lg:hidden flex-col gap-2 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
          <div className="flex items-center gap-2">
            {modulo ? (
              <button
                type="button"
                onClick={modulo.onVoltar}
                className="ba2-icone-topo ba2-icone-topo-borda mr-auto grid h-11 w-11 shrink-0 place-items-center rounded-full"
                aria-label="Voltar ao início"
              >
                <ArrowLeft className="h-[1.15rem] w-[1.15rem]" aria-hidden />
              </button>
            ) : (
              <span className="mr-auto" />
            )}

          <button
            type="button"
            onClick={abrirBusca}
            aria-label="Buscar ou ir para…"
            className="ba2-icone-topo ba2-icone-topo-borda grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <Search className="h-[1.1rem] w-[1.1rem]" aria-hidden />
          </button>

          {onMensagens ? (
            <button
              type="button"
              onClick={onMensagens}
              aria-label={mensagensNaoLidas > 0 ? `Mensagens: ${mensagensNaoLidas} não lidas` : "Mensagens"}
              className="ba2-icone-topo ba2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
            >
              <MessageCircle className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              {mensagensNaoLidas > 0 ? (
                <span aria-hidden className="ba2-contador">
                  {mensagensNaoLidas > 99 ? "99+" : mensagensNaoLidas}
                </span>
              ) : null}
            </button>
          ) : null}

          {onNotificacoes ? (
            <button
              type="button"
              onClick={onNotificacoes}
              aria-label={`Notificações${notificacoesNaoLidas ? ` (${notificacoesNaoLidas} não lidas)` : ""}`}
              className="ba2-icone-topo ba2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
            >
              <Bell className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              {notificacoesNaoLidas > 0 ? (
                <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#c42b2b]" />
              ) : null}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setLateral("fila")}
            aria-label={`Fila de decisões${filaContagem ? ` (${filaContagem})` : ""}`}
            className="ba2-icone-topo ba2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <Inbox className="h-[1.1rem] w-[1.1rem]" aria-hidden />
            {filaContagem > 0 ? (
              <span aria-hidden className="ba2-contador">
                {filaContagem > 99 ? "99+" : filaContagem}
              </span>
            ) : null}
          </button>
          </div>
          {modulo ? (
            <h1 className="text-xl font-medium leading-snug">{modulo.titulo}</h1>
          ) : (
            <button
              type="button"
              onClick={() => setLateral("conta")}
              className="flex items-center gap-3 text-left"
              aria-label="Abrir sua conta"
            >
              <AvatarShell usuario={usuario} tamanho="h-11 w-11" />
              <span>
                <span className="block text-[15px] font-medium">{usuario.nome}</span>
                <span className="block text-xs ba-texto-2">Torre BION · Admin</span>
              </span>
            </button>
          )}
        </header>

        <main id="ba-conteudo" tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto ba-coluna outline-none">
          {children}
        </main>

        <BarraInferiorAdmin ativo={ativo} lancadorAberto={lancador} onNavegar={navegar} onAbrirLancador={abrirBusca} />

        <SheetAdmin aberto={lateral === "conta"} onFechar={() => setLateral(null)} titulo="Sua conta" familia={false}>
          {conta}
        </SheetAdmin>
        <SheetAdmin
          aberto={lateral === "fila"}
          onFechar={() => setLateral(null)}
          titulo="Fila de decisões"
          descricao="Tudo o que espera uma decisão sua."
          familia={false}
        >
          {fila}
        </SheetAdmin>
        <Lancador
          aberto={lancador}
          onFechar={() => setLancador(false)}
          grupos={grupos}
          ativo={ativo}
          onNavegar={navegar}
          buscar={buscar}
        />
      </div>
    </CamadasCtx.Provider>
  );
}

/** Barra lateral fixa só com ícones (≥ 1024 px), no mesmo desenho de Médico e Paciente. */
function BarraLateralAdmin({
  principais,
  sistema,
  ativo,
  onNavegar,
  onConta,
}: {
  principais: ItemNavAdmin[];
  sistema: ItemNavAdmin[];
  ativo: string;
  onNavegar: (id: string) => void;
  onConta: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const [menuSistema, setMenuSistema] = useState(false);
  const sistemaRef = useRef<HTMLLIElement>(null);
  const botaoSistemaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuSistema) return;
    const fora = (e: PointerEvent) => {
      if (!sistemaRef.current?.contains(e.target as Node)) setMenuSistema(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenuSistema(false);
      botaoSistemaRef.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [menuSistema]);

  const sistemaAtivo = sistema.some((s) => s.id === ativo);
  const sistemaSelos = sistema.reduce((a, s) => a + (s.selo ?? 0), 0);

  return (
    <aside
      className={`ba2-lateral ${menuSistema ? "ba2-lateral-com-menu" : ""}`}
      aria-label="Menu do administrador"
    >
      <div className="grid h-[75px] place-items-center border-b border-[var(--ba-divisor)] shrink-0">
        <button
          type="button"
          onClick={() => onNavegar("dashboard")}
          aria-label="Torre BION — Início"
          className="rounded-xl p-1"
        >
          <Logo size="sm" />
        </button>
      </div>

      <nav aria-label="Áreas" className="ba2-lateral-nav flex flex-1 flex-col items-center overflow-y-auto py-3">
        <ul className="flex flex-col items-center gap-2.5">
          {principais.map((it) => {
            const aqui = ativo === it.id;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onNavegar(it.id)}
                  aria-label={`${it.rotulo}${it.selo ? ` (${it.selo})` : ""}`}
                  aria-current={aqui ? "page" : undefined}
                  title={it.rotulo}
                  className={`ba2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${aqui ? "ba2-lateral-ativo" : ""}`}
                >
                  <it.icone className="h-5 w-5" aria-hidden />
                  {it.selo ? (
                    <span
                      aria-hidden
                      className="ba2-lateral-ponto"
                      data-tom={it.tomSelo ?? "critico"}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <span aria-hidden className="my-4 h-px w-10 shrink-0 bg-[var(--ba-divisor)]" />

        <ul className="flex flex-col items-center gap-2.5">
          <li ref={sistemaRef} className="relative">
            <button
              ref={botaoSistemaRef}
              type="button"
              onClick={() => setMenuSistema((v) => !v)}
              aria-label={`Sistema: auditoria, IA, LGPD e travas${sistemaSelos ? ` (${sistemaSelos} alertas)` : ""}`}
              aria-haspopup="true"
              aria-expanded={menuSistema}
              aria-controls="ba2-menu-sistema"
              title="Sistema: auditoria, IA, LGPD e travas"
              className={`ba2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${sistemaAtivo || menuSistema ? "ba2-lateral-ativo" : ""}`}
            >
              <SlidersHorizontal className="h-5 w-5" aria-hidden />
              {sistemaSelos ? <span aria-hidden className="ba2-lateral-ponto" data-tom="critico" /> : null}
            </button>
            {menuSistema ? (
              <ul id="ba2-menu-sistema" aria-label="Sistema" className="ba2-lateral-menu">
                {sistema.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuSistema(false);
                        onNavegar(s.id);
                      }}
                      aria-current={ativo === s.id ? "page" : undefined}
                    >
                      <s.icone className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0 leading-snug">{s.rotulo}</span>
                      {s.selo ? (
                        <span className="rounded-full bg-[#c42b2b] px-1.5 text-[10px] font-semibold text-white tabular-nums">
                          {s.selo}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>

          <li>
            <button
              type="button"
              onClick={onConta}
              aria-label="Sua conta e aparência"
              title="Sua conta e aparência"
              className="ba2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem]"
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </li>

          <li>
            <button
              type="button"
              onClick={() => onNavegar("ajuda")}
              aria-label="Ajuda"
              aria-current={ativo === "ajuda" ? "page" : undefined}
              title="Ajuda"
              className={`ba2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${ativo === "ajuda" ? "ba2-lateral-ativo" : ""}`}
            >
              <Info className="h-5 w-5" aria-hidden />
            </button>
          </li>
        </ul>
      </nav>

      <div className="mx-3 border-t border-[var(--ba-divisor)] py-3 text-center text-[11px] ba-texto-2 tabular-nums shrink-0">
        <time aria-label="Hora atual em São Paulo" suppressHydrationWarning>
          {fmtHora.format(agora)}
        </time>
      </div>
    </aside>
  );
}

/** Barra inferior fixa no celular (< 1024 px): 5 itens no mesmo desenho de Médico e Paciente. */
function BarraInferiorAdmin({
  ativo,
  lancadorAberto,
  onNavegar,
  onAbrirLancador,
}: {
  ativo: string;
  lancadorAberto: boolean;
  onNavegar: (id: string) => void;
  onAbrirLancador: () => void;
}) {
  const esquerda = [
    { id: "dashboard", nome: "Início", Icone: LayoutGrid },
    { id: "admin-agendamentos", nome: "Agendamentos", Icone: CalendarClock },
  ];
  const direita = [
    { id: "admin-medicos", nome: "Médicos", Icone: Stethoscope },
    { id: "admin-repasses", nome: "Repasses", Icone: Wallet },
  ];

  const botao = (it: { id: string; nome: string; Icone: Icone }) => {
    const aqui = ativo === it.id;
    return (
      <li key={it.id}>
        <button
          type="button"
          onClick={() => onNavegar(it.id)}
          aria-label={it.nome}
          aria-current={aqui ? "page" : undefined}
          className={`ba2-barra-item ${aqui ? "ba2-barra-ativo" : ""}`}
        >
          <it.Icone className="ba2-barra-icone" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <nav aria-label="Navegação principal" className="ba2-barra">
      <ul>
        {esquerda.map(botao)}
        <li>
          <button
            type="button"
            onClick={onAbrirLancador}
            aria-label="Ir para módulo ou buscar"
            aria-haspopup="dialog"
            aria-expanded={lancadorAberto}
            className="ba2-barra-mais"
          >
            <Plus className="ba2-barra-mais-icone" aria-hidden />
          </button>
        </li>
        {direita.map(botao)}
      </ul>
    </nav>
  );
}

function AvatarShell({ usuario, tamanho = "h-10 w-10" }: { usuario: { nome: string; foto?: string | null }; tamanho?: string }) {
  return (
    <span className={`${tamanho} ba2-avatar shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center text-xs font-medium`} aria-hidden>
      {usuario.foto ? <img src={usuario.foto} alt="" className="w-full h-full object-cover" /> : iniciais(usuario.nome)}
    </span>
  );
}

/**
 * Lançador (Ctrl K / ⌘K, botão "+" do celular ou busca do topo).
 */
function Lancador({
  aberto,
  onFechar,
  grupos,
  ativo,
  onNavegar,
  buscar,
}: {
  aberto: boolean;
  onFechar: () => void;
  grupos: GrupoNavAdmin[];
  ativo: string;
  onNavegar: (id: string) => void;
  buscar?: (termo: string) => ResultadoBusca[];
}) {
  const [termo, setTermo] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (!aberto) setTermo("");
  }
  const filtrados = grupos
    .map((g) => ({ ...g, itens: g.itens.filter((i) => casa(termo, i.rotulo, g.rotulo, i.palavras)) }))
    .filter((g) => g.itens.length);
  const resultados = useMemo(() => (buscar && aberto ? buscar(termo) : []), [buscar, aberto, termo]);
  const porTipo = useMemo(() => {
    const m = new Map<TipoResultado, ResultadoBusca[]>();
    for (const r of resultados) m.set(r.tipo, [...(m.get(r.tipo) ?? []), r]);
    return [...m.entries()];
  }, [resultados]);
  const primeiro = filtrados[0]?.itens[0]?.id ?? resultados[0]?.id;
  const nada = filtrados.length === 0 && resultados.length === 0;

  const focaveis = () => Array.from(listaRef.current?.querySelectorAll<HTMLButtonElement>("button[data-lancador]") ?? []);
  const aoTeclarLista = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const b = focaveis();
    const i = b.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) {
      (listaRef.current?.closest("[role=dialog]")?.querySelector("input") as HTMLInputElement | null)?.focus();
      return;
    }
    b[Math.max(0, Math.min(b.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <SheetAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Buscar ou ir para…"
      descricao={buscar ? "Módulos, atalhos, pessoas, consultas e chamados" : "Módulos da administração"}
      familia={false}
    >
      <div className="mb-4">
        <CampoBusca
          autoFocus
          valor={termo}
          onChange={setTermo}
          dica={buscar ? "Módulo, pessoa, CRM, e-mail, chamado…" : "Digite o nome do módulo"}
          rotulo="Buscar módulos, pessoas, consultas ou chamados"
          describedBy="lancador-dica"
          onKeyDown={(e) => {
            if (e.key === "Enter" && primeiro) onNavegar(primeiro);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              focaveis()[0]?.focus();
            }
          }}
        />
        <span id="lancador-dica" className="block text-xs ba-texto-3 mt-1.5 px-1">
          Enter abre o primeiro · ↓ e ↑ andam na lista · Esc fecha
        </span>
      </div>
      <div ref={listaRef} onKeyDown={aoTeclarLista} className="space-y-5">
        {nada ? (
          <p className="text-sm ba-texto-2 text-center py-6" role="status">
            Nada encontrado para “{termo.trim()}”.
          </p>
        ) : null}
        {filtrados.map((g) => (
          <div key={g.rotulo}>
            <div className="ba-rotulo mb-2">{g.rotulo}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ba-animar">
              {g.itens.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  data-lancador=""
                  onClick={() => onNavegar(it.id)}
                  aria-current={ativo === it.id ? "page" : undefined}
                  className={`ba-card bion-toque !p-3 flex flex-col items-center gap-1.5 text-center ${ativo === it.id ? "ring-2 ring-[var(--ba-sinal)]" : ""}`}
                  data-denso="true"
                >
                  <span className="relative inline-flex">
                    <it.icone className="w-5 h-5" aria-hidden />
                    {it.selo ? (
                      <span
                        className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full"
                        data-tom={it.tomSelo ?? "atencao"}
                        style={{ background: "var(--ba-tom)" }}
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="max-w-full text-xs font-medium leading-snug">{it.rotulo}</span>
                  {it.selo ? <span className="sr-only">({it.selo} pendentes)</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        {porTipo.map(([tipo, lista]) => (
          <div key={tipo}>
            <div className="ba-rotulo mb-2">{ROTULO_TIPO[tipo]}</div>
            <ul className="space-y-1.5">
              {lista.map((r) => (
                <li key={r.chave}>
                  <button
                    type="button"
                    data-lancador=""
                    onClick={() => onNavegar(r.id)}
                    className="ba-card bion-toque w-full text-left flex items-center gap-3"
                    data-denso="true"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block leading-snug">{r.rotulo}</span>
                      {r.detalhe ? <span className="text-xs ba-texto-2 block leading-snug">{r.detalhe}</span> : null}
                    </span>
                    <ChevronRight className="w-4 h-4 ba-texto-3 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SheetAdmin>
  );
}
