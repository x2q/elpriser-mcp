#!/usr/bin/env node
/**
 * elpriser-mcp — Model Context Protocol server for Danish electricity prices.
 *
 * Thin wrapper around the free, public elpriser.org JSON API. Lets an LLM
 * (Claude Desktop, etc.) answer questions like "hvad er elprisen lige nu?"
 * or "hvornår er strøm billigst i morgen?" with live data for the Danish
 * price zones DK1 (Vestdanmark) and DK2 (Østdanmark).
 *
 * Data source: elpriser.org → Energi Data Service (Energinet) / Nord Pool.
 * No API key required.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.ELPRISER_API_BASE || 'https://elpriser.org';
const UA = 'elpriser-mcp/1.0 (+https://elpriser.org)';

const AREA = z.enum(['DK1', 'DK2']).default('DK1')
  .describe('Danish price zone: DK1 = Vestdanmark (Jylland og Fyn), DK2 = Østdanmark (Sjælland, Lolland-Falster, Bornholm).');
const MODE = z.enum(['spot_ex', 'spot_inkl', 'inkl_alt', 'inkl_alt_minus'])
  .default('inkl_alt')
  .describe('Price view: spot_ex = raw spot price (no VAT); spot_inkl = spot incl. 25% VAT; inkl_alt = total price incl. system/transmission tariffs + electricity tax + VAT (what you actually pay); inkl_alt_minus = total without electricity tax.');

async function apiGet(path) {
  const res = await fetch(API + path, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`elpriser.org API ${res.status} for ${path}`);
  return res.json();
}

/** Wrap a value as an MCP text result. */
const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: `Fejl: ${e.message || e}` }] });

const server = new McpServer({ name: 'elpriser-mcp', version: '1.0.0' });

// ── get_current_price ────────────────────────────────────────────────────────
server.tool(
  'get_current_price',
  'Get the current Danish electricity price (this hour) for a price zone. Use for "hvad er elprisen lige nu / hvad koster strøm nu".',
  { area: AREA, mode: MODE },
  async ({ area, mode }) => {
    try {
      const d = await apiGet(`/api/now?area=${area}&mode=${mode}`);
      const kr = d.price == null ? 'ukendt' : `${d.price.toFixed(2).replace('.', ',')} kr/kWh`;
      return text(`Elprisen i ${area} lige nu (kl. ${String(d.hour).padStart(2, '0')}:00): ${kr} (${mode}).\n\n${JSON.stringify(d, null, 2)}`);
    } catch (e) { return fail(e); }
  }
);

// ── get_today_prices ─────────────────────────────────────────────────────────
server.tool(
  'get_today_prices',
  'Get all 24 hourly electricity prices for a given date (default: today) in a price zone. Use for "elpriser i dag / time for time".',
  { area: AREA, mode: MODE, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date as YYYY-MM-DD. Defaults to today (Danish local time).') },
  async ({ area, mode, date }) => {
    try {
      const d = await apiGet(`/api/prices?area=${area}&mode=${mode}${date ? `&date=${date}` : ''}`);
      const rows = (d.prices || []).map(p => `${String(p.hour).padStart(2, '0')}:00  ${p.price == null ? '—' : p.price.toFixed(2).replace('.', ',') + ' kr/kWh'}`).join('\n');
      return text(`Elpriser ${area} ${d.date} (${mode}, ${d.unit}):\n${rows}`);
    } catch (e) { return fail(e); }
  }
);

// ── get_cheapest_hours ───────────────────────────────────────────────────────
server.tool(
  'get_cheapest_hours',
  'Find the N cheapest hours of the day for a price zone — for scheduling EV charging, heat pump, dishwasher etc. Use for "hvornår er strøm billigst i dag/i morgen".',
  {
    area: AREA,
    mode: MODE,
    hours: z.number().int().min(1).max(23).default(4).describe('How many cheapest hours to return.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date as YYYY-MM-DD. Defaults to today.'),
  },
  async ({ area, mode, hours, date }) => {
    try {
      const d = await apiGet(`/api/schedule?area=${area}&mode=${mode}&strategy=cheapest_n&hours=${hours}${date ? `&date=${date}` : ''}`);
      const on = (d.schedule || []).filter(s => s.on).sort((a, b) => a.price - b.price);
      const list = on.map(s => `${String(s.hour).padStart(2, '0')}:00  ${s.price.toFixed(2).replace('.', ',')} kr/kWh`).join('\n');
      return text(`De ${hours} billigste timer i ${area} (${d.date}, ${mode}):\n${list}`);
    } catch (e) { return fail(e); }
  }
);

// ── get_price_forecast ───────────────────────────────────────────────────────
server.tool(
  'get_price_forecast',
  'Get a 7-day electricity price forecast for a price zone (actual day-ahead prices for today/tomorrow, weather-corrected estimate beyond). Use for "elpriser de næste dage / prognose".',
  { area: AREA, mode: MODE },
  async ({ area, mode }) => {
    try {
      const d = await apiGet(`/api/forecast?area=${area}&mode=${mode}`);
      const days = (d.days || []).map(day => {
        const vals = day.prices.map(p => p.price).filter(p => p != null);
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        const min = vals.length ? Math.min(...vals) : null;
        const max = vals.length ? Math.max(...vals) : null;
        const f = v => v == null ? '—' : v.toFixed(2).replace('.', ',');
        return `${day.date} (${day.type}): snit ${f(avg)} · lav ${f(min)} · høj ${f(max)} kr/kWh`;
      }).join('\n');
      return text(`7-dages prognose ${area} (${mode}):\n${days}`);
    } catch (e) { return fail(e); }
  }
);

// ── find_net_company ─────────────────────────────────────────────────────────
server.tool(
  'find_net_company',
  'Look up the Danish net company (netselskab) for a location by latitude/longitude — needed to compute the exact total price for an address. Use for "hvilket netselskab har jeg".',
  {
    lat: z.number().describe('Latitude (WGS84).'),
    lng: z.number().describe('Longitude (WGS84).'),
  },
  async ({ lat, lng }) => {
    try {
      const d = await apiGet(`/api/supplierlookup?lat=${lat}&lng=${lng}`);
      return text(d.name
        ? `Netselskab for ${d.address || `${lat},${lng}`}: ${d.name}`
        : `Kunne ikke bestemme netselskab for ${d.address || `${lat},${lng}`}.`);
    } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe for logs (stdout is the JSON-RPC channel).
console.error('elpriser-mcp running (stdio) — data from elpriser.org');
