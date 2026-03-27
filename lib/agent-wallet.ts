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
  const wallet = new ethers.Wallet(AGENT_WALLET_PK, provider)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)

  // Get decimals & Balance
  const decimals = await usdc.decimals()
  const balance = await usdc.balanceOf(AGENT_WALLET_ADDRESS)
  const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals))

  if (balanceFormatted < amount) {
    throw new Error(`Insufficient treasury balance: ${balanceFormatted} USDC available, ${amount} requested. Please fund the agent wallet.`)
  }

  console.log(`[sendUSDC] Sending ${amount} USDC from ${AGENT_WALLET_ADDRESS} to ${toAddress}...`)
  
  try {
    const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
    const tx = await usdc.transfer(toAddress, amountInUnits)
    console.log(`[sendUSDC] Transaction Sent: ${tx.hash}. Waiting for confirmation...`)
    
    const receipt = await tx.wait()
    console.log(`[sendUSDC] Transaction Confirmed: ${receipt.hash}`)

    return {
      txHash: receipt.hash,
      from: AGENT_WALLET_ADDRESS,
      to: toAddress,
      amount,
    }
  } catch (txErr: any) {
    console.error(`[sendUSDC] Blockchain Error for ${toAddress}:`, txErr.message || txErr)
    throw new Error('Wallet transaction failed. RPC or Gas issue?')
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
