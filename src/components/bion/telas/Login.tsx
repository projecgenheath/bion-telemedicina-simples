"use client";
import { useState } from "react";
import type { Role } from "@/lib/rotas";
import { useRouter } from "next/navigation";
import {
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { Logo } from "@/components/bion/brand";

const CONTAS_DEMO: Record<Role, { email: string; senha: string }> = {
  paciente: { email: "marina.silva@email.com", senha: "bion123" },
  medico: { email: "ana.ribeiro@med.bion.app", senha: "bion123" },
  admin: { email: "admin@bion.app", senha: "bion123" },
};

export function Login() {
  const router = useRouter();
  const { entrar, registrar } = useBion();
  const [tab, setTab] = useState<Role>("paciente");
  const [identificador, setIdentificador] = useState("marina.silva@email.com");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");

  const trocarAba = (r: Role) => {
    setTab(r);
    setIdentificador(CONTAS_DEMO[r].email);
    setSenha("");
  };

  const submeter = async () => {
    if (enviando) return;
    if (!identificador.trim() || !senha.trim()) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    setEnviando(true);
    const r = await entrar(identificador.trim(), senha);
    setEnviando(false);
    if (r.ok) {
      toast.success("Bem-vindo(a) de volta!");
      router.push("/painel");
    }
  };

  const submeterCadastro = async () => {
    if (enviando) return;
    if (!nome.trim() || nome.trim().length < 3) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (!identificador.trim().includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (senha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmaSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setEnviando(true);
    const r = await registrar(nome.trim(), identificador.trim(), senha);
    setEnviando(false);
    if (r.ok) {
      toast.success("Conta criada com sucesso! Bem-vindo(a) ao BION.");
      router.push("/painel");
    }
  };

  return (
    <div className="min-h-screen bg-primary-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground">
              {modoCadastro ? "Criar sua conta" : "Acesse sua conta"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {modoCadastro
                ? "Cadastro gratuito para pacientes — comece em menos de 1 minuto."
                : "Autenticação com senha protegida por bcrypt."}
            </p>
          </div>

          {modoCadastro ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Nome completo
                </label>
                <input
                  aria-label="Nome completo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  E-mail
                </label>
                <input
                  aria-label="E-mail"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                  className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                    Senha
                  </label>
                  <input
                  aria-label="Senha"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                    Confirmar senha
                  </label>
                  <input
                  aria-label="Confirmar senha"
                    type="password"
                    value={confirmaSenha}
                    onChange={(e) => setConfirmaSenha(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl">
                {(["paciente", "medico", "admin"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => trocarAba(r)}
                    className={`py-2 rounded-xl text-xs font-bold capitalize transition ${
                      tab === r
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "medico" ? "Médico" : r === "admin" ? "Admin" : "Paciente"}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                    E-mail
                  </label>
                  <input
                  aria-label="E-mail"
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    placeholder="Seu e-mail"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                    Senha de Acesso
                  </label>
                  <input
                  aria-label="Senha de Acesso"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submeter()}
                    placeholder="Digite sua senha"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </>
          )}

          <button
            onClick={modoCadastro ? submeterCadastro : submeter}
            disabled={enviando}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition active:scale-[0.99] disabled:opacity-60"
          >
            {enviando
              ? "Aguarde..."
              : modoCadastro
                ? "Criar minha conta"
                : `Entrar como ${tab === "medico" ? "Médico" : tab === "admin" ? "Administrador" : "Paciente"}`}
          </button>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            {modoCadastro ? (
              <button
                onClick={() => {
                  setModoCadastro(false);
                  setSenha("");
                  setConfirmaSenha("");
                  setIdentificador(CONTAS_DEMO[tab].email);
                }}
                className="hover:text-primary transition font-medium"
              >
                ← Voltar para o login
              </button>
            ) : (
              <button
                onClick={() =>
                  toast.info("Recuperação de senha", {
                    description: "Contate o suporte BION pelo canal suporte@bion.app para redefinir sua senha.",
                  })
                }
                className="hover:text-primary transition font-medium"
              >
                Esqueci minha senha
              </button>
            )}
            {!modoCadastro && (
              <button
                onClick={() => {
                  setModoCadastro(true);
                  setIdentificador("");
                  setSenha("");
                }}
                className="hover:text-primary transition font-medium"
              >
                Criar nova conta
              </button>
            )}
          </div>

          {!modoCadastro && (
            <div className="pt-3 border-t space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                Contas de demonstração — senha: bion123
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["paciente", "marina.silva@email.com"],
                    ["medico", "ana.ribeiro@med.bion.app"],
                    ["admin", "admin@bion.app"],
                  ] as [Role, string][]
                ).map(([r, email]) => (
                  <button
                    key={r}
                    onClick={() => {
                      trocarAba(r);
                      setSenha("bion123");
                    }}
                    className="px-2 py-2 rounded-xl border text-[10px] font-bold text-muted-foreground hover:border-primary hover:text-primary transition truncate"
                    title={email}
                  >
                    {r === "medico" ? "Médica" : r === "admin" ? "Admin" : "Paciente"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground text-center">
            <Shield className="w-3.5 h-3.5 text-primary" /> Senhas protegidas com hash bcrypt e
            sessão em cookie httpOnly
          </div>
          <div className="text-center">
            <button
              onClick={() => router.push("/")}
              className="text-xs text-muted-foreground hover:text-primary transition font-medium"
            >
              ← Voltar para a página inicial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
