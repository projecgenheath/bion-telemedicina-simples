"use client";
import {
  TEXTO_ACEITE_TERMOS,
  TEXTO_MARKETING_OPTIN,
  URL_POLITICA_PRIVACIDADE,
  URL_TERMOS_POR_PERFIL,
  type PerfilAceite,
} from "@/lib/aceite-termos";

/**
 * Aceite do cadastro: caixa OBRIGATÓRIA dos Termos de Uso + Política de
 * Privacidade e, separada, caixa OPCIONAL de marketing (desmarcada por padrão).
 * Reutilizável no cadastro do médico: passe `perfil="MEDICO"` e os links dele.
 */
export function AceiteTermos({
  perfil,
  urlTermos = URL_TERMOS_POR_PERFIL[perfil],
  urlPrivacidade = URL_POLITICA_PRIVACIDADE,
  aceitouTermos,
  onAceitouTermos,
  aceitouMarketing,
  onAceitouMarketing,
  mostrarMarketing = true,
  textoMarketing = TEXTO_MARKETING_OPTIN,
  disabled,
}: {
  perfil: PerfilAceite;
  urlTermos?: string;
  urlPrivacidade?: string;
  aceitouTermos: boolean;
  onAceitouTermos: (v: boolean) => void;
  aceitouMarketing?: boolean;
  onAceitouMarketing?: (v: boolean) => void;
  mostrarMarketing?: boolean;
  textoMarketing?: string;
  disabled?: boolean;
}) {
  const base = `aceite-${perfil.toLowerCase()}`;
  const caixa = "mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary";
  const link = "font-semibold text-primary underline";
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          id={`${base}-termos`}
          type="checkbox"
          required
          aria-required="true"
          aria-label={TEXTO_ACEITE_TERMOS}
          checked={aceitouTermos}
          disabled={disabled}
          onChange={(e) => onAceitouTermos(e.target.checked)}
          className={caixa}
        />
        <label htmlFor={`${base}-termos`} className="text-xs text-muted-foreground leading-relaxed">
          Li e aceito os{" "}
          <a href={urlTermos} target="_blank" rel="noopener noreferrer" className={link}>
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a href={urlPrivacidade} target="_blank" rel="noopener noreferrer" className={link}>
            Política de Privacidade
          </a>
        </label>
      </div>
      {mostrarMarketing && onAceitouMarketing ? (
        <div className="flex items-start gap-3">
          <input
            id={`${base}-marketing`}
            type="checkbox"
            checked={!!aceitouMarketing}
            disabled={disabled}
            onChange={(e) => onAceitouMarketing(e.target.checked)}
            className={caixa}
          />
          <label htmlFor={`${base}-marketing`} className="text-xs text-muted-foreground leading-relaxed">
            {textoMarketing} <span className="opacity-70">(opcional)</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
