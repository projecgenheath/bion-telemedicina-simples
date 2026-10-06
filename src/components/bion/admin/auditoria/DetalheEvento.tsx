"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Filter, Info } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { urlDa, type View } from "@/lib/rotas";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { estadoSeveridade } from "../rotulos";
import { dataLonga, relativo } from "../tempo";
import { destinoEntidade, entidadeDe, horaSegundos, jsonFormatado, rotuloAcao, rotuloCategoria, rotuloPerfil } from "./trilha";

/** Detalhe de um evento: severidade, quem, quando (fuso da clínica), entidade com "ver entidade" e os detalhes (JSON formatado quando for JSON). */
export function DetalheEvento({
  id,
  agora,
  onFechar,
  onFiltrarEntidade,
  onFiltrarUsuario,
}: {
  id: string | null;
  agora: number;
  onFechar: () => void;
  onFiltrarEntidade: (entidade: string) => void;
  onFiltrarUsuario: (usuario: string) => void;
}) {
  const router = useRouter();
  const { auditLogs } = useBion();
  const l = id ? auditLogs.find((x) => x.id === id) : undefined;
  const sev = l ? estadoSeveridade(l.severidade) : null;
  const json = l ? jsonFormatado(l.detalhes) : null;
  const destino = l ? destinoEntidade(l) : null;

  const irPara = (view: string) => {
    const [v, q] = view.split("?");
    router.push(q ? `${urlDa(v as View)}?${q}` : urlDa(v as View));
  };

  return (
    <SheetAdmin
      aberto={Boolean(id)}
      onFechar={onFechar}
      titulo={l ? rotuloAcao(l.acao) : "Evento"}
      descricao={l ? `${rotuloCategoria(l.categoria)} · ${relativo(l.ts, agora)}` : undefined}
    >
      {!l || !sev ? (
        <EstadoVazio titulo="Evento não encontrado" texto="Ele não está entre os eventos carregados. Atualize a tela." tom="atencao" />
      ) : (
        <div className="space-y-4">
          <div className="ba-card" data-denso="true" data-tom={sev.tom}>
            <div className="flex flex-wrap gap-1.5">
              <ChipEstado estado={sev} />
              <ChipEstado tom="neutro" ponto={false}>
                {rotuloCategoria(l.categoria)}
              </ChipEstado>
            </div>
            <p className="text-xs ba-texto-3 mt-2">
              Código: <span className="font-mono break-all">{l.acao}</span>
            </p>
          </div>

          <dl className="ba-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-denso="true">
            <dt className="ba-texto-2">Quem</dt>
            <dd className="font-bold break-words">
              {l.usuario} <span className="font-normal ba-texto-2">({rotuloPerfil(l.role)})</span>
            </dd>
            <dt className="ba-texto-2">Quando</dt>
            <dd className="break-words tabular-nums">
              {dataLonga(l.ts)}, {horaSegundos(l.ts)}
            </dd>
            {l.entidade ? (
              <>
                <dt className="ba-texto-2">Entidade</dt>
                <dd className="break-words">
                  {l.entidade}
                  {l.entidadeId ? <IdCopiavel id={l.entidadeId} /> : null}
                </dd>
              </>
            ) : null}
          </dl>

          <div className="grid gap-2 sm:grid-cols-2">
            {destino ? (
              <button type="button" onClick={() => irPara(destino.view)} className="ba-botao ba-botao-primario">
                <ExternalLink className="w-4 h-4" aria-hidden /> {destino.rotulo}
              </button>
            ) : null}
            {l.entidade ? (
              <button type="button" onClick={() => onFiltrarEntidade(entidadeDe(l))} className="ba-botao ba-botao-secundario">
                <Filter className="w-4 h-4" aria-hidden /> Eventos desta entidade
              </button>
            ) : null}
            <button type="button" onClick={() => onFiltrarUsuario(l.usuario)} className="ba-botao ba-botao-secundario">
              <Filter className="w-4 h-4 shrink-0" aria-hidden /> <span className="truncate">Eventos de {l.usuario}</span>
            </button>
          </div>

          <section aria-labelledby="ev-detalhes">
            <h3 id="ev-detalhes" className="ba-rotulo mb-1.5">
              Detalhes
            </h3>
            {json ? (
              <pre className="ba-json" tabIndex={0} aria-label="Detalhes em JSON">
                {json}
              </pre>
            ) : l.detalhes ? (
              <p className="ba-card text-sm whitespace-pre-wrap break-words" data-denso="true">
                {l.detalhes}
              </p>
            ) : (
              <p className="text-sm ba-texto-2 inline-flex items-center gap-1.5">
                <Info className="w-4 h-4" aria-hidden /> Sem detalhes registrados.
              </p>
            )}
          </section>
        </div>
      )}
    </SheetAdmin>
  );
}

function IdCopiavel({ id }: { id: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(true);
      toast.success("ID copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o ID e copie manualmente.");
    }
  };
  return (
    <span className="flex items-center gap-1.5 mt-0.5">
      <span className="font-mono text-xs ba-texto-2 break-all select-all">#{id}</span>
      <button type="button" onClick={() => void copiar()} className="ba-icone-botao !w-9 !h-9 shrink-0" aria-label="Copiar ID da entidade">
        {copiado ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      </button>
    </span>
  );
}
