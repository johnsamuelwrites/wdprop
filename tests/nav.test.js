/*
 * Navigation context: the current sidebar entry, and the breadcrumb on pages
 * that sit below one.
 *
 * Both are worked out from the address, because the sidebar is static markup
 * repeated in every page and says nothing about which entry is current. The
 * cases that matter are the shapes a path can take — "./x.html", "../x.html",
 * a full pathname, the bare "/" a server returns for the front page — and the
 * collision between templates/translated.html and the translated.html in the
 * root, which are different pages with the same filename.
 *
 * wdprop.js is run in a vm with a stub DOM. Its page setup is held back by
 * reporting the document as still loading, so each case can choose an address
 * before the setup runs.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

function node(tag) {
    return {
        tag, children: [], attrs: {}, style: {}, text: undefined,
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        addEventListener() {},
        querySelectorAll: () => [],
        get firstChild() { return this.children[0] || null; },
        get textContent() {
            return this.children.map(c => (c.text !== undefined ? c.text : c.textContent)).join("");
        },
    };
}

const elements = {};

/* The real English messages, so the trail can be checked as it will read. */
const english = {};
global.WDProp = { i18n: { add: (lang, d) => Object.assign(english, d) } };
require(path.join(ROOT, "i18n", "en.js"));

const sandbox = {
    console,
    setTimeout: () => 0,
    window: {
        location: { pathname: "/", search: "" },
        matchMedia: () => ({ matches: false }),
        WDProp: { i18n: { t: key => (key in english ? english[key] : key) } },
        addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "en" },
    document: {
        readyState: "loading",
        body: node("body"),
        documentElement: node("html"),
        currentScript: null,
        getElementById: id => elements[id] || null,
        createElement: node,
        createTextNode: t => ({ text: String(t) }),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
    },
    fetch: () => new Promise(() => {}),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "ready.js"), "utf8"), sandbox, { filename: "ready.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "wdprop.js"), "utf8"), sandbox, { filename: "wdprop.js" });

const nav = sandbox.window.WDProp.nav;
const s = suite("navigation");

/* Runs the page setup at a given address and returns what it produced. */
function visit(pathname, search) {
    sandbox.window.location = { pathname, search: search || "" };
    elements.content = node("div");
    elements.sidebarlinks = node("div");
    elements["wdp-toast-region"] = node("div");
    /*
     * The mount is called directly rather than through the ready handler that
     * calls it on a real page: that handler runs once and only once, which is
     * right there and no use here, where each case needs it run again at a new
     * address.
     */
    sandbox.wdpropMountPage();

    const list = elements.sidebarlinks.firstChild;
    const items = list ? list.children : [];
    const links = items.map(li => li.firstChild);

    /*
     * Two things can now be put at the top of the content, and they are never
     * both there: a page below a section gets the trail back to it, and a
     * section page gets the list of what sits beneath it. They are picked out
     * by what they are rather than by position, so that neither test reads
     * the other's markup and passes for the wrong reason.
     */
    const top = elements.content.children;
    return {
        crumb: top.filter(x => x.getAttribute("class") === "wdp-breadcrumb")[0] || null,
        offered: top.filter(x => x.getAttribute("id") === "wdp-subpages")[0] || null,
        links,
        hrefs: links.map(a => a.getAttribute("href")),
        current: links.filter(a => a.getAttribute("aria-current") === "page")
            .map(a => a.getAttribute("href")),
        marked: items.filter(li => li.getAttribute("class") === "wdp-current")
            .map(li => li.firstChild.getAttribute("href")),
    };
}

console.log("\n-- Identifying a page from any form of path --");
s.check("a relative link", nav.pageKey("./properties.html"), "properties.html");
s.check("a link out of a subdirectory", nav.pageKey("../properties.html"), "properties.html");
s.check("a full pathname", nav.pageKey("/wdprop/property.html"), "property.html");
s.check("a query string is not part of it", nav.pageKey("/property.html?property=P31"), "property.html");
s.check("a fragment is not part of it", nav.pageKey("/properties.html#top"), "properties.html");
s.check("the bare front page", nav.pageKey("/"), "index.html");
s.check("an empty path", nav.pageKey(""), "index.html");
/*
 * A directory is served its index. Read as a file, the directory's own name
 * became the key, so WDProp installed anywhere but the root of a host had no
 * marked sidebar entry on its front page.
 */
s.check("WDProp installed in a directory, opened at its root",
    nav.pageKey("/wdprop/"), "index.html");
s.check("however deep it is installed",
    nav.pageKey("/tools/wdprop/"), "index.html");

console.log("\n-- The two translated.html pages stay apart --");
s.check("the one under templates keeps its directory",
    nav.pageKey("../templates/translated.html"), "templates/translated.html");
s.check("the one in the root does not gain one",
    nav.pageKey("/wdprop/translated.html"), "translated.html");
s.check("and they belong to different sections",
    [nav.sectionOf("templates/translated.html"), nav.sectionOf("translated.html")],
    ["templates/translated.html", "languages.html"]);

console.log("\n-- Which sidebar entry a page belongs to --");
s.check("a page below one", nav.sectionOf("property.html"), "properties.html");
s.check("a sidebar entry is its own", nav.sectionOf("properties.html"), "properties.html");
s.check("the batch sits under the workbench", nav.sectionOf("batch.html"), "translate.html");
s.check("an unknown page is left alone", nav.sectionOf("something.html"), "something.html");

console.log("\n-- Building the trail --");
s.check("a sidebar entry has no trail", nav.trail("properties.html", ""), []);
s.check("a property names itself last",
    nav.trail("property.html", "?property=P31").map(step => step.text || step.key),
    ["crumb.home", "crumb.properties", "P31"]);
s.check("only the last step is the current page",
    nav.trail("property.html", "?property=P31").map(step => step.current === true),
    [false, false, true]);
s.check("the steps before it link somewhere",
    nav.trail("property.html", "?property=P31").map(step => step.file || null),
    ["index.html", "properties.html", null]);
s.check("a page about no one thing uses its own heading",
    nav.trail("batch.html", "").map(step => step.key),
    ["crumb.home", "crumb.translate", "batch.heading"]);
s.check("with no subject the trail stops at the section",
    nav.trail("property.html", "").map(step => step.key),
    ["crumb.home", "crumb.properties"]);
s.check("a language reads as its code",
    nav.trail("language.html", "?language=ta").pop().text, "ta");

/* The prefix is the same on every one of them, so it says nothing. */
s.check("a datatype drops the wikibase: prefix",
    nav.trail("datatype.html", "?datatype=wikibase%3AWikibaseItem").pop().text, "WikibaseItem");
s.check("a WikiProject drops the Wikidata:WikiProject prefix",
    nav.trail("wikiproject.html", "?project=Wikidata%3AWikiProject+Sports").pop().text, "Sports");
s.check("an escaped space survives",
    nav.trail("wikiproject.html", "?project=Wikidata%3AWikiProject%20Heritage%20Collections").pop().text,
    "Heritage Collections");

console.log("\n-- Building the sidebar --");
let page = visit("/wdprop/index.html", "");
s.check("every entry is there", page.links.length, 19);
s.check("in the order they are declared", page.hrefs, [
    "./index.html", "./translate.html", "./campaign.html", "./stale.html",
    "./contributions.html", "./terminology.html", "./gap.html", "./languages.html", "./datatypes.html",
    "./properties.html", "./classes.html", "./provenance.html", "./search.html",
    "./compare.html", "./templates/translated.html", "./wikiprojects.html",
    "./offline.html", "./pages.html", "./wdprop.html"]);
/*
 * The sixteen pages that sit below a section cost the sidebar one line
 * between them, which was the point: they were hard to find precisely
 * because none of them warranted a permanent line of their own.
 */
s.check("and the pages below one are not among them",
    page.hrefs.filter(h => nav.pages.some(p => p.under && h === "./" + p.file)), []);
s.check("each carries its message key so a language change reaches it",
    page.links.slice(0, 3).map(a => a.getAttribute("data-i18n")),
    ["nav.dashboard", "nav.translate", "nav.campaigns"]);
s.check("and is readable before any language arrives",
    page.links[0].textContent, "📊 Dashboard");
s.check("building it twice does not double it", (() => {
    sandbox.wdpropMountPage();
    return elements.sidebarlinks.children.length;
})(), 1);

console.log("\n-- On the page --");
page = visit("/wdprop/property.html", "?property=P31");
s.check("the breadcrumb goes in first", page.crumb && page.crumb.tag, "nav");
s.check("it is named for a screen reader",
    page.crumb.getAttribute("aria-label") !== null, true);
s.check("it can be retranslated later",
    page.crumb.getAttribute("data-i18n-label"), "a11y.breadcrumb");
s.check("it reads as the trail", page.crumb.textContent, "DashboardPropertiesP31");
s.check("the section it sits under is marked", page.current, ["./properties.html"]);
s.check("and marked by more than colour", page.marked, ["./properties.html"]);

page = visit("/wdprop/properties.html", "");
s.check("a sidebar entry gets no breadcrumb", page.crumb, null);
s.check("but is still marked as current", page.current, ["./properties.html"]);

page = visit("/wdprop/index.html", "");
s.check("the front page marks the dashboard", page.current, ["./index.html"]);
s.check("the bare front page does too", visit("/", "").current, ["./index.html"]);

page = visit("/wdprop/translated.html", "");
s.check("root translated.html does not mark property discussion", page.current, ["./languages.html"]);
s.check("templates/translated.html marks it",
    visit("/wdprop/templates/translated.html", "").current, ["./templates/translated.html"]);

/*
 * The list used to be repeated in the markup of every page, and the copies had
 * started to drift. Nothing may write it out again.
 */
console.log("\n-- One source for the list --");
const pages = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".html")) pages.push(full);
    }
})(ROOT);
s.check("no page writes out its own navigation links",
    pages.filter(f => /data-i18n="nav\./.test(fs.readFileSync(f, "utf8")))
        .map(f => path.relative(ROOT, f)), []);
/*
 * Somewhere to put it: #sidebarlinks used to be in the markup of every page
 * and is now built by shell.js, so the page needs the element that expands
 * into it. markup.test.js checks the shell produces the container.
 */
s.check("every page still has somewhere to put it",
    pages.filter(f => !/<wdprop-shell>/.test(fs.readFileSync(f, "utf8")))
        .map(f => path.relative(ROOT, f)), []);
/* The optional directory must end at a slash, so mwwdprop.js does not count. */
s.check("every page loads the script that builds it",
    pages.filter(f => !/src="(?:[^"]*\/)?wdprop\.js"/.test(fs.readFileSync(f, "utf8")))
        .map(f => path.relative(ROOT, f)), []);
