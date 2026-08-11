/*
 * createDivPropertyTable — the one renderer behind every listing of
 * properties, and the fetching that fills it.
 *
 * It replaced a wall of chips that carried a P-number and nothing else, and
 * that was wrong in three ways this suite pins down:
 *
 *   - it cut the list at a hundred rows while the heading counted them all,
 *     so a datatype holding ten thousand properties announced ten thousand
 *     and drew a hundred with nothing to say so;
 *   - it cut the wrong hundred, walking the property number space from P1 and
 *     taking the first hundred it recognised, which discarded the order the
 *     query had asked for;
 *   - it could not say what a property was, and the query behind it did not
 *     ask, so a translator saw P4765 and had to open it to learn anything.
 *
 * The third could not be fixed by widening the query. Asked of the query
 * service for its labels and descriptions, the whole external-identifier
 * datatype is four and a half megabytes and twenty seconds, and a reader sees
 * fifty rows of it. So the query returns identifiers, and the terms are
 * fetched from the entity API for the rows on show — which is also the only
 * way to learn whether a label exists in one particular language, the query
 * service's label service having already fallen back to English by the time
 * anyone can look.
 *
 * The file is loaded in a vm with a stub DOM, as wdprop.test.js does, so the
 * rendering can be read without a browser, and fetch is a dispatcher the tests
 * program per case.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("property tables");

/* ------------------------------------------------------------------ set-up */

/*
 * i18n/en.js registers its messages through WDProp.i18n.add, so a stand-in for
 * that has to exist as a global before the file is required. The real messages
 * are used rather than fixtures, so a heading whose text this suite asserts on
 * is the heading the application actually renders.
 */
const dict = {};
const i18n = {
    add: (lang, d) => { if (lang === "en") Object.assign(dict, d); },
    t: (key, params) => {
        let s = dict[key];
        if (s === undefined) return key;
        (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
        return s;
    },
    current: () => "ta",
};

global.window = global.window || {};
global.window.WDProp = { i18n: i18n };
global.WDProp = global.window.WDProp;
require(ROOT + "/i18n/en.js");

let targets = {};

/*
 * Requests are recorded and answered by whatever the running test installed.
 * Nothing here reaches the network.
 */
let requests = [];
let answer = () => ({});

function fetchStub(url) {
    requests.push(url);
    const body = answer(url);
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    });
}

