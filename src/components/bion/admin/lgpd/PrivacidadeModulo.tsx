"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Database, Handshake, ExternalLink, EyeOff, FileSearch, Info, Lock, Search, Shield, Stethoscope, Trash2, Users } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { urlDa, type View } from "@/lib/rotas";
import { TelaModulo } from "../ui/TelaModulo";
import { CardAdmin, KpiAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { IdCopiavel } from "../ui/IdCopiavel";
import { useRecurso } from "../repasses/recurso";
import { useDadosAdmin } from "../dados";
import { estadoMedico } from "../rotulos";
import { relativo } from "../tempo";
import { rotuloAcao } from "../auditoria/trilha";
import { AcaoLgpd, type AcaoAberta } from "./AcaoLgpd";
import { Cofre } from "./Cofre";
import { Consentimentos } from "./Consentimentos";
import { dataLgpd, estadoContaLgpd, eventosLgpd, type PacienteLgpd, type RespostaLgpd } from "./lgpd";

const SECOES = [
  { id: "lgpd-pacientes", rotulo: "Pacientes", icone: Users },
  { id: "lgpd-cofre", rotulo: "Cofre", icone: Lock },
  { id: "lgpd-consentimentos", rotulo: "Consentimentos", icone: Handshake },
  { id: "lgpd-medicos", rotulo: "Médicos", icone: Stethoscope },
  { id: "lgpd-registro", rotulo: "Registro", icone: FileSearch },
] as const;
const MEDICOS_INICIAIS = 8;

/**
 * Privacidade & LGPD do admin no visual Torre BION. Mesmas funções do
 * PrivacidadeAdmin (fica sem uso, não apagado): panorama, dados por paciente
 * (sempre por id, GET /api/admin/lgpd), anonimizar e anonimizar+arquivar
 * (POST, irreversíveis, confirmação digitada), busca no cofre com motivo
 * (POST /api/admin/lgpd/cofre/busca) e dados de médicos. Novo (dados que
 * já vinham no bootstrap): consentimentos e o registro dos eventos de LGPD
 * da auditoria. ?busca= já filtra a lista.
 */
export function PrivacidadeModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { consultas, documentos, medicos, auditLogs } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const [busca, setBusca] = useState(() => params.get("busca") ?? "");
  const [termo, setTermo] = useState(busca);
  const [acao, setAcao] = useState<AcaoAberta | null>(null);
  const [todosMedicos, setTodosMedicos] = useState(false);

  // Mesma espera de 300 ms da tela antiga antes de consultar o servidor.
  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300);
    return () => window.clearTimeout(t);
  }, [busca]);
  const lista = useRecurso<RespostaLgpd>(`/api/admin/lgpd?busca=${encodeURIComponent(termo)}`);
  const pacientes = lista.dados?.pacientes ?? [];
  const total = lista.dados?.total ?? 0;
  const eventos = useMemo(() => eventosLgpd(auditLogs), [auditLogs]);
  const medicosVisiveis = todosMedicos ? medicos : medicos.slice(0, MEDICOS_INICIAIS);

  // ?secao=lgpd-cofre (atalhos da busca): rola até a seção pedida.
  const secao = params.get("secao");
  useEffect(() => {
    if (!secao) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(secao);
      el?.scrollIntoView({ block: "start" });
      el?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(t);
  }, [secao]);

  const ir = (destino: string) => {
    const [v, q] = destino.split("?");
    router.push(q ? `${urlDa(v as View)}?${q}` : urlDa(v as View));
  };
  const rolar = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <TelaModulo
      titulo="Privacidade & LGPD"
      icone={Shield}
      subtitulo="Sempre por id do paciente · o prontuário é preservado"
      onAtualizar={() => {
        void atualizar();
        lista.recarregar();
      }}
      atualizando={atualizando || lista.carregando}
      ferramentas={
        <nav aria-label="Seções desta tela" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {SECOES.map((s) => (
            <button key={s.id} type="button" onClick={() => rolar(s.id)} className="ba-filtro shrink-0">
              <s.icone className="w-4 h-4" aria-hidden /> {s.rotulo}
            </button>
          ))}
        </nav>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiAdmin denso icone={Users} rotulo="Pacientes" valor={lista.dados ? total : "—"} carregando={!lista.dados && lista.carregando} detalhe={termo ? "com esta busca" : "cadastrados"} />
          <KpiAdmin denso icone={Stethoscope} rotulo="Médicos" valor={medicos.length} detalhe="cadastrados" />
          <KpiAdmin denso icone={Calendar} rotulo="Consultas" valor={consultas.length} detalhe="registradas" />
          <KpiAdmin denso icone={Database} rotulo="Documentos clínicos" valor={documentos.length} detalhe="emitidos" />
        </div>

        <section id="lgpd-pacientes" tabIndex={-1} className="scroll-mt-20 outline-none space-y-3" aria-labelledby="lgpd-pacientes-titulo">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h2 id="lgpd-pacientes-titulo" className="text-lg font-black flex-1">
              Dados por paciente
            </h2>
            <label className="relative sm:w-80">
              <span className="sr-only">Buscar paciente por nome, e-mail ou id</span>
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, e-mail ou id" className="ba-entrada !pl-10" />
            </label>
          </div>
          {lista.erro && !lista.dados ? (
            <div className="ba-card" data-denso="true">
              <EstadoErro titulo="Não foi possível carregar os pacientes" mensagem={lista.erro} onTentar={lista.recarregar} />
            </div>
          ) : !lista.dados ? (
            <Esqueleto variante="cards" quantidade={4} rotulo="Carregando pacientes…" />
          ) : (
            <>
              {lista.erro ? (
                <div className="ba-aviso" data-tom="atencao" role="alert">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <p>Não deu para atualizar ({lista.erro}). Mostrando a última lista carregada.</p>
                </div>
              ) : null}
              {total > pacientes.length ? (
                <p className="text-sm ba-texto-2">
                  Mostrando os {pacientes.length} cadastros mais recentes de {total}. Refine a busca por nome, e-mail ou id.
                </p>
              ) : null}
              {pacientes.length === 0 ? (
                <div className="ba-card" data-denso="true">
                  <EstadoVazio icone={Users} titulo={termo ? "Nenhum paciente com essa busca" : "Nenhum paciente cadastrado"} texto={termo ? "Confira a grafia, o e-mail ou cole o id completo." : undefined} />
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-busy={lista.carregando || undefined}>
                  {pacientes.map((p) => (
                    <li key={p.id}>
                      <CartaoPaciente p={p} onAcao={(tipo) => setAcao({ tipo, paciente: p })} onFicha={() => ir(`admin-pacientes?paciente=${encodeURIComponent(p.id)}`)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section id="lgpd-cofre" tabIndex={-1} className="scroll-mt-20 outline-none" aria-label="Busca no cofre">
          <Cofre />
        </section>

        <section id="lgpd-consentimentos" tabIndex={-1} className="scroll-mt-20 outline-none" aria-label="Consentimentos">
          <Consentimentos />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 items-start">
          <section id="lgpd-medicos" tabIndex={-1} className="scroll-mt-20 outline-none" aria-label="Dados de médicos">
            <CardAdmin titulo={`Dados de médicos · ${medicos.length}`} icone={Stethoscope}>
              {medicos.length === 0 ? (
                <p className="text-sm ba-texto-2">Nenhum médico cadastrado.</p>
              ) : (
                <>
                  <p className="text-xs ba-texto-2 mb-2">Nome, especialidade e CRM são dados profissionais públicos (não passam por anonimização).</p>
                  <ul className="divide-y divide-[color:var(--ba-borda)]">
                    {medicosVisiveis.map((m) => (
                      <li key={m.id} className="py-2 flex items-center gap-3">
                        <span className="flex-1 min-w-0">
                          <span className="font-bold block truncate">{m.nome}</span>
                          <span className="text-xs ba-texto-2 block truncate">
                            {m.especialidade} · {m.crm}
                          </span>
                        </span>
                        <ChipEstado estado={estadoMedico(m.status)} />
                      </li>
                    ))}
                  </ul>
                  {medicos.length > MEDICOS_INICIAIS ? (
                    <button type="button" onClick={() => setTodosMedicos((v) => !v)} className="ba-botao ba-botao-secundario w-full mt-2" aria-expanded={todosMedicos}>
                      {todosMedicos ? "Mostrar menos" : `Mostrar todos (${medicos.length})`}
                    </button>
                  ) : null}
                </>
              )}
            </CardAdmin>
          </section>

          <section id="lgpd-registro" tabIndex={-1} className="scroll-mt-20 outline-none" aria-label="Registro LGPD recente">
            <CardAdmin
              titulo="Registro LGPD recente"
              icone={FileSearch}
              acao={
                <button type="button" onClick={() => ir("auditoria")} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
                  Auditoria <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                </button>
              }
            >
              {eventos.length === 0 ? (
                <p className="text-sm ba-texto-2">Nenhum evento de LGPD entre os eventos recentes da auditoria.</p>
              ) : (
                <ul className="space-y-1.5">
                  {eventos.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => ir(`auditoria?evento=${encodeURIComponent(l.id)}`)}
                        className="ba-card w-full text-left flex items-center gap-3"
                        data-denso="true"
                        data-tom={l.severidade === "critical" ? "critico" : l.severidade === "warning" ? "atencao" : undefined}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold block truncate">{rotuloAcao(l.acao)}</span>
                          <span className="text-xs ba-texto-2 block truncate">
                            {l.usuario} · {relativo(l.ts, agora)}
                          </span>
                        </span>
                        <ExternalLink className="w-4 h-4 ba-texto-3 shrink-0" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardAdmin>
          </section>
        </div>
      </div>
      <AcaoLgpd
        acao={acao}
        onFechar={() => setAcao(null)}
        onFeito={() => {
          setAcao(null);
          lista.recarregar();
        }}
      />
    </TelaModulo>
  );
}

function CartaoPaciente({ p, onAcao, onFicha }: { p: PacienteLgpd; onAcao: (tipo: AcaoAberta["tipo"]) => void; onFicha: () => void }) {
  const e = estadoContaLgpd(p);
  return (
    <article className="ba-card h-full flex flex-col" data-denso="true" data-tom={p.anonimizado ? undefined : e.tom}>
      <div className="flex items-start gap-2">
        <h3 className="font-bold leading-snug break-words flex-1 min-w-0">{p.nome}</h3>
        <ChipEstado estado={e} />
      </div>
      <IdCopiavel id={p.id} rotulo={`Copiar ID de ${p.nome}`} />
      <p className="text-xs ba-texto-2 break-all">
        {p.emailMascarado}
        {p.cpfMascarado ? ` · CPF ${p.cpfMascarado}` : ""} · cadastro {dataLgpd(p.cadastradoEm)}
      </p>
      <p className="text-xs ba-texto-2 mt-0.5">
        {p.consultas} consultas · {p.documentos} documentos · {p.avaliacoes} avaliações · {p.arquivos} arquivos
      </p>
      <div className="flex-1 min-h-3" aria-hidden />
      <div className="pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: "var(--ba-borda)" }}>
        <button type="button" onClick={onFicha} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
          <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Ficha
        </button>
        {p.anonimizado ? (
          <span className="text-xs ba-texto-2 self-center">Anonimizado: não há mais ações. Prontuário preservado.</span>
        ) : (
          <>
            <button type="button" onClick={() => onAcao("anonimizar")} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
              <EyeOff className="w-3.5 h-3.5" aria-hidden /> Anonimizar…
            </button>
            <button type="button" onClick={() => onAcao("excluir")} className="ba-botao ba-botao-perigo !min-h-9 !px-3 !text-xs">
              <Trash2 className="w-3.5 h-3.5" aria-hidden /> Anonimizar e arquivar…
            </button>
          </>
        )}
      </div>
    </article>
  );
}
