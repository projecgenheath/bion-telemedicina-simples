/**
 * Subtítulo da tela Mensagens no caminho do médico.
 * Rodar: bun --conditions=react-server test ./src/components/bion/medico/subtitulo-mensagens.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "bun:test";
import {
  SUBTITULO_MENSAGENS_MEDICO,
  SUBTITULO_MENSAGENS_PADRAO,
  subtituloMensagensMedico,
} from "./subtitulo-mensagens";

const tela = readFileSync(path.join(process.cwd(), "src/components/bion/telas/Mensagens.tsx"), "utf8");

test("médico vê o texto certo; os demais papéis não recebem o subtítulo do médico", () => {
  expect(subtituloMensagensMedico("medico")).toBe(SUBTITULO_MENSAGENS_MEDICO);
  expect(subtituloMensagensMedico("paciente")).toBeUndefined();
  expect(subtituloMensagensMedico("admin")).toBeUndefined();
  expect(SUBTITULO_MENSAGENS_PADRAO).toContain("médico especialista");
});

test("Mensagens.tsx usa o helper do médico e não define o ramo do admin", () => {
  expect(tela).toContain('import { subtituloMensagensMedico } from "@/components/bion/medico/subtitulo-mensagens"');
  expect(tela).toContain("subtituloMensagensMedico(role)");
  expect(tela).toContain("subtituloMensagens(sessao.role)");
  expect(tela).not.toContain('role === "admin"');
  expect(tela).not.toContain("Fale com médicos e pacientes pelo suporte BION.");
});
