require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');
const api3Chains = require('@api3/chains');
require('dotenv').config();

const etherscan = api3Chains.hardhatConfig.etherscan();
const networks = api3Chains.hardhatConfig.networks();
const PRIVATE_KEY = process.env.PRIVATE_KEY;
module.exports = {
  etherscan,
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    outputFile: 'gas_report',
    noColors: true,
  },
  networks: {
    "arbitrum-sepolia": {
      "accounts": [PRIVATE_KEY],
      "chainId": 421614,
      "url": "https://sepolia-rollup.arbitrum.io/rpc"
    },
    "crab": {
      "accounts": [PRIVATE_KEY],
      "chainId": 44,
      "url": "https://darwiniacrab-rpc.dwellir.com"
    },
    "darwinia": {
      "accounts": [PRIVATE_KEY],
      "chainId": 46,
      "url": "https://darwinia-rpc.dwellir.com"
    },
  },
  paths: {
    tests: process.env.EXTENDED_TEST ? './extended-test' : './test',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.9',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
};
