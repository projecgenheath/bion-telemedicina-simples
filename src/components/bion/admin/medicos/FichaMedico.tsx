"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Ban, CheckCircle2, ExternalLink, Pencil, RotateCcw, ShieldAlert, Star } from "lucide-react";
import { useBion, type Medico } from "@/lib/bion-store";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { AbasFicha, Avatar, ConfirmacaoDigitada } from "../ui/Formulario";
import { avisosRecebimento, estadoConsulta, estadoRepasse, estadoSeveridade, humanizar } from "../rotulos";
import { brl, competenciaCurta, dataLonga, hora as horaDe, relativo, rotuloDia } from "../tempo";
import { useRecurso } from "../repasses/recurso";
import { formatarDocumento } from "../repasses/formatos";
import type { RespostaLista } from "../repasses/tipos";
import { FormularioMedico } from "./FormularioMedico";
import { useAcoesMedico } from "./acoes";
import { useEnviosPendentes } from "./adiadas";
import {
  acoesDoStatus,
  avaliacoesDoMedico,
  confirmacaoConfere,
  consultas30d,
  estadoMedicoAdmin,
  eventosDaEntidade,
  iniciais,
  proximasDoMedico,
  realizadasDoMedico,
  statusDe,
} from "./medicos";

export type ModoFicha = "ficha" | "editar" | "suspender" | "arquivar";
type AbaFicha = "perfil" | "agenda" | "avaliacoes" | "financeiro" | "auditoria";

/** Ficha do médico (painel lateral no desktop, sheet no celular) com ações reais. */
export function FichaMedico({ id, agora, modoInicial = "ficha", onFechar }: { id: string | null; agora: number; modoInicial?: ModoFicha; onFechar: () => void }) {
  const { medicos } = useBion();
  const m = id ? medicos.find((x) => x.id === id) : undefined;
  const [modo, setModo] = useState<ModoFicha>(modoInicial);
  const [sujo, setSujo] = useState(false);
  const [chave, setChave] = useState(`${id}:${modoInicial}`);
  if (`${id}:${modoInicial}` !== chave) {
    setChave(`${id}:${modoInicial}`);
    setModo(modoInicial);
    setSujo(false);
  }
  const voltar = () => {
    setModo("ficha");
    setSujo(false);
  };
  const titulo =
    modo === "editar" ? "Editar médico" : modo === "suspender" ? "Suspender médico" : modo === "arquivar" ? "Arquivar médico" : (m?.nome ?? "Médico");

  return (
    <SheetAdmin
      aberto={Boolean(id)}
      onFechar={onFechar}
      titulo={titulo}
      descricao={m ? `${m.especialidade} · CRM ${m.crm}` : undefined}
      alteracoesPendentes={modo !== "ficha" && sujo}
    >
      {!m ? (
        <EstadoVazio titulo="Médico não encontrado" texto="Ele não está na lista carregada. Atualize a tela." tom="atencao" />
      ) : modo === "editar" ? (
        <FormularioMedico key={m.id} medico={m} onCancelar={voltar} onSalvo={voltar} onSujo={setSujo} />
      ) : modo === "suspender" ? (
        <Suspender medico={m} agora={agora} onVoltar={voltar} onSujo={setSujo} />
      ) : modo === "arquivar" ? (
        <Arquivar medico={m} onVoltar={voltar} onFeito={onFechar} onSujo={setSujo} />
      ) : (
        <Ficha medico={m} agora={agora} onModo={setModo} />
      )}
    </SheetAdmin>
  );
}

