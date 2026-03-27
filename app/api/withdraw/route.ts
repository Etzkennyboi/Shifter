import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendUSDC } from '@/lib/agent-wallet'
import { MIN_WITHDRAWAL, MAX_WITHDRAWAL } from '@/lib/constants'
import { ethers } from 'ethers'

export async function POST(req: NextRequest) {
  let walletAddress: string = ''
  let amount: number = 0
  let score: number = 0
  let signature: string = ''
  
  try {
    const body = await req.json()
    walletAddress = body.walletAddress
    amount = body.amount
    score = body.score
    signature = body.signature

    if (!walletAddress || !amount || !signature) {
      return NextResponse.json({ error: 'Missing required fields or signature' }, { status: 400 })
    }

    // SECURITY: Authenticate the user via signature
    try {
      const message = `Withdraw ${amount.toFixed(6)} USDC to ${walletAddress}`
      const recoveredAddress = ethers.verifyMessage(message, signature)
      
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Invalid signature identity')
      }
    } catch (sigErr: any) {
      console.error('Signature verification failed:', sigErr.message)
      return NextResponse.json({ error: 'Identity verification failed. Please sign the transaction in your wallet.' }, { status: 401 })
    }

    if (amount < MIN_WITHDRAWAL || amount > MAX_WITHDRAWAL) {
      return NextResponse.json({ error: `Amount must be between ${MIN_WITHDRAWAL} and ${MAX_WITHDRAWAL} USDC` }, { status: 400 })
    }

    // Check player balance in DB
    let player: any = null
    try {
      player = await prisma.player.findUnique({
        where: { walletAddress }
      })
    } catch (e) {
      console.warn('DB check failed during withdrawal:', e)
      return NextResponse.json({ error: 'Database connection failed. Please try again later.' }, { status: 503 })
    }

    if (!player || player.pendingBalance < amount) {
      return NextResponse.json({ error: 'Insufficient pending balance' }, { status: 400 })
    }

    // Process blockchain payout
    let txHash: string
    try {
      const result = await sendUSDC(walletAddress, amount)
      txHash = result.txHash
    } catch (err: any) {
      console.error('Blockchain transfer failed:', err)
      return NextResponse.json({ error: err.message || 'Payout failed' }, { status: 500 })
    }

    // Update DB within a transaction
    try {
      await prisma.$transaction([
        prisma.withdrawal.create({
          data: {
            playerId: player.id,
            walletAddress,
            amount,
            score: score || 0,
            txHash,
            status: 'confirmed'
          }
        }),
        prisma.player.update({
          where: { id: player.id },
          data: {
            pendingBalance: { decrement: amount },
            totalWithdrawn: { increment: amount }
          }
        })
      ])
    } catch (dbErr) {
      console.error('Failed to sync withdrawal with DB:', dbErr)
      // Note: Blockchain payout succeeded but DB update failed. 
      // This is a rare edge case handled by transaction logs in prod.
    }

    return NextResponse.json({
      success: true,
      txHash,
      newBalance: player.pendingBalance - amount
    })
  } catch (error: any) {
    console.error('[Withdrawal API Error]:', {
      message: error.message,
      stack: error.stack,
      walletAddress,
      amount,
      score
    })
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
