"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, LifeBuoy, Pencil, ShieldAlert, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { useBion, type PacienteRegistro } from "@/lib/bion-store";
import { formatarDataNascimento } from "@/lib/idade";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { AbasFicha, Avatar, ConfirmacaoDigitada } from "../ui/Formulario";
import { estadoChamado, estadoConsulta } from "../rotulos";
import { hora as horaDe, rotuloDia } from "../tempo";
import { confirmacaoConfere, iniciais } from "../medicos/medicos";
import { FormularioPaciente } from "./FormularioPaciente";
import { useAcoesPaciente } from "./acoes";
import { chamadosDoPaciente, consultasDoPaciente, documentosDoPaciente, estadoPaciente, formatarCpf, idadeExibida, situacaoDe } from "./pacientes";

export type ModoFichaPaciente = "ficha" | "editar" | "anonimizar";
type AbaFicha = "dados" | "consultas" | "documentos" | "chamados";

export function FichaPaciente({ id, agora, modoInicial = "ficha", onFechar }: { id: string | null; agora: number; modoInicial?: ModoFichaPaciente; onFechar: () => void }) {
  const { pacientes } = useBion();
  const p = id ? pacientes.find((x) => x.id === id) : undefined;
  const [modo, setModo] = useState<ModoFichaPaciente>(modoInicial);
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
  const titulo = modo === "editar" ? "Editar paciente" : modo === "anonimizar" ? "Arquivar e anonimizar" : (p?.nome ?? "Paciente");
  return (
    <SheetAdmin aberto={Boolean(id)} onFechar={onFechar} titulo={titulo} descricao={p && modo === "ficha" ? p.email : undefined} alteracoesPendentes={modo !== "ficha" && sujo}>
      {!p ? (
        <EstadoVazio titulo="Paciente não encontrado" texto="Ele não está na lista carregada. Atualize a tela." tom="atencao" />
      ) : modo === "editar" ? (
        <FormularioPaciente key={p.id} paciente={p} onCancelar={voltar} onSalvo={voltar} onSujo={setSujo} />
      ) : modo === "anonimizar" ? (
        <Anonimizar paciente={p} onVoltar={voltar} onFeito={voltar} onSujo={setSujo} />
      ) : (
        <Ficha paciente={p} agora={agora} onModo={setModo} />
      )}
    </SheetAdmin>
  );
}

