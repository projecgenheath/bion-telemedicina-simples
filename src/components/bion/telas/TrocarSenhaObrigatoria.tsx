"use client";

import { useState } from "react";
import { KeyRound, Lock, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";

/**
 * V4 — Troca de senha OBRIGATÓRIA no primeiro acesso.
 *
 * Contas criadas pela administração nascem com senha padrão (bion123) e o
 * flag `precisaTrocarSenha` ativo. O gate em (app)/layout.tsx impede qualquer
 * navegação até que a senha seja trocada — a rota /api/auth/senha valida a
 * senha atual, aplica a nova e revoga as demais sessões do usuário.
 */
export function TrocarSenhaObrigatoria() {
  const { trocarSenha, sair, sessao } = useBion();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  const submeter = async () => {
    if (enviando) return;
    if (!senhaAtual) {
      toast.error("Informe a senha atual.");
      return;
    }
    if (nova.length < 8 || nova.length > 64) {
      toast.error("A nova senha deve ter entre 8 e 64 caracteres.");
      return;
    }
    if (!/[A-Za-z]/.test(nova) || !/[0-9]/.test(nova)) {
      toast.error("A nova senha deve conter letras e números.");
      return;
    }
    if (nova !== confirma) {
      toast.error("A confirmação não corresponde à nova senha.");
      return;
    }
    setEnviando(true);
    const r = await trocarSenha(senhaAtual, nova);
    setEnviando(false);
    if (r.ok) {
      toast.success("Senha alterada com sucesso. Bem-vindo(a) ao BION!");
    } else if (r.erro) {
      toast.error(r.erro);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-xl p-6 sm:p-8">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Defina sua nova senha</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {sessao.nome ? `${sessao.nome}, s` : "S"}ua conta foi criada pela equipe BION com uma
            senha temporária. Por segurança, escolha uma senha pessoal antes de continuar — ela
            protege seu histórico clínico.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha-atual" className="text-xs font-semibold text-muted-foreground">
              Senha temporária atual
            </label>
            <input
              id="senha-atual"
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
              placeholder="bion123"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha-nova" className="text-xs font-semibold text-muted-foreground">
              Nova senha
            </label>
            <input
              id="senha-nova"
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres, com letras e números"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha-confirma" className="text-xs font-semibold text-muted-foreground">
              Confirmar nova senha
            </label>
            <input
              id="senha-confirma"
              type="password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submeter();
              }}
              placeholder="Repita a nova senha"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <button
            type="button"
            onClick={() => void submeter()}
            disabled={enviando}
            className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {enviando ? "Salvando..." : "Salvar e continuar"}
          </button>

          <button
            type="button"
            onClick={() => void sair()}
            className="h-10 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sair da conta
          </button>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-muted/50 p-3">
          <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ao trocar a senha, outras sessões abertas com esta conta são encerradas
            automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
