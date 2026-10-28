import { Suspense } from "react";
import { StatusPagamentoStripe } from "@/components/bion/paciente/StatusPagamentoStripe";

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <StatusPagamentoStripe volta="sucesso" />
    </Suspense>
  );
}
