"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  Search,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { MESES_AGENDA } from "./constantes";
import { GraficoLinha, type PontoGrafico } from "./GraficoLinha";
import { DetalheMedicao, type Detalhe } from "./DetalheMedicao";
import { ChatBion } from "./ChatBion";
import { PerfilPainel } from "./PerfilPainel";
import { DocumentosPainel } from "./DocumentosPainel";

/**
 * App imersivo do paciente — fullscreen, sem menu e sem botões de navegação.
 *
 *   ┌─────────┬───────────────────────┬───────────┐
 *   │ Perfil  │  Seção 1 (início)     │  Página 4 │
 *   │  (←)    │  Seção 2 (rolagem ↓)  │  (→)      │
 *   │         │  Seção 3 (rolagem ↓)  │           │
 *   └─────────┴───────────────────────┴───────────┘
 *
 * Gestos: arrastar para a DIREITA abre o Perfil; para a ESQUERDA volta ao
 * centro e, arrastando de novo, abre Documentos/Mensagens.
 */

const rotuloCurto = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function PacienteApp() {
  const router = useRouter();
  const { sessao, pacientePerfil, consultas, lembretes, medicoes, exames, sair } = useBion();

  const carrosselRef = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(1);
  const [detalhe, setDetalhe] = useState<Detalhe>(null);
  const [chatAberto, setChatAberto] = useState(false);
  const arrastandoRef = useRef(false);
  const inicioArrasteX = useRef(0);
  const inicioArrasteScroll = useRef(0);
  const moveuArrasteRef = useRef(false);

  const irPara = useCallback((p: number) => {
    const el = carrosselRef.current;
    if (el) el.scrollTo({ left: p * el.clientWidth, behavior: "smooth" });
  }, []);

  // A página inicial é a SEÇÃO 1 (painel central): posiciona o carrossel já na montagem
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const posicionar = () => el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
    posicionar();
    const raf = requestAnimationFrame(posicionar);
    return () => cancelAnimationFrame(raf);
  }, []);

  const aoRolar = () => {
    const el = carrosselRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== painel) setPainel(idx);
  };

  // Teclado (desktop): setas navegam entre os painéis quando não há foco em texto
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (detalhe || chatAberto) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      if (e.key === "ArrowRight") irPara(Math.min(2, painel + 1));
      if (e.key === "ArrowLeft") irPara(Math.max(0, painel - 1));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [painel, detalhe, chatAberto, irPara]);

  /* ------------------------------- dados --------------------------------- */

  const proxima = useMemo(() => {
    const limite = Date.now() - 2 * 3_600_000;
    return consultas
      .filter((c) => c.paciente === sessao.nome && ["confirmada", "em_espera"].includes(c.status) && c.ts >= limite)
      .sort((a, b) => a.ts - b.ts)[0];
  }, [consultas, sessao.nome]);

  const salaAberta = proxima ? Date.now() >= proxima.ts - 30 * 60_000 && Date.now() <= proxima.ts + 2 * 3_600_000 : false;

  const lembretesPendentes = lembretes.filter((l) => !l.feito);

  const alturas = useMemo(
    () => medicoes.filter((m) => m.tipo === "altura").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const pesos = useMemo(
    () => medicoes.filter((m) => m.tipo === "peso").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const pas = useMemo(
    () => medicoes.filter((m) => m.tipo === "pa").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );

  const alturaAtual =
    alturas.at(-1)?.valor1 ?? Number((pacientePerfil?.altura ?? "").replace(",", ".")) ?? undefined;
  const pesoAtual = pesos.at(-1)?.valor1 ?? Number((pacientePerfil?.peso ?? "").replace(",", ".")) ?? undefined;
  const imcAtual = pesoAtual && alturaAtual ? pesoAtual / Math.pow(alturaAtual / 100, 2) : null;

  const serieImc: PontoGrafico[] = useMemo(
    () =>
      pesos
        .map((p) => {
          const alturaCm = alturas.filter((a) => a.criadoEm <= p.criadoEm).at(-1)?.valor1 ?? alturaAtual;
          if (!alturaCm) return null;
          return { valor: Math.round((p.valor1 / Math.pow(alturaCm / 100, 2)) * 10) / 10, rotulo: rotuloCurto(p.criadoEm) };
        })
        .filter((x): x is PontoGrafico => x !== null)
        .slice(-10),
    [pesos, alturas, alturaAtual],
  );

  const examesAgrupados = useMemo(() => {
    const mapa = new Map<string, typeof exames>();
    for (const e of exames) {
      const lista = mapa.get(e.titulo) ?? [];
      lista.push(e);
      mapa.set(e.titulo, lista);
    }
    return [...mapa.entries()];
  }, [exames]);

  const saudacao = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const iniciais =
    sessao.nome
      .split(" ")
      .filter((p) => p.length > 1)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  /* -------------------------- arraste com mouse -------------------------- */

  const aoBaixarPonteiro = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = carrosselRef.current;
    if (!el) return;
    arrastandoRef.current = true;
    moveuArrasteRef.current = false;
    inicioArrasteX.current = e.clientX;
    inicioArrasteScroll.current = el.scrollLeft;
  };
  const aoMoverPonteiro = (e: React.PointerEvent) => {
    if (!arrastandoRef.current) return;
    const el = carrosselRef.current;
    if (!el) return;
    const dx = e.clientX - inicioArrasteX.current;
    if (Math.abs(dx) > 6) moveuArrasteRef.current = true;
    el.scrollLeft = inicioArrasteScroll.current - dx;
  };
  const aoSoltarPonteiro = () => {
    if (!arrastandoRef.current) return;
    arrastandoRef.current = false;
    const el = carrosselRef.current;
    if (el && moveuArrasteRef.current) {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    }
  };

  return (
    <div className="bp-shell text-[#0a1f44] dark:text-[#f2f6fc]">
      <div
        ref={carrosselRef}
        onScroll={aoRolar}
        onPointerDown={aoBaixarPonteiro}
        onPointerMove={aoMoverPonteiro}
        onPointerUp={aoSoltarPonteiro}
        onPointerLeave={aoSoltarPonteiro}
        onClickCapture={(e) => {
          if (moveuArrasteRef.current) {
            e.preventDefault();
            e.stopPropagation();
            moveuArrasteRef.current = false;
          }
        }}
        className="bp-carrossel flex h-full overflow-x-auto"
        aria-label="Painéis do app: perfil, início e documentos (arraste para os lados)"
      >
        {/* ============================== PERFIL ============================== */}
        <div className="w-full h-full shrink-0 bp-painel overflow-y-auto bp-coluna" aria-label="Perfil">
          <PerfilPainel
            onSair={async () => {
              await sair();
              router.replace("/entrar");
            }}
          />
        </div>

        {/* ============================= PRINCIPAL ============================ */}
        <div className="w-full h-full shrink-0 overflow-y-auto bp-coluna" aria-label="Início, saúde e exames">
          {/* --- Seção 1: início --- */}
          <section className="bp-secao-1 min-h-[100svh] flex flex-col px-5 bp-safe-top pb-8" aria-label="Página inicial">
            <header className="flex items-center justify-between pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#0a1f44]/45 dark:text-white/40">
                {hoje}
              </div>
              <button
                onClick={() => irPara(0)}
                aria-label="Abrir perfil"
                className="w-12 h-12 rounded-full overflow-hidden bp-glass shrink-0"
              >
                {pacientePerfil?.foto ? (
                   
                  <img src={pacientePerfil.foto} alt="Seu perfil" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full inline-flex items-center justify-center text-sm font-black text-[#0a1f44] dark:text-[#f2f6fc]">
                    {iniciais}
                  </span>
                )}
              </button>
            </header>

            <div className="mt-8 mb-6">
              <h1 className="text-3xl font-black leading-tight">
                {saudacao}, {sessao.nome.split(" ")[0]}
              </h1>
              <p className="text-sm text-[#0a1f44]/55 dark:text-white/50 mt-1">
                Como você está se sentindo hoje?
              </p>
            </div>

            {/* Card: próxima consulta */}
            {proxima ? (
              <button
                onClick={() => salaAberta && router.push("/sala-espera")}
                className="bp-glass p-5 text-left w-full transition hover:shadow-xl"
                aria-label={`Próxima consulta: ${proxima.especialidade} com ${proxima.medico}, ${proxima.data} às ${proxima.hora}${salaAberta ? ". Tocar para entrar na sala de espera" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0a1f44]/50 dark:text-white/50">
                    Próxima consulta
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${salaAberta ? "bg-emerald-600 text-white" : "bg-[#0a1f44]/8 dark:bg-white/10"}`}>
                    {salaAberta ? "Sala aberta" : "Confirmada"}
                  </span>
                </div>
                <div className="text-xl font-bold">{proxima.especialidade}</div>
                <div className="text-sm opacity-70">com {proxima.medico}</div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <CalendarClock className="w-4 h-4" /> {proxima.data} · {proxima.hora}
                  </span>
                  {salaAberta ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <Video className="w-4 h-4" /> Entrar na sala
                    </span>
                  ) : (
                    <span className="text-xs opacity-50">A sala abre 30 min antes</span>
                  )}
                </div>
              </button>
            ) : (
              <button onClick={() => setChatAberto(true)} className="bp-glass p-5 text-left w-full transition hover:shadow-xl">
                <div className="text-xs font-bold uppercase tracking-wider text-[#0a1f44]/50 dark:text-white/50 mb-3">
                  Consultas
                </div>
                <div className="text-xl font-bold">Nenhuma consulta agendada</div>
                <div className="text-sm opacity-70 mt-1 inline-flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Toque para agendar com a BION IA
                </div>
              </button>
            )}

            {/* Card: barra de pesquisa da BION IA */}
            <button
              onClick={() => setChatAberto(true)}
              className="bp-glass mt-4 w-full flex items-center gap-3 px-5 py-4 text-left transition hover:shadow-xl"
              aria-label="Perguntar à BION IA"
            >
              <Search className="w-5 h-5 text-[#0a1f44]/50 dark:text-white/50 shrink-0" />
              <span className="flex-1 text-sm text-[#0a1f44]/50 dark:text-white/50">
                Pergunte algo à BION IA…
              </span>
              <span className="bp-acao w-10 h-10 inline-flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
            </button>

            <div className="mt-auto pt-10 flex flex-col items-center gap-1 text-[#0a1f44]/40 dark:text-white/35">
              <span className="text-[11px] font-semibold">Saúde e exames abaixo</span>
              <ChevronDown className="w-5 h-5 animate-bounce" />
            </div>
          </section>

          {/* --- Seção 2: saúde --- */}
          <section className="bp-secao-2 px-5 py-8" aria-label="Saúde: lembretes, IMC e pressão arterial">
            <h2 className="text-2xl font-black mb-1">Sua saúde</h2>
            <p className="text-sm text-[#0a1f44]/60 dark:text-white/50 mb-5">
              Toque em um card para ver o histórico e atualizar.
            </p>

            <div className="space-y-4">
              {/* Lembretes */}
              <button
                onClick={() => setDetalhe("lembretes")}
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Lembretes de medicação: ${lembretesPendentes.length} pendente(s) de ${lembretes.length}. Abrir detalhes`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Pill className="w-4 h-4" /> Lembretes de medicação
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#0a1f44]/8 dark:bg-white/10">
                    {lembretesPendentes.length ? `${lembretesPendentes.length} hoje` : "Em dia"}
                  </span>
                </div>
                {lembretes.length ? (
                  <ul className="space-y-1.5">
                    {lembretes
                      .filter((l) => !l.feito)
                      .slice(0, 3)
                      .map((l) => (
                        <li key={l.id} className="flex items-center justify-between text-sm">
                          <span className="truncate">{l.titulo}</span>
                          <span className="opacity-60 shrink-0 ml-2">{l.horario}</span>
                        </li>
                      ))}
                    {lembretesPendentes.length === 0 && (
                      <li className="text-sm opacity-60">Todos os lembretes de hoje concluídos.</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm opacity-60">Nenhum lembrete — toque para criar o primeiro.</p>
                )}
              </button>

              {/* IMC */}
              <button
                onClick={() => setDetalhe("imc")}
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Índice de massa corporal: ${imcAtual ? imcAtual.toFixed(1) : "sem dados"}. Abrir histórico e atualizar peso e altura`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Activity className="w-4 h-4" /> Gráfico de IMC
                  </span>
                  {imcAtual && (
                    <span className="text-2xl font-black">{imcAtual.toFixed(1)}</span>
                  )}
                </div>
                {serieImc.length > 1 ? (
                  <GraficoLinha
                    ariaLabel="Evolução do IMC"
                    altura={110}
                    series={[{ pontos: serieImc, cor: "#123e7d", area: true }]}
                    refMin={18.5}
                    refMax={24.9}
                  />
                ) : (
                  <p className="text-sm opacity-60 py-4">
                    {pesos.length === 0
                      ? "Registre peso e altura para acompanhar seu IMC."
                      : "Mais um registro e o gráfico aparece."}
                  </p>
                )}
                {imcAtual && (
                  <span className="text-xs font-semibold inline-flex items-center gap-1 opacity-60">
                    <TrendingUp className="w-3.5 h-3.5" /> Toque para atualizar peso e altura
                  </span>
                )}
              </button>

              {/* Pressão arterial */}
              <button
                onClick={() => setDetalhe("pa")}
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Pressão arterial: ${pas.at(-1) ? `${pas.at(-1)!.valor1}/${pas.at(-1)!.valor2 ?? "—"}` : "sem dados"}. Abrir histórico e registrar`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <HeartPulse className="w-4 h-4" /> Pressão arterial
                  </span>
                  {pas.at(-1) && (
                    <span className="text-2xl font-black">
                      {pas.at(-1)!.valor1}
                      <span className="text-base opacity-50">/{pas.at(-1)!.valor2 ?? "—"}</span>
                    </span>
                  )}
                </div>
                {pas.length > 1 ? (
                  <GraficoLinha
                    ariaLabel="Evolução da pressão arterial"
                    altura={110}
                    series={[
                      { pontos: pas.map((p) => ({ valor: p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "#123e7d", area: true },
                      ...(pas.some((p) => p.valor2 !== undefined)
                        ? [{ pontos: pas.map((p) => ({ valor: p.valor2 ?? p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "#c2410c" }]
                        : []),
                    ]}
                    refMin={70}
                    refMax={120}
                  />
                ) : (
                  <p className="text-sm opacity-60 py-4">
                    {pas.length === 0 ? "Registre sua primeira medição." : "Mais um registro e o gráfico aparece."}
                  </p>
                )}
              </button>
            </div>
          </section>

          {/* --- Seção 3: exames laboratoriais --- */}
          <section className="bp-secao-3 px-5 py-10 text-white" aria-label="Resultados de exames laboratoriais">
            <h2 className="text-2xl font-black mb-1">Exames laboratoriais</h2>
            <p className="text-sm text-white/65 mb-6">
              Resultados importados automaticamente dos laudos que você envia à BION IA.
            </p>

            <button
              onClick={() => setChatAberto(true)}
              className="bp-glass-marinho w-full p-4 flex items-center gap-3 text-left mb-5 transition hover:shadow-xl"
              aria-label="Enviar novo laudo à BION IA"
            >
              <span className="w-11 h-11 rounded-2xl bg-white/15 inline-flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">Enviar novo laudo</span>
                <span className="block text-xs text-white/60">PDF ou foto — a IA confere seu nome no documento</span>
              </span>
              <FileText className="w-5 h-5 text-white/50 shrink-0" />
            </button>

            {examesAgrupados.length === 0 ? (
              <div className="bp-glass-marinho p-6 text-center">
                <p className="text-sm text-white/70">
                  Nenhum resultado ainda. Envie um laudo pela BION IA e os resultados aparecem aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {examesAgrupados.map(([titulo, lista]) => {
                  const ultimo = lista.at(-1)!;
                  const itemDestaque = ultimo.itens[0];
                  const serieItem: PontoGrafico[] = lista
                    .map((e) => {
                      const it = e.itens[0];
                      return it ? { valor: it.valor, rotulo: rotuloCurto(e.dataColeta) } : null;
                    })
                    .filter((x): x is PontoGrafico => x !== null)
                    .slice(-10);
                  return (
                    <div key={titulo} className="bp-glass-marinho p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-sm">{titulo}</div>
                          <div className="text-xs text-white/55">Última coleta: {rotuloCurto(ultimo.dataColeta)}</div>
                        </div>
                        {itemDestaque && (
                          <div className="text-right">
                            <div className="text-xl font-black leading-none">
                              {itemDestaque.valor}
                              <span className="text-xs font-semibold opacity-60 ml-1">{itemDestaque.unidade}</span>
                            </div>
                            <div className="text-[11px] text-white/55 mt-0.5">{itemDestaque.nome}</div>
                          </div>
                        )}
                      </div>
                      {serieItem.length > 1 && (
                        <GraficoLinha
                          ariaLabel={`Histórico gráfico de ${titulo}`}
                          altura={104}
                          corEixo="rgba(255,255,255,0.4)"
                          series={[{ pontos: serieItem, cor: "#9ac1f4", area: true }]}
                          refMin={itemDestaque?.refMin}
                          refMax={itemDestaque?.refMax}
                        />
                      )}
                      <details className="mt-2 group">
                        <summary className="text-xs font-semibold text-white/60 cursor-pointer list-none inline-flex items-center gap-1">
                          <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition" />
                          {ultimo.itens.length} resultado(s) da última coleta
                        </summary>
                        <ul className="mt-3 space-y-1.5">
                          {ultimo.itens.map((i) => {
                            const fora =
                              (i.refMin !== undefined && i.valor < i.refMin) ||
                              (i.refMax !== undefined && i.valor > i.refMax);
                            return (
                              <li key={i.nome} className="flex items-center justify-between text-sm">
                                <span className="text-white/75">{i.nome}</span>
                                <span className={`font-semibold ${fora ? "text-amber-300" : "text-white"}`}>
                                  {i.valor} {i.unidade}
                                  {fora && " ⚠"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ====================== PÁGINA 4: DOCUMENTOS ======================== */}
        <div className="w-full h-full shrink-0 bp-painel overflow-y-auto bp-coluna" aria-label="Documentos e mensagens">
          <DocumentosPainel />
        </div>
      </div>

      {/* Indicador de painéis (também navegação acessível) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bp-glass px-3 py-2">
        {[
          { idx: 0, rotulo: "Perfil" },
          { idx: 1, rotulo: "Início" },
          { idx: 2, rotulo: "Documentos" },
        ].map(({ idx, rotulo }) => (
          <button
            key={idx}
            onClick={() => irPara(idx)}
            aria-label={`Ir para ${rotulo}`}
            aria-current={painel === idx ? "page" : undefined}
            className={`h-2 rounded-full transition-all ${painel === idx ? "w-6 bg-[#123e7d] dark:bg-sky-300" : "w-2 bg-[#0a1f44]/25 dark:bg-white/30"}`}
          />
        ))}
        {painel !== 1 && (
          <button
            onClick={() => irPara(1)}
            aria-label="Voltar ao início"
            className="pl-1 text-[#0a1f44]/60 dark:text-white/60"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {painel !== 1 && (
          <span className="sr-only">Use as setas do teclado para navegar</span>
        )}
        {painel === 1 && <ChevronRight className="w-4 h-4 text-[#0a1f44]/30 dark:text-white/30" />}
      </div>

      {/* Overlays */}
      <DetalheMedicao detalhe={detalhe} onFechar={() => setDetalhe(null)} />
      <ChatBion aberto={chatAberto} onFechar={() => setChatAberto(false)} />
    </div>
  );
}
