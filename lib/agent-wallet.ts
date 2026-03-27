import { ethers } from 'ethers'
import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)

const USDC_ABI = [
  'function transfer(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x74b7f16337b8972027f6196a17a631ac6de26d22'
// The new OKX Agentic Wallet address generated via Onchain OS
export const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS || '0x1ef1034e7cd690b40a329bd64209ce563f95bb5c'

export async function sendUSDC(toAddress: string, amount: number) {
  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)

  // Get decimals
  const decimals = await usdc.decimals()

  // Check balance using public RPC (no private key needed)
  const balance = await usdc.balanceOf(AGENT_WALLET_ADDRESS)
  const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals))
  
  console.log(`[sendUSDC] Treasury check for ${AGENT_WALLET_ADDRESS}: ${balanceFormatted} USDC. Requested: ${amount} USDC`)

  if (balanceFormatted < amount) {
    throw new Error(`Insufficient treasury balance: ${balanceFormatted} USDC available, ${amount} requested. Please fund the OKX agent wallet.`)
  }

  // Encode the transfer call for the smart contract
  const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
  const iface = new ethers.Interface(USDC_ABI)
  const inputData = iface.encodeFunctionData('transfer', [toAddress, amountInUnits])

  const binaryPath = require('path').join(process.cwd(), 'bin', 'onchainos')
  const binary = require('fs').existsSync(binaryPath) ? binaryPath : 'onchainos'

  console.log(`[sendUSDC] Routing ${amount} USDC to ${toAddress} via OKX Onchain OS...`)
  
  try {
    // We execute the smart contract call securely utilizing the OS TEE environment, passing --force for headless execution.
    const { stdout, stderr } = await execPromise(
      `${binary} wallet contract-call --chain 196 --to ${USDC_ADDRESS} --input-data ${inputData} --force`
    )
    
    console.log(`[sendUSDC] OKX OS Output:`, stdout)
    if (stderr) console.error(`[sendUSDC] OKX OS Stderr:`, stderr)
    
    let txHash = 'unknown'
    try {
      const result = JSON.parse(stdout.trim())
      if (result.data && result.data.txHash) {
        txHash = result.data.txHash
      }
    } catch(e) {
      // If output isn't clean JSON, log it but assume success if exit code was 0
      console.warn('[sendUSDC] Could not parse exact txHash from OKX OS output:', e)
    }

    return {
      txHash,
      from: AGENT_WALLET_ADDRESS,
      to: toAddress,
      amount,
    }
  } catch (txErr: any) {
    const errorMsg = txErr.stderr || txErr.message || 'Onchain OS wallet execution failed';
    console.error(`[sendUSDC] OKX OS Error for ${toAddress}:`, errorMsg)
    throw new Error(errorMsg)
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
