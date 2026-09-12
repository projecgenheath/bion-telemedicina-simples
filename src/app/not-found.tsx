"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-md">
            <Heart className="w-8 h-8 text-primary-foreground fill-primary-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-primary">404</h1>
          <h2 className="text-xl font-extrabold text-foreground">Página não encontrada</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O endereço que você tentou acessar não existe ou foi movido.
            Volte para a plataforma e continue cuidando da sua saúde.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
