"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Send, ShieldAlert, Stethoscope, User } from "lucide-react";
import { toast } from "sonner";
import { useBion, type TicketSuporte } from "@/lib/bion-store";
import { chamarApi } from "../repasses/recurso";
import { ChipEstado } from "../ui/ChipEstado";
import { estadoChamado } from "../rotulos";
import {
  RESPOSTA_MAX,
  estadoEspera,
  outrosDaPessoa,
  pessoaDoChamado,
  rotuloCategoriaChamado,
  rotuloPerfilChamado,
  tsDoChamado,
  validarResposta,
} from "./chamados";

/** A conversa do chamado: mensagem da pessoa (à esquerda) e a resposta do suporte (à direita). */
export function Conversa({
  t,
  agora,
  onIr,
  onAbrirOutro,
  semTitulo = false,
}: {
  t: TicketSuporte;
  agora: number;
  onIr: (destino: string) => void;
  onAbrirOutro: (t: TicketSuporte) => void;
  semTitulo?: boolean;
}) {
  const { tickets, medicos, pacientes } = useBion();
  const pessoa = pessoaDoChamado(t, medicos, pacientes);
  const outros = outrosDaPessoa(tickets, t);
  const ts = tsDoChamado(t.data, agora);
  const espera = t.status !== "resolvido" && ts !== null ? estadoEspera(Math.max(0, agora - ts)) : null;
  const Icone = t.perfil === "medico" ? Stethoscope : User;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        {!semTitulo ? <h2 className="text-xl font-black leading-tight break-words">{t.assunto || "Chamado sem assunto"}</h2> : null}
        <div className="flex flex-wrap gap-1.5">
          <ChipEstado estado={estadoChamado(t.status)} />
          <ChipEstado tom="neutro" ponto={false}>
            {rotuloCategoriaChamado(t.categoria)}
          </ChipEstado>
          {espera ? <ChipEstado tom={espera.tom}>{espera.rotulo}</ChipEstado> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="ba-texto-2">
            Aberto por <b>{t.usuario}</b> ({rotuloPerfilChamado(t.perfil).toLowerCase()})
          </span>
          {pessoa.destino ? (
            <button type="button" onClick={() => onIr(pessoa.destino!)} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
              <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Abrir ficha {t.perfil === "medico" ? "do médico" : "do paciente"}
            </button>
          ) : null}
        </div>
        {pessoa.homonimo ? (
          <div className="ba-aviso" data-tom="atencao">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>Há mais de um {t.perfil === "medico" ? "médico" : "paciente"} com este nome. O chamado chega só com o nome, então a ficha não é aberta direto.</p>
          </div>
        ) : null}
      </header>

      <ol className="space-y-3" aria-label="Mensagens">
        <li className="ba-bolha" data-lado="pessoa">
          <div className="flex items-center gap-2 text-xs ba-texto-2 mb-1">
            <Icone className="w-3.5 h-3.5" aria-hidden />
            <b>{t.usuario}</b>
            <span aria-hidden>·</span>
            <span>{t.data}</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{t.mensagem}</p>
        </li>
        {t.resposta ? (
          <li className="ba-bolha" data-lado="suporte">
            <div className="flex items-center gap-2 text-xs mb-1 opacity-90">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
              <b>{t.respondidoPor ?? "Suporte BION"}</b>
              {t.dataResposta ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t.dataResposta}</span>
                </>
              ) : null}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{t.resposta}</p>
          </li>
        ) : (
          <li className="text-center text-xs ba-texto-3 py-1">Ainda sem resposta do suporte.</li>
        )}
      </ol>

      {outros.length ? (
        <section aria-label="Outros chamados desta pessoa">
          <h3 className="ba-rotulo mb-2">Outros chamados de {t.usuario}</h3>
          <ul className="space-y-1.5">
            {outros.slice(0, 5).map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onAbrirOutro(o)} className="ba-card w-full text-left flex items-center gap-3" data-denso="true">
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold block truncate">{o.assunto || "Chamado sem assunto"}</span>
                    <span className="text-xs ba-texto-2">{o.data}</span>
                  </span>
                  <ChipEstado estado={estadoChamado(o.status)} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Responder o chamado (só ADMIN). A resposta notifica a pessoa e marca o
 * chamado como resolvido — não há como desfazer, então há um passo de
 * confirmação explícito (nunca por gesto). Ctrl/⌘ + Enter leva à confirmação.
 */
export function Resposta({ t, valor, onMudar, onEnviado }: { t: TicketSuporte; valor: string; onMudar: (v: string) => void; onEnviado: () => void }) {
  const { aplicarDelta } = useBion();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const v = validarResposta(valor);
  const id = `resposta-${t.id}`;

  if (t.status === "resolvido") {
    return (
      <p className="text-sm ba-texto-2 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--ba-ok)" }} aria-hidden /> Chamado resolvido. A resposta já foi enviada e não pode ser alterada.
      </p>
    );
  }

  const revisar = () => {
    setTocado(true);
    if (v.ok) {
      setErro(null);
      setConfirmando(true);
    }
  };
  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<Record<string, unknown>>(`/api/tickets/${encodeURIComponent(t.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resposta: valor.trim() }),
    });
    setEnviando(false);
    if (!r.dados) {
      setErro(r.status === 404 ? "Este chamado não existe mais." : r.status === 403 ? "Só o administrador pode responder chamados." : (r.erro ?? "Não foi possível enviar."));
      return;
    }
    aplicarDelta(r.dados);
    setConfirmando(false);
    onEnviado();
    toast.success("Resposta enviada", { description: `${t.usuario} foi notificado(a) e o chamado ficou como resolvido.` });
  };

  if (confirmando) {
    return (
      <div role="alertdialog" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-texto`} className="space-y-3">
        <p id={`${id}-titulo`} className="font-bold">
          Enviar a resposta para {t.usuario}?
        </p>
        <p id={`${id}-texto`} className="text-sm ba-texto-2">
          A pessoa recebe uma notificação e o chamado passa para <b>Resolvido</b>. Depois de enviada, a resposta não pode ser editada.
        </p>
        <blockquote className="ba-bolha text-sm whitespace-pre-wrap break-words max-h-32 overflow-y-auto" data-lado="suporte">
          {valor.trim()}
        </blockquote>
        {erro ? (
          <div className="ba-aviso" data-tom="critico" role="alert">
            <p>{erro}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="ba-botao ba-botao-secundario">
            Voltar e editar
          </button>
          <button type="button" onClick={() => void enviar()} disabled={enviando} className="ba-botao ba-botao-primario flex-1" autoFocus>
            <Send className="w-4 h-4" aria-hidden /> {enviando ? "Enviando…" : "Enviar e resolver"}
          </button>
        </div>
      </div>
    );
  }

  const mostrarErro = tocado && !v.ok;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="ba-rotulo block">
        Responder a {t.usuario}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            revisar();
          }
        }}
        rows={3}
        maxLength={RESPOSTA_MAX}
        placeholder="Escreva a resposta e a solução para este chamado…"
        className="ba-entrada !rounded-2xl min-h-[5.5rem] py-3 resize-y"
        aria-invalid={mostrarErro || undefined}
        aria-describedby={`${id}-ajuda`}
      />
      <div className="flex items-center gap-2">
        <p id={`${id}-ajuda`} className={`text-xs flex-1 ${mostrarErro ? "" : "ba-texto-3"}`} style={mostrarErro ? { color: "var(--ba-critico)" } : undefined} aria-live="polite">
          {mostrarErro ? v.erro : `${valor.trim().length}/${RESPOSTA_MAX} · Ctrl + Enter para revisar`}
        </p>
        <button type="button" onClick={revisar} className="ba-botao ba-botao-primario shrink-0">
          <Send className="w-4 h-4" aria-hidden /> Revisar e enviar
        </button>
      </div>
    </div>
  );
}
