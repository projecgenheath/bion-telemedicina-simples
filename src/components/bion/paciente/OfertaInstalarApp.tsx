"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { estaNoAppNativo } from "@/lib/app-nativo";

type PromptInstalacao = Event & {
  prompt: () => Promise<void>;
};

function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  if (estaNoAppNativo()) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/**
 * Download opcional. Quem quiser segue no navegador: nenhum passo exige instalar.
 * Não aponta loja — o app é PWA (adicionar à tela inicial).
 */
export function OfertaInstalarApp({ mostrarContinuar = true }: { mostrarContinuar?: boolean }) {
  const [instalado, setInstalado] = useState(false);
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);
  const [ios, setIos] = useState(false);
  const [pediu, setPediu] = useState(false);

  useEffect(() => {
    setInstalado(jaInstalado());
    const nav = navigator as Navigator & { userAgent?: string };
    setIos(/iPad|iPhone|iPod/.test(nav.userAgent ?? ""));
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptInstalacao);
    };
    window.addEventListener("beforeinstallprompt", aoOferecer);
    return () => window.removeEventListener("beforeinstallprompt", aoOferecer);
  }, []);

  const baixar = async () => {
    if (!prompt) return;
    await prompt.prompt();
    setPediu(true);
    setPrompt(null);
  };

  return (
    <div className="mt-5 w-full space-y-3 self-stretch text-sm">
      {instalado ? (
        <p className="leading-relaxed opacity-80">O aplicativo já está nesta tela. Dá para seguir por aqui.</p>
      ) : (
        <>
          <p className="leading-relaxed opacity-80">
            Baixar o aplicativo é opcional. Se preferir, continue no navegador — a consulta fica na sua conta do mesmo jeito.
          </p>
          {prompt && !pediu ? (
            <button
              type="button"
              onClick={() => void baixar()}
              className="w-full min-h-11 rounded-full bg-[#2E6B47] px-4 py-3 text-sm font-bold text-white"
            >
              Baixar o aplicativo
            </button>
          ) : null}
          {ios && !prompt ? (
            <p className="leading-relaxed opacity-80">
              No iPhone ou iPad, abra o menu Compartilhar do Safari e toque em Adicionar à Tela de Início.
            </p>
          ) : null}
        </>
      )}
      {mostrarContinuar ? (
        <Link
          href="/paciente"
          className="flex min-h-11 w-full items-center justify-center rounded-full border border-[#2E6B47]/30 px-4 py-3 text-sm font-bold"
        >
          Continuar no navegador
        </Link>
      ) : null}
    </div>
  );
}
