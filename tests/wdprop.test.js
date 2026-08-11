/*
 * wdprop.js — the original analytics code.
 *
 * Guards three defects that were fixed in it:
 *
 *   - six query templates were substituted into in place, destroying their own
 *     placeholders, so a second call reused the first call's values;
 *   - the specified-properties template had rdfs:label hardcoded while being
 *     handed a {{translationType}} that was not in it, so the description and
 *     alias sections both ran the label query;
 *   - mwwdprop.js defined a second createDivLanguage, and which one ran on the
 *     property page depended on script order.
 *
 * The file is loaded in a vm with a stub DOM and queryWikidata replaced by a
 * recorder, so the SPARQL it builds can be read without any network.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const captured = [];
const node = () => ({
    children: [], attrs: {}, style: {}, innerHTML: "",
    setAttribute() {}, getAttribute: () => null,
    appendChild(c) { return c; }, removeChild() {}, addEventListener() {},
    querySelectorAll: () => [], get firstChild() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
});

const sandbox = {
    console,
    window: { location: { search: "" }, matchMedia: () => ({ matches: false }), WDProp: null,
        addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "en" },
    document: {
        readyState: "complete", body: node(), documentElement: node(),
        getElementById: () => node(), createElement: node,
        createTextNode: t => ({ text: String(t) }),
        querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    },
    fetch: () => new Promise(() => {}),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "ready.js"), "utf8"), sandbox, { filename: "ready.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "wdprop.js"), "utf8"), sandbox, { filename: "wdprop.js" });
vm.runInContext(`
    queryWikidata = function (q, f, divId) { __capture(divId, q); };
    getLanguage = function () {};
    getProperty = function () {};
`, sandbox);
sandbox.__capture = (divId, q) => captured.push({ divId, q });

const call = js => { captured.length = 0; vm.runInContext(js, sandbox); return captured.slice(); };
const setSearch = s => { sandbox.window.location.search = s; };

const s = suite("wdprop.js");

// fillQuery must never modify what it is given.
const tpl = "x {{a}} y {{b}} z {{a}}";
s.check("substitutes every occurrence", sandbox.fillQuery(tpl, { a: "1", b: "2" }), "x 1 y 2 z 1");
s.check("leaves the template untouched", tpl, "x {{a}} y {{b}} z {{a}}");
s.check("unknown placeholders remain", sandbox.fillQuery("{{a}} {{c}}", { a: "1" }), "1 {{c}}");
s.check("no values is a no-op", sandbox.fillQuery(tpl, {}), tpl);

/*
 * The decisive regression check. Calling twice with the same input hides the
 * bug — an already-substituted template yields the same string again. Only a
 * second call with different values shows that the first call's are stuck.
 */
const varying = [
    ["getClasses", "getClasses()", "?language=fr", "?language=ta", '"fr"', '"ta"'],
    ["getClasses with property", "getClasses()", "?language=en&property=P31", "?language=en&property=P17", "P31", "P17"],
    ["class worklist", 'getPropertiesForClassRequiringTranslationQuery("Q18616576")', "?language=ta", "?language=fr", '"ta"', '"fr"'],
    ["property worklist", 'getSpecifiedPropertiesRequiringTranslation("wd:P31")', "?language=ta", "?language=fr", '"ta"', '"fr"'],
];
for (const [name, js, a, b, needleA, needleB] of varying) {
    setSearch(a); const first = call(js)[0].q;
    setSearch(b); const second = call(js)[0].q;
    s.check(name + ": first call's values do not stick",
        [first.includes(needleA), second.includes(needleB)], [true, true]);
    s.check(name + ": second call differs from the first", first === second, false);
    s.check(name + ": no placeholder left unfilled", first.includes("{{"), false);
}

setSearch("");
const c1 = call('getTranslationStatisticsForClass("Q42")')[0].q;
const c2 = call('getTranslationStatisticsForClass("Q99")')[0].q;
s.check("class statistics: values do not stick", [c1.includes("Q42"), c2.includes("Q99")], [true, true]);
const w1 = call('getTranslationStatisticsForWikiProject("wd:P31")')[0].q;
const w2 = call('getTranslationStatisticsForWikiProject("wd:P17")')[0].q;
s.check("wikiproject statistics: values do not stick", [w1.includes("P31"), w2.includes("P17")], [true, true]);

// The three sections of a page must ask three different questions.
setSearch("?language=ta");
for (const [name, js] of [["class page", 'getPropertiesForClassRequiringTranslationQuery("Q18616576")'],
                          ["property page", 'getSpecifiedPropertiesRequiringTranslation("wd:P31")']]) {
    const rows = call(js);
    s.check(name + ": three distinct queries", new Set(rows.map(r => r.q)).size, 3);
    s.check(name + ": one predicate each",
        rows.map(r => ["rdfs:label", "schema:description", "skos:altLabel"].find(p => r.q.includes(p))),
        ["rdfs:label", "schema:description", "skos:altLabel"]);
    s.check(name + ": three separate sections", new Set(rows.map(r => r.divId)).size, 3);
}

// The name collision between the two scripts.
const mw = fs.readFileSync(path.join(ROOT, "mwwdprop.js"), "utf8");
s.check("mwwdprop.js no longer defines createDivLanguage", mw.includes("function createDivLanguage("), false);
s.check("it defines a distinctly named one", mw.includes("function createDivTemplateLanguages("), true);
s.check("and calls that one", mw.includes(", createDivLanguage,"), false);

// Small pure helpers.
setSearch("?language=ta&property=P31");
s.check("getValueFromURL reads a parameter", sandbox.getValueFromURL("language=([^&#=]*)", "en"), "ta");
s.check("getValueFromURL falls back", sandbox.getValueFromURL("class=([^&#=]*)", "Q9143"), "Q9143");
setSearch("?search=%C3%A9diteur");
s.check("getValueFromURL decodes", sandbox.getValueFromURL("search=([^&#=]*)", ""), "éditeur");
const colors = ["a", "b", "c", "d", "e"];
s.check("getColor spans the range", [sandbox.getColor(colors, 0, 10), sandbox.getColor(colors, 9, 10)], ["a", "e"]);

process.exit(s.done());
