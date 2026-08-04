/*
 * usage.js: caching, bounded concurrency, and the two live sources.
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

let pass = 0, fail = 0;
const check = (n, a, e) => (JSON.stringify(a) === JSON.stringify(e)
    ? (pass++, console.log("  ok   " + n))
    : (fail++, console.log(`  FAIL ${n}\n        expected ${JSON.stringify(e)}\n        actual   ${JSON.stringify(a)}`)));

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

    console.log("\n-- Live: the community report --");
    global.fetch = realFetch;
    store = {};
    const ids = await usage.topProperties();
    check("a hundred properties", ids.length, 100);
    check("all look like property ids", ids.every(x => /^P\d+$/.test(x)), true);
    check("no duplicates", new Set(ids).size, 100);
    check("cached afterwards", !!JSON.parse(store["wdprop-usage-top"]).ids, true);
    console.log("       top ten: " + ids.slice(0, 10).join(", "));

    console.log("\n-- Live: counts from the search API --");
    store = {};
    const live = await usage.counts(["P31", "P1476", "P1963"]);
    check("all three read", Object.keys(live).length, 3);
    check("P31 is the largest", live.P31 > live.P1963, true);
    Object.keys(live).forEach(k => console.log(`       ${k}: ${usage.format(live[k])}`));

    console.log("\n" + pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
})();
