"use client";

import { useMemo, useState } from "react";
import { Save, Stethoscope } from "lucide-react";
import type { Medico } from "@/lib/bion-store";
import { Campo, CredenciaisCard, propsCampo } from "../ui/Formulario";
import {
  FORM_VAZIO,
  formDoMedico,
  corpoCadastro,
  corpoEdicaoMedico,
  horarioVedado,
  normalizarHorarios,
  validarFormMedico,
  type FormMedico,
} from "./medicos";
import { useAcoesMedico, type Credenciais } from "./acoes";

const GRADE_SUGESTAO = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

/**
 * Cadastro (3 passos) ou edição de médico. No cadastro, as credenciais
 * temporárias aparecem no último passo (uma única vez). Status de conta
 * (aprovar/suspender) NÃO entra aqui — é ação própria.
 */
export function FormularioMedico({
  medico,
  onCancelar,
  onSalvo,
  onSujo,
}: {
  medico?: Medico;
  onCancelar: () => void;
  onSalvo: (id?: string) => void;
  onSujo: (sujo: boolean) => void;
}) {
  const cadastro = !medico;
  const { criar, salvar } = useAcoesMedico();
  const [form, setForm] = useState<FormMedico>(() => (medico ? formDoMedico(medico) : { ...FORM_VAZIO }));
  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  const mudar = <K extends keyof FormMedico>(k: K, v: FormMedico[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    onSujo(true);
    setErro(null);
  };
  const erros = useMemo(() => validarFormMedico(form, cadastro), [form, cadastro]);
  const temErro = Object.keys(erros).length > 0;

  const [outro, setOutro] = useState("");
  const opcoes = useMemo(
    () => normalizarHorarios([...GRADE_SUGESTAO, ...form.horarios, ...(medico?.horariosDisponiveis ?? [])]),
    [form.horarios, medico],
  );
  const toggleHorario = (h: string) => {
    // Horário vedado só pode SAIR da grade (cadastro antigo), nunca entrar.
    if (horarioVedado(h) && !form.horarios.includes(h)) return;
    mudar(
      "horarios",
      form.horarios.includes(h) ? form.horarios.filter((x) => x !== h) : normalizarHorarios([...form.horarios, h]),
    );
  };

  const enviar = async () => {
    if (temErro || enviando) return;
    setEnviando(true);
    setErro(null);
    if (cadastro) {
      const r = await criar(corpoCadastro(form));
      setEnviando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onSujo(false);
      if (r.credenciais) {
        setCredenciais(r.credenciais);
        setPasso(3);
      } else onSalvo();
    } else {
      const corpo = corpoEdicaoMedico(medico, form);
      if (!corpo) {
        setEnviando(false);
        onCancelar();
        return;
      }
      const r = await salvar(medico, corpo);
      setEnviando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onSujo(false);
      onSalvo(medico.id);
    }
  };

  if (credenciais) {
    return (
      <div className="space-y-4">
        <CredenciaisCard email={credenciais.email} senha={credenciais.senhaTemporaria} quem={form.nome.trim() || "o médico"} />
        <button type="button" onClick={() => onSalvo()} className="ba-botao ba-botao-primario w-full">
          Ir para a lista
        </button>
      </div>
    );
  }

  const passos = cadastro
    ? [
        { id: 0, rotulo: "Identificação" },
        { id: 1, rotulo: "Profissional" },
        { id: 2, rotulo: "Revisão" },
      ]
    : [{ id: 0, rotulo: "Dados" }];

  return (
    <div className="space-y-4">
      {cadastro ? (
        <div className="ba-passos" aria-label="Passos do cadastro">
          {passos.map((p) => (
            <span key={p.id} className="ba-passo" data-estado={passo > p.id ? "feito" : passo === p.id ? "atual" : undefined}>
              {p.rotulo}
            </span>
          ))}
        </div>
      ) : null}

      {(passo === 0 || !cadastro) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo id="med-nome" rotulo="Nome" erro={erros.nome}>
            <input {...propsCampo("med-nome", erros.nome)} value={form.nome} onChange={(e) => mudar("nome", e.target.value)} className="ba-entrada" autoComplete="name" />
          </Campo>
          {cadastro ? (
            <Campo id="med-email" rotulo="E-mail (opcional)" erro={erros.email} dica="Sem e-mail, o servidor gera um login. A senha temporária aparece no fim.">
              <input {...propsCampo("med-email", erros.email, true)} type="email" value={form.email} onChange={(e) => mudar("email", e.target.value)} className="ba-entrada" autoComplete="email" />
            </Campo>
          ) : null}
          <Campo id="med-crm" rotulo="CRM" erro={erros.crm}>
            <input {...propsCampo("med-crm", erros.crm)} value={form.crm} onChange={(e) => mudar("crm", e.target.value)} className="ba-entrada" />
          </Campo>
          <Campo id="med-esp" rotulo="Especialidade" erro={erros.especialidade}>
            <input {...propsCampo("med-esp", erros.especialidade)} value={form.especialidade} onChange={(e) => mudar("especialidade", e.target.value)} className="ba-entrada" />
          </Campo>
          {cadastro ? (
            <Campo id="med-status" rotulo="Começa como" dica="Em validação: aparece na fila. Ativo: já pode atender.">
              <select id="med-status" value={form.status} onChange={(e) => mudar("status", e.target.value as FormMedico["status"])} className="ba-entrada">
                <option value="pendente">Em validação</option>
                <option value="ativo">Já ativo</option>
              </select>
            </Campo>
          ) : null}
        </div>
      )}

      {(passo === 1 || !cadastro) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo id="med-valor" rotulo="Valor da consulta (R$)" erro={erros.valor}>
            <input {...propsCampo("med-valor", erros.valor)} type="number" min={1} max={5000} step={1} value={form.valor} onChange={(e) => mudar("valor", e.target.value)} className="ba-entrada" />
          </Campo>
          <Campo id="med-sub" rotulo="Subespecialidades" dica="Separadas por vírgula.">
            <input id="med-sub" value={form.subespecialidades} onChange={(e) => mudar("subespecialidades", e.target.value)} className="ba-entrada" />
          </Campo>
          <Campo id="med-form" rotulo="Formação" erro={erros.formacao}>
            <input {...propsCampo("med-form", erros.formacao)} value={form.formacao} onChange={(e) => mudar("formacao", e.target.value)} className="ba-entrada" />
          </Campo>
          <Campo id="med-exp" rotulo="Experiência" erro={erros.experiencia}>
            <input {...propsCampo("med-exp", erros.experiencia)} value={form.experiencia} onChange={(e) => mudar("experiencia", e.target.value)} className="ba-entrada" />
          </Campo>
          <Campo id="med-idiomas" rotulo="Idiomas" dica="Separados por vírgula.">
            <input id="med-idiomas" value={form.idiomas} onChange={(e) => mudar("idiomas", e.target.value)} className="ba-entrada" />
          </Campo>
          <div className="sm:col-span-2">
            <Campo id="med-bio" rotulo="Bio" erro={erros.bio}>
              <textarea {...propsCampo("med-bio", erros.bio)} rows={3} value={form.bio} onChange={(e) => mudar("bio", e.target.value)} className="ba-entrada !rounded-2xl py-2" />
            </Campo>
          </div>
          <div className="sm:col-span-2">
            <Campo id="med-horarios" rotulo="Horários da grade" erro={erros.horarios} dica="A grade vale para todos os dias. Sem atendimento entre 23:00 e 00:00.">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1" role="group" aria-label="Horários">
                {opcoes.map((h) => {
                  const vedado = horarioVedado(h);
                  const escolhido = form.horarios.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={vedado && !escolhido}
                      aria-pressed={escolhido}
                      onClick={() => toggleHorario(h)}
                      className="ba-slot"
                      data-escolhido={escolhido || undefined}
                      title={vedado ? "Encosta na janela vedada (23:00–00:00)" : undefined}
                    >
                      <span className="font-bold tabular-nums">{h}</span>
                      {vedado ? <span className="text-[10px]">vedado</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <label className="sr-only" htmlFor="med-outro">Outro horário</label>
                <input id="med-outro" type="time" step={300} value={outro} onChange={(e) => setOutro(e.target.value)} className="ba-entrada flex-1" />
                <button
                  type="button"
                  className="ba-botao ba-botao-secundario"
                  disabled={!outro || horarioVedado(outro) || form.horarios.includes(outro)}
                  onClick={() => {
                    toggleHorario(outro);
                    setOutro("");
                  }}
                >
                  Adicionar
                </button>
              </div>
              {outro && horarioVedado(outro) ? (
                <p className="text-xs mt-1 font-semibold" style={{ color: "var(--ba-critico)" }}>
                  {outro} encosta na janela vedada (cada consulta dura 30 min e precisa terminar até 23:00).
                </p>
              ) : null}
            </Campo>
          </div>
        </div>
      )}

      {passo === 2 && cadastro ? (
        <div className="ba-card space-y-2" data-denso="true">
          <p className="font-bold flex items-center gap-2">
            <Stethoscope className="w-4 h-4" aria-hidden /> {form.nome || "—"}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="ba-texto-2">CRM</dt>
            <dd>{form.crm || "—"}</dd>
            <dt className="ba-texto-2">Especialidade</dt>
            <dd>{form.especialidade || "—"}</dd>
            <dt className="ba-texto-2">Valor</dt>
            <dd className="tabular-nums">R$ {form.valor}</dd>
            <dt className="ba-texto-2">Horários</dt>
            <dd className="tabular-nums">{form.horarios.join(", ") || "—"}</dd>
            <dt className="ba-texto-2">Começa</dt>
            <dd>{form.status === "ativo" ? "Já ativo" : "Em validação"}</dd>
            {form.email ? (
              <>
                <dt className="ba-texto-2">E-mail</dt>
                <dd className="break-all">{form.email}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-xs ba-texto-2">Ao salvar, a senha temporária aparece uma única vez para você repassar.</p>
        </div>
      ) : null}

      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        {cadastro && passo > 0 ? (
          <button type="button" onClick={() => setPasso((p) => p - 1)} className="ba-botao ba-botao-secundario">
            Voltar
          </button>
        ) : (
          <button type="button" onClick={onCancelar} className="ba-botao ba-botao-secundario">
            Cancelar
          </button>
        )}
        {cadastro && passo < 2 ? (
          <button
            type="button"
            className="ba-botao ba-botao-primario flex-1"
            disabled={(passo === 0 && Boolean(erros.nome || erros.crm || erros.especialidade || erros.email)) || (passo === 1 && Boolean(erros.valor || erros.horarios || erros.bio || erros.formacao || erros.experiencia))}
            onClick={() => setPasso((p) => p + 1)}
          >
            Continuar
          </button>
        ) : (
          <button type="button" onClick={() => void enviar()} disabled={temErro || enviando} className="ba-botao ba-botao-primario flex-1">
            <Save className="w-4 h-4" aria-hidden /> {enviando ? "Salvando…" : cadastro ? "Cadastrar médico" : "Salvar alteração"}
          </button>
        )}
      </div>
    </div>
  );
}
