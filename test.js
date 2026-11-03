#!/usr/bin/env node
/**
 * Smoke test: spin up the MCP server over stdio via the official client,
 * list tools, and call each one against the live elpriser.org API.
 * Run: npm test
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';

const EXPECTED = ['get_current_price', 'get_today_prices', 'get_cheapest_hours', 'get_price_forecast', 'get_european_prices', 'find_net_company'];
let pass = 0, fail = 0;
const ok = (n) => { console.log(`  ✅ ${n}`); pass++; };
const no = (n, e) => { console.log(`  ❌ ${n}\n     └─ ${(e.message || e).split('\n')[0]}`); fail++; };

const transport = new StdioClientTransport({ command: 'node', args: ['index.js'] });
const client = new Client({ name: 'elpriser-mcp-test', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

try {
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  try {
    assert.deepEqual(names, [...EXPECTED].sort());
    ok(`lists all ${EXPECTED.length} tools`);
  } catch (e) { no('lists all tools', e); }

  // Every tool must have a non-empty description (the LLM relies on it).
  try {
    const missing = tools.filter(t => !t.description || t.description.length < 10).map(t => t.name);
    assert.equal(missing.length, 0, `tools missing description: ${missing.join(', ')}`);
    ok('every tool has a description');
  } catch (e) { no('tool descriptions', e); }

  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, `tool returned error: ${r.content?.[0]?.text}`);
    const txt = r.content?.[0]?.text || '';
    assert.ok(txt.length > 0, 'empty result');
    return txt;
  };

  for (const [name, args, expect] of [
    ['get_current_price', { area: 'DK1' }, /kr\/kWh|lige nu/i],
    ['get_today_prices', { area: 'DK2', mode: 'spot_inkl' }, /Elpriser DK2/i],
    ['get_cheapest_hours', { area: 'DK1', hours: 4 }, /billigste/i],
    ['get_price_forecast', { area: 'DK1' }, /prognose/i],
    ['get_european_prices', { zone: 'de' }, /Spotpriser DE/],
    ['get_european_prices', { zone: 'gb' }, /Spotpriser GB/],
    ['find_net_company', { lat: 56.179, lng: 10.187 }, /Netselskab|Kunne ikke/i],
  ]) {
    try {
      const txt = await call(name, args);
      assert.match(txt, expect, `unexpected output: ${txt.slice(0, 80)}`);
      ok(`call ${name}`);
    } catch (e) { no(`call ${name}`, e); }
  }
} finally {
  await client.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
