import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function TemaToggle() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem("bion-tema");
      const inicial =
        salvo === "escuro" ||
        (salvo === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setEscuro(inicial);
      document.documentElement.classList.toggle("dark", inicial);
    } catch {
      /* ignora */
    }
  }, []);

  const alternar = () => {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle("dark", novo);
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
