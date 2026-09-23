"use client";

import { useState } from "react";
import { Shield, FileText, Check, X, User, Stethoscope, Lock, Clock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";

export function PrivacidadePaciente() {
  const { pacientePerfil, documentosVisiveis, consentimentosVisiveis, consultas, sessao, trocarSenha } =
    useBion();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [trocando, setTrocando] = useState(false);

  const minhasConsultas = consultas.filter((c) => c.paciente === sessao.nome);
  const medicosVinculados = Array.from(new Set(minhasConsultas.map((c) => c.medico)));

  const dadosColetados = [
    { rotulo: "Identificação", valor: `${pacientePerfil.nome} • CPF ${pacientePerfil.cpf}` },
    { rotulo: "Contato", valor: `${pacientePerfil.email} • ${pacientePerfil.telefone}` },
    { rotulo: "Perfil", valor: `${pacientePerfil.idade} anos • ${pacientePerfil.genero}` },
    { rotulo: "Convênio", valor: pacientePerfil.convenio },
    {
      rotulo: "Dados de saúde",
      valor: `Tipo sanguíneo ${pacientePerfil.tipoSanguineo}, ${pacientePerfil.alergias.length} alergias, ${pacientePerfil.medicamentos.length} medicamentos em uso`,
    },
    {
      rotulo: "Histórico clínico",
      valor: `${minhasConsultas.length} consultas e ${documentosVisiveis.length} documentos médicos`,
    },
  ];

  const submeterSenha = async () => {
    if (trocando) return;
    if (!senhaAtual || !novaSenha) {
      toast.error("Preencha a senha atual e a nova senha.");
      return;
    }
    if (novaSenha.length < 8 || !/[A-Za-z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      toast.error("A nova senha deve ter 8+ caracteres, com letras e números.");
      return;
    }
    setTrocando(true);
    const r = await trocarSenha(senhaAtual, novaSenha);
    setTrocando(false);
    if (r.ok) {
      toast.success("Senha alterada com sucesso.");
      setSenhaAtual("");
      setNovaSenha("");
    } else if (r.erro) {
      toast.error(r.erro);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Shield className="w-7 h-7 text-primary" /> Privacidade dos meus dados
        </h1>
        <p className="text-muted-foreground mt-1">
          Veja tudo o que o BION guarda sobre você, quem pode acessar e quais autorizações você já
          deu.
        </p>
      </div>

      <section className="bg-card border rounded-3xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <User className="w-4 h-4 text-primary" /> Dados coletados
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {dadosColetados.map((d) => (
            <div key={d.rotulo} className="bg-muted/60 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {d.rotulo}
              </div>
              <div className="text-sm font-semibold mt-1 break-words">{d.valor}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card border rounded-3xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-primary" /> Quem pode ver seus documentos
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2 items-start">
            <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
            Você vê 100% das suas receitas, atestados e exames.
          </li>
          <li className="flex gap-2 items-start">
            <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
            Cada médico vê apenas os documentos das consultas que atendeu com você.
          </li>
          <li className="flex gap-2 items-start">
            <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            A administração não tem acesso ao conteúdo clínico, apenas a dados de gestão.
          </li>
          <li className="flex gap-2 items-start">
            <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            Todo download do prontuário exige sua autorização e fica registrado.
          </li>
        </ul>
        {medicosVinculados.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {medicosVinculados.map((m) => (
              <span
                key={m}
                className="px-3 py-1.5 rounded-full bg-primary-soft text-primary text-xs font-bold"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card border rounded-3xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Consentimentos registrados
        </h2>
        {consentimentosVisiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não autorizou nenhum download do prontuário. Quando isso acontecer, o
            registro aparece aqui.
          </p>
        ) : (
          <div className="space-y-2">
            {consentimentosVisiveis.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 bg-muted/60 rounded-2xl p-4 flex-wrap"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    c.aceito
                      ? "bg-accent-soft text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {c.aceito ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-bold">{c.finalidade}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3" /> {c.quando} • {c.quem} ({c.perfil}) •{" "}
                    {c.documentos} documentos
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    c.aceito ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                  }`}
                >
                  {c.aceito ? "Autorizado" : "Recusado"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card border rounded-3xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" /> Segurança da conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Troque sua senha periodicamente. Ao confirmar, outras sessões abertas com esta conta são
          encerradas automaticamente.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            autoComplete="current-password"
            placeholder="Senha atual"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            autoComplete="new-password"
            placeholder="Nova senha (8+ caracteres)"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          type="button"
          onClick={() => void submeterSenha()}
          disabled={trocando}
          className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {trocando ? "Salvando..." : "Alterar senha"}
        </button>
      </section>
    </div>
  );
}
