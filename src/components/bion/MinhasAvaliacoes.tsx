import { useMemo, useState } from "react";
import { Star, TrendingUp, TrendingDown, Minus, MessageSquare } from "lucide-react";
import { useBion } from "@/lib/bion-store";

const DIA = 86400000;

export function MinhasAvaliacoes() {
  const { sessao, avaliacoes } = useBion();
  const [filtro, setFiltro] = useState<"todas" | "com-comentario" | "baixas">("todas");

  const minhas = useMemo(
    () => avaliacoes.filter((a) => a.medico === sessao.nome).sort((x, y) => y.ts - x.ts),
    [avaliacoes, sessao.nome],
  );

  const resumo = useMemo(() => {
    const media = minhas.length ? minhas.reduce((s, a) => s + a.nota, 0) / minhas.length : 0;
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, q: minhas.filter((a) => a.nota === n).length }));

    const corte = Date.now() - 30 * DIA;
    const recentes = minhas.filter((a) => a.ts >= corte);
    const antigas = minhas.filter((a) => a.ts < corte);
    const mediaRec = recentes.length ? recentes.reduce((s, a) => s + a.nota, 0) / recentes.length : 0;
    const mediaAnt = antigas.length ? antigas.reduce((s, a) => s + a.nota, 0) / antigas.length : 0;
    const delta = recentes.length && antigas.length ? mediaRec - mediaAnt : 0;

    // Série mensal (últimos 6 meses)
    const meses: { rotulo: string; media: number; q: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const ini = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const doMes = minhas.filter((a) => a.ts >= ini && a.ts < fim);
      meses.push({
        rotulo: d.toLocaleDateString("pt-BR", { month: "short" }),
        media: doMes.length ? doMes.reduce((s, a) => s + a.nota, 0) / doMes.length : 0,
        q: doMes.length,
      });
    }

    return { media, dist, delta, mediaRec, recentes: recentes.length, meses };
  }, [minhas]);

  const lista = minhas.filter((a) =>
    filtro === "com-comentario" ? !!a.comentario : filtro === "baixas" ? a.nota <= 3 : true,
  );

  const TendIcon = resumo.delta > 0.05 ? TrendingUp : resumo.delta < -0.05 ? TrendingDown : Minus;
  const maxQ = Math.max(1, ...resumo.dist.map((d) => d.q));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">Minhas avaliações</h1>
      <p className="text-muted-foreground mt-1">O que seus pacientes dizem após cada consulta.</p>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-2xl p-5">
          <div className="text-4xl font-bold flex items-center gap-2">
            {resumo.media ? resumo.media.toFixed(1) : "—"}
            <Star className="w-6 h-6 text-primary fill-primary" />
          </div>
          <div className="text-sm text-muted-foreground mt-1">{minhas.length} avaliação(ões)</div>
        </div>
        <div className="bg-card border rounded-2xl p-5">
          <div className="text-sm font-medium">Tendência (30 dias)</div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-bold">
            <TendIcon className="w-5 h-5" style={{ color: resumo.delta < -0.05 ? "#dc2626" : "var(--accent)" }} />
            {resumo.delta ? `${resumo.delta > 0 ? "+" : ""}${resumo.delta.toFixed(1)}` : "estável"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {resumo.recentes} avaliação(ões) recentes{resumo.recentes ? ` • média ${resumo.mediaRec.toFixed(1)}` : ""}
          </div>
        </div>
        <div className="bg-card border rounded-2xl p-5">
          <div className="text-sm font-medium">Distribuição</div>
          <div className="mt-2 space-y-1.5">
            {resumo.dist.map((d) => (
              <div key={d.n} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-muted-foreground">{d.n}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(d.q / maxQ) * 100}%` }} />
                </div>
                <span className="w-4 text-right text-muted-foreground">{d.q}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Média por mês</div>
        <div className="mt-4 flex items-end gap-3 h-32">
          {resumo.meses.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{m.media ? m.media.toFixed(1) : ""}</span>
              <div
                className="w-full rounded-t-lg bg-primary/80"
                style={{ height: `${(m.media / 5) * 100}%`, minHeight: m.media ? 6 : 2 }}
                title={`${m.q} avaliação(ões)`}
              />
              <span className="text-[11px] text-muted-foreground capitalize">{m.rotulo}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        {([["todas", "Todas"], ["com-comentario", "Com comentário"], ["baixas", "Nota ≤ 3"]] as const).map(([k, t]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium border ${filtro === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {lista.length === 0 && (
          <div className="bg-card border rounded-2xl p-8 text-center text-sm text-muted-foreground">
            Nenhuma avaliação por aqui ainda.
          </div>
        )}
        {lista.map((a) => (
          <div key={a.id} className="bg-card border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.paciente}</div>
                <div className="text-xs text-muted-foreground">{a.especialidade} • {a.quando}</div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < a.nota ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />
                ))}
              </div>
            </div>
            {a.comentario && (
              <div className="mt-2 flex gap-2 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                <p>“{a.comentario}”</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
