import { Poppins } from "next/font/google";

/**
 * Fonte do redesign da área do paciente (etapa 1, 24/11): Poppins, a mesma
 * do médico (Light 300 nos números e na saudação, Regular, Medium e
 * SemiBold). Só vira variável CSS (--bp2-fonte); quem usa é o escopo
 * .bp2-v2 do paciente-v2.css. As outras telas do paciente seguem na Inter
 * até as próximas etapas.
 */
export const poppinsPaciente = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--bp2-fonte",
});
