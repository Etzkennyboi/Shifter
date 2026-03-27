'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface Player {
  walletAddress: string
  totalEarned: number
  bestScore: number
}

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const resp = await fetch('/api/leaderboard')
      const data = await resp.json()
      setPlayers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const addr = localStorage.getItem('shifter_wallet')
    setWalletAddress(addr)
    fetchLeaderboard()
  }, [fetchLeaderboard])

  if (!loading && !walletAddress) {
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
    <div className="min-h-screen bg-transparent text-white p-4 font-sans relative overflow-hidden flex flex-col items-center py-12 z-10">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-blue/5 rounded-bl-[100px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl z-20"
      >
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="clip-edge text-neon-blue border border-neon-blue/50 px-4 py-2 text-[10px] font-bold hover:bg-neon-blue/20 transition-all uppercase tracking-[0.2em]">
            « TERMINAL
          </Link>
          <h1 className="text-xl font-display font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-white to-neon-blue text-right drop-shadow-[0_0_15px_rgba(0,240,255,0.6)]">
            RANKINGS
          </h1>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-neon-blue/30 border-t-neon-blue clip-edge animate-spin" />
            <p className="text-neon-blue animate-pulse text-[10px] tracking-[0.3em] font-bold">ACCESSING LEDGER...</p>
          </div>
        ) : (
          <div className="bg-black/60 border-l-4 border-neon-blue clip-edge p-6 shadow-2xl relative">
            <div className="grid grid-cols-12 pb-4 mb-4 border-b border-neon-blue/30 text-[10px] tracking-[0.3em] text-neon-blue uppercase font-bold">
              <div className="col-span-2">RANK</div>
              <div className="col-span-6">NEURAL LINK</div>
              <div className="col-span-4 text-right">ACQUIRED (USDC)</div>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {players.length > 0 ? (
                  players.map((player, idx) => (
                    <motion.div 
                      key={player.walletAddress}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`grid grid-cols-12 p-4 items-center transition-colors hover:bg-white/5 border border-white/5 clip-edge-rev ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border-l-2 border-l-yellow-500' : 'bg-black/40'}`}
                    >
                      <div className="col-span-2 flex items-center">
                        {idx === 0 ? (
                          <span className="text-2xl drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]">🏆</span>
                        ) : idx === 1 ? (
                          <span className="text-2xl drop-shadow-[0_0_10px_rgba(156,163,175,0.8)]">🥈</span>
                        ) : idx === 2 ? (
                          <span className="text-2xl drop-shadow-[0_0_10px_rgba(180,83,9,0.8)]">🥉</span>
                        ) : (
                          <span className="text-xs font-display font-bold text-white/40">[{idx + 1}]</span>
                        )}
                      </div>
                      <div className="col-span-6 font-display">
                        <p className="text-sm font-bold truncate tracking-widest text-white">
                          {player.walletAddress.slice(0, 6)}...{player.walletAddress.slice(-4)}
                        </p>
                        <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">BEST RUN: <span className="text-neon-pink">{player.bestScore}</span></p>
                      </div>
                      <div className="col-span-4 text-right font-display font-black text-neon-green text-lg tracking-widest">
                        ${player.totalEarned.toFixed(2)}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-12 border border-dashed border-white/20 clip-both text-center text-white/30 tracking-widest uppercase text-xs font-bold">
                    Ledger empty. No agents recorded.
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        <div className="mt-8 p-4 bg-neon-blue/10 border border-neon-blue/30 clip-edge text-center mt-12">
          <p className="text-[10px] text-neon-blue leading-relaxed uppercase tracking-[0.2em] font-bold">
            Rankings refresh every session. Perform extractions via Profile.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
