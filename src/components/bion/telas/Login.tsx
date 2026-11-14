"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Role } from "@/lib/rotas";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { Logo } from "@/components/bion/brand";
import { AceiteTermos } from "@/components/bion/AceiteTermos";
import { aceiteTermosPayload, ERRO_ACEITE_TERMOS } from "@/lib/aceite-termos";
import { useAppNativo } from "@/lib/useAppNativo";

// Só os e-mails das contas demo: a senha NUNCA vai para o bundle do cliente
// (repo público). Ela é definida no seed via SEED_DEMO_PASSWORD/SEED_ADMIN_PASSWORD.
const CONTAS_DEMO: Record<Role, { email: string }> = {
  paciente: { email: "marina.silva@email.com" },
  medico: { email: "ana.ribeiro@med.bion.app" },
  admin: { email: "admin@bion.app" },
};

/** Contas demo só em desenvolvimento ou com NEXT_PUBLIC_DEMO_LOGINS=1 */
const DEMO_HABILITADO =
  process.env.NEXT_PUBLIC_DEMO_LOGINS === "1" ||
  process.env.NODE_ENV === "development";

const CHAVE_RASCUNHO_CADASTRO = "bion-cadastro-rascunho";

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
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [aceitouMarketing, setAceitouMarketing] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);
  // No app de loja "/" volta direto para /entrar: o link da página inicial não leva a nada.
  const noApp = useAppNativo();

  // No app (WebView), tocar em "Termos de Uso" troca a página (não há nova aba) e,
  // ao voltar, o cadastro recomeçava do zero. Guardamos só modo, nome e e-mail
  // nesta aba (sessionStorage) — senha NUNCA é guardada.
  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem(CHAVE_RASCUNHO_CADASTRO);
      if (!bruto) return;
      const r = JSON.parse(bruto) as { nome?: unknown; email?: unknown };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restauração única do rascunho no cliente
      setModoCadastro(true);
      if (typeof r.nome === "string") setNome(r.nome);
      if (typeof r.email === "string") setIdentificador(r.email);
    } catch {
      /* sessionStorage indisponível ou rascunho inválido: segue vazio */
    }
  }, []);
  useEffect(() => {
    try {
      if (modoCadastro && (nome || identificador)) {
        sessionStorage.setItem(CHAVE_RASCUNHO_CADASTRO, JSON.stringify({ nome, email: identificador }));
      } else if (!modoCadastro) {
        sessionStorage.removeItem(CHAVE_RASCUNHO_CADASTRO);
      }
    } catch {
      /* sem sessionStorage: nada a guardar */
    }
  }, [modoCadastro, nome, identificador]);

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
      router.replace(r.role === "paciente" ? "/paciente" : r.role === "medico" ? "/medico" : "/painel");
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
    if (!aceitouTermos) {
      setFormErro(ERRO_ACEITE_TERMOS);
      toast.error(ERRO_ACEITE_TERMOS);
      return;
    }
    setFormErro(null);
    setEnviando(true);
    const r = await registrar(nome.trim(), identificador.trim(), senha, aceiteTermosPayload("PACIENTE", aceitouMarketing));
    setEnviando(false);
    if (r.ok) {
      try {
        sessionStorage.removeItem(CHAVE_RASCUNHO_CADASTRO);
      } catch {
        /* ignora */
      }
      toast.success("Conta criada com sucesso! Bem-vindo(a) ao BION.");
      router.replace(r.role === "paciente" ? "/paciente" : r.role === "medico" ? "/medico" : "/painel");
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
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"><div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px]" /><div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-accent/10 rounded-full blur-[80px]" /></div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-white">
              {modoCadastro ? "Criar sua conta" : "Acesse sua conta"}
            </h2>
            <p className="text-xs text-white/50 mt-1">
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
                    className="text-xs font-bold text-white/60 block mb-1"
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
                    className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="login-email-cadastro"
                    className="text-xs font-bold text-white/60 block mb-1"
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
                    className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                {/* Senhas lado a lado só a partir de sm: em 360px cada campo ficava
                    com ~140px e o aceite dos Termos caía numa coluna só (meia largura). */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="login-senha-cadastro"
                      className="text-xs font-bold text-white/60 block mb-1"
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
                      className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-confirma-senha"
                      className="text-xs font-bold text-white/60 block mb-1"
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
                      className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                  <AceiteTermos
                    perfil="PACIENTE"
                    aceitouTermos={aceitouTermos}
                    onAceitouTermos={setAceitouTermos}
                    aceitouMarketing={aceitouMarketing}
                    onAceitouMarketing={setAceitouMarketing}
                    disabled={enviando}
                  />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* As abas NÃO escolhem o papel do login (quem define é a
                    conta, no servidor): elas só preenchem o e-mail da conta
                    de demonstração. Por isso só aparecem com demo habilitado. */}
                {DEMO_HABILITADO && (
                <div
                  className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl"
                  role="tablist"
                  aria-label="Preencher com uma conta de demonstração"
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
                )}

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="text-xs font-bold text-white/60 block mb-1"
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
                      className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-senha"
                      className="text-xs font-bold text-white/60 block mb-1"
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
                      className="w-full px-4 py-3 rounded-2xl border border-white/10 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
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
              disabled={enviando || (modoCadastro && !aceitouTermos)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition active:scale-[0.99] disabled:opacity-60"
            >
              {enviando ? "Aguarde..." : modoCadastro ? "Criar minha conta" : "Entrar"}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs text-white/40 pt-1">
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
                className="inline-flex min-h-11 items-center hover:text-primary transition font-medium"
              >
                ← Voltar para o login
              </button>
            ) : (
              <a
                href="mailto:suporte@bion.app?subject=Redefini%C3%A7%C3%A3o%20de%20senha%20%E2%80%94%20BION"
                className="inline-flex min-h-11 items-center hover:text-primary transition font-medium"
              >
                Esqueci minha senha
              </a>
            )}
            {!modoCadastro && (
              <button
                type="button"
                onClick={() => {
                  setModoCadastro(true);
                  setIdentificador("");
                  setSenha("");
                }}
                className="inline-flex min-h-11 items-center hover:text-primary transition font-medium"
              >
                Criar nova conta
              </button>
            )}
          </div>

          {!modoCadastro && (
            <p className="text-xs text-white/40 leading-relaxed">
              Esqueceu a senha? Ainda não há redefinição automática: toque em{" "}
              <strong>“Esqueci minha senha”</strong> para escrever ao suporte (
              <span className="font-medium">suporte@bion.app</span>) — a equipe confirma sua
              identidade e orienta a redefinição. Se você já está logado em outro aparelho,
              troque direto em <strong>Privacidade → Segurança da conta</strong>.
            </p>
          )}

          {!modoCadastro && DEMO_HABILITADO && (
            <div className="pt-3 border-t space-y-2">
              <div className="text-xs font-bold text-white/40 uppercase tracking-wider text-center">
                Contas de demonstração (ambiente de testes)
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
                    onClick={() => trocarAba(r)}
                    className="px-2 py-2 rounded-xl border text-xs font-bold text-white/50 hover:border-primary hover:text-primary transition truncate"
                    title={email}
                  >
                    {r === "medico" ? "Médica" : r === "admin" ? "Admin" : "Paciente"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-white/40 text-center">
            <Shield className="w-3.5 h-3.5 text-primary shrink-0" /> Conexão segura e
            criptografada para proteger seus dados de saúde
          </div>
          {!noApp && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex min-h-11 items-center text-xs text-white/40 hover:text-primary transition font-medium"
            >
              ← Voltar para a página inicial
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
