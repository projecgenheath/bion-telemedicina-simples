"use client";

import { Bell, BellRing, CircleHelp, LogOut, Shield, type LucideIcon } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { AlternarDensidade, AlternarTema } from "../ui/AlternarTema";
import { useCamadasAdmin } from "../AdminShell";

/** Conta do administrador: aparência, atalhos pessoais e sair. */
export function ContaPainel({ onAbrir, onSair, comTitulo = true }: { onAbrir: (view: string) => void; onSair: () => void; comTitulo?: boolean }) {
  const { sessao, naoLidas } = useBion();
  const { fechar } = useCamadasAdmin();
  const links: { view: string; rotulo: string; icone: LucideIcon; extra?: string }[] = [
    { view: "notificacoes", rotulo: "Notificações", icone: Bell, extra: naoLidas ? `${naoLidas} não lidas` : undefined },
    { view: "lembretes", rotulo: "Lembretes", icone: BellRing },
    { view: "privacidade", rotulo: "Privacidade & LGPD", icone: Shield },
    { view: "ajuda", rotulo: "Ajuda", icone: CircleHelp },
  ];
  return (
    <div className="px-4 lg:px-0 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-0 pb-28 lg:pb-4 space-y-3">
      {comTitulo ? <h2 className="text-2xl font-black mb-1">Sua conta</h2> : null}
      <section className="ba-card">
        <p className="font-bold break-words">{sessao.nome}</p>
        {sessao.email ? <p className="text-sm ba-texto-2 break-all">{sessao.email}</p> : null}
        <p className="text-xs ba-texto-3 mt-1">Administrador</p>
      </section>
      <section className="ba-card space-y-3">
        <h3 className="ba-rotulo">Aparência</h3>
        <AlternarTema />
        <div>
          <AlternarDensidade />
        </div>
      </section>
      <nav className="ba-card !p-2" aria-label="Atalhos da conta">
        <ul>
          {links.map((l) => (
            <li key={l.view}>
              <button
                type="button"
                onClick={() => {
                  fechar();
                  onAbrir(l.view);
                }}
                className="ba-trilho-item"
              >
                <l.icone className="w-5 h-5 shrink-0" aria-hidden />
                <span className="flex-1 text-left">{l.rotulo}</span>
                {l.extra ? <span className="text-xs ba-texto-2">{l.extra}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <button type="button" onClick={onSair} className="ba-botao ba-botao-perigo w-full">
        <LogOut className="w-4 h-4" aria-hidden /> Sair da conta
      </button>
    </div>
  );
}
