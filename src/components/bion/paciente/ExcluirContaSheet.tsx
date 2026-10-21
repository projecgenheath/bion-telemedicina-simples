"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { PALAVRA_CONFIRMACAO_EXCLUSAO, confirmacaoExclusaoValida } from "@/lib/exclusao-conta-logica";

/**
 * Folha "Excluir minha conta" (LGPD art. 18, VI). Explica o que acontece,
 * mostra as pendências do servidor (GET /api/paciente/conta), pede a palavra
 * EXCLUIR e a senha. Só chama onExcluida depois do sucesso no servidor (que já
 * encerrou a sessão); quem chama limpa o estado e manda para /entrar.
 */
export function ExcluirContaSheet({ onFechar, onExcluida }: { onFechar: () => void; onExcluida: () => void }) {
  const [motivos, setMotivos] = useState<string[] | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/paciente/conta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { motivos?: string[] }) => vivo && setMotivos(j.motivos ?? []))
      .catch(() => vivo && setErroCarga(true));
    return () => {
      vivo = false;
    };
  }, []);

  const bloqueada = (motivos?.length ?? 0) > 0;
  const pode = motivos !== null && !bloqueada && confirmacaoExclusaoValida(confirmacao) && senha.length > 0 && !enviando;

  const excluir = async () => {
    if (!pode) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paciente/conta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao, senha }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; motivos?: string[] };
      if (r.ok) {
        onExcluida();
        return;
      }
      if (r.status === 409 && j.motivos) setMotivos(j.motivos);
      setErro(j.erro ?? "Não foi possível excluir a conta agora. Tente novamente.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    }
    setEnviando(false);
  };

  const fechar = () => {
    if (!enviando) onFechar();
  };
  const ref = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, ref);

  return (
    <div ref={ref} className="bpp-sheet-raiz absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-excluir-conta">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={fechar} />
      <div className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-excluir-conta" className="text-lg font-bold text-red-700 dark:text-red-300">Excluir minha conta</h2>

        <div className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave space-y-2">
          <p>
            <strong className="bpp-sheet-forte">Esta ação não pode ser desfeita.</strong> Você perde o acesso ao app e
            não poderá entrar de novo com este e-mail.
          </p>
          <p>
            Seus dados pessoais (nome, e-mail, CPF, telefone, data de nascimento, foto e dados de cadastro) serão
            anonimizados, e os lembretes, notificações e chamados de suporte serão apagados.
          </p>
          <p>
            O seu prontuário (consultas, triagens, receitas, exames e conversas com os médicos) é guardado por 20
            anos, como manda a lei (Lei 13.787/2018), mas sem o seu nome.
          </p>
          <p>Antes de excluir, consultas ativas e reembolsos em andamento precisam estar resolvidos.</p>
        </div>

        {motivos === null && !erroCarga ? (
          <p className="mt-4 text-sm bpp-sheet-suave inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Verificando pendências…
          </p>
        ) : null}
        {erroCarga ? (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-900 dark:text-red-100" role="alert">
            Não consegui verificar suas pendências agora. Feche e tente de novo.
          </div>
        ) : null}
        {bloqueada ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100" role="alert">
            <p className="font-bold">Ainda não dá para excluir a conta:</p>
            <ul className="list-disc pl-5 mt-1">
              {motivos!.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {motivos !== null && !bloqueada ? (
          <>
            <label htmlFor="confirmar-exclusao" className="block text-xs font-bold mt-4 mb-2 bpp-sheet-suave">
              Digite {PALAVRA_CONFIRMACAO_EXCLUSAO} para confirmar
            </label>
            <input
              id="confirmar-exclusao"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={enviando}
              className="w-full rounded-xl border bpp-sheet-borda p-3 text-sm bpp-sheet-campo"
            />
            <label htmlFor="senha-exclusao" className="block text-xs font-bold mt-3 mb-2 bpp-sheet-suave">
              Sua senha
            </label>
            <input
              id="senha-exclusao"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              disabled={enviando}
              className="w-full rounded-xl border bpp-sheet-borda p-3 text-sm bpp-sheet-campo"
            />
          </>
        ) : null}

        {erro ? (
          <div className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-900 dark:text-red-100" role="alert">
            {erro}
          </div>
        ) : null}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={fechar} disabled={enviando} className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold disabled:opacity-40">
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void excluir()}
            disabled={!pode}
            className="bpp-toque flex-1 py-3 rounded-xl bg-red-700 text-white text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            Excluir conta
          </button>
        </div>
      </div>
    </div>
  );
}
