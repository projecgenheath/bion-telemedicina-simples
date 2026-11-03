/**
 * Ação estruturada da BION IA (fallback de "tool calling", que funciona com
 * NVIDIA e com Gemini): o modelo termina a resposta com
 *   [[AGENDAR]]  ou  [[AGENDAR: Clínica Médica]]
 * O servidor TIRA o marcador do texto e manda a ação num evento próprio; o
 * chat mostra o card com o botão para agendar. O texto nunca mostra o marcador.
 */
export type AcaoBionIa = {
  tipo: "agendar";
  especialidade: string | null;
  /** Código interno do médico (M1, M2…) que o modelo escolheu. Só o servidor o resolve. */
  codigo?: string | null;
  /** Preenchidos pelo SERVIDOR (resolverAcaoAgendar), nunca vêm do modelo. */
  medicoId?: string | null;
  medico?: string | null;
};

/** Médico disponível como o servidor guarda: o código vai à IA; id e nome, não. */
export type MedicoCodificado = { codigo: string; id: string; nome: string; especialidade: string };

/**
 * Troca o código (M1…) pelo médico real ao montar o card. Código desconhecido
 * é ignorado (fica só a especialidade). O código não sai para o cliente.
 */
export function resolverAcaoAgendar(acao: AcaoBionIa | null, medicos: MedicoCodificado[]): AcaoBionIa | null {
  if (!acao) return null;
  const achado = acao.codigo ? medicos.find((x) => x.codigo.toUpperCase() === acao.codigo!.toUpperCase()) : undefined;
  // Código velho do histórico pode apontar para outro médico se a lista mudou:
  // só vale se a especialidade do marcador bater; senão, busca por especialidade.
  const norm = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const m = achado && (!acao.especialidade || norm(achado.especialidade) === norm(acao.especialidade)) ? achado : undefined;
  return {
    tipo: "agendar",
    especialidade: acao.especialidade ?? m?.especialidade ?? null,
    medicoId: m?.id ?? null,
    medico: m?.nome ?? null,
  };
}

const RE_ACAO = /\[\[\s*AGENDAR\s*(?::\s*([^\]\n]{0,60}))?\]\]/i;
const RE_TODAS = /\[\[\s*AGENDAR\s*(?::\s*[^\]\n]{0,60})?\]\]/gi;

/** "[", "[[", "[[ AGEN", "[[AGENDAR: Clín" … ainda podem virar marcador. */
function podeSerMarcador(t: string): boolean {
  if (t.includes("\n")) return false;
  const sem = t.toUpperCase().replace(/^\[\[\s*/, "[[");
  const alvo = "[[AGENDAR";
  if (sem.length <= alvo.length) return alvo.startsWith(sem);
  return sem.startsWith(alvo) && /^\s*(:[^\]]*)?(\])?$/.test(sem.slice(alvo.length));
}

/** Separa texto e ação de uma resposta inteira. */
export function extrairAcao(texto: string): { texto: string; acao: AcaoBionIa | null } {
  const m = RE_ACAO.exec(texto);
  if (!m) return { texto, acao: null };
  // "[[AGENDAR: Cardiologia | M2]]", "[[AGENDAR: M2]]" ou "[[AGENDAR: Cardiologia]]"
  const partes = (m[1] ?? "").split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
  const codigo = partes.find((x) => /^M\d{1,3}$/i.test(x)) ?? null;
  const esp = partes.filter((x) => x !== codigo).join(" ").trim();
  return {
    texto: texto.replace(RE_TODAS, "").replace(/[ \t]+\n/g, "\n").trim(),
    acao: { tipo: "agendar", especialidade: esp || null, codigo: codigo ? codigo.toUpperCase() : null },
  };
}

/**
 * Filtro incremental (stream): segura só o trecho que PODE ser o começo de um
 * marcador ("[", "[[", "[[AGEN…") e libera o resto na hora.
 */
export class FiltroAcao {
  private buf = "";
  private acao: AcaoBionIa | null = null;

  empurrar(delta: string): string {
    this.buf += delta;
    let saida = "";
    for (;;) {
      const i = this.buf.indexOf("[");
      if (i < 0) {
        saida += this.buf;
        this.buf = "";
        return saida;
      }
      saida += this.buf.slice(0, i);
      this.buf = this.buf.slice(i);
      const fim = this.buf.indexOf("]]");
      if (fim >= 0) {
        const pedaco = this.buf.slice(0, fim + 2);
        const r = extrairAcao(pedaco);
        if (r.acao) this.acao = r.acao;
        else saida += pedaco;
        this.buf = this.buf.slice(fim + 2);
        continue;
      }
      // ainda pode virar marcador? ("[[AGENDAR: ..." sem fechar, até 80 chars)
      const possivel = this.buf.length < 80 && podeSerMarcador(this.buf);
      if (possivel) return saida;
      saida += this.buf[0];
      this.buf = this.buf.slice(1);
    }
  }

  /** Fim do stream: devolve o que sobrou (marcador incompleto vira texto). */
  fechar(): { texto: string; acao: AcaoBionIa | null } {
    const r = extrairAcao(this.buf);
    this.buf = "";
    return { texto: r.texto, acao: r.acao ?? this.acao };
  }
}
