import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const players = await prisma.player.findMany({
      orderBy: { totalEarned: 'desc' },
      take: 10,
      select: {
        walletAddress: true,
        totalEarned: true,
        bestScore: true,
      }
    })

    return NextResponse.json(players)
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
