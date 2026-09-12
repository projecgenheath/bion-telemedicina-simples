/**
 * Seed do BION Telemedicina — cria contas demo com senhas reais (bcrypt)
 * e os dados iniciais da plataforma (médicos, consultas, documentos, etc.).
 *
 * Executar: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DIA = 86400000;

/** Data/hora local de hoje+deslocamento (ex.: em(-45, 10, 0) = 45 dias atrás às 10:00) */
function em(dias: number, hora = 10, minuto = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

async function main() {
  console.log("Limpando banco...");
  await db.auditLog.deleteMany();
  await db.consentimento.deleteMany();
  await db.lembrete.deleteMany();
  await db.ticket.deleteMany();
  await db.avaliacao.deleteMany();
  await db.notificacao.deleteMany();
  await db.arquivo.deleteMany();
  await db.documento.deleteMany();
  await db.consulta.deleteMany();
  await db.perfilMedico.deleteMany();
  await db.perfilPaciente.deleteMany();
  await db.sessao.deleteMany();
  await db.user.deleteMany();

  const senhaHash = await bcrypt.hash("bion123", 10);

  console.log("Criando usuários...");
  const admin = await db.user.create({
    data: { nome: "Administrador Geral", email: "admin@bion.app", senhaHash, role: "ADMIN" },
  });

  const marina = await db.user.create({
    data: {
      nome: "Marina Silva", email: "marina.silva@email.com", senhaHash, role: "PACIENTE",
      perfilPaciente: {
        create: {
          cpf: "123.456.789-00", telefone: "(11) 98765-4321", convenio: "Particular",
          idade: 32, genero: "Feminino", tipoSanguineo: "O+", peso: "62 kg", altura: "1,68 m",
          alergias: JSON.stringify(["Dipirona", "Frutos do mar"]),
          medicamentos: JSON.stringify(["Losartana 50mg (1x/dia)", "Vitamina D 2.000 UI (semanal)"]),
        },
      },
    },
  });

  const joao = await db.user.create({
    data: {
      nome: "João Pereira", email: "joao.pereira@email.com", senhaHash, role: "PACIENTE",
      perfilPaciente: {
        create: {
          cpf: "234.567.890-11", telefone: "(11) 97654-3210", convenio: "Unimed",
          idade: 45, genero: "Masculino", tipoSanguineo: "A+",
          alergias: JSON.stringify([]), medicamentos: JSON.stringify([]),
        },
      },
    },
  });

  const carlosS = await db.user.create({
    data: {
      nome: "Carlos Souza", email: "carlos.souza@email.com", senhaHash, role: "PACIENTE",
      perfilPaciente: {
        create: {
          cpf: "345.678.901-22", telefone: "(21) 99876-5432", convenio: "Bradesco Saúde",
          idade: 58, genero: "Masculino", tipoSanguineo: "B+",
          alergias: JSON.stringify([]), medicamentos: JSON.stringify([]),
        },
      },
    },
  });

  const beatriz = await db.user.create({
    data: {
      nome: "Beatriz Almeida", email: "beatriz.almeida@email.com", senhaHash, role: "PACIENTE",
      status: "inativo",
      perfilPaciente: {
        create: {
          cpf: "456.789.012-33", telefone: "(31) 98111-2233", convenio: "Particular",
          idade: 27, genero: "Feminino",
          alergias: JSON.stringify([]), medicamentos: JSON.stringify([]),
        },
      },
    },
  });

  const medicosSeed = [
    { nome: "Dra. Ana Ribeiro", email: "ana.ribeiro@med.bion.app", crm: "CRM 12345 SP",
      especialidade: "Clínica Geral",
      subespecialidades: ["Medicina Preventiva", "Check-up Geral", "Doenças Crônicas", "Hipertensão"],
      valor: 150, avaliacao: 4.9, numAvaliacoes: 312,
      formacao: "Graduação em Medicina pela USP (2012) • Residência em Clínica Médica pelo HC-FMUSP (2015)",
      experiencia: "12 anos de experiência em teleatendimento e gestão de pacientes crônicos.",
      idiomas: ["Português", "Inglês", "Espanhol"],
      bio: "Dedicada a um atendimento humanizado, empático e resolutivo. Acredito que a tecnologia deve aproximar médico e paciente.",
      horarios: ["09:00", "10:00", "11:30", "14:30", "15:30", "16:30"] },
    { nome: "Dr. Carlos Mendes", email: "carlos.mendes@med.bion.app", crm: "CRM 23456 RJ",
      especialidade: "Cardiologia",
      subespecialidades: ["Hipertensão", "Arritmias", "Prevenção Cardiovascular", "Acompanhamento Pós-Cirúrgico"],
      valor: 180, avaliacao: 4.8, numAvaliacoes: 198,
      formacao: "Graduação pela UFRJ (2010) • Especialização pelo Instituto Nacional de Cardiologia (INC)",
      experiencia: "Mais de 14 anos cuidando da saúde do coração de milhares de pacientes em todo o Brasil.",
      idiomas: ["Português", "Inglês"],
      bio: "Especialista em saúde cardiovascular preventiva e controle rigoroso de fatores de risco com acompanhamento próximo.",
      horarios: ["08:30", "10:00", "14:00", "15:30", "17:00"] },
    { nome: "Dra. Julia Lima", email: "julia.lima@med.bion.app", crm: "CRM 34567 MG",
      especialidade: "Dermatologia",
      subespecialidades: ["Acne e Rosácea", "Tricologia (Cabelos)", "Dermatologia Clínica", "Peles Sensíveis"],
      valor: 160, avaliacao: 5.0, numAvaliacoes: 245,
      formacao: "Medicina pela UFMG • Residência em Dermatologia pelo Hospital das Clínicas da UFMG",
      experiencia: "Dermatologista com foco em avaliação fotográfica digital e prescrições individualizadas.",
      idiomas: ["Português", "Francês", "Inglês"],
      bio: "A pele reflete nosso equilíbrio e bem-estar. Meu objetivo é descomplicar seu tratamento dermatológico.",
      horarios: ["09:30", "11:00", "13:30", "15:00", "16:30"] },
    { nome: "Dr. Roberto Campos", email: "roberto.campos@med.bion.app", crm: "CRM 45678 RS",
      especialidade: "Pediatria",
      subespecialidades: ["Puericultura", "Desenvolvimento Infantil", "Alergias na Infância", "Nutrição Infantil"],
      valor: 160, avaliacao: 4.9, numAvaliacoes: 180,
      formacao: "Graduação pela UFRGS • Título de Especialista pela Sociedade Brasileira de Pediatria",
      experiencia: "10 anos acolhendo famílias e orientando pais em todas as fases de crescimento.",
      idiomas: ["Português", "Inglês"],
      bio: "Atendimento carinhoso e descomplicado para o bem-estar e saúde plena dos pequenos.",
      horarios: ["08:00", "09:30", "11:00", "14:00", "16:00"] },
    { nome: "Dra. Camila Torres", email: "camila.torres@med.bion.app", crm: "CRM 56789 PR",
      especialidade: "Psicologia",
      subespecialidades: ["Terapia Cognitivo-Comportamental", "Ansiedade e Estresse", "Autoconhecimento", "Burnout"],
      valor: 140, avaliacao: 4.9, numAvaliacoes: 320,
      formacao: "Psicologia pela UFPR • Especialista em Terapia Cognitivo-Comportamental",
      experiencia: "Ampla experiência em acolhimento psicológico online seguro e confidencial.",
      idiomas: ["Português", "Espanhol"],
      bio: "Espaço de escuta sem julgamentos para você lidar com ansiedade, rotina e emoções.",
      horarios: ["08:00", "10:00", "13:00", "15:00", "17:00", "19:00"] },
    { nome: "Dr. Felipe Rocha", email: "felipe.rocha@med.bion.app", crm: "CRM 67890 BA",
      especialidade: "Ortopedia",
      subespecialidades: ["Coluna e Postura", "Dor Crônica", "Ortopedia Esportiva", "Reabilitação"],
      valor: 170, avaliacao: 4.7, numAvaliacoes: 110,
      formacao: "Medicina pela UFBA • Membro da SBOT (Sociedade Brasileira de Ortopedia e Traumatologia)",
      experiencia: "Orientação diagnóstica precisa e indicação dos melhores caminhos de fisioterapia e reabilitação.",
      idiomas: ["Português"],
      bio: "Focado em alívio da dor, mobilidade e melhora duradoura da qualidade de vida.",
      horarios: ["10:00", "11:30", "14:30", "16:00"] },
  ];

  const medicos: Record<string, string> = {};
  for (const m of medicosSeed) {
    const u = await db.user.create({
      data: {
        nome: m.nome, email: m.email, senhaHash, role: "MEDICO",
        perfilMedico: {
          create: {
            crm: m.crm, especialidade: m.especialidade, valor: m.valor,
            avaliacao: m.avaliacao, numAvaliacoes: m.numAvaliacoes,
            formacao: m.formacao, experiencia: m.experiencia, bio: m.bio,
            subespecialidades: JSON.stringify(m.subespecialidades),
            idiomas: JSON.stringify(m.idiomas),
            horariosDisponiveis: JSON.stringify(m.horarios),
            status: "ativo",
          },
        },
      },
    });
    medicos[m.nome] = u.id;
  }

  console.log("Criando consultas...");
  const c1 = await db.consulta.create({ data: {
    pacienteId: marina.id, medicoId: medicos["Dra. Ana Ribeiro"], especialidade: "Clínica Geral",
    dataInicio: em(0, 14, 30), status: "confirmada", pago: true, valor: 150,
    motivoConsulta: "Revisão de exames e acompanhamento de rotina.",
  }});
  const c2 = await db.consulta.create({ data: {
    pacienteId: marina.id, medicoId: medicos["Dr. Carlos Mendes"], especialidade: "Cardiologia",
    dataInicio: em(3, 15, 30), status: "confirmada", pago: true, valor: 180,
    motivoConsulta: "Avaliação de pressão arterial e check-up cardiológico.",
  }});
  const c3 = await db.consulta.create({ data: {
    pacienteId: joao.id, medicoId: medicos["Dra. Ana Ribeiro"], especialidade: "Clínica Geral",
    dataInicio: em(0, 16, 0), status: "confirmada", pago: true, valor: 150,
    motivoConsulta: "Sintomas gripais e dor de cabeça há 2 dias.",
  }});
  const c4 = await db.consulta.create({ data: {
    pacienteId: marina.id, medicoId: medicos["Dra. Julia Lima"], especialidade: "Dermatologia",
    dataInicio: em(-45, 10, 0), status: "concluida", pago: true, valor: 160,
    motivoConsulta: "Avaliação de lesão de pele e alergia de contato.",
    resumoMedico: "Paciente compareceu com queixa de alergia de contato. Prescrito anti-histamínico e hidratação tópica.",
  }});
  await db.consulta.create({ data: {
    pacienteId: joao.id, medicoId: medicos["Dr. Carlos Mendes"], especialidade: "Cardiologia",
    dataInicio: em(-20, 9, 0), status: "concluida", pago: true, valor: 180,
    motivoConsulta: "Dor torácica atípica para avaliação.",
    resumoMedico: "ECG sem alterações isquêmicas. Orientado controle de pressão e retorno em 6 meses.",
  }});
  await db.consulta.create({ data: {
    pacienteId: carlosS.id, medicoId: medicos["Dra. Camila Torres"], especialidade: "Psicologia",
    dataInicio: em(-12, 15, 0), status: "concluida", pago: true, valor: 140,
    motivoConsulta: "Sessão de acompanhamento — ansiedade.",
    resumoMedico: "Sessão produtiva. Paciente relatando melhora gradual com técnica de respiração.",
  }});

  console.log("Criando documentos...");
  const d1 = await db.documento.create({ data: {
    tipo: "receita", titulo: "Receita — Losartana 50mg",
    conteudo: "Losartana 50mg — 1 comprimido ao dia, pela manhã, por 30 dias.",
    medicoId: medicos["Dra. Ana Ribeiro"], pacienteId: marina.id,
    medicamento: "Losartana 50mg", posologia: "1 comprimido ao dia, pela manhã", duracao: "30 dias",
    observacoes: "Medir pressão arterial 2x por semana em repouso.",
    createdAt: em(-22, 15, 10),
  }});
  const d2 = await db.documento.create({ data: {
    tipo: "atestado", titulo: "Atestado — 2 dias de afastamento",
    conteudo: "Atesto, para os devidos fins, que a paciente necessita de afastamento de suas atividades por 2 (dois) dias a partir desta data para recuperação clínica.",
    medicoId: medicos["Dr. Carlos Mendes"], pacienteId: marina.id, duracao: "2 dias", cid: "R51 (Cefaleia)",
    observacoes: "Paciente orientada a repouso e hidratação.",
    createdAt: em(-28, 11, 30),
  }});
  await db.documento.create({ data: {
    tipo: "receita", titulo: "Receita — Dipirona 500mg",
    conteudo: "Dipirona 500mg — 1 comprimido a cada 8 horas em caso de dor ou febre.",
    medicoId: medicos["Dra. Julia Lima"], pacienteId: joao.id,
    medicamento: "Dipirona 500mg", posologia: "1 comprimido a cada 8h", duracao: "5 dias",
    createdAt: em(-25, 10, 20),
  }});
  await db.documento.create({ data: {
    tipo: "exame_solicitado", titulo: "Solicitação — Hemograma completo + PCR",
    conteudo: "Solicito hemograma completo e proteína C reativa para investigação de quadro infeccioso.",
    medicoId: medicos["Dra. Ana Ribeiro"], pacienteId: marina.id,
    observacoes: "Jejum de 4 horas não necessário para estes exames.",
    createdAt: em(-22, 15, 15),
  }});

  console.log("Criando arquivos...");
  await db.arquivo.create({ data: { nome: "hemograma-completo.pdf", tipo: "Exame laboratorial", tamanhoKb: 480, enviadoPor: "paciente", usuarioId: marina.id, consulta: "Clínica Geral — Dra. Ana Ribeiro", createdAt: em(-30, 9, 12) } });
  await db.arquivo.create({ data: { nome: "receita-losartana.pdf", tipo: "Receita", tamanhoKb: 120, enviadoPor: "medico", usuarioId: medicos["Dra. Ana Ribeiro"], consulta: "Clínica Geral — Dra. Ana Ribeiro", createdAt: em(-22, 15, 12) } });
  await db.arquivo.create({ data: { nome: "eletrocardiograma-laudo.pdf", tipo: "Exame cardiológico", tamanhoKb: 650, enviadoPor: "paciente", usuarioId: marina.id, consulta: "Cardiologia — Dr. Carlos Mendes", createdAt: em(-35, 14, 45) } });

  console.log("Criando notificações...");
  await db.notificacao.create({ data: { usuarioId: marina.id, paraRole: "PACIENTE", tipo: "agenda", titulo: "Sua consulta é hoje!", texto: "Dra. Ana Ribeiro às 14:30. A sala de espera já está disponível para testes de câmera.", lida: false, createdAt: em(0, 13, 45) } });
  await db.notificacao.create({ data: { usuarioId: marina.id, paraRole: "PACIENTE", tipo: "lembrete", titulo: "Hora do medicamento", texto: "Losartana 50mg — tomar 1 comprimido com água.", lida: false, createdAt: em(0, 8, 0) } });
  await db.notificacao.create({ data: { usuarioId: marina.id, paraRole: "PACIENTE", tipo: "mensagem", titulo: "Mensagem da Dra. Ana Ribeiro", texto: "Seus exames de sangue estão ótimos, sem alterações importantes 🙂", lida: true, createdAt: em(-1, 18, 30) } });
  await db.notificacao.create({ data: { usuarioId: marina.id, paraRole: "PACIENTE", tipo: "receita", titulo: "Receita assinada disponível", texto: "Receita de Losartana 50mg pronta para download e compra na farmácia.", lida: true, createdAt: em(-22, 15, 20) } });
  await db.notificacao.create({ data: { usuarioId: medicos["Dra. Ana Ribeiro"], paraRole: "MEDICO", tipo: "agenda", titulo: "Novo paciente agendado", texto: "Marina Silva agendou consulta de retorno para hoje às 14:30.", lida: false, createdAt: em(-1, 19, 0) } });

  console.log("Criando avaliações...");
  await db.avaliacao.create({ data: { consultaId: c4.id, pacienteId: marina.id, medicoId: medicos["Dra. Julia Lima"], nota: 5, comentario: "Atendimento maravilhoso! Muito atenciosa, explicou detalhadamente o tratamento da minha pele.", pontualidade: 5, atencao: 5, clareza: 5, createdAt: em(-45, 10, 40) } });
  await db.avaliacao.create({ data: { pacienteId: joao.id, medicoId: medicos["Dra. Ana Ribeiro"], nota: 5, comentario: "Excelente médica. Pontual, prestativa e a receita digital funcionou de primeira na farmácia.", pontualidade: 5, atencao: 5, clareza: 5, createdAt: em(-20, 16, 20) } });
  await db.avaliacao.create({ data: { pacienteId: carlosS.id, medicoId: medicos["Dr. Carlos Mendes"], nota: 5, comentario: "Ótimo cardiologista. Passou muita tranquilidade e orientações claras sobre exercícios e pressão.", pontualidade: 5, atencao: 5, clareza: 5, createdAt: em(-10, 14, 15) } });

  console.log("Criando tickets...");
  await db.ticket.create({ data: { usuarioId: marina.id, perfil: "paciente", assunto: "Dúvida sobre validação de receita digital na farmácia", categoria: "tecnico", mensagem: "Gostaria de saber se o QR Code do PDF é aceito em qualquer farmácia de São Paulo.", status: "resolvido", resposta: "Sim, Marina! Todas as nossas receitas possuem assinatura digital com padrão ICP-Brasil e QR Code válido em farmácias físicas e online.", respondidoPor: "Suporte BION", dataResposta: em(-1, 17, 10), createdAt: em(-1, 16, 30) } });
  await db.ticket.create({ data: { usuarioId: medicos["Dra. Ana Ribeiro"], perfil: "medico", assunto: "Solicitação de inclusão de nova subespecialidade", categoria: "outro", mensagem: "Gostaria de adicionar 'Medicina do Estilo de Vida' ao meu perfil de atendimento.", status: "em_andamento", createdAt: em(0, 9, 15) } });
  await db.ticket.create({ data: { usuarioId: joao.id, perfil: "paciente", assunto: "Confirmação do pagamento Pix", categoria: "pagamento", mensagem: "Fiz o pagamento via Pix mas a tela demorou 1 minuto para atualizar. A consulta está confirmada?", status: "resolvido", resposta: "Olá João! Verificamos aqui e seu Pix foi aprovado com sucesso. Sua consulta com a Dra. Ana Ribeiro está 100% confirmada para hoje às 16:00.", respondidoPor: "Suporte BION", dataResposta: em(0, 11, 8), createdAt: em(0, 11, 0) } });

  console.log("Criando lembretes...");
  await db.lembrete.create({ data: { usuarioId: marina.id, titulo: "Losartana 50mg", horario: "08:00", tipo: "Medicação", frequencia: "Todos os dias", feito: false, medicamento: "Losartana 50mg" } });
  await db.lembrete.create({ data: { usuarioId: marina.id, titulo: "Medir Pressão Arterial", horario: "09:00", tipo: "Exame", frequencia: "Terças e Quintas", feito: true } });
  await db.lembrete.create({ data: { usuarioId: marina.id, titulo: "Beber 500ml de água", horario: "11:00", tipo: "Hidratação", frequencia: "A cada 2 horas", feito: true } });
  await db.lembrete.create({ data: { usuarioId: marina.id, titulo: "Consulta com Dra. Ana Ribeiro", horario: "14:30", tipo: "Consulta", frequencia: "Hoje", feito: false } });

  console.log("Criando trilha de auditoria...");
  const aud = (diasAtras: number, acao: string, categoria: string, severidade: string, u: { id: string; nome: string; role: string }, detalhes: string, entidade?: string, entidadeId?: string) =>
    db.auditLog.create({ data: { acao, categoria, severidade, usuarioId: u.id, usuarioNome: u.nome, role: u.role, detalhes, entidade, entidadeId, createdAt: em(-diasAtras, 12, 0) } });

  const uMarina = { id: marina.id, nome: marina.nome, role: "PACIENTE" };
  const uAna = { id: medicos["Dra. Ana Ribeiro"], nome: "Dra. Ana Ribeiro", role: "MEDICO" };
  const uAdmin = { id: admin.id, nome: "Admin BION", role: "ADMIN" };
  const uBeatriz = { id: beatriz.id, nome: "Beatriz Costa", role: "PACIENTE" };

  await aud(28, "LOGIN", "autenticacao", "info", uMarina, "Login realizado com sucesso");
  await aud(27, "CONSULTA_AGENDADA", "consulta", "info", uMarina, "Agendamento com Dra. Ana Ribeiro — Clínica Geral", "consulta", c1.id);
  await aud(25, "LOGIN", "autenticacao", "info", uAna, "Login realizado com sucesso");
  await aud(24, "PRONTUARIO_VISUALIZADO", "prontuario", "info", uAna, "Acesso ao prontuário de Marina Silva", "prontuario");
  await aud(22, "CONSULTA_INICIADA", "consulta", "info", uMarina, "Entrada na sala de consulta com Dra. Ana Ribeiro", "consulta", c1.id);
  await aud(22, "DOCUMENTO_EMITIDO", "documento", "info", uAna, "Receita digital emitida para Marina Silva — Losartana 50mg", "documento", d1.id);
  await aud(20, "CONSENTIMENTO_REGISTRADO", "consentimento", "info", uMarina, "Consentimento aceito para geração de PDF do prontuário (3 documentos)", "consentimento");
  await aud(18, "PRONTUARIO_PDF_EXPORTADO", "prontuario", "warning", uMarina, "PDF do prontuário exportado com 3 documentos", "prontuario");
  await aud(15, "MEDICO_APROVADO", "admin", "critical", uAdmin, "CRM de Dr. Felipe Rocha validado e ativado", "medico", medicos["Dr. Felipe Rocha"]);
  await aud(14, "LOGIN", "autenticacao", "info", uAdmin, "Login administrativo realizado");
  await aud(12, "CONSULTA_CANCELADA", "consulta", "warning", uMarina, "Consulta com Dr. Carlos Mendes cancelada — Motivo: conflito de agenda", "consulta");
  await aud(10, "AVALIACAO_REGISTRADA", "consulta", "info", uBeatriz, "Avaliação 5 estrelas para Dr. Carlos Mendes", "avaliacao");
  await aud(8, "TICKET_CRIADO", "suporte", "info", uMarina, "Chamado aberto: Problema com câmera na consulta", "ticket");
  await aud(7, "TICKET_RESPONDIDO", "suporte", "info", uAdmin, "Chamado respondido: orientações sobre permissões do navegador", "ticket");
  await aud(5, "MEDICO_SUSPENSO", "admin", "critical", uAdmin, "Dr. Felipe Rocha suspenso por pendência documental", "medico", medicos["Dr. Felipe Rocha"]);
  await aud(3, "PERFIL_ATUALIZADO", "usuario", "info", uMarina, "Dados pessoais atualizados: telefone e convênio", "perfil");
  await aud(2, "RELATORIO_GERADO", "admin", "info", uAdmin, "Relatório mensal de consultas gerado", "relatorio");
  await aud(1, "DOCUMENTO_PDF_BAIXADO", "documento", "info", uMarina, "Download do PDF da receita — Losartana 50mg", "documento", d2.id);
  await aud(0.5, "IA_CONSULTA_REALIZADA", "sistema", "info", uMarina, "Consulta à IA sobre interações medicamentosas", "bion-ia");
  await aud(0.2, "CONSULTA_REMARCADA", "consulta", "warning", uMarina, "Consulta com Dra. Julia Lima remarcada para 18 Dez às 10:00", "consulta", c2.id);

  console.log("Criando consentimento de exemplo...");
  await db.consentimento.create({ data: { pacienteId: marina.id, quem: marina.nome, perfil: "PACIENTE", finalidade: "Geração de prontuário em PDF", documentos: 3, aceito: true, createdAt: em(-20, 12, 5) } });

  console.log("\n✅ Seed concluído!");
  console.log("\nContas demo (senha: bion123):");
  console.log("  Paciente: marina.silva@email.com");
  console.log("  Médico:   ana.ribeiro@med.bion.app");
  console.log("  Admin:    admin@bion.app");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
