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
import { destinoDepoisDeEntrar } from "@/lib/agendar-publico";
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

/* ============================================================
   Login BION — tela imersiva com as três zonas da marca em
   auroras (âmbar · verde · malva) sobre o roxo profundo
   #1D152D, cartão de vidro e abas de demonstração que vestem
   a cor de cada papel. CSS puro, sem novas dependências.
   ============================================================ */
const LG_CSS = `
.lg-tela{position:relative;min-height:100dvh;overflow:hidden;display:flex;
  align-items:center;justify-content:center;padding:1rem;
  background:linear-gradient(165deg,#150F26 0%,#1D152D 48%,#2A1F42 100%)}
.lg-aura{position:absolute;border-radius:9999px;filter:blur(90px);pointer-events:none;
  animation:lg-deriva 26s ease-in-out infinite alternate;will-change:transform}
@keyframes lg-deriva{
  0%{transform:translate(0,0) scale(1)}
  45%{transform:translate(40px,-32px) scale(1.12)}
  100%{transform:translate(-32px,24px) scale(.94)}}
.lg-grade{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,193,105,.06) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,193,105,.06) 1px,transparent 1px);
  background-size:54px 54px;
  -webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 25%,transparent 75%);
  mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 25%,transparent 75%)}
.lg-selo{display:inline-flex;align-items:center;justify-content:center;
  width:5.5rem;height:5.5rem;border-radius:1.75rem;
  background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(14px);
  backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.65);
  box-shadow:0 18px 44px -16px rgba(0,0,0,.55);
  animation:lg-surgir .6s cubic-bezier(.22,1,.36,1) both}
.lg-cartao{background:rgba(255,255,255,.9);-webkit-backdrop-filter:blur(24px) saturate(1.5);
  backdrop-filter:blur(24px) saturate(1.5);border:1px solid rgba(255,255,255,.6);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 32px 72px -28px rgba(10,6,20,.6);
  animation:lg-surgir .6s cubic-bezier(.22,1,.36,1) .08s both}
.dark .lg-cartao{background:rgba(22,16,34,.78);border-color:rgba(255,255,255,.12);
  box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 32px 72px -28px rgba(0,0,0,.75)}
@keyframes lg-surgir{from{opacity:0;transform:translateY(18px) scale(.98)}
  to{opacity:1;transform:none}}
.lg-entrar{background:linear-gradient(135deg,#FFC46B 0%,#F0A32E 100%);color:#2B1A05;
  box-shadow:0 12px 28px -10px rgba(200,146,54,.55);transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease}
.lg-entrar:hover:not(:disabled){transform:translateY(-1px);
  box-shadow:0 18px 36px -12px rgba(200,146,54,.6)}
.lg-entrar:active:not(:disabled){transform:scale(.99)}
.lg-entrar:disabled{opacity:.55}
@media (prefers-reduced-motion:reduce){
  .lg-aura,.lg-selo,.lg-cartao{animation:none!important}
}
`;

/* Abas de demonstração: cada papel veste a cor da sua zona no app. */
const COR_ZONA: Record<Role, string> = {
  paciente: "bg-[#FFC46B] text-[#2B1A05]",
  medico: "bg-[#7FD3A8] text-[#0A1B12]",
  admin: "bg-[#D4B3E3] text-[#241633]",
};

export function Login({
  comecarNoCadastro = false,
  voltar = null,
}: {
  /** Vindo do Agendar do perfil público: o cadastro abre primeiro. */
  comecarNoCadastro?: boolean;
  /** Só a agenda /p/[id]/agendar. Outro valor é ignorado. */
  voltar?: string | null;
}) {
  const router = useRouter();
  const { entrar, registrar } = useBion();
  const [tab, setTab] = useState<Role>("paciente");
  const [identificador, setIdentificador] = useState(
    DEMO_HABILITADO ? CONTAS_DEMO.paciente.email : "",
  );
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modoCadastro, setModoCadastro] = useState(comecarNoCadastro);
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
      router.replace(destinoDepoisDeEntrar(r.role, voltar));
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
      router.replace(destinoDepoisDeEntrar(r.role, voltar));
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
    <div className="lg-tela">
      <style>{LG_CSS}</style>
      {/* auroras das três zonas */}
      <div className="lg-aura" aria-hidden style={{ width: 480, height: 480, left: "-12%", top: "-18%", background: "radial-gradient(circle at 40% 40%, rgba(255,177,92,.5), transparent 66%)", animationDuration: "24s" }} />
      <div className="lg-aura" aria-hidden style={{ width: 420, height: 420, right: "-10%", top: "-6%", background: "radial-gradient(circle at 55% 45%, rgba(70,155,114,.45), transparent 68%)", animationDuration: "30s", animationDelay: "-8s" }} />
      <div className="lg-aura" aria-hidden style={{ width: 380, height: 380, right: "14%", bottom: "-20%", background: "radial-gradient(circle at 50% 50%, rgba(212,179,227,.42), transparent 70%)", animationDuration: "20s", animationDelay: "-14s" }} />
      <div className="lg-grade" aria-hidden />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <span className="lg-selo">
            <Logo size="md" />
          </span>
        </div>

        <div className="lg-cartao rounded-3xl p-6 md:p-8 space-y-6">
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
                {/* Senhas lado a lado só a partir de sm: em 360px cada campo ficava
                    com ~140px e o aceite dos Termos caía numa coluna só (meia largura). */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          ? `${COR_ZONA[r]} shadow-sm`
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
              disabled={enviando || (modoCadastro && !aceitouTermos)}
              className="lg-entrar w-full py-4 rounded-2xl font-bold text-sm transition active:scale-[0.99] disabled:opacity-60"
            >
              {enviando ? "Aguarde..." : modoCadastro ? "Criar minha conta" : "Entrar"}
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
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esqueceu a senha? Ainda não há redefinição automática: toque em{" "}
              <strong>“Esqueci minha senha”</strong> para escrever ao suporte (
              <span className="font-medium">suporte@bion.app</span>) — a equipe confirma sua
              identidade e orienta a redefinição. Se você já está logado em outro aparelho,
              troque direto em <strong>Privacidade → Segurança da conta</strong>.
            </p>
          )}

          {!modoCadastro && DEMO_HABILITADO && (
            <div className="pt-3 border-t space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
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
          {!noApp && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-primary transition font-medium"
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
