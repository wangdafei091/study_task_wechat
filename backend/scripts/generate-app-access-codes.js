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
  const count = Number(readFlag('count', 1));
  const days = Number(readFlag('days', 7));
  const maxUses = Number(readFlag('max-uses', 1));
  const note = readFlag('note', '');
  const created = await appAccessService.createCodes({ count, days, maxUses, note });
  console.log(JSON.stringify(created, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
