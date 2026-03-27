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

  if (balanceFormatted < amount) {
    throw new Error(`Insufficient treasury balance: ${balanceFormatted} USDC available, ${amount} requested. Please fund the OKX agent wallet.`)
  }

  // Encode the transfer call for the smart contract
  const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
  const iface = new ethers.Interface(USDC_ABI)
  const inputData = iface.encodeFunctionData('transfer', [toAddress, amountInUnits])

  console.log(`[sendUSDC] Checking OKX Wallet status for ${AGENT_WALLET_ADDRESS}...`)
  
  try {
    // 1. Ensure wallet is logged in (required for transient Railway environments)
    try {
      await execPromise('npx onchainos wallet status')
    } catch (statusErr) {
      console.log('[sendUSDC] Wallet not logged in. Performing headless TEE authentication...')
      // We use literal single quotes to prevent shell expansion of special characters like '$'
      const apiKey = process.env.OKX_API_KEY || '28c9786b-053b-48df-959f-0d6beacc1d0a'
      const secretKey = process.env.OKX_SECRET_KEY || '8AE96E275EE85DD891AF588E59F822AD'
      const pass = process.env.OKX_PASSPHRASE || '$Skippy2000'
      
      await execPromise(`npx onchainos wallet login --api-key '${apiKey}' --secret-key '${secretKey}' --passphrase '${pass}' --force`)
      console.log('[sendUSDC] Wallet authenticated successfully.')
    }

    // 2. Execute the smart contract call securely via TEE
    console.log(`[sendUSDC] Routing ${amount} USDC to ${toAddress} via OKX Onchain OS...`)
    const { stdout, stderr } = await execPromise(
      `npx onchainos wallet contract-call --chain 196 --to ${USDC_ADDRESS} --input-data ${inputData} --force`
    )
    
    console.log(`[sendUSDC] OKX OS Output:`, stdout)
    
    let txHash = 'unknown'
    try {
      const result = JSON.parse(stdout.trim())
      if (result.data && result.data.txHash) {
        txHash = result.data.txHash
      }
    } catch(e) {
      console.warn('[sendUSDC] Could not parse exact txHash from OKX OS output:', e)
    }

    return {
      txHash,
      from: AGENT_WALLET_ADDRESS,
      to: toAddress,
      amount,
    }
  } catch (txErr: any) {
    console.error(`[sendUSDC] OKX OS Error for ${toAddress}:`, txErr.message || txErr)
    throw new Error('Onchain OS wallet execution failed. Check server logs.')
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
