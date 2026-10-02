"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleUserRound,
  FileText,
  LifeBuoy,
  LogOut,
  Moon,
  Phone,
  Sun,
  Wallet,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { formatarDataNascimento, idadeDeNascimento } from "@/lib/idade";
import { iniciais } from "./metricas";
import { formatarCnpj } from "./dados-pessoais";
import { DadosPessoaisSheet } from "./sheets/DadosPessoaisSheet";
import { EmBreve } from "./sheets/SheetMedico";
import { useConfirmarSalvamento } from "./sheets/useConfirmarSalvamento";
import type { DadosMedico } from "./useDadosMedico";

type Tema = "claro" | "escuro";
type Densidade = "compacta" | "confortavel" | "grande";

const FOTO_MAX_BYTES = 500 * 1024; // limite do PATCH /api/medicos/[id]
const FOTO_ORIGINAL_MAX = 15 * 1024 * 1024;

function lerTema(): Tema {
  try {
    return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}
function lerDensidade(): Densidade {
  try {
    const d = localStorage.getItem("bion-densidade");
    return d === "compacta" || d === "grande" ? d : "confortavel";
  } catch {
    return "confortavel";
  }
}

function Linha({
  icone,
  titulo,
  detalhe,
  onClick,
  direita,
}: {
  icone: React.ReactNode;
  titulo: string;
  detalhe?: string;
  onClick?: () => void;
  direita?: React.ReactNode;
}) {
  const conteudo = (
    <>
      <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center bg-bion-ink/8 dark:bg-white/10 shrink-0">{icone}</span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-bold">{titulo}</span>
        {detalhe ? <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75">{detalhe}</span> : null}
      </span>
      {direita ?? (onClick ? <ChevronRight className="w-4 h-4 opacity-70" aria-hidden /> : null)}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3">
      {conteudo}
    </button>
  ) : (
    <div className="w-full flex items-center gap-3 px-4 py-3">{conteudo}</div>
  );
}

function Segmentado<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string;
  valor: T;
  opcoes: { v: T; r: string; i?: React.ReactNode }[];
  onMudar: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid gap-1 p-1 rounded-2xl bg-bion-ink/8 dark:bg-white/10" style={{ gridTemplateColumns: `repeat(${opcoes.length}, 1fr)` }}>
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => onMudar(o.v)}
          className={`py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            valor === o.v ? "bg-white text-bion-ink shadow dark:bg-zinc-800 dark:text-white" : "text-bion-ink/80 dark:text-bion-paper/80"
          }`}
        >
          {o.i}
          {o.r}
        </button>
      ))}
    </div>
  );
}

