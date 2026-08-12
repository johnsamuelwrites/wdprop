/*
 * Language Atlas: one live query, grouping over what Wikidata says and a
 * visible bucket for what it does not say.
 */
const path = require("path");
const { browser, messages, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

browser();
messages(ROOT);
require(ROOT + "/atlas.js");

const atlas = global.window.WDProp.atlas;
const t = suite("language atlas");

t.check("the atlas query reads supported Wikimedia language codes",
    atlas.query.includes("wdt:P407 ?language") && atlas.query.includes("wdt:P424 ?code"), true);
t.check("script is read from explicit Wikidata statements",
    atlas.query.includes("wdt:P282 ?script"), true);
t.check("classification is read from direct subclass statements only",
    atlas.query.includes("wdt:P279 ?family"), true);
t.check("the query is grouped into one row per code and language label",
    atlas.query.includes("GROUP BY ?code ?languageLabel"), true);

t.check("comma-separated values are split for grouping",
    atlas.parts("Latin script, Cyrillic script"), ["Latin script", "Cyrillic script"]);
t.check("empty values stay empty, for the unknown bucket",
    atlas.parts(""), []);

{
    const groups = atlas.groupCounts([
        { scripts: "Latin script", families: "Romance languages" },
        { scripts: "Latin script, Cyrillic script", families: "" },
        { scripts: "", families: "Germanic languages" },
    ], "scripts");
    t.check("known grouped values count each language that names them",
        groups.find(g => g.label === "Latin script").count, 2);
    t.check("unknown source data is preserved as its own group",
        groups.find(g => g.label === "").count, 1);
}

process.exit(t.done());
