import { PrismaClient } from '@prisma/client'

/**
 * Em serverless (Vercel), cada instância de função mantém seu próprio pool do
 * Prisma. O Session Pooler do Supabase (porta 5432) limita o número de clientes
 * a pool_size: 15 — com poucos acessos simultâneos o pool esgota e o app falha
 * com EMAXCONNSESSION. A solução oficial é usar o Transaction Pooler (porta
 * 6543), que multiplexa as queries sobre um pool compartilhado, com pool de 1
 * conexão por instância (connection_limit=1) e prepared statements desligados
 * (pgbouncer=true). URLs locais (SQLite) e conexões diretas passam intactas.
 */
function urlPoolerTransacao(url: string | undefined): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return url
  try {
    const u = new URL(url)
    if (!u.hostname.includes('pooler.supabase.')) return url
    if (u.port === '5432' || u.port === '') u.port = '6543'
    u.searchParams.set('pgbouncer', 'true')
    u.searchParams.set('connection_limit', '5')
    u.searchParams.set('pool_timeout', '30')
    if (!u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require')
    return u.toString()
  } catch {
    return url
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: urlPoolerTransacao(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

globalForPrisma.prisma = db
