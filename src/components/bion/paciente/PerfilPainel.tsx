"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Camera,
  CalendarDays,
  ChevronRight,
  Droplets,
  FileUp,
  HeartCrack,
  IdCard,
  LifeBuoy,
  LogOut,
  Moon,
  Pencil,
  Phone,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { calcularImc, formatarAltura, formatarPeso, lerAlturaCm, lerPesoKg } from "@/lib/medidas-paciente";
import { formatarCpfExibicao } from "@/lib/cpf";
import { iniciaisNome } from "@/lib/iniciais";
import { formatarDataNascimento, idadeDeNascimento, type ComDataNascimento } from "@/lib/idade";
import { LinhaConsultaPagamento } from "./LinhaConsultaPagamento";
import { EstadoVazio } from "./EstadosPaciente";
import { aplicarTema, useTemaHtml } from "./useTemaHtml";
import type { CampoPerfil } from "./DadosPessoaisSheet";
import type { ListaPerfil } from "./TelaListaCompleta";

/**
 * Painel do perfil (gesto esquerda → direita), reorganizado em grupos na
 * fase 3: cabeçalho com foto, cartão de saúde, dados pessoais (linhas que
 * abrem a janela de edição com Salvar e Cancelar), consultas e pagamentos (um card) e
 * uploads (3 últimos + "Ver tudo" em tela cheia), aparência, conta e Sair.
 *
 * A edição e o "Ver tudo" são sobreposições renderizadas pelo PacienteApp
 * (fora do carrossel), por isso chegam como callbacks.
 */

/** Limite do arquivo ORIGINAL antes do recorte para 256×256 (o servidor valida o resultado). */
const FOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;
/** Quantos itens cada grupo mostra antes do "Ver tudo". */
const PREVIA = 3;

// B2: iniciais = primeira + última palavra, sem partículas ("de" não é
// inicial) — regra compartilhada em lib/iniciais.
const INICIAIS = iniciaisNome;

function Grupo({ titulo, acao, children, className = "" }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={titulo} className={`bp2-pf-grupo ${className}`}>
      <div className="bp2-pf-grupo-cab">
        <h3 className="bp2-pf-grupo-t">{titulo}</h3>
        {acao}
      </div>
      <div className="bp2-pf-grupo-corpo">{children}</div>
    </section>
  );
}

/** Linha de dado (como a do perfil do médico): rótulo em cima, valor embaixo; com `onClick` abre a edição. */
function LinhaDado({ icone, rotulo, valor, onClick }: { icone: ReactNode; rotulo: string; valor?: ReactNode; onClick?: () => void }) {
  const conteudo = (
    <>
      <span className="bp2-pf-icone" aria-hidden>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="bp2-pf-linha-t">{rotulo}</span>
        <span className={`bp2-pf-linha-v ${valor ? "" : "bp2-pf-linha-vazia"}`}>{valor || (onClick ? "Não informado" : "—")}</span>
      </span>
      {onClick ? <ChevronRight className="bp2-pf-seta" aria-hidden /> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="bp2-pf-linha" aria-label={`${rotulo}: ${valor || "não informado"}. Editar`}>
      {conteudo}
    </button>
  ) : (
    <div className="bp2-pf-linha">{conteudo}</div>
  );
}

function LinhaLink({ icone, rotulo, detalhe, onClick }: { icone: ReactNode; rotulo: string; detalhe?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} role="link" className="bp2-pf-linha">
      <span className="bp2-pf-icone" aria-hidden>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="bp2-pf-linha-t">{rotulo}</span>
        {detalhe ? <span className="bp2-pf-linha-v">{detalhe}</span> : null}
      </span>
      <ChevronRight className="bp2-pf-seta" aria-hidden />
    </button>
  );
}

function VerTudo({ total, onClick, rotulo }: { total: number; onClick: () => void; rotulo: string }) {
  if (total <= PREVIA) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`Ver tudo: ${rotulo} (${total})`} className="bp2-pf-vertudo">
      Ver tudo ({total}) <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** Chips do cartão de saúde (sobre o degradê claro). */