s.note(`${pages.length} pages, ${sandbox.wdpropSections.length} entries declared once`);

/*
 * The registry against the disk, both ways.
 *
 * This is the check that matters most in this file, and it is the one that
 * was missing. atlas.html was written, shipped, and reachable only through a
 * single line at the foot of languages.html, because nothing anywhere said a
 * page had to be declared. A page absent from wdpropPages gets no place in
 * the sidebar, no breadcrumb, and no entry on its section's page: it is on
 * the site and cannot be found from it.
 *
 * Compared by wdpropPageKey rather than by filename, because that is the name
 * the rest of the navigation uses. It folds aliases/, labels/ and
 * descriptions/ onto the pages they are variants of, and keeps templates/
 * apart, which is exactly the distinction the registry draws.
 */
console.log("\n-- The registry against the disk --");
const onDisk = [...new Set(pages.map(f => nav.pageKey(path.relative(ROOT, f))))].sort();
const declared = nav.pages.map(p => p.file).sort();
s.check("every page on disk is declared", onDisk.filter(f => !declared.includes(f)), []);
s.check("every page declared is on disk", declared.filter(f => !onDisk.includes(f)), []);
s.check("no page is declared twice", declared.length, new Set(declared).size);

console.log("\n-- What sits beneath a section --");
s.check("the atlas is offered under languages",
    nav.childrenOf("languages.html").map(p => p.file).includes("atlas.html"), true);
