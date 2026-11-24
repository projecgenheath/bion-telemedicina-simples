"use client";

/* ==================================================================== */
/* Saúde do paciente (etapa 3) no desenho da ficha do médico (refs.     */
/* 15–17 e 08): cartão em degradê com pressão, peso, altura e IMC,      */
/* medicamentos em uso e os gráficos de IMC e pressão. Só dados reais   */
/* (medições e perfil); toques abrem os mesmos detalhes de antes.       */
/* ==================================================================== */

import { Activity, Bell, HeartPulse, TrendingUp } from "lucide-react";
import type { Medicao, PacientePerfil } from "@/lib/bion-tipos";
import { faixaImc, ROTULO_FAIXA_IMC } from "@/lib/medidas-paciente";
import { GraficoLinha, type PontoGrafico } from "../GraficoLinha";
import { MedicamentosEmUso } from "../MedicamentosEmUso";
import { PedidosMedicao } from "../PedidosMedicao";
import type { Detalhe } from "../DetalheMedicao";
import { dataBR, iniciaisNome, rotuloCurto } from "./etapa3-dados";

const fmtNum = (n: number, casas = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function TelaSaudePaciente({
  nome,
  perfil,
  pesos,
  alturas,
  pas,
  pesoAtual,
  alturaAtual,
  imcAtual,
  serieImc,
  onDetalhe,
}: {
  nome: string;
  perfil: PacientePerfil | null | undefined;
  pesos: Medicao[];
  alturas: Medicao[];
  pas: Medicao[];
  pesoAtual?: number;
  alturaAtual?: number;
  imcAtual?: number | null;
  serieImc: PontoGrafico[];
  onDetalhe: (d: Detalhe) => void;
}) {
  const pa = pas.at(-1);
  const peso = pesos.at(-1);
  const altura = alturas.at(-1);
  const ultima = [pa, peso, altura].filter(Boolean).sort((a, b) => b!.criadoEm.localeCompare(a!.criadoEm))[0];
  const alergias = (perfil?.alergias ?? []).filter(Boolean);
  const perfilTexto = [perfil?.idade ? `${perfil.idade} anos` : "", perfil?.genero?.toLowerCase() ?? ""].filter(Boolean).join(", ");
  const faixa = imcAtual ? ROTULO_FAIXA_IMC[faixaImc(imcAtual)] : null;

  return (
    <div className="bp2-e3 bp2-saude bp2-v2">
      <header className="bp2-secao-cab">
        <h2 className="bp2-secao-titulo">Sua saúde</h2>
        <p className="bp2-t-2 text-[12.5px]">Medições, medicamentos e a evolução do IMC e da pressão.</p>
      </header>
      <div className="bp2-saude-grade">
        {/* Ficha de saúde (degradê, como a "Ficha do paciente" do médico) */}
        <section className="bp2-ficha-cartao bp2-saude-ficha bp2-animar" aria-labelledby="bp2-saude-ficha-t">
          <div className="bp2-ficha-topo">
            <h3 id="bp2-saude-ficha-t" className="bp2-ficha-titulo">
              Ficha
              <br />
              de saúde
            </h3>
            <div className="bp2-ficha-redondos">
              <button type="button" className="bp2-redondo" onClick={() => onDetalhe("pa")} aria-label="Pressão arterial: abrir histórico e registrar" title="Pressão">
                <HeartPulse className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="bp2-redondo" onClick={() => onDetalhe("imc")} aria-label="Peso e altura: abrir histórico e atualizar" title="Peso e altura">
                <Activity className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="bp2-redondo" onClick={() => onDetalhe("lembretes")} aria-label="Gerenciar lembretes" title="Lembretes">
                <Bell className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="bp2-ficha-pessoa">
            <span className="bp2-ficha-avatar" aria-hidden>
              {iniciaisNome(nome)}
            </span>
            <div className="bp2-ficha-nome">
              <strong>{nome}</strong>
              {perfilTexto ? <span>{perfilTexto}</span> : null}
            </div>
          </div>
          <dl className="bp2-ficha-campos">
            <div>
              <dt>Tipo sanguíneo</dt>
              <dd>{perfil?.tipoSanguineo || "Não informado"}</dd>
            </div>
            <div>
              <dt>Alergias</dt>
              <dd className="truncate">{alergias.length ? alergias.join(", ") : "Nenhuma informada"}</dd>
            </div>
            <div>
              <dt>Última medição</dt>
              <dd className="tabular-nums">{ultima ? dataBR(ultima.criadoEm) : "Nenhuma ainda"}</dd>
            </div>
          </dl>
          <dl className="bp2-ficha-sinais">
            <div>
              <dt>Pressão{pa ? ` · ${rotuloCurto(pa.criadoEm)}` : ""}</dt>
              <dd>
                {pa ? (
                  <>
                    <span className="bp2-ficha-valor tabular-nums">
                      {pa.valor1}/{pa.valor2 ?? "—"}
                    </span>
                    <span className="bp2-ficha-unidade"> mmHg</span>
                  </>
                ) : (
                  <span className="bp2-ficha-valor bp2-ficha-valor-texto">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Peso{peso ? ` · ${rotuloCurto(peso.criadoEm)}` : ""}</dt>
              <dd>
                {pesoAtual ? (
                  <>
                    <span className="bp2-ficha-valor tabular-nums">{fmtNum(pesoAtual)}</span>
                    <span className="bp2-ficha-unidade"> kg</span>
                  </>
                ) : (
                  <span className="bp2-ficha-valor bp2-ficha-valor-texto">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Altura{altura ? ` · ${rotuloCurto(altura.criadoEm)}` : ""}</dt>
              <dd>
                {alturaAtual ? (
                  <>
                    <span className="bp2-ficha-valor tabular-nums">{Math.round(alturaAtual)}</span>
                    <span className="bp2-ficha-unidade"> cm</span>
                  </>
                ) : (
                  <span className="bp2-ficha-valor bp2-ficha-valor-texto">—</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Pedidos de medição do médico (só aparece se houver pendente) e medicamentos */}
        <div className="bp2-saude-meds bp2-animar bp2-animar-d1">
          <PedidosMedicao />
          <MedicamentosEmUso onGerenciarLembretes={() => onDetalhe("lembretes")} />
        </div>

        {/* IMC */}
        <button
          type="button"
          onClick={() => onDetalhe("imc")}
          className="bp2-cartao bp2-saude-grafico bp2-animar bp2-animar-d2"
          aria-label={`IMC: ${imcAtual ? `${imcAtual.toFixed(1)}, ${faixa}` : "sem dados"}. ${serieImc.length > 1 ? "Ver gráfico de evolução e atualizar peso e altura" : "Abrir histórico e atualizar peso e altura"}`}
        >
          <span className="bp2-saude-grafico-cab">
            <span className="bp2-ficha-titulo">IMC</span>
            {imcAtual ? (
              <span className="text-right">
                <span className="block bp2-ficha-valor tabular-nums">{fmtNum(imcAtual)}</span>
                <span className="block text-[11.5px] bp2-t-2">{faixa}</span>
              </span>
            ) : null}
          </span>
          {serieImc.length > 1 ? (
            <GraficoLinha ariaLabel="Evolução do IMC" altura={110} series={[{ pontos: serieImc, cor: "var(--bpp-grafico-linha)", area: true }]} refMin={18.5} refMax={24.9} />
          ) : (
            <span className="block py-3 text-[13px] bp2-t-2">
              {imcAtual
                ? pesos.length === 0
                  ? "Pelo peso e altura do seu perfil · atualize registrando uma medição para começar sua evolução."
                  : serieImc.length === 1
                    ? `Um registro, em ${serieImc[0].rotulo}. Mais um registro de peso e o gráfico de evolução aparece.`
                    : "Toque para atualizar peso e altura e começar seu gráfico de evolução."
                : pesos.length === 0
                  ? "Registre peso e altura para acompanhar seu IMC."
                  : "Registre sua altura para calcular seu IMC."}
            </span>
          )}
          <span className="bp2-saude-grafico-rodape">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Toque para atualizar peso e altura
          </span>
        </button>

        {/* Pressão arterial */}
        <button
          type="button"
          onClick={() => onDetalhe("pa")}
          className="bp2-cartao bp2-saude-grafico bp2-animar bp2-animar-d3"
          aria-label={`Pressão arterial: ${pa ? `${pa.valor1}/${pa.valor2 ?? "—"}, última medição em ${rotuloCurto(pa.criadoEm)}` : "sem dados"}. Abrir histórico e registrar`}
        >
          <span className="bp2-saude-grafico-cab">
            <span className="bp2-ficha-titulo">
              Pressão
              <br />
              arterial
            </span>
            {pa ? (
              <span className="text-right">
                <span className="block bp2-ficha-valor tabular-nums">
                  {pa.valor1}/{pa.valor2 ?? "—"}
                </span>
                <span className="block text-[11.5px] bp2-t-2">mmHg · {rotuloCurto(pa.criadoEm)}</span>
              </span>
            ) : null}
          </span>
          {pas.length > 1 ? (
            <GraficoLinha
              ariaLabel="Evolução da pressão arterial"
              altura={110}
              series={[
                { pontos: pas.map((p) => ({ valor: p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bpp-grafico-linha)", area: true },
                ...(pas.some((p) => p.valor2 !== undefined)
                  ? // M18: sem valor2 o ponto é omitido (null) — a diastólica não é inventada.
                    [{ pontos: pas.map((p) => ({ valor: p.valor2 ?? null, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bpp-grafico-alerta)" }]
                  : []),
              ]}
              refMin={70}
              refMax={120}
            />
          ) : (
            <span className="block py-3 text-[13px] bp2-t-2">
              {pas.length === 0 ? "Registre sua primeira medição." : `Última medição em ${rotuloCurto(pas[0].criadoEm)}. Mais uma medição e a evolução aparece aqui.`}
            </span>
          )}
          <span className="bp2-saude-grafico-rodape">
            <HeartPulse className="h-3.5 w-3.5" aria-hidden /> Toque para ver o histórico e registrar
          </span>
        </button>
      </div>
    </div>
  );
}
