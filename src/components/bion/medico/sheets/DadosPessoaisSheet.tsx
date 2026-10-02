"use client";

import { useState } from "react";
import { toast } from "sonner";
import { idadeDeNascimento } from "@/lib/idade";
import {
  GENEROS_MEDICO,
  IDADE_MAXIMA_MEDICO,
  IDADE_MINIMA_MEDICO,
  cnpjValido,
  formatarCnpj,
  limitesDataNascimentoMedico,
  normalizarCnpj,
  type DadosPessoaisMedico,
} from "../dados-pessoais";
import { Campo, SheetMedico } from "./SheetMedico";

type CampoForm = "dataNascimento" | "genero" | "telefone" | "cnpj";
type Form = Record<CampoForm, string>;

function formDe(d: DadosPessoaisMedico | null): Form {
  return {
    dataNascimento: d?.dataNascimento ?? "",
    genero: d?.genero ?? "",
    telefone: d?.telefone ?? "",
    cnpj: formatarCnpj(d?.cnpj) || "",
  };
}

/** Valor do formulário no formato do PATCH (comparável com o atual). */
function normalizado(f: Form): Form {
  return {
    dataNascimento: f.dataNascimento.trim(),
    genero: f.genero,
    telefone: f.telefone.trim(),
    cnpj: normalizarCnpj(f.cnpj),
  };
}

/** Pré-validação só para conforto; o servidor (/api/medico/perfil) é a autoridade. */
function validarLocal(f: Form): Partial<Record<CampoForm, string>> {
  const erros: Partial<Record<CampoForm, string>> = {};
  if (f.dataNascimento) {
    const idade = idadeDeNascimento(f.dataNascimento);
    if (idade === null) erros.dataNascimento = "Data inválida ou no futuro.";
    else if (idade < IDADE_MINIMA_MEDICO || idade > IDADE_MAXIMA_MEDICO) {
      erros.dataNascimento = `A idade deve estar entre ${IDADE_MINIMA_MEDICO} e ${IDADE_MAXIMA_MEDICO} anos.`;
    }
  }
  if (f.cnpj && !cnpjValido(f.cnpj)) erros.cnpj = "CNPJ inválido. Confira os 14 caracteres.";
  return erros;
}

/**
 * Dados pessoais do médico: data de nascimento, sexo, telefone e CNPJ.
 * Grava em PATCH /api/medico/perfil (campos PRIVADOS — fora do diretório
 * público). Só envia os campos alterados; erro do servidor aparece no campo.
 */
export function DadosPessoaisSheet({
  aberto,
  onFechar,
  dados,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  dados: DadosPessoaisMedico | null;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formDe(dados));
  const [erros, setErros] = useState<Partial<Record<CampoForm, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const limites = limitesDataNascimentoMedico();
  const mudar = (campo: CampoForm, v: string) => {
    setForm((f) => ({ ...f, [campo]: v }));
    setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const salvar = async () => {
    if (salvando) return;
    const novo = normalizado(form);
    const atual = normalizado(formDe(dados));
    const locais = validarLocal(novo);
    if (Object.keys(locais).length) {
      setErros(locais);
      return;
    }
    const corpo: Partial<Record<CampoForm, string | null>> = {};
    for (const k of ["dataNascimento", "genero", "telefone", "cnpj"] as const) {
      if (novo[k] !== atual[k]) corpo[k] = k === "dataNascimento" || k === "genero" ? novo[k] || null : novo[k];
    }
    if (!Object.keys(corpo).length) {
      onFechar();
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/medico/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = (await res.json().catch(() => null)) as { erro?: string; campo?: string } | null;
      if (!res.ok) {
        const campo = json?.campo as CampoForm | undefined;
        const msg = json?.erro ?? "Não foi possível salvar agora.";
        if (campo && campo in form) setErros({ [campo]: msg });
        else toast.error(msg);
        return;
      }
      toast.success("Dados pessoais atualizados");
      onSalvo();
      onFechar();
    } catch {
      toast.error("Falha de conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const entrada = "bp-entrada w-full px-4 py-3 text-base";

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Dados pessoais"
      subtitulo="Não aparecem no seu perfil público nem para pacientes."
    >
      <div className="space-y-4">
        <Campo rotulo="Data de nascimento" erro={erros.dataNascimento} ajuda={`Idade entre ${IDADE_MINIMA_MEDICO} e ${IDADE_MAXIMA_MEDICO} anos.`}>
          <input
            type="date"
            value={form.dataNascimento}
            min={limites.min}
            max={limites.max}
            onChange={(e) => mudar("dataNascimento", e.target.value)}
            className={entrada}
            aria-label="Data de nascimento"
          />
        </Campo>
        <Campo rotulo="Sexo" erro={erros.genero}>
          <select value={form.genero} onChange={(e) => mudar("genero", e.target.value)} className={entrada} aria-label="Sexo">
            <option value="">Não informado</option>
            {GENEROS_MEDICO.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Telefone" erro={erros.telefone} ajuda="DDD + número, ex.: (11) 91234-5678.">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={25}
            value={form.telefone}
            onChange={(e) => mudar("telefone", e.target.value)}
            className={entrada}
            aria-label="Telefone"
          />
        </Campo>
        <Campo
          rotulo="CNPJ (opcional)"
          erro={erros.cnpj}
          ajuda="Se você atende como pessoa jurídica. Numérico (00.000.000/0000-00) ou alfanumérico (12.ABC.345/01DE-35)."
        >
          <input
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={18}
            value={form.cnpj}
            onChange={(e) => mudar("cnpj", e.target.value.toUpperCase().replace(/[^0-9A-Z.\-/\s]/g, ""))}
            onBlur={() => {
              const f = formatarCnpj(form.cnpj);
              if (f) setForm((x) => ({ ...x, cnpj: f }));
            }}
            className={entrada}
            aria-label="CNPJ"
          />
        </Campo>
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="bp-acao w-full py-3 text-sm">
          {salvando ? "Salvando…" : "Salvar dados"}
        </button>
      </div>
    </SheetMedico>
  );
}
