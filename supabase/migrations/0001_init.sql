-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PACIENTE',
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilMedico" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crm" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "subespecialidades" TEXT NOT NULL DEFAULT '[]',
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "avaliacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numAvaliacoes" INTEGER NOT NULL DEFAULT 0,
    "formacao" TEXT NOT NULL DEFAULT '',
    "experiencia" TEXT NOT NULL DEFAULT '',
    "idiomas" TEXT NOT NULL DEFAULT '[]',
    "bio" TEXT NOT NULL DEFAULT '',
    "foto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "horariosDisponiveis" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "PerfilMedico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilPaciente" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cpf" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "convenio" TEXT NOT NULL DEFAULT 'Particular',
    "idade" INTEGER NOT NULL DEFAULT 0,
    "genero" TEXT NOT NULL DEFAULT '',
    "alergias" TEXT NOT NULL DEFAULT '[]',
    "medicamentos" TEXT NOT NULL DEFAULT '[]',
    "tipoSanguineo" TEXT NOT NULL DEFAULT '',
    "peso" TEXT,
    "altura" TEXT,

    CONSTRAINT "PerfilPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consulta" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmada',
    "motivoConsulta" TEXT,
    "motivoCancelamento" TEXT,
    "resumoMedico" TEXT,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "remarcada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "medicamento" TEXT,
    "posologia" TEXT,
    "duracao" TEXT,
    "observacoes" TEXT,
    "cid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arquivo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanhoKb" INTEGER NOT NULL,
    "enviadoPor" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "consulta" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "paraRole" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "pontualidade" INTEGER,
    "atencao" INTEGER,
    "clareza" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "resposta" TEXT,
    "respondidoPor" TEXT,
    "dataResposta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lembrete" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "frequencia" TEXT NOT NULL,
    "feito" BOOLEAN NOT NULL DEFAULT false,
    "medicamento" TEXT,

    CONSTRAINT "Lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consentimento" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT,
    "quem" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "documentos" INTEGER NOT NULL DEFAULT 0,
    "aceito" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consentimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "severidade" TEXT NOT NULL DEFAULT 'info',
    "usuarioId" TEXT,
    "usuarioNome" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilMedico_userId_key" ON "PerfilMedico"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilPaciente_userId_key" ON "PerfilPaciente"("userId");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilMedico" ADD CONSTRAINT "PerfilMedico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilPaciente" ADD CONSTRAINT "PerfilPaciente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentimento" ADD CONSTRAINT "Consentimento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

