#!/usr/bin/env node

require('dotenv').config();

const appAccessService = require('../services/appAccessService');
const { closePool } = require('../config/database');

async function main() {
  const codes = process.argv
    .slice(2)
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (codes.length === 0) {
    throw new Error('请传入至少一个邀请码，例如：node backend/scripts/disable-app-access-codes.js ABCD1234');
  }

  const affected = await appAccessService.disableCodes(codes);
  console.log(JSON.stringify({ affected }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
