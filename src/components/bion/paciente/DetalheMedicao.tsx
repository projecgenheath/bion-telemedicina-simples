"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  CalendarClock,
  Check,
  HeartPulse,
  Pill,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { GraficoLinha } from "./GraficoLinha";

/**
 * Telas de detalhe do app do paciente (abertas ao tocar um card da seção 2):
 *  - "imc": histórico gráfico do índice + atualização de peso e altura;
 *  - "pa":  histórico gráfico da pressão arterial (sistólica/diastólica);
 *  - "lembretes": gestão dos lembretes de medicação.
 */

export type Detalhe = "imc" | "pa" | "lembretes" | null;

const rotuloCurto = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function classificarImc(imc: number): { rotulo: string; cor: string } {
  if (imc < 18.5) return { rotulo: "Abaixo do peso", cor: "text-sky-700 dark:text-sky-300" };
  if (imc < 25) return { rotulo: "Peso normal", cor: "text-emerald-700 dark:text-emerald-300" };
  if (imc < 30) return { rotulo: "Sobrepeso", cor: "text-amber-700 dark:text-amber-300" };
  return { rotulo: "Obesidade", cor: "text-red-700 dark:text-red-300" };
}

function classificarPa(sis: number, dia: number): { rotulo: string } {
  if (sis < 120 && dia < 80) return { rotulo: "Ótima" };
  if (sis < 130 && dia < 85) return { rotulo: "Normal" };
  if (sis < 140 && dia < 90) return { rotulo: "Limítrofe" };
  if (sis < 160 && dia < 100) return { rotulo: "Hipertensão estágio 1" };
  if (sis < 180 && dia < 110) return { rotulo: "Hipertensão estágio 2" };
  return { rotulo: "Hipertensão estágio 3" };
}

