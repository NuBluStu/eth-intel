#!/bin/bash

# Start Lighthouse Beacon Node with external SSD paths
caffeinate -dimsu lighthouse beacon_node \
  --network mainnet \
  --execution-endpoint http://127.0.0.1:8551 \
  --execution-jwt "/Volumes/X9 Pro/ETH/jwtsecret" \
  --datadir "/Volumes/X9 Pro/ETH/lighthouse" \
  --port 9000 \
  --http \
  --checkpoint-sync-url https://mainnet-checkpoint-sync.attestant.io \
  --reconstruct-historic-states