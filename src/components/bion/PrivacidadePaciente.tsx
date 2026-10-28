"use client";

import { useEffect, useState } from "react";
import { Shield, FileText, Check, X, User, Stethoscope, Lock, Clock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { apiSaude } from "./paciente/api-saude";
import { useRecarregarEstado } from "./paciente/useRemarcacaoComMulta";
import { fmtTicketData } from "@/lib/bion-tipos";
import type { EstadoConsentimentoIaExame } from "@/lib/consentimento-ia-exame";

export function PrivacidadePaciente() {
  const { pacientePerfil, documentosVisiveis, consentimentosVisiveis, consultas, sessao, trocarSenha } =
    useBion();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [trocando, setTrocando] = useState(false);
  // Contagem vem da lista MedicamentoEmUso (ativos). Enquanto não carrega
  // (ou se falhar), cai no campo antigo do perfil.
  const [ativosLista, setAtivosLista] = useState<number | null>(null);
  useEffect(() => {
    if (sessao.role !== "paciente") return;
    let vivo = true;
    void apiSaude<{ medicamentos: { ativo: boolean }[] }>("/api/paciente/medicamentos", undefined, true).then((d) => {
      if (vivo && d?.medicamentos) setAtivosLista(d.medicamentos.filter((m) => m.ativo).length);
    });
    return () => {
      vivo = false;
    };
  }, [sessao.role]);
  const qtdMedicamentos = ativosLista ?? pacientePerfil.medicamentos.length;

  // Consentimento da leitura de laudo pela BION IA (LGPD art. 8º, § 5º).
  const recarregarEstado = useRecarregarEstado();
  const [consIa, setConsIa] = useState<{ estado: EstadoConsentimentoIaExame; em: string | null } | null>(null);
  const [revogando, setRevogando] = useState(false);
  useEffect(() => {
    if (sessao.role !== "paciente") return;
    let vivo = true;
    fetch("/api/paciente/consentimento-ia-exame")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { estado: EstadoConsentimentoIaExame; em: string | null } | null) => vivo && j && setConsIa(j))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [sessao.role]);
  const revogarConsIa = async () => {
    if (revogando) return;
    setRevogando(true);
    try {
      const r = await fetch("/api/paciente/consentimento-ia-exame", { method: "DELETE" });
      if (!r.ok) throw new Error(String(r.status));
      setConsIa((await r.json()) as { estado: EstadoConsentimentoIaExame; em: string | null });
      toast.success("Consentimento revogado. No próximo envio de laudo, a BION vai pedir sua autorização de novo.");
      void recarregarEstado();
    } catch {
      toast.error("Não foi possível revogar agora. Tente novamente.");
    } finally {
      setRevogando(false);
    }
  };

  // Opt-in de marketing: desligar/religar com um clique (cada troca = nova linha).
  const [mkt, setMkt] = useState<{ ativo: boolean; em: string | null } | null>(null);
  const [salvandoMkt, setSalvandoMkt] = useState(false);
  useEffect(() => {
    if (sessao.role !== "paciente") return;
    let vivo = true;
    fetch("/api/paciente/marketing")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ativo: boolean; em: string | null } | null) => vivo && j && setMkt(j))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [sessao.role]);
  const alternarMkt = async () => {
    if (salvandoMkt || !mkt) return;
    const novo = !mkt.ativo;
    setSalvandoMkt(true);
    try {
      const r = await fetch("/api/paciente/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceito: novo }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setMkt((await r.json()) as { ativo: boolean; em: string | null });
      toast.success(novo ? "Pronto, você vai receber novidades e ofertas da BION." : "Pronto, você não vai mais receber novidades e ofertas.");
    } catch {
      toast.error("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSalvandoMkt(false);
    }
  };

  const minhasConsultas = consultas.filter((c) => c.paciente === sessao.nome);
  const medicosVinculados = Array.from(new Set(minhasConsultas.map((c) => c.medico)));

  const dadosColetados = [
    { rotulo: "Identificação", valor: `${pacientePerfil.nome} • CPF ${pacientePerfil.cpf}` },
    { rotulo: "Contato", valor: `${pacientePerfil.email} • ${pacientePerfil.telefone}` },
    { rotulo: "Perfil", valor: `${pacientePerfil.idade} anos • ${pacientePerfil.genero}` },
    { rotulo: "Convênio", valor: pacientePerfil.convenio },
    {
      rotulo: "Dados de saúde",
      valor: `Tipo sanguíneo ${pacientePerfil.tipoSanguineo}, ${pacientePerfil.alergias.length} alergias, ${qtdMedicamentos} medicamentos em uso`,
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
              <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
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
            O médico que atende você vê todo o seu histórico clínico na BION, inclusive o que foi feito com outros médicos: exames, evoluções, triagens e documentos. Assim ele não precisa pedir tudo de novo. Médicos sem consulta com você não veem nada.
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

      {sessao.role === "paciente" ? (
        <section className="bg-card border rounded-3xl p-6 space-y-3" aria-labelledby="titulo-mkt">
          <h2 id="titulo-mkt" className="font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Novidades e ofertas
          </h2>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Receber novidades e ofertas da BION por e-mail, push e WhatsApp.</p>
            <button
              type="button"
              role="switch"
              aria-checked={!!mkt?.ativo}
              aria-labelledby="titulo-mkt"
              disabled={mkt === null || salvandoMkt}
              onClick={() => void alternarMkt()}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${mkt?.ativo ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${mkt?.ativo ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {mkt === null
              ? "Carregando…"
              : mkt.ativo
                ? "Ativado. Você pode desligar quando quiser."
                : "Desativado. A BION não envia novidades nem ofertas para você."}
          </p>
        </section>
      ) : null}

      {sessao.role === "paciente" ? (
        <section className="bg-card border rounded-3xl p-6 space-y-3" aria-labelledby="titulo-cons-ia">
          <h2 id="titulo-cons-ia" className="font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Leitura de laudos pela BION IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Quando você envia um laudo, o arquivo inteiro, com o seu nome e os dados impressos nele, vai para a
            NVIDIA (EUA) para leitura, e ela pode guardá-lo conforme os termos dela. A BION pede sua autorização a cada envio.
          </p>
          <p className="text-sm" aria-live="polite">
            {consIa === null
              ? "Carregando…"
              : consIa.estado === "ativo"
                ? `Autorizado no último envio${consIa.em ? ` (${fmtTicketData(consIa.em)}, horário de Brasília)` : ""}.`
                : consIa.estado === "revogado"
                  ? `Revogado${consIa.em ? ` em ${fmtTicketData(consIa.em)} (horário de Brasília)` : ""}. O próximo envio vai pedir sua autorização.`
                  : "Você ainda não autorizou nenhum envio."}
          </p>
          {consIa?.estado === "ativo" ? (
            <button
              type="button"
              onClick={() => void revogarConsIa()}
              disabled={revogando}
              className="min-h-11 px-4 rounded-full border-2 border-red-600/40 text-red-700 dark:text-red-300 text-sm font-bold disabled:opacity-50"
            >
              {revogando ? "Revogando…" : "Revogar consentimento"}
            </button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Revogar não apaga os resultados que já foram importados. Arquivos já lidos pela NVIDIA seguem os termos da
            NVIDIA.
          </p>
        </section>
      ) : null}

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
                      ? "bg-accent-soft text-emerald-800 dark:text-emerald-200"
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
                  className={`text-xs font-black uppercase tracking-widest ${
                    c.aceito ? "text-emerald-700 dark:text-emerald-200" : "text-destructive"
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
            aria-label="Senha atual"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            autoComplete="new-password"
            placeholder="Nova senha (8+ caracteres)"
            aria-label="Nova senha (8+ caracteres)"
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