function Envolver({
  titulo,
  descricao,
  onFechar,
  children,
}: {
  titulo: string;
  descricao: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bp-coluna" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="min-h-full bp-painel">
        <div className="mx-auto w-full max-w-xl px-5 bp-safe-top pb-16">
          <div className="flex items-start justify-between gap-4 pt-2">
            <div>
              <h2 className="text-xl font-bold text-bion-ink dark:text-bion-paper">{titulo}</h2>
              <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60">{descricao}</p>
            </div>
            <button
              onClick={onFechar}
              aria-label="Fechar detalhe"
              className="mt-1 rounded-full p-2.5 bp-glass text-bion-ink dark:text-bion-paper shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FormMedicao({
  campos,
  aoSalvar,
  enviando,
  rotuloBotao,
}: {
  campos: { id: string; rotulo: string; placeholder: string; min: number; max: number; passo: number }[];
  aoSalvar: (valores: number[]) => void;
  enviando: boolean;
  rotuloBotao: string;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});

  return (
    <div className="bp-glass p-5">
      <div className="grid grid-cols-2 gap-3">
        {campos.map((c) => (
          <label key={c.id} className="block">
            <span className="text-xs font-semibold text-bion-ink/70 dark:text-bion-paper/70">{c.rotulo}</span>
            <input
              id={c.id}
              type="number"
              inputMode="decimal"
              min={c.min}
              max={c.max}
              step={c.passo}
              placeholder={c.placeholder}
              value={valores[c.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
              className="bp-entrada mt-1 w-full px-4 py-3 text-sm font-semibold"
            />
          </label>
        ))}
      </div>
      <button
        onClick={() => {
          const nums: number[] = [];
          for (const c of campos) {
            const n = Number((valores[c.id] ?? "").replace(",", "."));
            if (!valores[c.id] || !Number.isFinite(n) || n < c.min || n > c.max) {
              toast.error(`Confira ${c.rotulo.toLowerCase()} (entre ${c.min} e ${c.max}).`);
              return;
            }
            nums.push(n);
          }
          aoSalvar(nums);
          setValores({});
        }}
        disabled={enviando}
        className="bp-acao w-full mt-4 py-3 text-sm inline-flex items-center justify-center gap-2"
      >
        <Check className="w-4 h-4" />
        {enviando ? "Salvando..." : rotuloBotao}
      </button>
    </div>
  );
}

/* ------------------------------- IMC ---------------------------------- */

function DetalheImc({ onFechar }: { onFechar: () => void }) {
  const { medicoes, pacientePerfil, registrarMedicao } = useBion();
  const [enviando, setEnviando] = useState(false);

  const alturas = useMemo(
    () => medicoes.filter((m) => m.tipo === "altura").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const pesos = useMemo(
    () => medicoes.filter((m) => m.tipo === "peso").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );

  const alturaAtual = alturas.at(-1)?.valor1 ?? Number((pacientePerfil?.altura ?? "").replace(",", ".")) ?? undefined;
  const pesoAtual = pesos.at(-1)?.valor1 ?? Number((pacientePerfil?.peso ?? "").replace(",", ".")) ?? undefined;

  const serieImc = useMemo(() => {
    return pesos
      .map((p) => {
        const alturaCm =
          alturas.filter((a) => a.criadoEm <= p.criadoEm).at(-1)?.valor1 ?? alturaAtual;
        if (!alturaCm) return null;
        const imc = p.valor1 / Math.pow(alturaCm / 100, 2);
        return { valor: Math.round(imc * 10) / 10, rotulo: rotuloCurto(p.criadoEm) };
      })
      .filter((x): x is { valor: number; rotulo: string } => x !== null)
      .slice(-12);
  }, [pesos, alturas, alturaAtual]);

  const imcAtual = pesoAtual && alturaAtual ? pesoAtual / Math.pow(alturaAtual / 100, 2) : null;
  const classe = imcAtual ? classificarImc(imcAtual) : null;

  return (
    <Envolver titulo="Índice de Massa Corporal" descricao="Histórico, classificação e atualização de peso e altura" onFechar={onFechar}>
      <div className="bp-glass p-5 text-center">
        {imcAtual ? (
          <>
            <div className="text-4xl font-black text-bion-ink dark:text-bion-paper">{imcAtual.toFixed(1)}</div>
            <div className={`text-sm font-semibold mt-1 ${classe?.cor}`}>{classe?.rotulo}</div>
            <div className="text-xs text-bion-ink/60 dark:text-bion-paper/60 mt-1">
              {pesoAtual} kg · {alturaAtual} cm
            </div>
          </>
        ) : (
          <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60">
            Registre peso e altura para calcular seu IMC.
          </p>
        )}
      </div>

      {serieImc.length > 1 && (
        <div className="bp-glass p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-bion-ink dark:text-bion-paper mb-2">
            <TrendingUp className="w-4 h-4" /> Evolução do IMC
          </div>
          <GraficoLinha
            ariaLabel="Gráfico da evolução do IMC"
            series={[{ pontos: serieImc, cor: "var(--bion-sea)", area: true }]}
            refMin={18.5}
            refMax={24.9}
          />
        </div>
      )}

      <FormMedicao
        campos={[
          { id: "peso", rotulo: "Peso (kg)", placeholder: pesoAtual ? String(pesoAtual) : "70", min: 20, max: 400, passo: 0.1 },
          { id: "altura", rotulo: "Altura (cm)", placeholder: alturaAtual ? String(alturaAtual) : "170", min: 50, max: 250, passo: 1 },
        ]}
        aoSalvar={async ([peso, altura]) => {
          setEnviando(true);
          const okPeso = await registrarMedicao("peso", peso);
          const okAltura = await registrarMedicao("altura", altura);
          setEnviando(false);
          if (okPeso || okAltura) toast.success("Medições atualizadas.");
        }}
        enviando={enviando}
        rotuloBotao="Atualizar peso e altura"
      />

      {pesos.length > 0 && (
        <div className="bp-glass p-5">
          <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-3">Histórico</h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto bp-coluna">
            {[...pesos].reverse().map((p) => {
              const altura = alturas.filter((a) => a.criadoEm <= p.criadoEm).at(-1)?.valor1;
              const imc = altura ? p.valor1 / Math.pow(altura / 100, 2) : null;
              return (
                <li key={p.id} className="flex items-center justify-between text-sm text-bion-ink dark:text-bion-paper">
                  <span className="flex items-center gap-2">
                    <Scale className="w-4 h-4 opacity-60" /> {rotuloCurto(p.criadoEm)}
                  </span>
                  <span className="font-semibold">
                    {p.valor1} kg{imc ? ` · IMC ${imc.toFixed(1)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Envolver>
  );
}

/* --------------------------- Pressão arterial -------------------------- */

function DetalhePa({ onFechar }: { onFechar: () => void }) {
  const { medicoes, registrarMedicao } = useBion();
  const [enviando, setEnviando] = useState(false);
  const pas = useMemo(
    () => medicoes.filter((m) => m.tipo === "pa").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const atual = pas.at(-1);
  const classe = atual ? classificarPa(atual.valor1, atual.valor2 ?? 0) : null;

  return (
    <Envolver titulo="Pressão Arterial" descricao="Histórico gráfico e registro de novas medições" onFechar={onFechar}>
      <div className="bp-glass p-5 text-center">
        {atual ? (
          <>
            <div className="text-4xl font-black text-bion-ink dark:text-bion-paper">
              {atual.valor1}
              <span className="text-2xl opacity-60">/</span>
              {atual.valor2 ?? "—"}
            </div>
            <div className="text-sm font-semibold mt-1 text-bion-ink/70 dark:text-bion-paper/70">
              {classe?.rotulo} · mmHg
            </div>
          </>
        ) : (
          <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60">Registre sua primeira medição.</p>
        )}
      </div>

      {pas.length > 1 && (
        <div className="bp-glass p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-bion-ink dark:text-bion-paper mb-2">
            <HeartPulse className="w-4 h-4" /> Evolução da pressão
          </div>
          <GraficoLinha
            ariaLabel="Gráfico da evolução da pressão arterial"
            series={[
              { pontos: pas.map((p) => ({ valor: p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bion-sea)", area: true },
              ...(pas.some((p) => p.valor2 !== undefined)
                ? [
                    {
                      pontos: pas.map((p) => ({ valor: p.valor2 ?? p.valor1, rotulo: rotuloCurto(p.criadoEm) })),
                      cor: "var(--bion-alerta)",
                    },
                  ]
                : []),
            ]}
            refMin={70}
            refMax={120}
          />
          <div className="flex gap-4 justify-center text-xs text-bion-ink/60 dark:text-bion-paper/60 mt-2">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-bion-sea inline-block" /> Sistólica</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-bion-alerta inline-block" /> Diastólica</span>
          </div>
        </div>
      )}

      <FormMedicao
        campos={[
          { id: "sis", rotulo: "Sistólica (mmHg)", placeholder: atual ? String(atual.valor1) : "120", min: 50, max: 300, passo: 1 },
          { id: "dia", rotulo: "Diastólica (mmHg)", placeholder: atual?.valor2 ? String(atual.valor2) : "80", min: 30, max: 200, passo: 1 },
        ]}
        aoSalvar={async ([sis, dia]) => {
          setEnviando(true);
          const ok = await registrarMedicao("pa", sis, dia);
          setEnviando(false);
          if (ok) toast.success("Pressão registrada.");
        }}
        enviando={enviando}
        rotuloBotao="Registrar pressão"
      />

      {pas.length > 0 && (
        <div className="bp-glass p-5">
          <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-3">Histórico</h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto bp-coluna">
            {[...pas].reverse().map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm text-bion-ink dark:text-bion-paper">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 opacity-60" /> {rotuloCurto(p.criadoEm)}
                </span>
                <span className="font-semibold">
                  {p.valor1}/{p.valor2 ?? "—"} mmHg · {classificarPa(p.valor1, p.valor2 ?? 0).rotulo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Envolver>
  );
}

/* ------------------------------ Lembretes ------------------------------ */

function DetalheLembretes({ onFechar }: { onFechar: () => void }) {
  const { lembretes, adicionarLembrete, alternarLembrete, removerLembrete } = useBion();
  const [titulo, setTitulo] = useState("");
  const [horario, setHorario] = useState("");
  const [medicamento, setMedicamento] = useState("");
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long" });

  return (
    <Envolver titulo="Lembretes de medicação" descricao={`Agenda de hoje e rotina completa · ${hoje}`} onFechar={onFechar}>
      <div className="bp-glass p-5 space-y-3">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper flex items-center gap-2">
          <Pill className="w-4 h-4" /> Adicionar lembrete
        </h3>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Nome (ex.: Losartana 50mg)"
          aria-label="Nome do lembrete"
          className="bp-entrada w-full px-4 py-3 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            placeholder="Horário (08:00)"
            aria-label="Horário do lembrete"
            className="bp-entrada w-full px-4 py-3 text-sm"
          />
          <input
            value={medicamento}
            onChange={(e) => setMedicamento(e.target.value)}
            placeholder="Frequência (1x ao dia)"
            aria-label="Frequência do lembrete"
            className="bp-entrada w-full px-4 py-3 text-sm"
          />
        </div>
        <button
          onClick={() => {
            if (!titulo.trim() || !/^\d{1,2}:\d{2}$/.test(horario.trim())) {
              toast.error("Informe o nome e o horário (ex.: 08:00).");
              return;
            }
            adicionarLembrete({
              titulo: titulo.trim(),
              horario: horario.trim(),
              tipo: "Medicação",
              frequencia: medicamento.trim() || "1x ao dia",
              medicamento: medicamento.trim() || undefined,
            });
            setTitulo("");
            setHorario("");
            setMedicamento("");
            toast.success("Lembrete criado.");
          }}
          className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Criar lembrete
        </button>
      </div>

      <div className="bp-glass p-5">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-3">Rotina</h3>
        {lembretes.length === 0 ? (
          <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60">
            Nenhum lembrete ainda. Crie o primeiro acima.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...lembretes]
              .sort((a, b) => a.horario.localeCompare(b.horario))
              .map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-2xl bg-white/50 dark:bg-white/5 px-4 py-3"
                >
                  <button
                    onClick={() => alternarLembrete(l.id)}
                    aria-label={l.feito ? `Desmarcar ${l.titulo}` : `Marcar ${l.titulo} como tomado`}
                    aria-pressed={l.feito}
                    className={`w-7 h-7 rounded-full border-2 shrink-0 inline-flex items-center justify-center transition ${
                      l.feito
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "border-bion-ink/30 dark:border-bion-paper/30 text-transparent"
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${l.feito ? "line-through opacity-50" : ""} text-bion-ink dark:text-bion-paper`}>
                      {l.titulo}
                    </div>
                    <div className="text-xs text-bion-ink/60 dark:text-bion-paper/60 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" /> {l.horario} · {l.frequencia}
                    </div>
                  </div>
                  <button
                    onClick={() => removerLembrete(l.id)}
                    aria-label={`Remover ${l.titulo}`}
                    className="p-2 rounded-full text-bion-ink/50 dark:text-bion-paper/50 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Envolver>
  );
}

export function DetalheMedicao({ detalhe, onFechar }: { detalhe: Detalhe; onFechar: () => void }) {
  if (detalhe === "imc") return <DetalheImc onFechar={onFechar} />;
  if (detalhe === "pa") return <DetalhePa onFechar={onFechar} />;
  if (detalhe === "lembretes") return <DetalheLembretes onFechar={onFechar} />;
  return null;
}
