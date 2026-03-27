'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface Task {
  id: string
  title: string
  description: string
  reward: number
  isCompleted: boolean
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)
  const [hasFollowed, setHasFollowed] = useState(false)
  const [totalEarned, setTotalEarned] = useState(0)

  const fetchTasks = useCallback(async (addr?: string) => {
    try {
      const resp = await fetch(`/api/tasks${addr ? `?walletAddress=${addr}` : ''}`)
      const data = await resp.json()
      setTasks(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const addr = localStorage.getItem('shifter_wallet')
    setWalletAddress(addr)
    fetchTasks(addr || undefined)
    
    if (addr) {
      fetch(`/api/player?walletAddress=${addr}`)
        .then(res => res.json())
        .then(data => setTotalEarned(data.totalEarned || 0))
        .catch(console.error)
    }
  }, [fetchTasks])

  const handleVerify = async (taskId: string) => {
    if (!walletAddress) {
      setMessage({ text: 'Please play at least one game first to link your wallet!', type: 'error' })
      return
    }

    setVerifyingId(taskId)
    setMessage(null)

    try {
      const resp = await fetch('/api/tasks/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, walletAddress })
      })

      const data = await resp.json()

      if (data.success) {
        setMessage({ text: `Task Verified! +$${data.reward.toFixed(2)} added to your balance.`, type: 'success' })
        fetchTasks(walletAddress)
      } else {
        setMessage({ text: data.error || 'Verification failed', type: 'error' })
      }
    } catch (err) {
      setMessage({ text: 'Internal server error during verification', type: 'error' })
    } finally {
      setVerifyingId(null)
    }
  }

  const handleSwapTask = async (taskId: string, targetToken: string) => {
    if (!window.ethereum || !walletAddress) {
       setMessage({ text: 'Neural link required.', type: 'error' })
       return
    }
    setVerifyingId(taskId)
    setMessage(null)

    try {
      setMessage({ text: '[ 1/3 ] Fetching OKX Onchain Route...', type: 'success' })
      const res = await fetch(`/api/tasks/swap-params?walletAddress=${walletAddress}&targetToken=${targetToken}`)
      const swapData = await res.json()
      
      if (swapData.error) throw new Error(swapData.error)

      const { approveTo, txTo, txData, txValue, txLimit } = swapData
      const { ethers } = await import('ethers')
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const signer = await provider.getSigner()

      const USDC_ADDRESS = '0x74b7f16337b8972027f6196a17a631ac6de26d22'
      const AMOUNT = BigInt(50000)

      const usdcContract = new ethers.Contract(USDC_ADDRESS, [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)'
      ], signer)

      const allowance = await usdcContract.allowance(walletAddress, approveTo)
      if (allowance < AMOUNT) {
        setMessage({ text: '[ 2/3 ] Approving router spending...', type: 'success' })
        const approveTx = await usdcContract.approve(approveTo, AMOUNT)
        await approveTx.wait()
        // Wait 3 seconds for RPC nodes to fully sync the allowance state
        await new Promise(r => setTimeout(r, 3000))
      }

      setMessage({ text: '[ 3/3 ] Executing Swap via OKX DEX...', type: 'success' })
      const tx = await signer.sendTransaction({
        to: txTo,
        data: txData,
        value: BigInt(txValue || 0),
        gasLimit: txLimit ? BigInt(Math.floor(parseInt(txLimit) * 1.2)) : undefined
      })
      await tx.wait()

      const verifyRes = await fetch('/api/tasks/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, walletAddress })
      })

      const verifyData = await verifyRes.json()
      if (verifyData.success) {
        setMessage({ text: `Swap Verified! +$${verifyData.reward.toFixed(2)} added.`, type: 'success' })
        fetchTasks(walletAddress)
      } else {
        throw new Error(verifyData.error)
      }
    } catch (err: any) {
      console.error(err)
      setMessage({ text: err.shortMessage || err.message || 'Swap failed', type: 'error' })
    } finally {
      setVerifyingId(null)
    }
  }

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
      <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-neon-purple/5 blur-[100px] rounded-full pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl z-20"
      >
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="clip-edge text-neon-blue border border-neon-blue/50 px-4 py-2 text-[10px] font-bold hover:bg-neon-blue/20 transition-all uppercase tracking-[0.2em]">
             « TERMINAL
          </Link>
          <div className="text-right">
            <h1 className="text-xl font-display font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-neon-blue drop-shadow-[0_0_15px_rgba(176,38,255,0.6)]">
              BOUNTIES
            </h1>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-[10px] text-neon-blue tracking-[0.3em] font-bold uppercase mb-4 flex items-center gap-2">
            <span className="w-1 h-1 bg-neon-blue animate-pulse"></span>
            ACTIVE DIRECTIVES
          </p>
          
          <div className="space-y-4">
            {loading ? (
              [1, 2].map(i => (
                <div key={i} className="h-32 bg-black/40 clip-edge animate-pulse border border-white/5" />
              ))
            ) : (
              tasks.map((task) => (
                <div 
                  key={task.id}
                  className={`p-6 clip-edge border transition-all duration-300 relative group overflow-hidden ${
                    task.isCompleted 
                      ? 'bg-neon-green/5 border-neon-green/30' 
                      : 'bg-black/60 border-neon-purple/30 hover:border-neon-purple/60 hover:bg-neon-purple/10'
                  }`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${task.isCompleted ? 'bg-neon-green' : 'bg-neon-purple/50 group-hover:bg-neon-purple'}`}></div>
                  <div className="flex justify-between items-start mb-4 relative z-10 pl-2">
                    <div className="text-right flex-1">
                      <span className="block text-[10px] text-white/50 uppercase tracking-widest leading-none mb-1 font-bold">REWARD PAYLOAD</span>
                      <span className="text-2xl font-display font-black text-neon-green">${task.reward.toFixed(2)}</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-display font-bold mb-1 tracking-widest uppercase pl-2 text-white">{task.title}</h3>
                  <p className="text-xs text-white/50 leading-relaxed mb-6 italic tracking-widest pl-2">{task.description}</p>

                  {task.id === 'twitter_follow_1' && !task.isCompleted && !hasFollowed ? (
                    <button
                      onClick={() => {
                        window.open('https://x.com/XLayerOfficial?s=20', '_blank')
                        setHasFollowed(true)
                      }}
                      className="w-full py-4 clip-edge-rev font-display font-bold tracking-[0.2em] bg-neon-blue/20 text-neon-blue border border-neon-blue hover:bg-neon-blue hover:text-black shadow-[0_0_15px_rgba(0,240,255,0.2)] hover:shadow-[0_0_25px_rgba(0,240,255,0.6)] active:scale-95 transition-all text-sm"
                    >
                      [ 1 : FOLLOW @XLayerOfficial ]
                    </button>
                  ) : task.id === 'swap_xdog_1' && !task.isCompleted ? (
                    <button
                      disabled={verifyingId === task.id || !walletAddress}
                      onClick={() => handleSwapTask(task.id, 'XDOG')}
                      className={`w-full py-4 clip-edge-rev font-display font-bold tracking-[0.2em] transition-all duration-300 text-sm ${
                        verifyingId === task.id
                          ? 'bg-neon-blue/20 text-neon-blue animate-pulse border border-neon-blue/50 cursor-wait'
                          : !walletAddress
                          ? 'bg-black/40 text-white/20 border border-white/10 cursor-not-allowed'
                          : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500 hover:bg-yellow-500 hover:text-black shadow-[0_0_15px_rgba(234,179,8,0.2)] hover:shadow-[0_0_25px_rgba(234,179,8,0.6)] active:scale-95'
                      }`}
                    >
                      {verifyingId === task.id ? '[ ROUTING SWAP... ]' : '[ EXECUTE $XDOG SWAP ]'}
                    </button>
                  ) : task.id === 'swap_okb_1' && !task.isCompleted ? (
                    <button
                      disabled={verifyingId === task.id || !walletAddress}
                      onClick={() => handleSwapTask(task.id, 'OKB')}
                      className={`w-full py-4 clip-edge-rev font-display font-bold tracking-[0.2em] transition-all duration-300 text-sm ${
                        verifyingId === task.id
                          ? 'bg-neon-blue/20 text-neon-blue animate-pulse border border-neon-blue/50 cursor-wait'
                          : !walletAddress
                          ? 'bg-black/40 text-white/20 border border-white/10 cursor-not-allowed'
                          : 'bg-green-500/20 text-green-500 border border-green-500 hover:bg-green-500 hover:text-black shadow-[0_0_15px_rgba(34,197,94,0.2)] hover:shadow-[0_0_25px_rgba(34,197,94,0.6)] active:scale-95'
                      }`}
                    >
                      {verifyingId === task.id ? '[ ROUTING SWAP... ]' : '[ EXECUTE NATIVE $OKB SWAP ]'}
                    </button>
                  ) : (
                    <button
                      disabled={task.isCompleted || verifyingId === task.id || !walletAddress}
                      onClick={() => handleVerify(task.id)}
                      className={`w-full py-4 clip-both font-display font-bold tracking-[0.2em] transition-all duration-300 text-sm ${
                        task.isCompleted
                          ? 'bg-neon-green/10 text-neon-green cursor-default border border-neon-green/30'
                          : verifyingId === task.id
                          ? 'bg-neon-blue/20 text-neon-blue animate-pulse border border-neon-blue/50 cursor-wait'
                          : !walletAddress
                          ? 'bg-black/40 text-white/20 border border-white/10 cursor-not-allowed'
                          : task.id === 'twitter_follow_1'
                          ? 'bg-neon-green/20 text-neon-green border border-neon-green hover:bg-neon-green hover:text-black shadow-[0_0_15px_rgba(0,255,102,0.2)] shadow-[0_0_25px_rgba(0,255,102,0.6)] active:scale-95'
                          : 'bg-neon-purple/20 text-neon-purple border border-neon-purple hover:bg-neon-purple hover:text-white shadow-[0_0_15px_rgba(176,38,255,0.2)] hover:shadow-[0_0_25px_rgba(176,38,255,0.6)] active:scale-95'
                      }`}
                    >
                      {task.isCompleted ? '[ COLLECTED ]' : verifyingId === task.id ? '[ SCANNING... ]' : task.id === 'twitter_follow_1' ? '[ 2 : VERIFY ]' : '[ EXECUTE SECURE VERIFICATION ]'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-4 clip-edge border text-xs font-bold tracking-widest uppercase text-center mb-6 flex items-center justify-center gap-3 ${
                message.type === 'success' 
                  ? 'bg-neon-green/10 border-neon-green/50 text-neon-green' 
                  : 'bg-neon-pink/10 border-neon-pink/50 text-neon-pink'
              }`}
            >
              {message.type === 'success' ? '✧ ACCESS GRANTED:' : '⚠ SYSTEM ERR:'} {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-6 bg-black/40 border border-white/10 clip-both mt-8">
          <p className="text-[10px] text-neon-purple uppercase tracking-[0.3em] font-bold mb-4 flex items-center gap-2">
            <span className="w-1 h-1 bg-neon-purple shadow-[0_0_5px_#B026FF]"></span>
            OPERATION MANUAL
          </p>
          <ul className="text-xs text-white/60 space-y-3 font-display tracking-widest">
            <li className="flex gap-4 items-start"><span className="text-neon-purple font-bold">01.</span> <span>Connect terminal to X Layer Mainnet via Neural Link.</span></li>
            <li className="flex gap-4 items-start"><span className="text-neon-purple font-bold">02.</span> <span>Fulfill on-chain holding or social prerequisites.</span></li>
            <li className="flex gap-4 items-start"><span className="text-neon-purple font-bold">03.</span> <span>Execute verification protocol. Operations require zero gas.</span></li>
          </ul>
        </div>
      </motion.div>
    </div>
  )
}
