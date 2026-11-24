// bun src/components/bion/medico/ficha/ficha-dados.teste.ts
import {
  filtrarHistorico,
  frequenciaPosologia,
  legendaPaciente,
  linhasHistorico,
  medicamentosAtuais,
  progressoTratamento,
  situacaoExame,
  ultimasMedicoes,
} from "./ficha-dados";

let ok = 0, falhas = 0;
const t = (nome: string, cond: boolean) => { if (cond) ok++; else { falhas++; console.log("FALHA:", nome); } };
const D = 86_400_000;
const agora = Date.parse("2026-11-23T12:00:00-03:00");
const iso = (x: number) => new Date(x).toISOString();

// progresso com fim
const p1 = progressoTratamento({ inicio: iso(agora - 3 * D), fim: iso(agora + 4 * D), usoContinuo: false, posologia: {} }, agora);
t("periodo total 7", p1?.tipo === "periodo" && p1.total === 7);
t("periodo decorridos 3 / restantes 4", p1?.tipo === "periodo" && p1.decorridos === 3 && p1.restantes === 4);
// duração da posologia
const p2 = progressoTratamento({ inicio: iso(agora - 1 * D), fim: null, usoContinuo: false, posologia: { duracaoDias: 10 } }, agora);
t("duracaoDias da posologia", p2?.tipo === "periodo" && p2.total === 10 && p2.restantes === 9);
// contínuo
const p3 = progressoTratamento({ inicio: iso(agora - 40 * D), fim: null, usoContinuo: true, posologia: {} }, agora);
t("continuo", p3?.tipo === "continuo" && p3.desdeDias === 40);
// sem prazo
const p4 = progressoTratamento({ inicio: iso(agora - 2 * D), fim: null, usoContinuo: false, posologia: { duracaoDias: "x" } }, agora);
t("sem prazo", p4?.tipo === "sem_prazo");
t("inicio inválido -> null", progressoTratamento({ inicio: "x", fim: null, usoContinuo: false }, agora) === null);
// fim antes do início -> sem prazo
t("fim <= inicio -> sem prazo", progressoTratamento({ inicio: iso(agora), fim: iso(agora - D), usoContinuo: false }, agora)?.tipo === "sem_prazo");
// decorridos não passa do total
const p5 = progressoTratamento({ inicio: iso(agora - 20 * D), fim: iso(agora - 10 * D), usoContinuo: false }, agora);
t("encerrado: restantes 0", p5?.tipo === "periodo" && p5.restantes === 0 && p5.decorridos === p5.total);
// atuais: encerrado sai
const atuais = medicamentosAtuais(
  [
    { id: "a", nome: "A", dose: null, usoContinuo: false, inicio: iso(agora - 20 * D), fim: iso(agora - 10 * D) },
    { id: "b", nome: "B", dose: "1 cp", usoContinuo: true, inicio: iso(agora - 5 * D), fim: null },
    { id: "c", nome: "C", dose: null, usoContinuo: false, inicio: iso(agora - D), fim: iso(agora + D) },
  ],
  agora,
);
t("atuais sem o encerrado", atuais.map((x) => x.m.id).join() === "b,c");
t("frequencia", frequenciaPosologia({ frequencia: " 2x ao dia " }) === "2x ao dia" && frequenciaPosologia(null) === "" && frequenciaPosologia([]) === "" && frequenciaPosologia({ vezesAoDia: 3 }) === "3x ao dia" && frequenciaPosologia({ vezesAoDia: 9 }) === "");

// histórico
const linhas = linhasHistorico(
  [
    { id: "c1", ts: agora - 2 * D, status: "concluida", motivoConsulta: "Dor de cabeça", resumoMedico: "Resumo meu" },
    { id: "c2", ts: agora + D, status: "confirmada", motivoConsulta: "Retorno" },
  ],
  [
    { consultaId: "c1", dataInicio: iso(agora - 2 * D), especialidade: "Clínica", medico: "Eu", deOutroMedico: false, evolucao: { conduta: { texto: "Conduta da evolução" }, cid: "R51" }, anamnese: { status: "concluida" } },
    { consultaId: "o1", dataInicio: iso(agora - 9 * D), especialidade: "Cardiologia", medico: "Dr. Outro", deOutroMedico: true, evolucao: { conduta: { texto: "  " }, cid: " I10 " }, anamnese: null },
    { consultaId: "o2", dataInicio: iso(agora - 30 * D), especialidade: "Clínica", medico: "Eu", deOutroMedico: false, evolucao: null, anamnese: null },
  ],
  "Dra. Eu",
);
t("3 linhas (o2 é minha e não está nas consultas -> fora)", linhas.length === 3);
t("ordem desc", linhas[0].id === "c2" && linhas[1].id === "c1" && linhas[2].id === "o1");
t("minha usa conduta da evolução e CID", linhas[1].conduta === "Conduta da evolução" && linhas[1].cid === "R51" && linhas[1].profissional === "Dra. Eu");
t("minha sem evolução cai para nada", linhas[0].conduta === null && linhas[0].motivo === "Retorno");
t("outro: sem motivo, CID aparado, conduta vazia -> null", linhas[2].motivo === null && linhas[2].cid === "I10" && linhas[2].conduta === null && linhas[2].deOutroMedico);
t("anamnese flag", linhas[1].anamnese === true && linhas[2].anamnese === false);
t("busca sem acento", filtrarHistorico(linhas, "cabeca").map((l) => l.id).join() === "c1");
t("busca por profissional", filtrarHistorico(linhas, "outro").map((l) => l.id).join() === "o1");
t("busca vazia devolve tudo", filtrarHistorico(linhas, "  ").length === 3);

// exames
t("exame normal", situacaoExame([{ nome: "Hb", valor: 14, refMin: 12, refMax: 16 }]).tom === "normal");
const alt = situacaoExame([{ nome: "Glicose", valor: 130, refMax: 99 }, { nome: "TGO", valor: 50, refMax: 40 }, { nome: "TGP", valor: 60, refMax: 41 }]);
t("exame alterado com +N", alt.tom === "alterado" && alt.texto === "Alterado: Glicose, TGO +1");
t("exame sem ref", situacaoExame([{ nome: "X", valor: 1 }]).tom === "neutro");
t("exame vazio", situacaoExame([]).texto === "Sem itens estruturados");

// medições
const ult = ultimasMedicoes([
  { id: "1", tipo: "pa", valor1: 120, valor2: 80, criadoEm: iso(agora) },
  { id: "2", tipo: "pressao", valor1: 130, valor2: 85, criadoEm: iso(agora - D) },
  { id: "3", tipo: "peso", valor1: 70, valor2: null, criadoEm: iso(agora) },
]);
t("ultima pressão (pa unificado)", ult.get("pressao")?.id === "1" && ult.get("peso")?.id === "3" && ult.size === 2);
t("legenda", legendaPaciente(45, "Masculino") === "45 anos, masculino" && legendaPaciente(null, "") === "" && legendaPaciente(1, "") === "1 ano");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
