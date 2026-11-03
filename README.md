# elpriser-mcp

> MCP server for **electricity prices** — Denmark (DK1/DK2, with grid tariffs) and spot prices for 40 European zones: current price, cheapest hours and forecast, straight from [elpriser.org](https://elpriser.org).

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM
(Claude Desktop, etc.) answer questions like:

- *"Hvad er elprisen lige nu?"* / *"What does electricity cost right now in Denmark?"*
- *"Hvornår er strøm billigst i morgen?"* — find the cheapest hours to charge the EV / run the heat pump
- *"Vis elpriser i dag time for time for DK2"*
- *"Hvordan ser elprisprognosen ud de næste 7 dage?"*
- *"What is the electricity price in Germany / Spain / Norway (NO2) today?"*

Data comes from the free, public [elpriser.org](https://elpriser.org) API, which is
sourced from **Energi Data Service** (Energinet) / **Nord Pool**. Prices can be the
raw spot price or the **total price you actually pay** per kWh (incl. system &
transmission tariffs, electricity tax and 25% VAT). **No API key required.**

## Tools

| Tool | What it does |
|---|---|
| `get_current_price` | Current price for this hour (DK1/DK2) |
| `get_today_prices` | All 24 hourly prices for a date |
| `get_cheapest_hours` | The N cheapest hours of the day (EV/heat-pump scheduling) |
| `get_price_forecast` | 7-day forecast (actual for today/tomorrow, estimate beyond) |
| `get_european_prices` | Hourly spot prices (EUR/MWh, no VAT or taxes) for 40 European zones: Nordics, NL, DE, FR, PL, IT-North, AT, BE, CH, CZ, HU, SI, ES, PT, SK, GR, RO, BG, HR, RS, Baltics, ME, MK, AL, IE, GB, XK — with the forecast days where elpriser.org has one |
| `find_net_company` | Net company (netselskab) for a lat/lng — for exact total price |

The Danish tools take an `area` (`DK1` or `DK2`, default `DK1`) and most take a `mode`:

- `spot_ex` — raw spot price, no VAT
- `spot_inkl` — spot price incl. 25% VAT
- `inkl_alt` *(default)* — total price incl. all tariffs + electricity tax + VAT
- `inkl_alt_minus` — total without electricity tax

## Install

Requires Node.js ≥ 18.

### Claude Desktop

Add to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "elpriser": {
      "command": "npx",
      "args": ["-y", "elpriser-mcp"]
    }
  }
}
```

Restart Claude Desktop. You should see the `elpriser` tools available.

### Any other MCP client

Run the server over stdio:

```bash
npx -y elpriser-mcp
```

Or install globally:

```bash
npm install -g elpriser-mcp
elpriser-mcp
```

## Examples

> **You:** Hvornår er strøm billigst i morgen i DK1?
>
> **Claude** *(calls `get_cheapest_hours area=DK1 hours=5 date=…`)*: De billigste timer i morgen er 02–05 og 13–14 …

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ELPRISER_API_BASE` | `https://elpriser.org` | Override the API base (e.g. for testing). |

## How it works

`elpriser-mcp` is a thin wrapper over the public elpriser.org REST API
(`/api/now`, `/api/prices`, `/api/schedule`, `/api/forecast`,
`/api/supplierlookup`). The full OpenAPI 3.1 spec lives at
<https://elpriser.org/api/openapi.json> and human docs at
<https://elpriser.org/api>.

## License

MIT © [elpriser.org](https://elpriser.org)

---

Built and maintained alongside [elpriser.org](https://elpriser.org) — aktuelle
elpriser og spotpriser time for time for hele Danmark.
