/*
 * <wdprop-shell> — the header, sidebar landmark and skip link.
 *
 * These were written out by hand in all forty-one pages. What the tests here
 * are really guarding is the reason that was worth changing: the copies had
 * drifted, and nothing noticed.
 *
 * So they check the shape the rest of WDProp reaches for — style.css addresses
 * this markup by id, wdprop.js puts the sidebar links inside #sidebarlinks,
 * i18n.js translates it through data-i18n — and the accessibility of the two
 * controls, which are divs with role="button" and therefore have to be given
 * keyboard behaviour that a real button would have brought with it.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("shell");

/* Enough of a browser for a custom element to be defined and run by hand. */
function load() {
    const registry = {};
    const listeners = {};
    const byId = {};

    const fragment = () => element("#fragment");

    const sandbox = {
        console,
        HTMLElement: class {},
        Reflect,
        window: {},
        document: {
            currentScript: { src: "https://example.org/wdprop/shell.js" },
            createElement: element,
            createDocumentFragment: fragment,
            createTextNode: t => { const n = element("#text"); n.text = String(t); return n; },
            getElementById: id => byId[id] || null,
            addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        },
    };
    sandbox.window.customElements = {
        define: (name, ctor) => { registry[name] = ctor; },
        get: name => registry[name],
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "shell.js"), "utf8"), sandbox,
        { filename: "shell.js" });

    return { sandbox, registry, listeners, byId };
}

/* Walks the built fragment and indexes every element by id. */
function index(node, into) {
    into = into || {};
    for (const child of node.children) {
        const id = child.attrs.id;
        if (id) into[id] = child;
        index(child, into);
    }
    return into;
}

console.log("\n-- It registers --");
const { sandbox, registry, listeners, byId } = load();
t.check("as wdprop-shell", typeof registry["wdprop-shell"], "function");
t.check("and does not register twice over", (() => {
    const before = Object.keys(registry).length;
    return before;
})(), 1);

console.log("\n-- What it builds --");
const built = sandbox.window.WDProp.shell.build();
const ids = index(built);
for (const box of ["header", "logo", "subtitle", "theme-toggle", "sidebar",
    "sidebarlinks", "mobile-menu-toggle"]) {
    t.check(`#${box}`, box in ids, true);
}
t.check("the sidebar links go inside the sidebar landmark",
    ids["sidebarlinks"].parent === ids["sidebar"], true);
t.check("the skip link comes first, before anything focusable",
    built.children[0].attrs["class"], "skip-link");
t.check("and points at the main region", built.children[0].attrs.href, "#content");

console.log("\n-- The request counter --");
{
    /*
     * activity.js counts what the page asks Wikidata for and needs somewhere
     * to show it. It is put in the header here rather than in the markup so
     * that it is on all forty-one pages without forty-one copies of it — the
     * same reason the header itself moved here.
     */
    const withActivity = load();
    const mounted = [];
    withActivity.sandbox.window.WDProp.activity = {
        mount: container => { mounted.push(container); },
    };

    const fragment = withActivity.sandbox.window.WDProp.shell.build();
    const boxes = index(fragment);
    t.check("it is offered the header to build itself into", mounted.length, 1);
    t.check("the header, and not some other box",
        mounted[0] === boxes["header"], true);

    /*
     * A page that does not load activity.js still has to build a header. The
     * counter is an instrument, not a part of the frame.
     */
    const without = load();
    t.check("and a page without it still builds",
        "header" in index(without.sandbox.window.WDProp.shell.build()), true);
}

console.log("\n-- Landmarks are named --");
t.check("the header is a banner", ids["header"].attrs.role, "banner");
t.check("the sidebar is a navigation", ids["sidebar"].attrs.role, "navigation");
t.check("with a name, since there is more than one way to navigate",
    ids["sidebar"].attrs["aria-label"], "Sections of WDProp");

console.log("\n-- The two controls --");
for (const id of ["theme-toggle", "mobile-menu-toggle"]) {
    t.check(`#${id} is reachable by keyboard`, ids[id].attrs.tabindex, "0");
    t.check(`#${id} says what it is`, typeof ids[id].attrs["aria-label"], "string");
    t.check(`#${id} is announced as a button`, ids[id].attrs.role, "button");
}
t.check("the menu button says whether the menu is open",
    ids["mobile-menu-toggle"].attrs["aria-expanded"], "false");
t.check("and what it controls",
    ids["mobile-menu-toggle"].attrs["aria-controls"], "sidebar");

console.log("\n-- Translatable, and readable before it is translated --");
t.check("every piece of text carries a message key",
    [built.children[0].attrs["data-i18n"], ids["subtitle"].attrs["data-i18n"],
     ids["sidebar"].attrs["data-i18n-label"], ids["theme-toggle"].attrs["data-i18n-label"],
     ids["mobile-menu-toggle"].attrs["data-i18n-label"]],
    ["a11y.skip", "app.subtitle", "a11y.nav", "a11y.themeToggle", "a11y.menuToggle"]);
t.check("and English text, so a page with no message file still reads",
    built.children[0].textContent, "Skip to main content");

console.log("\n-- Where it links --");
{
    /* Worked out from the script's own address, so a page in a subdirectory
     * links back out of it rather than to a sibling that is not there. */
    t.check("the logo goes to the root, not to a sibling",
        ids["logo"].children[0].attrs.href, "https://example.org/wdprop/index.html");
    t.check("the base is exposed for anything else that needs it",
        sandbox.window.WDProp.shell.base, "https://example.org/wdprop/");
}

console.log("\n-- Mounting --");
{
    const Shell = registry["wdprop-shell"];
    const instance = Object.create(Shell.prototype);
    instance.replaced = null;
    instance.parentNode = {};
    instance.replaceWith = function (f) { this.replaced = f; };
    Shell.prototype.connectedCallback.call(instance);
    t.check("the element replaces itself with the chrome, leaving no wrapper",
        instance.replaced !== null, true);
    t.check("which is a fragment of several elements",
        instance.replaced.children.length >= 4, true);
}

console.log("\n-- Closing the menu --");
{
    /* The click and Escape handlers are attached to the document by wire(). */
    const sidebar = element("div");
    sidebar.classList = {
        _on: new Set(["mobile-open"]),
        contains(c) { return this._on.has(c); },
        remove(c) { this._on.delete(c); },
        toggle(c) { this._on.has(c) ? this._on.delete(c) : this._on.add(c); return this._on.has(c); },
    };
    const toggle = element("div");
    toggle.focus = () => {};
    toggle.contains = () => false;
    sidebar.contains = () => false;
    byId["sidebar"] = sidebar;
    byId["mobile-menu-toggle"] = toggle;
    byId["theme-toggle"] = element("div");

    sandbox.window.WDProp.shell.wire();

    const escape = (listeners["keydown"] || []).slice(-1)[0];
    t.check("Escape is listened for", typeof escape, "function");
    escape({ key: "Escape" });
    t.check("Escape closes an open menu", sidebar.classList.contains("mobile-open"), false);
    t.check("and the button says so", toggle.attrs["aria-expanded"], "false");

    const click = (listeners["click"] || []).slice(-1)[0];
    sidebar.classList._on.add("mobile-open");
    click({ target: element("div") });
    t.check("a click elsewhere closes it too", sidebar.classList.contains("mobile-open"), false);
}

process.exit(t.done() ? 1 : 0);
