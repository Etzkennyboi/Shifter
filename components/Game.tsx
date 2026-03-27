'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE, BASE_SPEED,
  HARD_MODE_SPEED_BOOST, MAX_SPEED, OBSTACLE_SPACING,
  COLOR_CHANGER_OFFSET, ORB_SIZE, COLORS,
  COIN_VALUE_NORMAL, COIN_VALUE_MEDIUM, COIN_VALUE_HARD,
  COINS_PER_SCREEN, COIN_SPAWN_INTERVAL, MIN_WITHDRAWAL,
  XLAYER_CHAIN_ID, XLAYER_EXPLORER,
} from '@/lib/constants'
import { ethers } from 'ethers'

// ===== TYPES =====
interface Obstacle {
  id: number
  y: number
  sections: string[]
}

interface ColorOrb {
  id: number
  y: number
  x: number
  newColor: string
  collected: boolean
}

interface USDCCoin {
  id: number
  y: number
  x: number
  value: number
  collected: boolean
  pulseOffset: number
}

interface Particle {
  x: number; y: number; vx: number; vy: number; color: string; life: number
}

interface FloatingText {
  x: number; y: number; text: string; life: number; color: string
}

// ===== GAME STATE (all refs — no useState for game loop data) =====
interface GameRefs {
  cameraY: number
  speed: number
  score: number
  playerX: number
  playerColor: string
  obstacles: Obstacle[]
  colorOrbs: ColorOrb[]
  usdcCoins: USDCCoin[]
  particles: Particle[]
  floatingTexts: FloatingText[]
  nextObstacleId: number
  sessionEarnings: number
  isRunning: boolean
  tick: number
}

declare global {
  interface Window {
    ethereum?: any
  }
}

