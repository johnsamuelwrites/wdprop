/*
 * activity.js: the count of what a page has asked for.
 *
 * The number in the header is only worth having if it is right, and the way it
 * is arrived at — replacing window.fetch — is the kind of thing that works
 * until something calls fetch a second way. So: that every request is counted
 * once, that a failure is still counted, that the wrapper survives being
 * installed twice, and that what the panel says about a request matches what
 * the request was for.
 */
const fs = require("fs"), path = require("path");
const { browser, element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

browser();

/* Answers whatever is asked, so the counting is all that is under test. */
let answered = [];
global.window.fetch = function (url) {
    answered.push(String(url));
    return Promise.resolve({ ok: true, status: 200 });
};

global.window.WDProp = global.window.WDProp || {};
global.WDProp = global.window.WDProp;

/* The real English messages, so the panel is checked in the words it shows. */
const dict = {};
global.window.WDProp.i18n = {
    add: (lang, d) => { if (lang === "en") Object.assign(dict, d); },
    t: (key, params) => {
        let s = dict[key];
        if (s === undefined) return key;
        (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
        return s;
    },
    current: () => "en",
};
require(ROOT + "/i18n/en.js");

require(ROOT + "/activity.js");
const activity = global.window.WDProp.activity;

const s = suite("activity");

/* --------------------------------------------------------------- describing */

{
    const cases = [
        ["https://query.wikidata.org/sparql?query=SELECT%20*", "activity.query", "SPARQL query"],
        ["https://www.wikidata.org/w/api.php?action=wbgetentities&ids=P1%7CP2%7CP3&format=json",
            "activity.api", "Terms of 3 properties"],
        ["https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement%3AP31",
            "activity.api", "Search: haswbstatement:P31"],
        ["https://www.wikidata.org/w/api.php?action=query&prop=revisions&titles=Property%3AP31",
            "activity.api", "Revision history"],
        ["https://www.wikidata.org/w/api.php?action=query&list=recentchanges&rcnamespace=120",
            "activity.api", "Recent changes"],
    ];

    for (const [url, source, reads] of cases) {
        const what = activity.describe(url);
        s.check("source of " + what.key, what.source, source);
        s.check("reads as " + JSON.stringify(reads),
            global.window.WDProp.i18n.t(what.key, what.params), reads);
    }

    /*
     * The one that matters most for spotting a fault: a page filling fifty
     * cells one at a time should be fifty entries all reading the same thing,
     * which is visible at a glance in a way a total is not.
     */
    const page = activity.describe(
        "https://www.wikidata.org/w/api.php?action=parse&page=Wikidata%3ADatabase+reports%2FList+of+properties%2F1-1000");
    s.check("a wiki page is named, not just numbered",
        global.window.WDProp.i18n.t(page.key, page.params),
        "Wiki page: Wikidata:Database reports/List of propert…");
}

/* ------------------------------------------------------------------ counting */

(async () => {
    const before = activity.snapshot().total;

    await global.window.fetch("https://query.wikidata.org/sparql?query=x");
    await global.window.fetch(
        "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=P1");

    let now = activity.snapshot();
    s.check("both requests counted", now.total - before, 2);
    s.check("and none left in flight when they have answered", now.inflight, 0);
    s.check("the newest is first", now.calls[0].what.key, "activity.terms");
    s.check("with how long it took", typeof now.calls[0].ms, "number");
    s.check("and it is marked as having worked", now.calls[0].status, "ok");
    s.check("the request itself still went out", answered.length, 2);

    /* A response that arrives and says no is still a request that happened. */
    const watched = global.window.fetch;
    global.window.fetch = function () {
        return Promise.resolve({ ok: false, status: 429 });
    };
    activity.watch(global.window);
    await global.window.fetch("https://www.wikidata.org/w/api.php?action=query");
    s.check("a refusal is counted", activity.snapshot().total - before, 3);
    s.check("and marked as a failure", activity.snapshot().calls[0].status, "failed");

    /* A request that never answers at all. */
    global.window.fetch = function () { return Promise.reject(new Error("offline")); };
    activity.watch(global.window);
    let threw = null;
    await global.window.fetch("https://query.wikidata.org/sparql").catch(e => { threw = e.message; });
    s.check("a request that fails outright still reaches its caller", threw, "offline");
    s.check("and is counted", activity.snapshot().total - before, 4);
    s.check("with nothing left in flight", activity.snapshot().inflight, 0);

    /*
     * Wrapping twice would count every request as two, which is exactly the
     * kind of wrong that makes the number useless without looking wrong. The
     * already-wrapped fetch is put back and watch called on it again, which is
     * what a second copy of this file on the page would do.
     */
    global.window.fetch = watched;
    const doubled = activity.snapshot().total;
    activity.watch(global.window);
    activity.watch(global.window);
    await global.window.fetch("https://query.wikidata.org/sparql?query=y");
    s.check("wrapping an already-watched fetch does not double the count",
        activity.snapshot().total - doubled, 1);

    /* ------------------------------------------------------- what was not asked */

    activity.note("activity.usagecached", [50]);
    now = activity.snapshot();
    s.check("something answered without a request is shown", now.calls[0].status, "local");
    s.check("in words", global.window.WDProp.i18n.t(now.calls[0].what.key, now.calls[0].what.params),
        "Usage of 50 properties, from the reports already read");
    s.check("but is not counted as a request",
        now.total, activity.snapshot().total);

    /* ------------------------------------------------------------- the indicator */

    const header = element("div");
    activity.mount(header);

    const wrap = header.children[0];
    const button = wrap.children[0];
    s.check("the indicator is a real button, not a div with a role",
        button.tag, "button");
    s.check("it says how many requests the page has cost",
        button.children[1].textContent, String(activity.snapshot().total));
    s.check("and names itself for a screen reader",
        button.getAttribute("aria-label"),
        activity.snapshot().total + " requests for this page");
    s.check("the panel starts closed", wrap.children[2].getAttribute("hidden"), "hidden");
    s.check("and the button says so", button.getAttribute("aria-expanded"), "false");

    /* A second mount must not add a second indicator to the header. */
    activity.mount(header);
    s.check("only ever one indicator", header.children.length, 1);

    button.listeners.click[0]();
    s.check("opening it marks the button expanded",
        button.getAttribute("aria-expanded"), "true");
    s.check("and reveals the panel", wrap.children[2].getAttribute("hidden"), null);

    const items = wrap.children[2].children.find(c => c.tag === "ul");
    s.check("which lists what was asked for", items.children.length > 0, true);
    s.check("newest first, so the last thing done is at the top",
        items.children[0].children[0].textContent,
        "Usage of 50 properties, from the reports already read");

    /* The count keeps up while the panel is open. */
    const shown = activity.snapshot().total;
    await global.window.fetch("https://query.wikidata.org/sparql?query=z");
    s.check("the figure follows a request made while it is open",
        button.children[1].textContent, String(shown + 1));

    button.listeners.click[0]();
    s.check("closing it hides the panel again",
        wrap.children[2].getAttribute("hidden"), "hidden");

    process.exit(s.done());
})();
