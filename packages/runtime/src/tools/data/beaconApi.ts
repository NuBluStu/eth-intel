/**
 * Lighthouse Beacon API Client
 * Interface to Ethereum consensus layer
 */

const BEACON_URL = process.env.BEACON_API || "http://127.0.0.1:5052";
const TIMEOUT_MS = 30_000;

// Core API call function
async function beaconCall(endpoint: string, method = "GET", body?: any): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      signal: controller.signal
    };
    
    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BEACON_URL}${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Beacon API error: ${response.status} - ${error}`);
    }
    
    const json = await response.json();
    return json.data || json;
  } finally {
    clearTimeout(timeout);
  }
}

// Beacon Node Info
export async function getNodeVersion() {
  return beaconCall("/eth/v1/node/version");
}

export async function getNodeSyncing() {
  return beaconCall("/eth/v1/node/syncing");
}

export async function getNodeHealth() {
  return beaconCall("/eth/v1/node/health");
}

export async function getPeers() {
  return beaconCall("/eth/v1/node/peers");
}

// Beacon Chain Info
export async function getGenesis() {
  return beaconCall("/eth/v1/beacon/genesis");
}

export async function getChainHead() {
  return beaconCall("/eth/v1/beacon/headers/head");
}

export async function getFinalityCheckpoints(stateId = "head") {
  return beaconCall(`/eth/v1/beacon/states/${stateId}/finality_checkpoints`);
}

export async function getFork(stateId = "head") {
  return beaconCall(`/eth/v1/beacon/states/${stateId}/fork`);
}

// Validator Info
export async function getValidators(stateId = "head", status?: string[]) {
  let endpoint = `/eth/v1/beacon/states/${stateId}/validators`;
  if (status && status.length > 0) {
    endpoint += `?status=${status.join(",")}`;
  }
  return beaconCall(endpoint);
}

export async function getValidator(stateId = "head", validatorId: string | number) {
  return beaconCall(`/eth/v1/beacon/states/${stateId}/validators/${validatorId}`);
}

export async function getValidatorBalances(stateId = "head", validatorIds?: string[]) {
  let endpoint = `/eth/v1/beacon/states/${stateId}/validator_balances`;
  if (validatorIds && validatorIds.length > 0) {
    endpoint += `?id=${validatorIds.join(",")}`;
  }
  return beaconCall(endpoint);
}

// Duties
export async function getProposerDuties(epoch: number) {
  return beaconCall(`/eth/v1/validator/duties/proposer/${epoch}`);
}

export async function getAttesterDuties(epoch: number, indices: number[]) {
  return beaconCall(`/eth/v1/validator/duties/attester/${epoch}`, "POST", indices);
}

export async function getSyncCommitteeDuties(epoch: number, indices: number[]) {
  return beaconCall(`/eth/v1/validator/duties/sync/${epoch}`, "POST", indices);
}

// Blocks
export async function getBlock(blockId = "head") {
  return beaconCall(`/eth/v2/beacon/blocks/${blockId}`);
}

export async function getBlockRoot(blockId = "head") {
  return beaconCall(`/eth/v1/beacon/blocks/${blockId}/root`);
}

export async function getBlockAttestations(blockId = "head") {
  return beaconCall(`/eth/v1/beacon/blocks/${blockId}/attestations`);
}

// Attestations
export async function getAttestations(slot?: number, committeeIndex?: number) {
  let endpoint = "/eth/v1/beacon/pool/attestations";
  const params = [];
  if (slot !== undefined) params.push(`slot=${slot}`);
  if (committeeIndex !== undefined) params.push(`committee_index=${committeeIndex}`);
  if (params.length > 0) endpoint += `?${params.join("&")}`;
  return beaconCall(endpoint);
}

// Committees
export async function getCommittees(stateId = "head", epoch?: number, index?: number, slot?: number) {
  let endpoint = `/eth/v1/beacon/states/${stateId}/committees`;
  const params = [];
  if (epoch !== undefined) params.push(`epoch=${epoch}`);
  if (index !== undefined) params.push(`index=${index}`);
  if (slot !== undefined) params.push(`slot=${slot}`);
  if (params.length > 0) endpoint += `?${params.join("&")}`;
  return beaconCall(endpoint);
}

// Sync Committee
export async function getSyncCommittee(stateId = "head", epoch?: number) {
  let endpoint = `/eth/v1/beacon/states/${stateId}/sync_committees`;
  if (epoch !== undefined) endpoint += `?epoch=${epoch}`;
  return beaconCall(endpoint);
}

// Rewards
export async function getBlockRewards(blockId: string) {
  return beaconCall(`/eth/v1/beacon/rewards/blocks/${blockId}`);
}

export async function getAttestationRewards(epoch: number, pubkeys: string[]) {
  return beaconCall(`/eth/v1/beacon/rewards/attestations/${epoch}`, "POST", pubkeys);
}

export async function getSyncCommitteeRewards(blockId: string, pubkeys: string[]) {
  return beaconCall(`/eth/v1/beacon/rewards/sync_committee/${blockId}`, "POST", pubkeys);
}

// Analytics Functions
export async function getValidatorPerformance(validatorIndex: number, epochs = 10) {
  const currentHead = await getChainHead();
  const headSlot = parseInt(currentHead.header.message.slot);
  const currentEpoch = Math.floor(headSlot / 32);
  
  const performance = {
    attestations: 0,
    proposals: 0,
    syncCommittee: 0,
    totalRewards: BigInt(0),
    missedDuties: 0
  };
  
  for (let epoch = currentEpoch - epochs; epoch < currentEpoch; epoch++) {
    // Check proposer duties
    const proposerDuties = await getProposerDuties(epoch);
    const wasProposer = proposerDuties.some((d: any) => d.validator_index === validatorIndex);
    if (wasProposer) performance.proposals++;
    
    // Check attester duties
    const attesterDuties = await getAttesterDuties(epoch, [validatorIndex]);
    if (attesterDuties.length > 0) performance.attestations++;
  }
  
  return performance;
}

export async function getNetworkStatistics() {
  const [genesis, head, validators, syncing] = await Promise.all([
    getGenesis(),
    getChainHead(),
    getValidators("head", ["active"]),
    getNodeSyncing()
  ]);
  
  const headSlot = parseInt(head.header.message.slot);
  const currentEpoch = Math.floor(headSlot / 32);
  const genesisTime = parseInt(genesis.genesis_time);
  const currentTime = Math.floor(Date.now() / 1000);
  const networkAge = currentTime - genesisTime;
  
  return {
    currentEpoch,
    currentSlot: headSlot,
    activeValidators: validators.length,
    isSyncing: syncing.is_syncing,
    networkAgeDays: Math.floor(networkAge / 86400),
    slotsPerEpoch: 32,
    secondsPerSlot: 12
  };
}

// Export namespace for tool integration
export const beaconApi = {
  // Node
  getNodeVersion,
  getNodeSyncing,
  getNodeHealth,
  getPeers,
  
  // Chain
  getGenesis,
  getChainHead,
  getFinalityCheckpoints,
  getFork,
  
  // Validators
  getValidators,
  getValidator,
  getValidatorBalances,
  
  // Duties
  getProposerDuties,
  getAttesterDuties,
  getSyncCommitteeDuties,
  
  // Blocks
  getBlock,
  getBlockRoot,
  getBlockAttestations,
  
  // Attestations
  getAttestations,
  
  // Committees
  getCommittees,
  getSyncCommittee,
  
  // Rewards
  getBlockRewards,
  getAttestationRewards,
  getSyncCommitteeRewards,
  
  // Analytics
  getValidatorPerformance,
  getNetworkStatistics
};