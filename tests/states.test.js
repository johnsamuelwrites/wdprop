/*
 * What a section shows when its query is running, finds nothing, or fails.
 *
 * Every section of every page is filled by one query, and only the happy path
 * used to be accounted for: a query returning no rows left an empty box that
 * looked exactly like one still loading, and a failing query left the spinner
 * turning for good, because nothing caught the rejection. These check all
 * three outcomes, and that asking again works.
 *
 * wdprop.js is run in a vm with a stub DOM and a fetch under the test's
 * control, so no network is involved.
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
        insertBefore(c, ref) {
            const at = ref ? this.children.indexOf(ref) : -1;
            if (at === -1) this.children.push(c); else this.children.splice(at, 0, c);
            c.parentNode = this;
            return c;
        },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
        querySelectorAll(sel) {
            const out = [];
            (function walk(x) {
                for (const c of x.children || []) { if (c.tag === sel) out.push(c); walk(c); }
            })(this);
            return out;
        },
        get firstChild() { return this.children[0] || null; },
        get nextSibling() {
            const siblings = this.parentNode ? this.parentNode.children : [];
            return siblings[siblings.indexOf(this) + 1] || null;
        },
        get textContent() {
            return this.children.map(c => (c.text !== undefined ? c.text : c.textContent)).join("");
        },
        /* Setting it replaces the children, as a real element does. */
        set textContent(value) {
            this.children = [];
            this.appendChild({ text: String(value) });
        },
        /* Every element in the subtree carrying a given class. */
        find(className) {
            const out = [];
            (function walk(x) {
                for (const c of x.children || []) {
                    if ((c.getAttribute && c.getAttribute("class") || "").split(" ").includes(className)) out.push(c);
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

let target = node("div");
let answer = null;          // what the next fetch resolves or rejects with
const requests = [];

const sandbox = {
    console, setTimeout, clearTimeout,
    window: {
        location: { pathname: "/languages.html", search: "" },
        matchMedia: () => ({ matches: false }),
        WDProp: { i18n: { t: (key, params) => {
            let s = key in english ? english[key] : key;
            (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
            return s;
        } } },
        addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "en" },
    document: {
        readyState: "loading",
        body: node("body"), documentElement: node("html"), currentScript: null,
        getElementById: id => (id === "languages" ? target : null),
        createElement: node,
        createTextNode: t => ({ text: String(t) }),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {},
    },
    fetch: (url) => { requests.push(url); return answer(); },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
/*
 * pager.js first, as the pages load it: it puts the previous/next control on
 * WDProp, and wdprop.js reaches for it the moment a table is long enough.
 */
vm.runInContext(fs.readFileSync(path.join(ROOT, "ready.js"), "utf8"), sandbox, { filename: "ready.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "pager.js"), "utf8"), sandbox, { filename: "pager.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "wdprop.js"), "utf8"), sandbox, { filename: "wdprop.js" });

const s = suite("query states");

/* Lets the fetch chain settle. */
const flush = () => new Promise(r => setImmediate(r)).then(() => new Promise(r => setImmediate(r)));

const ok = json => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
const status = code => () => Promise.resolve({ ok: false, status: code, statusText: "" });
const offline = () => () => Promise.reject(new TypeError("Failed to fetch"));

const rows = n => ({ head: { vars: ["x"] }, results: { bindings: Array(n).fill({ x: { value: "v" } }) } });

let rendered = 0;
const render = () => { rendered++; };

/* Runs a query and returns the section once everything has settled. */
async function run(response) {
    target = node("div");
    rendered = 0;
    requests.length = 0;
    answer = response;
    sandbox.queryWikidata("SELECT ?x {}", render, "languages");
    const duringRequest = target.find("wdp-skeleton").length;
    await flush();
    return { duringRequest, rendered, target };
}

(async () => {
    console.log("\n-- While the query is running --");
    let r = await run(ok(rows(3)));
    s.check("a placeholder is shown at once", r.duringRequest, 1);

    console.log("\n-- Results --");
    s.check("the section is rendered", r.rendered, 1);
    s.check("and the placeholder is gone", r.target.find("wdp-skeleton").length, 0);

    console.log("\n-- Nothing found --");
    r = await run(ok(rows(0)));
    s.check("it says so", r.target.find("wdp-empty").length, 1);
    s.check("rather than leaving an empty box", r.target.textContent,
        "Nothing found for this query.");
    s.check("and nothing is rendered", r.rendered, 0);

    console.log("\n-- The query failed --");
    r = await run(status(429));
    s.check("the failure is shown", r.target.find("wdp-query-error").length, 1);
    s.check("with the status in it", r.target.textContent.includes("429"), true);
    s.check("announced without waiting for focus",
        r.target.firstChild.getAttribute("role"), "alert");
    s.check("nothing is rendered", r.rendered, 0);
    s.check("and the placeholder does not turn for ever",
        r.target.find("wdp-skeleton").length, 0);

    console.log("\n-- No network at all --");
    r = await run(offline());
    s.check("that is a failure too", r.target.find("wdp-query-error").length, 1);
    s.check("worded without a status", r.target.textContent,
        "Could not load this section — no answer from the server" + "Try again");

    console.log("\n-- Asking again --");
    r = await run(status(503));
    const retry = r.target.find("wdp-button")[0];
    s.check("a failure offers it", retry !== undefined, true);
    s.check("it is a button, not a link", retry.tag, "button");
    answer = ok(rows(2));
    retry.listeners.click[0]();
    await flush();
    s.check("using it asks again", requests.length, 2);
    s.check("and the results replace the failure", r.target.find("wdp-query-error").length, 0);
    s.check("the section is rendered this time", rendered, 1);

    /*
     * A language missing translations for thousands of properties used to
     * render every one of them into a single table.
     */
    console.log("\n-- Paging a long table --");

    /* Builds a table the way the render functions do: a heading row, then rows. */
    function table(dataRows) {
        const t = node("table");
        const head = node("tr");
        head.appendChild(node("th"));
        t.appendChild(head);
        for (let i = 0; i < dataRows; i++) {
            const row = node("tr");
            row.appendChild(node("td"));
            t.appendChild(row);
        }
        return t;
    }

    function paged(dataRows) {
        const section = node("div");
        const t = table(dataRows);
        section.appendChild(t);
        sandbox.wdpropPaginate(section);
        const rows = t.children.filter(row => row.children[0].tag === "td");
        return {
            section, rows,
            heading: t.children[0],
            pager: section.find("wdp-pager")[0],
            visible: () => rows.filter(row => row.style.display !== "none").length,
        };
    }

    let p = paged(50);
    s.check("a table that fits is left alone", p.pager, undefined);
    s.check("with every row showing", p.visible(), 50);

    p = paged(120);
    s.check("a longer one is paged", p.pager !== undefined, true);
    s.check("showing the first page", p.visible(), 50);
    s.check("the heading row is never hidden", p.heading.style.display, undefined);
    s.check("it says where you are",
        p.pager.find("wdp-pager-position")[0].textContent,
        "Page 1 of 3 — showing 50 of 120 rows");
    s.check("the pager goes after the table", p.section.children.indexOf(p.pager), 1);

    const [back, forward] = [p.pager.children[0], p.pager.children[2]];
    s.check("there is nowhere back from the first page", back.disabled, true);
    s.check("but there is somewhere forward", forward.disabled, false);

    forward.listeners.click[0]();
    s.check("the next page shows the next rows", p.visible(), 50);
    s.check("which are not the first ones", p.rows[0].style.display, "none");
    s.check("and it says so",
        p.pager.find("wdp-pager-position")[0].textContent,
        "Page 2 of 3 — showing 100 of 120 rows");
    s.check("going back is now possible", back.disabled, false);

    forward.listeners.click[0]();
    s.check("the last page holds the remainder", p.visible(), 20);
    s.check("counted honestly",
        p.pager.find("wdp-pager-position")[0].textContent,
        "Page 3 of 3 — showing 120 of 120 rows");
    s.check("and there is nowhere further", forward.disabled, true);

    forward.listeners.click[0]();
    s.check("pressing on does not run past the end", p.visible(), 20);

    /* The classes and WikiProjects pages virtualise their own table instead. */
    const hidden = node("div");
    hidden.style.display = "none";
    hidden.appendChild(table(500));
    sandbox.wdpropPaginate(hidden);
    s.check("a table the page has hidden is left alone", hidden.find("wdp-pager").length, 0);

    process.exit(s.done());
})();
