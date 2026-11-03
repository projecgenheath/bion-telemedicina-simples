# Migrações NÃO aplicadas

Arquivos aqui ficam fora de `supabase/migrations/` de propósito, para nunca
rodarem em deploy nem por `supabase db push`.

- `20261030130000_20261030b_promocao_temporaria.sql` — promoção com prazo
  (`promocaoValor` + `promocaoAte`). Suspensa: o CFM não permite anunciar
  preço como promoção. Não aplicar sem decisão do Alisson e liberação do
  Jurídico.
