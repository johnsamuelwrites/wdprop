/*
 * The dashboard.
 *
 * It is the landing page, and it used to state things it had not checked: the
 * service panel said "Online" with a green dot whether or not either service
 * had been asked, and every widget carried a specimen figure in the markup —
 * 12,847 properties, English 98%, P31 with 89.2M uses — which stayed on
 * screen, looking authoritative, whenever the query behind it failed.
 *
 * These check that nothing is shown that was not fetched, that a failure says
 * so, and that the most used properties come out in rank order: they used to
 * be appended as each label arrived, so the ranks read #3, #1, #5 down the
 * page depending on the network.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

function node(tag) {
    return {
        tag, tagName: String(tag).toUpperCase(),
        children: [], attrs: {}, style: {}, listeners: {}, text: undefined,
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        get firstChild() { return this.children[0] || null; },
        get textContent() {
            return this.children.map(c => (c.text !== undefined ? c.text : c.textContent)).join("");
        },
        set textContent(value) {
            this.children = [];
            if (value !== "") this.appendChild({ text: String(value) });
        },
        find(className) {
            const out = [];
            (function walk(x) {
                for (const c of x.children || []) {
                    const cls = (c.getAttribute && c.getAttribute("class")) || "";
                    if (cls.split(" ").includes(className)) out.push(c);
                    walk(c);
                }
            })(this);
            return out;
        },
    };
}

const english = {};
global.WDProp = { i18n: { add: (lang, d) => Object.assign(english, d) } };
require(path.join(ROOT, "i18n", "en.js"));

const elements = {};
let answer = null;
let requests = [];
/* Listeners dashboard.js registered on the document. */
let handlers = {};

/*
 * A fresh context for each run: dashboard.js declares its constants with
 * const, so the same context cannot be given the file twice.
 */
