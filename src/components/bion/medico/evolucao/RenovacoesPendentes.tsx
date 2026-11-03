"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Tela do médico: pedidos de renovação de receita pendentes.
 * Três respostas: renovar (receita nova, só sem controlado), marcar chamada
 * curta, ou recusar com mensagem. Regras no servidor:
 * POST /api/medico/renovacoes/[id]/responder.
 * Melhoria nº 4 (auditoria médica): "Renovar sem alterações" responde em
 * 1 clique com os campos originais, e cada pedido mostra há quanto tempo
 * espera (criadoEm já vinha no wire da listagem).
 */
type Pedido = {
  id: string;
  criadoEm: string;
  observacaoPaciente: string | null;
  paciente: { id: string; nome: string };
  documento: { titulo: string; medicamento: string | null; posologia: string | null; duracao: string | null; conteudo: string; cid: string | null; controlado: boolean } | null;
  exigeChamada: boolean;
};

/** Idade do pedido em texto ("há 3 dias"), a partir do criadoEm do wire. */
function idadePedido(criadoEm: string, agora: number = Date.now()): string {
  const ms = agora - new Date(criadoEm).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "agora há pouco";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  if (dias < 30) {
    const semanas = Math.floor(dias / 7);
    return semanas === 1 ? "há 1 semana" : `há ${semanas} semanas`;
  }
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

/**
 * Renovação direta (1 clique) só quando o documento original está COMPLETO:
 * a rota trata campo vazio como "herdar o original", então faltando
 * medicamento/posologia/duração/conteúdo o caminho é o formulário de
 * resposta, que obriga o médico a preencher — nada de renovar no escuro.
 */
function podeRenovarDireto(p: Pedido): boolean {
  const d = p.documento;
  return (
    !p.exigeChamada &&
    !!d &&
    !!d.conteudo.trim() &&
    !!d.medicamento?.trim() &&
    !!d.posologia?.trim() &&
    !!d.duracao?.trim()
  );
}

export function RenovacoesPendentes() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [conteudo, setConteudo] = useState("");
  // P2 (auditoria de melhorias): medicamento/posologia/duração eram herdados
  // em silêncio — o médico editava só o texto livre e os campos estruturados
  // da receita nova podiam contar outra história (a rota já aceita e persiste
  // os três; quem não enviava era esta tela). Agora são editáveis e visíveis.
  const [medicamento, setMedicamento] = useState("");
  const [posologia, setPosologia] = useState("");
  const [duracao, setDuracao] = useState("");
  const [quando, setQuando] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/medico/renovacoes", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      setPedidos(((await res.json()) as { pedidos: Pedido[] }).pedidos);
      setErroCarga(null);
    } else {
      setErroCarga("Não foi possível carregar os pedidos.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const responder = async (id: string, corpo: Record<string, unknown>) => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/medico/renovacoes/${encodeURIComponent(id)}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, mensagemMedico: mensagem || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
      if (!res.ok) {
        toast.error(j.mensagem ?? (j.erro === "pedido_nao_pendente" ? "Esse pedido já foi respondido." : j.erro ?? "Não foi possível responder."));
        // Falha NÃO apaga o rascunho: o texto digitado fica no formulário para
        // tentar de novo (o bug antigo limpava tudo mesmo com erro do servidor).
        return;
      }
      toast.success("Resposta enviada ao paciente");
      setAberto(null);
      setMensagem("");
      setConteudo("");
      setMedicamento("");
      setPosologia("");
      setDuracao("");
      setQuando("");
      await carregar();
    } catch {
      // M-7: falha de rede antes era rejeição não tratada — médico sem aviso
      // e formulário sem limpeza.
      toast.error("Falha de conexão", { description: "Verifique sua internet e tente novamente." });
    } finally {
      setEnviando(false);
    }
  };

  /**
   * Melhoria nº 4: renova com os campos ORIGINAIS, sem abrir o formulário.
   * O payload espelha o que o formulário enviaria sem edições (a rota
   * persiste medicamento/posologia/duracao/cid e cai para o original no que
   * faltar). NÃO leva mensagemMedico: a `mensagem` do estado pertence ao
   * formulário de resposta de outro pedido que esteja aberto.
   */
  const renovarSemAlteracoes = async (p: Pedido) => {
    const doc = p.documento;
    if (!doc) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/medico/renovacoes/${encodeURIComponent(p.id)}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "renovar",
          documento: {
            conteudo: doc.conteudo,
            medicamento: doc.medicamento,
            posologia: doc.posologia,
            duracao: doc.duracao,
            ...(doc.cid ? { cid: doc.cid } : {}),
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
      if (!res.ok) {
        toast.error(j.mensagem ?? (j.erro === "pedido_nao_pendente" ? "Esse pedido já foi respondido." : j.erro ?? "Não foi possível responder."));
        return;
      }
      toast.success("Receita renovada e enviada ao paciente");
      await carregar();
    } catch {
      toast.error("Falha de conexão", { description: "Verifique sua internet e tente novamente." });
    } finally {
      setEnviando(false);
    }
  };

  if (!pedidos) {
    if (erroCarga) {
      return (
        <div className="p-4 space-y-2">
          <p className="text-sm opacity-70">{erroCarga}</p>
          <button type="button" onClick={() => void carregar()} className="text-sm underline font-bold">Tentar novamente</button>
        </div>
      );
    }
    return <div className="p-4 text-sm opacity-70">Carregando…</div>;
  }
  if (pedidos.length === 0) return <div className="p-4 text-sm opacity-70">Nenhum pedido de renovação pendente.</div>;

  // M-7: mínimo do datetime-local = agora (o servidor recusa horário passado).
  const agoraLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  return (
    <ul className="p-4 space-y-3">
      {pedidos.map((p) => (
        <li key={p.id} className="bp-glass p-4 space-y-2">
          <div className="font-bold">{p.paciente.nome}</div>
          <div className="text-xs opacity-60">Pedido feito {idadePedido(p.criadoEm)}</div>
          <div className="text-sm">{p.documento?.titulo ?? "Receita"}{p.documento?.medicamento ? ` — ${p.documento.medicamento}` : ""}</div>
          {p.documento?.posologia ? <div className="text-xs opacity-75">{p.documento.posologia}</div> : null}
          {p.observacaoPaciente ? <div className="text-xs italic">“{p.observacaoPaciente}”</div> : null}
          {p.exigeChamada ? <div className="text-xs font-semibold text-amber-700">Controlado: renovação só por chamada.</div> : null}
          {aberto === p.id ? (
            <div className="space-y-2">
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} maxLength={1000}
                placeholder="Mensagem para o paciente (obrigatória para recusar)" className="w-full rounded-xl border bg-background p-2 text-sm" />
              {!p.exigeChamada ? (
                <>
                  <input value={medicamento} onChange={(e) => setMedicamento(e.target.value)} maxLength={200}
                    placeholder="Medicamento" aria-label="Medicamento da receita nova" className="w-full rounded-xl border bg-background p-2 text-sm" />
                  <input value={posologia} onChange={(e) => setPosologia(e.target.value)} maxLength={300}
                    placeholder="Posologia (ex.: 1 comprimido ao dia)" aria-label="Posologia da receita nova" className="w-full rounded-xl border bg-background p-2 text-sm" />
                  <input value={duracao} onChange={(e) => setDuracao(e.target.value)} maxLength={100}
                    placeholder="Duração do tratamento" aria-label="Duração da receita nova" className="w-full rounded-xl border bg-background p-2 text-sm" />
                  <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={3} maxLength={6000}
                    placeholder="Texto da receita nova" className="w-full rounded-xl border bg-background p-2 text-sm" />
                </>
              ) : null}
              <input type="datetime-local" min={agoraLocal} value={quando} onChange={(e) => setQuando(e.target.value)} className="w-full rounded-xl border bg-background p-2 text-sm" aria-label="Horário da chamada curta" />
              <div className="flex flex-wrap gap-2">
                {!p.exigeChamada ? (
                  <button type="button" disabled={enviando || !conteudo.trim() || !medicamento.trim() || !posologia.trim() || !duracao.trim()} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => void responder(p.id, { acao: "renovar", documento: { conteudo, medicamento: medicamento.trim(), posologia: posologia.trim(), duracao: duracao.trim() } })}>Renovar</button>
                ) : null}
                <button type="button" disabled={enviando || !quando} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void responder(p.id, { acao: "chamada", dataInicio: new Date(quando).toISOString() })}>Marcar chamada curta</button>
                <button type="button" disabled={enviando || !mensagem.trim()} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void responder(p.id, { acao: "recusar" })}>Recusar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {podeRenovarDireto(p) ? (
                <button type="button" disabled={enviando} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void renovarSemAlteracoes(p)}>Renovar sem alterações</button>
              ) : null}
              <button type="button" className="text-sm underline" onClick={() => {
                setAberto(p.id);
                setConteudo(p.documento && !p.exigeChamada ? p.documento.conteudo : "");
                setMedicamento(p.documento && !p.exigeChamada ? (p.documento.medicamento ?? "") : "");
                setPosologia(p.documento && !p.exigeChamada ? (p.documento.posologia ?? "") : "");
                setDuracao(p.documento && !p.exigeChamada ? (p.documento.duracao ?? "") : "");
              }}>Responder</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
