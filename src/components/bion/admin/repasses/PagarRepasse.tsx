"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, FileText, Paperclip, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { brl, competenciaCurta } from "../tempo";
import { AvisosRecebimento, ChavePix, Titular } from "./partes";
import { chamarApi } from "./recurso";
import { confirmacoesNecessarias, explicarErroPagamento, formatarChavePix, podePagar, rotuloPixTipo, tamanhoArquivo, validarComprovante, type ErroExplicado } from "./formatos";
import type { RepasseDetalhe } from "./tipos";

const PASSOS = ["Conferir a chave", "Comprovante", "Revisar e confirmar"] as const;

/**
 * Pagamento em 3 passos (NUNCA por gesto):
 *  1. conferir chave PIX e titular (checkbox; a 2ª confirmação aparece se a chave mudou < 24 h);
 *  2. anexar o comprovante (PDF/PNG/JPG ≤ 10 MB; câmera no celular);
 *  3. revisar e confirmar → PATCH multipart { comprovante, pixChaveConferida }.
 * `pixChaveConferida` = a chave EXATA mostrada no passo 1; se o médico trocar
 * nesse meio-tempo, o servidor responde 409 e voltamos ao passo 1 com a chave nova.
 */
export function PagarRepasse({
  repasse,
  agora,
  onCancelar,
  onPago,
  onRecarregar,
  onSujo,
  erroInicial = null,
  onErro,
}: {
  repasse: RepasseDetalhe;
  agora: number;
  onCancelar: () => void;
  onPago: () => void;
  onRecarregar: () => void;
  onSujo: (sujo: boolean) => void;
  /** Erro do envio anterior (ex.: chave mudou → o pai recarregou e remontou este passo a passo). */
  erroInicial?: ErroExplicado | null;
  onErro: (e: ErroExplicado | null) => void;
}) {
  const rec = repasse.recebimento;
  const necessarias = confirmacoesNecessarias(rec);
  const [passo, setPasso] = useState(0);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErroLocal] = useState<ErroExplicado | null>(erroInicial);
  const setErro = (e: ErroExplicado | null) => {
    setErroLocal(e);
    onErro(e);
  };
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const pode = podePagar(repasse);
  const conferido = necessarias.every((c) => marcadas.includes(c));

  // Libera a URL da prévia da imagem quando troca/sai.
  useEffect(() => () => (previa ? URL.revokeObjectURL(previa) : undefined), [previa]);
  // Foco no título de cada passo (leitor de tela anuncia o passo novo).
  useEffect(() => tituloRef.current?.focus(), [passo]);

  const marcar = (c: string, v: boolean) => {
    const novo = v ? [...new Set([...marcadas, c])] : marcadas.filter((x) => x !== c);
    setMarcadas(novo);
    onSujo(novo.length > 0 || Boolean(arquivo));
  };
  const escolher = (f: File | null) => {
    const e = validarComprovante(f);
    setErroArquivo(f ? e : null);
    if (e) return;
    setArquivo(f);
    setPrevia(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setErro(null);
    onSujo(true);
  };
  const remover = () => {
    setArquivo(null);
    setPrevia(null);
    onSujo(marcadas.length > 0);
  };

  const confirmar = async () => {
    if (!rec || !arquivo || !pode.ok) return;
    setEnviando(true);
    setErro(null);
    const form = new FormData();
    form.append("comprovante", arquivo);
    form.append("pixChaveConferida", rec.pixChave);
    const r = await chamarApi<{ id: string; status: string; pagoEm: string }>(`/api/admin/repasses/${encodeURIComponent(repasse.id)}`, {
      method: "PATCH",
      body: form,
    });
    setEnviando(false);
    if (r.dados) {
      onSujo(false);
      onPago();
      return;
    }
    const e = explicarErroPagamento(r.status, r.erro);
    setErro(e);
    if (e.acao === "comprovante") setPasso(1);
    if (e.acao === "reconferir" || e.acao === "recarregar") onRecarregar();
  };

  if (!pode.ok || !rec) {
    return (
      <div className="space-y-3">
        <AvisosRecebimento rec={rec} />
        <div className="ba-aviso" data-tom="critico" role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{pode.ok ? "O médico ainda não cadastrou a chave PIX." : pode.motivo}</p>
        </div>
        <button type="button" onClick={onCancelar} className="ba-botao ba-botao-secundario w-full">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Voltar ao detalhe
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="ba-passos" aria-label="Passos do pagamento">
        {PASSOS.map((p, i) => (
          <li key={p} className="ba-passo" data-estado={i < passo ? "feito" : i === passo ? "atual" : "depois"} aria-current={i === passo ? "step" : undefined}>
            <span>
              {i + 1}. {p}
            </span>
          </li>
        ))}
      </ol>

      <div className="ba-card" data-tom="dinheiro" data-denso="true">
        <p className="text-xs ba-texto-2">
          {repasse.medico} · competência {competenciaCurta(repasse.competencia, agora)}
        </p>
        <p className="ba-numero text-3xl">{brl(repasse.liquidoCentavos)}</p>
      </div>

      {erro ? (
        <div className="ba-aviso" data-tom={erro.bloqueia ? "critico" : "atencao"} role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-bold">{erro.titulo}</p>
            <p className="mt-0.5">{erro.texto}</p>
          </div>
        </div>
      ) : null}

      {passo === 0 ? (
        <section className="space-y-3" aria-labelledby="pg-p1">
          <h3 id="pg-p1" ref={tituloRef} tabIndex={-1} className="text-base font-black outline-none">
            1. Confira a chave PIX e o titular
          </h3>
          <AvisosRecebimento rec={rec} />
          <div className="ba-card space-y-3" data-denso="true">
            <ChavePix tipo={rec.pixTipo} chave={rec.pixChave} grande />
            <Titular rec={rec} cnpjPerfil={repasse.cnpj} />
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]" checked={marcadas.includes("conferi")} onChange={(e) => marcar("conferi", e.target.checked)} />
            <span>Conferi a chave PIX e o titular acima no app do banco antes de fazer o PIX.</span>
          </label>
          {necessarias.includes("troca") ? (
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]" checked={marcadas.includes("troca")} onChange={(e) => marcar("troca", e.target.checked)} />
              <span>Confirmei com o médico, por outro canal, que ele mesmo trocou a chave nas últimas 24 h.</span>
            </label>
          ) : null}
        </section>
      ) : null}

      {passo === 1 ? (
        <section className="space-y-3" aria-labelledby="pg-p2">
          <h3 id="pg-p2" ref={tituloRef} tabIndex={-1} className="text-base font-black outline-none">
            2. Anexe o comprovante do PIX
          </h3>
          <p className="text-sm ba-texto-2">PDF, PNG ou JPG de até 10 MB. No celular, dá para fotografar o comprovante.</p>
          {arquivo ? (
            <div className="ba-card" data-denso="true">
              <div className="flex items-center gap-3">
                {previa ? (
                  <img src={previa} alt="Prévia do comprovante" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <FileText className="w-8 h-8 shrink-0 ba-texto-2" aria-hidden />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold break-all">{arquivo.name}</p>
                  <p className="text-xs ba-texto-2">{tamanhoArquivo(arquivo.size)}</p>
                </div>
                <button type="button" onClick={remover} className="ba-icone-botao !w-9 !h-9 shrink-0" aria-label="Remover comprovante">
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="ba-botao ba-botao-secundario cursor-pointer lg:hidden">
                <Camera className="w-4 h-4" aria-hidden /> Fotografar
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
              </label>
              <label className="ba-botao ba-botao-secundario cursor-pointer col-span-1 lg:col-span-2">
                <Paperclip className="w-4 h-4" aria-hidden /> Escolher arquivo
                <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          {erroArquivo ? (
            <p className="text-sm font-bold" style={{ color: "var(--ba-critico)" }} role="alert">
              {erroArquivo}
            </p>
          ) : null}
        </section>
      ) : null}

      {passo === 2 ? (
        <section className="space-y-3" aria-labelledby="pg-p3">
          <h3 id="pg-p3" ref={tituloRef} tabIndex={-1} className="text-base font-black outline-none">
            3. Revise e confirme
          </h3>
          <dl className="ba-card text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-2" data-denso="true">
            <dt className="ba-texto-2">Médico</dt>
            <dd className="font-bold break-words">{repasse.medico}</dd>
            <dt className="ba-texto-2">Competência</dt>
            <dd>{competenciaCurta(repasse.competencia, agora)}</dd>
            <dt className="ba-texto-2">Valor</dt>
            <dd className="font-bold tabular-nums">{brl(repasse.liquidoCentavos)}</dd>
            <dt className="ba-texto-2">Chave ({rotuloPixTipo(rec.pixTipo)})</dt>
            <dd className="font-mono font-bold break-all">{formatarChavePix(rec.pixTipo, rec.pixChave)}</dd>
            <dt className="ba-texto-2">Titular</dt>
            <dd className="break-words">{rec.titularNome}</dd>
            <dt className="ba-texto-2">Comprovante</dt>
            <dd className="break-all">{arquivo ? `${arquivo.name} · ${tamanhoArquivo(arquivo.size)}` : "—"}</dd>
          </dl>
          <p className="text-xs ba-texto-2">
            Ao confirmar, o repasse fica como pago em seu nome, com esta chave e este comprovante. Isso não faz o PIX: faça a transferência no banco antes.
          </p>
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 flex gap-2" style={{ background: "linear-gradient(to top, var(--ba-card-solido) 70%, transparent)" }}>
        {passo === 0 ? (
          <button type="button" onClick={onCancelar} className="ba-botao ba-botao-secundario">
            Cancelar
          </button>
        ) : (
          <button type="button" onClick={() => setPasso(passo - 1)} disabled={enviando} className="ba-botao ba-botao-secundario">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Voltar
          </button>
        )}
        {erro?.acao === "reconferir" && passo === 0 ? (
          <button type="button" onClick={onRecarregar} className="ba-botao ba-botao-secundario">
            <RefreshCw className="w-4 h-4" aria-hidden /> Recarregar
          </button>
        ) : null}
        {passo < 2 ? (
          <button
            type="button"
            onClick={() => setPasso(passo + 1)}
            disabled={passo === 0 ? !conferido : !arquivo}
            className="ba-botao ba-botao-primario flex-1"
          >
            Continuar <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={() => void confirmar()} disabled={enviando || !arquivo || !conferido || erro?.bloqueia} className="ba-botao ba-botao-primario flex-1">
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            {enviando ? "Enviando…" : `Confirmar pagamento de ${brl(repasse.liquidoCentavos)}`}
          </button>
        )}
      </div>
    </div>
  );
}
