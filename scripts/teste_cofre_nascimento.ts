/**
 * Teste da data de nascimento no cofre de identificação (LGPD) e do que a
 * pseudonimização zera no PerfilPaciente. Não acessa banco nem Supabase.
 * Rodar (precisa da condição react-server por causa do "server-only"):
 *   bun --conditions=react-server scripts/teste_cofre_nascimento.ts
 *   TZ=Asia/Tokyo bun --conditions=react-server scripts/teste_cofre_nascimento.ts
 */
import crypto from "crypto";
import {
  cifrarIdentificacao,
  complementarIdentificacao,
  dataNascimentoParaCofre,
  decifrarIdentificacao,
} from "../src/lib/server/cofre";
import { DADOS_PERFIL_PSEUDONIMIZADO } from "../src/lib/server/lgpd";
import { formatarDataNascimento, isoParaDataNascimento } from "../src/lib/idade";

// Chave efêmera só deste processo (nunca a do ambiente).
process.env.BION_COFRE_CHAVE = crypto.randomBytes(32).toString("hex");

let passou = 0;
let falhou = 0;
function verificar(nome: string, cond: boolean, detalhe?: unknown) {
  if (cond) passou++;
  else {
    falhou++;
    console.error(`✗ ${nome}`, detalhe ?? "");
  }
}

const anamneseCom = (v: string) => JSON.stringify({ identificacao: { dataNascimento: v } });

// --- origem da data ---
const dataPerfil = isoParaDataNascimento("1985-03-09"); // meia-noite UTC, como o Prisma devolve DATE
verificar(
  "perfil tem prioridade sobre a anamnese",
  dataNascimentoParaCofre(dataPerfil, [anamneseCom("1970-01-01")]) === "1985-03-09",
);
verificar("perfil vazio → fallback da anamnese (ISO)", dataNascimentoParaCofre(null, [anamneseCom("1970-01-02")]) === "1970-01-02");
verificar("fallback DD/MM/AAAA → ISO", dataNascimentoParaCofre(undefined, [anamneseCom("02/01/1970")]) === "1970-01-02");
verificar("fallback texto livre fica como veio", dataNascimentoParaCofre(null, [anamneseCom("março de 1970")]) === "março de 1970");
verificar("fallback DD/MM inválido fica como veio", dataNascimentoParaCofre(null, [anamneseCom("31/02/1970")]) === "31/02/1970");
verificar("sem data em lugar nenhum → null", dataNascimentoParaCofre(null, ["{}", "json inválido"]) === null);
verificar("Date inválida no perfil → fallback", dataNascimentoParaCofre(new Date(NaN), [anamneseCom("1970-01-03")]) === "1970-01-03");
// Data pura: as partes UTC, qualquer que seja o TZ do processo.
verificar("sem conversão de fuso (01/01)", dataNascimentoParaCofre(new Date(Date.UTC(2001, 0, 1)), []) === "2001-01-01");

// --- ida e volta cifrada ---
{
  const id = "pac_123";
  const cifrado = cifrarIdentificacao(id, { nome: "Maria", cpf: "529.982.247-25", dataNascimento: "1985-03-09" });
  const claro = decifrarIdentificacao(id, cifrado);
  verificar("cofre guarda YYYY-MM-DD", claro.dataNascimento === "1985-03-09", claro);
  verificar("busca mostra DD/MM/AAAA", formatarDataNascimento(claro.dataNascimento) === "09/03/1985");
  let falhouOutroId = false;
  try {
    decifrarIdentificacao("outro", cifrado);
  } catch {
    falhouOutroId = true;
  }
  verificar("AAD impede ler com outro userId", falhouOutroId);
}

// --- reexecução: complementar o cofre antes de apagar a data do perfil ---
{
  const existente = { nome: "Maria", cpf: "529.982.247-25", dataNascimento: null };
  const novo = complementarIdentificacao(existente, "1985-03-09");
  verificar(
    "complementa registro sem data mantendo nome/CPF",
    novo?.nome === "Maria" && novo.cpf === "529.982.247-25" && novo.dataNascimento === "1985-03-09",
    novo,
  );
  verificar("registro já com a data → nada a gravar", complementarIdentificacao({ ...existente, dataNascimento: "1985-03-09" }, "1985-03-09") === null);
  const semRegistro = complementarIdentificacao(null, "1985-03-09");
  verificar("sem registro → cria só com a data", semRegistro?.nome === "" && semRegistro.cpf === "" && semRegistro.dataNascimento === "1985-03-09");
  const textoLivre = complementarIdentificacao({ ...existente, dataNascimento: "março de 1985" }, "1985-03-09");
  verificar("perfil vence texto livre antigo", textoLivre?.dataNascimento === "1985-03-09");
}

// --- pseudonimização do perfil ---
verificar("pseudonimização zera dataNascimento (null)", DADOS_PERFIL_PSEUDONIMIZADO.dataNascimento === null);
verificar("pseudonimização mantém idade (prontuário)", !("idade" in DADOS_PERFIL_PSEUDONIMIZADO));
for (const campo of ["genero", "alergias", "medicamentos", "comorbidades", "tipoSanguineo", "peso", "altura"]) {
  verificar(`pseudonimização mantém ${campo}`, !(campo in DADOS_PERFIL_PSEUDONIMIZADO));
}
verificar("pseudonimização zera CPF/telefone/foto", DADOS_PERFIL_PSEUDONIMIZADO.cpf === "" && DADOS_PERFIL_PSEUDONIMIZADO.telefone === "" && DADOS_PERFIL_PSEUDONIMIZADO.foto === null);

console.log(`TZ do processo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log(`\n${passou} ok, ${falhou} falha(s)`);
if (falhou) process.exit(1);
