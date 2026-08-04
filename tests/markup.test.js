/*
 * Page structure that the stylesheet relies on.
 *
 * The layout is built from fixed boxes: the sidebar is 280px wide and pinned
 * to the left, the header is pinned to the top, and #content carries the
 * margins that keep the page clear of both. Anything put beside #content
 * rather than inside it therefore starts at the left edge of the window and
 * is covered by the sidebar.
 *
 * That is what had happened to the Top Properties section on properties.html:
 * #content closed one section early, so the last one on the page sat under
 * the sidebar with its first column unreadable. It reads as a styling fault
 * and is a nesting fault, which is why it is checked here.
 */
const fs = require("fs"), path = require("path");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const pages = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".html")) pages.push(full);
    }
})(ROOT);

/* Where the div opened at `from` closes, by counting divs in and out. */
function closingIndex(html, from) {
    let depth = 0;
    const tags = /<(\/?)div\b[^>]*>/g;
    tags.lastIndex = from;
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return m.index + m[0].length;
    }
    return -1;
}

const s = suite("markup");

const outside = [];
const unclosed = [];
for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const at = html.indexOf('id="content"');
    if (at < 0) continue;

    const close = closingIndex(html, html.lastIndexOf("<div", at));
    if (close < 0) {
        unclosed.push(path.relative(ROOT, page));
        continue;
    }

    /*
     * Between the end of #content and the footer there should be nothing at
     * all. The footer is the one box that is meant to be a sibling.
     */
    let after = html.slice(close);
    const footer = after.indexOf('id="footer"');
    if (footer >= 0) {
        after = after.slice(0, after.lastIndexOf("<div", footer));
    }
    if (/<(div|table|section|h1|h2|h3|ul|p)\b/.test(after)) {
        outside.push(path.relative(ROOT, page));
    }
}

s.check("every page closes its main region", unclosed, []);
s.check("nothing on a page sits outside the main region, where the sidebar covers it",
    outside, []);
s.note(`${pages.length} pages checked`);

/* The three boxes the whole layout is measured against. */
for (const [name, needle] of [["a header", 'id="header"'], ["a sidebar", 'id="sidebar"'],
    ["a main region", 'id="content"'], ["a footer", 'id="footer"']]) {
    s.check(`every page has ${name}`,
        pages.filter(p => !fs.readFileSync(p, "utf8").includes(needle))
            .map(p => path.relative(ROOT, p)), []);
}

process.exit(s.done());
