# Tests

    node tests/run.js

Plain Node, no dependencies and no build step, matching the rest of WDProp.

Each suite loads the real source files behind the small browser stand-ins in
`helpers.js` — enough `window`, `document` and `localStorage` for the logic to
run, and nothing more. Some suites reach Wikidata to confirm that a generated
query is valid and returns what is expected, so a run needs a network
connection.

| Suite | Covers |
|---|---|
| `wdprop.test.js` | Query building in the original scripts, and the three defects fixed in them |
| `i18n.test.js` | Message files: coverage across languages, placeholders, unused and undefined keys |
| `usage.test.js` | Usage counts: caching, expiry, bounded concurrency, and both live sources |
| `nav.test.js` | Working out the current sidebar entry and the breadcrumb from the address |

Suites for the batch, workbench, campaigns, contributions, terminology and
accessibility work still need porting into this directory.
