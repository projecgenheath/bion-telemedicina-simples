"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight, Command, Inbox, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { SheetAdmin } from "./ui/SheetAdmin";
import { useDensidadeAdmin, useLargo, usePreferenciaBool } from "./ui/preferencias";
import type { Tom } from "./rotulos";
import "./admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type ItemNavAdmin = { id: string; rotulo: string; icone: Icone; selo?: number; tomSelo?: Tom };
export type GrupoNavAdmin = { rotulo: string; itens: ItemNavAdmin[] };
export type Migalha = { rotulo: string; onClick?: () => void };

const PAINEIS = ["Conta", "Comando", "Fila"] as const;
const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];
const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * Casca da Torre BION (PR 1: componente pronto, AINDA NÃO ligado às rotas).
 *
 * Celular / tablet estreito (< 1024 px): tela cheia com carrossel nativo
 *   [Conta] ⟷ [Comando = children] ⟷ [Fila], abrindo no centro; pílula
 *   flutuante com os pontos + botão "Ir para…" (lançador). ←/→ no teclado.
 * Largo (≥ 1024 px): largura toda — trilho lateral de vidro (72 px, abre
 *   para 240 px), barra de comando com migalhas, busca (⌘K / Ctrl K), Fila
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
  /** Substitui o lançador simples embutido (ex.: paleta cmdk no PR 2). */
  onBuscar?: () => void;
  acoesBarra?: ReactNode;
  children: ReactNode;
}) {
  const largo = useLargo();
  const { densidade } = useDensidadeAdmin();
  const [lateral, setLateral] = useState<"conta" | "fila" | null>(null);
  const [lancador, setLancador] = useState(false);

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
    onNavegar(id);
  };

  const lancadorSheet = (
    <Lancador aberto={lancador} onFechar={() => setLancador(false)} grupos={grupos} ativo={ativo} onNavegar={navegar} />
  );

  if (!largo) {
    return (
      <>
        <ShellCelular
          densidade={densidade}
          conta={conta}
          fila={fila}
          filaContagem={filaContagem}
          bloqueado={lancador}
          onBuscar={abrirBusca}
        >
          {children}
        </ShellCelular>
        {lancadorSheet}
      </>
    );
  }

  return (
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
              aria-label="Buscar ou ir para (Ctrl K)"
            >
              <Search className="w-4 h-4" aria-hidden />
              <span className="flex-1">Buscar ou ir para…</span>
              <kbd className="text-[11px] font-bold rounded-md px-1.5 py-0.5 ba-botao-secundario">⌘K</kbd>
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
  children,
}: {
  densidade: string;
  conta: ReactNode;
  fila: ReactNode;
  filaContagem: number;
  bloqueado: boolean;
  onBuscar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(1);

  const irPara = useCallback((i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  // Abre no centro (Comando), como os apps do paciente e do médico.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pos = () => el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
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
            <Command className="w-4 h-4 text-sky-300" aria-hidden />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/** Lançador simples (grade dos módulos + filtro). O PR 2 pode trocar por cmdk. */
function Lancador({
  aberto,
  onFechar,
  grupos,
  ativo,
  onNavegar,
}: {
  aberto: boolean;
  onFechar: () => void;
  grupos: GrupoNavAdmin[];
  ativo: string;
  onNavegar: (id: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (!aberto) setTermo("");
  }
  const t = termo.trim().toLowerCase();
  const filtrados = grupos
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !t || i.rotulo.toLowerCase().includes(t) || g.rotulo.toLowerCase().includes(t)) }))
    .filter((g) => g.itens.length);
  return (
    <SheetAdmin aberto={aberto} onFechar={onFechar} titulo="Ir para…" descricao="Módulos da administração">
      <label className="block mb-4">
        <span className="sr-only">Filtrar módulos</span>
        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtrados[0]?.itens[0]) onNavegar(filtrados[0].itens[0].id);
          }}
          placeholder="Digite o nome do módulo"
          className="ba-entrada"
        />
      </label>
      {filtrados.length === 0 ? <p className="text-sm ba-texto-2 text-center py-6">Nenhum módulo com esse nome.</p> : null}
      <div className="space-y-5">
        {filtrados.map((g) => (
          <div key={g.rotulo}>
            <div className="ba-rotulo mb-2">{g.rotulo}</div>
            <div className="grid grid-cols-3 gap-2">
              {g.itens.map((it) => (
                <button
                  key={it.id}
                  type="button"
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
      </div>
    </SheetAdmin>
  );
}
