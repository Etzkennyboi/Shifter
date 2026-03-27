import { ethers } from 'ethers'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execPromise = promisify(exec)

const USDC_ABI = [
  'function transfer(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x74b7f16337b8972027f6196a17a631ac6de26d22'
export const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS || '0x1ef1034e7cd690b40a329bd64209ce563f95bb5c'

// Resolve the correct CLI binary command for the current environment (Windows vs Linux/Railway)
async function getWalletCommand(): Promise<string> {
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'onchainos.exe' : 'onchainos'
  
  // 1. Check if it's in the standard PATH
  try {
    await execPromise(isWin ? 'where onchainos' : 'which onchainos')
    return 'onchainos'
  } catch (e) {
    // 2. Check the standard OKX installer location for Linux/Railway
    const linuxPath = path.join(process.env.HOME || '', '.local', 'bin', binaryName)
    if (!isWin && fs.existsSync(linuxPath)) {
      return linuxPath
    }
    
    // 3. Last Resort: Self-bootstrap the CLI if missing (Critical for Railway deploys)
    console.log('[AgentWallet] CLI binary not found. Initiating autonomous protocol installation...')
    try {
      if (isWin) {
        await execPromise(`powershell -Command "Invoke-WebRequest -Uri https://raw.githubusercontent.com/okx/onchainos-skills/main/install.ps1 -OutFile install.ps1; & ./install.ps1"`)
      } else {
        await execPromise(`curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`)
      }
      console.log('[AgentWallet] Protocol tools installed successfully.')
      return isWin ? 'onchainos' : linuxPath
    } catch (installErr: any) {
      console.error('[AgentWallet] Critical: CLI bootstrap failed:', installErr.message)
      return 'onchainos' // Fallback to PATH and hope for the best
    }
  }
}

export async function sendUSDC(toAddress: string, amount: number) {
  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)

  const decimals = await usdc.decimals()
  const balance = await usdc.balanceOf(AGENT_WALLET_ADDRESS)
  const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals))

  if (balanceFormatted < amount) {
    throw new Error(`Insufficient treasury: ${balanceFormatted} USDC available. Fund 0x1ef1...`)
  }

  const amountInUnits = ethers.parseUnits(amount.toFixed(6), decimals)
  const iface = new ethers.Interface(USDC_ABI)
  const inputData = iface.encodeFunctionData('transfer', [toAddress, amountInUnits])

  const cmdLine = await getWalletCommand()
  const apiKey = process.env.OKX_API_KEY || '28c9786b-053b-48df-959f-0d6beacc1d0a'
  const secretKey = process.env.OKX_SECRET_KEY || '8AE96E275EE85DD891AF588E59F822AD'

  try {
    // HEADLESS AUTHENTICATION
    try {
      await execPromise(`${cmdLine} wallet status`)
    } catch (statusErr: any) {
      console.log('[sendUSDC] Re-authenticating TEE...')
      // The CLI handles AK login automatically if no email is provided, 
      // but it expects the keys TO BE IN THE ENVIRONMENT, not as flags.
      await execPromise(`${cmdLine} wallet login --force`)
      console.log('[sendUSDC] Wallet authenticated successfully.')
    }
    console.log(`[sendUSDC] Executing TEE Contract-Call for ${toAddress}...`)
    const { stdout } = await execPromise(`${cmdLine} wallet contract-call --chain 196 --to ${USDC_ADDRESS} --input-data ${inputData} --force`)
    
    let txHash = 'unknown'
    try {
      const result = JSON.parse(stdout.trim())
      if (result.data && result.data.txHash) txHash = result.data.txHash
    } catch(e) {
      console.warn('[sendUSDC] Tracking txHash failed, assuming confirmed.')
    }

    return { txHash, from: AGENT_WALLET_ADDRESS, to: toAddress, amount }
  } catch (err: any) {
    console.error(`[sendUSDC] Blockchain Rejection:`, err.message)
    throw new Error(`Protocol Execution Failed: ${err.message}`)
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
  } catch { return 0 }
}
