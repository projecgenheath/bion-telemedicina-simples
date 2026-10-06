"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChamadaTeleconsulta, ESTADO_INICIAL, type EstadoChamada } from "@/lib/teleconsulta-chamada";

export type { StatusSala, MsgChat, EstadoChamada } from "@/lib/teleconsulta-chamada";
export type { Qualidade } from "@/lib/teleconsulta-logica";

/**
 * Hook React da sala de teleconsulta. Toda a lógica de WebRTC, sinalização,
 * reconexão e qualidade fica em lib/teleconsulta-chamada.ts (uma instância
 * por montagem da sala; cada montagem é uma SESSÃO nova — recarregar a
 * página de qualquer lado recria a conexão do outro lado sem travar).
 *
 * Expõe, além do que já existia: `qualidade` ('boa' | 'fraca' | 'ruim'),
 * `reconectando`, `outroSaiu` e `sair()` (paciente sai sem encerrar a
 * consulta). `encerrar()` é do médico: encerra a chamada para os dois.
 */
export function useTeleconsulta(consultaId: string | undefined) {
  const [estado, setEstado] = useState<EstadoChamada>(ESTADO_INICIAL);
  const streamLocalRef = useRef<MediaStream | null>(null);
  const streamRemotoRef = useRef<MediaStream | null>(null);
  const chamadaRef = useRef<ChamadaTeleconsulta | null>(null);

  useEffect(() => {
    if (!consultaId) return;
    const chamada = new ChamadaTeleconsulta(consultaId, streamLocalRef, streamRemotoRef, setEstado);
    chamadaRef.current = chamada;
    // O primeiro aviso da instância nova já traz o estado completo (ESTADO_INICIAL + mudanças).
    chamada.iniciar();
    return () => {
      chamada.destruir();
      if (chamadaRef.current === chamada) chamadaRef.current = null;
    };
  }, [consultaId]);

  const toggleMic = useCallback(() => chamadaRef.current?.toggleMic(), []);
  const toggleCam = useCallback(() => chamadaRef.current?.toggleCam(), []);
  const compartilharTela = useCallback(async () => {
    await chamadaRef.current?.compartilharTela();
  }, []);
  const pararCompartilhamento = useCallback(() => chamadaRef.current?.pararCompartilhamento(), []);
  const enviarChat = useCallback((texto: string) => chamadaRef.current?.enviarChat(texto), []);
  const sair = useCallback(() => chamadaRef.current?.sair(), []);
  const encerrar = useCallback(() => chamadaRef.current?.encerrar(), []);

  return {
    ...estado,
    streamLocalRef,
    streamRemotoRef,
    toggleMic,
    toggleCam,
    compartilharTela,
    pararCompartilhamento,
    enviarChat,
    sair,
    encerrar,
  };
}
