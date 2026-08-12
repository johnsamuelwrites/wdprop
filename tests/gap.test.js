/*
 * The Translation Gap Radar keeps its promises in the query shape: a bounded
 * worklist, a grouped coverage count, and strict scope validation before any
 * live request is made.
 */
const path = require("path");
const { browser, messages, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

browser();
messages(ROOT);
require(ROOT + "/gap.js");

const gap = global.window.WDProp.gap;
const t = suite("gap radar");

const base = { language: "ml", term: "label", scope: "all", value: "", limit: 50 };

t.check("the all-properties scope is explicit",
    gap.scopeWhere(base), "?property a wikibase:Property.");

t.check("a datatype scope is one property pattern",
    gap.scopeWhere({ ...base, scope: "datatype", value: "wikibase:ExternalId" })
        .includes("wikibase:propertyType wikibase:ExternalId"), true);

t.check("a class scope uses both declared-property shapes",
    /wd:Q18616576 wdt:P1963 \?property/.test(
        gap.scopeWhere({ ...base, scope: "class", value: "Q18616576" })), true);

{
    const query = gap.worklistQuery({ ...base, term: "description", limit: 25 });
    t.check("the worklist is capped before row enrichment",
        /LIMIT 25$/.test(query), true);
    t.check("the selected term controls what is missing",
        query.includes("schema:description"), true);
    t.check("missing means no term in the selected language",
        query.includes('FILTER(lang(?term) = "ml")'), true);
}

{
    const query = gap.coverageQuery(base);
    t.check("coverage is one query with total and translated subcounts",
        ["?total", "?translated", "?missing"].every(x => query.includes(x)), true);
}

t.check("valid options pass",
    gap.validate({ ...base, scope: "datatype", value: "wikibase:Url" }), "");
t.check("bad datatype is rejected before querying",
    gap.validate({ ...base, scope: "datatype", value: "ExternalId" }).length > 0, true);
t.check("bad class is rejected before querying",
    gap.validate({ ...base, scope: "class", value: "P31" }).length > 0, true);

t.check("the public module exposes only query-side helpers",
    Object.keys(gap).sort(), ["coverageQuery", "scopeWhere", "validate", "worklistQuery"]);

process.exit(t.done());
