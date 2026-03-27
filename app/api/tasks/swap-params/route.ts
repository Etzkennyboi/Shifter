import { NextResponse } from 'next/server'
import crypto from 'crypto'

const OKX_API_KEY = '28c9786b-053b-48df-959f-0d6beacc1d0a'
const OKX_SECRET_KEY = '8AE96E275EE85DD891AF588E59F822AD'
const OKX_PASSPHRASE = '$Skippy2000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('walletAddress')

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing walletAddress' }, { status: 400 })
  }

  const targetToken = searchParams.get('targetToken') || 'XDOG'

  const USDC = '0x74b7f16337b8972027f6196a17a631ac6de26d22'
  const XDOG = '0x0cc24c51bf89c00c5affbfcf5e856c25ecbdb48e'
  const OKB_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  const AMOUNT = '50000'

  const toToken = targetToken === 'OKB' ? OKB_NATIVE : XDOG

  // V6 API: chainIndex instead of chainId, slippagePercent instead of slippage
  const path = `/api/v6/dex/aggregator/swap?chainIndex=196&amount=${AMOUNT}&fromTokenAddress=${USDC}&toTokenAddress=${toToken}&userWalletAddress=${walletAddress}&slippagePercent=3`
  const method = 'GET'
  const timestamp = new Date().toISOString()
  
  const apiKey = OKX_API_KEY
  const secretKey = OKX_SECRET_KEY
  const passphrase = OKX_PASSPHRASE

  const signStr = `${timestamp}${method}${path}`
  const signature = crypto.createHmac('sha256', secretKey).update(signStr).digest('base64')

  try {
    const res = await fetch(`https://web3.okx.com${path}`, {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    })

    const data = await res.json()
    console.log('[Swap API] Response code:', data.code, 'msg:', data.msg)

    if (data.code !== '0') {
      return NextResponse.json({ error: data.msg || 'Swap routing failed' }, { status: 400 })
    }

    const swapData = data.data[0]
    const tx = swapData.tx

    // Fetch proper Token Approval Contract Address
    const approvePath = `/api/v6/dex/aggregator/approve-transaction?chainIndex=196&tokenContractAddress=${USDC}&approveAmount=${AMOUNT}`
    const approveSignStr = `${timestamp}${method}${approvePath}`
    const approveSignature = crypto.createHmac('sha256', secretKey).update(approveSignStr).digest('base64')
    
    const approveRes = await fetch(`https://web3.okx.com${approvePath}`, {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': approveSignature,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    })
    
    const approveData = await approveRes.json()
    let approveTo = tx.to
    if (approveData.code === '0' && approveData.data && approveData.data[0]) {
      approveTo = approveData.data[0].dexContractAddress
    }

    return NextResponse.json({
      approveTo: approveTo,
      txTo: tx.to,
      txData: tx.data,
      txValue: tx.value || '0',
      txLimit: tx.gas || '500000'
    })
  } catch (err: any) {
    console.error('Swap API error:', err)
    return NextResponse.json({ error: 'Internal server error while fetching swap route' }, { status: 500 })
  }
}
