/*
 * search.html: finding a property, and finding a WikiProject.
 *
 * Both tabs asked the query service. The property search joined three
 * questions with UNION, two of which matched a label in every language
 * Wikidata has and then threw all but English away; against the live service
 * ?search=software took 58 seconds, and the third branch on its own was
 * refused after 8. The WikiProject tab federated back to the search API from
 * inside SPARQL, fetched every page mentioning "Wikidata:WikiProject", and
 * filtered the lot by title: 27 seconds for "heritage".
 *
 * A triple store has no text index, so every contains() over labels is a
 * scan. Asked of the search index instead, the same two questions answer in
 * about a third of a second each. The last case in this file is live and
 * checks that this stays true.
 *
 * fetch is a dispatcher the tests program per case; nothing else reaches a
 * network.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("search");

/* ------------------------------------------------------------------ set-up */

const dict = {};
const i18n = {
    add: (lang, d) => { if (lang === "en") Object.assign(dict, d); },
    t: (key, params) => {
        let s = dict[key];
        if (s === undefined) return key;
        (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
        return s;
    },
    current: () => "en",
};

global.window = global.window || {};
global.window.WDProp = { i18n: i18n };
global.WDProp = global.window.WDProp;
require(ROOT + "/i18n/en.js");

let targets = {};
let requests = [];
let answer = () => ({});
/* Handlers searchview.js registered, so a case can fire one. */
const listeners = {};

const sandbox = {
    console,
    setTimeout,
    window: {
        location: { search: "" },
        matchMedia: () => ({ matches: false }),
        WDProp: { i18n },
        addEventListener() {},
        history: { replaceState: (state, title, url) => written.push(url) },
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "en" },
    document: {
        readyState: "complete",
        body: element("body"),
        documentElement: element("html"),
        getElementById: id => (targets[id] = targets[id] || element("div")),
        createElement: element,
        createElementNS: (ns, tag) => element(tag),
        createTextNode: text => { const n = element("#text"); n.text = String(text); return n; },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    },
    fetch: url => {
        requests.push(url);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer(url)) });
    },
};
/* searchview.js registers the page's controls and reaches for these. */
sandbox.window.WDProp.actions = { add() {} };
sandbox.WDProp = sandbox.window.WDProp;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["ready.js", "wdprop.js", "pager.js", "mwwdprop.js", "searchview.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}

/* ----------------------------------------------------------------- helpers */

function textOf(node) {
    if (!node) return "";
    if (node.text) return node.text;
    return (node.innerHTML || "") + node.children.map(textOf).join("");
}

function tableIn(container) {
    return container.children.find(c => c.tag === "table");
}

function bodyRows(table) {
    return table.children.filter(c => c.tag === "tr" && c.children[0].tag === "td");
}

/* Long enough for the chain of promises a search is made of to run out. */
function settled() {
    return new Promise(resolve => setImmediate(() => setImmediate(resolve)));
}

function hits(ids) {
    return { query: { search: ids.map(id => ({ title: "Property:" + id })) } };
}

function entities(labels) {
    const out = {};
    for (const id in labels) out[id] = { labels: labels[id] };
    return { entities: out };
}

/* Where the address bar was left. searchview.js writes it so a result page
   can be bookmarked and sent on. */
let written = [];

const isSearch = url => url.indexOf("list=search") !== -1;
const offsetOf = url => Number(/sroffset=(\d+)/.exec(url)[1]);
const idsOf = url => decodeURIComponent(/[?&]ids=([^&]*)/.exec(url)[1]).split("|");

/* ------------------------------------------------------ what is asked for */

function requestSuite() {
    requests = [];
    answer = url => (isSearch(url)
        ? hits(offsetOf(url) === 0 ? ["P31", "P279"] : ["P1963"])
        : entities({ P31: { en: { value: "instance of" } } }));

    return sandbox.fetchPropertySearch("software").then(ids => {
        console.log("\n-- The index, not the query service --");
        t.check("nothing is asked of the query service",
            requests.filter(u => u.indexOf("query.wikidata.org") !== -1), []);
        t.check("two pages, asked for at once", requests.map(offsetOf), [0, 50]);
        t.check("within the property namespace",
            requests[0].indexOf("srnamespace=120") !== -1, true);
        t.check("the term is one parameter, escaped",
            requests[0].indexOf("srsearch=software") !== -1, true);
        /* It was pasted into a SPARQL string in quotation marks before. */
        t.check("and a term with a quotation mark in it stays one parameter", (() => {
            requests = [];
            sandbox.propertySearchUrl('say "hello"', 0);
            return sandbox.propertySearchUrl('say "hello"', 0)
                .indexOf("srsearch=say%20%22hello%22") !== -1;
        })(), true);

        console.log("\n-- What comes back --");
        t.check("the identifiers, in the order the index gave them",
            ids, ["P31", "P279", "P1963"]);
    });
}

/* ------------------------------------------------- what is not a property */

function siftingSuite() {
    requests = [];
    answer = () => ({
        query: {
            search: [
                { title: "Property:P31" },
                /* A search reaches subpages and talk pages; property.html
                   would have nothing to show for either. */
                { title: "Property:P31/documentation" },
                { title: "Property talk:P31" },
                { title: "Q42" },
                /* And the same property can be on both pages. */
                { title: "Property:P279" },
                { title: "Property:P31" },
            ],
        },
    });

    return sandbox.fetchPropertySearch("x").then(ids => {
        console.log("\n-- Only properties --");
        t.check("a subpage, a talk page and an item are all left out",
            ids, ["P31", "P279"]);
    });
}

/* ------------------------------------------------------- a page that fails */

function failureSuite() {
    console.log("\n-- When a request fails --");

    requests = [];
    answer = url => (offsetOf(url) === 0
        ? hits(["P31"])
        : { error: { code: "srsearch-error" } });

    return sandbox.fetchPropertySearch("x").then(ids => {
        t.check("one page failing costs that page and nothing else", ids, ["P31"]);

        /*
         * Both failing is a failed search, and has to say so. Answering with
         * an empty list would put "nothing found" on screen, which is a
         * different statement and an untrue one.
         */
        answer = () => ({ error: { code: "srsearch-error" } });
        return sandbox.fetchPropertySearch("x").then(
            () => t.check("both failing is an error, not an empty result", "resolved", "rejected"),
            () => t.check("both failing is an error, not an empty result", "rejected", "rejected"));
    });
}

/* ----------------------------------------------------------- naming them */

function labelSuite() {
    console.log("\n-- Naming what was found --");

    requests = [];
    const many = [];
    for (let i = 1; i <= 120; i++) many.push("P" + i);
    answer = () => entities({});

    return sandbox.fetchPropertyLabels(many, "ta").then(() => {
        t.check("fifty identifiers to a request, which is the API's limit",
            requests.map(u => idsOf(u).length), [50, 50, 20]);
        t.check("the language wanted is asked for, and English with it",
            decodeURIComponent(requests[0]).indexOf("languages=ta|en") !== -1, true);

        requests = [];
        answer = () => entities({
            P31: { ta: { value: "வகை" }, en: { value: "instance of" } },
            P279: { en: { value: "subclass of" } },
            P1963: {},
        });

        /*
         * Both are handed on rather than one being chosen here: the row says
         * which of the three states a property is in, and it cannot say that
         * from a string that has already had the choice made for it.
         */
        return sandbox.fetchPropertyLabels(["P31", "P279", "P1963"], "ta").then(labels => {
            t.check("what came back is passed on as it came",
                [labels.P31.ta.value, labels.P31.en.value], ["வகை", "instance of"]);
            t.check("including a property with only the English one",
                [("ta" in labels.P279), labels.P279.en.value], [false, "subclass of"]);
            t.check("and one with neither", labels.P1963, {});
        });
    });
}

/* ------------------------------------------------------------- the table */

function renderSuite() {
    console.log("\n-- The results table --");

    targets.searchResults = element("div");
    sandbox.createDivSearchProperties("searchResults", [
        { property: "P348", labels: { fr: { value: "version du logiciel" }, en: { value: "software version identifier" } } },
        { property: "P408", labels: { en: { value: "software engine" } } },
        { property: "P1547", labels: {} },
    ], "fr");

    const container = targets.searchResults;
    const rows = bodyRows(tableIn(container));

    t.check("the heading counts them",
        textOf(container.children.find(c => c.tag === "h3")), "Total 3 properties");
    t.check("one row each", rows.length, 3);
    t.check("the order the index gave them is kept",
        rows.map(r => textOf(r.children[0])), ["P348", "P408", "P1547"]);
    t.check("each links to its page here",
        rows[0].children[0].children[0].getAttribute("href"), "property.html?property=P348");

    /*
     * The three states every other listing shows. A reader working in French
     * was shown the English label with nothing to say so, on a tool whose
     * subject is which languages Wikidata has reached.
     */
    t.check("a property named in the language being read reads as itself",
        textOf(rows[0].children[1]), "version du logiciel");
    t.check("and its row is not marked as untranslated",
        rows[0].getAttribute("class"), null);
    t.check("one named only in English says so",
        textOf(rows[1].children[1]), "software engine (not yet in this language)");
    t.check("and its row is marked", rows[1].getAttribute("class"), "untranslatedrow");
    t.check("one named in neither says that instead",
        textOf(rows[2].children[1]), "not in this language");

    /*
     * Wikidata's text is Wikidata's text. The label was assigned through
     * innerHTML, so a label containing a < was markup by the time it was read.
     */
    targets.searchResults = element("div");
    sandbox.createDivSearchProperties("searchResults", [
        { property: "P1", labels: { fr: { value: "<b>not bold</b> & <" } } },
    ], "fr");
    const cell = bodyRows(tableIn(targets.searchResults))[0].children[1];
    t.check("a label is put in as text, not as markup",
        [cell.innerHTML, textOf(cell)], ["", "<b>not bold</b> & <"]);

    /* Rebuilt in place: a second search must not sit under the first. */
    sandbox.createDivSearchProperties("searchResults",
        [{ property: "P2", labels: { fr: { value: "deux" } } }], "fr");
    t.check("a second search replaces the first",
        bodyRows(tableIn(targets.searchResults)).map(r => textOf(r.children[0])), ["P2"]);

    return Promise.resolve();
}

/* ------------------------------------------------------- the whole search */

function wholeSuite() {
    console.log("\n-- End to end --");

    requests = [];
    targets.searchResults = element("div");
    answer = url => (isSearch(url)
        ? hits(offsetOf(url) === 0 ? ["P348", "P408"] : [])
        : entities({
            P348: { en: { value: "software version identifier" } },
            P408: { en: { value: "software engine" } },
        }));

    sandbox.searchProperties("software", "en", "searchResults");

    return settled().then(() => {
        t.check("three requests: two pages of the index, one for the names",
            requests.length, 3);
        t.check("and none of them to the query service",
            requests.filter(u => u.indexOf("query.wikidata.org") !== -1), []);
        t.check("the rows are drawn",
            bodyRows(tableIn(targets.searchResults)).map(r => textOf(r.children[1])),
            ["software version identifier", "software engine"]);

        /* Nothing found says so, and does not ask for names it has not got. */
        requests = [];
        targets.searchResults = element("div");
        answer = () => hits([]);
        sandbox.searchProperties("zzzz", "en", "searchResults");

        return settled().then(() => {
            t.check("nothing found asks for no names", requests.length, 2);
            t.check("and draws no table", tableIn(targets.searchResults), undefined);
        });
    });
}

/* ------------------------------------------------ which language is asked */

function languageSuite() {
    console.log("\n-- The language the results are named in --");

    /*
     * "en" was the default written into findPropertyOnLoad, and again into
     * every example link on this page and on the dashboard. A reader working
     * in French searched in French, read a French interface, and got English
     * labels — on a tool whose subject is which languages Wikidata has been
     * translated into.
     */
    const asked = () => decodeURIComponent(
        /[?&]languages=([^&]*)/.exec(requests.filter(u => !isSearch(u))[0])[1]);

    answer = url => (isSearch(url) ? hits(["P31"]) : entities({ P31: {} }));
    i18n.current = () => "fr";

    /*
     * Each of these is a page opening at a different address. Whether the
     * address named a language is decided once when a page loads, so it is set
     * here alongside the address rather than left over from the last case.
     */
    const visit = search => {
        requests = [];
        written = [];
        targets = {};
        targets.search = element("input");
        targets.searchproject = element("input");
        sandbox.window.location = { pathname: "/search.html", search: search };
        sandbox.wdpropLanguagePinned = sandbox.wdpropLanguageIsPinned(search);
    };

    visit("?search=logiciel");
    sandbox.findPropertyOnLoad();

    return settled().then(() => {
        t.check("with none in the address, the interface language is used", asked(), "fr|en");
        t.check("and the term goes into the field, not the language",
            targets.search.value, "logiciel");

        /*
         * A shared link naming a language means that language, whatever the
         * interface of whoever opens it. That is what makes one worth sending.
         */
        visit("?search=x&language=ta");
        sandbox.findPropertyOnLoad();

        return settled().then(() => {
            t.check("a language in the address wins over the interface", asked(), "ta|en");

            /* And the form, on a page whose address named nothing. */
            visit("");
            targets.search.value = "logiciel";
            sandbox.findProperty({ preventDefault() {} });

            return settled().then(() => {
                t.check("typing into the form asks the same way", asked(), "fr|en");
                i18n.current = () => "en";
            });
        });
    });
}

/* ---------------------------------------------- a link worth sending on */

function bookmarkSuite() {
    console.log("\n-- The address says what is being shown --");

    answer = url => (isSearch(url) ? hits(["P31"]) : entities({ P31: {} }));
    i18n.current = () => "fr";

    const visit = search => {
        requests = [];
        written = [];
        targets = {};
        targets.search = element("input");
        targets.searchproject = element("input");
        sandbox.window.location = { pathname: "/search.html", search: search };
        sandbox.wdpropLanguagePinned = sandbox.wdpropLanguageIsPinned(search);
    };

    /*
     * A search typed into the form never reached the address: the submit is
     * cancelled so the results can be drawn in place, and there was nothing
     * left to bookmark or to send to anyone.
     */
    visit("");
    targets.search.value = "logiciel";
    sandbox.findProperty({ preventDefault() {} });

    return settled().then(() => {
        t.check("a typed search goes into the address",
            written.pop(), "./search.html?search=logiciel&language=fr");

        /* Which is the point: the recipient sees what the sender saw. */
        visit("?search=logiciel");
        sandbox.findPropertyOnLoad();

        return settled().then(() => {
            t.check("a link that named no language is answered and made explicit",
                written.pop(), "./search.html?search=logiciel&language=fr");

            visit("?search=x&language=ta");
            sandbox.findPropertyOnLoad();

            return settled().then(() => {
                t.check("one that named a language keeps the one it named",
                    written.pop(), "./search.html?search=x&language=ta");

                /* uselang was asked for explicitly, so it survives. */
                visit("?search=x&uselang=es");
                sandbox.findPropertyOnLoad();

                return settled().then(() => {
                    t.check("an interface language in the address is kept beside it",
                        written.pop(), "./search.html?search=x&language=fr&uselang=es");

                    /* A project is found by its title, which is one string on
                       Wikidata whatever the interface language. */
                    visit("");
                    targets.searchproject.value = "heritage";
                    sandbox.findWikiProjects({ preventDefault() {} });

                    return settled().then(() => {
                        t.check("a WikiProject search is bookmarkable and needs no language",
                            written.pop(), "./search.html?searchproject=heritage");
                        i18n.current = () => "en";
                    });
                });
            });
        });
    });
}

/* -------------------------------- the two languages are not one question */

function pinningSuite() {
    console.log("\n-- Interface language and language parameter --");

    answer = url => (isSearch(url) ? hits(["P31"]) : entities({ P31: {} }));
    const askedFor = () => decodeURIComponent(
        /[?&]languages=([^&]*)/.exec(requests.filter(u => !isSearch(u)).pop())[1]);
    const change = language => {
        i18n.current = () => language;
        (listeners["wdprop:language"] || []).forEach(fn => fn({ detail: language }));
    };

    const visit = search => {
        requests = [];
        written = [];
        targets = {};
        targets.search = element("input");
        targets.searchproject = element("input");
        sandbox.window.location = { pathname: "/search.html", search: search };
        sandbox.wdpropLanguagePinned = sandbox.wdpropLanguageIsPinned(search);
    };

    /*
     * Nothing in the address said which language, so the labels are in the one
     * being read, and reading in another changes what they should be.
     */
    i18n.current = () => "fr";
    visit("?search=logiciel");
    sandbox.findPropertyOnLoad();

    return settled().then(() => {
        t.check("with no language in the address, the results follow the interface",
            askedFor(), "fr|en");

        requests = [];
        written = [];
        change("es");
        return settled().then(() => {
            t.check("so changing it fetches them again", askedFor(), "es|en");
            t.check("and the address follows",
                written, ["./search.html?search=logiciel&language=es"]);

            /*
             * A link saying language=ta is a link about Tamil however the
             * person opening it has their interface set. That is the whole
             * reason for keeping the two apart, and it is what makes one
             * worth sending.
             */
            i18n.current = () => "fr";
            visit("?search=x&language=ta");
            sandbox.findPropertyOnLoad();

            return settled().then(() => {
                t.check("a language in the address is not the interface's to override",
                    askedFor(), "ta|en");

                requests = [];
                written = [];
                change("es");
                return settled().then(() => {
                    t.check("and changing the interface fetches nothing",
                        requests, []);
                    t.check("and rewrites nothing", written, []);
                    i18n.current = () => "en";
                });
            });
        });
    });
}

/* --------------------------------------------------------- WikiProjects */

function projectSuite() {
    console.log("\n-- The WikiProjects tab --");

    requests = [];
    targets.searchResults = element("div");
    answer = () => ({
        query: {
            search: [
                { title: "Wikidata:WikiProject Cultural heritage" },
                { title: "Wikidata:WikiProject Heritage Collections" },
                /* The index page listing the projects, and the bare prefix:
                   neither is a project. */
                { title: "Wikidata:WikiProjects" },
                { title: "Wikidata:WikiProject" },
            ],
        },
    });

    sandbox.searchWikiProjects("heritage", "searchResults");

    return settled().then(() => {
        t.check("one request", requests.length, 1);
        t.check("a title search in the project namespace",
            decodeURIComponent(requests[0]).indexOf("srsearch=intitle:WikiProject intitle:heritage") !== -1 &&
            requests[0].indexOf("srnamespace=4") !== -1, true);
        t.check("the projects are drawn, and the two that are not are left out",
            bodyRows(tableIn(targets.searchResults)).map(r => textOf(r.children[0])),
            ["Cultural heritage", "Heritage Collections"]);
    });
}

/* ------------------------------------------------------------------- live */

function liveSuite() {
    /*
     * Through t.live, so that being refused counts as a skip. Written without
     * it, this section failed a run on a 429 — Wikidata rate-limits by
     * address, and a CI runner's address is shared with whatever else was
     * asking a minute earlier — and it reached the network even on a pull
     * request, where WDPROP_OFFLINE is set to keep it from doing so.
     */
    return t.live("the search that took a minute", async () => {
        const started = Date.now();
        /*
         * Named, as Wikimedia asks a client to be. A request that does not say
         * what it is gets the shortest rope of all, and this one goes out from
         * a CI runner whose address is shared with everything else on it.
         */
        const response = await fetch(sandbox.propertySearchUrl("software", 0), {
            headers: { "User-Agent": "WDProp test suite (https://github.com/johnsamuelwrites/WDProp)" },
        });
        if (!response.ok) {
            throw new Error("Wikidata answered " + response.status);
        }

        const json = await response.json();
        const elapsed = Date.now() - started;
        const found = (json.query && json.query.search) || [];
        if (!found.length) {
            throw new Error("the index returned nothing");
        }

        t.check("the index answers with properties",
            found.every(hit => /^Property:P\d+$/.test(hit.title)), true);
        /*
         * The SPARQL it replaced took 58 seconds for this term, and three
         * tenths of a second is what this usually takes. Ten is far above
         * anything measured, including from a loaded runner, and far enough
         * below 58 that a return to scanning labels fails here rather than in
         * front of someone.
         */
        t.check("in under ten seconds", elapsed < 10000, true);
        t.note(`${found.length} properties for "software" in ${elapsed} ms, ` +
            `of ${json.query.searchinfo.totalhits} the index has`);
    });
}

requestSuite()
    .then(siftingSuite)
    .then(failureSuite)
    .then(labelSuite)
    .then(renderSuite)
    .then(wholeSuite)
    .then(languageSuite)
    .then(bookmarkSuite)
    .then(pinningSuite)
    .then(projectSuite)
    .then(liveSuite)
    .then(() => process.exit(t.done()));
