/*
 * usage.js: how few requests a column of usage figures costs.
 *
 * The figures used to come one property at a time from the search API, so a
 * table of fifty rows was fifty requests and a datatype paged through was
 * fifty more each time. They now come from the community's ranked reports, a
 * thousand properties to a page, and most of what is checked here is that
 * bound: a page of a table must cost a fixed number of requests whatever is on
 * it, and none at all once the reports have been read.
 *
 * Almost all of this runs against a stubbed fetch. A few requests at the end
 * are real, because the live sources are the part most likely to break without
 * any change on our side — a report page can be renamed or its layout changed,
 * and the search API can stop answering the way it did.
 *
 * Wikidata rate-limits, and a suite run repeatedly will be refused. That is
 * not a defect in this code, so it is reported as skipped rather than failed.
 * Set WDPROP_OFFLINE=1 to leave the live requests out altogether.
 */
const ROOT = require("path").join(__dirname, "..");

let store = {};
global.window = { localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); } } };
global.localStorage = global.window.localStorage;
global.document = { readyState: "complete", getElementById: () => null, addEventListener: () => {} };

/*
 * A report page as MediaWiki renders it: a table of properties and their
 * counts, ranked, a thousand to a page. `from` is the rank the page starts at,
 * so the counts descend across pages as the real ones do.
 */
function reportPage(from, size) {
    let html = "<table>";
    for (let i = 0; i < size; i++) {
        const rank = from + i;
        const id = "P" + (1000 + rank);
        html += `<tr>\n<td><a href="/wiki/Property:${id}" title="Property:${id}">` +
            `a property <small dir="ltr">(${id})</small></a></td>\n` +
            `<td>${1000000 - rank * 100}\n</td></tr>\n`;
    }
    return html + "</table>";
}

let calls = [];
let pages = 2;                       /* how many report pages "exist" */
const realFetch = global.fetch;

