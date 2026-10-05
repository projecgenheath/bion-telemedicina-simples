"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import type { PacienteRegistro } from "@/lib/bion-store";
import { hojeIsoSaoPaulo, idadeDeNascimento } from "@/lib/idade";
import { Campo, CredenciaisCard, propsCampo } from "../ui/Formulario";
import { useAcoesPaciente, type Credenciais } from "./acoes";
import {
  FORM_PACIENTE_VAZIO,
  corpoCadastroPaciente,
  corpoEdicaoPaciente,
  formDoPaciente,
  validarFormPaciente,
  type FormPaciente,
} from "./pacientes";

/** Cadastro ou edição de paciente. Erro do servidor (CPF, telefone, e-mail duplicado) mantém o formulário aberto. */
export function FormularioPaciente({
  paciente,
  onCancelar,
  onSalvo,
  onSujo,
}: {
  paciente?: PacienteRegistro;
  onCancelar: () => void;
  onSalvo: () => void;
  onSujo: (sujo: boolean) => void;
}) {
  const cadastro = !paciente;
  const { criar, salvar } = useAcoesPaciente();
  const [form, setForm] = useState<FormPaciente>(() => (paciente ? formDoPaciente(paciente) : { ...FORM_PACIENTE_VAZIO }));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const erros = useMemo(() => validarFormPaciente(form, cadastro), [form, cadastro]);
  const temErro = Object.keys(erros).length > 0;
  const hoje = hojeIsoSaoPaulo();

  const mudar = <K extends keyof FormPaciente>(k: K, v: FormPaciente[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    onSujo(true);
    setErro(null);
  };

  const enviar = async () => {
    if (temErro || enviando) return;
    setEnviando(true);
    setErro(null);
    if (cadastro) {
      const r = await criar(corpoCadastroPaciente(form));
      setEnviando(false);
      if (!r.ok) return setErro(r.erro);
      onSujo(false);
      if (r.credenciais) setCredenciais(r.credenciais);
      else onSalvo();
      return;
    }
    const corpo = corpoEdicaoPaciente(paciente, form);
    if (!corpo) {
      setEnviando(false);
      onCancelar();
      return;
    }
    const r = await salvar(paciente, corpo);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onSujo(false);
    onSalvo();
  };

  if (credenciais) {
    return (
      <div className="space-y-4">
        <CredenciaisCard email={credenciais.email} senha={credenciais.senhaTemporaria} quem={form.nome.trim() || "o paciente"} />
        <button type="button" onClick={onSalvo} className="ba-botao ba-botao-primario w-full">
          Ir para a lista
        </button>
      </div>
    );
  }

  const texto = (k: "nome" | "email" | "telefone" | "cpf" | "convenio" | "genero", rotulo: string, extra?: { tipo?: string; dica?: string; desligado?: boolean; auto?: string }) => (
    <Campo id={`pac-${k}`} rotulo={rotulo} erro={erros[k]} dica={extra?.dica}>
      <input
        {...propsCampo(`pac-${k}`, erros[k], Boolean(extra?.dica))}
        type={extra?.tipo ?? "text"}
        value={form[k]}
        disabled={extra?.desligado}
        autoComplete={extra?.auto}
        onChange={(e) => mudar(k, e.target.value)}
        className="ba-entrada disabled:opacity-60"
      />
    </Campo>
  );

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {texto("nome", "Nome completo", { auto: "name" })}
        {texto("email", "E-mail (login)", cadastro ? { tipo: "email", auto: "email", dica: "A senha temporária aparece no fim, uma única vez." } : { desligado: true, dica: "O e-mail de login não muda por aqui." })}
        {texto("telefone", "Telefone", { tipo: "tel", auto: "tel", dica: "Com DDD." })}
        {texto("cpf", "CPF")}
        {texto("convenio", "Convênio")}
        {texto("genero", "Gênero")}
        <Campo id="pac-nasc" rotulo="Data de nascimento (opcional)">
          <input id="pac-nasc" type="date" max={hoje} value={form.dataNascimento} onChange={(e) => mudar("dataNascimento", e.target.value)} className="ba-entrada" />
        </Campo>
        <Campo id="pac-idade" rotulo={form.dataNascimento ? "Idade (pela data de nascimento)" : "Idade"} erro={erros.idade}>
          {form.dataNascimento ? (
            <input id="pac-idade" type="number" readOnly value={idadeDeNascimento(form.dataNascimento) ?? ""} className="ba-entrada opacity-70" />
          ) : (
            <input {...propsCampo("pac-idade", erros.idade)} type="number" min={0} max={130} value={form.idade} onChange={(e) => mudar("idade", Number(e.target.value) || 0)} className="ba-entrada" />
          )}
        </Campo>
        <Campo id="pac-status" rotulo="Situação da conta" dica={form.status === "inativo" ? "Conta inativa não consegue entrar no app." : undefined}>
          <select id="pac-status" value={form.status} onChange={(e) => mudar("status", e.target.value as FormPaciente["status"])} className="ba-entrada">
            <option value="ativo">Ativa</option>
            <option value="inativo">Inativa</option>
          </select>
        </Campo>
      </div>
      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="ba-botao ba-botao-secundario">
          Cancelar
        </button>
        <button type="button" onClick={() => void enviar()} disabled={temErro || enviando} className="ba-botao ba-botao-primario flex-1">
          <Save className="w-4 h-4" aria-hidden /> {enviando ? "Salvando…" : cadastro ? "Cadastrar paciente" : "Salvar alteração"}
        </button>
      </div>
    </div>
  );
}
