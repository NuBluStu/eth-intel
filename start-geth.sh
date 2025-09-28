#!/bin/bash

# Start Geth with external SSD paths and archive mode for complete data
caffeinate -dimsu geth \
  --datadir "/Volumes/X9 Pro/ETH" \
  --syncmode full \
  --gcmode archive \
  --txlookuplimit=0 \
  --http --http.addr 127.0.0.1 --http.port 8545 \
  --http.api "eth,net,web3,debug,trace,txpool" --http.vhosts "localhost" \
  --ws --ws.addr 127.0.0.1 --ws.port 8546 --ws.api "eth,net,web3,debug,trace,txpool" \
  --authrpc.addr 127.0.0.1 --authrpc.port 8551 \
  --authrpc.jwtsecret "/Volumes/X9 Pro/ETH/jwtsecret" \
  --cache 8192 --maxpeers 100 --port 30303 \
  --log.format json 2>&1 | tee -a "/Volumes/X9 Pro/ETH/logs/geth.log"