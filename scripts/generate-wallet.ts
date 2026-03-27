import { ethers } from 'ethers'

/**
 * Run: npm run generate-wallet
 * Creates a new agent wallet. Copy the output to your .env file.
 * Then fund this wallet with USDC + small OKB (gas) on X Layer.
 */
function main() {
  const wallet = ethers.Wallet.createRandom()

  console.log('')
  console.log('='.repeat(60))
  console.log('🔑 SHIFTER AGENT WALLET GENERATED')
  console.log('='.repeat(60))
  console.log('')
  console.log('Add these to your .env file:')
  console.log('')
  console.log(`AGENT_WALLET_PRIVATE_KEY="${wallet.privateKey}"`)
  console.log(`AGENT_WALLET_ADDRESS="${wallet.address}"`)
  console.log('')
  console.log('='.repeat(60))
  console.log('⚠️  IMPORTANT:')
  console.log('1. Fund this wallet with USDC on X Layer (for payouts)')
  console.log('2. Fund with small OKB on X Layer (for gas fees)')
  console.log('3. NEVER commit the private key to git')
  console.log('='.repeat(60))
  console.log('')
}

main()
