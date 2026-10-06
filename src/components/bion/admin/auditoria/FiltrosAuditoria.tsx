"use client";

import { useState, type ReactNode } from "react";
import { SheetAdmin } from "../ui/SheetAdmin";
import { CATEGORIAS, FILTROS_VAZIOS, PERFIS, SEVERIDADES, type FiltrosAuditoria } from "./trilha";

/**
 * Filtros da Auditoria em sheet (vaul): categoria, severidade, perfil,
 * usuário, entidade e período (dias no fuso da clínica). Só aplica ao tocar
 * em "Aplicar"; a busca continua no cabeçalho do módulo.
 */
export function FiltrosAuditoriaSheet({
  aberto,
  onFechar,
  filtros,
  opcoes,
  onAplicar,
}: {
  aberto: boolean;
  onFechar: () => void;
  filtros: FiltrosAuditoria;
  opcoes: { usuarios: string[]; entidades: string[] };
  onAplicar: (f: Partial<FiltrosAuditoria>) => void;
}) {
  const [rascunho, setRascunho] = useState(filtros);
  // Ao abrir, parte dos filtros atuais (ajuste durante o render, sem efeito).
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setRascunho(filtros);
  }
  const m = (f: Partial<FiltrosAuditoria>) => setRascunho((x) => ({ ...x, ...f }));
  const periodoInvalido = Boolean(rascunho.de && rascunho.ate && rascunho.de > rascunho.ate);

  return (
    <SheetAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Filtros da auditoria"
      descricao="Datas no horário de Brasília (America/Sao_Paulo)."
      rodape={
        <div className="flex gap-2">
          <button
            type="button"
            className="ba-botao ba-botao-secundario flex-1"
            onClick={() => setRascunho({ ...FILTROS_VAZIOS, busca: rascunho.busca })}
          >
            Limpar
          </button>
          <button
            type="button"
            className="ba-botao ba-botao-primario flex-1"
            disabled={periodoInvalido}
            onClick={() => onAplicar({ ...rascunho, busca: filtros.busca })}
          >
            Aplicar
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Seletor id="fa-severidade" rotulo="Severidade" valor={rascunho.severidade} onMudar={(v) => m({ severidade: v as FiltrosAuditoria["severidade"] })}>
          <option value="todas">Todas</option>
          {SEVERIDADES.map((s) => (
            <option key={s.k} value={s.k}>
              {s.label}
            </option>
          ))}
        </Seletor>
        <Seletor id="fa-categoria" rotulo="Categoria" valor={rascunho.categoria} onMudar={(v) => m({ categoria: v as FiltrosAuditoria["categoria"] })}>
          <option value="todas">Todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c.k} value={c.k}>
              {c.label}
            </option>
          ))}
        </Seletor>
        <Seletor id="fa-perfil" rotulo="Perfil" valor={rascunho.perfil} onMudar={(v) => m({ perfil: v })}>
          <option value="todos">Todos</option>
          {PERFIS.map((p) => (
            <option key={p.k} value={p.k}>
              {p.label}
            </option>
          ))}
          <option value="sistema">Sistema</option>
        </Seletor>
        <Seletor id="fa-usuario" rotulo="Usuário" valor={rascunho.usuario} onMudar={(v) => m({ usuario: v })}>
          <option value="todos">Todos</option>
          {opcoes.usuarios.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Seletor>
        <Seletor id="fa-entidade" rotulo="Entidade" valor={rascunho.entidade} onMudar={(v) => m({ entidade: v })}>
          <option value="todas">Todas</option>
          {opcoes.entidades.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Seletor>
        <div className="hidden sm:block" aria-hidden />
        <div>
          <label htmlFor="fa-de" className="ba-rotulo block">
            De
          </label>
          <input id="fa-de" type="date" value={rascunho.de} onChange={(e) => m({ de: e.target.value })} className="ba-entrada mt-1" />
        </div>
        <div>
          <label htmlFor="fa-ate" className="ba-rotulo block">
            Até
          </label>
          <input
            id="fa-ate"
            type="date"
            value={rascunho.ate}
            onChange={(e) => m({ ate: e.target.value })}
            className="ba-entrada mt-1"
            aria-invalid={periodoInvalido || undefined}
            aria-describedby={periodoInvalido ? "fa-ate-erro" : undefined}
          />
        </div>
      </div>
      {periodoInvalido ? (
        <p id="fa-ate-erro" className="text-xs mt-2 font-semibold" style={{ color: "var(--ba-critico)" }}>
          A data final é antes da inicial.
        </p>
      ) : null}
    </SheetAdmin>
  );
}

function Seletor({ id, rotulo, valor, onMudar, children }: { id: string; rotulo: string; valor: string; onMudar: (v: string) => void; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="ba-rotulo block">
        {rotulo}
      </label>
      <select id={id} value={valor} onChange={(e) => onMudar(e.target.value)} className="ba-entrada mt-1 w-full">
        {children}
      </select>
    </div>
  );
}
