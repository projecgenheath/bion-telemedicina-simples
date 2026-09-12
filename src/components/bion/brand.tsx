"use client";
import {
  Heart,
} from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };
  const iconSizes = { sm: "w-6 h-6", md: "w-8 h-8", lg: "w-11 h-11" };
  return (
    <div className={`font-extrabold tracking-tight ${sizes[size]} flex items-center gap-2.5`}>
      <div className="relative shrink-0">
        <div
          className={`${iconSizes[size]} rounded-2xl bg-primary flex items-center justify-center shadow-md`}
        >
          <Heart className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-primary tracking-tight">BION</span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Telemedicina
        </span>
      </div>
    </div>
  );
}
export function TelaCarregando({ texto = "Carregando BION..." }: { texto?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md animate-pulse">
          <Heart className="w-6 h-6 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="text-sm font-bold text-muted-foreground">{texto}</div>
      </div>
    </div>
  );
}
