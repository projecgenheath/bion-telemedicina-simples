"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { hojeIsoSaoPaulo, type ComDataNascimento } from "@/lib/idade";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";

/**
 * Janela de edição dos dados do Perfil (fase 3), com Salvar e Cancelar.
 * Abre ao tocar numa linha de "Dados pessoais" ou em "Editar" do cartão de
 * saúde; o campo tocado recebe o foco. Segue o tema (Clean/Dark) e envia
 * só os campos alterados — mesmas regras do formulário antigo do Perfil.
 */

export type CampoPerfil =
  | "dataNascimento"
  | "telefone"
  | "profissao"
  | "estadoCivil"
  | "tipoSanguineo"
  | "alergias"
  | "comorbidades"
  | "medicamentos";

const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"];
/** Mesma lista do servidor (lib/server/validar-perfil.ts). */
const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const lista = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

export function DadosPessoaisSheet({ campoInicial, onFechar }: { campoInicial?: CampoPerfil; onFechar: () => void }) {
  const { pacientePerfil, atualizarPacientePerfil } = useBion();
  const dataNascimento = (pacientePerfil as (typeof pacientePerfil & ComDataNascimento) | undefined)?.dataNascimento ?? "";
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    dataNascimento,
    telefone: pacientePerfil?.telefone ?? "",
    profissao: pacientePerfil?.profissao ?? "",
    estadoCivil: pacientePerfil?.estadoCivil ?? "",
    tipoSanguineo: pacientePerfil?.tipoSanguineo ?? "",
    alergias: (pacientePerfil?.alergias ?? []).join(", "),
    comorbidades: (pacientePerfil?.comorbidades ?? []).join(", "),
    medicamentos: (pacientePerfil?.medicamentos ?? []).join(", "),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fechar = () => {
    if (!salvando) onFechar();
  };
  const raizRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, raizRef);

  // Foca o campo tocado (depois do foco inicial do diálogo, que vai no "Cancelar").
  const focarCampo = (el: HTMLElement | null, campo: CampoPerfil) => {
    if (el && campo === campoInicial && !el.dataset.focado) {
      el.dataset.focado = "1";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // O foco inicial do diálogo (no "Cancelar", lá embaixo) rola a janela até o fim.
          // Volta ao topo, para o título continuar à vista, e só rola se o campo não couber.
          const painel = el.closest<HTMLElement>(".bpp-sheet-painel");
          if (painel) painel.scrollTop = 0;
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: "nearest" });
        }),
      );
    }
  };

  const salvar = async () => {
    if (salvando) return;
    const novo = {
      dataNascimento: form.dataNascimento || null,
      telefone: form.telefone.trim(),
      profissao: form.profissao.trim(),
      estadoCivil: form.estadoCivil,
      tipoSanguineo: form.tipoSanguineo,
      alergias: lista(form.alergias),
      comorbidades: lista(form.comorbidades),
      medicamentos: lista(form.medicamentos),
    };
    const atual = {
      dataNascimento: dataNascimento || null,
      telefone: pacientePerfil?.telefone ?? "",
      profissao: pacientePerfil?.profissao ?? "",
      estadoCivil: pacientePerfil?.estadoCivil ?? "",
      tipoSanguineo: pacientePerfil?.tipoSanguineo ?? "",
      alergias: pacientePerfil?.alergias ?? [],
      comorbidades: pacientePerfil?.comorbidades ?? [],
      medicamentos: pacientePerfil?.medicamentos ?? [],
    };
    const alterado = (Object.keys(novo) as (keyof typeof novo)[]).filter(
      (k) => JSON.stringify(novo[k]) !== JSON.stringify(atual[k]),
    )
      // O servidor não aceita tipo sanguíneo vazio: "Não sei" só não envia.
      .filter((k) => !(k === "tipoSanguineo" && !novo.tipoSanguineo));
    if (!alterado.length) {
      onFechar();
      return;
    }
    const patch = Object.fromEntries(alterado.map((k) => [k, novo[k]]));
    setSalvando(true);
    // Em erro, o toast vem do `api` e a janela continua aberta com o que foi digitado.
    const ok = await atualizarPacientePerfil(patch);
    setSalvando(false);
    if (ok) {
      toast.success("Perfil atualizado.");
      onFechar();
    }
  };

  const campo = "bpp-sheet-campo mt-1 w-full rounded-xl border px-4 py-3 text-sm";
  const rotulo = "text-xs font-bold bpp-sheet-suave";

  return (
    <div ref={raizRef} className="bpp-sheet-raiz absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-dados-pessoais">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bpp-sheet-veu cursor-default" onClick={fechar} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
        className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-dados-pessoais" className="text-lg font-bold">Editar meus dados</h2>
        <p className="text-sm bpp-sheet-suave mt-1">Seu médico vê estes dados antes da consulta.</p>

        <fieldset className="mt-5 space-y-3" disabled={salvando}>
          <legend className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave mb-1">Dados pessoais</legend>
          <label className="block">
            <span className={rotulo}>Data de nascimento</span>
            <input ref={(el) => focarCampo(el, "dataNascimento")} type="date" value={form.dataNascimento} onChange={set("dataNascimento")} min="1900-01-01" max={hojeIsoSaoPaulo()} autoComplete="bday" className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Telefone</span>
            <input ref={(el) => focarCampo(el, "telefone")} value={form.telefone} onChange={set("telefone")} placeholder="(11) 91234-5678" type="tel" inputMode="tel" autoComplete="tel" maxLength={25} className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Profissão</span>
            <input ref={(el) => focarCampo(el, "profissao")} value={form.profissao} onChange={set("profissao")} placeholder="Ex.: professora" maxLength={80} className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Estado civil</span>
            <select ref={(el) => focarCampo(el, "estadoCivil")} value={form.estadoCivil} onChange={set("estadoCivil")} className={campo}>
              <option value="">Prefiro não informar</option>
              {ESTADOS_CIVIS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="mt-6 space-y-3" disabled={salvando}>
          <legend className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave mb-1">Saúde</legend>
          <label className="block">
            <span className={rotulo}>Tipo sanguíneo</span>
            <select ref={(el) => focarCampo(el, "tipoSanguineo")} value={form.tipoSanguineo} onChange={set("tipoSanguineo")} className={campo}>
              <option value="">Não sei</option>
              {TIPOS_SANGUINEOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={rotulo}>Alergias</span>
            <input ref={(el) => focarCampo(el, "alergias")} value={form.alergias} onChange={set("alergias")} placeholder="Separe por vírgula. Ex.: dipirona, camarão" className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Comorbidades</span>
            <input ref={(el) => focarCampo(el, "comorbidades")} value={form.comorbidades} onChange={set("comorbidades")} placeholder="Separe por vírgula. Ex.: hipertensão" className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Medicamentos em uso</span>
            <input ref={(el) => focarCampo(el, "medicamentos")} value={form.medicamentos} onChange={set("medicamentos")} placeholder="Separe por vírgula. Ex.: losartana 50 mg" className={campo} />
          </label>
        </fieldset>

        <div className="flex gap-2 mt-6">
          <button type="button" onClick={fechar} disabled={salvando} aria-label="Cancelar e fechar" className="bpp-toque flex-1 min-h-12 rounded-xl border bpp-sheet-borda text-sm font-semibold disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="bpp-toque flex-1 min-h-12 rounded-xl bpp-sheet-primario text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
