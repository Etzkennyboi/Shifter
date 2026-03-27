import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const walletAddress = searchParams.get('walletAddress')

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  try {
    const history = await prisma.withdrawal.findMany({
      where: { walletAddress },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    return NextResponse.json(history)
  } catch (error) {
    console.error('Error fetching history:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
