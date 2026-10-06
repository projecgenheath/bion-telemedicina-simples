"use client";

import { useState } from "react";
import { ChevronDown, Lock, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { chamarApi } from "../repasses/recurso";
import { CardAdmin } from "../ui/CardAdmin";
import { IdCopiavel } from "../ui/IdCopiavel";
import { humanizar } from "../rotulos";
import {
  MOTIVO_MAX,
  corpoBuscaCofre,
  dataLgpd,
  motivoRepeteTermo,
  nascimentoCofre,
  validarBuscaCofre,
  type CriterioCofre,
  type ResultadoCofre,
} from "./lgpd";

type Estado = { criterio: CriterioCofre; termo: string; motivo: string; resultados: ResultadoCofre[] | null };

/**
 * Busca no cofre de identificação (ordem judicial, ofício, pedido do titular).
 * Mesma regra de antes: CPF ou nome completo exato + motivo obrigatório; o
 * servidor registra TODA consulta na auditoria (crítica). Agora há um passo
 * de confirmação explícito antes de consultar, e "Ocultar resultados" tem
 * Desfazer (só local: não gera nova consulta).
 */
export function Cofre() {
  const [e, setE] = useState<Estado>({ criterio: "cpf", termo: "", motivo: "", resultados: null });
  const [tocado, setTocado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const v = validarBuscaCofre(e.criterio, e.termo, e.motivo);
  const repete = motivoRepeteTermo(e.criterio, e.termo, e.motivo);
  const mudar = (p: Partial<Estado>) => {
    setE((x) => ({ ...x, ...p }));
    setConfirmando(false);
  };

  const pedir = () => {
    setTocado(true);
    if (v.ok) {
      setErro(null);
      setConfirmando(true);
    }
  };
  const buscar = async () => {
    setBuscando(true);
    setErro(null);
    setHistorico(null);
    const r = await chamarApi<{ resultados?: ResultadoCofre[] }>("/api/admin/lgpd/cofre/busca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoBuscaCofre(e.criterio, e.termo, e.motivo)),
    });
    setBuscando(false);
    setConfirmando(false);
    if (!r.dados) {
      setErro(r.erro ?? "Não foi possível consultar o cofre.");
      return;
    }
    setE((x) => ({ ...x, resultados: r.dados?.resultados ?? [] }));
    toast.message("Consulta ao cofre registrada na auditoria.");
  };
  const ocultar = () => {
    const antes = e;
    setE({ criterio: e.criterio, termo: "", motivo: "", resultados: null });
    setTocado(false);
    setHistorico(null);
    toast("Resultados ocultados e campos limpos.", { duration: 5000, action: { label: "Desfazer", onClick: () => setE(antes) } });
  };

  const erroTermo = tocado ? v.erros.termo : undefined;
  const erroMotivo = tocado ? v.erros.motivo : undefined;

  return (
    <CardAdmin titulo="Busca no cofre (ordem judicial)" icone={Lock} tom="atencao">
      <p className="text-sm ba-texto-2">
        Reidentifica um paciente <b>anonimizado</b> por obrigação legal (ordem judicial, ofício, pedido do titular). Busca exata por CPF ou nome completo. Toda consulta é registrada na auditoria
        com o seu usuário e o motivo; não repita o CPF ou o nome no motivo.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr]">
        <div>
          <label htmlFor="cofre-criterio" className="ba-rotulo block mb-1">
            Buscar por
          </label>
          <select id="cofre-criterio" value={e.criterio} onChange={(x) => mudar({ criterio: x.target.value as CriterioCofre })} className="ba-entrada">
            <option value="cpf">CPF</option>
            <option value="nome">Nome completo</option>
          </select>
        </div>
        <div>
          <label htmlFor="cofre-termo" className="ba-rotulo block mb-1">
            {e.criterio === "cpf" ? "CPF" : "Nome completo exato"}
          </label>
          <input
            id="cofre-termo"
            value={e.termo}
            onChange={(x) => mudar({ termo: x.target.value })}
            placeholder={e.criterio === "cpf" ? "000.000.000-00" : "Nome completo exato"}
            inputMode={e.criterio === "cpf" ? "numeric" : "text"}
            autoComplete="off"
            spellCheck={false}
            className="ba-entrada"
            aria-invalid={Boolean(erroTermo) || undefined}
            aria-describedby={erroTermo ? "cofre-termo-erro" : undefined}
          />
          {erroTermo ? (
            <p id="cofre-termo-erro" className="text-xs mt-1" style={{ color: "var(--ba-critico)" }}>
              {erroTermo}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="cofre-motivo" className="ba-rotulo block mb-1">
          Motivo (vai para a auditoria)
        </label>
        <textarea
          id="cofre-motivo"
          value={e.motivo}
          onChange={(x) => mudar({ motivo: x.target.value })}
          placeholder="Ex.: Processo nº 0000000-00.0000.0.00.0000 / Ofício nº …"
          rows={2}
          maxLength={MOTIVO_MAX}
          className="ba-entrada !rounded-2xl py-2"
          aria-invalid={Boolean(erroMotivo) || undefined}
          aria-describedby="cofre-motivo-ajuda"
        />
        <p id="cofre-motivo-ajuda" className="text-xs mt-1 flex gap-2">
          <span className="flex-1" style={erroMotivo ? { color: "var(--ba-critico)" } : undefined}>
            {erroMotivo ?? " "}
          </span>
          <span className="ba-texto-3 tabular-nums">
            {e.motivo.trim().length}/{MOTIVO_MAX}
          </span>
        </p>
        {repete ? (
          <div className="ba-aviso mt-2" data-tom="atencao" role="status">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>O motivo parece repetir o {e.criterio === "cpf" ? "CPF" : "nome"} pesquisado. Ele fica salvo na auditoria: prefira só o número do processo ou do ofício.</p>
          </div>
        ) : null}
      </div>

      {confirmando ? (
        <div role="alertdialog" aria-labelledby="cofre-conf-titulo" aria-describedby="cofre-conf-texto" className="ba-card mt-4" data-tom="critico" data-denso="true">
          <p id="cofre-conf-titulo" className="font-bold">
            Consultar o cofre agora?
          </p>
          <p id="cofre-conf-texto" className="text-sm ba-texto-2 mt-1">
            A consulta fica registrada na auditoria como evento crítico, com o seu usuário e o motivo informado (o {e.criterio === "cpf" ? "CPF" : "nome"} pesquisado não vai em texto claro). A
            identificação aparece só nesta tela.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmando(false)} disabled={buscando} className="ba-botao ba-botao-secundario">
              Cancelar
            </button>
            <button type="button" onClick={() => void buscar()} disabled={buscando} className="ba-botao ba-botao-perigo" autoFocus>
              <Search className="w-4 h-4" aria-hidden /> {buscando ? "Consultando…" : "Consultar o cofre"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {e.resultados || e.termo || e.motivo ? (
            <button type="button" onClick={ocultar} className="ba-botao ba-botao-secundario">
              {e.resultados ? "Ocultar resultados" : "Limpar"}
            </button>
          ) : null}
          <button type="button" onClick={pedir} className="ba-botao ba-botao-primario">
            <Search className="w-4 h-4" aria-hidden /> Buscar no cofre…
          </button>
        </div>
      )}

      {erro ? (
        <div className="ba-aviso mt-3" data-tom="critico" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}

      {e.resultados ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="ba-rotulo">
            {e.resultados.length} {e.resultados.length === 1 ? "registro encontrado" : "registros encontrados"}
          </p>
          {e.resultados.length === 0 ? <p className="text-sm ba-texto-2">Nenhum registro encontrado no cofre.</p> : null}
          {e.resultados.map((r) => (
            <CartaoCofre key={r.pacienteId} r={r} aberto={historico === r.pacienteId} onAlternar={() => setHistorico(historico === r.pacienteId ? null : r.pacienteId)} />
          ))}
        </div>
      ) : null}
    </CardAdmin>
  );
}

function CartaoCofre({ r, aberto, onAlternar }: { r: ResultadoCofre; aberto: boolean; onAlternar: () => void }) {
  const c = r.historico.contagem;
  const idHist = `cofre-hist-${r.pacienteId}`;
  return (
    <article className="ba-card" data-denso="true" data-tom={r.erroDecifrar || !r.identificacao ? "critico" : "sinal"}>
      <IdCopiavel id={r.pacienteId} rotulo="Copiar ID do paciente" />
      {r.erroDecifrar || !r.identificacao ? (
        <p className="text-sm font-bold mt-2" style={{ color: "var(--ba-critico)" }}>
          Não foi possível descriptografar (chave diferente ou registro adulterado).
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="ba-texto-2">Nome</dt>
          <dd className="font-bold break-words">{r.identificacao.nome}</dd>
          <dt className="ba-texto-2">CPF</dt>
          <dd>{r.identificacao.cpf || "—"}</dd>
          <dt className="ba-texto-2">Nascimento</dt>
          <dd>{nascimentoCofre(r.identificacao.dataNascimento)}</dd>
        </dl>
      )}
      <p className="text-xs ba-texto-2 mt-2">
        Pseudônimo: {r.pseudonimo ?? "—"} · cadastro {dataLgpd(r.cadastradoEm)} · no cofre desde {dataLgpd(r.guardadoNoCofreEm)}
      </p>
      <p className="text-xs ba-texto-2 mt-1">
        Histórico preservado: {c.consultas} consultas · {c.anamneses} anamneses · {c.exames} exames · {c.documentos} documentos · {c.medicoes} medições · {c.arquivos} arquivos
      </p>
      <button type="button" onClick={onAlternar} aria-expanded={aberto} aria-controls={idHist} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs mt-3">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden /> {aberto ? "Fechar histórico" : "Abrir histórico"}
      </button>
      {aberto ? (
        <div id={idHist} className="mt-3 space-y-3 text-sm">
          <Lista titulo="Consultas" itens={r.historico.consultas.map((x) => ({ id: x.id, texto: `${dataLgpd(x.data)} · ${x.especialidade} · ${x.medico} · ${humanizar(x.status)}` }))} />
          <Lista titulo="Documentos clínicos" itens={r.historico.documentos.map((x) => ({ id: x.id, texto: `${dataLgpd(x.data)} · ${x.tipo} · ${x.titulo}` }))} />
          <Lista titulo="Exames" itens={r.historico.exames.map((x) => ({ id: x.id, texto: `${dataLgpd(x.data)} · ${x.titulo}` }))} />
        </div>
      ) : null}
    </article>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: { id: string; texto: string }[] }) {
  return (
    <section>
      <h4 className="ba-rotulo mb-1">{titulo}</h4>
      {itens.length === 0 ? (
        <p className="ba-texto-2">—</p>
      ) : (
        <ul className="space-y-0.5">
          {itens.map((i) => (
            <li key={i.id} className="break-words">
              {i.texto} <span className="font-mono text-xs ba-texto-3">({i.id})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
