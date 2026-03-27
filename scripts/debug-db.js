const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const top = await prisma.player.findMany({ orderBy: { pendingBalance: 'desc' }, take: 3 });
  console.log(JSON.stringify(top, null, 2));
}
main().finally(() => prisma.$disconnect());
