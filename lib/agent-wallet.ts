import { ethers } from 'ethers'

const USDC_ABI = [
  'function transfer(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x74b7f16337b8972027f6196a17a631ac6de26d22'
export const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS || '0x9369bE87e872457a9eeDd85FDfce1212E5ec51f6'
const AGENT_WALLET_PK = process.env.AGENT_WALLET_PRIVATE_KEY

export async function sendUSDC(toAddress: string, amount: number) {
  if (!AGENT_WALLET_PK) {
    throw new Error('AGENT_WALLET_PRIVATE_KEY NOT CONFIGURED IN .ENV')
  }

  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  
  // Create Wallet Signer from Private Key
  const wallet = new ethers.Wallet(AGENT_WALLET_PK, provider)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)

  // 1. Check Balances
  const decimals = await usdc.decimals()
  const balance = await usdc.balanceOf(AGENT_WALLET_ADDRESS)
  const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals))

  if (balanceFormatted < amount) {
    throw new Error(`Insufficient treasury: ${balanceFormatted} USDC available. Fund 0x9369...`)
  }

  // 2. Execute Transfer
  const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
  console.log(`[sendUSDC] Sending ${amount} USDC to ${toAddress}...`)
  
  const tx = await usdc.transfer(toAddress, amountInUnits)
  const receipt = await tx.wait()

  return { 
    txHash: receipt.hash, 
    from: AGENT_WALLET_ADDRESS, 
    to: toAddress, 
    amount 
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
  } catch (err) {
    console.error('getAgentBalance error:', err)
    return 0
  }
}