function Ficha({ medico: m, agora, onModo }: { medico: Medico; agora: number; onModo: (m: ModoFicha) => void }) {
  const { consultas } = useBion();
  const { aprovarComDesfazer } = useAcoesMedico();
  const pendentes = useEnviosPendentes();
  const [aba, setAba] = useState<AbaFicha>("perfil");
  const s = statusDe(m);
  const acoes = acoesDoStatus(s);
  const pendente = pendentes.has(`medico:${m.id}`);
  const proximas = proximasDoMedico(consultas, m.id, agora);

  return (
    <div className="space-y-4">
      <div className="ba-card" data-tom={estadoMedicoAdmin(s).tom} data-denso="true">
        <div className="flex items-center gap-3">
          <Avatar foto={m.foto} iniciais={iniciais(m.nome)} tamanho="w-16 h-16" />
          <div className="min-w-0">
            <p className="font-black text-lg leading-tight break-words">{m.nome}</p>
            <p className="text-sm ba-texto-2">CRM {m.crm}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <ChipEstado estado={pendente ? { rotulo: s === "pendente" ? "Aprovando…" : "Reativando…", tom: "sinal" } : estadoMedicoAdmin(s)} />
          <ChipEstado tom="neutro" ponto={false}>
            <Star className="w-3 h-3 inline -mt-0.5" aria-hidden /> {m.numAvaliacoes ? `${m.avaliacao.toFixed(1)} (${m.numAvaliacoes})` : "sem avaliações"}
          </ChipEstado>
          <ChipEstado tom="neutro" ponto={false}>
            {consultas30d(consultas, m.id, agora)} consultas em 30 dias
          </ChipEstado>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {acoes.aprovar || acoes.reativar ? (
          <button type="button" disabled={pendente} onClick={() => aprovarComDesfazer(m, acoes.aprovar ? "aprovar" : "reativar")} className="ba-botao ba-botao-primario">
            {acoes.aprovar ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <RotateCcw className="w-4 h-4" aria-hidden />}
            {acoes.aprovar ? "Aprovar" : "Reativar"}
          </button>
        ) : null}
        {s !== "arquivado" ? (
          <button type="button" onClick={() => onModo("editar")} className="ba-botao ba-botao-secundario">
            <Pencil className="w-4 h-4" aria-hidden /> Editar
          </button>
        ) : null}
        {acoes.suspender ? (
          <button type="button" disabled={pendente} onClick={() => onModo("suspender")} className="ba-botao ba-botao-perigo">
            <Ban className="w-4 h-4" aria-hidden /> Suspender…
          </button>
        ) : null}
      </div>
      {s === "arquivado" ? (
        <div className="ba-aviso" data-tom="neutro">
          <Archive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>Cadastro arquivado: sem acesso e fora das listas. O histórico clínico continua preservado.</p>
        </div>
      ) : null}

      <AbasFicha
        rotulo="Ficha do médico"
        ativa={aba}
        onMudar={setAba}
        abas={[
          { id: "perfil", rotulo: "Perfil" },
          { id: "agenda", rotulo: "Agenda", contagem: proximas.length },
          { id: "avaliacoes", rotulo: "Avaliações" },
          { id: "financeiro", rotulo: "Financeiro" },
          { id: "auditoria", rotulo: "Auditoria" },
        ]}
      />
      <div role="tabpanel" aria-labelledby={`ficha-aba-${aba}`}>
        {aba === "perfil" ? <Perfil medico={m} onArquivar={acoes.arquivar ? () => onModo("arquivar") : undefined} /> : null}
        {aba === "agenda" ? <Agenda medico={m} agora={agora} /> : null}
        {aba === "avaliacoes" ? <Avaliacoes medico={m} /> : null}
        {aba === "financeiro" ? <Financeiro medico={m} agora={agora} /> : null}
        {aba === "auditoria" ? <Auditoria id={m.id} agora={agora} /> : null}
      </div>
    </div>
  );
}

