import { useMemo } from "react";
import { CalendarCheck, XCircle, Star, FileText, TrendingUp, Users } from "lucide-react";
import { useBion } from "@/lib/bion-store";

function Metrica({
  icon: Icon,
  label,
  valor,
  detalhe,
}: {
  icon: typeof Star;
  label: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <div className="bg-card border rounded-2xl p-4">
      <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div className="mt-3 text-2xl font-bold">{valor}</div>
      <div className="font-medium text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detalhe}</div>
    </div>
  );
}

export function Relatorios() {
  const { consultas, documentos, avaliacoes, arquivos, consentimentos } = useBion();

  const dados = useMemo(() => {
    const total = consultas.length;
    const concluidas = consultas.filter((c) => c.status === "concluida").length;
    const canceladas = consultas.filter((c) => c.status === "cancelada").length;
    const media = avaliacoes.length
      ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
      : 0;

    const porEspecialidade = new Map<string, number>();
    consultas.forEach((c) => porEspecialidade.set(c.especialidade, (porEspecialidade.get(c.especialidade) ?? 0) + 1));

    const porMedico = new Map<string, { total: number; soma: number; n: number }>();
    consultas.forEach((c) => {
      const m = porMedico.get(c.medico) ?? { total: 0, soma: 0, n: 0 };
      m.total += 1;
      porMedico.set(c.medico, m);
    });
    avaliacoes.forEach((a) => {
      const m = porMedico.get(a.medico) ?? { total: 0, soma: 0, n: 0 };
      m.soma += a.nota;
      m.n += 1;
      porMedico.set(a.medico, m);
    });

    return {
      total,
      concluidas,
      canceladas,
      media,
      taxaCancelamento: total ? Math.round((canceladas / total) * 100) : 0,
      especialidades: [...porEspecialidade.entries()].sort((a, b) => b[1] - a[1]),
      medicos: [...porMedico.entries()].sort((a, b) => b[1].total - a[1].total),
      pacientes: new Set(consultas.map((c) => c.paciente)).size,
    };
  }, [consultas, avaliacoes]);

  const maxEsp = Math.max(1, ...dados.especialidades.map(([, n]) => n));

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold">Relatórios</h1>
      <p className="text-muted-foreground mt-1">Indicadores da plataforma em tempo real, calculados a partir da operação.</p>

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metrica icon={CalendarCheck} label="Consultas" valor={String(dados.total)} detalhe={`${dados.concluidas} concluída(s)`} />
        <Metrica icon={XCircle} label="Taxa de cancelamento" valor={`${dados.taxaCancelamento}%`} detalhe={`${dados.canceladas} cancelada(s)`} />
        <Metrica icon={Star} label="Satisfação média" valor={dados.media ? dados.media.toFixed(1) : "—"} detalhe={`${avaliacoes.length} avaliação(ões)`} />
        <Metrica icon={Users} label="Pacientes ativos" valor={String(dados.pacientes)} detalhe="com consulta registrada" />
      </div>

      <div className="mt-4 grid sm:grid-cols-3 gap-4">
        <Metrica icon={FileText} label="Documentos emitidos" valor={String(documentos.length)} detalhe="receitas e atestados" />
        <Metrica icon={TrendingUp} label="Arquivos trocados" valor={String(arquivos.length)} detalhe="exames e anexos" />
        <Metrica icon={FileText} label="Consentimentos" valor={String(consentimentos.length)} detalhe="registros de acesso ao PDF" />
      </div>

      <div className="mt-6 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Consultas por especialidade</div>
        <div className="mt-4 space-y-3">
          {dados.especialidades.length === 0 && <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
          {dados.especialidades.map(([esp, n]) => (
            <div key={esp}>
              <div className="flex justify-between text-sm">
                <span>{esp}</span>
                <span className="text-muted-foreground">{n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxEsp) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Desempenho por médico</div>
        <div className="mt-3 space-y-2">
          {dados.medicos.map(([medico, m]) => (
            <div key={medico} className="rounded-xl border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{medico}</div>
                <div className="text-xs text-muted-foreground">{m.total} consulta(s)</div>
              </div>
              <div className="flex items-center gap-1 text-sm shrink-0">
                <Star className={`w-4 h-4 ${m.n ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                {m.n ? (m.soma / m.n).toFixed(1) : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Avaliações recentes</div>
        <div className="mt-3 space-y-2">
          {avaliacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação recebida.</p>}
          {avaliacoes.slice(0, 8).map((a) => (
            <div key={a.id} className="rounded-xl border p-3">
              <div className="flex items-center gap-1 text-sm font-medium">
                {Array.from({ length: a.nota }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-primary fill-primary" />
                ))}
                <span className="ml-2 text-muted-foreground font-normal text-xs">{a.quando}</span>
              </div>
              <div className="text-sm mt-1">{a.medico} • {a.especialidade}</div>
              {a.comentario && <div className="text-sm text-muted-foreground mt-1">“{a.comentario}”</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
