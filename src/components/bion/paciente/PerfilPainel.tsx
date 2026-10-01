"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Briefcase,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Droplets,
  FileUp,
  HeartCrack,
  LifeBuoy,
  LogOut,
  Moon,
  Pencil,
  Phone,
  Pill,
  Scale,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { formatarAltura, formatarPeso } from "@/lib/medidas-paciente";
import { formatarDataNascimento, hojeIsoSaoPaulo, idadeDeNascimento, type ComDataNascimento } from "@/lib/idade";

/**
 * Painel do perfil (gesto esquerda → direita): foto, dados pessoais e de
 * saúde, histórico de consultas, uploads na BION IA, pagamentos, suporte,
 * termos e alternância Dark/Clean.
 */

/** Limite do arquivo ORIGINAL antes do recorte para 256×256 (o servidor valida o resultado). */
const FOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;

const INICIAIS = (nome: string) =>
  nome
    .split(" ")
    .filter((p) => p.length > 1)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function Linha({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-bion-ink/45 dark:text-bion-paper/45">{icone}</span>
      <span className="text-sm text-bion-ink/60 dark:text-bion-paper/60 w-28 shrink-0">{rotulo}</span>
      <span className="text-sm font-semibold text-bion-ink dark:text-bion-paper text-right flex-1">{valor || "—"}</span>
    </div>
  );
}

