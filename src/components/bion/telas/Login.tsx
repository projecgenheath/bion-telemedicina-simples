"use client";
import { useState, type FormEvent } from "react";
import type { Role } from "@/lib/rotas";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { Logo } from "@/components/bion/brand";

const CONTAS_DEMO: Record<Role, { email: string; senha: string }> = {
  paciente: { email: "marina.silva@email.com", senha: "bion123456" },
  medico: { email: "ana.ribeiro@med.bion.app", senha: "bion123456" },
  admin: { email: "admin@bion.app", senha: "bion123456" },
};

/** Contas demo só em desenvolvimento ou com NEXT_PUBLIC_DEMO_LOGINS=1 */
const DEMO_HABILITADO =
  process.env.NEXT_PUBLIC_DEMO_LOGINS === "1" ||
  process.env.NODE_ENV === "development";

export function Login() {
  const router = useRouter();
  const { entrar, registrar } = useBion();
  const [tab, setTab] = useState<Role>("paciente");
  const [identificador, setIdentificador] = useState(
    DEMO_HABILITADO ? CONTAS_DEMO.paciente.email : "",
  );
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [formErro, setFormErro] = useState<string | null>(null);

  const trocarAba = (r: Role) => {
    setTab(r);
    if (DEMO_HABILITADO) {
      setIdentificador(CONTAS_DEMO[r].email);
    }
    setSenha("");
  };

  const submeter = async () => {
    if (enviando) return;
    if (!identificador.trim() || !senha.trim()) {
      const msg = "Preencha e-mail e senha.";
      setFormErro(msg);
      toast.error(msg);
      return;
    }
    setFormErro(null);
    setEnviando(true);
    const r = await entrar(identificador.trim(), senha);
    setEnviando(false);
    if (r.ok) {
      toast.success("Bem-vindo(a) de volta!");
      router.replace(r.role === "paciente" ? "/paciente" : "/painel");
    } else {
      setFormErro("Não foi possível entrar. Verifique e-mail e senha.");
    }
  };

  const submeterCadastro = async () => {
    if (enviando) return;
    if (!nome.trim() || nome.trim().length < 3) {
      const msg = "Informe seu nome completo.";
      setFormErro(msg);
      toast.error(msg);
      return;
    }
    if (!identificador.trim().includes("@")) {
      const msg = "Informe um e-mail válido.";
      setFormErro(msg);
      toast.error(msg);
      return;
    }
    if (senha.length < 10) {
      const msg = "A senha deve ter pelo menos 10 caracteres.";
      setFormErro(msg);
      toast.error(msg);
      return;
    }
    if (senha !== confirmaSenha) {
      const msg = "As senhas não coincidem.";
      setFormErro(msg);
      toast.error(msg);
      return;
    }
    setFormErro(null);
    setEnviando(true);
    const r = await registrar(nome.trim(), identificador.trim(), senha);
    setEnviando(false);
    if (r.ok) {
      toast.success("Conta criada com sucesso! Bem-vindo(a) ao BION.");
      router.replace(r.role === "paciente" ? "/paciente" : "/painel");
    } else {
      setFormErro("Não foi possível criar a conta. Tente novamente.");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (modoCadastro) void submeterCadastro();
    else void submeter();
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
                : "Acesse suas consultas, receitas e prontuário em um só lugar."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {modoCadastro ? (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="login-nome"
                    className="text-xs font-bold text-muted-foreground block mb-1"
                  >
                    Nome completo
                  </label>
                  <input
                    id="login-nome"
                    name="name"
                    autoComplete="name"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="login-email-cadastro"
                    className="text-xs font-bold text-muted-foreground block mb-1"
                  >
                    E-mail
                  </label>
                  <input
                    id="login-email-cadastro"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="login-senha-cadastro"
                      className="text-xs font-bold text-muted-foreground block mb-1"
                    >
                      Senha
                    </label>
                    <input
                      id="login-senha-cadastro"
                      name="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 10 caracteres"
                      className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-confirma-senha"
                      className="text-xs font-bold text-muted-foreground block mb-1"
                    >
                      Confirmar senha
                    </label>
                    <input
                      id="login-confirma-senha"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
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
                <div
                  className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl"
                  role="tablist"
                  aria-label="Tipo de conta"
                >
                  {(["paciente", "medico", "admin"] as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={tab === r}
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
                    <label
                      htmlFor="login-email"
                      className="text-xs font-bold text-muted-foreground block mb-1"
                    >
                      E-mail
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      placeholder="Seu e-mail"
                      className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-senha"
                      className="text-xs font-bold text-muted-foreground block mb-1"
                    >
                      Senha de Acesso
                    </label>
                    <input
                      id="login-senha"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Digite sua senha"
                      className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </>
            )}

            {formErro && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive"
              >
                {formErro}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition active:scale-[0.99] disabled:opacity-60"
            >
              {enviando
                ? "Aguarde..."
                : modoCadastro
                  ? "Criar minha conta"
                  : `Entrar como ${tab === "medico" ? "Médico" : tab === "admin" ? "Administrador" : "Paciente"}`}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            {modoCadastro ? (
              <button
                type="button"
                onClick={() => {
                  setModoCadastro(false);
                  setSenha("");
                  setConfirmaSenha("");
                  setIdentificador(
                    DEMO_HABILITADO ? CONTAS_DEMO[tab].email : "",
                  );
                }}
                className="hover:text-primary transition font-medium"
              >
                ← Voltar para o login
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  toast.info("Recuperação de senha", {
                    description:
                      "Contate o suporte BION pelo canal suporte@bion.app para redefinir sua senha.",
                  })
                }
                className="hover:text-primary transition font-medium"
              >
                Esqueci minha senha
              </button>
            )}
            {!modoCadastro && (
              <button
                type="button"
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

          {!modoCadastro && DEMO_HABILITADO && (
            <div className="pt-3 border-t space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                Contas de demonstração — senha: bion123456
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
                    type="button"
                    onClick={() => {
                      trocarAba(r);
                      setSenha("bion123456");
                    }}
                    className="px-2 py-2 rounded-xl border text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary transition truncate"
                    title={email}
                  >
                    {r === "medico" ? "Médica" : r === "admin" ? "Admin" : "Paciente"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground text-center">
            <Shield className="w-3.5 h-3.5 text-primary shrink-0" /> Conexão segura e
            criptografada para proteger seus dados de saúde
          </div>
          <div className="text-center">
            <button
              type="button"
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
