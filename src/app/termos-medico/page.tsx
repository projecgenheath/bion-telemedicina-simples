"use client";

export default function TermosMedicoPage() {
  return (
    <div className="min-h-screen bg-[#0a1f44] text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black mb-4">Termos de uso do médico</h1>
        <p className="text-sm text-white/80 mb-6">
          Versão em revisão jurídica (PR #120). O texto definitivo entra após validação.
        </p>
        <div className="bg-white/10 rounded-3xl p-6 text-sm leading-relaxed space-y-4">
          <p>Os termos completos estão no PR #120 do repositório e aguardam:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ok do responsável (Alisson)</li>
            <li>Validação de advogado registrado</li>
            <li>Resolução das contradições internas (cláusulas 10.4, 10.7–10.9 e menções a PIX)</li>
          </ul>
          <p className="text-white/70">
            Enquanto isso, o médico pode consultar o contrato de intermediação e a política de privacidade
            diretamente com a equipe BION.
          </p>
        </div>
      </div>
    </div>
  );
}