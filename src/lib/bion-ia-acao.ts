/**
 * Ação estruturada da BION IA (fallback de "tool calling", que funciona com
 * NVIDIA e com Gemini): o modelo termina a resposta com
 *   [[AGENDAR]]  ou  [[AGENDAR: Clínica Médica]]
 * O servidor TIRA o marcador do texto e manda a ação num evento próprio; o
 * chat mostra o card com o botão para agendar. O texto nunca mostra o marcador.
 */
export type AcaoBionIa = { tipo: "agendar"; especialidade: string | null };

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
  const esp = (m[1] ?? "").trim();
  return { texto: texto.replace(RE_TODAS, "").replace(/[ \t]+\n/g, "\n").trim(), acao: { tipo: "agendar", especialidade: esp || null } };
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