function Chips({ itens, cor }: { itens: string[]; cor: string }) {
  if (!itens.length) return <span className="text-sm opacity-50">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {itens.map((i) => (
        <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cor}`}>
          {i}
        </span>
      ))}
    </div>
  );
}

export function PerfilPainel({ onSair }: { onSair: () => void }) {
  const { pacientePerfil, sessao, consultas, arquivos, exames, atualizarPacientePerfil } = useBion();
  const router = useRouter();
  const inputFotoRef = useRef<HTMLInputElement>(null);
  // M4: data de nascimento ("YYYY-MM-DD" do payload; o tipo do store não a declara).
  const dataNascimento = (pacientePerfil as (typeof pacientePerfil & ComDataNascimento) | undefined)?.dataNascimento ?? "";
  const idadeExibida = (dataNascimento ? idadeDeNascimento(dataNascimento) : null) ?? pacientePerfil?.idade ?? 0;
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [form, setForm] = useState({
    dataNascimento,
    telefone: pacientePerfil?.telefone ?? "",
    profissao: pacientePerfil?.profissao ?? "",
    estadoCivil: pacientePerfil?.estadoCivil ?? "",
    alergias: (pacientePerfil?.alergias ?? []).join(", "),
    comorbidades: (pacientePerfil?.comorbidades ?? []).join(", "),
    medicamentos: (pacientePerfil?.medicamentos ?? []).join(", "),
  });
  const [tema, setTema] = useState(() => {
    if (typeof window === "undefined") return "claro" as "claro" | "escuro";
    try {
      return (localStorage.getItem("bion-tema") === "escuro" ? "escuro" : "claro") as "claro" | "escuro";
    } catch {
      return "claro" as "claro" | "escuro";
    }
  });
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
    () => arquivos.filter((a) => a.enviadoPor === "paciente" || a.consulta === "BION IA").slice(0, 20),
    [arquivos],
  );
  const pagamentos = consultasDoPaciente.filter((c) => c.status !== "cancelada");

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

  const alternarTema = (novo: "claro" | "escuro") => {
    setTema(novo);
    document.documentElement.classList.toggle("dark", novo === "escuro");
    try {
      localStorage.setItem("bion-tema", novo === "escuro" ? "escuro" : "claro");
    } catch {
      /* ignora */
    }
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

  // A2: aguarda a resposta do servidor. Em erro (toast vem de `api`), o modo
  // de edição continua aberto com o que foi digitado. Envia só os campos
  // alterados — dado legado fora do formato novo (A1) não bloqueia o resto.
  const salvar = async () => {
    if (salvando) return;
    const lista = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
    const novo = {
      dataNascimento: form.dataNascimento || null,
      telefone: form.telefone.trim(),
      profissao: form.profissao.trim(),
      estadoCivil: form.estadoCivil,
      alergias: lista(form.alergias),
      comorbidades: lista(form.comorbidades),
      medicamentos: lista(form.medicamentos),
    };
    const atual = {
      dataNascimento: dataNascimento || null,
      telefone: pacientePerfil?.telefone ?? "",
      profissao: pacientePerfil?.profissao ?? "",
      estadoCivil: pacientePerfil?.estadoCivil ?? "",
      alergias: pacientePerfil?.alergias ?? [],
      comorbidades: pacientePerfil?.comorbidades ?? [],
      medicamentos: pacientePerfil?.medicamentos ?? [],
    };
    const alterado = (Object.keys(novo) as (keyof typeof novo)[]).filter(
      (k) => JSON.stringify(novo[k]) !== JSON.stringify(atual[k]),
    );
    if (!alterado.length) {
      setEditando(false);
      return;
    }
    const patch = Object.fromEntries(alterado.map((k) => [k, novo[k]])) as Partial<typeof novo>;
    setSalvando(true);
    const ok = await atualizarPacientePerfil(patch);
    setSalvando(false);
    if (ok) {
      setEditando(false);
      toast.success("Perfil atualizado.");
    }
  };

  const chip = "bg-bion-ink/8 dark:bg-white/10 text-bion-ink dark:text-bion-paper";

  return (
    <div className="px-5 py-6 space-y-4 bp-safe-top pb-24">
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

      {/* Cabeçalho do perfil */}
      <div className="bp-glass p-6 flex flex-col items-center text-center">
        <div className="relative">
          {pacientePerfil?.foto ? (
             
            <img src={pacientePerfil.foto} alt={`Foto de ${sessao.nome}`} className="w-24 h-24 rounded-full object-cover border-4 border-white/80 dark:border-white/20 shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-bion-sea to-bion-ink text-white inline-flex items-center justify-center text-2xl font-black border-4 border-white/80 dark:border-white/20 shadow-lg">
              {INICIAIS(sessao.nome)}
            </div>
          )}
          <button type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            aria-busy={enviandoFoto}
            aria-label={enviandoFoto ? "Enviando foto de perfil" : "Alterar foto de perfil"}
            className="absolute -bottom-1 -right-1 bp-acao w-9 h-9 inline-flex items-center justify-center !rounded-full disabled:opacity-60"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
        <h2 className="mt-3 text-lg font-bold text-bion-ink dark:text-bion-paper">{sessao.nome}</h2>
        <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60">{sessao.email}</p>
      </div>

      {/* Dados pessoais */}
      <div className="bp-glass p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper">Dados pessoais</h3>
          <button type="button"
            onClick={() => {
              if (editando) void salvar();
              else {
                setForm({
                  dataNascimento,
                  telefone: pacientePerfil?.telefone ?? "",
                  profissao: pacientePerfil?.profissao ?? "",
                  estadoCivil: pacientePerfil?.estadoCivil ?? "",
                  alergias: (pacientePerfil?.alergias ?? []).join(", "),
                  comorbidades: (pacientePerfil?.comorbidades ?? []).join(", "),
                  medicamentos: (pacientePerfil?.medicamentos ?? []).join(", "),
                });
                setEditando(true);
              }
            }}
            disabled={salvando}
            className="text-xs font-bold text-bion-sea dark:text-sky-300 inline-flex items-center gap-1 disabled:opacity-50"
          >
            {editando ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editando ? "Salvar" : "Editar"}
          </button>
        </div>
        {editando ? (
          <div className="space-y-3 pt-1">
            <label className="block">
              <span className="text-xs font-semibold text-bion-ink/70 dark:text-bion-paper/70">Data de nascimento</span>
              <input type="date" value={form.dataNascimento} onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))} min="1900-01-01" max={hojeIsoSaoPaulo()} autoComplete="bday" className="bp-entrada mt-1 w-full px-4 py-2.5 text-sm" />
            </label>
            <input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="Telefone" aria-label="Telefone" type="tel" inputMode="tel" autoComplete="tel" maxLength={25} className="bp-entrada w-full px-4 py-2.5 text-sm" />
            <input value={form.profissao} onChange={(e) => setForm((f) => ({ ...f, profissao: e.target.value }))} placeholder="Profissão" aria-label="Profissão" maxLength={80} className="bp-entrada w-full px-4 py-2.5 text-sm" />
            <select value={form.estadoCivil} onChange={(e) => setForm((f) => ({ ...f, estadoCivil: e.target.value }))} aria-label="Estado civil" className="bp-entrada w-full px-4 py-2.5 text-sm">
              <option value="">Estado civil…</option>
              {["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input value={form.alergias} onChange={(e) => setForm((f) => ({ ...f, alergias: e.target.value }))} placeholder="Alergias (separadas por vírgula)" aria-label="Alergias separadas por vírgula" className="bp-entrada w-full px-4 py-2.5 text-sm" />
            <input value={form.comorbidades} onChange={(e) => setForm((f) => ({ ...f, comorbidades: e.target.value }))} placeholder="Comorbidades (separadas por vírgula)" aria-label="Comorbidades separadas por vírgula" className="bp-entrada w-full px-4 py-2.5 text-sm" />
            <input value={form.medicamentos} onChange={(e) => setForm((f) => ({ ...f, medicamentos: e.target.value }))} placeholder="Medicamentos em uso (separados por vírgula)" aria-label="Medicamentos separados por vírgula" className="bp-entrada w-full px-4 py-2.5 text-sm" />
            <button type="button" onClick={() => void salvar()} disabled={salvando} className="bp-acao w-full py-2.5 text-sm">
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-bion-ink/5 dark:divide-white/5">
            <Linha icone={<CalendarDays className="w-4 h-4" />} rotulo="Nascimento" valor={formatarDataNascimento(dataNascimento)} />
            <Linha icone={<CalendarDays className="w-4 h-4" />} rotulo="Idade" valor={dataNascimento || idadeExibida > 0 ? `${idadeExibida} ${idadeExibida === 1 ? "ano" : "anos"}` : ""} />
            <Linha icone={<CircleUserRound className="w-4 h-4" />} rotulo="Sexo" valor={pacientePerfil?.genero} />
            <Linha icone={<Phone className="w-4 h-4" />} rotulo="Telefone" valor={pacientePerfil?.telefone} />
            <Linha icone={<Briefcase className="w-4 h-4" />} rotulo="Profissão" valor={pacientePerfil?.profissao} />
            <Linha icone={<HeartCrack className="w-4 h-4" />} rotulo="Estado civil" valor={pacientePerfil?.estadoCivil} />
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-bion-ink/45 dark:text-bion-paper/45"><Droplets className="w-4 h-4" /></span>
              <span className="text-sm text-bion-ink/60 dark:text-bion-paper/60 w-28 shrink-0">Tipo sanguíneo</span>
              <span className="text-sm font-semibold text-bion-ink dark:text-bion-paper text-right flex-1">{pacientePerfil?.tipoSanguineo || "—"}</span>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-bion-ink/45 dark:text-bion-paper/45"><Activity className="w-4 h-4" /></span>
              <span className="text-sm text-bion-ink/60 dark:text-bion-paper/60 w-28 shrink-0">Alergias</span>
              <div className="flex-1 flex justify-end">
                <Chips itens={pacientePerfil?.alergias ?? []} cor="bg-amber-500/15 text-amber-800 dark:text-amber-300" />
              </div>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-bion-ink/45 dark:text-bion-paper/45"><HeartCrack className="w-4 h-4" /></span>
              <span className="text-sm text-bion-ink/60 dark:text-bion-paper/60 w-28 shrink-0">Comorbidades</span>
              <div className="flex-1 flex justify-end">
                <Chips itens={pacientePerfil?.comorbidades ?? []} cor="bg-red-500/10 text-red-800 dark:text-red-300" />
              </div>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-bion-ink/45 dark:text-bion-paper/45"><Pill className="w-4 h-4" /></span>
              <span className="text-sm text-bion-ink/60 dark:text-bion-paper/60 w-28 shrink-0">Medicamentos</span>
              <div className="flex-1 flex justify-end">
                <Chips itens={pacientePerfil?.medicamentos ?? []} cor={chip} />
              </div>
            </div>
            <Linha icone={<Scale className="w-4 h-4" />} rotulo="Peso / Altura" valor={[formatarPeso(pacientePerfil?.peso), formatarAltura(pacientePerfil?.altura)].filter(Boolean).join(" · ")} />
          </div>
        )}
      </div>

      {/* Histórico de consultas */}
      <div className="bp-glass p-5">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-3">Histórico de consultas</h3>
        {consultasDoPaciente.length === 0 ? (
          <p className="text-sm opacity-60">Nenhuma consulta ainda — agende pela BION IA.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto bp-coluna">
            {consultasDoPaciente.map((c) => (
              <li key={c.id} className="rounded-2xl bg-white/50 dark:bg-white/5 px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-bion-ink dark:text-bion-paper truncate">{c.especialidade} · {c.medico}</div>
                  <div className="text-xs opacity-60">{c.data} às {c.hora} · {c.status === "concluida" ? "Realizada" : c.status === "cancelada" ? "Cancelada" : c.status === "em_espera" ? "Aguardando" : c.status === "pendente_anamnese" ? "Pendente anamnese" : "Confirmada"}</div>
                </div>
                <span className="text-xs font-bold shrink-0 text-bion-ink dark:text-bion-paper">{c.valor}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Uploads na BION IA */}
      <div className="bp-glass p-5">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-1 flex items-center gap-2">
          <FileUp className="w-4 h-4" /> Uploads na BION IA
        </h3>
        <p className="text-xs opacity-60 mb-3">{uploads.length} laudo(s) enviado(s) · {exames.length} grupo(s) de resultados ativos</p>
        {uploads.length === 0 ? (
          <p className="text-sm opacity-60">Nenhum upload ainda. Envie laudos pela BION IA.</p>
        ) : (
          <ul className="space-y-2">
            {uploads.map((a) => (
              <li key={a.id} className="text-sm flex items-center justify-between gap-2 text-bion-ink dark:text-bion-paper">
                <span className="truncate">{a.nome}</span>
                <span className="text-xs opacity-60 shrink-0">{a.data} · {a.tamanhoKb} KB</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagamentos */}
      <div className="bp-glass p-5">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Pagamentos de consultas
        </h3>
        {pagamentos.length === 0 ? (
          <p className="text-sm opacity-60">Nenhum pagamento ainda.</p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto bp-coluna">
            {pagamentos.map((c) => (
              <li key={c.id} className="text-sm flex items-center justify-between gap-2">
                <span className="truncate text-bion-ink dark:text-bion-paper">{c.especialidade} · {c.data}</span>
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.pago ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                  {c.pago ? "Pago" : "Pendente"} {c.valor ? `· ${c.valor}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preferências e acessos */}
      <div className="bp-glass p-5 space-y-1">
        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mb-2">Modo do app</h3>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-bion-ink/5 dark:bg-white/5 p-1.5">
          <button type="button"
            onClick={() => alternarTema("claro")}
            aria-pressed={tema === "claro"}
            className={`rounded-full py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${tema === "claro" ? "bp-acao" : "text-bion-ink/60 dark:text-white/60"}`}
          >
            <Sun className="w-4 h-4" /> Clean
          </button>
          <button type="button"
            onClick={() => alternarTema("escuro")}
            aria-pressed={tema === "escuro"}
            className={`rounded-full py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${tema === "escuro" ? "bp-acao" : "text-bion-ink/60 dark:text-white/60"}`}
          >
            <Moon className="w-4 h-4" /> Dark
          </button>
        </div>

        <h3 className="text-sm font-bold text-bion-ink dark:text-bion-paper mt-4 mb-2">Tamanho do texto</h3>
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-bion-ink/5 dark:bg-white/5 p-1.5" role="group" aria-label="Densidade do texto">
          {(
            [
              ["compacta", "Compacto"],
              ["confortavel", "Padrão"],
              ["grande", "Grande"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => aplicarDensidade(id)}
              aria-pressed={densidade === id}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                densidade === id ? "bp-acao" : "text-bion-ink/60 dark:text-white/60"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => router.push("/suporte")} className="w-full flex items-center justify-between py-3 px-1 group" role="link">
          <span className="text-sm font-semibold text-bion-ink dark:text-bion-paper inline-flex items-center gap-2.5">
            <LifeBuoy className="w-4 h-4 opacity-60" /> Suporte
          </span>
          <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-0.5 transition" />
        </button>
        <button type="button" onClick={() => router.push("/privacidade")} className="w-full flex items-center justify-between py-3 px-1 group" role="link">
          <span className="text-sm font-semibold text-bion-ink dark:text-bion-paper inline-flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 opacity-60" /> Termos e privacidade
          </span>
          <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-0.5 transition" />
        </button>
      </div>

      <button type="button"
        onClick={onSair}
        className="w-full rounded-full border-2 border-red-500/30 text-red-600 dark:text-red-400 py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-red-500/10 transition"
      >
        <LogOut className="w-4 h-4" /> Sair da conta
      </button>
    </div>
  );
}
