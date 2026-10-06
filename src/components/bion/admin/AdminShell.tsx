"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Inbox, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { SheetAdmin } from "./ui/SheetAdmin";
import { useDensidadeAdmin, useLargo, usePreferenciaBool } from "./ui/preferencias";
import { useAtalhoBusca } from "./ui/atalho";
import { ROTULO_TIPO, casa, type ResultadoBusca, type TipoResultado } from "./busca";
import type { Tom } from "./rotulos";
import "./admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type ItemNavAdmin = { id: string; rotulo: string; icone: Icone; selo?: number; tomSelo?: Tom; /** Sinônimos para a busca do lançador (ex.: "lgpd cofre"). */ palavras?: string };
export type GrupoNavAdmin = { rotulo: string; itens: ItemNavAdmin[] };
export type Migalha = { rotulo: string; onClick?: () => void };
/** Módulo aberto por cima do Comando (no celular vira tela cheia com "Voltar"). */
export type ModuloAberto = { titulo: string; icone?: Icone; onVoltar: () => void };
/** Id reservado: abre a Fila (painel lateral no desktop, painel da direita no celular). */
export const ID_FILA = "fila";

const PAINEIS = ["Conta", "Comando", "Fila"] as const;

/** Quem está dentro da casca (Fila, Conta) pode fechar as camadas antes de navegar. */
const CamadasCtx = createContext<{ fechar: () => void; abrirFila: () => void }>({ fechar: () => {}, abrirFila: () => {} });
export const useCamadasAdmin = () => useContext(CamadasCtx);
const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];
const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * Casca da Torre BION — ligada ao layout autenticado só para o papel admin
 * (via TorreAdmin). Nunca usa .bp-shell: sem a moldura de 430 px.
 *
 * Celular / tablet estreito (< 1024 px): tela cheia com carrossel nativo
 *   [Conta] ⟷ [Comando = children] ⟷ [Fila], abrindo no centro; pílula
 *   flutuante com os pontos + botão "Ir para…" (lançador). ←/→ no teclado.
 *   Com `modulo`, o celular mostra o módulo em tela cheia com "Voltar".
 * Largo (≥ 1024 px): largura toda — trilho lateral de vidro (72 px, abre
 *   para 240 px), barra de comando com migalhas, busca (Ctrl K; ⌘K no Mac), Fila
 *   e conta (em painel lateral à direita) e o conteúdo ao lado.
 *
 * Só visual/navegação: quem usa decide o que é cada módulo (o admin tem
 * funções próprias — nada aqui copia telas do paciente ou do médico).
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
  /** Substitui o lançador embutido (ex.: futura busca de pessoas e consultas). */
  onBuscar?: () => void;
  acoesBarra?: ReactNode;
  modulo?: ModuloAberto;
  /** Celular: abre já no painel da Fila (ex.: veio de um módulo pelo lançador). */
  abrirNaFila?: boolean;
  /** Busca global do lançador (pessoas, consultas, chamados, atalhos). */
  buscar?: (termo: string) => ResultadoBusca[];
  children: ReactNode;
}) {
  const largo = useLargo();
  const atalho = useAtalhoBusca();
  const irParaPainel = useRef<((i: number) => void) | null>(null);
  const { densidade } = useDensidadeAdmin();
  const [lateral, setLateral] = useState<"conta" | "fila" | null>(null);
  const [lancador, setLancador] = useState(false);

  // Trocou de módulo: fecha painel lateral e lançador (ajuste durante o render, sem efeito).
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
    if (largo) setLateral("fila");
    else if (irParaPainel.current) irParaPainel.current(2);
    else onNavegar(ID_FILA); // celular dentro de um módulo: quem usa leva ao Comando já na Fila
  }, [largo, onNavegar]);
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

  const navegar = (id: string) => {
    setLancador(false);
    if (id === ID_FILA) abrirFila();
    else onNavegar(id);
  };

  const lancadorSheet = (
    <Lancador aberto={lancador} onFechar={() => setLancador(false)} grupos={grupos} ativo={ativo} onNavegar={navegar} buscar={buscar} />
  );

  if (!largo && modulo) {
    return (
      <CamadasCtx.Provider value={camadas}>
        <ModuloCelular modulo={modulo} densidade={densidade} onBuscar={abrirBusca} bloqueado={lancador}>
          {children}
        </ModuloCelular>
        {lancadorSheet}
      </CamadasCtx.Provider>
    );
  }

  if (!largo) {
    return (
      <CamadasCtx.Provider value={camadas}>
        <ShellCelular
          densidade={densidade}
          conta={conta}
          fila={fila}
          filaContagem={filaContagem}
          bloqueado={lancador}
          onBuscar={abrirBusca}
          controleRef={irParaPainel}
          abrirNaFila={abrirNaFila}
        >
          {children}
        </ShellCelular>
        {lancadorSheet}
      </CamadasCtx.Provider>
    );
  }

  return (
    <CamadasCtx.Provider value={camadas}>
    <div className="ba-app ba-ceu" data-densidade={densidade}>
      <a
        href="#ba-conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] ba-botao ba-botao-primario"
      >
        Pular para o conteúdo
      </a>
      <div className="ba-desk">
        <Trilho grupos={grupos} ativo={ativo} onNavegar={navegar} usuario={usuario} onConta={() => setLateral("conta")} />
        <div className="flex flex-col min-w-0 h-full">
          <header className="ba-barra h-16 shrink-0 flex items-center gap-3 px-6">
            <nav aria-label="Você está em" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-sm min-w-0">
                {migalhas.map((m, i) => {
                  const ultima = i === migalhas.length - 1;
                  return (
                    <li key={`${m.rotulo}-${i}`} className="flex items-center gap-1.5 min-w-0">
                      {i > 0 ? <ChevronRight className="w-4 h-4 shrink-0 ba-texto-3" aria-hidden /> : null}
                      {m.onClick && !ultima ? (
                        <button type="button" onClick={m.onClick} className="ba-texto-2 hover:underline truncate font-semibold">
                          {m.rotulo}
                        </button>
                      ) : (
                        <span className={`truncate ${ultima ? "font-bold" : "ba-texto-2 font-semibold"}`} aria-current={ultima ? "page" : undefined}>
                          {m.rotulo}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
            <button
              type="button"
              onClick={abrirBusca}
              className="ba-entrada !w-80 flex items-center gap-2 text-left ba-texto-3"
              aria-label={`Buscar ou ir para (${atalho.falado})`}
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Search className="w-4 h-4" aria-hidden />
              <span className="flex-1">Buscar ou ir para…</span>
              <kbd className="text-[11px] font-bold rounded-md px-1.5 py-0.5 ba-botao-secundario" aria-hidden>
                {atalho.curto}
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setLateral("fila")}
              className="ba-botao ba-botao-secundario"
              aria-label={`Fila de decisões${filaContagem ? ` (${filaContagem})` : ""}`}
            >
              <Inbox className="w-4 h-4" aria-hidden /> Fila
              {filaContagem ? <SeloContagem n={filaContagem} tom="atencao" /> : null}
            </button>
            {acoesBarra}
          </header>
          <main id="ba-conteudo" tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto ba-coluna outline-none">
            {children}
          </main>
        </div>
      </div>
      <SheetAdmin aberto={lateral === "conta"} onFechar={() => setLateral(null)} titulo="Sua conta">
        {conta}
      </SheetAdmin>
      <SheetAdmin aberto={lateral === "fila"} onFechar={() => setLateral(null)} titulo="Fila de decisões" descricao="Tudo o que espera uma decisão sua.">
        {fila}
      </SheetAdmin>
      {lancadorSheet}
    </div>
    </CamadasCtx.Provider>
  );
}

function SeloContagem({ n, tom = "sinal" }: { n: number; tom?: Tom }) {
  return (
    <span className="ba-chip !px-1.5 !py-0 min-w-5 justify-center" data-tom={tom}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Trilho({
  grupos,
  ativo,
  onNavegar,
  usuario,
  onConta,
}: {
  grupos: GrupoNavAdmin[];
  ativo: string;
  onNavegar: (id: string) => void;
  usuario: { nome: string; foto?: string | null };
  onConta: () => void;
}) {
  const [aberto, setAberto] = usePreferenciaBool("bion-admin-trilho", true);
  return (
    <nav className="ba-trilho flex flex-col p-2" data-aberto={aberto} aria-label="Navegação do administrador">
      <div className="flex items-center gap-2 h-12 px-1.5 mb-2">
        {aberto ? (
          <div className="flex-1 min-w-0 pl-1">
            <div className="text-sm font-black leading-none">Torre BION</div>
            <div className="text-[11px] font-bold uppercase tracking-wider ba-texto-3 mt-1">Administração</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-label={aberto ? "Recolher menu" : "Expandir menu"}
          aria-expanded={aberto}
          className="ba-icone-botao shrink-0 !bg-transparent"
        >
          {aberto ? <PanelLeftClose className="w-5 h-5" aria-hidden /> : <PanelLeftOpen className="w-5 h-5" aria-hidden />}
        </button>
      </div>
      <div className="flex-1 space-y-4">
        {grupos.map((g) => (
          <div key={g.rotulo}>
            <div className={aberto ? "ba-rotulo px-3.5 mb-1" : "sr-only"}>{g.rotulo}</div>
            <ul className="space-y-0.5">
              {g.itens.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onNavegar(it.id)}
                    aria-current={ativo === it.id ? "page" : undefined}
                    title={aberto ? undefined : it.rotulo}
                    aria-label={!aberto ? `${it.rotulo}${it.selo ? ` (${it.selo})` : ""}` : undefined}
                    className="ba-trilho-item"
                  >
                    <span className="relative inline-flex shrink-0">
                      <it.icone className="w-5 h-5" aria-hidden />
                      {it.selo && !aberto ? (
                        <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full" data-tom={it.tomSelo ?? "atencao"} style={{ background: "var(--ba-tom)" }} aria-hidden />
                      ) : null}
                    </span>
                    {aberto ? <span className="flex-1 truncate text-left">{it.rotulo}</span> : null}
                    {aberto && it.selo ? <SeloContagem n={it.selo} tom={it.tomSelo ?? "atencao"} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" onClick={onConta} className="ba-trilho-item mt-2" aria-label="Abrir sua conta">
        <Avatar usuario={usuario} tamanho="w-8 h-8" />
        {aberto ? <span className="flex-1 truncate text-left">{usuario.nome}</span> : null}
      </button>
    </nav>
  );
}

function Avatar({ usuario, tamanho = "w-10 h-10" }: { usuario: { nome: string; foto?: string | null }; tamanho?: string }) {
  return (
    <span className={`${tamanho} shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center text-xs font-black ba-botao-secundario`} aria-hidden>
      {usuario.foto ? <img src={usuario.foto} alt="" className="w-full h-full object-cover" /> : iniciais(usuario.nome)}
    </span>
  );
}

function ShellCelular({
  densidade,
  conta,
  fila,
  filaContagem,
  bloqueado,
  onBuscar,
  controleRef,
  abrirNaFila,
  children,
}: {
  densidade: string;
  conta: ReactNode;
  fila: ReactNode;
  filaContagem: number;
  bloqueado: boolean;
  onBuscar: () => void;
  controleRef: React.RefObject<((i: number) => void) | null>;
  abrirNaFila: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(abrirNaFila ? 2 : 1);
  const inicial = useRef(abrirNaFila ? 2 : 1);

  const irPara = useCallback((i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    controleRef.current = irPara;
    return () => {
      controleRef.current = null;
    };
  }, [controleRef, irPara]);

  // Abre no centro (Comando), como os apps do paciente e do médico (ou na Fila, se pedido).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pos = () => el.scrollTo({ left: inicial.current * el.clientWidth, behavior: "instant" as ScrollBehavior });
    pos();
    const raf = requestAnimationFrame(pos);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (bloqueado || e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (EM_CAMPO.includes(alvo.tagName) || alvo.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowRight") irPara(Math.min(2, painel + 1));
      else if (e.key === "ArrowLeft") irPara(Math.max(0, painel - 1));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [bloqueado, painel, irPara]);

  const aoRolar = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== painel) setPainel(i);
  };

  const regioes = useMemo(
    () => [
      { rotulo: "Sua conta", conteudo: conta, cls: "ba-painel" },
      { rotulo: "Comando", conteudo: children, cls: "" },
      { rotulo: "Fila de decisões", conteudo: fila, cls: "ba-painel" },
    ],
    [conta, children, fila],
  );

  return (
    <div className="ba-app ba-ceu" data-densidade={densidade}>
      <div ref={ref} onScroll={aoRolar} className="ba-carrossel" aria-label="Áreas do painel (deslize para os lados)" inert={bloqueado}>
        {regioes.map((r, i) => (
          <div key={r.rotulo} role="region" aria-label={r.rotulo} className={`ba-coluna ${r.cls}`} id={i === 1 ? "ba-conteudo" : undefined}>
            {r.conteudo}
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {PAINEIS[painel]}
      </span>
      {!bloqueado ? (
        <nav className="ba-pilula" aria-label="Áreas do painel">
          {PAINEIS.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => irPara(i)}
              aria-label={`Ir para ${p}${i === 2 && filaContagem ? ` (${filaContagem} pendentes)` : ""}`}
              aria-current={painel === i ? "page" : undefined}
              className="ba-pilula-alvo relative"
            >
              <span className="ba-pilula-ponto" data-ativo={painel === i} />
              {i === 2 && filaContagem ? (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-300" aria-hidden />
              ) : null}
            </button>
          ))}
          <span className="w-px h-5 bg-white/25 mx-1" aria-hidden />
          <button type="button" onClick={onBuscar} aria-label="Ir para… (busca e módulos)" className="ba-pilula-alvo">
            <Search className="w-4 h-4 text-sky-300" aria-hidden />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/** Celular: módulo em tela cheia por cima do Comando, com "Voltar" e "Ir para…". */
function ModuloCelular({
  modulo,
  densidade,
  onBuscar,
  bloqueado,
  children,
}: {
  modulo: ModuloAberto;
  densidade: string;
  onBuscar: () => void;
  bloqueado: boolean;
  children: ReactNode;
}) {
  const Icone = modulo.icone;
  return (
    <div className="ba-app ba-ceu" data-densidade={densidade}>
      <div className="ba-coluna h-full flex flex-col" inert={bloqueado}>
        <header className="ba-barra sticky top-0 z-20 flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <button type="button" onClick={modulo.onVoltar} className="ba-icone-botao shrink-0" aria-label="Voltar ao Comando">
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          {Icone ? <Icone className="w-5 h-5 shrink-0 ba-texto-2" aria-hidden /> : null}
          <h1 className="flex-1 min-w-0 text-base font-black truncate">{modulo.titulo}</h1>
          <button type="button" onClick={onBuscar} className="ba-icone-botao shrink-0" aria-label="Ir para… (busca e módulos)">
            <Search className="w-5 h-5" aria-hidden />
          </button>
        </header>
        <main id="ba-conteudo" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Lançador (Ctrl K / ⌘K, pílula ou barra): módulos (nome e palavras-chave)
 * e, com `buscar`, atalhos, pessoas, consultas e chamados. Sem acento.
 * Enter abre o primeiro resultado; ↓ sai do campo para a lista e ↑/↓
 * andam entre os resultados; Esc fecha.
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
    <SheetAdmin aberto={aberto} onFechar={onFechar} titulo="Buscar ou ir para…" descricao={buscar ? "Módulos, atalhos, pessoas, consultas e chamados" : "Módulos da administração"}>
      <label className="block mb-4">
        <span className="sr-only">Buscar módulos, pessoas, consultas ou chamados</span>
        <input
          autoFocus
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && primeiro) onNavegar(primeiro);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              focaveis()[0]?.focus();
            }
          }}
          placeholder={buscar ? "Módulo, pessoa, CRM, e-mail, chamado…" : "Digite o nome do módulo"}
          className="ba-entrada"
          aria-describedby="lancador-dica"
        />
        <span id="lancador-dica" className="block text-xs ba-texto-3 mt-1.5 px-1">
          Enter abre o primeiro · ↓ e ↑ andam na lista · Esc fecha
        </span>
      </label>
      <div ref={listaRef} onKeyDown={aoTeclarLista} className="space-y-5">
        {nada ? (
          <p className="text-sm ba-texto-2 text-center py-6" role="status">
            Nada encontrado para “{termo.trim()}”.
          </p>
        ) : null}
        {filtrados.map((g) => (
          <div key={g.rotulo}>
            <div className="ba-rotulo mb-2">{g.rotulo}</div>
            <div className="grid grid-cols-3 gap-2">
              {g.itens.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  data-lancador=""
                  onClick={() => onNavegar(it.id)}
                  aria-current={ativo === it.id ? "page" : undefined}
                  className={`ba-card !p-3 flex flex-col items-center gap-1.5 text-center ${ativo === it.id ? "ring-2 ring-[var(--ba-sinal)]" : ""}`}
                  data-denso="true"
                >
                  <span className="relative inline-flex">
                    <it.icone className="w-5 h-5" aria-hidden />
                    {it.selo ? (
                      <span className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full" data-tom={it.tomSelo ?? "atencao"} style={{ background: "var(--ba-tom)" }} aria-hidden />
                    ) : null}
                  </span>
                  <span className="text-xs font-bold leading-tight">{it.rotulo}</span>
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
                  <button type="button" data-lancador="" onClick={() => onNavegar(r.id)} className="ba-card w-full text-left flex items-center gap-3" data-denso="true">
                    <span className="flex-1 min-w-0">
                      <span className="font-bold block truncate">{r.rotulo}</span>
                      {r.detalhe ? <span className="text-xs ba-texto-2 block truncate">{r.detalhe}</span> : null}
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
