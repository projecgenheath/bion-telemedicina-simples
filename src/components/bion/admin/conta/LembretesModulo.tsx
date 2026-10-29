"use client";

import { useState } from "react";
import { BellRing, Check, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import type { Lembrete } from "@/lib/bion-tipos";
import { TelaModulo } from "../ui/TelaModulo";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { SheetAdmin } from "../ui/SheetAdmin";
import { Campo } from "../ui/Formulario";

const TIPOS: Lembrete["tipo"][] = ["Medicação", "Consulta", "Exame", "Hidratação"];
const FREQUENCIAS = ["Todos os dias", "Segunda a Sexta", "A cada 12 horas", "A cada 8 horas", "Semanalmente"];

/** Lembretes da conta do admin no visual Torre BION (mesmos dados e ações da tela antiga). */
export function LembretesModulo() {
  const { lembretes, adicionarLembrete, alternarLembrete, removerLembrete } = useBion();
  const [novo, setNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [horario, setHorario] = useState("08:00");
  const [tipo, setTipo] = useState<Lembrete["tipo"]>("Consulta");
  const [frequencia, setFrequencia] = useState(FREQUENCIAS[0]);
  const pendentes = lembretes.filter((l) => !l.feito).length;
  const ordenados = [...lembretes].sort((a, b) => Number(a.feito) - Number(b.feito) || a.horario.localeCompare(b.horario));

  // A8: sucesso só com a confirmação do servidor — em falha, o formulário
  // fica aberto com o título preservado (o erro já virou toast no store).
  const salvar = async () => {
    const t = titulo.trim();
    if (!t) return;
    const ok = await adicionarLembrete({ titulo: t, horario, tipo, frequencia });
    if (!ok) return;
    toast.success("Lembrete criado", { description: `"${t}" às ${horario} · ${frequencia}` });
    setTitulo("");
    setNovo(false);
  };

  const botaoNovo = (
    <button type="button" onClick={() => setNovo(true)} className="ba-botao ba-botao-primario !min-h-11 !px-3">
      <Plus className="w-4 h-4" aria-hidden /> Novo lembrete
    </button>
  );

  return (
    <TelaModulo
      titulo="Lembretes"
      icone={BellRing}
      subtitulo={`${pendentes} ${pendentes === 1 ? "pendente" : "pendentes"} · ${lembretes.length} no total`}
      acoes={botaoNovo}
    >
      {ordenados.length === 0 ? (
        <div className="ba-card" data-denso="true">
          <EstadoVazio icone={BellRing} titulo="Nenhum lembrete ainda" texto="Crie lembretes para não perder horários importantes." acao={botaoNovo} />
        </div>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2 max-w-5xl">
          {ordenados.map((l) => (
            <li key={l.id} className="ba-card" data-denso="true" data-tom={l.feito ? undefined : "sinal"}>
              <div className="flex items-center gap-3">
                <span className="ba-estado-icone !w-9 !h-9 shrink-0" data-tom={l.feito ? "neutro" : "sinal"} aria-hidden>
                  <BellRing className="w-4 h-4" />
                </span>
                <div className={`min-w-0 flex-1 ${l.feito ? "opacity-60" : ""}`}>
                  <p className={`font-bold text-sm break-words ${l.feito ? "line-through" : ""}`}>{l.titulo}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs ba-texto-2">
                    <Clock className="w-3.5 h-3.5" aria-hidden />
                    <span className="tabular-nums">{l.horario}</span> · {l.frequencia}
                    <ChipEstado tom="neutro" ponto={false}>
                      {l.tipo}
                    </ChipEstado>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alternarLembrete(l.id)}
                  className="ba-icone-botao"
                  aria-pressed={l.feito}
                  aria-label={l.feito ? `Marcar "${l.titulo}" como pendente` : `Marcar "${l.titulo}" como concluído`}
                >
                  <Check className="w-5 h-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removerLembrete(l.id);
                    toast("Lembrete removido");
                  }}
                  className="ba-icone-botao"
                  aria-label={`Excluir "${l.titulo}"`}
                >
                  <Trash2 className="w-5 h-5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SheetAdmin
        aberto={novo}
        onFechar={() => setNovo(false)}
        titulo="Novo lembrete"
        rodape={
          <button type="button" className="ba-botao ba-botao-primario w-full" disabled={!titulo.trim()} onClick={salvar}>
            Salvar lembrete
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo id="lb-titulo" rotulo="Título">
              <input id="lb-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="ba-entrada w-full" placeholder="Ex.: Conferir repasses do dia" />
            </Campo>
          </div>
          <Campo id="lb-horario" rotulo="Horário">
            <input id="lb-horario" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className="ba-entrada w-full" />
          </Campo>
          <Campo id="lb-tipo" rotulo="Tipo">
            <select id="lb-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Lembrete["tipo"])} className="ba-entrada w-full">
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo id="lb-frequencia" rotulo="Frequência">
              <select id="lb-frequencia" value={frequencia} onChange={(e) => setFrequencia(e.target.value)} className="ba-entrada w-full">
                {FREQUENCIAS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>
      </SheetAdmin>
    </TelaModulo>
  );
}