function context() {
    const sandbox = {
        console: { log() {}, error() {} },
        /*
         * Never fires synchronously — no browser does, and the callback names
         * the handle setInterval is about to return. Then runs to completion,
         * so the counter reaches its figure within the test.
         */
        setInterval: (fn) => {
            const handle = { live: true };
            setImmediate(() => { for (let i = 0; i < 10000 && handle.live; i++) fn(); });
            return handle;
        },
        clearInterval: (handle) => { if (handle) handle.live = false; },
        setTimeout: () => 0,
        /*
         * Programmable, because the coverage figures are kept here for a day:
         * the query behind them takes twenty seconds, which is longer than a
         * dashboard gets looked at. `store` is set per case.
         */
        localStorage: {
            getItem: key => (key in store ? store[key] : null),
            setItem(key, value) { store[key] = String(value); },
        },
        window: {
            WDProp: {
                i18n: { t: (key, params) => {
                    let s = key in english ? english[key] : key;
                    (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
                    return s;
                } },
                usage: {
                    counts: () => Promise.resolve({ P31: 118879567 }),
                    format: n => (n >= 1000000 ? Math.round(n / 1000000) + "M" : String(n)),
                },
                /*
                 * actions.js is loaded before dashboard.js on every page, so
                 * the registry is there by the time this registers the handler
                 * behind the four cards at the top.
                 */
                actions: { add() {} },
                /* readyState is "complete" here, so ready() runs at once. */
                ready: fn => fn(),
            },
            /* Nobody has asked for less movement, so the counter animates. */
            matchMedia: () => ({ matches: false }),
        },
        document: {
            readyState: "complete",
            getElementById: id => elements[id] || null,
            createElement: node,
            createTextNode: t => ({ text: String(t) }),
            querySelector: () => null,
            querySelectorAll: () => [],
            /* Kept, so a case can fire the language change i18n.js announces. */
            addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
            head: node("head"),
        },
        fetch: (url) => { requests.push(url); return answer(url); },
    };
    sandbox.WDProp = sandbox.window.WDProp;
    sandbox.globalThis = sandbox;
    return vm.createContext(sandbox);
}

const source = fs.readFileSync(path.join(ROOT, "dashboard.js"), "utf8");

const s = suite("dashboard");
const flush = async () => {
    for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
};

/* What localStorage holds for the case being run. */
let store = {};

/*
 * Rebuilds the page and runs dashboard.js against a given set of answers.
 * Opens a fresh browser each time — an empty store — unless `keep` says to
 * carry what the last one wrote, which is how a second visit is tested.
 */
function load(responder, keep) {
    if (!keep) {
        store = {};
    }
    for (const id of ["statProperties", "statLanguages", "statDatatypes", "statClasses",
        "translationProgress", "topProperties", "serviceStatus"]) {
        elements[id] = node(id === "topProperties" ? "table" : "div");
    }
    requests = [];
    handlers = {};
    answer = responder;
    vm.runInContext(source, context(), { filename: "dashboard.js" });
}

const COVERAGE_KEY = "wdprop-dashboard-coverage";
const HOUR = 60 * 60 * 1000;

const ok = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const refused = () => Promise.resolve({ ok: false, status: 429, statusText: "" });

const count = n => ({ results: { bindings: [{ count: { value: String(n) } }] } });
const coverage = { results: { bindings: [{
    total: { value: "12000" },
    n_en: { value: "11880" }, n_de: { value: "9720" }, n_fr: { value: "9120" },
    n_es: { value: "8640" }, n_ja: { value: "5160" },
}] } };
const report = { query: { pages: { 1: { links: [
    { title: "Property:P31" }, { title: "Property:P279" }, { title: "Property:P17" },
    { title: "Property:P131" }, { title: "Property:P856" }, { title: "Property:P" },
] } } } };

/* Labels come back in an order that is not rank order, as the network may. */
const labels = { results: { bindings: [
    { property: { value: "http://www.wikidata.org/entity/P17" }, label: { value: "country" } },
    { property: { value: "http://www.wikidata.org/entity/P31" }, label: { value: "instance of" } },
    { property: { value: "http://www.wikidata.org/entity/P856" }, label: { value: "official website" } },
] } };

function everythingWorks(url) {
    if (url.includes("w/api.php")) return ok(report);
    if (url.includes("VALUES")) return ok(labels);
    if (url.includes("n_en")) return ok(coverage);
    return ok(count(12345));
}

(async () => {
    console.log("\n-- Nothing is shown that was not fetched --");
    const markup = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    s.check("no specimen figure is left in the markup",
        /data-target|89\.2M|45\.7M|>\s*98%|2 minutes ago/.test(markup), false);
    s.check("nor a status claimed before anything was asked",
        /status-dot"><\/span>\s*Online/.test(markup), false);

    console.log("\n-- When everything answers --");
    load(everythingWorks);
    await flush();
    s.check("the counted figure is shown", elements.statProperties.textContent, "12,345");
    s.check("coverage is listed for five languages",
        elements.translationProgress.find("progress-item").length, 5);
    s.check("as a percentage of the total counted",
        elements.translationProgress.find("progress-value")[0].textContent, "99%");
    s.check("named in the interface language",
        elements.translationProgress.find("progress-label")[0].textContent, "English (en)");

    console.log("\n-- The most used properties --");
    s.check("five rows", elements.topProperties.children.length, 5);
    s.check("in rank order, whatever order the labels arrived in",
        elements.topProperties.children.map(row => row.find("property-id")[0].textContent),
        ["P31", "P279", "P17", "P131", "P856"]);
    s.check("ranked from one", elements.topProperties.find("rank").map(c => c.textContent),
        ["#1", "#2", "#3", "#4", "#5"]);
    s.check("labelled where a label was returned",
        elements.topProperties.find("property-name")[0].textContent, "instance of");
    s.check("and by identifier where none was",
        elements.topProperties.find("property-name")[1].textContent, "P279");

    /* The column is headed by a usage count; it used to repeat the rank. */
    s.check("the usage column holds a real figure",
        elements.topProperties.find("usage-count")[0].textContent, "119M");
    s.check("and is empty rather than invented where none is known",
        elements.topProperties.find("usage-count")[1].textContent, "");

    console.log("\n-- Service status reports what happened --");
    let status = elements.serviceStatus.find("status-value").map(v => v.textContent);
    s.check("both services answered", status.slice(0, 2), ["answering", "answering"]);
    s.check("and the figures are dated", status[2], "just now");

    console.log("\n-- When the query service refuses --");
    load(url => (url.includes("w/api.php") ? ok(report) : refused()));
    await flush();
    s.check("the figure is not invented", elements.statProperties.textContent, "—");
    s.check("nor reported as none", elements.statProperties.textContent === "0", false);
    s.check("the reason is offered",
        elements.statProperties.getAttribute("title"), "This could not be counted just now.");
    s.check("coverage says it could not be loaded",
        elements.translationProgress.textContent, "This could not be loaded just now.");

    status = elements.serviceStatus.find("status-value").map(v => v.textContent);
    s.check("the query service is reported as not answering", status[0], "not answering");
    s.check("while MediaWiki, which did answer, is not", status[1], "answering");
    s.check("and its dot says the same thing as the words",
        elements.serviceStatus.find("status-dot").map(d => d.getAttribute("class")),
        ["status-dot error", "status-dot"]);

    console.log("\n-- When nothing answers --");
    load(refused);
    await flush();
    status = elements.serviceStatus.find("status-value").map(v => v.textContent);
    s.check("neither service is claimed to be up",
        status.slice(0, 2), ["not answering", "not answering"]);
    s.check("and no figures are dated", status[2], "nothing yet");
    s.check("the property list says so too",
        elements.topProperties.textContent, "This could not be loaded just now.");

    console.log("\n-- Labels are Wikidata's text, not markup --");
    load(url => {
        if (url.includes("w/api.php")) return ok(report);
        if (url.includes("VALUES")) return ok({ results: { bindings: [{
            property: { value: "http://www.wikidata.org/entity/P31" },
            label: { value: "<img src=x onerror=alert(1)>" },
        }] } });
        if (url.includes("n_en")) return ok(coverage);
        return ok(count(1));
    });
    await flush();
    const named = elements.topProperties.find("property-name")[0];
    s.check("a label is written as text", named.textContent, "<img src=x onerror=alert(1)>");
    s.check("so it cannot bring elements with it", named.children.every(c => c.text !== undefined), true);

    /*
     * The coverage query is 20 seconds against the live service, and there is
     * no faster way to ask it: labels are not indexed, so each count is a
     * scan. A dashboard is the page nobody waits on, so the figures are kept
     * for a day.
     */
    console.log("\n-- The coverage figures are kept --");
    load(everythingWorks);
    await flush();
    s.check("with nothing kept, they are asked for",
        requests.filter(u => u.includes("n_en")).length, 1);
    s.check("and what came back is kept", COVERAGE_KEY in store, true);
    const kept = JSON.parse(store[COVERAGE_KEY]);
    s.check("as the counts, not as the answer that carried them",
        [kept.total, kept.counts.en, kept.counts.ja], [12000, 11880, 5160]);

    load(everythingWorks, true);
    await flush();
    s.check("kept figures are not asked for again the same day",
        requests.filter(u => u.includes("n_en")).length, 0);
    s.check("and are shown all the same",
        elements.translationProgress.find("progress-value")[0].textContent, "99%");
    s.check("saying when they are from",
        elements.translationProgress.find("progress-asof")[0].textContent, "Figures from just now");

    /* Yesterday's are still drawn at once; the fresh ones replace them. */
    store[COVERAGE_KEY] = JSON.stringify(
        { total: 12000, counts: { en: 6000, de: 0, fr: 0, es: 0, ja: 0 }, at: Date.now() - 25 * HOUR });
    load(everythingWorks, true);
    s.check("a day-old figure is drawn before anything is asked",
        elements.translationProgress.find("progress-value")[0].textContent, "50%");
    await flush();
    s.check("and is refreshed behind it",
        requests.filter(u => u.includes("n_en")).length, 1);
    s.check("leaving the figure that arrived",
        elements.translationProgress.find("progress-value")[0].textContent, "99%");
    s.check("with no date under it, having just been fetched",
        elements.translationProgress.find("progress-asof").length, 0);

    /*
     * Kept figures beat a failure message: they are what the reader came for,
     * and the line under them says how old they are.
     */
    store[COVERAGE_KEY] = JSON.stringify(
        { total: 12000, counts: { en: 6000, de: 0, fr: 0, es: 0, ja: 0 }, at: Date.now() - 25 * HOUR });
    load(refused, true);
    await flush();
    s.check("a refused refresh leaves the kept figures on screen",
        elements.translationProgress.find("progress-value")[0].textContent, "50%");
    s.check("dated, so nobody reads them as current",
        elements.translationProgress.find("progress-asof").length, 1);

    /* Half-written, or written by an older version of this file. */
    store[COVERAGE_KEY] = "{\"total\":0}";
    load(everythingWorks, true);
    await flush();
    s.check("an unusable cache is asked past, not shown",
        [requests.filter(u => u.includes("n_en")).length,
         elements.translationProgress.find("progress-value")[0].textContent], [1, "99%"]);

    store[COVERAGE_KEY] = "not json";
    load(everythingWorks, true);
    await flush();
    s.check("and so is one that cannot be read at all",
        requests.filter(u => u.includes("n_en")).length, 1);

    /*
     * Best served first. COVERAGE_LANGUAGES is written in an order that suits
     * reading the file — English, German, French, Spanish, Japanese — and the
     * list came out in it whatever the figures said. French has some three
     * thousand more property labels than German, so the bars went up and then
     * down again, which is the one thing a row of bars is read for.
     */
    console.log("\n-- The coverage list is in order --");
    load(url => {
        if (url.includes("w/api.php")) return ok(report);
        if (url.includes("VALUES")) return ok(labels);
        if (url.includes("n_en")) return ok({ results: { bindings: [{
            total: { value: "100" },
            n_en: { value: "100" }, n_de: { value: "56" }, n_fr: { value: "79" },
            n_es: { value: "43" }, n_ja: { value: "39" },
        }] } });
        return ok(count(100));
    });
    await flush();
    s.check("the best served language first, whatever order they are declared in",
        elements.translationProgress.find("progress-value").map(v => v.textContent),
        ["100%", "79%", "56%", "43%", "39%"]);
    s.check("and each is named beside its own figure",
        elements.translationProgress.find("progress-label").map(v => v.textContent),
        ["English (en)", "French (fr)", "German (de)", "Spanish (es)", "Japanese (ja)"]);

    /*
     * None of this widget carries data-i18n: the language names, the service
     * words and the line saying when the figures are from are built here, from
     * messages looked up at the moment they were built. That moment is usually
     * before the language has arrived — every message file but English is
     * fetched by a script tag — so a French page drew its dashboard in English
     * and never revisited it. "Figures from" stayed English for that reason.
     */
    console.log("\n-- Drawn again when the language changes --");
    /* Opened again, so the figures come from store and carry their date. */
    load(everythingWorks, true);
    await flush();
    english["dash.lastUpdated"] = "Chiffres de";
    english["lang.en"] = "anglais";
    requests = [];
    handlers["wdprop:language"].forEach(fn => fn({ detail: "fr" }));
    s.check("the line saying when the figures are from is retranslated",
        elements.translationProgress.find("progress-asof").length === 0
            ? "no line"
            : elements.translationProgress.find("progress-asof")[0].textContent,
        "Chiffres de just now");
    s.check("and so are the language names",
        elements.translationProgress.find("progress-label")[0].textContent, "anglais (en)");
    s.check("without asking Wikidata for figures it already has", requests, []);

    process.exit(s.done());
})();
