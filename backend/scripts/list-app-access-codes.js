#!/usr/bin/env node

require('dotenv').config();

const appAccessService = require('../services/appAccessService');
const { closePool } = require('../config/database');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  if (!argument) {
    return fallback;
  }
  return argument.slice(prefix.length);
}

async function main() {
  const status = readFlag('status', null);
  const codes = await appAccessService.listCodes({ status });
  console.log(JSON.stringify(codes, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
