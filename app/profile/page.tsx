'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { XLAYER_EXPLORER, MIN_WITHDRAWAL } from '@/lib/constants'
import { ethers } from 'ethers'

interface Withdrawal {
  id: string
  amount: number
  score: number
  txHash: string
  createdAt: string
  status: string
}

interface Player {
  walletAddress: string
  bestScore: number
  totalEarned: number
  totalWithdrawn: number
  pendingBalance: number
  gamesPlayed: number
  withdrawals: Withdrawal[]
  completions?: {
    createdAt: string
    task: { title: string, reward: number }
  }[]
  dbError?: boolean
}

export default function Profile() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState<string>('')

  const pendingFromDB = player?.pendingBalance
  const pendingFromStorage = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('shifter_pending') || '0') : 0
  const currentPendingBalance = pendingFromDB !== undefined ? pendingFromDB : pendingFromStorage

  useEffect(() => {
    const wallet = localStorage.getItem('shifter_wallet')
    if (wallet) {
      setWalletAddress(wallet)
      fetchPlayer(wallet)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchPlayer = async (address: string) => {
    try {
      const res = await fetch(`/api/player?walletAddress=${address}`)
      if (res.ok) {
        const data = await res.json()
        setPlayer(data)
      }
    } catch (err) {
      console.error('Failed to fetch player:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount)
    if (!walletAddress || !player || amount < MIN_WITHDRAWAL || amount > player.pendingBalance) return
    setIsWithdrawing(true)
    setError(null)

    try {
      // 1. Signature Step
      const amountNum = parseFloat(withdrawAmount)
      const sigMessage = `Withdraw ${amountNum.toFixed(6)} USDC to ${walletAddress}`
      
      if (!window.ethereum) {
        throw new Error('EVM Provider missing. Unlock your wallet first.')
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const signature = await signer.signMessage(sigMessage)

      // 2. Request Payout
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          amount,
          score: player.bestScore,
          signature
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setTxHash(data.txHash)
      setPlayer(prev => prev ? { ...prev, pendingBalance: prev.pendingBalance - amount, totalWithdrawn: prev.totalWithdrawn + amount } : null)
      localStorage.setItem('shifter_pending', ( (player?.pendingBalance || 0) - amount ).toFixed(6))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsWithdrawing(false)
    }
  }, [walletAddress, player, withdrawAmount])

  const disconnectWallet = () => {
    localStorage.removeItem('shifter_wallet')
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent text-white flex items-center justify-center font-display z-10 relative">
        <div className="text-xl animate-flicker text-neon-blue tracking-[0.2em]">[ INIT PROFILE_DB ... ]</div>
      </div>
    )
  }

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center font-display p-6 z-10 relative">
        <h1 className="text-3xl font-black mb-4 text-neon-pink tracking-widest animate-pulse-glow">NO LINK DETECTED</h1>
        <p className="text-white/60 mb-8 font-sans tracking-widest uppercase text-sm">Initialize sequence on main terminal first.</p>
        <Link href="/" className="clip-both px-8 py-3 bg-neon-blue/20 border border-neon-blue text-neon-blue font-bold tracking-widest hover:bg-neon-blue hover:text-black transition-all">
          [ RETURN ]
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent text-white font-sans p-4 max-w-2xl mx-auto z-10 relative py-12">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="clip-edge text-neon-blue border border-neon-blue/50 px-4 py-2 text-[10px] font-bold hover:bg-neon-blue/20 transition-all uppercase tracking-[0.2em]">
          « TERMINAL
        </Link>
        <div className="flex flex-col items-end gap-2">
          <h1 className="text-xl font-display font-black text-neon-green tracking-[0.2em] text-right drop-shadow-[0_0_10px_rgba(0,255,102,0.8)]">PROFILE</h1>
          <button onClick={disconnectWallet} className="text-[10px] text-neon-pink font-bold uppercase tracking-[0.2em] hover:text-white transition-colors flex items-center gap-1">
            <span className="animate-pulse">⚠️</span> DISCONNECT
          </button>
        </div>
      </div>

      <div className="bg-black/60 border-l-4 border-neon-blue clip-edge p-6 mb-8 relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue/5 rounded-bl-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-6 mb-8">
          <div className="w-16 h-16 clip-edge bg-gradient-to-tr from-neon-blue to-neon-purple flex items-center justify-center text-2xl font-display font-black text-black">
            {walletAddress.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <p className="text-[10px] text-neon-blue uppercase tracking-[0.3em] font-bold">Neural Link</p>
            <p className="text-sm font-display font-bold text-white tracking-widest">{walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatBox label="Best Score" value={player?.bestScore || 0} />
          <StatBox label="Tasks Done" value={player?.completions?.length || 0} />
          <StatBox label="Total Earned" value={`$${(player?.totalEarned || 0).toFixed(2)}`} />
          <StatBox label="Total Withdrawn" value={`$${(player?.totalWithdrawn || 0).toFixed(2)}`} />
        </div>
      </div>

      {player?.dbError && (
        <div className="mb-6 p-4 bg-neon-pink/10 border border-neon-pink/50 clip-edge text-neon-pink text-xs flex items-center gap-3">
          <span className="text-xl animate-pulse text-neon-pink">⚠️</span>
          <div>
            <p className="font-bold tracking-widest">DB_LINK_FAILURE</p>
            <p className="opacity-70 text-[10px] uppercase">Local cache active. Withdrawal limited.</p>
          </div>
        </div>
      )}

      <div className="mb-8 p-6 bg-yellow-900/20 border border-yellow-500/30 clip-both relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <span className="text-8xl">💎</span>
        </div>
        <p className="text-[10px] text-yellow-500 uppercase tracking-[0.2em] mb-2 font-bold">Pending Withdrawal</p>
        <div className="flex items-baseline gap-2 mb-8 flex-wrap">
          <p className="text-4xl sm:text-5xl font-display font-black text-white break-all">${currentPendingBalance.toFixed(3)}</p>
          <p className="text-xs sm:text-sm text-yellow-500 font-bold tracking-widest">USDC</p>
        </div>

        <div className="flex flex-col gap-4 relative z-10">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500/50 font-display font-bold">$</span>
              <input 
                type="number"
                step="0.01"
                min={MIN_WITHDRAWAL}
                max={currentPendingBalance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full bg-black/60 border border-yellow-500/30 clip-edge py-4 pl-10 pr-16 text-xl font-display font-bold text-white focus:border-yellow-500 outline-none transition-all placeholder:text-white/20"
                placeholder="0.00"
              />
              <button 
                onClick={() => setWithdrawAmount(currentPendingBalance.toString())}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-yellow-500/20 hover:bg-yellow-500/40 px-3 py-1 clip-edge text-yellow-500 transition-colors uppercase tracking-widest"
              >
                MAX
              </button>
            </div>
            
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !player || (currentPendingBalance < MIN_WITHDRAWAL) || parseFloat(withdrawAmount) < MIN_WITHDRAWAL || parseFloat(withdrawAmount) > currentPendingBalance || player?.dbError}
              className={`clip-edge-rev px-8 py-4 font-display font-bold text-lg tracking-[0.1em] transition-all ${
                isWithdrawing || !player || (currentPendingBalance < MIN_WITHDRAWAL) || parseFloat(withdrawAmount) < MIN_WITHDRAWAL || parseFloat(withdrawAmount) > currentPendingBalance || player?.dbError
                  ? 'bg-black/40 text-white/30 cursor-not-allowed border border-white/10' 
                  : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.4)]'
              }`}
            >
              {isWithdrawing ? 'PROCESSING...' : player?.dbError ? 'ERR_SYS_OFFLINE' : 'WITHDRAW'}
            </button>
          </div>
          
          <p className="text-[10px] text-yellow-500/50 uppercase tracking-widest font-bold">
            {currentPendingBalance < MIN_WITHDRAWAL 
              ? `Req: $${MIN_WITHDRAWAL} USDC min` 
              : `System ready. Min withdrawal: $${MIN_WITHDRAWAL} USDC`}
          </p>
        </div>

        {txHash && (
          <div className="mt-6 p-4 bg-neon-green/10 border border-neon-green/50 clip-edge">
            <p className="text-neon-green text-xs font-bold mb-2 tracking-widest uppercase">Success! Payload delivered.</p>
            <a href={`${XLAYER_EXPLORER}/tx/${txHash}`} target="_blank" className="text-[10px] text-white/50 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors">
              Access Ledger [TxHash] <span>↗</span>
            </a>
          </div>
        )}

        {error && (
          <p className="text-neon-pink text-xs mt-4 tracking-widest uppercase font-bold bg-neon-pink/10 p-3 clip-edge inline-block">{error}</p>
        )}
      </div>

      <h2 className="text-lg font-display font-black mb-6 flex items-center gap-3 text-white/60 tracking-[0.2em] uppercase">
        <span className="w-2 h-2 bg-neon-purple shadow-[0_0_5px_#B026FF]"></span>
        Activity Log
      </h2>

      <div className="space-y-3">
        {(() => {
          const activities = [
            ...(player?.withdrawals || []).map(w => ({ ...w, type: 'WITHDRAW' })),
            ...(player?.completions || []).map(c => ({ 
              id: c.createdAt, 
              amount: c.task.reward, 
              title: c.task.title, 
              createdAt: c.createdAt, 
              type: 'EARN' 
            }))
          ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

          if (activities.length === 0) {
             return (
              <div className="text-center py-12 bg-black/20 border border-dashed border-white/10 clip-both">
                <p className="text-white/30 uppercase tracking-[0.2em] text-xs font-bold">Log is empty. No activity found.</p>
              </div>
            )
          }

          return activities.map((act: any) => (
            <div key={act.id + act.type} className="bg-black/40 border border-white/5 clip-edge p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-white/5 transition-colors gap-4">
              <div>
                <p className={`text-lg font-display font-bold mb-1 ${act.type === 'EARN' ? 'text-neon-blue' : 'text-neon-green'}`}>
                  {act.type === 'EARN' ? `+${act.amount.toFixed(2)}` : `-${act.amount.toFixed(2)}`} USDC
                </p>
                <div className="flex items-center gap-3">
                   <p className="text-[10px] text-white/40 uppercase tracking-widest">{new Date(act.createdAt).toLocaleString()}</p>
                   <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${act.type === 'EARN' ? 'bg-neon-blue/10 text-neon-blue' : 'bg-neon-green/10 text-neon-green'}`}>
                     {act.type}
                   </span>
                </div>
                {act.type === 'EARN' && (
                  <p className="text-[10px] text-white/60 mt-1 italic tracking-widest">{act.title}</p>
                )}
              </div>
              
              {act.txHash && (
                <a 
                  href={`${XLAYER_EXPLORER}/tx/${act.txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] bg-white/5 border border-white/10 px-4 py-2 clip-edge text-white/70 hover:bg-white/10 hover:text-white font-bold uppercase tracking-widest transition-all text-center"
                >
                  LEDGER
                </a>
              )}
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-black/40 p-4 border border-white/10 relative group overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-neon-blue/30 group-hover:bg-neon-blue transition-colors"></div>
      <p className="text-[10px] text-neon-blue uppercase mb-1 font-bold tracking-widest pl-2">{label}</p>
      <p className="text-2xl font-display font-bold text-white pl-2">{value}</p>
    </div>
  )
}
