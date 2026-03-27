import { ethers } from 'ethers'

const USDC_ABI = [
  'function transfer(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x74b7f16337b8972027f6196a17a631ac6de26d22'
export const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS || '0x9369bE87e872457a9eeDd85FDfce1212E5ec51f6'

export async function sendUSDC(toAddress: string, amount: number) {
  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY
  
  if (!privateKey) {
    throw new Error('AGENT_WALLET_PRIVATE_KEY not configured in environment.')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)

  console.log(`[sendUSDC] Direct Payout Initiated: ${amount} USDC to ${toAddress}...`)
  
  try {
    const decimals = await usdc.decimals()
    const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
    
    // Execute transfer
    const tx = await usdc.transfer(toAddress, amountInUnits)
    console.log(`[sendUSDC] Transaction Sent: ${tx.hash}`)
    
    return {
      txHash: tx.hash,
      from: AGENT_WALLET_ADDRESS,
      to: toAddress,
      amount
    }
  } catch (err: any) {
    console.error(`[sendUSDC] Blockchain Rejection:`, err.message)
    throw new Error(`Payout Failed: ${err.message}`)
  }
}

export async function getAgentBalance(): Promise<number> {
  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)
  
  try {
    const decimals = await usdc.decimals()
    const balance = await usdc.balanceOf(AGENT_WALLET_ADDRESS)
    return parseFloat(ethers.formatUnits(balance, decimals))
  } catch {
    return 0
  }
}
