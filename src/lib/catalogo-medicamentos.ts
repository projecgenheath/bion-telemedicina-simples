/**
 * Busca de medicamentos com posologia sugerida (melhoria nº 15 da
 * auditoria médica): o campo de medicamento da emissão era texto livre,
 * sem catálogo, sem autocomplete e sem memória do que o próprio médico
 * prescreve. Aqui entram as duas fontes, sem dependência externa:
 *
 *  (a) CATÁLOGO LOCAL enxuto — medicamentos comuns de atenção primária e
 *      telemedicina, com apresentação e posologia USUAL de adulto. É ponto
 *      de partida editável, não prescrição automática: quem emite confere
 *      e ajusta dose, frequência e duração ao paciente.
 *  (b) FREQUENTES DO MÉDICO — derivados dos documentos que ELE já emitiu
 *      (o store filtra por nome do médico, padrão já usado no app, porque
 *      o Documento não carrega medicoId). Aparecem primeiro na busca.
 *
 * Funções puras; a UI (folha de emissão e modal da sala) só renderiza.
 */
import { normalizarTextoPrescricao } from "./seguranca-prescricao";

export type EntradaCatalogo = {
  nome: string;
  /** Posologia usual sugerida — sempre editável na emissão. */
  posologia: string;
  duracao?: string;
  /** Marca o toggle de controlado ao selecionar (auditoria: P1). */
  controlado?: boolean;
};

export type SugestaoMedicamento = EntradaCatalogo & {
  fonte: "frequente" | "catalogo";
  /** Nº de vezes que o médico já prescreveu (só nos frequentes). */
  vezes?: number;
};

