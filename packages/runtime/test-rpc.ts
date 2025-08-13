import "dotenv/config";
import * as chain from "./src/tools.chain.js";

async function test() {
  console.log("Testing chain.rpc with eth_blockNumber...");
  const blockNumber = await chain.rpc("eth_blockNumber");
  console.log("Current block number (hex):", blockNumber);
  console.log("Current block number (decimal):", parseInt(blockNumber, 16));
}

test().catch(console.error);