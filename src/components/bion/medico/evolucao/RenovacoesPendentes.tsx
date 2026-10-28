"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Tela do médico: pedidos de renovação de receita pendentes.
 * Três respostas: renovar (receita nova, só sem controlado), marcar chamada
 * curta, ou recusar com mensagem. Regras no servidor:
 * POST /api/medico/renovacoes/[id]/responder.
 */
type Pedido = {
  id: string;
  criadoEm: string;
  observacaoPaciente: string | null;
  paciente: { id: string; nome: string };
  documento: { titulo: string; medicamento: string | null; posologia: string | null; duracao: string | null; conteudo: string; controlado: boolean } | null;
  exigeChamada: boolean;
};

export function RenovacoesPendentes() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [conteudo, setConteudo] = useState("");
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
      } else toast.success("Resposta enviada ao paciente");
      setAberto(null);
      setMensagem("");
      setConteudo("");
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
          <div className="text-sm">{p.documento?.titulo ?? "Receita"}{p.documento?.medicamento ? ` — ${p.documento.medicamento}` : ""}</div>
          {p.documento?.posologia ? <div className="text-xs opacity-75">{p.documento.posologia}</div> : null}
          {p.observacaoPaciente ? <div className="text-xs italic">“{p.observacaoPaciente}”</div> : null}
          {p.exigeChamada ? <div className="text-xs font-semibold text-amber-700">Controlado: renovação só por chamada.</div> : null}
          {aberto === p.id ? (
            <div className="space-y-2">
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} maxLength={1000}
                placeholder="Mensagem para o paciente (obrigatória para recusar)" className="w-full rounded-xl border bg-background p-2 text-sm" />
              {!p.exigeChamada ? (
                <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={3} maxLength={6000}
                  placeholder="Texto da receita nova" className="w-full rounded-xl border bg-background p-2 text-sm" />
              ) : null}
              <input type="datetime-local" min={agoraLocal} value={quando} onChange={(e) => setQuando(e.target.value)} className="w-full rounded-xl border bg-background p-2 text-sm" aria-label="Horário da chamada curta" />
              <div className="flex flex-wrap gap-2">
                {!p.exigeChamada ? (
                  <button type="button" disabled={enviando || !conteudo.trim()} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => void responder(p.id, { acao: "renovar", documento: { conteudo } })}>Renovar</button>
                ) : null}
                <button type="button" disabled={enviando || !quando} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void responder(p.id, { acao: "chamada", dataInicio: new Date(quando).toISOString() })}>Marcar chamada curta</button>
                <button type="button" disabled={enviando || !mensagem.trim()} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void responder(p.id, { acao: "recusar" })}>Recusar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-sm underline" onClick={() => {
              setAberto(p.id);
              setConteudo(p.documento && !p.exigeChamada ? p.documento.conteudo : "");
            }}>Responder</button>
          )}
        </li>
      ))}
    </ul>
  );
}
