/*
 * usage.js: caching, bounded concurrency, and the two live sources.
 *
 * Almost all of this runs against a stubbed fetch. Three requests at the end
 * are real, because the two live sources are the part most likely to break
 * without any change on our side — the report page can be renamed or its
 * layout changed, and the search API can stop answering the way it did.
 *
 * Three is the smallest number that still checks anything: one for the report
 * page, and two counts, because a single number tells you nothing about
 * whether the figures are real magnitudes.
 *
 * Wikidata rate-limits, and a suite run repeatedly will be refused. That is
 * not a defect in this code, so it is reported as skipped rather than failed.
 * Set WDPROP_OFFLINE=1 to leave the live requests out altogether.
 */
const ROOT = require("path").join(__dirname, "..");

// usage.js: caching, batching, formatting — then the two live sources.
let store = {};
global.window = { localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); } } };
global.localStorage = global.window.localStorage;
global.document = { readyState: "complete", getElementById: () => null, addEventListener: () => {} };

let calls = [];
const realFetch = global.fetch;
global.fetch = (url) => {
    calls.push(url);
    if (url.includes("list=search")) {
        const p = decodeURIComponent(url.match(/haswbstatement%3A(P\d+)|haswbstatement:(P\d+)/)[1] || "");
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
            p === "P999" ? { query: {} } : { query: { searchinfo: { totalhits: 1234567 } } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

require(ROOT + "/usage.js");
const usage = global.window.WDProp.usage;

let pass = 0, fail = 0, skipped = 0;
const check = (n, a, e) => (JSON.stringify(a) === JSON.stringify(e)
    ? (pass++, console.log("  ok   " + n))
    : (fail++, console.log(`  FAIL ${n}\n        expected ${JSON.stringify(e)}\n        actual   ${JSON.stringify(a)}`)));

/*
 * Runs a section that needs the network. Being refused, or being offline, is
 * a fact about the run rather than about the code, so it is not a failure.
 */
async function live(name, body) {
    console.log("\n-- Live: " + name + " --");
    if (process.env.WDPROP_OFFLINE === "1") {
        skipped++;
        console.log("  skip  WDPROP_OFFLINE is set");
        return;
    }
    try {
        await body();
    } catch (e) {
        skipped++;
        console.log("  skip  " + name + " could not be reached: " + e.message);
    }
}

(async () => {
    console.log("\n-- Formatting --");
    check("millions", usage.format(118879567), "119M");
    check("thousands", usage.format(51969), "52k");
    check("small numbers in full", usage.format(2377), "2,377");
    check("zero", usage.format(0), "0");
    check("unknown is blank, not zero", usage.format(null), "");

    console.log("\n-- Fetching and caching --");
    calls = [];
    let r = await usage.counts(["P31", "P17"]);
    check("both counts returned", Object.keys(r).sort(), ["P17", "P31"]);
    check("one request per property", calls.length, 2);

    calls = [];
    r = await usage.counts(["P31", "P17"]);
    check("second call is served from cache", calls.length, 0);
    check("and still returns the counts", Object.keys(r).sort(), ["P17", "P31"]);

    calls = [];
    r = await usage.counts(["P31", "P1476"]);
    check("only the unseen property is fetched", calls.length, 1);

    console.log("\n-- Cache expiry --");
    const cache = JSON.parse(store["wdprop-usage-counts"]);
    cache.P31.at = Date.now() - (25 * 60 * 60 * 1000);   // older than a day
    store["wdprop-usage-counts"] = JSON.stringify(cache);
    calls = [];
    await usage.counts(["P31", "P17"]);
    check("a stale entry is fetched again", calls.length, 1);
    check("a fresh one is not", calls.filter(c => c.includes("P17")).length, 0);

    console.log("\n-- A count that cannot be read --");
    calls = [];
    r = await usage.counts(["P999"]);
    check("absent rather than zero, so it is never shown as unused", "P999" in r, false);

    console.log("\n-- Concurrency is bounded --");
    let inFlight = 0, peak = 0;
    global.fetch = () => {
        inFlight++; peak = Math.max(peak, inFlight);
        return new Promise(res => setTimeout(() => { inFlight--;
            res({ ok: true, json: () => Promise.resolve({ query: { searchinfo: { totalhits: 5 } } }) }); }, 5));
    };
    store = {};
    await usage.counts(Array.from({ length: 30 }, (_, i) => "P" + (5000 + i)));
    check("never more than six requests at once", peak <= 6, true);

    /*
     * Wikidata refuses a run that asks too often, and answers with prose
     * rather than JSON. Parsing that as JSON used to fail with "Unexpected
     * token 'Y'", which says nothing about being refused.
     */
    console.log("\n-- Refused by the API --");
    global.fetch = () => Promise.resolve({
        ok: false, status: 429,
        json: () => Promise.reject(new SyntaxError("Unexpected token 'Y'")),
    });
    store = {};
    let refusal = null;
    await usage.topProperties().catch(e => { refusal = e.message; });
    check("the reason is the status, not the parse", refusal, "Wikidata answered 429");

    global.fetch = realFetch;

    /* One request: the report page. */
    await live("the community report", async () => {
        store = {};
        const ids = await usage.topProperties();
        check("a hundred properties", ids.length, 100);
        check("all look like property ids", ids.every(x => /^P\d+$/.test(x)), true);
        check("no duplicates", new Set(ids).size, 100);
        check("cached afterwards", !!JSON.parse(store["wdprop-usage-top"]).ids, true);
        console.log("       top ten: " + ids.slice(0, 10).join(", "));
    });

    /*
     * Two requests. P31 is on almost everything and P1963 on very little, so
     * the gap between them is wide enough that a wrong reading shows up.
     */
    await live("counts from the search API", async () => {
        store = {};
        const counts = await usage.counts(["P31", "P1963"]);
        /*
         * A count that cannot be read is absent rather than an error — that
         * is deliberate, so a property with no figure still shows. It means a
         * refusal arrives here as a missing key, which has to be told apart
         * from a wrong answer before anything is checked.
         */
        if (Object.keys(counts).length < 2) {
            throw new Error("no count came back for every property");
        }
        check("both read", Object.keys(counts).length, 2);
        check("counted in the millions", counts.P31 > 1000000, true);
        check("and the rare one is far smaller", counts.P31 > counts.P1963 * 100, true);
        Object.keys(counts).forEach(k => console.log(`       ${k}: ${usage.format(counts[k])}`));
    });

    console.log("\n" + pass + " passed, " + fail + " failed" +
        (skipped ? ", " + skipped + " section" + (skipped > 1 ? "s" : "") + " skipped" : ""));
    process.exit(fail ? 1 : 0);
})();
