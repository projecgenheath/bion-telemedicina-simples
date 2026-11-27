"use client";

import { Lock, ShieldAlert } from "lucide-react";
import { CardAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, Esqueleto } from "../ui/Estados";
import { TelaModulo } from "../ui/TelaModulo";
import { useRecurso } from "../repasses/recurso";
import type { EstadoTravas } from "@/lib/server/travas-admin";
import type { TarefaAgenda } from "./agenda";

type Resposta = {
  travas: EstadoTravas;
  vercelJsonTemCrons: boolean;
  tarefas: TarefaAgenda[];
  nota: string;
};

const MODO: Record<EstadoTravas["modoCobranca"], string> = {
  plataforma: "Plataforma: cobra na conta da BION, sem divisão no Stripe.",
  destino: "Destino: cobra na plataforma e transfere para a conta do médico.",
  direta: "Direta: cobra na conta do médico.",
  padrao_plataforma: "Variável vazia: o código trata como cobrança na plataforma (modelo 21/11).",
  nao_reconhecido: "Valor da variável não reconhecido. O código trata como cobrança direta.",
};

const CHAVE: Record<EstadoTravas["classeChave"], { rotulo: string; texto: string; tom: "ok" | "atencao" | "critico" | "neutro" }> = {
  ausente: { rotulo: "Sem chave", texto: "Não há chave do Stripe neste servidor.", tom: "neutro" },
  teste: { rotulo: "Chave de teste", texto: "A chave é de teste. A cobrança real não está ligada por ela.", tom: "ok" },
  live: { rotulo: "Chave live bloqueada", texto: "A chave é live. A trava recusa a cobrança até você liberar.", tom: "critico" },
  outra: { rotulo: "Chave não reconhecida", texto: "A chave não começa com o prefixo de teste nem de live. A trava de live não a classifica como live.", tom: "atencao" },
};

export function TravasModulo() {
  const r = useRecurso<Resposta>("/api/admin/travas");
  const t = r.dados?.travas;
  const chave = t ? CHAVE[t.classeChave] : null;
  return (
    <TelaModulo
      titulo="Travas"
      icone={Lock}
      subtitulo="Só leitura. Nada aqui liga cobrança nem tarefa automática."
      onAtualizar={() => r.recarregar()}
      atualizando={r.carregando && !!r.dados}
      erroAtualizar={r.erro}
      onTentarDeNovo={() => r.recarregar()}
    >
      {!r.dados && r.carregando ? <Esqueleto variante="cards" quantidade={3} rotulo="Carregando travas…" /> : null}
      {!r.dados && r.erro ? <EstadoErro mensagem={r.erro} onTentar={r.recarregar} /> : null}
      {r.dados && t && chave ? (
        <div className="space-y-3">
          <div className="ba-aviso" data-tom="atencao">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>{r.dados.nota}</p>
          </div>

          <CardAdmin titulo="Cobrança" icone={Lock} tom={t.cobrancaLiveBloqueada ? "critico" : undefined}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <ChipEstado tom={chave.tom}>{chave.rotulo}</ChipEstado>
              <ChipEstado tom={t.stripeLigado ? "atencao" : "neutro"}>{t.stripeLigado ? "Fluxo Stripe ligado" : "Fluxo Stripe desligado"}</ChipEstado>
              <ChipEstado tom={t.cobrancaLiveBloqueada ? "critico" : "ok"}>
                {t.cobrancaLiveBloqueada ? "Trava de chave live ligada" : "Trava de chave live não se aplica"}
              </ChipEstado>
            </div>
            <p className="text-sm">{chave.texto}</p>
            <p className="text-sm ba-texto-2 mt-1">{MODO[t.modoCobranca]}</p>
          </CardAdmin>

          <CardAdmin titulo="Servidor" icone={Lock}>
            <ul className="space-y-2 text-sm">
              <li>
                <b>Segredo das tarefas automáticas:</b> {t.cronSecretConfigurado ? "configurado" : "não configurado"}
              </li>
              <li>
                <b>Comprovante de repasse:</b> {t.comprovanteConfigurado ? "o armazenamento está configurado" : "o armazenamento não está configurado"}
              </li>
            </ul>
            <p className="text-xs ba-texto-3 mt-2">A tela diz se existe, sem mostrar o valor.</p>
          </CardAdmin>

          <CardAdmin titulo="Tarefas automáticas" icone={Lock} tom={r.dados.vercelJsonTemCrons ? "atencao" : undefined}>
            <p className="text-sm mb-3">
              {r.dados.vercelJsonTemCrons
                ? "O arquivo vercel.json deste código declara agenda."
                : "O arquivo vercel.json deste código não declara agenda. As três rotas descritas como cron da Vercel não estão nesse arquivo."}
            </p>
            <ul className="space-y-2">
              {r.dados.tarefas.map((item) => (
                <li key={item.rota} className="text-sm">
                  <p className="font-bold break-all">{item.rota}</p>
                  <p className="ba-texto-2">{item.onde}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs ba-texto-3 mt-3">Não conferi se o Supabase está chamando as rotas de pg_cron.</p>
          </CardAdmin>
        </div>
      ) : null}
    </TelaModulo>
  );
}
