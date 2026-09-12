// Fase 3 — gera as rotas simples do grupo (app)
// Uso: node scripts/gerar_rotas_simples.mjs
import { writeFileSync } from "fs";

const base = "src/app/(app)/";
const paginas = {
  // Rota: conteúdo do page.tsx
  "notificacoes": `import { Notificacoes } from "@/components/bion/Notificacoes";

export default function PaginaNotificacoes() {
  return <Notificacoes />;
}
`,
  "medico-perfil": `import { MedicoPerfilView } from "@/components/bion/MedicoPerfilView";

export default function PaginaMedicoPerfil() {
  return <MedicoPerfilView />;
}
`,
  "perfil": `import { PacientePerfilView } from "@/components/bion/PacientePerfilView";

export default function PaginaPerfil() {
  return <PacientePerfilView />;
}
`,
  "historico": `import { HistoricoClinico } from "@/components/bion/HistoricoClinico";

export default function PaginaHistorico() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <HistoricoClinico />
    </div>
  );
}
`,
  "mensagens": `import { Mensagens } from "@/components/bion/telas/Mensagens";

export default function PaginaMensagens() {
  return <Mensagens />;
}
`,
  "lembretes": `import { Lembretes } from "@/components/bion/telas/Lembretes";

export default function PaginaLembretes() {
  return <Lembretes />;
}
`,
  "usuarios": `import { Usuarios } from "@/components/bion/Usuarios";

export default function PaginaUsuarios() {
  return <Usuarios />;
}
`,
  "prontuario": `import { Prontuario } from "@/components/bion/Prontuario";

export default function PaginaProntuario() {
  return <Prontuario />;
}
`,
  "relatorios": `import { Relatorios } from "@/components/bion/Relatorios";

export default function PaginaRelatorios() {
  return <Relatorios />;
}
`,
  "suporte": `import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";

export default function PaginaSuporte() {
  return <ChamadosSuporte />;
}
`,
  "bion-ia": `import { BionIA } from "@/components/bion/BionIA";

export default function PaginaBionIA() {
  return <BionIA />;
}
`,
  "avaliacoes": `import { MinhasAvaliacoes } from "@/components/bion/MinhasAvaliacoes";

export default function PaginaAvaliacoes() {
  return <MinhasAvaliacoes />;
}
`,
  "auditoria": `import { AuditTrail } from "@/components/bion/AuditTrail";

export default function PaginaAuditoria() {
  return <AuditTrail />;
}
`,
  "receitas": `"use client";

import { useBion } from "@/lib/bion-store";
import { Receitas } from "@/components/bion/Receitas";

export default function PaginaReceitas() {
  const { sessao } = useBion();
  return <Receitas perfil={sessao.role === "medico" ? "medico" : "paciente"} />;
}
`,
  "ajuda": `"use client";

import { useBion } from "@/lib/bion-store";
import { Ajuda } from "@/components/bion/Ajuda";

export default function PaginaAjuda() {
  const { sessao } = useBion();
  return <Ajuda perfil={sessao.role} />;
}
`,
  "privacidade": `"use client";

import { useBion } from "@/lib/bion-store";
import { PrivacidadeAdmin } from "@/components/bion/PrivacidadeAdmin";
import { PrivacidadePaciente } from "@/components/bion/PrivacidadePaciente";

export default function PaginaPrivacidade() {
  const { sessao } = useBion();
  return sessao.role === "admin" ? <PrivacidadeAdmin /> : <PrivacidadePaciente />;
}
`,
  "admin-pacientes": `import { AdminPacientes } from "@/components/bion/AdminPacientes";

export default function PaginaAdminPacientes() {
  return <AdminPacientes />;
}
`,
  "admin-medicos": `import { AdminMedicos } from "@/components/bion/AdminMedicos";

export default function PaginaAdminMedicos() {
  return <AdminMedicos />;
}
`,
  "admin-agendamentos": `import { AdminAgendamentos } from "@/components/bion/AdminAgendamentos";

export default function PaginaAdminAgendamentos() {
  return <AdminAgendamentos />;
}
`,
  "medico-pacientes": `import { MedicoPacientes } from "@/components/bion/MedicoPacientes";

export default function PaginaMedicoPacientes() {
  return <MedicoPacientes />;
}
`,
};

for (const [rota, conteudo] of Object.entries(paginas)) {
  writeFileSync(`${base}${rota}/page.tsx`, conteudo);
  console.log("rota criada:", rota);
}
console.log(`\n${Object.keys(paginas).length} rotas geradas.`);