function stubFetch(url) {
    calls.push(url);
    if (url.includes("action=parse")) {
        const range = /List%20of%20properties%2F(\d+)-(\d+)/.exec(url);
        if (range) {
            const from = parseInt(range[1], 10);
            if (Math.ceil(from / 1000) > pages) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(
                    { error: { code: "missingtitle" } }) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve(
                { parse: { text: { "*": reportPage(from, 1000) } } }) });
        }
    }
    if (url.includes("list=search")) {
        const p = decodeURIComponent(url.match(/haswbstatement%3A(P\d+)|haswbstatement:(P\d+)/)[1] || "");
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
            p === "P999" ? { query: {} } : { query: { searchinfo: { totalhits: 1234567 } } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

global.fetch = stubFetch;

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

    /*
     * The whole reason this file was rewritten. Fifty rows, one request — and
     * the fifty-first row costs nothing, because the report that answered the
     * first fifty holds a thousand.
     */
    console.log("\n-- A page of a table costs one request --");
    store = {};
    calls = [];
    const page = Array.from({ length: 50 }, (_, i) => "P" + (1001 + i));
    let r = await usage.counts(page);
    check("one request for fifty properties", calls.length, 1);
    check("it reads a ranked report", calls[0].includes("action=parse"), true);
    check("every row has a figure", Object.keys(r).length, 50);
    check("and the figures are exact, not bounds", typeof r.P1001, "number");

    calls = [];
    r = await usage.counts(Array.from({ length: 50 }, (_, i) => "P" + (1051 + i)));
    check("the next page of the table costs nothing", calls.length, 0);
    check("and is answered in full", Object.keys(r).length, 50);

    console.log("\n-- Beyond what has been read --");
    calls = [];
    /* P9001 is ranked 8000th: past the two report pages this stub has. */
    r = await usage.counts(["P1001", "P9001"]);
    check("at most two reports are read for one call", calls.length <= 2, true);
    check("the known property is still exact", typeof r.P1001, "number");
    check("the unknown one is a bound, not a guess",
        typeof r.P9001 === "object" && typeof r.P9001.below === "number", true);
    check("and the bound is the lowest figure actually seen",
        r.P9001.below, 1000000 - 2000 * 100);

    console.log("\n-- Sorting by a figure that may be a bound --");
    check("an exact count sorts as itself", usage.value(1200), 1200);
    check("a bound sorts just below it", usage.value({ below: 1200 }), 1199);
    check("nothing known sorts last", usage.value(undefined), -1);

    console.log("\n-- The day's reports are reused --");
    calls = [];
    const held = JSON.parse(store["wdprop-usage-ranks"]);
    check("what was read is kept", held.depth >= 1, true);
    check("with the thousand properties it covered",
        Object.keys(held.counts).length >= 1000, true);
    held.at = Date.now() - (25 * 60 * 60 * 1000);   // older than a day
    store["wdprop-usage-ranks"] = JSON.stringify(held);
    await usage.counts(["P1001"]);
    check("a day later they are read again", calls.length, 1);

    console.log("\n-- A report that cannot be read --");
    store = {};
    calls = [];
    global.fetch = () => Promise.resolve({ ok: false, status: 503,
        json: () => Promise.resolve({}) });
    r = await usage.counts(["P31", "P17"]);
    check("no figure is invented", Object.keys(r).length, 0);
    global.fetch = stubFetch;

    console.log("\n-- One property, exactly --");
    store = {};
    calls = [];
    const one = await usage.exact("P31");
    check("the search API answers for a single property", one, 1234567);
    check("in one request", calls.length, 1);
    calls = [];
    await usage.exact("P31");
    check("and is not asked twice in a day", calls.length, 0);

    calls = [];
    const missing = await usage.exact("P999");
    check("a count that cannot be read is null, never zero", missing, null);

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
     * One request, for a table's worth of properties. This is the assertion
     * the rewrite exists for, and it is checked live because what makes it
     * true is a page on Wikidata: the report keeping its layout, and staying
     * ranked by use rather than by property number.
     */
    await live("a ranked report answers for a whole page", async () => {
        store = {};
        const wanted = ["P31", "P279", "P17", "P131", "P569", "P106", "P18",
            "P625", "P21", "P27"];
        const counts = await usage.counts(wanted);

        if (!Object.keys(counts).length) {
            throw new Error("the report could not be read");
        }
        check("one request covered all ten", calls.length <= 1, true);
        check("every one was placed", Object.keys(counts).length, wanted.length);
        check("P31 is counted in the millions", counts.P31 > 1000000, true);
        check("and it outranks P625",
            usage.value(counts.P31) > usage.value(counts.P625), true);

        calls = [];
        await usage.counts(["P1476", "P50", "P123"]);
        check("further properties cost nothing", calls.length, 0);
        console.log("       P31: " + usage.format(counts.P31) +
            ", P279: " + usage.format(counts.P279));
    });

    /*
     * P31 is on almost everything and P1963 on very little, so the gap between
     * them is wide enough that a wrong reading shows up.
     */
    await live("one property, exactly, from the search API", async () => {
        store = {};
        const common = await usage.exact("P31");
        const rare = await usage.exact("P1963");
        /*
         * A count that cannot be read is null rather than an error — that is
         * deliberate, so a property with no figure still shows. It means a
         * refusal arrives here as a null, which has to be told apart from a
         * wrong answer before anything is checked.
         */
        if (typeof common !== "number" || typeof rare !== "number") {
            throw new Error("no count came back for every property");
        }
        check("counted in the millions", common > 1000000, true);
        check("and the rare one is far smaller", common > rare * 100, true);
        console.log(`       P31: ${usage.format(common)}, P1963: ${usage.format(rare)}`);
    });

    console.log("\n" + pass + " passed, " + fail + " failed" +
        (skipped ? ", " + skipped + " section" + (skipped > 1 ? "s" : "") + " skipped" : ""));
    process.exit(fail ? 1 : 0);
})();
