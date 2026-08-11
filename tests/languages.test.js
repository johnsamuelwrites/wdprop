/*
 * Languages no property has been translated into at all.
 *
 * All three sections of untranslated.html asked one query each: every
 * Wikipedia language MINUS every language a property carries a term in. None
 * of them finished. The MINUS is evaluated against roughly a million terms and
 * the query service answered 504 after seventy-five seconds, so the page had
 * been showing a failure rather than an answer.
 *
 * The same result comes from two questions that each do finish, subtracted
 * here: which languages Wikipedia is written in, and which languages
 * properties are named in. This suite pins down that the subtraction is right,
 * and that the half both sections share is asked for once.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("languages");

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
global.window.WDProp = { i18n };
global.WDProp = global.window.WDProp;
require(ROOT + "/i18n/en.js");

let targets = {};
let requests = [];
let answer = q => column([], q);

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
        requests.push(decodeURIComponent(url));
        return Promise.resolve({
            ok: true, status: 200, json: () => Promise.resolve(answer(decodeURIComponent(url))),
        });
    },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["ready.js", "wdprop.js", "pager.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}

/* ----------------------------------------------------------------- helpers */

/*
 * The two queries name their column differently: the Wikipedia one asks for
 * ?language, and the term one for ?languageCode, which is what every other
 * page reading it already calls that column.
 */
function column(values, q) {
    const name = isWikipediaQuery(q) ? "language" : "languageCode";
    return { results: { bindings: values.map(v => ({ [name]: { value: v } })) } };
}

function textOf(node) {
    if (!node) return "";
    if (node.text) return node.text;
    return (node.innerHTML || "") + node.children.map(textOf).join("");
}

function chips(container) {
    return container.children.filter(c => c.tag === "div")
        .map(c => textOf(c.children[0]));
}

function settled() {
    return new Promise(resolve => setImmediate(resolve));
}

function isWikipediaQuery(q) {
    return q.indexOf("wd:Q10876391") !== -1;
}

/* --------------------------------------------------------- the subtraction */

{
    requests = [];
    sandbox.wikipediaLanguages = null;

    answer = q => (isWikipediaQuery(q)
        ? column(["ta", "fr", "ady", "als"], q)
        : column(["fr", "ta"], q));

    targets.untranslatedLabelsInLanguages = element("div");
    sandbox.getLanguagesWithUntranslatedLabels();

    settled().then(() => settled()).then(() => {
        const container = targets.untranslatedLabelsInLanguages;

        t.check("a language properties are named in is left out",
            chips(container).indexOf("fr"), -1);
        t.check("and the ones they are not are listed, in order",
            chips(container), ["ady", "als"]);
        t.check("counted as what is missing, not as what exists",
            textOf(container.children.find(c => c.tag === "h3")), "Total 2 languages");

        t.check("neither query is the one that could not finish",
            requests.some(q => q.indexOf("MINUS") !== -1), false);
        t.check("the term query is grouped per property, which is what lets it finish",
            requests.filter(q => !isWikipediaQuery(q))[0]
                .indexOf("GROUP BY ?property ?languageCode") !== -1, true);

        return sharedSuite();
    }).then(() => termSuite())
      .then(() => emptySuite())
      .then(() => process.exit(t.done()));
}

/* ------------------------------------- the half the three sections share */

function sharedSuite() {
    /*
     * All three sections of the page want the same list of Wikipedia
     * languages, and it cannot differ between them. Asking three times would
     * be three times the wait for one answer.
     */
    requests = [];
    sandbox.wikipediaLanguages = null;
    answer = q => (isWikipediaQuery(q)
        ? column(["ta", "fr"], q)
        : column(["fr"], q));

    ["untranslatedLabelsInLanguages", "untranslatedDescriptionsInLanguages",
     "untranslatedAliasesInLanguages"].forEach(id => { targets[id] = element("div"); });

    sandbox.getMissingTranslationStatistics();

    return settled().then(() => settled()).then(() => {
        t.check("the Wikipedia languages are asked for once for the whole page",
            requests.filter(isWikipediaQuery).length, 1);
        t.check("and each section asks its own term question",
            requests.filter(q => !isWikipediaQuery(q)).length, 3);
        t.check("all three sections are filled",
            ["untranslatedLabelsInLanguages", "untranslatedDescriptionsInLanguages",
             "untranslatedAliasesInLanguages"].map(id => chips(targets[id])),
            [["ta"], ["ta"], ["ta"]]);
    });
}

/* ------------------------------------------- each section asks about its own */

function termSuite() {
    requests = [];
    sandbox.wikipediaLanguages = null;
    answer = q => column([], q);

    ["untranslatedLabelsInLanguages", "untranslatedDescriptionsInLanguages",
     "untranslatedAliasesInLanguages"].forEach(id => { targets[id] = element("div"); });
    sandbox.getMissingTranslationStatistics();

    return settled().then(() => {
        const terms = requests.filter(q => !isWikipediaQuery(q));
        t.check("labels, descriptions and aliases, one each",
            ["rdfs:label", "schema:description", "skos:altLabel"]
                .map(p => terms.filter(q => q.indexOf(p) !== -1).length),
            [1, 1, 1]);
        t.check("and no placeholder is left unfilled",
            terms.some(q => q.indexOf("{{") !== -1), false);
    });
}

/* ------------------------------------------------------- nothing missing */

function emptySuite() {
    /*
     * Every Wikipedia language having a term is a real answer — "none left" —
     * and has to read as that rather than as a section that failed to load.
     */
    requests = [];
    sandbox.wikipediaLanguages = null;
    answer = q => column(["ta", "fr"], q);

    targets.untranslatedLabelsInLanguages = element("div");
    sandbox.getLanguagesWithUntranslatedLabels();

    return settled().then(() => settled()).then(() => {
        const container = targets.untranslatedLabelsInLanguages;
        t.check("nothing missing draws no chips", chips(container), []);
        t.check("and says so", textOf(container).indexOf("Nothing found") !== -1, true);
    });
}
