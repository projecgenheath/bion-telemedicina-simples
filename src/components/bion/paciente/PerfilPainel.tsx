"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Droplets,
  FileUp,
  HeartCrack,
  LifeBuoy,
  LogOut,
  Moon,
  Pencil,
  Phone,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { calcularImc, formatarAltura, formatarPeso, lerAlturaCm, lerPesoKg } from "@/lib/medidas-paciente";
import { formatarDataNascimento, idadeDeNascimento, type ComDataNascimento } from "@/lib/idade";
import { CLASSE_ETIQUETA, rotuloHistorico } from "./etiqueta-consulta";
import { EstadoVazio } from "./EstadosPaciente";
import { aplicarTema, useTemaHtml } from "./useTemaHtml";
import type { CampoPerfil } from "./DadosPessoaisSheet";
import type { ListaPerfil } from "./TelaListaCompleta";

/**
 * Painel do perfil (gesto esquerda → direita), reorganizado em grupos na
 * fase 3: cabeçalho com foto, cartão de saúde, dados pessoais (linhas que
 * abrem a janela de edição com Salvar e Cancelar), consultas, pagamentos e
 * uploads (3 últimos + "Ver tudo" em tela cheia), aparência, conta e Sair.
 *
 * A edição e o "Ver tudo" são sobreposições renderizadas pelo PacienteApp
 * (fora do carrossel), por isso chegam como callbacks.
 */

/** Limite do arquivo ORIGINAL antes do recorte para 256×256 (o servidor valida o resultado). */
const FOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;
/** Quantos itens cada grupo mostra antes do "Ver tudo". */
const PREVIA = 3;

const INICIAIS = (nome: string) =>
  nome
    .split(" ")
    .filter((p) => p.length > 1)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function Grupo({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo}>
      <div className="flex items-end justify-between">
        <h3 className="bpp-grupo-titulo text-bion-ink/75 dark:text-bion-paper/75">{titulo}</h3>
        {acao}
      </div>
      <div className="bp-glass p-2">{children}</div>
    </section>
  );
}

/** Linha de dado: com `onClick` vira botão (abre a edição daquele campo). */
function LinhaDado({ icone, rotulo, valor, onClick }: { icone: ReactNode; rotulo: string; valor?: ReactNode; onClick?: () => void }) {
  const conteudo = (
    <>
      <span className="w-9 h-9 rounded-xl bg-bion-ink/6 dark:bg-white/8 inline-flex items-center justify-center shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-bion-ink/75 dark:text-bion-paper/75">{rotulo}</span>
        <span className={`block text-sm font-semibold truncate ${valor ? "text-bion-ink dark:text-bion-paper" : "text-bion-ink/75 dark:text-bion-paper/75"}`}>
          {valor || (onClick ? "Adicionar" : "—")}
        </span>
      </span>
      {onClick ? <ChevronRight className="w-4 h-4 shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden /> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="bpp-linha bpp-toque" aria-label={`${rotulo}: ${valor || "não informado"}. Editar`}>
      {conteudo}
    </button>
  ) : (
    <div className="bpp-linha">{conteudo}</div>
  );
}

function LinhaLink({ icone, rotulo, onClick }: { icone: ReactNode; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} role="link" className="bpp-linha bpp-toque group">
      <span className="w-9 h-9 rounded-xl bg-bion-ink/6 dark:bg-white/8 inline-flex items-center justify-center shrink-0 text-bion-ink dark:text-bion-paper" aria-hidden>
        {icone}
      </span>
      <span className="flex-1 text-sm font-semibold text-bion-ink dark:text-bion-paper">{rotulo}</span>
      <ChevronRight className="w-4 h-4 text-bion-ink/75 dark:text-bion-paper/75 transition group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

function VerTudo({ total, onClick, rotulo }: { total: number; onClick: () => void; rotulo: string }) {
  if (total <= PREVIA) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`Ver tudo: ${rotulo} (${total})`} className="bpp-toque min-h-11 px-2 -mr-1 text-xs font-bold text-bion-sea dark:text-sky-300 inline-flex items-center gap-0.5">
      Ver tudo ({total}) <ChevronRight className="w-3.5 h-3.5" aria-hidden />
    </button>
  );
}

