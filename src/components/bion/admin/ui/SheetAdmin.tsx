"use client";

import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { useCascaLarga } from "./preferencias";
import { poppinsAdmin } from "../fonte-admin";
import "../admin.css";

/**
 * Sheet do admin (vaul, já instalado): arrastável no celular (sobe do
 * rodapé, arrastar para baixo fecha) e painel lateral à direita no layout
 * largo (≥ 768 px, a mesma casca do trilho). Foco preso, ESC e "voltar" do overlay vêm do vaul/Radix.
 *
 * `alteracoesPendentes`: enquanto true, arrastar/ESC/clicar fora NÃO fecham;
 * o botão fechar pergunta "Descartar alterações?" antes.
 */
export function SheetAdmin({
  aberto,
  onFechar,
  titulo,
  descricao,
  alteracoesPendentes = false,
  rodape,
  children,
  /** Cor e entrada do Início. A Fila e a conta do Centro de Comando ficam de fora. */
  familia = true,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  alteracoesPendentes?: boolean;
  rodape?: ReactNode;
  children: ReactNode;
  familia?: boolean;
}) {
  const largo = useCascaLarga();
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  // Ao fechar por fora, esquece a pergunta pendente (ajuste durante o render).
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (!aberto) setConfirmandoSaida(false);
  }

  const pedirFechar = () => {
    if (alteracoesPendentes) setConfirmandoSaida(true);
    else onFechar();
  };

  return (
    <Drawer.Root
      open={aberto}
      onOpenChange={(o) => {
        if (!o) pedirFechar();
      }}
      direction={largo ? "right" : "bottom"}
      dismissible={!alteracoesPendentes}
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className={`ba-escopo ba-sheet ${familia ? "ba-folha-cor" : ""} ${poppinsAdmin.variable} fixed z-50 flex flex-col outline-none ${
            largo
              ? "right-0 top-0 bottom-0 w-[480px] max-w-[92vw] border-l"
              : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[20px]"
          }`}
        >
          {!largo ? <Drawer.Handle className="!mt-3 !mb-1 !w-12 !h-1.5 !bg-current opacity-25" /> : null}
          <header className={`flex items-start justify-between gap-3 ${familia ? "ba-folha-cab ba-animar mx-3 mt-3" : `px-5 ${largo ? "pt-6" : "pt-2"} pb-3`}`}>
            <div className="min-w-0">
              <Drawer.Title className="text-lg font-semibold leading-tight">{titulo}</Drawer.Title>
              {descricao ? (
                <Drawer.Description className="text-sm ba-texto-2 mt-0.5">{descricao}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{titulo}</Drawer.Description>
              )}
            </div>
            <button type="button" onClick={pedirFechar} aria-label="Fechar" className="ba-icone-botao shrink-0">
              <X className="w-5 h-5" aria-hidden />
            </button>
          </header>

          {confirmandoSaida ? (
            <div role="alertdialog" aria-label="Descartar alterações?" className="mx-5 mb-3 ba-card" data-tom="atencao" data-denso="true">
              <p className="text-sm font-bold">Descartar as alterações?</p>
              <p className="text-xs ba-texto-2 mt-0.5">O que você preencheu neste formulário será perdido.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="ba-botao ba-botao-secundario" onClick={() => setConfirmandoSaida(false)}>
                  Continuar editando
                </button>
                <button
                  type="button"
                  className="ba-botao ba-botao-perigo"
                  onClick={() => {
                    setConfirmandoSaida(false);
                    onFechar();
                  }}
                >
                  Descartar
                </button>
              </div>
            </div>
          ) : null}

          <div className={`flex-1 overflow-y-auto ba-coluna px-5 pb-5 ${familia ? "ba-animar ba-animar-d1" : ""}`}>{children}</div>
          {rodape ? (
            <footer className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t" style={{ borderColor: "var(--ba-borda)" }}>
              {rodape}
            </footer>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