export default function Game() {
  // ===== DISPLAY STATE (triggers re-renders for UI) =====
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu')
  const [displayScore, setDisplayScore] = useState(0)
  const [displaySessionEarnings, setDisplaySessionEarnings] = useState(0)
  const [displayPlayerColor, setDisplayPlayerColor] = useState(COLORS[0])
  const [highScore, setHighScore] = useState(0)
  const [totalPendingEarnings, setTotalPendingEarnings] = useState(0)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [hasHydrated, setHydrated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setHydrated(true)
  }, [])

  const uiScoreRef = useRef<HTMLSpanElement>(null)
  const uiEarningsRef = useRef<HTMLSpanElement>(null)
  const [taskEarnings, setTaskEarnings] = useState(0)

  // Fetch task earnings whenever wallet is connected or game ends
  const fetchTaskEarnings = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/player?walletAddress=${address}`)
      const data = await res.json()
      // taskEarnings = pendingBalance or totalEarned from tasks
      // For this arcade, we will show "Acquired" as their total bounty yield
      setTaskEarnings(data.totalEarned || 0)
    } catch (e) {
      console.error('Failed to fetch task earnings:', e)
    }
  }, [])

  // ===== GAME REFS (mutable, no re-renders) =====
  const g = useRef<GameRefs>({
    cameraY: 0,
    speed: BASE_SPEED,
    score: 0,
    playerX: CANVAS_WIDTH / 2,
    playerColor: COLORS[0],
    obstacles: [],
    colorOrbs: [],
    usdcCoins: [],
    particles: [],
    floatingTexts: [],
    nextObstacleId: 0,
    sessionEarnings: 0,
    isRunning: false,
    tick: 0,
  })

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const touchStartX = useRef<number>(0)

  // ===== HELPERS =====
  // Generates an obstacle guaranteed safe for safeColor, and optionally also safeColor2.
  // This ensures that whether a player takes an orb or dodges it, they can always survive.
  const generateObstacle = useCallback((yPos: number, id: number, safeColor: string, isHardMode: boolean, safeColor2?: string): Obstacle => {
    // Lock track to exactly 4 lanes
    const numSections = 4

    const safePalette = [safeColor, safeColor2].filter(Boolean) as string[]
    const dangerousColors = COLORS.filter(c => !safePalette.includes(c))

    // Fill all sections with non-safe colors
    const sections: string[] = Array(numSections).fill(0).map(() =>
      dangerousColors.length > 0
        ? dangerousColors[Math.floor(Math.random() * dangerousColors.length)]
        : COLORS[0] // fallback if all colors are safe
    )

    // Guarantee at least one section for the PRIMARY safe color
    sections[Math.floor(Math.random() * numSections)] = safeColor

    // Guarantee at least one ADDITIONAL section for the secondary safe color (orb target color)
    if (safeColor2 && safeColor2 !== safeColor && numSections > 1) {
      // Find a different slot from where we placed the primary color
      const primarySlot = sections.lastIndexOf(safeColor)
      let secondarySlot: number
      do {
        secondarySlot = Math.floor(Math.random() * numSections)
      } while (secondarySlot === primarySlot)
      sections[secondarySlot] = safeColor2
    }

    return { id, y: yPos, sections }
  }, [])

  const generateColorOrb = useCallback((yPos: number, id: number, currentColor: string): ColorOrb => {
    const availableColors = COLORS.filter(c => c !== currentColor)
    return {
      id,
      y: yPos,
      x: Math.random() * (CANVAS_WIDTH - ORB_SIZE * 2) + ORB_SIZE,
      newColor: availableColors[Math.floor(Math.random() * availableColors.length)],
      collected: false,
    }
  }, [])

  const generateUSDCCoins = useCallback((yStart: number, startId: number, isHardMode: boolean): USDCCoin[] => {
    const coins: USDCCoin[] = []
    const value = isHardMode ? COIN_VALUE_HARD : (startId % 3 === 0 ? COIN_VALUE_MEDIUM : COIN_VALUE_NORMAL)
    for (let i = 0; i < COINS_PER_SCREEN; i++) {
      coins.push({
        id: startId + i,
        y: yStart - (i * COIN_SPAWN_INTERVAL),
        x: Math.random() * (CANVAS_WIDTH - 40) + 20,
        value,
        collected: false,
        pulseOffset: Math.random() * Math.PI * 2,
      })
    }
    return coins
  }, [])

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      g.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        color,
        life: 1.0,
      })
    }
    if (g.current.particles.length > 80) {
      g.current.particles = g.current.particles.slice(-80)
    }
  }, [])

  const triggerShake = useCallback(() => {
    if (gameAreaRef.current) {
      gameAreaRef.current.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`
      setTimeout(() => {
        if (gameAreaRef.current) gameAreaRef.current.style.transform = 'none'
      }, 60)
    }
  }, [])

  const playerScreenY = CANVAS_HEIGHT * 0.75

  // ===== DRAWING =====
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const state = g.current
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // === DRAW OBSTACLES ===
    state.obstacles.forEach(obs => {
      const screenY = obs.y - state.cameraY
      const sectionWidth = CANVAS_WIDTH / obs.sections.length
      obs.sections.forEach((color, i) => {
        ctx.fillStyle = color
        ctx.fillRect(i * sectionWidth, screenY, sectionWidth, 24)
        
        // Glow effect for sections
        ctx.shadowBlur = 10
        ctx.shadowColor = color
        ctx.fillRect(i * sectionWidth + 2, screenY + 2, sectionWidth - 4, 20)
        ctx.shadowBlur = 0
      })
    })

    // === DRAW COLOR ORBS ===
    state.colorOrbs.forEach(orb => {
      if (orb.collected) return
      const screenY = orb.y - state.cameraY
      ctx.beginPath()
      ctx.arc(orb.x, screenY, 15, 0, Math.PI * 2)
      ctx.fillStyle = orb.newColor
      ctx.shadowBlur = 15
      ctx.shadowColor = orb.newColor
      ctx.fill()
      ctx.shadowBlur = 0
      
      // Ring
      ctx.beginPath()
      ctx.arc(orb.x, screenY, 20, 0, Math.PI * 2)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // === DRAW USDC COINS ===
    state.usdcCoins.forEach(coin => {
      if (coin.collected) return
      const screenY = coin.y - state.cameraY
      const pulse = Math.sin(state.tick * 0.1 + coin.pulseOffset) * 3
      
      ctx.beginPath()
      ctx.arc(coin.x, screenY, 12 + pulse, 0, Math.PI * 2)
      ctx.fillStyle = '#2775ca' // USDC Blue
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.fillStyle = 'white'
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('$', coin.x, screenY + 4)
    })

    // === DRAW PARTICLES ===
    state.particles.forEach(p => {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4)
    })
    ctx.globalAlpha = 1.0

    // === DRAW FLOATING TEXTS ===
    state.floatingTexts.forEach(ft => {
      ctx.globalAlpha = ft.life
      ctx.fillStyle = ft.color
      ctx.font = 'bold 16px Courier New'
      ctx.fillText(ft.text, ft.x, ft.y - (1.0 - ft.life) * 50)
    })
    ctx.globalAlpha = 1.0

    // === DRAW PLAYER ===
    ctx.fillStyle = state.playerColor
    ctx.shadowBlur = 20
    ctx.shadowColor = state.playerColor
    // Glowing square player
    ctx.fillRect(state.playerX - PLAYER_SIZE / 2, playerScreenY - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE)
    
    // Inner white square
    ctx.fillStyle = 'white'
    ctx.fillRect(state.playerX - PLAYER_SIZE / 4, playerScreenY - PLAYER_SIZE / 4, PLAYER_SIZE / 2, PLAYER_SIZE / 2)
    ctx.shadowBlur = 0

  }, [playerScreenY])

  // ===== GAME LOOP =====
  const gameLoop = useCallback(async () => { // Made async to await signature
    if (!g.current.isRunning) return

    const state = g.current
    state.tick++

    // === MOVE CAMERA ===
    state.cameraY -= state.speed
    state.score++
    const isHardMode = state.score > 1000

    // === SPEED RAMP ===
    let targetSpeed = BASE_SPEED + (state.score / 4000)
    if (isHardMode) targetSpeed += HARD_MODE_SPEED_BOOST + ((state.score - 1000) / 1000)
    state.speed = Math.min(state.speed + 0.005, Math.min(targetSpeed, MAX_SPEED))

    // === UPDATE PARTICLES ===
    state.particles = state.particles
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05 }))
      .filter(p => p.life > 0)

    // === UPDATE FLOATING TEXTS ===
    state.floatingTexts = state.floatingTexts
      .map(ft => ({ ...ft, life: ft.life - 0.03 }))
      .filter(ft => ft.life > 0)

    // === GENERATE OBSTACLES ===
    const farthestObstacleY = state.obstacles.length > 0
      ? Math.min(...state.obstacles.map(o => o.y))
      : state.cameraY

    if (farthestObstacleY > state.cameraY - CANVAS_HEIGHT * 1.5) {
      const newY = farthestObstacleY - OBSTACLE_SPACING
      const obsId = state.nextObstacleId++

      if (obsId % 3 === 0) {
        // There will be a color orb placed BEFORE this obstacle.
        // The player may collect the orb (switching color) or dodge it.
        // So this obstacle MUST be safe for BOTH the current color AND the orb's future color.
        const orb = generateColorOrb(newY + COLOR_CHANGER_OFFSET, obsId, state.playerColor)
        state.colorOrbs.push(orb)
        // Build obstacle that is passable whether player took the orb or not
        state.obstacles.push(generateObstacle(newY, obsId, state.playerColor, isHardMode, orb.newColor))
      } else {
        state.obstacles.push(generateObstacle(newY, obsId, state.playerColor, isHardMode))
      }

      // USDC coins - 1 coin per screen
      const coins = generateUSDCCoins(newY + 100, obsId * 10, isHardMode).slice(0, 1)
      state.usdcCoins.push(...coins)
    }

    // === CLEANUP OFF-SCREEN OBJECTS ===
    const cleanupY = state.cameraY + CANVAS_HEIGHT + 200
    state.obstacles = state.obstacles.filter(o => o.y < cleanupY)
    state.colorOrbs = state.colorOrbs.filter(o => o.y < cleanupY)
    state.usdcCoins = state.usdcCoins.filter(c => c.y < cleanupY)

    // === COLLECT COLOR ORBS ===
    state.colorOrbs.forEach(orb => {
      if (orb.collected) return
      const orbScreenY = orb.y - state.cameraY
      const dx = Math.abs(state.playerX - orb.x)
      const dy = Math.abs(playerScreenY - orbScreenY)
      if (dx < ORB_SIZE && dy < ORB_SIZE) {
        orb.collected = true
        state.playerColor = orb.newColor
        spawnParticles(orb.x, orbScreenY, orb.newColor)

        // Rebuild ALL pre-generated upcoming obstacles for the new color.
        // Obstacles are above the player in world coordinates (lower Y = further ahead).
        const playerWorldY = state.cameraY + playerScreenY
        state.obstacles
          .filter(o => o.y < playerWorldY)
          .forEach(obs => {
            const rebuilt = generateObstacle(obs.y, obs.id, orb.newColor, isHardMode)
            obs.sections = rebuilt.sections
          })
      }
    })

    // === COLLECT USDC COINS ===
    state.usdcCoins.forEach(coin => {
      if (coin.collected) return
      const coinScreenY = coin.y - state.cameraY
      const dx = Math.abs(state.playerX - coin.x)
      const dy = Math.abs(playerScreenY - coinScreenY)
      if (dx < 28 && dy < 28) {
        coin.collected = true
        state.sessionEarnings += coin.value
        spawnParticles(coin.x, coinScreenY, '#FFD700')
        state.floatingTexts.push({
          x: coin.x,
          y: coinScreenY,
          text: `+$${coin.value.toFixed(2)}`,
          life: 1.0,
          color: '#FFD700',
        })
      }
    })

    // === OBSTACLE COLLISION ===
    for (const obs of state.obstacles) {
      const obsScreenY = obs.y - state.cameraY
      const obsHeight = 28

      if (playerScreenY + PLAYER_SIZE / 2 > obsScreenY && playerScreenY - PLAYER_SIZE / 2 < obsScreenY + obsHeight) {
        const sectionWidth = CANVAS_WIDTH / obs.sections.length
        const sectionIndex = Math.floor(state.playerX / sectionWidth)
        const clampedIndex = Math.max(0, Math.min(sectionIndex, obs.sections.length - 1))

        if (obs.sections[clampedIndex] !== state.playerColor) {
          // === DEATH ===
          state.isRunning = false
          spawnParticles(state.playerX, playerScreenY, state.playerColor)
          triggerShake()

          const prevHigh = parseInt(localStorage.getItem('shifter_high_score') || '0')
          if (state.score > prevHigh) {
            localStorage.setItem('shifter_high_score', state.score.toString())
            setHighScore(state.score)
          }

          const prevPending = parseFloat(localStorage.getItem('shifter_pending') || '0')
          const newPending = prevPending + state.sessionEarnings
          localStorage.setItem('shifter_pending', newPending.toFixed(6))
          setTotalPendingEarnings(newPending)

          setDisplayScore(state.score)
          setDisplaySessionEarnings(state.sessionEarnings)
          setGameState('gameover')

          // SIGNATURE_PHASE: Authenticate before saving score
          let signature = null
          try {
            if (!window.ethereum) throw new Error("No wallet")
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            const message = `Submit Score: ${Math.floor(state.score)} for Shifter Arcade`
            signature = await signer.signMessage(message)
          } catch (e) {
            console.warn("User cancelled signature or wallet absent. Score not recorded for rewards.")
          }

          // UPDATE DB with signature
          if (walletAddress && signature) {
            fetch('/api/player', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress,
                score: Math.floor(state.score),
                earnings: state.sessionEarnings,
                signature
              }),
            }).then(r => r.json()).then(data => {
              if (data.bestScore) setHighScore(data.bestScore)
              fetchTaskEarnings(walletAddress)
            }).catch(err => console.error('Failed to sync player info:', err))
          }

          return
        }
      }
    }

    // === UPDATE DISPLAY (Throttled DOM Mutations instead of React State to avoid lag) ===
    if (state.tick % 5 === 0) {
      if (uiScoreRef.current) uiScoreRef.current.innerText = state.score.toString()
      if (uiEarningsRef.current) uiEarningsRef.current.innerText = `$${state.sessionEarnings.toFixed(2)}`
    }

    // === RENDER TO CANVAS ===
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx)

    // === NEXT FRAME ===
    if (state.isRunning) {
      animFrameRef.current = requestAnimationFrame(gameLoop)
    }
  }, [generateObstacle, generateColorOrb, generateUSDCCoins, spawnParticles, triggerShake, draw, playerScreenY])

  // ===== START GAME =====
  const startGame = useCallback(() => {
    const state = g.current
    state.cameraY = 0
    state.speed = BASE_SPEED
    state.score = 0
    state.playerX = CANVAS_WIDTH / 2
    state.playerColor = COLORS[0]
    state.obstacles = []
    state.colorOrbs = []
    state.usdcCoins = []
    state.particles = []
    state.floatingTexts = []
    state.nextObstacleId = 0
    state.sessionEarnings = 0
    state.isRunning = true
    state.tick = 0

    setDisplayScore(0)
    setDisplaySessionEarnings(0)
    setDisplayPlayerColor(COLORS[0])
    setWithdrawTxHash(null)
    setWithdrawError(null)
    setGameState('playing')

    for (let i = 0; i < 5; i++) {
      const y = -(i + 1) * OBSTACLE_SPACING
      const id = state.nextObstacleId++
      state.obstacles.push(generateObstacle(y, id, state.playerColor, false))
      
      if (id % 3 === 0) {
        state.colorOrbs.push(generateColorOrb(y + COLOR_CHANGER_OFFSET, id, state.playerColor))
      }
      
      const coins = generateUSDCCoins(y + 100, id * 10, false).slice(0, 1)
      state.usdcCoins.push(...coins)
    }

    animFrameRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop, generateObstacle, generateColorOrb, generateUSDCCoins])

  // ===== INPUT HANDLING =====
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!g.current.isRunning || !gameAreaRef.current) return
      const rect = gameAreaRef.current.getBoundingClientRect()
      const scaleX = CANVAS_WIDTH / rect.width
      g.current.playerX = Math.max(PLAYER_SIZE / 2, Math.min(CANVAS_WIDTH - PLAYER_SIZE / 2, (e.clientX - rect.left) * scaleX))
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartX.current = e.touches[0].clientX
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!g.current.isRunning || !gameAreaRef.current) return
      const rect = gameAreaRef.current.getBoundingClientRect()
      const scaleX = CANVAS_WIDTH / rect.width
      if (e.touches.length > 0) {
        g.current.playerX = Math.max(PLAYER_SIZE / 2, Math.min(CANVAS_WIDTH - PLAYER_SIZE / 2, (e.touches[0].clientX - rect.left) * scaleX))
      }
    }

    const el = gameAreaRef.current
    if (el) {
      el.addEventListener('mousemove', handleMouseMove)
      el.addEventListener('touchstart', handleTouchStart, { passive: false })
      el.addEventListener('touchmove', handleTouchMove, { passive: false })
    }

    return () => {
      if (el) {
        el.removeEventListener('mousemove', handleMouseMove)
        el.removeEventListener('touchstart', handleTouchStart)
        el.removeEventListener('touchmove', handleTouchMove)
      }
    }
  }, [gameState])

  // ===== CLEANUP ON UNMOUNT =====
  useEffect(() => {
    return () => {
      g.current.isRunning = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // ===== LOAD SAVED DATA & CHECK CHAIN =====
  useEffect(() => {
    const saved = localStorage.getItem('shifter_highscore')
    if (saved) setHighScore(parseInt(saved))
    const pending = localStorage.getItem('shifter_pending')
    if (pending) setTotalPendingEarnings(parseFloat(pending))
    const wallet = localStorage.getItem('shifter_wallet')
    
    if (wallet) {
      setWalletAddress(wallet)
      
      // Sync DB highscore
      fetch(`/api/player?walletAddress=${wallet}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.bestScore !== undefined) {
             setHighScore(Math.max(parseInt(saved || "0"), data.bestScore))
          }
        })
        .catch(err => console.error("Error syncing highscore:", err))

      // Auto switch to X layer
      if (window.ethereum) {
        window.ethereum.request({ method: 'eth_chainId' }).then((chainId: string) => {
          if (chainId !== XLAYER_CHAIN_ID) {
            window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: XLAYER_CHAIN_ID }],
            }).catch(() => {})
          }
        }).catch(() => {})
      }
    }

    // Reactivity: listen for changes from the wallet itself
    if (window.ethereum) {
      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          localStorage.setItem('shifter_wallet', accounts[0])
        } else {
          setWalletAddress(null)
          localStorage.removeItem('shifter_wallet')
        }
      }
      window.ethereum.on('accountsChanged', handleAccounts)
      return () => window.ethereum.removeListener('accountsChanged', handleAccounts)
    }
  }, [])

  // ===== CONNECT WALLET =====
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask or OKX Wallet!')
      return
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const address = accounts[0]
      
      await fetchTaskEarnings(address)

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: XLAYER_CHAIN_ID }],
        })
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: XLAYER_CHAIN_ID,
              chainName: 'X Layer Mainnet',
              nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
              rpcUrls: ['https://rpc.xlayer.tech'],
              blockExplorerUrls: ['https://www.okx.com/explorer/xlayer'],
            }],
          })
        }
      }

      setWalletAddress(address)
      localStorage.setItem('shifter_wallet', address)

      fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, score: 0, earnings: 0 }),
      }).catch(() => {})
    } catch (err) {
      console.error('Wallet connection failed:', err)
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null)
    localStorage.removeItem('shifter_wallet')
  }, [])

  // ===== WITHDRAW =====
  const handleWithdraw = useCallback(async () => {
    if (!walletAddress || totalPendingEarnings < MIN_WITHDRAWAL) return
    setIsWithdrawing(true)
    setWithdrawError(null)

    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          amount: totalPendingEarnings,
          score: displayScore,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setWithdrawTxHash(data.txHash)
      setTotalPendingEarnings(0)
      localStorage.setItem('shifter_pending', '0')
    } catch (err: any) {
      setWithdrawError(err.message)
    } finally {
      setIsWithdrawing(false)
    }
  }, [walletAddress, totalPendingEarnings, displayScore])

  // ===== RENDER =====
  if (!hasHydrated) return null

  return (
    <div
      ref={gameAreaRef}
      className={`relative overflow-hidden select-none ${gameState === 'playing' ? 'cursor-none' : 'cursor-default'}`}
      style={{
        width: '100%',
        height: '100%',
        maxWidth: CANVAS_WIDTH,
        maxHeight: CANVAS_HEIGHT,
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        background: 'linear-gradient(180deg, #030712 0%, #0f172a 50%, #030712 100%)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.1)',
        touchAction: 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute inset-0 w-full h-full"
      />

      {/* ===== MENU SCREEN ===== */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neon-dark/80 backdrop-blur-md pointer-events-auto border border-neon-blue/20 clip-both shadow-[0_0_50px_rgba(0,240,255,0.1)]">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-50 shadow-[0_0_10px_#00F0FF]"></div>
          
          <h1 className="text-4xl font-display font-black mb-2 animate-pulse-glow tracking-[0.05em] text-transparent bg-clip-text bg-gradient-to-br from-white via-neon-green to-neon-blue text-center px-6 w-full shrink-0">
            SHIFTER
          </h1>
          <p className="text-neon-blue text-[10px] mb-1 uppercase tracking-widest font-bold text-center">» Dodge · Collect · Earn</p>
          <p className="text-white/40 text-[8px] mb-8 uppercase tracking-[0.3em] text-center">System: Real USDC · X Layer</p>

          <div className="flex flex-col gap-2 mb-8 items-center bg-black/40 px-6 py-2 border-l-2 border-neon-pink">
            {highScore > 0 ? (
              <p className="text-gray-400 text-xs uppercase tracking-widest">
                Best Score <span className="text-neon-pink font-bold ml-2">{highScore}</span>
              </p>
            ) : (
              <p className="text-gray-500 text-[10px] uppercase tracking-widest">Awaiting Initial Run</p>
            )}
          </div>

          <button
            onClick={() => walletAddress ? startGame() : connectWallet()}
            className={`clip-edge px-8 py-3 text-sm font-display font-black mb-6 transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.4)] inset-ring ${
              walletAddress ? 'bg-neon-green text-black hover:bg-white' : 'bg-neon-blue text-white hover:bg-neon-blue/80 animate-pulse'
            }`}
          >
            {walletAddress ? '[ INITIALIZE ]' : '[ CONNECT TO START ]'}
          </button>

          <div className="flex flex-col gap-3 mb-6 pointer-events-auto w-full max-w-[260px] px-2">
            <button 
              onClick={() => walletAddress ? router.push('/leaderboard') : connectWallet()}
              className={`clip-edge-rev w-full py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_15px_rgba(0,240,255,0.1)] ${
                walletAddress ? 'bg-neon-dark border border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10 cursor-pointer' : 'bg-black/80 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              🏆 Rankings {(!walletAddress) && '(LOCKED)'}
            </button>
            <button 
              onClick={() => walletAddress ? router.push('/tasks') : connectWallet()}
              className={`clip-edge-rev w-full py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_15px_rgba(176,38,255,0.1)] ${
                walletAddress ? 'bg-neon-dark border border-neon-purple/50 text-neon-purple hover:bg-neon-purple/10 cursor-pointer' : 'bg-black/80 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              ⚡ Bounties {(!walletAddress) && '(LOCKED)'}
            </button>
          </div>

          {!walletAddress ? (
            <button
              onClick={connectWallet}
              className="clip-both px-6 py-2 text-xs font-bold bg-neon-blue/10 border border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-black transition-all active:scale-95 flex items-center justify-center gap-2 tracking-widest text-center"
            >
              CONNECT NEURAL LINK
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-black/60 px-4 py-2 border-r-2 border-neon-blue">
              <Link href="/profile" className="text-[10px] font-bold text-neon-pink hover:text-white uppercase tracking-[0.2em] transition-colors border-r border-white/20 pr-3">
                PROFILE
              </Link>
              <div className="group relative flex flex-col items-center justify-center cursor-pointer">
                <p className="text-[10px] text-neon-blue font-mono group-hover:text-neon-pink transition-colors">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden group-hover:flex items-center justify-center bg-black/90 w-full h-full">
                  <button onClick={disconnectWallet} className="text-[10px] font-bold text-neon-pink flex items-center gap-1">
                    <span className="animate-pulse">⚠️</span> DISCONNECT
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== PLAYING HUD ===== */}
      {gameState === 'playing' && (
        <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-start pointer-events-none z-10">
          <div className="flex flex-col bg-black/40 px-4 py-1 border-l-2 border-neon-blue">
            <span className="text-[10px] text-neon-blue uppercase tracking-widest font-bold">Score</span>
            <span ref={uiScoreRef} className="text-2xl font-display text-white">0</span>
          </div>
        </div>
      )}

      {/* ===== GAME OVER SCREEN ===== */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neon-dark/95 backdrop-blur-md p-6 text-center pointer-events-auto border-t-4 border-neon-pink">
          <h2 className="text-4xl font-display font-black mb-1 animate-flicker text-neon-pink tracking-[0.1em] drop-shadow-[0_0_15px_rgba(255,0,60,0.8)]">SYSTEM</h2>
          <h3 className="text-xl font-display font-black mb-8 text-white tracking-[0.3em]">OVERLOAD</h3>
          
          <div className="grid grid-cols-1 gap-4 w-full max-w-xs mb-10">
            <div className="bg-black/40 p-4 border border-neon-blue/30 clip-edge relative overflow-hidden group text-center">
              <div className="absolute inset-0 bg-neon-blue/5 group-hover:bg-neon-blue/10 transition-colors"></div>
              <p className="text-[10px] text-neon-blue uppercase tracking-widest mb-1">Final Score</p>
              <p className="text-3xl font-display font-bold text-white relative z-10">{displayScore}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button
              onClick={startGame}
              className="clip-both py-4 text-lg font-display font-bold bg-white text-black hover:bg-neon-blue hover:text-black transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] mb-2"
            >
              [ REBOOT SEQUENCE ]
            </button>
            
            <div className="grid grid-cols-2 gap-2 pointer-events-auto mb-2">
               <button
                  onClick={() => walletAddress ? router.push('/profile') : connectWallet()}
                  className="clip-edge py-3 text-xs tracking-widest font-bold bg-neon-dark border border-neon-blue/50 text-neon-blue hover:bg-neon-blue/20 transition-all shadow-[0_0_10px_rgba(0,240,255,0.1)] hover:shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                >
                PROFILE
               </button>
               <button
                  onClick={() => walletAddress ? router.push('/leaderboard') : connectWallet()}
                  className="clip-edge-rev py-3 text-xs tracking-widest font-bold bg-neon-dark border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                >
                RANKINGS
               </button>
            </div>
            <button
                onClick={() => walletAddress ? router.push('/tasks') : connectWallet()}
                className="clip-both w-full py-4 text-xs font-bold bg-neon-purple/20 border border-neon-purple text-neon-purple hover:bg-neon-purple hover:text-white transition-all tracking-[0.2em] shadow-[0_0_15px_rgba(176,38,255,0.2)] hover:shadow-[0_0_25px_rgba(176,38,255,0.6)] pointer-events-auto"
              >
                ACCESS BOUNTIES
            </button>

            {!walletAddress && (
              <button
                onClick={connectWallet}
                className="w-full mt-4 py-3 text-[10px] uppercase font-bold border border-neon-blue text-neon-blue hover:bg-neon-blue/20 transition-all tracking-widest opacity-50 hover:opacity-100"
              >
                CONNECT WALLET
              </button>
            )}

            <button
               onClick={() => setGameState('menu')}
               className="text-gray-500 text-sm mt-4 hover:text-gray-300 transition-colors underline"
            >
              Back to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
