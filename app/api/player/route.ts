import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const walletAddress = searchParams.get('walletAddress')

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  try {
    const player = await prisma.player.findUnique({
      where: { walletAddress },
      include: {
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    })

    if (!player) {
      // Return a clean "new player" state instead of 404 to avoid UI errors
      return NextResponse.json({ 
        walletAddress,
        bestScore: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        pendingBalance: 0,
        gamesPlayed: 0,
        withdrawals: []
      })
    }

    return NextResponse.json(player)
  } catch (error: any) {
    console.warn('Database connection failed, using local fallback:', error.message)
    // Return a fallback state so the UI doesn't crash
    return NextResponse.json({ 
      walletAddress,
      bestScore: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      pendingBalance: 0,
      gamesPlayed: 0,
      withdrawals: [],
      dbError: true
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, score, earnings } = await req.json()

    if (!walletAddress) {
      // Allow anonymous sessions or just skip
      return NextResponse.json({ success: true, message: 'Anonymous session recorded' })
    }

    const player = await prisma.player.upsert({
      where: { walletAddress },
      update: {
        bestScore: {
          set: await prisma.player.findUnique({ where: { walletAddress } }).then((p: any) => Math.max(p?.bestScore || 0, score))
        },
        pendingBalance: { increment: earnings },
        totalEarned: { increment: earnings },
        gamesPlayed: { increment: 1 }
      },
      create: {
        walletAddress,
        bestScore: score,
        pendingBalance: earnings,
        totalEarned: earnings,
        gamesPlayed: 1
      }
    })

    return NextResponse.json(player)
  } catch (error) {
    console.error('Error updating player:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
