import type { Estado, Tom } from "../rotulos";
import "../admin.css";

/**
 * Chip de estado do admin: sempre TEXTO + cor (nunca só a cor).
 * Use com os mapeadores de ../rotulos (estadoConsulta, estadoRepasse…).
 */
export function ChipEstado({
  estado,
  tom,
  children,
  ponto = true,
  className = "",
}: {
  estado?: Estado;
  tom?: Tom;
  children?: React.ReactNode;
  ponto?: boolean;
  className?: string;
}) {
  const t = tom ?? estado?.tom ?? "neutro";
  return (
    <span className={`ba-chip ${className}`} data-tom={t}>
      {ponto ? <span className="ba-chip-ponto" aria-hidden /> : null}
      <span className="truncate">{children ?? estado?.rotulo}</span>
    </span>
  );
}
