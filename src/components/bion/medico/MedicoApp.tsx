"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";
import { Ajuda } from "@/components/bion/Ajuda";
import { useDadosMedico } from "./useDadosMedico";
import { useConfirmarSalvamento } from "./sheets/useConfirmarSalvamento";
import { TelaInicio } from "./telas/TelaInicio";
import { TelaGestao } from "./telas/TelaGestao";
import { TelaPerfilPublico } from "./telas/TelaPerfilPublico";
import { PerfilMedicoPainel } from "./PerfilMedicoPainel";
import { PacientesPainel } from "./PacientesPainel";
import { ConversaPaciente } from "./ConversaPaciente";
import { TelaSobreposta } from "./TelaSobreposta";
import { RenovacoesPendentes } from "./evolucao/RenovacoesPendentes";
import { DicaGestos, IndicadorTelas, useDicaGestos } from "./IndicadorTelas";
import { PrecoSheet } from "./sheets/PrecoSheet";
import { PromocoesSheet } from "./sheets/PromocoesSheet";
import { AgendaSheet } from "./sheets/AgendaSheet";
import { AgendaPreviewSheet } from "./sheets/AgendaPreviewSheet";
import type { PacienteDoMedico } from "./metricas";
import "./medico.css";

type Sheet = "preco" | "agenda" | "preview" | "promocoes" | null;
type Sobreposicao = { tipo: "renovacoes" } | { tipo: "suporte" } | { tipo: "termos" } | { tipo: "paciente"; p: PacienteDoMedico } | null;

const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];
/** Mesmo corte do medico.css: a partir daqui as 3 colunas ficam lado a lado. */
const TELA_LARGA = "(min-width: 1024px)";
const FOCAVEL = 'input, button, a[href], select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * App do MÉDICO (fase 1 — só front-end, dados existentes).
 * Carrossel horizontal: [Perfil] ← [Coluna central] → [Pacientes].
 * Coluna central com snap vertical: Início → Gestão → Perfil público.
 * Tela larga (≥ 1024 px, ver medico.css): as três colunas ficam lado a lado,
 * sem carrossel; a coluna central rola livre pelas três telas.
 */
