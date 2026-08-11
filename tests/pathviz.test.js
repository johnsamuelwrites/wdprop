/*
 * The arc diagram on pathviz.html.
 *
 * It was drawn with d3, of which it used two things: select, as a shorthand
 * for creating an element and setting attributes on it, and scalePoint, to
 * space the languages evenly down the page. Half a megabyte — more than every
 * other script in WDProp put together — for a chaining helper and a division,
 * loaded on one page out of forty-one.
 *
 * These tests cover the plain-SVG replacement, and specifically the three
 * things that were easy to get wrong in the change:
 *
 *   - a single language is centred in the range, not stacked against the top.
 *     scalePoint divides by n-1, which is zero here, and d3 handles it;
 *   - the sequence numbers are painted after the arcs. SVG has no z-index, so
 *     document order is stacking order, and an earlier pass would have left
 *     them under any arc crossing the node column;
 *   - an arc from a language to itself is left out rather than drawn as a
 *     degenerate path.
 *
 * The scale itself is checked against the arithmetic d3 documents, which was
 * also compared against the real d3.scalePoint over several hundred positions
 * while the change was made.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");
const SVG_NS = "http://www.w3.org/2000/svg";

const containers = {};
const sandbox = {
    console,
    window: { location: { search: "" }, matchMedia: () => ({ matches: false }), WDProp: null,
        addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "en" },
    document: {
        readyState: "complete", body: element("body"), documentElement: element("html"),
        getElementById: id => containers[id] || null,
        createElement: element,
        createElementNS: (ns, tag) => { const el = element(tag); el.namespace = ns; return el; },
        createTextNode: t => { const n = element("#text"); n.text = String(t); return n; },
        querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    },
    fetch: () => new Promise(() => {}),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "ready.js"), "utf8"), sandbox, { filename: "ready.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "wdprop.js"), "utf8"), sandbox, { filename: "wdprop.js" });

const t = suite("arc diagram");

/* Draws one kind of path and returns the elements inside the translated group. */
function draw(languages) {
    for (const id of ["pathviz-labels", "pathviz-descriptions", "pathviz-aliases"]) {
        containers[id] = element("div");
    }
    sandbox.visualizePath({ labels: languages, descriptions: [], aliases: [] });
    const root = containers["pathviz-labels"].children[0];
    const group = root.children.find(c => c.tag === "g");
    return { root, group, kids: group ? group.children : [] };
}

const kindsOf = (kids, tag) => kids.filter(k => k.tag === tag);

console.log("\n-- Spacing the languages --");
{
    /* scalePoint with default padding: n points, first and last on the ends. */
    const scale = sandbox.wdpropPointScale;
    t.check("two points sit on both ends", [scale(2, 35)(0), scale(2, 35)(1)], [0, 35]);
    t.check("three are evenly spaced", [0, 1, 2].map(i => scale(3, 55)(i)), [0, 27.5, 55]);
    t.check("one is centred, not at the top", scale(1, 15)(0), 7.5);
}

console.log("\n-- What is drawn --");
{
    const { root, group, kids } = draw(["en", "fr", "ta"]);
    t.check("an svg in the svg namespace", [root.tag, root.namespace], ["svg", SVG_NS]);
    t.check("sized for three languages", [root.attrs.width, root.attrs.height], ["600", "70"]);
    t.check("the group is offset", group.attrs.transform, "translate(10, 5)");
    t.check("a node per language", kindsOf(kids, "circle").length, 3);
    t.check("a label and a sequence number per language", kindsOf(kids, "text").length, 6);

    const labels = kindsOf(kids, "text").slice(0, 3).map(x => x.textContent);
    t.check("languages are sorted", labels, ["en", "fr", "ta"]);

    const circles = kindsOf(kids, "circle").map(c => Number(c.attrs.cy));
    t.check("nodes are evenly spaced down the range", circles, [0, 27.5, 55]);
}

console.log("\n-- Painting order --");
{
    /* SVG paints in document order, so this is the stacking order. */
    const { kids } = draw(["en", "fr", "ta"]);
    const order = [];
    for (const k of kids) { if (order[order.length - 1] !== k.tag) order.push(k.tag); }
    t.check("nodes, labels, arcs, then the numbers on top",
        order, ["circle", "text", "path", "text"]);
}

console.log("\n-- Arcs --");
{
    const { kids } = draw(["en", "fr", "en"]);
    const paths = kindsOf(kids, "path");
    t.check("one arc per step in the path", paths.length, 2);
    t.check("every arc has a shape", paths.every(p => /^M \d/.test(p.attrs.d)), true);
    t.check("arcs are stroked, not filled",
        [paths[0].style.fill, paths[0].attrs["stroke-width"]], ["none", "1.5"]);
    t.check("and carry the arrow marker",
        paths[0].attrs["marker-end"], "url(#arrowhead-labels)");
}
{
    const { kids } = draw(["en", "en", "fr"]);
    t.check("a step from a language to itself draws nothing",
        kindsOf(kids, "path").length, 1);
}

console.log("\n-- Colour follows the theme where it should --");
{
    const { kids } = draw(["en", "fr"]);
    const texts = kindsOf(kids, "text");
    t.check("language labels take the theme's text colour",
        texts[0].style.fill, "var(--text-primary)");
    t.check("sequence numbers take the diagram's own colour",
        texts[texts.length - 1].style.fill, "#1B80CF");
}

console.log("\n-- The marker --");
{
    const { root } = draw(["en", "fr"]);
    const defs = root.children.find(c => c.tag === "defs");
    const marker = defs.children[0];
    t.check("is defined once, on the svg", [defs.tag, marker.tag], ["defs", "marker"]);
    t.check("with an id naming the kind of path, so three diagrams do not collide",
        marker.attrs.id, "arrowhead-labels");
    t.check("and points along the arc", marker.attrs.orient, "auto-start-reverse");
}

console.log("\n-- Nothing to draw --");
{
    for (const id of ["pathviz-labels", "pathviz-descriptions", "pathviz-aliases"]) {
        containers[id] = element("div");
    }
    sandbox.visualizePath({ labels: [], descriptions: null, aliases: [] });
    t.check("says so rather than drawing an empty frame",
        /No label translations recorded/.test(containers["pathviz-labels"].innerHTML), true);
    t.check("and handles a kind that was never collected",
        /No description translations recorded/.test(containers["pathviz-descriptions"].innerHTML), true);
}

process.exit(t.done() ? 1 : 0);
