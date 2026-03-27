import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ethers } from 'ethers'

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
          take: 10
        },
        completions: {
          include: { task: true },
          orderBy: { createdAt: 'desc' },
          take: 10
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
    const { walletAddress, score, earnings, signature } = await req.json()

    if (!walletAddress || score === undefined || !signature) {
      return NextResponse.json({ error: 'Missing wallet, score, or signature' }, { status: 400 })
    }

    // SECURITY: Verify the score submission identity
    try {
      const message = `Submit Score: ${score} for Shifter Arcade`
      const recoveredAddress = ethers.verifyMessage(message, signature)
      
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
         throw new Error('Invalid signature identity')
      }
    } catch (sigErr: any) {
      return NextResponse.json({ error: 'Score authentication failed. Transaction not recorded.' }, { status: 401 })
    }

    const existingPlayer = await prisma.player.findUnique({ where: { walletAddress } })
    const newBestScore = Math.max(existingPlayer?.bestScore || 0, score)

    const player = await prisma.player.upsert({
      where: { walletAddress },
      update: {
        bestScore: newBestScore,
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

    return NextResponse.json({
       success: true,
       totalEarned: player.totalEarned,
       bestScore: player.bestScore
    })
  } catch (error) {
    console.error('Error updating player:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