export const CATALOGO_MEDICAMENTOS: EntradaCatalogo[] = [
  // Analgésicos, antitérmicos e anti-inflamatórios
  { nome: "Dipirona 500 mg", posologia: "1 comprimido de 6 em 6 horas, se dor ou febre", duracao: "5 dias" },
  { nome: "Dipirona 500 mg/mL gotas", posologia: "40 gotas de 6 em 6 horas, se dor ou febre", duracao: "5 dias" },
  { nome: "Paracetamol 750 mg", posologia: "1 comprimido de 6 em 6 horas, se dor ou febre", duracao: "5 dias" },
  { nome: "Ibuprofeno 600 mg", posologia: "1 comprimido de 8 em 8 horas, após as refeições", duracao: "5 dias" },
  { nome: "Nimesulida 100 mg", posologia: "1 comprimido de 12 em 12 horas, após as refeições", duracao: "5 dias" },
  { nome: "Diclofenaco sódico 50 mg", posologia: "1 comprimido de 8 em 8 horas, após as refeições", duracao: "5 dias" },
  { nome: "Ciclobenzaprina 5 mg", posologia: "1 comprimido à noite", duracao: "5 dias" },
  { nome: "Tramadol 50 mg", posologia: "1 cápsula de 8 em 8 horas, se dor", duracao: "5 dias", controlado: true },
  // Antibióticos e antiparasitários
  { nome: "Amoxicilina 500 mg", posologia: "1 cápsula de 8 em 8 horas", duracao: "7 dias" },
  { nome: "Amoxicilina + clavulanato 875/125 mg", posologia: "1 comprimido de 12 em 12 horas", duracao: "7 dias" },
  { nome: "Azitromicina 500 mg", posologia: "1 comprimido ao dia", duracao: "3 dias" },
  { nome: "Cefalexina 500 mg", posologia: "1 cápsula de 6 em 6 horas", duracao: "7 dias" },
  { nome: "Ciprofloxacino 500 mg", posologia: "1 comprimido de 12 em 12 horas", duracao: "7 dias" },
  { nome: "Metronidazol 400 mg", posologia: "1 comprimido de 8 em 8 horas", duracao: "7 dias" },
  { nome: "Albendazol 400 mg", posologia: "1 comprimido em dose única" },
  { nome: "Ivermectina 6 mg", posologia: "Dose única, conforme o peso (1 comprimido a cada 30 kg)" },
  { nome: "Fluconazol 150 mg", posologia: "1 cápsula em dose única" },
  { nome: "Aciclovir 200 mg", posologia: "1 comprimido 5 vezes ao dia", duracao: "5 dias" },
  // Alergia e vias aéreas
  { nome: "Loratadina 10 mg", posologia: "1 comprimido ao dia", duracao: "30 dias" },
  { nome: "Cetirizina 10 mg", posologia: "1 comprimido ao dia", duracao: "30 dias" },
  { nome: "Prednisona 20 mg", posologia: "1 comprimido ao dia, pela manhã", duracao: "5 dias" },
  { nome: "Dexametasona 4 mg", posologia: "1 comprimido ao dia", duracao: "3 dias" },
  { nome: "Salbutamol 100 mcg spray", posologia: "2 jatos de 6 em 6 horas, se falta de ar" },
  // Digestivo
  { nome: "Omeprazol 20 mg", posologia: "1 cápsula ao dia, em jejum", duracao: "30 dias" },
  { nome: "Pantoprazol 40 mg", posologia: "1 comprimido ao dia, em jejum", duracao: "30 dias" },
  { nome: "Ondansetrona 8 mg", posologia: "1 comprimido de 8 em 8 horas, se náusea", duracao: "3 dias" },
  { nome: "Metoclopramida 10 mg", posologia: "1 comprimido de 8 em 8 horas, antes das refeições", duracao: "5 dias" },
  { nome: "Escopolamina 10 mg", posologia: "1 comprimido de 8 em 8 horas, se cólica", duracao: "3 dias" },
  { nome: "Simeticona 125 mg", posologia: "1 cápsula de 8 em 8 horas, se gases", duracao: "5 dias" },
  // Crônicos: cardiovascular, metabólico, tireoide
  { nome: "Losartana 50 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "Enalapril 10 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "Anlodipino 5 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "Hidroclorotiazida 25 mg", posologia: "1 comprimido ao dia, pela manhã", duracao: "uso contínuo" },
  { nome: "Metformina 850 mg", posologia: "1 comprimido 2 vezes ao dia, com as refeições", duracao: "uso contínuo" },
  { nome: "Glibenclamida 5 mg", posologia: "1 comprimido ao dia, antes do café da manhã", duracao: "uso contínuo" },
  { nome: "Sinvastatina 20 mg", posologia: "1 comprimido à noite", duracao: "uso contínuo" },
  { nome: "Atorvastatina 20 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "AAS 100 mg", posologia: "1 comprimido ao dia, após o almoço", duracao: "uso contínuo" },
  { nome: "Levotiroxina 50 mcg", posologia: "1 comprimido ao dia, em jejum", duracao: "uso contínuo" },
  // Saúde mental e sono
  { nome: "Sertralina 50 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "Fluoxetina 20 mg", posologia: "1 cápsula ao dia, pela manhã", duracao: "uso contínuo" },
  { nome: "Escitalopram 10 mg", posologia: "1 comprimido ao dia", duracao: "uso contínuo" },
  { nome: "Amitriptilina 25 mg", posologia: "1 comprimido à noite", duracao: "uso contínuo" },
  { nome: "Clonazepam 0,5 mg", posologia: "1 comprimido à noite", duracao: "30 dias", controlado: true },
  { nome: "Alprazolam 0,5 mg", posologia: "1 comprimido à noite", duracao: "30 dias", controlado: true },
  { nome: "Zolpidem 10 mg", posologia: "1 comprimido à noite, ao deitar", duracao: "30 dias", controlado: true },
];

/** Forma mínima de um documento para derivar os frequentes. */
export type DocumentoFrequente = {
  tipo: string;
  medico: string;
  medicamento?: string | null;
  posologia?: string | null;
  duracao?: string | null;
  controlado?: boolean | null;
  criadoEm?: string | null;
};

/**
 * Medicamentos que o médico mais prescreve, dos documentos dele no store:
 * agrupa pelo nome normalizado, conta as emissões e fica com posologia,
 * duração e flag de controlado da emissão MAIS RECENTE de cada um.
 * Ordena por frequência e, em empate, pela emissão mais recente.
 */
export function frequentesDoMedico(
  documentos: DocumentoFrequente[] | null | undefined,
  nomeMedico: string | null | undefined,
): SugestaoMedicamento[] {
  const medico = (nomeMedico ?? "").trim();
  if (!medico) return [];
  type Grupo = SugestaoMedicamento & { recente: string };
  const grupos = new Map<string, Grupo>();
  for (const d of documentos ?? []) {
    if (d.tipo !== "receita" || d.medico !== medico) continue;
    const nome = (d.medicamento ?? "").trim();
    if (nome.length < 2) continue;
    const chave = normalizarTextoPrescricao(nome);
    const quando = d.criadoEm ?? "";
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, {
        nome,
        posologia: (d.posologia ?? "").trim(),
        duracao: (d.duracao ?? "").trim() || undefined,
        controlado: d.controlado ?? undefined,
        fonte: "frequente",
        vezes: 1,
        recente: quando,
      });
    } else {
      atual.vezes = (atual.vezes ?? 1) + 1;
      if (quando > atual.recente) {
        atual.recente = quando;
        atual.nome = nome;
        atual.posologia = (d.posologia ?? "").trim();
        atual.duracao = (d.duracao ?? "").trim() || undefined;
        atual.controlado = d.controlado ?? undefined;
      }
    }
  }
  return [...grupos.values()]
    .sort((a, b) => (b.vezes ?? 0) - (a.vezes ?? 0) || b.recente.localeCompare(a.recente))
    .map(({ recente: _recente, ...s }) => s);
}

function combina(consultaNorm: string, nome: string): boolean {
  if (!consultaNorm) return true;
  const nomeNorm = normalizarTextoPrescricao(nome);
  if (nomeNorm.includes(consultaNorm)) return true;
  // Busca por tokens: cada palavra digitada precisa começar algum token do
  // nome ("amoxi 500" acha "Amoxicilina 500 mg").
  const tokensNome = nomeNorm.split(/[^a-z0-9]+/).filter(Boolean);
  return consultaNorm
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((t) => tokensNome.some((tn) => tn.startsWith(t)));
}

/**
 * Sugestões para o autocomplete: frequentes do médico primeiro (são a
 * prática dele), depois o catálogo; sem duplicar o mesmo medicamento nas
 * duas fontes (o frequente vence, porque traz a posologia que ele usa).
 * Consulta vazia devolve os frequentes (atalho ao abrir o campo).
 */
export function buscarMedicamentos(
  consulta: string | null | undefined,
  frequentes: SugestaoMedicamento[] | null | undefined,
  limite = 8,
): SugestaoMedicamento[] {
  const q = normalizarTextoPrescricao(consulta);
  // Campo vazio: só os frequentes, como atalho — despejar o catálogo
  // inteiro ao abrir o campo seria ruído, não ajuda.
  if (!q) return (frequentes ?? []).slice(0, Math.max(1, limite));
  const freq = (frequentes ?? []).filter((f) => combina(q, f.nome));
  const vistos = new Set(freq.map((f) => normalizarTextoPrescricao(f.nome)));
  const catalogo = CATALOGO_MEDICAMENTOS.filter((c) => {
    const chave = normalizarTextoPrescricao(c.nome);
    return !vistos.has(chave) && combina(q, c.nome);
  }).map((c) => ({ ...c, fonte: "catalogo" as const }));
  return [...freq, ...catalogo].slice(0, Math.max(1, limite));
}
