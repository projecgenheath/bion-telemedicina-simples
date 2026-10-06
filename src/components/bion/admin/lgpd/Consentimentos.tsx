"use client";

import { useMemo, useState } from "react";
import { Handshake, Search } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { CardAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { filtrarConsentimentos } from "./lgpd";

const PAGINA = 10;
const SITUACOES = [
  { id: "todos", rotulo: "Todos" },
  { id: "aceitos", rotulo: "Aceitos" },
  { id: "revogados", rotulo: "Revogados" },
] as const;

/** Consentimentos de acesso aos dados (já no bootstrap do admin): só leitura. */
export function Consentimentos() {
  const { consentimentos } = useBion();
  const [termo, setTermo] = useState("");
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]["id"]>("todos");
  const [limite, setLimite] = useState(PAGINA);
  const lista = useMemo(() => filtrarConsentimentos(consentimentos, termo, situacao), [consentimentos, termo, situacao]);
  const visiveis = lista.slice(0, limite);
  const contagem = useMemo(() => ({ todos: consentimentos.length, aceitos: consentimentos.filter((c) => c.aceito).length, revogados: consentimentos.filter((c) => !c.aceito).length }), [consentimentos]);

  return (
    <CardAdmin titulo={`Consentimentos · ${consentimentos.length}`} icone={Handshake}>
      <p className="text-sm ba-texto-2">Quem o paciente autorizou a ver os próprios documentos, para quê e quando. Só leitura: quem dá ou revoga é o paciente.</p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Buscar consentimento por paciente, profissional ou finalidade</span>
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
          <input
            type="search"
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setLimite(PAGINA);
            }}
            placeholder="Paciente, profissional ou finalidade"
            className="ba-entrada !pl-10"
          />
        </label>
        <div role="group" aria-label="Situação do consentimento" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0">
          {SITUACOES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={situacao === s.id}
              onClick={() => {
                setSituacao(s.id);
                setLimite(PAGINA);
              }}
              className="ba-filtro shrink-0"
            >
              {s.rotulo} <span className="tabular-nums opacity-80">{contagem[s.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm ba-texto-2 mt-3">{consentimentos.length ? "Nenhum consentimento com esse filtro." : "Nenhum consentimento registrado."}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[color:var(--ba-borda)]">
          {visiveis.map((c) => (
            <li key={c.id} className="py-2.5 flex items-start gap-3">
              <span className="flex-1 min-w-0">
                <span className="font-bold block break-words">
                  {c.paciente} <span className="font-normal ba-texto-2">→ {c.quem}</span>
                </span>
                <span className="text-xs ba-texto-2 block break-words">
                  {c.finalidade} · {c.documentos} {c.documentos === 1 ? "documento" : "documentos"} · {c.quando}
                </span>
              </span>
              <ChipEstado tom={c.aceito ? "ok" : "neutro"}>{c.aceito ? "Aceito" : "Revogado"}</ChipEstado>
            </li>
          ))}
        </ul>
      )}
      {lista.length > visiveis.length ? (
        <button type="button" onClick={() => setLimite((l) => l + PAGINA * 3)} className="ba-botao ba-botao-secundario w-full mt-2">
          Mostrar mais {Math.min(PAGINA * 3, lista.length - visiveis.length)}
        </button>
      ) : null}
    </CardAdmin>
  );
}
