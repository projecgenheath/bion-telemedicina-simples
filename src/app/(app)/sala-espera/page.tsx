"use client";

import { useRouter } from "next/navigation";
import { SalaEspera } from "@/components/bion/SalaEspera";

export default function PaginaSalaEspera() {
  const router = useRouter();
  return <SalaEspera onEnter={() => router.push("/consulta")} />;
}
