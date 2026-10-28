import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Dados públicos do médico (sem informações sensíveis). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medicos")
    .select("id, nome, especialidade, crm, bio, valor, avaliacao, num_avaliacoes, foto, horarios_disponiveis, status")
    .eq("id", id)
    .eq("status", "ativo")
    .single();

  if (error || !data) {
    return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    nome: data.nome,
    especialidade: data.especialidade,
    crm: data.crm,
    bio: data.bio,
    valor: data.valor,
    avaliacao: data.avaliacao,
    numAvaliacoes: data.num_avaliacoes,
    foto: data.foto,
    horariosDisponiveis: data.horarios_disponiveis ?? [],
  });
}