# Tests

    node tests/run.js

Plain Node, no dependencies and no build step, matching the rest of WDProp.

Each suite loads the real source files behind the small browser stand-ins in
`helpers.js` — enough `window`, `document` and `localStorage` for the logic to
run, and nothing more.

Almost everything runs against a stubbed `fetch`. Three requests in
`usage.test.js` are real, because the live sources are the part most likely to
break without any change on our side. Wikidata rate-limits, and a suite run
several times over will be refused; that is reported as a skipped section
rather than a failure, so repeated runs stay meaningful. To leave the live
requests out altogether:

    WDPROP_OFFLINE=1 node tests/run.js

| Suite | Covers |
|---|---|
| `wdprop.test.js` | Query building in the original scripts, and the three defects fixed in them |
| `i18n.test.js` | Message files: coverage across languages, placeholders, unused and undefined keys |
| `usage.test.js` | Usage counts: caching, expiry, bounded concurrency, and both live sources |
| `nav.test.js` | Working out the current sidebar entry and the breadcrumb from the address, and building the sidebar |
| `states.test.js` | What a section shows while its query runs, when it finds nothing, and when it fails; paging a long table |
| `layout.test.js` | Stylesheet rules other rules depend on: the boxes that contain the floated chips |
| `dashboard.test.js` | That the landing page shows only what it fetched, says so when it cannot, and ranks correctly |
| `markup.test.js` | Page structure the stylesheet relies on: nothing outside the main region, where the sidebar covers it |

Suites for the batch, workbench, campaigns, contributions, terminology and
accessibility work still need porting into this directory.
