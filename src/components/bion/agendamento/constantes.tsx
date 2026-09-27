"use client";

import {
  Stethoscope,
  Heart,
  Sparkles,
  UserCheck,
} from "lucide-react";

export const ESPECIALIDADES = [
  {
    id: "clinica",
    nome: "Clínica Geral",
    desc: "Check-ups, sintomas gerais, receitas e atestados",
    icone: Stethoscope,
  },
  {
    id: "cardio",
    nome: "Cardiologia",
    desc: "Pressão arterial, coração, prevenção e arritmias",
    icone: Heart,
  },
  {
    id: "dermato",
    nome: "Dermatologia",
    desc: "Pele, cabelos, unhas, acne e alergias",
    icone: Sparkles,
  },
  {
    id: "pediatria",
    nome: "Pediatria",
    desc: "Saúde e desenvolvimento infantil e bebês",
    icone: UserCheck,
  },
  {
    id: "psico",
    nome: "Psicologia",
    desc: "Terapia online, ansiedade, estresse e suporte emocional",
    icone: Stethoscope,
  },
  {
    id: "ortopedia",
    nome: "Ortopedia",
    desc: "Dores articulares, postura, coluna e lesões",
    icone: Stethoscope,
  },
];

export const SINTOMAS_RAPIDOS = [
  "Dor de cabeça / Enxaqueca",
  "Sintomas gripais / Febre",
  "Renovação de receita de uso contínuo",
  "Check-up geral de rotina",
  "Avaliação de exames laboratoriais",
  "Pressão alta / Palpitações",
  "Alergia na pele / Coceira",
  "Dor nas costas / Postura",
];


export const PASSOS_AGENDAMENTO = [
  "Especialidade",
  "Médico",
  "Data",
  "Horário",
  "Motivo & Sintomas",
  "Anexar Exames",
  "Pagamento",
  "Confirmação",
] as const;
