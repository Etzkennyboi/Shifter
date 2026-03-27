import type { Metadata } from 'next'
import { Orbitron, Rajdhani } from 'next/font/google'
import './globals.css'

const orbitron = Orbitron({ 
  subsets: ['latin'], 
  weight: ['400', '700', '900'],
  variable: '--font-orbitron' 
})

const rajdhani = Rajdhani({ 
  subsets: ['latin'], 
  weight: ['300', '500', '700'],
  variable: '--font-rajdhani' 
})

export const metadata: Metadata = {
  title: 'SHIFTER — Play to Earn on X Layer',
  description: 'Dodge. Collect. Earn. Real USDC on X Layer.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${orbitron.variable} ${rajdhani.variable} bg-[#030014] text-[#E0E7FF] font-sans min-h-screen selection:bg-[#00F0FF] selection:text-black`}>
        {children}
        <div className="crt-overlay" />
      </body>
    </html>
  )
}