/** Chips do cartão de saúde (sobre o marinho: texto claro ≥ 4,5:1). */
function ChipsSaude({ itens, vazio, tom }: { itens: string[]; vazio: string; tom: "alerta" | "neutro" }) {
  if (!itens.length) return <span className="text-sm text-white/80">{vazio}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <span key={i} className={`text-xs font-bold px-2.5 py-1 rounded-full ${tom === "alerta" ? "bg-amber-300/20 text-amber-100 ring-1 ring-amber-200/30" : "bg-white/15 text-white"}`}>
          {i}
        </span>
      ))}
    </span>
  );
}

export function PerfilPainel({
  onSair,
  onEditar,
  onVerTudo,
  onAgendar,
}: {
  onSair: () => void;
  onEditar: (campo?: CampoPerfil) => void;
  onVerTudo: (lista: ListaPerfil) => void;
  onAgendar: () => void;
}) {
  const { pacientePerfil, sessao, consultas, arquivos, exames, medicoes, atualizarPacientePerfil } = useBion();
  const router = useRouter();
  const inputFotoRef = useRef<HTMLInputElement>(null);
  // M4: data de nascimento ("YYYY-MM-DD" do payload; o tipo do store não a declara).
  const dataNascimento = (pacientePerfil as (typeof pacientePerfil & ComDataNascimento) | undefined)?.dataNascimento ?? "";
  const idadeExibida = (dataNascimento ? idadeDeNascimento(dataNascimento) : null) ?? pacientePerfil?.idade ?? 0;
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  // Tema lido do <html> (segue o celular quando não há escolha salva).
  const tema = useTemaHtml();
  const [densidade, setDensidade] = useState<"compacta" | "confortavel" | "grande">(() => {
    if (typeof window === "undefined") return "confortavel";
    try {
      const d = localStorage.getItem("bion-densidade");
      return d === "compacta" || d === "grande" ? d : "confortavel";
    } catch {
      return "confortavel";
    }
  });

  const consultasDoPaciente = useMemo(
    () => consultas.filter((c) => c.paciente === sessao.nome).sort((a, b) => b.ts - a.ts),
    [consultas, sessao.nome],
  );
  const uploads = useMemo(
    () => arquivos.filter((a) => a.enviadoPor === "paciente" || a.consulta === "BION IA"),
    [arquivos],
  );
  const pagamentos = useMemo(() => consultasDoPaciente.filter((c) => c.status !== "cancelada"), [consultasDoPaciente]);

  // Peso, altura e IMC do cartão de saúde: medição mais recente; se não houver, o perfil.
  const ultimaMedicao = (tipo: "peso" | "altura") =>
    medicoes.filter((m) => m.tipo === tipo).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).at(-1)?.valor1;
  const pesoKg = ultimaMedicao("peso") ?? lerPesoKg(pacientePerfil?.peso) ?? undefined;
  const alturaCm = ultimaMedicao("altura") ?? lerAlturaCm(pacientePerfil?.altura) ?? undefined;
  const imc = calcularImc(pesoKg, alturaCm);
  const pesoTexto = pesoKg ? formatarPeso(String(pesoKg)) : "";
  const alturaTexto = alturaCm ? formatarAltura(String(alturaCm)) : "";

  // A2: valida o arquivo antes de ler, trata falhas de leitura e só
  // confirma o sucesso depois que o servidor aceitou a foto.
  const aoEscolherFoto = (arquivo: File) => {
    if (enviandoFoto) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(arquivo.type)) {
      toast.error("Escolha uma imagem (JPG, PNG ou WebP).");
      return;
    }
    if (arquivo.size > FOTO_ORIGINAL_MAX_BYTES) {
      toast.error("Imagem muito grande. Escolha uma foto de até 15 MB.");
      return;
    }
    const falhaLeitura = () => {
      setEnviandoFoto(false);
      toast.error("Não foi possível ler esta imagem. Tente outra foto.");
    };
    setEnviandoFoto(true);
    const reader = new FileReader();
    reader.onerror = falhaLeitura;
    reader.onload = () => {
      const img = new Image();
      img.onerror = falhaLeitura;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const tamanho = 256;
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.width || !img.height) {
          falhaLeitura();
          return;
        }
        const lado = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tamanho, tamanho);
        void (async () => {
          const ok = await atualizarPacientePerfil({ foto: canvas.toDataURL("image/jpeg", 0.82) });
          setEnviandoFoto(false);
          if (ok) toast.success("Foto de perfil atualizada.");
        })();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(arquivo);
  };

  const aplicarDensidade = (novo: "compacta" | "confortavel" | "grande") => {
    setDensidade(novo);
    const root = document.documentElement;
    root.classList.remove("densidade-compacta", "densidade-confortavel", "densidade-grande");
    root.classList.add(`densidade-${novo}`);
    try {
      localStorage.setItem("bion-densidade", novo);
    } catch {
      /* ignora */
    }
  };

  const idadeTexto = dataNascimento || idadeExibida > 0 ? `${idadeExibida} ${idadeExibida === 1 ? "ano" : "anos"}` : "";
  const segmento = (ativo: boolean) =>
    `bpp-toque min-h-11 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 ${
      ativo ? "bp-acao" : "text-bion-ink dark:text-bion-paper"
    }`;

  return (
    <div className="px-5 py-6 space-y-6 bp-safe-top pb-24">
      <input
        ref={inputFotoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Selecionar foto de perfil"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) aoEscolherFoto(f);
          if (inputFotoRef.current) inputFotoRef.current.value = "";
        }}
      />

      {/* Cabeçalho: foto, nome, idade e e-mail */}
      <header className="flex items-center gap-4 pt-1">
        <div className="relative shrink-0">
          {pacientePerfil?.foto ? (
            <img src={pacientePerfil.foto} alt={`Foto de ${sessao.nome}`} className="w-20 h-20 rounded-full object-cover border-4 border-white/80 dark:border-white/20 shadow-lg" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-bion-sea to-bion-ink text-white inline-flex items-center justify-center text-2xl font-black border-4 border-white/80 dark:border-white/20 shadow-lg">
              {INICIAIS(sessao.nome)}
            </div>
          )}
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            aria-busy={enviandoFoto}
            aria-label={enviandoFoto ? "Enviando foto de perfil" : "Alterar foto de perfil"}
            className="bpp-toque-forte absolute -bottom-1 -right-1 bp-acao w-9 h-9 inline-flex items-center justify-center !rounded-full disabled:opacity-60"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-black leading-tight text-bion-ink dark:text-bion-paper break-words">{sessao.nome}</h2>
          {idadeTexto ? <p className="text-sm font-semibold text-bion-ink dark:text-bion-paper mt-0.5">{idadeTexto}</p> : null}
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 truncate">{sessao.email}</p>
        </div>
      </header>

      {/* Cartão de saúde — o que o médico precisa saber de cara */}
      <section aria-label="Cartão de saúde" className="bpp-cartao-saude rounded-3xl p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">Cartão de saúde</span>
          <button type="button" onClick={() => onEditar("tipoSanguineo")} className="bpp-toque min-h-11 -my-2 -mr-2 px-3 rounded-full text-xs font-bold text-white inline-flex items-center gap-1.5 hover:bg-white/10" aria-label="Editar cartão de saúde">
            <Pencil className="w-3.5 h-3.5" aria-hidden /> Editar
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/10 px-3 py-2.5">
            <div className="text-xs font-semibold text-white/80 inline-flex items-center gap-1"><Droplets className="w-3.5 h-3.5" aria-hidden /> Sangue</div>
            <div className="text-xl font-black leading-tight mt-0.5">{pacientePerfil?.tipoSanguineo || "—"}</div>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2.5">
            <div className="text-xs font-semibold text-white/80">Peso</div>
            <div className="text-base font-black leading-tight mt-1 truncate">{pesoTexto || "—"}</div>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2.5">
            <div className="text-xs font-semibold text-white/80">{imc ? "IMC" : "Altura"}</div>
            <div className="text-base font-black leading-tight mt-1 truncate">{imc ? imc.toFixed(1) : alturaTexto || "—"}</div>
          </div>
        </div>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-xs font-semibold text-white/80 mb-1">Alergias</dt>
            <dd><ChipsSaude itens={pacientePerfil?.alergias ?? []} vazio="Nenhuma informada" tom="alerta" /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-white/80 mb-1">Comorbidades</dt>
            <dd><ChipsSaude itens={pacientePerfil?.comorbidades ?? []} vazio="Nenhuma informada" tom="neutro" /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-white/80 mb-1">Medicamentos em uso</dt>
            <dd><ChipsSaude itens={pacientePerfil?.medicamentos ?? []} vazio="Nenhum informado" tom="neutro" /></dd>
          </div>
        </dl>
      </section>

      {/* Dados pessoais: cada linha abre a edição daquele campo */}
      <Grupo titulo="Dados pessoais">
        <LinhaDado icone={<CalendarDays className="w-4 h-4" />} rotulo="Nascimento" valor={formatarDataNascimento(dataNascimento)} onClick={() => onEditar("dataNascimento")} />
        <LinhaDado icone={<Phone className="w-4 h-4" />} rotulo="Telefone" valor={pacientePerfil?.telefone} onClick={() => onEditar("telefone")} />
        <LinhaDado icone={<Briefcase className="w-4 h-4" />} rotulo="Profissão" valor={pacientePerfil?.profissao} onClick={() => onEditar("profissao")} />
        <LinhaDado icone={<HeartCrack className="w-4 h-4" />} rotulo="Estado civil" valor={pacientePerfil?.estadoCivil} onClick={() => onEditar("estadoCivil")} />
        <LinhaDado icone={<Users className="w-4 h-4" />} rotulo="Sexo" valor={pacientePerfil?.genero} />
      </Grupo>

      {/* Consultas: 3 últimas + Ver tudo */}
      <Grupo titulo="Consultas" acao={<VerTudo total={consultasDoPaciente.length} rotulo="histórico de consultas" onClick={() => onVerTudo("consultas")} />}>
        {consultasDoPaciente.length === 0 ? (
          <EstadoVazio
            superficie="solto"
            icone={<CalendarDays className="w-6 h-6" />}
            titulo="Nenhuma consulta ainda"
            texto="Agende a primeira pela BION IA."
            acao={{ rotulo: "Agendar consulta", onClick: onAgendar }}
          />
        ) : (
          consultasDoPaciente.slice(0, PREVIA).map((c) => {
            const e = rotuloHistorico(c.status, c.pago);
            return (
              <div key={c.id} className="bpp-linha">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-bion-ink dark:text-bion-paper truncate">{c.especialidade} · {c.medico}</div>
                  <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">{c.data} às {c.hora}</div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${CLASSE_ETIQUETA[e.tom]}`}>{e.texto}</span>
              </div>
            );
          })
        )}
      </Grupo>

      {/* Pagamentos */}
      <Grupo titulo="Pagamentos" acao={<VerTudo total={pagamentos.length} rotulo="pagamentos" onClick={() => onVerTudo("pagamentos")} />}>
        {pagamentos.length === 0 ? (
          <div className="bpp-linha">
            <CreditCard className="w-4 h-4 shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden />
            <span className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum pagamento ainda.</span>
          </div>
        ) : (
          pagamentos.slice(0, PREVIA).map((c) => (
            <div key={c.id} className="bpp-linha">
              <span className="min-w-0 flex-1 text-sm font-semibold truncate text-bion-ink dark:text-bion-paper">{c.especialidade} · {c.data}</span>
              <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.pago ? CLASSE_ETIQUETA.ok : CLASSE_ETIQUETA.pagamento}`}>
                {c.pago ? "Pago" : "Pendente"}{c.valor ? ` · ${c.valor}` : ""}
              </span>
            </div>
          ))
        )}
      </Grupo>

      {/* Uploads na BION IA */}
      <Grupo titulo="Uploads na BION IA" acao={<VerTudo total={uploads.length} rotulo="uploads" onClick={() => onVerTudo("uploads")} />}>
        <div className="bpp-linha">
          <FileUp className="w-4 h-4 shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden />
          <span className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
            {uploads.length === 1 ? "1 laudo enviado" : `${uploads.length} laudos enviados`} · {exames.length === 1 ? "1 grupo de resultados" : `${exames.length} grupos de resultados`}
          </span>
        </div>
        {uploads.slice(0, PREVIA).map((a) => (
          <div key={a.id} className="bpp-linha">
            <span className="min-w-0 flex-1 text-sm font-semibold truncate text-bion-ink dark:text-bion-paper">{a.nome}</span>
            <span className="text-xs text-bion-ink/75 dark:text-bion-paper/75 shrink-0">{a.data}</span>
          </div>
        ))}
      </Grupo>

      {/* Aparência */}
      <Grupo titulo="Aparência">
        <div className="p-2 space-y-4">
          <div>
            <div className="text-xs font-semibold text-bion-ink/75 dark:text-bion-paper/75 mb-2" id="rotulo-modo">Modo do app</div>
            <div className="grid grid-cols-2 gap-1.5 rounded-full bg-bion-ink/6 dark:bg-white/8 p-1" role="group" aria-labelledby="rotulo-modo">
              <button type="button" onClick={() => aplicarTema("claro")} aria-pressed={tema === "claro"} className={segmento(tema === "claro")}>
                <Sun className="w-4 h-4" aria-hidden /> Clean
              </button>
              <button type="button" onClick={() => aplicarTema("escuro")} aria-pressed={tema === "escuro"} className={segmento(tema === "escuro")}>
                <Moon className="w-4 h-4" aria-hidden /> Dark
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-bion-ink/75 dark:text-bion-paper/75 mb-2" id="rotulo-texto">Tamanho do texto</div>
            <div className="grid grid-cols-3 gap-1.5 rounded-full bg-bion-ink/6 dark:bg-white/8 p-1" role="group" aria-labelledby="rotulo-texto">
              {(
                [
                  ["compacta", "A−", "Texto menor", "text-xs"],
                  ["confortavel", "A", "Texto padrão", "text-sm"],
                  ["grande", "A+", "Texto maior", "text-base"],
                ] as const
              ).map(([id, rotulo, nome, tamanho]) => (
                <button key={id} type="button" onClick={() => aplicarDensidade(id)} aria-pressed={densidade === id} aria-label={nome} className={`${segmento(densidade === id)} !font-black ${tamanho}`}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Grupo>

      {/* Conta */}
      <Grupo titulo="Conta">
        <LinhaLink icone={<LifeBuoy className="w-4 h-4" />} rotulo="Suporte" onClick={() => router.push("/suporte")} />
        <LinhaLink icone={<ShieldCheck className="w-4 h-4" />} rotulo="Termos e privacidade" onClick={() => router.push("/privacidade")} />
      </Grupo>

      <button
        type="button"
        onClick={onSair}
        className="bpp-toque w-full min-h-12 rounded-full border-2 border-red-600/40 text-red-700 dark:border-red-400/40 dark:text-red-300 text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-red-500/10"
      >
        <LogOut className="w-4 h-4" aria-hidden /> Sair da conta
      </button>
    </div>
  );
}
