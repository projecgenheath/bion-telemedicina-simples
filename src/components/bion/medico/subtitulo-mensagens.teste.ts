/**
 * Subtítulo da tela Mensagens no caminho do médico.
 * Rodar: bun --conditions=react-server test ./src/components/bion/medico/subtitulo-mensagens.teste.ts
 */
import { expect, test } from "bun:test";
import {
  SUBTITULO_MENSAGENS_MEDICO,
  subtituloMensagensMedico,
} from "./subtitulo-mensagens";

test("médico vê o texto certo; os demais papéis não recebem o subtítulo do médico", () => {
  expect(subtituloMensagensMedico("medico")).toBe(SUBTITULO_MENSAGENS_MEDICO);
  expect(subtituloMensagensMedico("paciente")).toBeUndefined();
  expect(subtituloMensagensMedico("admin")).toBeUndefined();
});
