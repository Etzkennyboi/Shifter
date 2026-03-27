import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const walletAddress = searchParams.get('walletAddress')

  try {
    const tasks = await prisma.task.findMany({
      include: walletAddress ? {
        completions: {
          where: { player: { walletAddress } }
        }
      } : undefined
    })

    return NextResponse.json(tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      reward: task.reward,
      type: task.type,
      targetValue: task.targetValue,
      isCompleted: !!(task.completions && task.completions.length > 0)
    })))
  } catch (error: any) {
    console.error('Tasks fetch error:', error.message, error.stack)
    return NextResponse.json({ error: 'Failed to fetch tasks', details: error.message }, { status: 500 })
  }
}