/** Página à ESQUERDA do carrossel — perfil e preferências do médico. */
export function PerfilMedicoPainel({
  dados,
  onAbrirSuporte,
  onAbrirTermos,
}: {
  dados: DadosMedico;
  onAbrirSuporte: () => void;
  onAbrirTermos: () => void;
}) {
  const router = useRouter();
  const { atualizarMedico, sair } = useBion();
  const { medico, sessao, dadosPessoais } = dados;
  const [sheetDados, setSheetDados] = useState(false);
  const [aberturasDados, setAberturasDados] = useState(0);
  const [tema, setTema] = useState<Tema>(lerTema);
  const [densidade, setDensidade] = useState<Densidade>(lerDensidade);
  const [enviando, setEnviando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);
  const confirmarFoto = useConfirmarSalvamento(medico?.foto ?? "", (a, b) => a === b);

  const alternarTema = (novo: Tema) => {
    setTema(novo);
    document.documentElement.classList.toggle("dark", novo === "escuro");
    try {
      localStorage.setItem("bion-tema", novo);
    } catch {
      /* ignora */
    }
  };
  const aplicarDensidade = (novo: Densidade) => {
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

  const aoEscolherFoto = (arquivo: File) => {
    if (!medico || enviando) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(arquivo.type)) {
      toast.error("Escolha uma imagem (JPG, PNG ou WebP).");
      return;
    }
    if (arquivo.size > FOTO_ORIGINAL_MAX) {
      toast.error("Imagem muito grande. Escolha uma foto de até 15 MB.");
      return;
    }
    const falha = () => {
      setEnviando(false);
      toast.error("Não foi possível ler esta imagem. Tente outra foto.");
    };
    setEnviando(true);
    const reader = new FileReader();
    reader.onerror = falha;
    reader.onload = () => {
      const img = new Image();
      img.onerror = falha;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.width || !img.height) return falha();
        const lado = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        const url = canvas.toDataURL("image/jpeg", 0.82);
        setEnviando(false);
        if (url.length > FOTO_MAX_BYTES) {
          toast.error("A foto ficou maior que 500 KB. Tente outra imagem.");
          return;
        }
        atualizarMedico(medico.id, { foto: url });
        confirmarFoto(url, "Enviando foto…", "Foto de perfil atualizada");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(arquivo);
  };

  const encerrar = async () => {
    await sair();
    router.replace("/entrar");
  };

  const abrirDadosPessoais = () => {
    if (dadosPessoais.erro && !dadosPessoais.dados) {
      dadosPessoais.recarregar();
      return;
    }
    if (!dadosPessoais.dados) return; // ainda carregando
    setAberturasDados((n) => n + 1);
    setSheetDados(true);
  };
  const dp = dadosPessoais.dados;
  const detalheDado = (valor: string) =>
    dp ? valor || "Não informado" : dadosPessoais.erro ? "Não foi possível carregar — toque para tentar de novo" : "Carregando…";
  const idade = dp?.dataNascimento ? idadeDeNascimento(dp.dataNascimento) : null;
  const nascimentoTexto = dp?.dataNascimento
    ? `${formatarDataNascimento(dp.dataNascimento)}${idade !== null ? ` · ${idade} anos` : ""}`
    : "";

  const grupo = "bp-glass divide-y divide-bion-ink/10 dark:divide-white/10 overflow-hidden";
  // Títulos de seção ficam DENTRO dos cards: o fundo do painel escurece
  // para o marinho e texto escuro solto perderia contraste.
  const tituloGrupo = "px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75";

  return (
    <div className="bm-painel h-full overflow-y-auto bp-coluna bp-safe-top px-5 pt-8 pb-20" aria-labelledby="bm-perfil-titulo">
      <h2 id="bm-perfil-titulo" className="sr-only">
        Meu perfil
      </h2>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-bion-sea text-white inline-flex items-center justify-center text-3xl font-black">
            {medico?.foto ? <img src={medico.foto} alt="Sua foto de perfil" className="w-full h-full object-cover" /> : iniciais(sessao.nome)}
          </div>
          {medico ? (
            <button
              type="button"
              onClick={() => inputFoto.current?.click()}
              disabled={enviando}
              aria-label="Trocar foto de perfil"
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white text-bion-ink shadow-lg inline-flex items-center justify-center dark:bg-zinc-800 dark:text-white"
            >
              <Camera className="w-4 h-4" />
            </button>
          ) : null}
          <input
            ref={inputFoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) aoEscolherFoto(f);
            }}
          />
        </div>
        <div className="mt-3 text-xl font-black">{sessao.nome}</div>
        <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75 break-all">{sessao.email}</div>
        {medico ? (
          <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-1">
            {medico.especialidade} · CRM {medico.crm}
          </div>
        ) : (
          <div className="mt-2">
            <EmBreve texto="Cadastro em validação" />
          </div>
        )}
      </div>

      <section className={`${grupo} mt-6`} aria-labelledby="bm-pf-dados">
        <h3 id="bm-pf-dados" className={tituloGrupo}>
          Dados pessoais
        </h3>
        <Linha icone={<Phone className="w-4 h-4" />} titulo="Telefone" detalhe={detalheDado(dp?.telefone ?? "")} onClick={abrirDadosPessoais} />
        <Linha icone={<CalendarDays className="w-4 h-4" />} titulo="Data de nascimento" detalhe={detalheDado(nascimentoTexto)} onClick={abrirDadosPessoais} />
        <Linha icone={<CircleUserRound className="w-4 h-4" />} titulo="Sexo" detalhe={detalheDado(dp?.genero ?? "")} onClick={abrirDadosPessoais} />
        <Linha icone={<Building2 className="w-4 h-4" />} titulo="CNPJ" detalhe={detalheDado(formatarCnpj(dp?.cnpj))} onClick={abrirDadosPessoais} />
      </section>

      <DadosPessoaisSheet
        key={`dados-${aberturasDados}`}
        aberto={sheetDados}
        onFechar={() => setSheetDados(false)}
        dados={dp}
        onSalvo={dadosPessoais.recarregar}
      />

      <section className={`${grupo} mt-4`} aria-labelledby="bm-pf-conta">
        <h3 id="bm-pf-conta" className={tituloGrupo}>
          Conta
        </h3>
        <Linha icone={<Wallet className="w-4 h-4" />} titulo="Repasses" detalhe="Valores a receber e extratos" direita={<EmBreve />} />
        <Linha icone={<LifeBuoy className="w-4 h-4" />} titulo="Suporte" detalhe="Abrir e acompanhar chamados" onClick={onAbrirSuporte} />
        <Linha icone={<FileText className="w-4 h-4" />} titulo="Termos e ajuda" detalhe="Termos de uso e perguntas frequentes" onClick={onAbrirTermos} />
      </section>

      <section className="bp-glass p-4 pt-3 space-y-3 mt-4" aria-labelledby="bm-pf-aparencia">
        <h3 id="bm-pf-aparencia" className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
          Aparência
        </h3>
        <Segmentado<Tema>
          rotulo="Tema"
          valor={tema}
          onMudar={alternarTema}
          opcoes={[
            { v: "claro", r: "Clean", i: <Sun className="w-3.5 h-3.5" /> },
            { v: "escuro", r: "Dark", i: <Moon className="w-3.5 h-3.5" /> },
          ]}
        />
        <Segmentado<Densidade>
          rotulo="Tamanho do texto"
          valor={densidade}
          onMudar={aplicarDensidade}
          opcoes={[
            { v: "compacta", r: "A−" },
            { v: "confortavel", r: "A" },
            { v: "grande", r: "A+" },
          ]}
        />
      </section>

      <div className={`${grupo} mt-4`}>
        <button type="button" onClick={encerrar} className="w-full flex items-center gap-3 px-4 py-3 text-red-700 dark:text-red-300">
          <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center bg-red-500/10 shrink-0">
            <LogOut className="w-4 h-4" />
          </span>
          <span className="text-sm font-bold">Sair</span>
        </button>
      </div>

    </div>
  );
}
