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

// Persistent Writable Path for TEE Tools and Config (Essential for Stateless Railway/Cloud)
const TEE_HOME = '/tmp/okx_engine'
const BIN_DIR = path.join(TEE_HOME, 'bin')
const BIN_PATH = path.join(BIN_DIR, 'onchainos')

async function ensureProtocolEnvironment(): Promise<string> {
  const isWin = process.platform === 'win32'
  if (isWin) return 'onchainos' // We assume dev machine has it in PATH

  // 1. Ensure Directory Structure
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true })
  }

  // 2. Self-Bootstrap Binary if Missing
  if (!fs.existsSync(BIN_PATH)) {
    console.log('[AgentProtocol] Bootstrapping TEE binary to:', BIN_PATH)
    // We install the binary to our isolated /tmp directory to bypass /root permission issues
    await execPromise(`curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`, {
      env: { ...process.env, INSTALL_DIR: BIN_DIR } // some installers support this, but we'll manually move if needed
    })
    
    // Check if it installed to default ~/.local/bin and move it to our writable /tmp
    const defaultPath = path.join(process.env.HOME || '', '.local', 'bin', 'onchainos')
    if (fs.existsSync(defaultPath)) {
      fs.copyFileSync(defaultPath, BIN_PATH)
      fs.chmodSync(BIN_PATH, '755')
    }
  }

  return BIN_PATH
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

  const cmdLine = await ensureProtocolEnvironment()
  const apiKey = process.env.OKX_API_KEY || '28c9786b-053b-48df-959f-0d6beacc1d0a'
  const secretKey = process.env.OKX_SECRET_KEY || '8AE96E275EE85DD891AF588E59F822AD'
  const pass = process.env.OKX_PASSPHRASE || '$Skippy2000'

  // We explicitly isolate the OKX HOME to /tmp to ensure writability in the Railway container
  const cmdEnv = { 
    ...process.env, 
    HOME: TEE_HOME, 
    OKX_API_KEY: apiKey, 
    OKX_SECRET_KEY: secretKey, 
    OKX_PASSPHRASE: pass 
  }

  try {
    // 1. Silent Headless Re-auth
    try {
      await execPromise(`${cmdLine} wallet status`, { env: cmdEnv })
    } catch (err) {
      console.log('[sendUSDC] Re-authenticating TEE in isolation mode...')
      await execPromise(`${cmdLine} wallet login --force`, { env: cmdEnv })
    }

    // 2. Secure Payout Execution
    console.log(`[sendUSDC] Dispatching TEE contract-call: ${toAddress}...`)
    const { stdout, stderr } = await execPromise(
      `${cmdLine} wallet contract-call --chain 196 --to ${USDC_ADDRESS} --input-data ${inputData} --force`,
      { env: cmdEnv }
    )
    
    console.log('[sendUSDC] CLI Output:', stdout)
    
    let txHash = 'unknown'
    try {
      const result = JSON.parse(stdout.trim())
      if (result.data?.txHash) txHash = result.data.txHash
    } catch {
      console.warn('[sendUSDC] Non-JSON output received, checking for ledger update.')
    }

    return { txHash, from: AGENT_WALLET_ADDRESS, to: toAddress, amount }
  } catch (err: any) {
    // We scrape the stderr for the actual underlying cause (auth failure, gas, etc)
    const errorBody = err.stderr || err.stdout || err.message
    console.error(`[sendUSDC] Protocol Rejection:`, errorBody)
    throw new Error(`Blockchain Execution Fault: ${errorBody.slice(0, 150)}`)
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