s.check("in the order they are declared",
    nav.childrenOf("provenance.html").map(p => p.file),
    ["path.html", "pathviz.html", "propertyprovenance.html"]);
/*
 * property.html without a property is an empty page, so it is not offered as
 * a link even though it does sit under Properties.
 */
s.check("a page about one thing is not offered without it",
    nav.childrenOf("properties.html").map(p => p.file), ["propertydesc.html"]);
s.check("a page below a section has nothing beneath it",
    nav.childrenOf("atlas.html"), []);
s.check("every page offered says what it is for",
    nav.pages.filter(p => p.under && !p.subject && !p.blurb).map(p => p.file), []);

console.log("\n-- On a section page --");
page = visit("/wdprop/languages.html", "");
const offered = page.offered;
s.check("the block goes in", offered !== null, true);
s.check("it is a landmark of its own", offered.tag, "nav");
s.check("it is named for a screen reader",
    offered.getAttribute("data-i18n-label"), "page.inThisSection");
s.check("it lists the pages beneath languages",
    offered.children[1].children.map(li => li.firstChild.getAttribute("href")),
    ["./atlas.html", "./visualization.html", "./labels.html", "./descriptions.html",
     "./translated.html", "./untranslated.html"]);
s.check("each reads as its name and its line",
    offered.children[1].children[0].firstChild.textContent,
    "Language Atlas" + english["blurb.atlas"]);
