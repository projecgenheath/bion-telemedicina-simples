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
import { DicaGestos, IndicadorTelas, useDicaGestos } from "./IndicadorTelas";
import { PrecoSheet } from "./sheets/PrecoSheet";
import { AgendaSheet } from "./sheets/AgendaSheet";
import { AgendaPreviewSheet } from "./sheets/AgendaPreviewSheet";
import { EmBreve } from "./sheets/SheetMedico";
import type { PacienteDoMedico } from "./metricas";
import "./medico.css";

type Sheet = "preco" | "agenda" | "preview" | null;
type Sobreposicao = { tipo: "suporte" } | { tipo: "termos" } | { tipo: "paciente"; p: PacienteDoMedico } | null;

const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];

/**
 * App do MÉDICO (fase 1 — só front-end, dados existentes).
 * Carrossel horizontal: [Perfil] ← [Coluna central] → [Pacientes].
 * Coluna central com snap vertical: Início → Gestão → Perfil público.
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
    if (el) el.scrollTo({ left: p * el.clientWidth, behavior: "smooth" });
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
    <div className="bp-shell bm-app text-bion-ink dark:text-bion-paper">
      <div
        ref={carrosselRef}
        onScroll={aoRolarCarrossel}
        inert={bloqueado}
        className={`bp-carrossel bm-carrossel flex h-full overflow-x-auto ${bloqueado ? "pointer-events-none" : ""}`}
        aria-label="Áreas do app do médico"
      >
        <div className={painelCls} aria-label="Meu perfil" role="region">
          <PerfilMedicoPainel
            dados={dados}
            onAbrirSuporte={() => setSobreposicao({ tipo: "suporte" })}
            onAbrirTermos={() => setSobreposicao({ tipo: "termos" })}
          />
        </div>

        <div
          ref={colunaRef}
          onScroll={aoRolarColuna}
          className={`${painelCls} overflow-y-auto bp-coluna bm-snap-y`}
          aria-label="Início"
          role="region"
        >
          <TelaInicio dados={dados} onAbrirPerfil={() => irPara(0)} onAbrirPacientes={() => irPara(2)} />
          <TelaGestao dados={dados} onAbrirPreco={() => abrirSheet("preco")} onAbrirAgenda={() => abrirSheet("agenda")} />
          <TelaPerfilPublico dados={dados} onAgendar={() => abrirSheet("preview")} confirmarBio={confirmarBio} />
        </div>

        <div className={painelCls} aria-label="Pacientes" role="region">
          <PacientesPainel dados={dados} onAbrirPaciente={(p) => setSobreposicao({ tipo: "paciente", p })} />
        </div>
      </div>

      {sobreposicao === null ? (
        <IndicadorTelas painel={painel} secao={secao} onPainel={irPara} onSecao={irSecao} />
      ) : null}
      {dica.visivel && !bloqueado ? <DicaGestos onDispensar={dica.dispensar} /> : null}

      {medico ? (
        <>
          <PrecoSheet
            key={`preco-${aberturas}`}
            aberto={sheet === "preco"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <AgendaSheet
            key={`agenda-${aberturas}`}
            aberto={sheet === "agenda"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarHorarios}
          />
          <AgendaPreviewSheet
            key={`preview-${aberturas}`}
            aberto={sheet === "preview"}
            onFechar={fecharSheet}
            medico={medico}
            consultas={minhas}
          />
        </>
      ) : null}

      {sobreposicao?.tipo === "paciente" ? (
        <ConversaPaciente paciente={sobreposicao.p} dados={dados} onFechar={fecharSobreposicao} />
      ) : null}
      {sobreposicao?.tipo === "suporte" ? (
        <TelaSobreposta titulo="Suporte" subtitulo="Chamados com a equipe BION" onFechar={fecharSobreposicao}>
          <div className="p-4">
            <ChamadosSuporte />
          </div>
        </TelaSobreposta>
      ) : null}
      {sobreposicao?.tipo === "termos" ? (
        <TelaSobreposta titulo="Termos e ajuda" onFechar={fecharSobreposicao}>
          <div className="p-4 space-y-4">
            <div className="bp-glass p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Termos de uso do médico</div>
                <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">Texto específico para profissionais.</div>
              </div>
              <EmBreve />
            </div>
            <Ajuda perfil="medico" />
          </div>
        </TelaSobreposta>
      ) : null}
    </div>
  );
}
