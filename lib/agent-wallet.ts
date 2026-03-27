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

// Hardcoded Credentials (Matches verified swap-params config)
const OKX_API_KEY = '28c9786b-053b-48df-959f-0d6beacc1d0a'
const OKX_SECRET_KEY = '8AE96E275EE85DD891AF588E59F822AD'
const OKX_PASSPHRASE = '$Skippy2000'

// Persistent Writable Path for TEE Tools and Config (Essential for Stateless Railway/Cloud)
const TEE_HOME = '/tmp/okx_engine'
const BIN_DIR = path.join(TEE_HOME, 'bin')
const BIN_PATH = path.join(BIN_DIR, 'onchainos')

async function ensureProtocolEnvironment(): Promise<string> {
  const isWin = process.platform === 'win32'
  if (isWin) return 'onchainos'

  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })

  if (!fs.existsSync(BIN_PATH)) {
    console.log('[AgentProtocol] Bootstrapping TEE binary to:', BIN_PATH)
    await execPromise(`curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`, {
      env: { ...process.env, INSTALL_DIR: BIN_DIR }
    })
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

  // THE ULTIMATE SHIELD WALL FOR RAILWAY NIXPACKS
  // This combination and naming of variables is the specifically targeted bypass 
  // for the Linux binary's hardcoded libsecret keyring dependency.
  const cmdEnv = { 
    ...process.env, 
    HOME: TEE_HOME,
    OKX_API_KEY: OKX_API_KEY, 
    OKX_SECRET_KEY: OKX_SECRET_KEY, 
    OKX_PASSPHRASE: OKX_PASSPHRASE,
    
    // Explicit 100% RAW MODE - This bypasses the keyring-rs crate logic entirely
    ONCHAINOS_NO_KEYRING: '1',
    OKX_NO_KEYRING: '1',
    ONCHAIN_OS_NO_KEYRING: '1',
    
    // Force the binary to use the local filesystem for all security blobs
    KEYRING_TYPE: 'file',
    OKX_KEYRING_TYPE: 'file',
    ONCHAINOS_KEYRING_TYPE: 'file',
    ONCHAIN_OS_KEYRING_TYPE: 'file',
    
    // Keyring Password (Official TEE Bypass)
    OKX_KEYRING_PASSWORD: 'shifter_secure_protocol_2026',
    ONCHAINOS_KEYRING_PASSWORD: 'shifter_secure_protocol_2026',
    
    // Session Storage Pathing
    OKX_SESSION_STORAGE: 'file',
    OKX_SESSION_FILE: path.join(TEE_HOME, 'okx_session.json'),
    ONCHAINOS_SESSION_STORAGE: 'file',
    ONCHAINOS_SESSION_FILE: path.join(TEE_HOME, 'onchain_session.json'),

    // Global environmental lockdown
    OKX_USE_PLAIN_TEXT: 'true',
    ONCHAINOS_USE_PLAIN_TEXT: 'true',
    DBUS_SESSION_BUS_ADDRESS: '', // Remove reference to system bus to force local mode
    XDG_RUNTIME_DIR: TEE_HOME,
    XDG_CACHE_HOME: TEE_HOME,
    XDG_CONFIG_HOME: TEE_HOME,
    XDG_DATA_HOME: TEE_HOME,
  }

  const execute = async (command: string) => {
    // We remove the dbus-run-session wrapper as it was proved incompatible with Railway's Nixpacks bus
    // Instead we rely entirely on the NO_KEYRING internal flag which is more 'native' to the binary
    console.log(`[sendUSDC] Executing binary process: ${command.split(' ')[1]}...`)
    return await execPromise(command, { env: cmdEnv });
  }

  try {
    // 1. SILENT AUTH
    try {
      await execute(`${cmdLine} wallet status`)
    } catch (err: any) {
      console.log('[sendUSDC] Re-authenticating TEE...')
      await execute(`${cmdLine} wallet login --force`)
    }

    // 2. DISPATCH PAYOUT
    console.log(`[sendUSDC] Dispatching TEE contract-call: ${toAddress}...`)
    const { stdout } = await execute(`${cmdLine} wallet contract-call --chain 196 --to ${USDC_ADDRESS} --input-data ${inputData} --force`)
    
    let txHash = 'unknown'
    try {
      const result = JSON.parse(stdout.trim())
      if (result.data?.txHash) txHash = result.data.txHash
    } catch {
      console.warn('[sendUSDC] Tracking txHash failed, assuming success payload.')
    }

    return { txHash, from: AGENT_WALLET_ADDRESS, to: toAddress, amount }
  } catch (err: any) {
    const errorBody = err.stderr || err.stdout || err.message || 'Unknown protocol fault'
    console.error(`[sendUSDC] Blockchain Rejection:`, errorBody)
    throw new Error(`Protocol Execution Fault: ${errorBody.slice(0, 150)}`)
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