function Ficha({ paciente: p, agora, onModo }: { paciente: PacienteRegistro; agora: number; onModo: (m: ModoFichaPaciente) => void }) {
  const { consultas, documentos, tickets, pacientes } = useBion();
  const { salvar } = useAcoesPaciente();
  const [aba, setAba] = useState<AbaFicha>("dados");
  const [mudando, setMudando] = useState(false);
  const s = situacaoDe(p);
  const cons = consultasDoPaciente(consultas, p.id);
  const docs = documentosDoPaciente(documentos, p, pacientes);
  const chamados = chamadosDoPaciente(tickets, p, pacientes);
  const nasc = formatarDataNascimento(p.dataNascimento);

  const alternarConta = async () => {
    setMudando(true);
    await salvar(p, { status: p.status === "ativo" ? "inativo" : "ativo" });
    setMudando(false);
  };

  return (
    <div className="space-y-4">
      <div className="ba-card" data-tom={estadoPaciente(s).tom} data-denso="true">
        <div className="flex items-center gap-3">
          <Avatar iniciais={iniciais(p.nome)} tamanho="w-14 h-14" tom={estadoPaciente(s).tom} />
          <div className="min-w-0">
            <p className="font-black text-lg leading-tight break-words">{p.nome}</p>
            <p className="text-sm ba-texto-2">
              {idadeExibida(p, agora)} anos · {p.convenio || "Particular"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <ChipEstado estado={estadoPaciente(s)} />
          <ChipEstado tom="neutro" ponto={false}>
            {cons.length} {cons.length === 1 ? "consulta" : "consultas"}
          </ChipEstado>
        </div>
      </div>

      {s === "anonimizado" ? (
        <div className="ba-aviso" data-tom="neutro">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>Conta anonimizada pela LGPD: não pode ser editada nem reativada. O prontuário clínico continua preservado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onModo("editar")} className="ba-botao ba-botao-secundario">
            <Pencil className="w-4 h-4" aria-hidden /> Editar
          </button>
          <button type="button" disabled={mudando} onClick={() => void alternarConta()} className="ba-botao ba-botao-secundario">
            {p.status === "ativo" ? <UserX className="w-4 h-4" aria-hidden /> : <UserCheck className="w-4 h-4" aria-hidden />}
            {mudando ? "Salvando…" : p.status === "ativo" ? "Desativar conta" : "Reativar conta"}
          </button>
        </div>
      )}

      <AbasFicha
        rotulo="Ficha do paciente"
        ativa={aba}
        onMudar={setAba}
        abas={[
          { id: "dados", rotulo: "Dados" },
          { id: "consultas", rotulo: "Consultas", contagem: cons.length },
          { id: "documentos", rotulo: "Documentos", contagem: docs.lista.length },
          { id: "chamados", rotulo: "Chamados", contagem: chamados.lista.length },
        ]}
      />
      <div role="tabpanel" aria-labelledby={`ficha-aba-${aba}`} className="space-y-3">
        {aba === "dados" ? (
          <>
            <dl className="ba-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-denso="true">
              <dt className="ba-texto-2">E-mail</dt>
              <dd className="break-all">{p.email || "—"}</dd>
              <dt className="ba-texto-2">Telefone</dt>
              <dd className="tabular-nums">{p.telefone || "—"}</dd>
              <dt className="ba-texto-2">CPF</dt>
              <dd className="tabular-nums">{formatarCpf(p.cpf)}</dd>
              <dt className="ba-texto-2">Nascimento</dt>
              <dd>{nasc ? `${nasc} (${idadeExibida(p, agora)} anos)` : `não informado · ${p.idade} anos`}</dd>
              <dt className="ba-texto-2">Gênero</dt>
              <dd>{p.genero || "—"}</dd>
              <dt className="ba-texto-2">Convênio</dt>
              <dd>{p.convenio || "—"}</dd>
              <dt className="ba-texto-2">Paciente desde</dt>
              <dd>{p.desde || "—"}</dd>
            </dl>
            <Link href={`/privacidade?busca=${encodeURIComponent(p.id)}`} className="ba-card flex items-center gap-3" data-denso="true">
              <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: "var(--ba-sinal)" }} aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="font-bold block">Privacidade &amp; LGPD</span>
                <span className="text-xs ba-texto-2">Consentimentos, cofre de identificação e anonimização. Abre já filtrada por este paciente.</span>
              </span>
            </Link>
            {s !== "anonimizado" ? (
              <section className="ba-card" data-tom="critico" data-denso="true" aria-label="Zona de cuidado">
                <p className="font-bold">Zona de cuidado</p>
                <p className="text-sm ba-texto-2 mt-0.5">
                  Arquivar e anonimizar apaga o cadastro e o login desta pessoa de forma definitiva. O prontuário clínico fica preservado, sem identificação.
                </p>
                <button type="button" onClick={() => onModo("anonimizar")} className="ba-botao ba-botao-perigo mt-3">
                  <Trash2 className="w-4 h-4" aria-hidden /> Arquivar e anonimizar…
                </button>
              </section>
            ) : null}
          </>
        ) : null}

        {aba === "consultas" ? (
          cons.length === 0 ? (
            <p className="text-sm ba-texto-2">Nenhuma consulta entre as carregadas.</p>
          ) : (
            <ul className="space-y-1.5">
              {cons.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin-agendamentos?consulta=${encodeURIComponent(c.id)}`} className="ba-card flex items-center gap-3" data-denso="true">
                    <span className="shrink-0 w-28 text-sm">
                      <span className="ba-texto-2">{rotuloDia(c.ts, agora)}</span> <b className="tabular-nums">{horaDe(c.ts)}</b>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold block truncate">{c.medico}</span>
                      <span className="text-xs ba-texto-2 block truncate">{c.especialidade}</span>
                    </span>
                    <ChipEstado estado={estadoConsulta(c.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {aba === "documentos" ? (
          <>
            {docs.homonimo ? <AvisoHomonimo /> : null}
            {docs.lista.length === 0 ? (
              <p className="text-sm ba-texto-2">Nenhum documento emitido.</p>
            ) : (
              <ul className="space-y-1.5">
                {docs.lista.map((d) => (
                  <li key={d.id} className="ba-card flex items-center gap-3" data-denso="true">
                    <ClipboardList className="w-4 h-4 shrink-0" style={{ color: "var(--ba-sinal)" }} aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold block break-words">{d.titulo}</span>
                      <span className="text-xs ba-texto-2">
                        {d.medico} · {d.data}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {aba === "chamados" ? (
          <>
            {chamados.homonimo ? <AvisoHomonimo /> : null}
            {chamados.lista.length === 0 ? (
              <p className="text-sm ba-texto-2">Nenhum chamado de suporte.</p>
            ) : (
              <ul className="space-y-1.5">
                {chamados.lista.map((t) => (
                  <li key={t.id}>
                    <Link href={`/suporte?chamado=${encodeURIComponent(t.id)}`} className="ba-card flex items-center gap-3" data-denso="true">
                      <LifeBuoy className="w-4 h-4 shrink-0" style={{ color: "var(--ba-sinal)" }} aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="font-semibold block break-words">{t.assunto}</span>
                        <span className="text-xs ba-texto-2">{t.data}</span>
                      </span>
                      <ChipEstado estado={estadoChamado(t.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AvisoHomonimo() {
  return (
    <div className="ba-aviso" data-tom="atencao">
      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <p>Há outro paciente com o mesmo nome. Estes itens chegam só com o nome e podem ser da outra pessoa.</p>
    </div>
  );
}

function Anonimizar({ paciente: p, onVoltar, onFeito, onSujo }: { paciente: PacienteRegistro; onVoltar: () => void; onFeito: () => void; onSujo: (s: boolean) => void }) {
  const { anonimizar } = useAcoesPaciente();
  const [texto, setTexto] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confere = confirmacaoConfere(texto, p.nome);
  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await anonimizar(p);
    setEnviando(false);
    if (r.ok) {
      onSujo(false);
      onFeito();
    } else setErro(r.erro);
  };
  return (
    <div className="space-y-4">
      <div className="ba-aviso" data-tom="critico">
        <Trash2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p>
            <b>Isto não pode ser desfeito.</b> O nome, o e-mail, o CPF, o telefone e os arquivos pessoais de <b>{p.nome}</b> são apagados ou trocados por marcadores (a identificação fica só no cofre cifrado), e o
            login deixa de existir.
          </p>
          <p>Consultas, prontuário e documentos clínicos ficam guardados sem identificação (LGPD art. 12 e Lei 13.787/2018). Fica registrado na auditoria.</p>
        </div>
      </div>
      <ConfirmacaoDigitada
        id="anonimizar-paciente"
        esperado={p.nome}
        valor={texto}
        onMudar={(v) => {
          setTexto(v);
          onSujo(Boolean(v) || entendi);
        }}
      />
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]"
          checked={entendi}
          onChange={(e) => {
            setEntendi(e.target.checked);
            onSujo(e.target.checked || Boolean(texto));
          }}
        />
        <span>Entendi que é definitivo.</span>
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
        <button type="button" disabled={!confere || !entendi || enviando} onClick={() => void confirmar()} className="ba-botao ba-botao-perigo flex-1">
          <Trash2 className="w-4 h-4" aria-hidden /> {enviando ? "Anonimizando…" : "Arquivar e anonimizar"}
        </button>
      </div>
    </div>
  );
}
