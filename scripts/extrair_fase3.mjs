// Fase 3 — extrai as telas inline do page.tsx para componentes com rotas reais
// Uso: node scripts/extrair_fase3.mjs
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const ARQ = "scripts/page_original.tsx";
const linhas = readFileSync(ARQ, "utf8").split("\n");
const corte = (a, b) => linhas.slice(a - 1, b).join("\n");

const ICONS = [
  "Activity","Calendar","Video","FileText","MessageSquare","User","Bell","Search",
  "Stethoscope","Shield","Clock","ChevronRight","Plus","Users","TrendingUp","Wifi",
  "Mic","Camera","MonitorUp","Paperclip","PhoneOff","Pill","ClipboardList","Star",
  "Award","Globe","ArrowRight","Check","Heart","Sparkles","LogOut","Home","FolderHeart",
  "Menu","LifeBuoy","Bot","Trash2","FileSearch","CircleHelp",
];

function importsPara(chunk, opts = {}) {
  const { hooks = true, router = false, pathname = false, locais = [], rotaHelpers = false } = opts;
  const parts = [];
  const usadosHooks = ["useState", "useEffect", "useMemo", "useCallback"].filter((h) =>
    new RegExp(`\\b${h}\\b`).test(chunk),
  );
  if (hooks && usadosHooks.length) parts.push(`import { ${usadosHooks.join(", ")} } from "react";`);
  const nav = [];
  if (router) nav.push("useRouter");
  if (pathname) nav.push("usePathname");
  if (nav.length) parts.push(`import { ${nav.join(", ")} } from "next/navigation";`);
  const icones = ICONS.filter((i) => new RegExp(`\\b${i}\\b`).test(chunk));
  if (icones.length) parts.push(`import {\n  ${icones.join(",\n  ")},\n} from "lucide-react";`);
  if (/\btoast\./.test(chunk)) parts.push(`import { toast } from "sonner";`);
  if (/\buseBion\s*\(/.test(chunk)) parts.push(`import { useBion } from "@/lib/bion-store";`);
  if (/\bSessao\b/.test(chunk.replace(/import[^\n]+/g, "")))
    parts.push(`import type { Sessao } from "@/lib/bion-store";`);
  if (rotaHelpers) parts.push(`import { urlDa, viewDoPath, type View } from "@/lib/rotas";`);
  else if (/\bView\b/.test(chunk.replace(/import[^\n]+/g, "")))
    parts.push(`import type { View } from "@/lib/rotas";`);
  for (const l of locais) parts.push(l);
  return parts.join("\n");
}

function salva(caminho, conteudo) {
  mkdirSync(caminho.substring(0, caminho.lastIndexOf("/")), { recursive: true });
  writeFileSync(caminho, conteudo + "\n");
  console.log("criado:", caminho, `(${conteudo.split("\n").length} linhas)`);
}

/* ---------- 1. brand.tsx: Logo + TelaCarregando ---------- */
const logo = corte(212, 233)
  .replace("function Logo", "export function Logo")
  .replace(/\bView\b/g, "View");
const telaCarregando = `
export function TelaCarregando({ texto = "Carregando BION..." }: { texto?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md animate-pulse">
          <Heart className="w-6 h-6 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="text-sm font-bold text-muted-foreground">{texto}</div>
      </div>
    </div>
  );
}`;
salva(
  "src/components/bion/brand.tsx",
  `"use client";\n` + importsPara(logo + telaCarregando) + `\n\n` + logo + telaCarregando,
);

/* ---------- 2. Landing ---------- */
let landing = corte(236, 369);
landing = landing
  .replace(
    "function Landing({ onEnter }: { onEnter: () => void }) {",
    "export function Landing() {\n  const router = useRouter();",
  )
  .replaceAll("onClick={onEnter}", 'onClick={() => router.push("/entrar")}');
salva(
  "src/components/bion/telas/Landing.tsx",
  `"use client";\n` +
    importsPara(landing, { router: true, locais: [`import { Logo } from "@/components/bion/brand";`] }) +
    `\n\n` +
    landing,
);

/* ---------- 3. Login ---------- */
let login = corte(372, 650);
login = login
  .replace(
    "function Login({ onEnter, onSucesso }: { onEnter: () => void; onSucesso: () => void }) {",
    "export function Login() {\n  const router = useRouter();",
  )
  .replaceAll("onSucesso();", 'router.push("/painel");')
  .replaceAll("onClick={onEnter}", 'onClick={() => router.push("/")}');
salva(
  "src/components/bion/telas/Login.tsx",
  `"use client";\n` +
    importsPara(login, { router: true, locais: [`import { Logo } from "@/components/bion/brand";`] }) +
    `\n\n` +
    login,
);

/* ---------- 4. AppShell (Shell + SinoNotificacoes + wrapper p/ rotas) ---------- */
const shellChunk = corte(653, 848);
const wrapper = `

/* Wrapper usado pelo layout das rotas autenticadas: deriva a view da URL
   e converte navegação em rotas reais do App Router. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { sessao, sair } = useBion();
  const router = useRouter();
  const pathname = usePathname();
  const view = viewDoPath(pathname);
  const go = (v: View) => router.push(urlDa(v));
  const handleLogout = async () => {
    await sair();
    router.replace("/");
  };
  return (
    <Shell role={sessao.role} view={view} setView={go} onLogout={handleLogout}>
      {children}
    </Shell>
  );
}`;
salva(
  "src/components/bion/telas/AppShell.tsx",
  `"use client";\n` +
    importsPara(shellChunk + wrapper, {
      router: true,
      pathname: true,
      rotaHelpers: true,
      locais: [
        `import { Logo } from "@/components/bion/brand";`,
        `import { TemaToggle } from "@/components/bion/TemaToggle";`,
        `import { TourGuiado } from "@/components/bion/TourGuiado";`,
      ],
    }) +
    `\n\n` +
    shellChunk +
    wrapper,
);

/* ---------- 5. Dashboards (ContagemRegressiva + 3 dashboards) ---------- */
let dash = corte(869, 1496);
dash = dash
  .replace("function PacienteDashboard", "export function PacienteDashboard")
  .replace("function MedicoDashboard", "export function MedicoDashboard")
  .replace("function AdminDashboard", "export function AdminDashboard");
salva(
  "src/components/bion/telas/Dashboards.tsx",
  `"use client";\n` + importsPara(dash) + `\n\n` + dash,
);

/* ---------- 6. Mensagens ---------- */
const mensagens = corte(1507, 1664).replace("function Mensagens", "export function Mensagens");
salva(
  "src/components/bion/telas/Mensagens.tsx",
  `"use client";\n` + importsPara(mensagens) + `\n\n` + mensagens,
);

/* ---------- 7. Lembretes ---------- */
const lembretes = corte(1667, 1842).replace("function Lembretes", "export function Lembretes");
salva(
  "src/components/bion/telas/Lembretes.tsx",
  `"use client";\n` + importsPara(lembretes) + `\n\n` + lembretes,
);

console.log("\nExtração concluída.");
