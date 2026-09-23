#!/usr/bin/env python3
"""Divide bion-store.tsx: move tipos/formatação para bion-tipos.ts (já criado)
e deixa no store apenas o provider + wire shapes + ações."""
import re

PATH = "/home/z/my-project/src/lib/bion-store.tsx"
src = open(PATH, encoding="utf-8").read()

def cut(src, start_marker, end_marker, replacement):
    """Substitui [start_marker, end_marker) por replacement."""
    i = src.index(start_marker)
    j = src.index(end_marker, i)
    return src[:i] + replacement + src[j:]

# 1) Bloco de tipos públicos + formatação → imports/re-exports de bion-tipos
A = "/* ==================================================================== */\n/* Tipos públicos — mesmas formas usadas por todos os componentes BION  */"
C = "/* ==================================================================== */\n/* Formas vindas da API (wire)                                          */"

novo_topo = '''/* ==================================================================== */
/* Tipos públicos, formatação e constantes vazias vivem em bion-tipos.ts */
/* (divisão do monólito — item 8 da auditoria). Reexportados abaixo para */
/* que os imports existentes ("@/lib/bion-store") continuem funcionando. */
/* ==================================================================== */

import {
  ApptStatus,
  AnamneseResumo,
  Arquivo,
  AuditCategoria,
  AuditLog,
  AuditSeveridade,
  Avaliacao,
  Consentimento,
  Consulta,
  Documento,
  ExameLab,
  ItemExame,
  Lembrete,
  Medicao,
  Medico,
  Mensagem,
  Notificacao,
  NotifTipo,
  PacientePerfil,
  PacienteRegistro,
  Sessao,
  TicketSuporte,
  SESSAO_VAZIA,
  PERFIL_VAZIO,
  SUPORTE_VAZIO,
  fmtCurta,
  fmtDataBR,
  fmtHora,
  fmtLonga,
  fmtMensagem,
  fmtQuando,
  fmtTicketData,
  fmtValorBRL,
} from "./bion-tipos";

export type {
  ApptStatus,
  AnamneseResumo,
  Arquivo,
  AuditCategoria,
  AuditLog,
  AuditSeveridade,
  Avaliacao,
  Consentimento,
  Consulta,
  Documento,
  ExameLab,
  ItemExame,
  Lembrete,
  Medicao,
  Medico,
  Mensagem,
  Notificacao,
  NotifTipo,
  PacientePerfil,
  PacienteRegistro,
  Sessao,
  TicketSuporte,
} from "./bion-tipos";

export {
  fmtCurta,
  fmtDataBR,
  fmtHora,
  fmtLonga,
  fmtMensagem,
  fmtQuando,
  fmtTicketData,
  fmtValorBRL,
} from "./bion-tipos";

'''

src = cut(src, A, C, novo_topo)

# 2) Constantes vazias + fmtMensagem locais → removidos (vieram de bion-tipos)
D = "const SESSAO_VAZIA: Sessao = { role: \"paciente\", nome: \"\", email: \"\" };"
E = "async function api<T>(url: string, init?: RequestInit): Promise<T | null> {"
src = cut(src, D, E, "")

# 3) imports do react: sem mudanças; garantir que "use client" segue na linha 1
open(PATH, "w", encoding="utf-8").write(src)
print("ok — novo tamanho:", len(src.splitlines()), "linhas")
