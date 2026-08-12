/*
 * The WikiProjects listing, and the properties of one project.
 *
 * The listing asked the query service, which federated the question straight
 * back to the MediaWiki search API through SERVICE wikibase:mwapi. Going round
 * by SPARQL cost thirty-five seconds to return four thousand project names;
 * the search API answers the same question in a little over one. Its pages are
 * reached by offset rather than by a continuation token, so they do not depend
 * on one another and are asked for at once.
 *
 * Underneath that sat two paging schemes, neither of which worked. The
 * renderer appended "next" links carrying limit and offset in the URL, while
 * wikiprojects.js overrode the query to drop LIMIT and OFFSET altogether and
 * re-rendered everything into a virtual scroller of its own — parsing the
 * table's HTML back into objects to do it. Both are gone.
 *
 * fetch is a dispatcher the tests program per case; nothing reaches a network.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("wikiprojects");

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

const sandbox = {
    console,
    window: {
        location: { search: "" },
        matchMedia: () => ({ matches: false }),
        WDProp: { i18n },
        addEventListener() {},
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
        addEventListener() {},
    },
    fetch: url => {
        requests.push(url);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer(url)) });
    },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["ready.js", "wdprop.js", "pager.js", "mwwdprop.js"]) {
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

function settled() {
    return new Promise(resolve => setImmediate(resolve));
}

/* Search results for one offset, as the API returns them. */
function searchPage(titles) {
    return { query: { search: titles.map(title => ({ title })) } };
}

function offsetOf(url) {
    return Number(/sroffset=(\d+)/.exec(url)[1]);
}

/* ---------------------------------------------------- the listing is fetched */

{
    requests = [];
    /* Each offset answers with its own block, so overlap and order are visible. */
    answer = url => {
        const offset = offsetOf(url);
        const titles = [];
        for (let i = 0; i < 3; i++) {
            titles.push("Wikidata:WikiProject " + (offset + i));
        }
        /* Every page also repeats one title, and carries one non-project. */
        titles.push("Wikidata:WikiProject Shared");
        titles.push("Wikidata:WikiProjects");
        return searchPage(titles);
    };

    sandbox.fetchWikiProjects().then(titles => {
        t.check("every offset is asked for", requests.length, 9);
        t.check("and they are asked for at once, not one after another",
            requests.map(offsetOf), [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]);
        t.check("the search is by title, within the project namespace",
            decodeURIComponent(requests[0]).indexOf("srsearch=intitle:WikiProject") !== -1 &&
            requests[0].indexOf("srnamespace=4") !== -1, true);

        t.check("a title repeated across pages appears once",
            titles.filter(x => x === "Wikidata:WikiProject Shared").length, 1);
        t.check("and a page that is not a project is left out",
            titles.indexOf("Wikidata:WikiProjects"), -1);
        t.check("the rest are all there", titles.length, 9 * 3 + 1);

        return failureSuite();
    }).then(() => renderSuite())
      .then(() => projectSuite())
      .then(() => templateSuite())
      .then(() => process.exit(t.done()));
}

/* ------------------------------------------------- one bad page of many */

function failureSuite() {
    /*
     * One offset failing must cost that block and nothing else. Losing five
     * hundred names out of four thousand is worth far less than losing the
     * listing, which is what rejecting would do.
     */
    requests = [];
    answer = url => (offsetOf(url) === 1000
        ? { error: { code: "srsearch-error" } }
        : searchPage(["Wikidata:WikiProject " + offsetOf(url)]));

    return sandbox.fetchWikiProjects().then(titles => {
        t.check("a failed page costs only its own names", titles.length, 8);
        t.check("and the ones around it are kept",
            titles.indexOf("Wikidata:WikiProject 1500") !== -1, true);
    });
}

/* ------------------------------------------------------------ the table */

function renderSuite() {
    targets.allWikiProjects = element("div");
    sandbox.createDivWikiProjects("allWikiProjects", [
        "Wikidata:WikiProject Books",
        "Wikidata:WikiProject Heritage",
    ]);

    const container = targets.allWikiProjects;
    const table = tableIn(container);
    const rows = bodyRows(table);

    t.check("the heading counts the projects",
        textOf(container.children.find(c => c.tag === "h3")), "Total 2 WikiProjects");
    t.check("a project is named without its prefix", textOf(rows[0].children[0]), "Books");
    t.check("and links to its page on Wikidata",
        rows[0].children[0].children[0].getAttribute("href"),
        "https://www.wikidata.org/wiki/Wikidata:WikiProject Books");
    t.check("the second column comes back here",
        rows[1].children[1].children[0].getAttribute("href"),
        "wikiproject.html?project=Wikidata%3AWikiProject%20Heritage");
    t.check("the name is held on the row, for the filter to match on",
        rows.map(r => r.wdpropProjectName), ["Books", "Heritage"]);

    /*
     * The search page renders through here too. It used to arrive with a
     * SPARQL answer, which this had a branch for; it asks the search index
     * now, so both callers arrive with titles and the branch is gone.
     */
    targets.searchResults = element("div");
    sandbox.createDivWikiProjects("searchResults", ["Wikidata:WikiProject Music"]);
    t.check("the search page renders through the same table",
        textOf(bodyRows(tableIn(targets.searchResults))[0].children[0]), "Music");

    return Promise.resolve();
}