function Perfil({ medico: m, onArquivar }: { medico: Medico; onArquivar?: () => void }) {
  return (
    <div className="space-y-4">
      <dl className="ba-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-denso="true">
        <dt className="ba-texto-2">Especialidade</dt>
        <dd className="break-words">{m.especialidade}</dd>
        {m.subespecialidades.length ? (
          <>
            <dt className="ba-texto-2">Subespecialidades</dt>
            <dd className="break-words">{m.subespecialidades.join(", ")}</dd>
          </>
        ) : null}
        <dt className="ba-texto-2">Valor</dt>
        <dd className="tabular-nums">{brl(Math.round(m.valor * 100))}</dd>
        <dt className="ba-texto-2">Formação</dt>
        <dd className="break-words">{m.formacao || "—"}</dd>
        <dt className="ba-texto-2">Experiência</dt>
        <dd className="break-words">{m.experiencia || "—"}</dd>
        <dt className="ba-texto-2">Idiomas</dt>
        <dd className="break-words">{m.idiomas.join(", ") || "—"}</dd>
        {m.bio ? (
          <>
            <dt className="ba-texto-2">Bio</dt>
            <dd className="break-words whitespace-pre-line">{m.bio}</dd>
          </>
        ) : null}
      </dl>
      <div>
        <p className="ba-rotulo">Horários da grade (todos os dias)</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {m.horariosDisponiveis.length ? (
            m.horariosDisponiveis.map((h) => (
              <ChipEstado key={h} tom="sinal" ponto={false}>
                {h}
              </ChipEstado>
            ))
          ) : (
            <span className="text-sm ba-texto-2">Sem horários na grade.</span>
          )}
        </div>
      </div>
      <p className="text-xs ba-texto-2">CNPJ e chave PIX aparecem na aba Financeiro (vêm dos repasses).</p>
      {onArquivar ? (
        <section className="ba-card" data-tom="critico" data-denso="true" aria-label="Zona de cuidado">
          <p className="font-bold">Zona de cuidado</p>
          <p className="text-sm ba-texto-2 mt-0.5">Arquivar tira o acesso do médico e o retira das listas. Consultas, prontuários e documentos ficam preservados.</p>
          <button type="button" onClick={onArquivar} className="ba-botao ba-botao-perigo mt-3">
            <Archive className="w-4 h-4" aria-hidden /> Arquivar médico…
          </button>
        </section>
      ) : null}
    </div>
  );
}

