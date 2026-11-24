import { Poppins } from "next/font/google";

/**
 * Fonte do redesign da área do médico (decisão do Alisson, 22/11):
 * Poppins Light (números grandes e saudação), Regular, Medium e SemiBold. Só vira variável CSS (--bm-fonte);
 * quem usa é o escopo .bm-v2 do medico.css — paciente e admin seguem na Inter.
 */
export const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--bm-fonte",
});
