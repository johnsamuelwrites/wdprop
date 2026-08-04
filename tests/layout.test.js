/*
 * The stylesheet rules that other rules quietly depend on.
 *
 * WDProp shows properties, languages and datatypes as floated chips, and
 * several table cells carry the same class. A float needs a block formatting
 * context around it or its container collapses to no height and the floats
 * escape; every box that holds these establishes one, and it is not obvious
 * from reading the rule that this is what it is for.
 *
 * That made it easy to break: overflow: clip looks like a modern replacement
 * for overflow: hidden, and it does trim the same corners, but it establishes
 * no formatting context. Swapping one for the other made every chip on the
 * languages, properties and property pages vanish. These check the property
 * that mattered rather than the value that happened to be written.
 */
const fs = require("fs"), path = require("path");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/* Crude but sufficient: the sheet has no nested at-rules around these. */
const rules = css.split("}").map(chunk => {
    const [head, body] = chunk.split("{");
    return {
        selectors: (head || "").split(",").map(s => s.trim()).filter(Boolean),
        body: body || "",
    };
});

function ruleFor(selector) {
    return rules.find(r => r.selectors.includes(selector));
}

/* overflow: clip is deliberately absent — it is the one that does not work. */
const ESTABLISHES_CONTEXT = /overflow(-[xy])?:\s*(hidden|auto|scroll)|display:\s*(flow-root|flex|grid|table)/;

const s = suite("layout");

const FLOATED = /(^|[^-\w])float:\s*(left|right)/;
const chip = ruleFor(".property");
s.check("the chips are still floated, so containing them still matters",
    FLOATED.test(chip ? chip.body : ""), true);
s.check("and the same rule covers all four kinds",
    chip ? chip.selectors.sort() : [],
    [".datatype", ".deletedproperty", ".language", ".property"]);

/*
 * Each of these is filled by one query and holds the chips it renders. Taken
 * from the selector list that groups them, so a container added later is
 * checked too.
 */
const holders = rules.find(r => r.selectors.includes("#languages"));
s.check("the containers are still grouped in one rule", !!holders, true);
s.check("every one of them contains its floats",
    holders.selectors.filter(sel => !ESTABLISHES_CONTEXT.test(holders.body)), []);
s.note(`${holders.selectors.length} chip containers checked`);

const table = ruleFor("table");
s.check("a table contains its floated cells too",
    ESTABLISHES_CONTEXT.test(table ? table.body : ""), true);

/*
 * The consequence, recorded so the trade-off is not rediscovered the hard
 * way: a scroll container is exactly what position: sticky settles against,
 * so a heading row inside one of these sticks to the box it already sits in
 * and never moves. Sticky headings need the floats removed first.
 *
 * `.viz-table thead th` already asks for it and already does nothing, for
 * this exact reason — its wrapper is a scroll container. It predates this
 * check and is left alone; it is listed here so the next person knows it is
 * inert rather than assuming it works.
 */
const INERT = [".viz-table thead th"];
s.check("no heading row on a generated table claims to be sticky",
    rules.filter(r => /position:\s*sticky/.test(r.body))
        .flatMap(r => r.selectors)
        .filter(sel => /(^|\s|>)th\b/.test(sel) && !INERT.includes(sel)), []);

process.exit(s.done());