function Agenda({ medico: m, agora }: { medico: Medico; agora: number }) {
  const { consultas } = useBion();
  const proximas = proximasDoMedico(consultas, m.id, agora);
  const realizadas = realizadasDoMedico(consultas, m.id);
  const bloqueios = useRecurso<{ dias: string[] }>(`/api/medicos/${encodeURIComponent(m.id)}/bloqueios`);
  return (
    <div className="space-y-4">
      <section>
        <p className="ba-rotulo">Próximas consultas</p>
        {proximas.length === 0 ? (
          <p className="text-sm ba-texto-2 mt-1">Nenhuma consulta marcada.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {proximas.map((c) => (
              <li key={c.id}>
                <Link href={`/admin-agendamentos?consulta=${encodeURIComponent(c.id)}`} className="ba-card flex items-center gap-3" data-denso="true">
                  <span className="shrink-0 w-24 text-sm">
                    <span className="ba-texto-2">{rotuloDia(c.ts, agora)}</span> <b className="tabular-nums">{horaDe(c.ts)}</b>
                  </span>
                  <span className="flex-1 min-w-0 truncate font-semibold">{c.paciente}</span>
                  <ChipEstado estado={estadoConsulta(c.status)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <p className="ba-rotulo">Dias bloqueados pelo médico</p>
        {bloqueios.carregando ? (
          <Esqueleto quantidade={1} />
        ) : bloqueios.erro ? (
          <p className="text-sm mt-1" style={{ color: "var(--ba-critico)" }}>
            {bloqueios.erro}
          </p>
        ) : (bloqueios.dados?.dias ?? []).length === 0 ? (
          <p className="text-sm ba-texto-2 mt-1">Nenhum dia bloqueado.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(bloqueios.dados?.dias ?? []).map((d) => (
              <ChipEstado key={d} tom="atencao">
                {dataLonga(Date.parse(`${d}T12:00:00-03:00`))}
              </ChipEstado>
            ))}
          </div>
        )}
      </section>
      <p className="text-sm ba-texto-2">
        {realizadas.length} {realizadas.length === 1 ? "consulta realizada" : "consultas realizadas"} entre as carregadas.
      </p>
    </div>
  );
}

function Avaliacoes({ medico: m }: { medico: Medico }) {
  const { avaliacoes, medicos } = useBion();
  const { lista, homonimo } = avaliacoesDoMedico(avaliacoes, m, medicos);
  return (
    <div className="space-y-3">
      <div className="ba-card flex items-center gap-3" data-denso="true">
        <Star className="w-6 h-6" style={{ color: "var(--ba-atencao)" }} aria-hidden />
        <div>
          <p className="ba-numero text-2xl">{m.numAvaliacoes ? m.avaliacao.toFixed(1) : "—"}</p>
          <p className="text-xs ba-texto-2">
            {m.numAvaliacoes} {m.numAvaliacoes === 1 ? "avaliação" : "avaliações"} (calculado pelo servidor)
          </p>
        </div>
      </div>
      {homonimo ? (
        <div className="ba-aviso" data-tom="atencao">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>Há outro médico com o mesmo nome. As avaliações abaixo chegam só com o nome e podem ser dele.</p>
        </div>
      ) : null}
      {lista.length === 0 ? (
        <p className="text-sm ba-texto-2">Nenhuma avaliação com comentário carregada.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id} className="ba-card" data-denso="true">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold break-words">{a.paciente}</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--ba-atencao)" }}>
                  ★ {a.nota}
                </span>
              </div>
              {a.comentario ? <p className="text-sm ba-texto-2 mt-1 break-words">“{a.comentario}”</p> : null}
              <p className="text-xs ba-texto-3 mt-1">{a.quando}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Financeiro({ medico: m, agora }: { medico: Medico; agora: number }) {
  const r = useRecurso<RespostaLista>(`/api/admin/repasses?status=todos&medicoId=${encodeURIComponent(m.id)}`);
  if (r.carregando && !r.dados) return <Esqueleto quantidade={3} />;
  if (r.erro && !r.dados) return <EstadoErro mensagem={r.erro} onTentar={r.recarregar} />;
  const repasses = r.dados?.repasses ?? [];
  const cnpj = repasses.find((x) => x.cnpj)?.cnpj ?? null;
  const aberto = repasses.find((x) => x.status === "fechado");
  const aPagar = repasses.filter((x) => x.status === "fechado").reduce((s, x) => s + x.liquidoCentavos, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="ba-card" data-denso="true" data-tom={aPagar ? "dinheiro" : undefined}>
          <p className="ba-rotulo">A pagar</p>
          <p className="ba-numero text-xl">{brl(aPagar)}</p>
        </div>
        <div className="ba-card" data-denso="true">
          <p className="ba-rotulo">CNPJ</p>
          <p className="font-bold tabular-nums break-words">{cnpj ? formatarDocumento(cnpj).replace("/", "/\u200b") : "não informado"}</p>
        </div>
      </div>
      <div className="ba-card" data-denso="true">
        <p className="ba-rotulo">Chave PIX</p>
        {aberto ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {avisosRecebimento(aberto.recebimento).length ? (
              avisosRecebimento(aberto.recebimento).map((a) => <ChipEstado key={a.rotulo} estado={a} />)
            ) : (
              <ChipEstado tom="ok">Cadastrada</ChipEstado>
            )}
          </div>
        ) : (
          <p className="text-sm ba-texto-2 mt-1">O estado da chave aparece quando houver repasse a pagar.</p>
        )}
      </div>
      {repasses.length === 0 ? (
        <p className="text-sm ba-texto-2">Nenhum repasse fechado para este médico.</p>
      ) : (
        <ul className="space-y-1.5">
          {repasses.slice(0, 12).map((x) => (
            <li key={x.id}>
              <Link href={`/admin-repasses?repasse=${encodeURIComponent(x.id)}`} className="ba-card flex items-center gap-3" data-denso="true">
                <span className="w-16 shrink-0 tabular-nums font-bold">{competenciaCurta(x.competencia, agora)}</span>
                <ChipEstado estado={estadoRepasse(x.status)} />
                <span className="ml-auto tabular-nums font-bold">{brl(x.liquidoCentavos)}</span>
                <ExternalLink className="w-4 h-4 ba-texto-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(r.dados?.total ?? 0) > 12 ? <p className="text-xs ba-texto-2">Mostrando 12 de {r.dados?.total}. O resto está em Repasses.</p> : null}
    </div>
  );
}

function Auditoria({ id, agora }: { id: string; agora: number }) {
  const { auditLogs } = useBion();
  const eventos = eventosDaEntidade(auditLogs, "medico", id);
  if (!eventos.length) return <p className="text-sm ba-texto-2">Nenhum evento deste médico nos últimos registros carregados.</p>;
  return (
    <ol className="space-y-1.5">
      {eventos.map((e) => (
        <li key={e.id} className="ba-card" data-denso="true" data-tom={estadoSeveridade(e.severidade).tom}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm">{humanizar(e.acao)}</span>
            <span className="text-xs ba-texto-3 shrink-0">{relativo(e.ts, agora)}</span>
          </div>
          {e.detalhes ? <p className="text-xs ba-texto-2 mt-0.5 break-words">{e.detalhes}</p> : null}
          <p className="text-xs ba-texto-3 mt-0.5">por {e.usuario}</p>
        </li>
      ))}
    </ol>
  );
}

function Suspender({ medico: m, agora, onVoltar, onSujo }: { medico: Medico; agora: number; onVoltar: () => void; onSujo: (s: boolean) => void }) {
  const { suspender } = useAcoesMedico();
  const { consultas } = useBion();
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const futuras = consultas.filter((c) => c.medicoId === m.id && c.status !== "cancelada" && c.status !== "concluida" && c.ts > agora).length;
  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await suspender(m);
    setEnviando(false);
    if (r.ok) {
      onSujo(false);
      onVoltar();
    } else setErro(r.erro);
  };
  return (
    <div className="space-y-4">
      <div className="ba-aviso" data-tom="critico">
        <Ban className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p>
            <b>{m.nome}</b> perde o acesso na hora: as sessões abertas são encerradas e o perfil some da busca dos pacientes. Ele recebe um aviso pelo app.
          </p>
          {futuras ? (
            <p>
              Tem <b>{futuras}</b> {futuras === 1 ? "consulta marcada" : "consultas marcadas"}: elas não são canceladas automaticamente. Reveja em Agendamentos.
            </p>
          ) : null}
          <p>Para voltar, use “Reativar” na aba Suspensos.</p>
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]"
          checked={entendi}
          onChange={(e) => {
            setEntendi(e.target.checked);
            onSujo(e.target.checked);
          }}
        />
        <span>Entendi: suspender {m.nome}.</span>
      </label>
      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onVoltar} className="ba-botao ba-botao-secundario">
          Voltar
        </button>
        <button type="button" disabled={!entendi || enviando} onClick={() => void confirmar()} className="ba-botao ba-botao-perigo flex-1">
          <Ban className="w-4 h-4" aria-hidden /> {enviando ? "Suspendendo…" : "Suspender médico"}
        </button>
      </div>
    </div>
  );
}

function Arquivar({ medico: m, onVoltar, onFeito, onSujo }: { medico: Medico; onVoltar: () => void; onFeito: () => void; onSujo: (s: boolean) => void }) {
  const { arquivar } = useAcoesMedico();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confere = confirmacaoConfere(texto, m.nome);
  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await arquivar(m);
    setEnviando(false);
    if (r.ok) {
      onSujo(false);
      onFeito();
    } else setErro(r.erro);
  };
  return (
    <div className="space-y-4">
      <div className="ba-aviso" data-tom="critico">
        <Archive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>
          <b>{m.nome}</b> fica sem login, as sessões são encerradas e o cadastro sai das listas ativas. Consultas, prontuários e documentos já emitidos são <b>preservados</b>: o nome
          do profissional faz parte do histórico clínico. Fica registrado na auditoria.
        </p>
      </div>
      <ConfirmacaoDigitada
        id="arquivar-medico"
        esperado={m.nome}
        valor={texto}
        onMudar={(v) => {
          setTexto(v);
          onSujo(Boolean(v));
        }}
      />
      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onVoltar} className="ba-botao ba-botao-secundario">
          Voltar
        </button>
        <button type="button" disabled={!confere || enviando} onClick={() => void confirmar()} className="ba-botao ba-botao-perigo flex-1">
          <Archive className="w-4 h-4" aria-hidden /> {enviando ? "Arquivando…" : "Arquivar médico"}
        </button>
      </div>
    </div>
  );
}
