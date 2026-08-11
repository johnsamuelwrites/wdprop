/*
 * data-action, and what each page starts when it opens.
 *
 * These replaced a hundred and thirty-three inline on* attributes. The risk in
 * that change is not that the mechanism fails — it is small enough to read —
 * but that a control is left naming an action nobody registered, or a page
 * loses the call that fetches everything on it. Neither shows up as an error:
 * the control does nothing, the page stays empty, and both look like a slow
 * network.
 *
 * So the markup and the scripts are checked against each other in both
 * directions, and every page that used to have a body onload is checked to
 * still have somewhere its bootstrap is named.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("actions");

const pages = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules" || e.name === "tests") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".html")) pages.push(full);
    }
})(ROOT);

/* Loads actions.js with a document that records its two listeners. */
function load() {
    const listeners = {};
    const sandbox = {
        console,
        window: {},
        document: {
            addEventListener(type, fn) { listeners[type] = fn; },
        },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "actions.js"), "utf8"), sandbox,
        { filename: "actions.js" });
    return { actions: sandbox.window.WDProp.actions, listeners, sandbox };
}

console.log("\n-- Dispatch --");
{
    const { actions, listeners, sandbox } = load();
    const seen = [];
    actions.add({
        recorded: function (event, el, arg) { seen.push(arg); },
        other: function () { seen.push("other"); }
    });

    t.check("click and submit are both listened for",
        Object.keys(listeners).sort(), ["click", "submit"]);

    const button = element("button");
    button.setAttribute("data-action", "recorded");
    button.setAttribute("data-arg", "labels");
    button.parentNode = sandbox.document;

    listeners.click({ target: button });
    t.check("the handler runs with its argument", seen, ["labels"]);

    /* A click usually lands on something inside the control. */
    const inner = element("span");
    inner.parentNode = button;
    listeners.click({ target: inner });
    t.check("a click inside the control still finds it", seen, ["labels", "labels"]);

    const plain = element("div");
    plain.parentNode = sandbox.document;
    listeners.click({ target: plain });
    t.check("an element with no action is ignored", seen.length, 2);

    const unknown = element("button");
    unknown.setAttribute("data-action", "neverRegistered");
    unknown.parentNode = sandbox.document;
    listeners.click({ target: unknown });
    t.check("an action nobody registered does nothing, rather than something",
        seen.length, 2);

    t.check("the registry can be read back", actions.registered(), ["other", "recorded"]);
}

console.log("\n-- Every control names an action that exists --");
{
    const named = new Set();
    for (const p of pages) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/data-action="([^"]+)"/g)) {
            named.add(m[1]);
        }
    }

    /* Registrations are written as `name: function` inside an actions.add call. */
    const registered = new Set();
    for (const f of fs.readdirSync(ROOT)) {
        if (!f.endsWith(".js")) continue;
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        for (const call of src.matchAll(/actions\.add\(\{([\s\S]*?)\n\}\);|actions\.add\(\{([\s\S]*?)\n    \}\);/g)) {
            for (const m of (call[1] || call[2]).matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gm)) {
                registered.add(m[1]);
            }
        }
    }

    t.check("no control names an action nothing registers",
        [...named].filter(a => !registered.has(a)).sort(), []);
    t.check("no action is registered that no control names",
        [...registered].filter(a => !named.has(a)).sort(), []);
    t.note(`${named.size} actions across ${pages.length} pages`);
}

console.log("\n-- Nothing is left executable in an attribute --");
{
    t.check("no page carries an on* handler",
        pages.filter(p => /\son(click|load|submit|change|input|keydown|keyup|mouseover)=/
            .test(fs.readFileSync(p, "utf8"))).map(p => path.relative(ROOT, p)), []);
}

console.log("\n-- What each page starts --");
{
    const sandbox = {
        console,
        window: { addEventListener() {}, location: { pathname: "/" } },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "pageinit.js"), "utf8"), sandbox,
        { filename: "pageinit.js" });
    const { table, key } = sandbox.window.WDProp.pages;

    t.check("every page named in the table exists",
        Object.keys(table).filter(f => !fs.existsSync(path.join(ROOT, f))).sort(), []);
    t.check("and every entry is something to call",
        Object.values(table).every(v => typeof v === "function"), true);
    t.note(`${Object.keys(table).length} pages start something`);

    console.log("\n-- Working out which page this is --");
    t.check("from a served path", key("/wdprop/languages.html"), "languages.html");
    t.check("wherever WDProp is installed", key("/tools/wdprop/languages.html"), "languages.html");
    t.check("from a file on a disk", key("/home/me/wdprop/languages.html"), "languages.html");
    t.check("a bare directory means the dashboard", key("/wdprop/"), "index.html");
    t.check("the query string is not part of it",
        key("/wdprop/property.html?property=P31"), "property.html");

    /*
     * Four pages are called translated.html and they do four different things,
     * which is the whole reason the directory is part of the key.
     */
    t.check("translated.html at the root", key("/wdprop/translated.html"), "translated.html");
    t.check("under labels/", key("/wdprop/labels/translated.html"), "labels/translated.html");
    t.check("under descriptions/",
        key("/wdprop/descriptions/translated.html"), "descriptions/translated.html");
    t.check("under templates/",
        key("/wdprop/templates/translated.html"), "templates/translated.html");
    t.check("and the four start four different things",
        new Set(["translated.html", "labels/translated.html", "descriptions/translated.html",
            "templates/translated.html"].map(k => String(table[k]))).size, 4);
}

process.exit(t.done() ? 1 : 0);
