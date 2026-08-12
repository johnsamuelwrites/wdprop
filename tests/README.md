# Tests

    node tests/run.js

Plain Node, no dependencies and no build step, matching the rest of WDProp.

Each suite loads the real source files behind the small browser stand-ins in
`helpers.js` — enough `window`, `document` and `localStorage` for the logic to
run, and nothing more.

Almost everything runs against a stubbed `fetch`. A few requests are real —
three in `usage.test.js`, one in `search.test.js` — because the live sources
are the part most likely to break without any change on our side. Wikidata
rate-limits by address, and a suite run several times over, or run from a CI
runner sharing its address with everything else on it, will be refused with a
429; that is reported as a skipped section rather than a failure, so repeated
runs stay meaningful. To leave the live requests out altogether:

    WDPROP_OFFLINE=1 node tests/run.js

Write a live section through `suite().live(name, body)`, which handles both:
it skips when `WDPROP_OFFLINE` is set, and treats anything thrown inside —
being refused, being offline, an answer that cannot be read — as a skip.
Throw to skip; use `check` only for what the section is actually asserting.
`usage.test.js` predates the helper and has an equivalent of its own.

| Suite | Covers |
|---|---|
| `wdprop.test.js` | Query building in the original scripts, and the three defects fixed in them |
| `atlas.test.js` | Language Atlas query shape and grouping without inferred data |
| `i18n.test.js` | Message files: coverage across languages, placeholders, unused and undefined keys |
| `usage.test.js` | Usage counts: caching, expiry, bounded concurrency, and both live sources |
| `nav.test.js` | Working out the current sidebar entry and the breadcrumb from the address, and building the sidebar |
| `states.test.js` | What a section shows while its query runs, when it finds nothing, and when it fails; paging a long table |
| `layout.test.js` | Stylesheet rules other rules depend on: the boxes that contain the floated chips |
| `dashboard.test.js` | That the landing page shows only what it fetched, says so when it cannot, and ranks correctly |
| `gap.test.js` | Translation Gap Radar query shape and validation stay bounded |
| `markup.test.js` | Page structure the stylesheet relies on: nothing outside the main region, where the sidebar covers it; every page carries the shell and defers its scripts |
| `shell.test.js` | `<wdprop-shell>`: the boxes it builds, their landmarks and names, the keyboard on both controls, and where the logo links from a subdirectory |
| `actions.test.js` | `data-action` dispatch, that every control names an action something registers and the reverse, and what each page starts when it opens |
| `pathviz.test.js` | The arc diagram after d3 was dropped: spacing, painting order, self-loops, and the empty case |
| `offline.test.js` | The service worker's file list against the directory, in both directions, and that a cached page's scripts are cached with it |
| `search.test.js` | Finding a property and a WikiProject through the search index, the language the results are named in, and the address a result page can be bookmarked at |
| `wikiprojects.test.js` | The projects listing, and one project's properties gathered across its subpages |

Suites for the batch, workbench, campaigns, contributions, terminology and
accessibility work still need porting into this directory.