/* -------------------------------------------- the properties of one project */

function projectSuite() {
    /*
     * The identifiers are already in the links the API returned, so the SPARQL
     * query this page used to run purely to put a label beside each one is
     * gone — and with it its hardcoded English, on a page about translating
     * into other languages. The table names them from the entity API.
     */
    requests = [];
    answer = () => ({ entities: {} });

    targets.allProperties = element("div");
    targets.WikiProject = element("h2");

    sandbox.createDivWikprojectProperties("allProperties", {
        query: {
            pages: {
                "123": {
                    title: "Wikidata:WikiProject Books",
                    links: [
                        { title: "Property:P31" },
                        { title: "Wikidata:WikiProject Books/Team" },
                        { title: "Property:P" },
                        { title: "Property:P1476" },
                    ],
                },
            },
        },
    });

    const rows = bodyRows(tableIn(targets.allProperties));

    t.check("the page says which project it is showing",
        targets.WikiProject.textContent, "Wikidata:WikiProject Books");
    t.check("the heading counts the properties, which it never used to show",
        textOf(targets.allProperties.children.find(c => c.tag === "h3")),
        "Total 2 properties");
    t.check("only the property links become rows",
        rows.map(r => r.wdpropEntityId), ["P31", "P1476"]);
    t.check("the bare Property:P link some project pages carry is not one",
        rows.length, 2);

    /*
     * The table is short enough to need no pager, so wdpropPaginate hands its
     * rows straight to the fill functions — the terms are already on their way.
     */
    return settled().then(() => {
        t.check("nothing is asked of the query service",
            requests.filter(u => u.indexOf("query.wikidata.org") !== -1).length, 0);
        t.check("they are named from the entity API instead",
            requests.filter(u => u.indexOf("wbgetentities") !== -1).length, 1);
    });
}

/* ------------------------------------- the property-discussion templates */

function templateSuite() {
    /*
     * The page showed four separate walls of language codes, one per template,
     * each under a count. That says how many languages have a template but
     * never which, and above all never which languages have some of the four
     * and not the rest — which is the whole of what a translator would come
     * here for. Live, 65 languages appear across the four and 27 are missing
     * at least one.
     */
    const tree = names =>
        ({ parse: { parsetree: { "*": names.map(n => `<name>${n}</name>`).join("") } } });

    t.check("the switch's own cases are not languages",
        sandbox.createDivTemplateLanguages(tree(["lang", "#default", "templatedata", "fr"])),
        ["fr"]);
    t.check("nor is a repeat a second language",
        sandbox.createDivTemplateLanguages(tree(["fr", "de", "fr"])), ["fr", "de"]);
    t.check("a page that could not be parsed yields nothing, and does not throw",
        sandbox.createDivTemplateLanguages({}), []);

    targets.templateTranslations = element("div");
    sandbox.createDivTemplateMatrix("templateTranslations", {
        Support: ["fr", "de", "ta"],
        Oppose: ["fr", "de"],
        Neutral: ["fr"],
        Comment: ["fr", "ta"],
    });

    const container = targets.templateTranslations;
    const table = tableIn(container);
    const rows = bodyRows(table);

    t.check("the heading says how many are complete",
        textOf(container.children.find(c => c.tag === "h3")),
        "3 languages, 1 with all four templates");

    t.check("a column for each template",
        table.children.find(c => c.tag === "tr").children.map(c => c.innerHTML),
        ["Language", "Support", "Oppose", "Neutral", "Comment"]);

    /*
     * de is missing two, ta two, fr none. The ones with most missing come
     * first: a page about what still needs translating opens on that.
     */
    t.check("the languages missing most come first",
        rows.map(r => textOf(r.children[0])), ["de", "ta", "fr"]);

    t.check("a complete language is not marked",
        rows[2].getAttribute("class"), null);
    t.check("an incomplete one is", rows[0].getAttribute("class"), "untranslatedrow");

    t.check("a template that exists is a tick, and a link to it",
        rows[2].children[1].children[0].getAttribute("href"),
        "https://www.wikidata.org/wiki/Template:Support");
    t.check("one that does not is a dash",
        rows[0].children[3].children[0].text, "—");

    t.check("and both states are spelled out for a screen reader",
        [textOf(rows[0].children[1]), textOf(rows[0].children[3])],
        ["✓Support is translated into de", "—Neutral is not translated into de"]);

    return Promise.resolve();
}