function ChipsSaude({ itens, vazio, tom }: { itens: string[]; vazio: string; tom: "alerta" | "neutro" }) {
  if (!itens.length) return <span className="bp2-pf-chips-vazio">{vazio}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <span key={i} className={`bp2-pf-chip ${tom === "alerta" ? "bp2-pf-chip-alerta" : ""}`}>
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
  onExcluirConta,
}: {
  onSair: () => void;
  onExcluirConta: () => void;
  onEditar: (campo?: CampoPerfil) => void;
  onVerTudo: (lista: ListaPerfil) => void;
  onAgendar: () => void;
}) {
  const { pacientePerfil, sessao, consultas, arquivos, exames, medicoes, atualizarPacientePerfil } = useBion();
  const router = useRouter();
  const inputFotoRef = useRef<HTMLInputElement>(null);
  // M4: data de nascimento ("YYYY-MM-DD" do payload; o tipo do store não a declara).
  const dataNascimento = (pacientePerfil as (typeof pacientePerfil & ComDataNascimento) | undefined)?.dataNascimento ?? "";
  // B1: idade só existe se alguma fonte devolver um número de verdade —
  // nascimento inválido/futuro (idadeDeNascimento = null) e perfil sem
  // idade NÃO viram "0 anos" sob o nome.
  const idadeCalculada = dataNascimento ? idadeDeNascimento(dataNascimento) : null;
  const idadeExibida = idadeCalculada ?? (typeof pacientePerfil?.idade === "number" && pacientePerfil.idade > 0 ? pacientePerfil.idade : null);
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

  const idadeTexto = idadeExibida !== null ? `${idadeExibida} ${idadeExibida === 1 ? "ano" : "anos"}` : "";
  const linhaPessoa = [idadeTexto, pacientePerfil?.genero?.toLowerCase() ?? ""].filter(Boolean).join(" · ");

  return (
    <div className="bp2-pf bp2-e3 bp2-v2">
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

      {/* Cabeçalho como o perfil do médico: foto grande, nome, e-mail, idade e sexo */}
      <header className="bp2-pf-cab bp2-animar">
        <div className="relative">
          {pacientePerfil?.foto ? (
            <img src={pacientePerfil.foto} alt={`Foto de ${sessao.nome}`} className="bp2-pf-foto" />
          ) : (
            <div className="bp2-pf-foto bp2-pf-avatar" aria-hidden>
              {INICIAIS(sessao.nome)}
            </div>
          )}
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            aria-busy={enviandoFoto}
            aria-label={enviandoFoto ? "Enviando foto de perfil" : "Alterar foto de perfil"}
            className="bp2-pf-camera"
          >
            <Camera className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <h2 className="bp2-pf-nome">{sessao.nome}</h2>
        <p className="bp2-pf-email">{sessao.email}</p>
        {linhaPessoa ? <p className="bp2-pf-pessoa">{linhaPessoa}</p> : null}
      </header>

      {/* Cartão de saúde no degradê da ficha: o que o médico precisa saber de cara */}
      <section aria-labelledby="bp2-pf-saude-t" className="bp2-ficha-cartao bp2-pf-saude bp2-animar bp2-animar-d1">
        <div className="bp2-ficha-topo">
          <h3 id="bp2-pf-saude-t" className="bp2-ficha-titulo">
            Cartão
            <br />
            de saúde
          </h3>
          <button type="button" onClick={() => onEditar("tipoSanguineo")} className="bp2-redondo" aria-label="Editar tipo sanguíneo, alergias e comorbidades" title="Editar">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="bp2-ficha-sinais">
          <div>
            <dt>
              <Droplets className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
              Sangue
            </dt>
            <dd>
              <span className="bp2-ficha-valor">{pacientePerfil?.tipoSanguineo || "—"}</span>
            </dd>
          </div>
          <div>
            <dt>Peso</dt>
            <dd>
              <span className="bp2-ficha-valor tabular-nums">{pesoTexto || "—"}</span>
            </dd>
          </div>
          <div>
            <dt>{imc ? "IMC" : "Altura"}</dt>
            <dd>
              <span className="bp2-ficha-valor tabular-nums">{imc ? imc.toFixed(1).replace(".", ",") : alturaTexto || "—"}</span>
            </dd>
          </div>
        </dl>
        <dl className="bp2-pf-saude-lista">
          <div>
            <dt>Alergias</dt>
            <dd>
              <ChipsSaude itens={pacientePerfil?.alergias ?? []} vazio="Nenhuma informada" tom="alerta" />
            </dd>
          </div>
          <div>
            <dt>Comorbidades</dt>
            <dd>
              <ChipsSaude itens={pacientePerfil?.comorbidades ?? []} vazio="Nenhuma informada" tom="neutro" />
            </dd>
          </div>
          <div>
            <dt>Medicamentos em uso</dt>
            <dd className="bp2-pf-chips-vazio">
              Veja e edite em <strong>Sua saúde</strong>, na lista de medicamentos.
            </dd>
          </div>
        </dl>
      </section>

      {/* Dados pessoais: cada linha abre a edição daquele campo */}
      <Grupo titulo="Dados pessoais" className="bp2-animar bp2-animar-d2">
        <LinhaDado icone={<IdCard className="h-4 w-4" />} rotulo="CPF" valor={formatarCpfExibicao(pacientePerfil?.cpf) || undefined} onClick={() => onEditar("cpf")} />
        <LinhaDado icone={<CalendarDays className="h-4 w-4" />} rotulo="Data de nascimento" valor={[formatarDataNascimento(dataNascimento), idadeTexto].filter(Boolean).join(" · ") || undefined} onClick={() => onEditar("dataNascimento")} />
        <LinhaDado icone={<Phone className="h-4 w-4" />} rotulo="Telefone" valor={pacientePerfil?.telefone} onClick={() => onEditar("telefone")} />
        <LinhaDado icone={<Briefcase className="h-4 w-4" />} rotulo="Profissão" valor={pacientePerfil?.profissao} onClick={() => onEditar("profissao")} />
        <LinhaDado icone={<HeartCrack className="h-4 w-4" />} rotulo="Estado civil" valor={pacientePerfil?.estadoCivil} onClick={() => onEditar("estadoCivil")} />
        <LinhaDado icone={<Users className="h-4 w-4" />} rotulo="Sexo" valor={pacientePerfil?.genero} onClick={() => onEditar("genero")} />
      </Grupo>

      {/* Consultas e pagamentos: um card só */}
      <Grupo titulo="Consultas e pagamentos" className="bp2-animar bp2-animar-d3" acao={<VerTudo total={consultasDoPaciente.length} rotulo="consultas e pagamentos" onClick={() => onVerTudo("consultas")} />}>
        {consultasDoPaciente.length === 0 ? (
          <EstadoVazio
            superficie="solto"
            icone={<CalendarDays className="h-6 w-6" />}
            titulo="Nenhuma consulta ainda"
            texto="Agende a primeira pela BION IA."
            acao={{ rotulo: "Agendar consulta", onClick: onAgendar }}
          />
        ) : (
          consultasDoPaciente.slice(0, PREVIA).map((c) => <LinhaConsultaPagamento key={c.id} c={c} />)
        )}
      </Grupo>

      {/* Uploads na BION IA */}
      <Grupo titulo="Uploads na BION IA" acao={<VerTudo total={uploads.length} rotulo="uploads" onClick={() => onVerTudo("uploads")} />}>
        <div className="bp2-pf-linha">
          <span className="bp2-pf-icone" aria-hidden>
            <FileUp className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="bp2-pf-linha-t">{uploads.length === 1 ? "1 laudo enviado" : `${uploads.length} laudos enviados`}</span>
            <span className="bp2-pf-linha-v">{exames.length === 1 ? "1 grupo de resultados" : `${exames.length} grupos de resultados`}</span>
          </span>
        </div>
        {uploads.slice(0, PREVIA).map((a) => (
          <div key={a.id} className="bp2-pf-linha bp2-pf-linha-simples">
            <span className="min-w-0 flex-1 truncate bp2-pf-linha-t">{a.nome}</span>
            <span className="shrink-0 bp2-pf-linha-v tabular-nums">{a.data}</span>
          </div>
        ))}
      </Grupo>

      {/* Aparência */}
      <Grupo titulo="Aparência">
        <div className="bp2-pf-ajustes">
          <div>
            <div className="bp2-pf-ajuste-t" id="rotulo-modo">
              Modo do app
            </div>
            <div className="bp2-pf-segmentos" role="group" aria-labelledby="rotulo-modo">
              <button type="button" onClick={() => aplicarTema("claro")} aria-pressed={tema === "claro"}>
                <Sun className="h-4 w-4" aria-hidden /> Claro
              </button>
              <button type="button" onClick={() => aplicarTema("escuro")} aria-pressed={tema === "escuro"}>
                <Moon className="h-4 w-4" aria-hidden /> Escuro
              </button>
            </div>
          </div>
          <div>
            <div className="bp2-pf-ajuste-t" id="rotulo-texto">
              Tamanho do texto
            </div>
            <div className="bp2-pf-segmentos bp2-pf-segmentos-3" role="group" aria-labelledby="rotulo-texto">
              {(
                [
                  ["compacta", "A−", "Texto menor", "text-xs"],
                  ["confortavel", "A", "Texto padrão", "text-sm"],
                  ["grande", "A+", "Texto maior", "text-base"],
                ] as const
              ).map(([id, rotulo, nome, tamanho]) => (
                <button key={id} type="button" onClick={() => aplicarDensidade(id)} aria-pressed={densidade === id} aria-label={nome} className={tamanho}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Grupo>

      {/* Conta */}
      <Grupo titulo="Conta">
        <LinhaLink icone={<LifeBuoy className="h-4 w-4" />} rotulo="Suporte" detalhe="Abrir e acompanhar chamados" onClick={() => router.push("/suporte")} />
        <LinhaLink icone={<ShieldCheck className="h-4 w-4" />} rotulo="Termos e privacidade" detalhe="Termos de uso e política de privacidade" onClick={() => router.push("/privacidade")} />
      </Grupo>

      <div className="bp2-pf-grupo">
        <div className="bp2-pf-grupo-corpo">
          <button type="button" onClick={onSair} className="bp2-pf-linha bp2-pf-sair">
            <span className="bp2-pf-icone bp2-pf-icone-perigo" aria-hidden>
              <LogOut className="h-4 w-4" />
            </span>
            <span className="bp2-pf-linha-t">Sair da conta</span>
          </button>
        </div>
      </div>

      <button type="button" onClick={onExcluirConta} className="bp2-pf-excluir">
        <Trash2 className="h-4 w-4" aria-hidden /> Excluir minha conta
      </button>
    </div>
  );
}
