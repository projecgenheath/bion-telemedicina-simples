import { Poppins } from "next/font/google";

/**
 * Fonte do redesign da área administrativa (Torre BION): Poppins, a mesma
 * de Médico e Paciente (Light 300 nos números e na saudação, Regular, Medium
 * e SemiBold). Só vira variável CSS (--ba-fonte), aplicada no escopo .ba-app
 * e nas sheets do admin.
 */
export const poppinsAdmin = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--ba-fonte",
});
