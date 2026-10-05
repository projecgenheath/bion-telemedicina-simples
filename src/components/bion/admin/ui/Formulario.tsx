"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { confirmacaoConfere } from "../medicos/medicos";
import "../admin.css";

/** Campo rotulado com erro acessível (aria-invalid + aria-describedby). */
export function Campo({ id, rotulo, erro, dica, children }: { id: string; rotulo: string; erro?: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="ba-rotulo block">
        {rotulo}
      </label>
      <div className="mt-1">{children}</div>
      {erro ? (
        <p id={`${id}-erro`} className="text-xs mt-1 font-semibold" style={{ color: "var(--ba-critico)" }}>
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="text-xs mt-1 ba-texto-2">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

/** Props de acessibilidade para a entrada de um <Campo>. */
export function propsCampo(id: string, erro?: string, dica?: boolean) {
  return {
    id,
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": erro ? `${id}-erro` : dica ? `${id}-dica` : undefined,
  } as const;
}

/** Abas de uma ficha (Perfil · Agenda · …), com setas do teclado. */
export function AbasFicha<T extends string>({ abas, ativa, onMudar, rotulo }: { abas: { id: T; rotulo: string; contagem?: number }[]; ativa: T; onMudar: (a: T) => void; rotulo: string }) {
  const tecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = abas.findIndex((a) => a.id === ativa);
    const nova = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length].id;
    onMudar(nova);
    document.getElementById(`ficha-aba-${nova}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={rotulo} className="ba-abas max-w-full overflow-x-auto" onKeyDown={tecla}>
      {abas.map((a) => (
        <button
          key={a.id}
          id={`ficha-aba-${a.id}`}
          type="button"
          role="tab"
          aria-selected={ativa === a.id}
          tabIndex={ativa === a.id ? 0 : -1}
          onClick={() => onMudar(a.id)}
          className="ba-aba !px-3"
        >
          {a.rotulo}
          {a.contagem ? <span className="ml-1 tabular-nums opacity-80">· {a.contagem}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Foto ou iniciais, em círculo (crachá). */
export function Avatar({ foto, iniciais, tamanho = "w-12 h-12", tom = "sinal" }: { foto?: string; iniciais: string; tamanho?: string; tom?: string }) {
  if (foto) {
    // Data URL do perfil: <img> simples (sem otimização do Next).
    return <img src={foto} alt="" className={`${tamanho} rounded-full object-cover shrink-0 border`} style={{ borderColor: "var(--ba-borda)" }} />;
  }
  return (
    <span className={`ba-estado-icone ${tamanho} !text-base font-black shrink-0`} data-tom={tom} aria-hidden>
      {iniciais}
    </span>
  );
}

/** Credenciais temporárias devolvidas pelo cadastro: aparecem UMA vez. */
export function CredenciaisCard({ email, senha, quem }: { email: string; senha: string; quem: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    void navigator.clipboard
      ?.writeText(`Login: ${email}\nSenha temporária: ${senha}`)
      .then(() => setCopiado(true))
      .catch(() => {});
  };
  return (
    <div className="space-y-3" role="status">
      <div className="ba-card" data-tom="ok" data-denso="true">
        <p className="font-bold flex items-center gap-2">
          <KeyRound className="w-4 h-4" aria-hidden /> Conta de {quem} criada
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="ba-texto-2">Login</dt>
          <dd className="font-mono break-all">{email}</dd>
          <dt className="ba-texto-2">Senha temporária</dt>
          <dd className="font-mono break-all font-bold">{senha}</dd>
        </dl>
      </div>
      <div className="ba-aviso" data-tom="atencao">
        <KeyRound className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>Anote ou copie agora: a senha temporária <b>não aparece de novo</b>. No primeiro acesso, a pessoa é obrigada a trocá-la.</p>
      </div>
      <button type="button" onClick={copiar} className="ba-botao ba-botao-secundario w-full">
        {copiado ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copiado ? "Copiado" : "Copiar login e senha"}
      </button>
    </div>
  );
}

/** Confirmação digitada para ações irreversíveis (arquivar, anonimizar). */
export function ConfirmacaoDigitada({ id, esperado, valor, onMudar, rotulo }: { id: string; esperado: string; valor: string; onMudar: (v: string) => void; rotulo?: string }) {
  const confere = confirmacaoConfere(valor, esperado);
  return (
    <div>
      <label htmlFor={id} className="text-sm block">
        {rotulo ?? "Para confirmar, digite o nome completo:"} <b className="break-words">{esperado}</b>
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="ba-entrada mt-1"
        aria-describedby={`${id}-estado`}
      />
      <p id={`${id}-estado`} className="text-xs mt-1 ba-texto-2" aria-live="polite">
        {valor ? (confere ? "Nome confere." : "Ainda não confere.") : " "}
      </p>
    </div>
  );
}
