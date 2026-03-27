'use client'

import dynamic from 'next/dynamic'

// Dynamic import with no SSR — game uses window, canvas, touch events
const Game = dynamic(() => import('@/components/Game'), { ssr: false })

export default function Home() {
  return (
    <main className="flex items-center justify-center w-screen h-screen bg-transparent overflow-hidden relative z-10">
      <Game />
    </main>
  )
}
