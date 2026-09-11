import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function TemaToggle() {
  const [escuro, setEscuro] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const salvo = localStorage.getItem("bion-tema");
      return (
        salvo === "escuro" ||
        (salvo === null && window.matchMedia("(prefers-color-scheme: dark)").matches)
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
  }, [escuro]);

  const alternar = () => {
    const novo = !escuro;
    setEscuro(novo);
    try {
      localStorage.setItem("bion-tema", novo ? "escuro" : "claro");
    } catch {
      /* ignora */
    }
  };

  return (
    <button
      onClick={alternar}
      className="p-2.5 rounded-2xl hover:bg-muted text-muted-foreground hover:text-foreground transition"
      title={escuro ? "Usar modo claro" : "Usar modo escuro"}
      aria-label={escuro ? "Usar modo claro" : "Usar modo escuro"}
    >
      {escuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