export function MedicoApp() {
  const dados = useDadosMedico();
  const { medico, minhas } = dados;
  const carrosselRef = useRef<HTMLDivElement>(null);
  const colunaRef = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(1);
  const [secao, setSecao] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [aberturas, setAberturas] = useState(0);
  const [sobreposicao, setSobreposicao] = useState<Sobreposicao>(null);
  const dica = useDicaGestos();

  // Confirmações vivem aqui (sempre montado), não nos sheets que desmontam.
  const confirmarValor = useConfirmarSalvamento(medico?.valor ?? 0, (a, b) => Math.abs(a - b) < 0.005);
  const confirmarHorarios = useConfirmarSalvamento(medico?.horariosDisponiveis.join(",") ?? "", (a, b) => a === b);
  const confirmarBio = useConfirmarSalvamento(medico?.bio ?? "", (a, b) => a === b);

  const bloqueado = sheet !== null || sobreposicao !== null;

  const irPara = useCallback((p: number) => {
    const el = carrosselRef.current;
    if (!el) return;
    // Tela larga: as colunas já estão todas visíveis — só leva o foco ao
    // primeiro controle da coluna (ex.: a busca de pacientes).
    if (window.matchMedia(TELA_LARGA).matches) {
      el.children[p]?.querySelector<HTMLElement>(FOCAVEL)?.focus();
      return;
    }
    el.scrollTo({ left: p * el.clientWidth, behavior: "smooth" });
  }, []);

  const irSecao = useCallback((i: number) => {
    const col = colunaRef.current;
    const alvo = col?.children[i] as HTMLElement | undefined;
    if (col && alvo) col.scrollTo({ top: alvo.offsetTop, behavior: "smooth" });
  }, []);

  // Começa no painel central (Início), como o app do paciente.
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const posicionar = () => el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
    posicionar();
    const raf = requestAnimationFrame(posicionar);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Ao cruzar 1024 px (girar o tablet, redimensionar a janela) volta ao
  // painel central: no celular o carrossel reaparece no Início, e na tela
  // larga os pontos das seções (que dependem do painel 1) continuam valendo.
  useEffect(() => {
    const mq = window.matchMedia(TELA_LARGA);
    const aoMudar = () => {
      setPainel(1);
      const el = carrosselRef.current;
      if (el && !mq.matches) el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
    };
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  const aoRolarCarrossel = () => {
    const el = carrosselRef.current;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== painel) {
      setPainel(idx);
      dica.dispensar();
    }
  };

  const aoRolarColuna = () => {
    const col = colunaRef.current;
    if (!col) return;
    const meio = col.scrollTop + col.clientHeight / 2;
    let idx = 0;
    Array.from(col.children).forEach((c, i) => {
      if ((c as HTMLElement).offsetTop <= meio) idx = i;
    });
    if (idx !== secao) {
      setSecao(idx);
      dica.dispensar();
    }
  };

  // Teclado: ←/→ trocam de página; PageUp/PageDown (e ↑/↓ fora de campos
  // roláveis) trocam de seção. Nada disso com sheet/sobreposição aberta.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (bloqueado || e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (EM_CAMPO.includes(alvo.tagName) || alvo.isContentEditable)) return;
      if (e.key === "ArrowRight") irPara(Math.min(2, painel + 1));
      else if (e.key === "ArrowLeft") irPara(Math.max(0, painel - 1));
      else if (painel === 1) {
        const foraDaColuna = !alvo || !colunaRef.current?.contains(alvo);
        const desce = e.key === "PageDown" || (foraDaColuna && e.key === "ArrowDown");
        const sobe = e.key === "PageUp" || (foraDaColuna && e.key === "ArrowUp");
        if (desce || sobe) {
          e.preventDefault();
          irSecao(desce ? Math.min(2, secao + 1) : Math.max(0, secao - 1));
        }
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [bloqueado, painel, secao, irPara, irSecao]);

  const abrirSheet = (s: Exclude<Sheet, null>) => {
    setAberturas((n) => n + 1);
    setSheet(s);
  };
  const fecharSheet = () => setSheet(null);
  const fecharSobreposicao = useCallback(() => setSobreposicao(null), []);

  const painelCls = "flex-[0_0_100%] w-full min-w-full h-full";

  return (
    <div className="bp-shell bm-app flex flex-col text-bion-ink dark:text-bion-paper">
      <div
        ref={carrosselRef}
        onScroll={aoRolarCarrossel}
        inert={bloqueado}
        className={`bp-carrossel bm-carrossel flex flex-1 min-h-0 overflow-x-auto ${bloqueado ? "pointer-events-none" : ""}`}
        aria-label="Áreas do app do médico"
      >
        <div className={`${painelCls} bm-lateral-esq`} aria-label="Meu perfil" role="region">
          <PerfilMedicoPainel
            dados={dados}
            onAbrirSuporte={() => setSobreposicao({ tipo: "suporte" })}
            onAbrirTermos={() => setSobreposicao({ tipo: "termos" })}
            onAbrirRenovacoes={() => setSobreposicao({ tipo: "renovacoes" })}
          />
        </div>

        <div
          ref={colunaRef}
          onScroll={aoRolarColuna}
          className={`${painelCls} overflow-y-auto bp-coluna bm-snap-y bm-centro`}
          aria-label="Início"
          role="region"
        >
          <TelaInicio dados={dados} onAbrirPerfil={() => irPara(0)} onAbrirPacientes={() => irPara(2)} />
          <TelaGestao dados={dados} onAbrirPreco={() => abrirSheet("preco")} onAbrirAgenda={() => abrirSheet("agenda")} onAbrirPromocoes={() => abrirSheet("promocoes")} />
          <TelaPerfilPublico dados={dados} onAgendar={() => abrirSheet("preview")} confirmarBio={confirmarBio} />
        </div>

        <div className={`${painelCls} bm-lateral-dir`} aria-label="Pacientes" role="region">
          <PacientesPainel dados={dados} onAbrirPaciente={(p) => setSobreposicao({ tipo: "paciente", p })} />
        </div>
      </div>

      <IndicadorTelas painel={painel} secao={secao} onPainel={irPara} onSecao={irSecao} oculto={bloqueado} />
      {dica.visivel && !bloqueado ? <DicaGestos onDispensar={dica.dispensar} /> : null}

      {medico ? (
        <>
          <PrecoSheet
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            key={`preco-${aberturas}`}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            aberto={sheet === "preco"}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            onFechar={fecharSheet}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            medico={medico}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            confirmar={confirmarValor}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <AgendaSheet
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            key={`agenda-${aberturas}`}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            aberto={sheet === "agenda"}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            onFechar={fecharSheet}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            medico={medico}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            confirmar={confirmarHorarios}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <AgendaPreviewSheet
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            key={`preview-${aberturas}`}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            aberto={sheet === "preview"}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            onFechar={fecharSheet}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            medico={medico}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            consultas={minhas}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        </>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      ) : null}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />

          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      {sobreposicao?.tipo === "paciente" ? (
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        <ConversaPaciente paciente={sobreposicao.p} dados={dados} onFechar={fecharSobreposicao} />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      ) : null}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      {sobreposicao?.tipo === "renovacoes" ? (
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        <TelaSobreposta titulo="Renovações de receita" subtitulo="Pedidos pendentes dos seus pacientes" onFechar={fecharSobreposicao}>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <RenovacoesPendentes />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        </TelaSobreposta>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      ) : null}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      {sobreposicao?.tipo === "suporte" ? (
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        <TelaSobreposta titulo="Suporte" subtitulo="Chamados com a equipe BION" onFechar={fecharSobreposicao}>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <div className="p-4">
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            <ChamadosSuporte />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          </div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        </TelaSobreposta>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      ) : null}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      {sobreposicao?.tipo === "termos" ? (
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        <TelaSobreposta titulo="Termos e ajuda" onFechar={fecharSobreposicao}>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <div className="p-4 space-y-4">
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            <div className="bp-glass p-4 flex items-center justify-between gap-3">
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
              <div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
                <div className="text-sm font-bold">Termos de uso do médico</div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
                <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">Texto específico para profissionais.</div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
              </div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
              <button type="button" onClick={() => window.open("/termos-medico", "_blank")} className="text-xs font-bold text-bion-sea dark:text-sky-300">Ler termos</button>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            </div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
            <Ajuda perfil="medico" />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          </div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
        </TelaSobreposta>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
      ) : null}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
    </div>
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
  );
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
}
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
