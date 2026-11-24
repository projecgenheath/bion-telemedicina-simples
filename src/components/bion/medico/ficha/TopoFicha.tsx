"use client";

/* ==================================================================== */
/* Topo da ficha no computador (rodada 2): busca + perfil do médico,     */
/* no mesmo padrão do topo do Início (#239). Só dados que já estão no    */
/* cliente: a busca filtra a lista de pacientes do médico (a mesma do    */
/* Início) e o perfil mostra nome, especialidade e foto/iniciais do      */
/* médico logado. Nada é buscado no servidor.                            */
/* ==================================================================== */

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { filtrarPacientes } from "../inicio/inicio-dados";
import { iniciais, type PacienteDoMedico } from "../metricas";

const MAX_RESULTADOS = 6;

export function BuscaPacienteTopo({
  pacientes,
  atualChave,
  onAbrir,
}: {
  pacientes: PacienteDoMedico[];
  /** Paciente aberto agora (fica de fora dos resultados). */
  atualChave: string;
  onAbrir: (p: PacienteDoMedico) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const idStatus = useId();
  const resultados = useMemo(
    () => (busca.trim() ? filtrarPacientes(pacientes, busca, false).filter((p) => p.chave !== atualChave) : []),
    [pacientes, busca, atualChave],
  );
  const mostrar = aberta && busca.trim().length > 0;
  const status = !busca.trim()
    ? ""
    : resultados.length === 0
      ? "Nenhum outro paciente com esse nome"
      : `${resultados.length} paciente${resultados.length > 1 ? "s" : ""} encontrado${resultados.length > 1 ? "s" : ""}`;

  return (
    <div
      ref={caixaRef}
      className="bm2-topo-busca"
      onBlur={(e) => {
        if (!caixaRef.current?.contains(e.relatedTarget as Node | null)) setAberta(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && mostrar) {
          // Fecha só a lista; o Escape não chega a fechar a ficha.
          e.preventDefault();
          e.stopPropagation();
          setAberta(false);
        }
      }}
    >
      <label className="bm2-topo-busca-campo">
        <Search className="h-4 w-4 bm2-t-2" aria-hidden />
        <span className="sr-only">Buscar paciente</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberta(true);
          }}
          onFocus={() => setAberta(true)}
          placeholder="Buscar paciente…"
          autoComplete="off"
          aria-describedby={idStatus}
          aria-controls={mostrar ? idLista : undefined}
          className="bm2-busca-topo"
        />
      </label>
      <span id={idStatus} className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
      {mostrar ? (
        <div className="bm2-topo-busca-lista" id={idLista}>
          {resultados.length === 0 ? (
            <p className="bm2-vazio">Nenhum outro paciente com esse nome.</p>
          ) : (
            <ul aria-label="Pacientes encontrados">
              {resultados.slice(0, MAX_RESULTADOS).map((p) => (
                <li key={p.chave}>
                  <button
                    type="button"
                    onClick={() => {
                      setBusca("");
                      setAberta(false);
                      onAbrir(p);
                    }}
                  >
                    <span aria-hidden className="bm2-avatar grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-medium">
                      {iniciais(p.nome)}
                    </span>
                    <span className="min-w-0 truncate">{p.nome}</span>
                    {p.proxima ? <span className="bm2-t-2 ml-auto shrink-0 text-[12px]">{p.proxima.data}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {resultados.length > MAX_RESULTADOS ? (
            <p className="bm2-vazio">Mostrando {MAX_RESULTADOS} de {resultados.length}. Continue digitando para filtrar.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PerfilMedicoTopo({
  nome,
  especialidade,
  foto,
  onAbrir,
}: {
  nome: string;
  especialidade?: string | null;
  foto?: string | null;
  onAbrir?: () => void;
}) {
  const conteudo = (
    <>
      {foto ? (
        <img src={foto} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="bm2-avatar grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-medium">
          {iniciais(nome)}
        </span>
      )}
      <span className="min-w-0 text-left">
        <span className="block max-w-[12rem] truncate text-[13px] font-medium">{nome}</span>
        <span className="block max-w-[12rem] truncate text-[11px] bm2-t-2">{especialidade || "Médico(a)"}</span>
      </span>
    </>
  );
  return (
    <div className="bm2-topo-perfil">
      <span aria-hidden className="bm2-topo-divisor" />
      {onAbrir ? (
        <button type="button" onClick={onAbrir} aria-label="Abrir meu perfil" className="bm2-topo-perfil-botao">
          {conteudo}
          <ChevronDown className="ml-4 h-4 w-4 bm2-t-2" aria-hidden />
        </button>
      ) : (
        <span className="bm2-topo-perfil-botao">{conteudo}</span>
      )}
    </div>
  );
}
