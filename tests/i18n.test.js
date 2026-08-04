/*
 * The message files and their coverage.
 *
 * Every key used in code or markup must exist in English; French and Spanish
 * must cover English exactly; and $n placeholders must survive translation, or
 * a sentence loses its numbers when it is reordered.
 */
const fs = require("fs"), path = require("path");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const dicts = {};
global.WDProp = { i18n: { add: (lang, d) => { dicts[lang] = d; } } };
for (const lang of ["en", "fr", "es"]) require(path.join(ROOT, "i18n", lang + ".js"));

const s = suite("i18n");
s.note(`en=${Object.keys(dicts.en).length} fr=${Object.keys(dicts.fr).length} es=${Object.keys(dicts.es).length} keys`);

for (const lang of ["fr", "es"]) {
    s.check(`${lang} covers every English key`,
        Object.keys(dicts.en).filter(k => !(k in dicts[lang])), []);
    s.check(`${lang} has no key English lacks`,
        Object.keys(dicts[lang]).filter(k => !(k in dicts.en)), []);
    const ph = x => (String(x).match(/\$\d/g) || []).sort().join("");
    s.check(`${lang} keeps the same placeholders`,
        Object.keys(dicts.en).filter(k => ph(dicts.en[k]) !== ph(dicts[lang][k])), []);
}

const MODULES = ["translate.js", "batch.js", "campaign.js", "contributionsview.js", "compose.js",
    "cart.js", "terminology.js", "usage.js", "i18n.js", "wdprop.js", "mwwdprop.js", "dashboard.js"];
const usedInJs = new Set();
for (const f of MODULES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const re of [/\bt\(\s*"([a-z][A-Za-z0-9.]+)"/g, /i18n\.t\(\s*"([a-z][A-Za-z0-9.]+)"/g,
                      /wdpropText\(\s*"([a-z][A-Za-z0-9.]+)"/g]) {
        for (const m of src.matchAll(re)) usedInJs.add(m[1]);
    }
}
s.check("every key used from JavaScript is defined",
    [...usedInJs].filter(k => !k.endsWith(".") && !(k in dicts.en)).sort(), []);

const pages = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".html")) pages.push(full);
    }
})(ROOT);
const usedInHtml = new Set();
for (const f of pages) {
    for (const m of fs.readFileSync(f, "utf8")
        .matchAll(/data-i18n(?:-html|-title|-label|-placeholder)?="([^"]+)"/g)) usedInHtml.add(m[1]);
}
s.check("every key used in markup is defined",
    [...usedInHtml].filter(k => !(k in dicts.en)).sort(), []);
s.note(`${usedInJs.size} keys from JavaScript, ${usedInHtml.size} from markup, across ${pages.length} pages`);

// Keys built at runtime as "term." + type.
s.check("term.* covers all three kinds",
    ["label", "description", "alias", "labels", "descriptions", "aliases"]
        .filter(x => !(("term." + x) in dicts.en)), []);

const used = new Set([...usedInJs, ...usedInHtml,
    "term.label", "term.description", "term.alias", "term.labels", "term.descriptions", "term.aliases",
    "batch.heading"]);
s.check("no unused keys", Object.keys(dicts.en).filter(k => !used.has(k)), []);

process.exit(s.done());
