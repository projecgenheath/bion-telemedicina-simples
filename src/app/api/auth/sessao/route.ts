import { getSessao } from "@/lib/server/auth";
import { ok } from "@/lib/server/http";

export async function GET() {
  const sessao = await getSessao();
  if (!sessao) return ok({ autenticado: false });
  return ok({
    autenticado: true,
    usuario: {
      id: sessao.id,
      nome: sessao.nome,
      email: sessao.email,
      role: sessao.role,
    },
  });
}