s.check("and can be retranslated later",
    offered.children[1].children[0].firstChild.children.map(x => x.getAttribute("data-i18n")),
    ["atlas.heading", "blurb.atlas"]);
s.check("building it twice does not double it", (() => {
    sandbox.wdpropMountPage();
    return elements.content.children.filter(x => x.getAttribute("id") === "wdp-subpages").length;
})(), 1);

page = visit("/wdprop/atlas.html", "");
s.check("a page below a section gets a breadcrumb, not a listing",
    [page.crumb !== null, page.offered], [true, null]);

page = visit("/wdprop/search.html", "");
s.check("a section with nothing beneath it gets neither",
    [page.crumb, page.offered], [null, null]);

/*
 * pages.html, the one line the sidebar spent on all of this. It is built from
 * the registry rather than written out, so what it can be wrong about is the
 * shape, not the contents.
 */
console.log("\n-- The index of everything --");
elements.pageIndex = node("div");
sandbox.wdpropMountPageIndex();
const groups = elements.pageIndex.children;
s.check("one group per sidebar entry", groups.length, 19);
s.check("each is headed by a link to the section",
    groups.map(g => g.firstChild.firstChild.getAttribute("href")).slice(0, 3),
    ["./index.html", "./translate.html", "./campaign.html"]);
s.check("every section says what it is for",
    groups.filter(g => !g.children.some(c => c.getAttribute("class") === "wdp-index-blurb")).length, 0);
/* Languages is the section this whole change was about: six pages under it. */
const languages = groups[7];
s.check("the group is the one expected", languages.firstChild.textContent, "🌍 Languages");
s.check("it offers what sits beneath it",
    languages.children[2].children.map(li => li.firstChild.getAttribute("href")),
    ["./atlas.html", "./visualization.html", "./labels.html", "./descriptions.html",
     "./translated.html", "./untranslated.html"]);
s.check("a section with nothing beneath it is the heading and the line",
    groups[12].children.map(c => c.tag), ["h2", "p"]);
s.check("building it twice does not double it", (() => {
    sandbox.wdpropMountPageIndex();
    return elements.pageIndex.children.length;
})(), 19);
/*
 * Every page in the registry is offered somewhere on it: as a section
 * heading, or as a card beneath one. A page that is on neither is a page the
 * index cannot lead anyone to, which is the fault this page exists to fix.
 */
const reachable = new Set();
groups.forEach(group => {
    reachable.add(group.firstChild.firstChild.getAttribute("href"));
    group.children.filter(c => c.tag === "ul").forEach(list => {
        list.children.forEach(li => reachable.add(li.firstChild.getAttribute("href")));
    });
});
s.check("every page that can be linked to is on it",
    nav.pages.filter(p => !p.subject && !reachable.has("./" + p.file)).map(p => p.file), []);

/*
 * Searching WDProp's own pages. The list is already in the browser, so this
 * costs no request — which is why the search can answer with pages before
 * Wikidata has answered with properties.
 */
console.log("\n-- Finding a page by name --");
const found = term => nav.match(term).map(p => p.file);
s.check("by what the page is called", found("atlas"), ["atlas.html"]);
/* What someone who has seen the page before is likely to remember of it. */
s.check("by its address", found("pathviz"), ["pathviz.html"]);
s.check("by a word in its description",
    found("writing system"), ["atlas.html"]);
s.check("case does not matter", found("ATLAS"), ["atlas.html"]);
s.check("surrounding space does not matter", found("  atlas "), ["atlas.html"]);
s.check("nothing typed finds nothing", found(""), []);
s.check("nothing matching finds nothing", found("qqzz"), []);
s.check("a page about one thing is never offered",
    nav.match("property").filter(p => p.subject), []);
s.check("several matches keep the order of the registry",
    found("translat").slice(0, 3),
    ["translate.html", "batch.html", "stale.html"]);

process.exit(s.done());
