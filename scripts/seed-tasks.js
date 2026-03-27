const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const task1 = {
      id: 'hold_check_1',
      title: 'X Layer Hodler',
      description: 'Hold at least $1.00 worth of assets on X Layer Mainnet to earn a bonus.',
      reward: 0.01,
      type: 'HOLD_X_LAYER_ANY',
      targetValue: 1.0
    };

    const task2 = {
      id: 'twitter_follow_1',
      title: 'Follow X Layer',
      description: 'Follow @XLayerOfficial on Twitter to earn a bonus.',
      reward: 0.01,
      type: 'FOLLOW_TWITTER',
      targetValue: null
    };

    const task3 = {
      id: 'swap_xdog_1',
      title: 'Acquire $XDOG',
      description: 'Use the terminal router to swap $0.05 USDC for $XDOG on X Layer Mainnet.',
      reward: 0.01,
      type: 'SWAP_XDOG',
      targetValue: null
    };

    await prisma.task.upsert({
      where: { id: task1.id },
      update: { reward: task1.reward, description: task1.description },
      create: task1
    });

    const task4 = {
      id: 'swap_okb_1',
      title: 'Acquire $OKB Gas',
      description: 'Use the terminal router to swap $0.05 USDC for native $OKB on X Layer Mainnet.',
      reward: 0.01,
      type: 'SWAP_OKB',
      targetValue: null
    };

    await prisma.task.upsert({
      where: { id: task2.id },
      update: { reward: task2.reward, description: task2.description },
      create: task2
    });

    await prisma.task.upsert({
      where: { id: task4.id },
      update: { reward: task4.reward, description: task4.description },
      create: task4
    });

    await prisma.task.upsert({
      where: { id: task3.id },
      update: { reward: task3.reward, description: task3.description },
      create: task3
    });

    console.log('Tasks seeded successfully');
  } catch (e) {
    console.error('Seed error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