const sandbox = {
    console,
    window: {
        location: { search: "" },
        matchMedia: () => ({ matches: false }),
        WDProp: null,
        addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "ta" },
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
        addEventListener() {},
    },
    fetch: fetchStub,
};
sandbox.globalThis = sandbox;
sandbox.window.WDProp = { i18n: i18n };
vm.createContext(sandbox);
for (const file of ["ready.js", "wdprop.js", "pager.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
/* pager.js is real, not a stub: paging is what the filter has to rebuild. */
sandbox.window.WDProp.i18n = i18n;

/* ----------------------------------------------------------------- fixtures */

const ENTITY = "http://www.wikidata.org/entity/";

/* What the listing queries now return: identifiers, and nothing else. */
function answerOf(ids) {
    return {
        head: { vars: ["property"] },
        results: { bindings: ids.map(id => ({ property: { value: ENTITY + id } })) },
    };
}

/* What wbgetentities returns for one property. */
function entity(id, terms) {
    const labels = {};
    const descriptions = {};
    if (terms.ta) labels.ta = { language: "ta", value: terms.ta };
    if (terms.en) labels.en = { language: "en", value: terms.en };
    if (terms.desc) descriptions.en = { language: "en", value: terms.desc };
    return { id, labels, descriptions };
}

function entities(list) {
    const map = {};
    for (const e of list) map[e.id] = e;
    return { entities: map };
}

function render(ids, id) {
    const divId = id || "target";
    targets[divId] = element("div");
    const records = sandbox.createDivPropertyTable(divId, answerOf(ids));
    return { container: targets[divId], records };
}

function tableIn(container) {
    return container.children.find(c => c.tag === "table");
}

function bodyRows(table) {
    return table.children.filter(c => c.tag === "tr" && c.children[0].tag === "td");
}

/*
 * The text of a node and everything under it. The shared stub's textContent
 * stops at the first level — a #text inside an <a> inside a <td> comes back
 * empty — and it does not see innerHTML, which the headings are built with.
 */
function textOf(node) {
    if (!node) return "";
    if (node.text) return node.text;
    return (node.innerHTML || "") + node.children.map(textOf).join("");
}

function cellText(row, index) {
    return row.children[index] ? textOf(row.children[index]) : null;
}

/* Lets the promise chains inside a fill function settle. */
function settled() {
    return new Promise(resolve => setImmediate(resolve));
}

/* ------------------------------------------------- every row is rendered */

{
    const many = [];
    for (let i = 1; i <= 213; i++) many.push("P" + i);

    const { container, records } = render(many);
    const body = bodyRows(tableIn(container));

    t.check("every property is a row, not the first hundred", body.length, 213);
    t.check("and every one is returned to the caller", records.length, 213);
    t.check("the heading counts what is shown",
        textOf(container.children.find(c => c.tag === "h3")), "Total 213 properties");
}

/* --------------------------------------------- the query's order is kept */

{
    /*
     * Reversed with respect to the property number, which is the order the old
     * renderer imposed by walking the number space from P1. A query that asks
     * for the most used property first must have that row first.
     */
    const { container } = render(["P300", "P20", "P1"]);
    const body = bodyRows(tableIn(container));

    t.check("rows keep the order the query returned",
        body.map(r => cellText(r, 0)), ["P300", "P20", "P1"]);
    t.check("and each identifier links to its property page",
        body[0].children[0].children[0].getAttribute("href"),
        "property.html?property=P300");
}

/* ------------------------------------------------ only what is on show */

{
    /*
     * The whole point of the rework. A listing of ten thousand properties must
     * not fetch ten thousand sets of terms to show fifty rows.
     */
    requests = [];
    answer = () => entities([]);

    const many = [];
    for (let i = 1; i <= 500; i++) many.push("P" + i);

    const { container } = render(many);
    const table = tableIn(container);
    const body = bodyRows(table);

    t.check("nothing is fetched merely by rendering", requests.length, 0);

    /* wdpropPaginateTable hands the rows of each page to the table's hook. */
    sandbox.wdpropRowsShown(table, body.slice(0, 50));

    t.check("one request covers the page", requests.length, 1);
    t.check("it asks the entity API", requests[0].indexOf("wbgetentities") !== -1, true);
    t.check("for the fifty properties on show, and no others",
        decodeURIComponent(requests[0]).indexOf("ids=" +
            many.slice(0, 50).join("|")) !== -1, true);
    t.check("in the language being worked in, with English behind it",
        decodeURIComponent(requests[0]).indexOf("languages=ta|en") !== -1, true);
    t.check("and asks only for the terms it shows",
        decodeURIComponent(requests[0]).indexOf("props=labels|descriptions") !== -1, true);
}

/* ------------------------------------------------------- the three states */

{
    /*
     * The trap the entity API is here to avoid. The query service's label
     * service falls back to English, so a property with an English label and
     * nothing in the target language comes back fully named — asked for the
     * external identifiers in Tamil it names all ten thousand, of which
     * exactly one has a Tamil label. Judging by that label would report the
     * whole datatype as done.
     */
    requests = [];
    answer = () => entities([
        entity("P214", { ta: "VIAF அடையாளம்", en: "VIAF cluster ID", desc: "identifier" }),
        entity("P212", { en: "ISBN-13", desc: "identifier for a book" }),
    ]);

    const { container } = render(["P214", "P212", "P999"]);
    const table = tableIn(container);
    const body = bodyRows(table);

    sandbox.wdpropRowsShown(table, body);

    settled().then(() => {
        t.check("a property named in the target language shows that name",
            cellText(body[0], 1), "VIAF அடையாளம்");
        t.check("and is not marked", body[0].getAttribute("class"), null);

        t.check("one named only in English shows the English, so the row reads",
            cellText(body[1], 1), "ISBN-13 (not yet in this language)");
        t.check("but still counts as needing translation",
            body[1].getAttribute("class"), "untranslatedrow");

        t.check("and one named in neither says so outright",
            cellText(body[2], 1), "not in this language");
        t.check("and is marked too",
            body[2].getAttribute("class"), "untranslatedrow");

        t.check("descriptions are filled from the same answer",
            cellText(body[1], 2), "identifier for a book");

        /* Paging back to rows already filled must not ask again. */
        requests = [];
        sandbox.wdpropRowsShown(table, body);
        t.check("filled rows are not fetched a second time", requests.length, 0);

        return usageSuite();
    }).then(() => countSuite())
      .then(() => classesSuite())
      .then(() => filterSuite())
      .then(() => process.exit(t.done()));
}

/* -------------------------------------------- usage is fetched per page */

function usageSuite() {
    /*
     * Usage cannot come from the listing query either: wikibase:statements
     * counts the statements on a property's own page, not the statements that
     * use it — P2860 is the most used property on Wikidata and carries 27.
     */
    let asked = [];
    sandbox.window.WDProp.usage = {
        counts: ids => { asked.push(ids.slice()); return Promise.resolve({ P18: 4200000 }); },
        format: n => (n >= 1000000 ? Math.round(n / 1000000) + "M" : String(n)),
    };

    answer = () => entities([]);

    const { container } = render(["P18", "P4765"]);
    const table = tableIn(container);
    const head = table.children.find(c => c.tag === "tr");

    t.check("a usage column appears when usage.js is present",
        head.children[head.children.length - 1].innerHTML, "Used by");

    const body = bodyRows(table);
    sandbox.wdpropRowsShown(table, body);

    t.check("only the rows handed over are asked for", asked, [["P18", "P4765"]]);

    return settled().then(() => {
        t.check("a count that was read is shown", cellText(body[0], 3), "4M");
        t.check("one that was not is not shown as zero",
            cellText(body[1], 3), "unavailable");
        delete sandbox.window.WDProp.usage;
    });
}

/* ------------------------------- the count over the whole set, and the offer */

function countSuite() {
    /*
     * How many of a listing's properties still need translating is the one
     * thing a page of rows cannot answer, and it is what makes the page
     * actionable. It is asked as a count — a few hundred bytes over the whole
     * set — and appended to the heading when it arrives.
     */
    sandbox.window.location.search = "?datatype=wikibase:CommonsMedia&language=ta";

    const divId = "propertiesWithDatatype";
    requests = [];
    answer = () => ({ results: { bindings: [{ untranslated: { value: "70" } }] } });

    const { container } = render(["P18"], divId);
    sandbox.wdpropOfferToWorkbench(divId);

    /*
     * The offer stands on its own. Counting the untranslated properties of a
     * large datatype took seventy seconds on a cold cache against two for the
     * listing, so the way out of the page must not wait on it.
     */
    const offerBefore = container.children.find(c => c.tag === "p").children[0];
    t.check("the workbench is offered before any count arrives",
        textOf(offerBefore), "Translate what is missing");
    t.check("and links to the right place already",
        offerBefore.getAttribute("href"),
        "translate.html?datatype=wikibase%3ACommonsMedia&target=ta");

    sandbox.wdpropCountUntranslated(divId, "  ?property a wikibase:Property.");

    const query = decodeURIComponent(requests[0]);
    t.check("the count excludes what already has a label in that language",
        query.indexOf('FILTER NOT EXISTS { ?property rdfs:label ?t FILTER (lang(?t) = "ta") }') !== -1,
        true);
    t.check("over the same selection the table lists",
        query.indexOf("?property a wikibase:Property.") !== -1, true);

    return settled().then(() => {
        t.check("the heading gains the figure once it is known",
            textOf(container.children.find(c => c.tag === "h3")),
            "Total 1 properties — 70 without a label in this language");

        t.check("and the offer gains the figure, so the work is sized",
            textOf(container.children.find(c => c.tag === "p").children[0]),
            "Translate these 70");

        /* A count of nothing means nothing is left: no figure to add. */
        requests = [];
        answer = () => ({ results: { bindings: [{ untranslated: { value: "0" } }] } });
        const done = render(["P18"], "allDone");
        sandbox.wdpropCountUntranslated("allDone", "  ?property a wikibase:Property.");

        return settled().then(() => {
            t.check("nothing is added to the heading when nothing is left",
                textOf(done.container.children.find(c => c.tag === "h3")),
                "Total 1 properties");
            sandbox.window.location.search = "";
        });
    });
}

/* -------------------------------------------------------- classes as well */

/* ------------------------------------------------ filtering re-pages */

function filterSuite() {
    /*
     * A filter that only hid rows would leave the control paging through gaps:
     * sixty-two pages when four matched, a position reading "showing 50 of
     * 3082", and the fill functions told about rows nobody can see. The
     * matching rows have to become the whole of what there is to move through.
     */
    answer = () => entities([]);

    const ids = [];
    for (let i = 1; i <= 120; i++) ids.push("Q" + i);

    targets.filterTarget = element("div");
    sandbox.createDivClasses("filterTarget", {
        head: { vars: ["item"] },
        results: { bindings: ids.map(id => ({ item: { value: ENTITY + id } })) },
    });

    const container = targets.filterTarget;
    const table = tableIn(container);
    /* The pager needs somewhere to be inserted, as it has on a real page. */
    table.parentNode = container;

    const body = bodyRows(table);
    sandbox.wdpropPaginateTable(table);

    const shown = () => body.filter(r => r.style.display !== "none").length;
    t.check("a long table starts on a page of fifty", shown(), 50);

    /* Q11, Q110…Q119 — eleven of the hundred and twenty. */
    sandbox.wdpropFilterTable(table, row => row.wdpropEntityId.indexOf("Q11") === 0);

    t.check("filtering leaves only what matched", shown(), 11);
    t.check("and they are the ones that matched",
        body.filter(r => r.style.display !== "none").map(r => r.wdpropEntityId)[0], "Q11");

    /* Eleven rows fit on one page, so no control should remain. */
    t.check("a result that fits on a page keeps no pager",
        !table.wdpropPagerElement, true);

    /* Widening the filter has to bring the paging back. */
    sandbox.wdpropFilterTable(table, () => true);
    t.check("clearing the filter restores the full set, paged", shown(), 50);
    t.check("and the control returns with it", !!table.wdpropPagerElement, true);

    return Promise.resolve();
}

function classesSuite() {
    /*
     * The classes page used to render a table into a hidden div, have
     * classes.js parse that table's HTML back into objects, and re-render them
     * into a virtual scroller of its own. It is the same table as every other
     * listing now — only the query variable, the link and the heading differ.
     *
     * This matters most for what the old table could not say. Of the 3,082
     * classes, 2,610 have no Tamil label, and the old renderer printed the
     * item identifier in the label column when one was missing, so five rows
     * in six read as though the class were named "Q21451142".
     */
    requests = [];
    answer = () => ({
        entities: {
            Q18616576: { id: "Q18616576", labels: { en: { value: "Wikidata property" } },
                descriptions: {} },
            Q21451142: { id: "Q21451142", labels: {}, descriptions: {} },
        },
    });

    targets.propertyClasses = element("div");
    sandbox.createDivClasses("propertyClasses", {
        head: { vars: ["item"] },
        results: {
            bindings: ["Q18616576", "Q21451142"].map(id => ({ item: { value: ENTITY + id } })),
        },
    });

    const container = targets.propertyClasses;
    const table = tableIn(container);
    const head = table.children.find(c => c.tag === "tr");
    const body = bodyRows(table);

    t.check("the heading counts classes, not properties",
        textOf(container.children.find(c => c.tag === "h3")), "Total 2 classes");
    t.check("the identifier column is headed for an item",
        head.children[0].innerHTML, "Item");
    t.check("there is no usage column: usage counts statements using a property",
        head.children.map(c => c.innerHTML), ["Item", "Label", "Description"]);
    t.check("and a class links to its own page",
        body[0].children[0].children[0].getAttribute("href"),
        "class.html?class=Q18616576");

    sandbox.wdpropRowsShown(table, body);

    return settled().then(() => {
        t.check("a class named only in English says so rather than reading as done",
            cellText(body[0], 1), "Wikidata property (not yet in this language)");
        t.check("and one named in neither language does not show its own Q-number",
            cellText(body[1], 1), "not in this language");
    });
}
