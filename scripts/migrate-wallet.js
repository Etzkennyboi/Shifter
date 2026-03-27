const { ethers } = require('ethers');
require('dotenv').config({ path: '.env' });

async function migrate() {
  const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
  const oldWallet = new ethers.Wallet(process.env.AGENT_WALLET_PRIVATE_KEY, provider);
  const newAddress = '0x1ef1034e7cd690b40a329bd64209ce563f95bb5c';

  console.log('Migrating funds from', oldWallet.address, 'to', newAddress);

  // Transfer USDC
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS;
  const usdcAbi = ['function balanceOf(address owner) view returns (uint256)', 'function transfer(address to, uint256 amount)'];
  const usdc = new ethers.Contract(usdcAddress, usdcAbi, oldWallet);

  const usdcBalance = await usdc.balanceOf(oldWallet.address);
  if (usdcBalance > 0n) {
    console.log(`Transferring ${ethers.formatUnits(usdcBalance, 6)} USDC...`);
    const tx = await usdc.transfer(newAddress, usdcBalance, { gasLimit: 80000 });
    await tx.wait();
    console.log('USDC Transferred:', tx.hash);
  } else {
    console.log('No USDC to transfer.');
  }

  // Transfer OKB (gas token)
  const okbBalance = await provider.getBalance(oldWallet.address);
  // keep a tiny bit of gas for the transfer itself
  const gasEstimate = 21000n * 10000000n; // 21k gas * 0.01 gwei
  if (okbBalance > gasEstimate) {
    const amountToSend = okbBalance - gasEstimate;
    console.log(`Transferring ${ethers.formatEther(amountToSend)} OKB...`);
    const tx = await oldWallet.sendTransaction({
      to: newAddress,
      value: amountToSend,
    });
    await tx.wait();
    console.log('OKB Transferred:', tx.hash);
  } else {
    console.log('No OKB to transfer (balance too low).');
  }

  console.log('MIGRATION COMPLETE.');
}

migrate().catch(console.error);
