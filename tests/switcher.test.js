/*
 * The language chooser says which language is being shown.
 *
 * It did not, and the way it failed is worth keeping a test for: the page was
 * correctly in French — from ?uselang=fr, from a stored choice, or from the
 * browser's own setting — and the chooser beside it read "English". Whoever
 * saw that had no way to tell whether the page or the chooser was lying, and
 * picking French to correct it did nothing they could see, French already
 * being what was on screen.
 *
 * The cause was ordering. mountSwitcher runs before setLanguage, because the
 * chooser has to exist before there is a language to mark in it, so the option
 * it marked was whatever `current` was at the time: the fallback, always. Then
 * the language was settled and nothing went back.
 *
 * So each route in is checked, and the asynchronous one is checked separately:
 * a language other than English arrives when its message file loads, which is
 * after everything else has finished.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("language chooser");

/*
 * Enough of a browser to run i18n.js. The message files are loaded by adding a
 * script tag, so head.appendChild is where a request would be made: what it is
 * asked for is recorded, and the file is run when the test says so, which is
 * what makes the timing visible.
 */
function load(options) {
    options = options || {};
    const store = options.store || {};
    const byId = {};
    const pending = [];

    const storage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    };

    /*
     * Announced when the language is applied, for the parts of a page i18n.js
     * cannot retranslate: what Wikidata sent was fetched in one language and
     * has to be asked for again in another.
     */
    const announced = [];

    const sandbox = {
        console,
        CustomEvent: function (type, init) {
            this.type = type;
            this.detail = init && init.detail;
        },
        window: {
            location: { search: options.search || "" },
            localStorage: storage,
        },
        localStorage: storage,
        navigator: { language: options.language || "en" },
        document: {
            readyState: "complete",
            currentScript: { src: "https://example.org/wdprop/i18n.js" },
            documentElement: element("html"),
            head: {
                appendChild(node) {
                    pending.push(node);
                    return node;
                },
            },
            createElement: element,
            createTextNode: text => {
                const n = element("#text");
                n.text = String(text);
                return n;
            },
            getElementById: id => byId[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
            dispatchEvent(event) { announced.push(event); return true; },
        },
    };

    /* The header the chooser is put into, as shell.js would have built it. */
    byId["header"] = element("div");
    byId["theme-toggle"] = element("div");
    byId["header"].appendChild(byId["theme-toggle"]);
    sandbox.document.getElementById = id => {
        if (id === "language-switcher") {
            return byId["header"].children.find(c => c.tag === "select") || null;
        }
        return byId[id] || null;
    };

    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ["ready.js", "i18n.js"]) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox,
            { filename: file });
    }

    return {
        sandbox,
        store,
        pending,
        announced,
        chooser: () => byId["header"].children.find(c => c.tag === "select"),
        /* Runs a message file that i18n.js asked for, as the browser would. */
        deliver(language, dictionary) {
            sandbox.window.WDProp.i18n.add(language, dictionary || { "app.subtitle": "x" });
        },
    };
}

/* What the chooser is showing, read the way a reader sees it. */
function showing(select) {
    if (!select) {
        return null;
    }
    const marked = select.options.filter(o => o.getAttribute("selected"));
    return {
        value: select.value,
        marked: marked.map(o => o.getAttribute("value")),
    };
}

/* ------------------------------------------------------- English by default */

{
    const page = load();
    t.check("the chooser is built", !!page.chooser(), true);
    t.check("and shows English when nothing asks for anything else",
        showing(page.chooser()), { value: "en", marked: ["en"] });
}

/* ------------------------------------------------------ uselang in the address */

{
    const page = load({ search: "?uselang=fr" });

    /*
     * French is not on screen yet — its messages are still being fetched — so
     * the chooser has not moved. This is the state the fault was frozen in.
     */
    /* i18n.js sets script.src as a property, which is what a browser loads from. */
    t.check("the French message file is asked for",
        page.pending.length === 1 && /i18n\/fr\.js$/.test(page.pending[0].src), true);

    page.deliver("fr");

    t.check("once the page is in French, so is the chooser",
        showing(page.chooser()), { value: "fr", marked: ["fr"] });
    t.check("and English is no longer marked",
        page.chooser().options.filter(o => o.getAttribute("value") === "en")
            .every(o => o.getAttribute("selected") === null), true);
}

/* ------------------------------------------------------- a remembered choice */

{
    const page = load({ store: { "wdprop-language": "es" } });
    page.deliver("es");
    t.check("a language chosen on an earlier visit is shown as chosen",
        showing(page.chooser()), { value: "es", marked: ["es"] });
}

/* --------------------------------------------------- what the browser asks for */

{
    const page = load({ language: "fr-CA" });
    page.deliver("fr");
    t.check("a browser asking for fr-CA is shown as French",
        showing(page.chooser()), { value: "fr", marked: ["fr"] });
}

/* ------------------------------------------------------------ changing it back */

{
    const page = load({ search: "?uselang=fr" });
    page.deliver("fr");

    const select = page.chooser();
    select.value = "en";
    select.listeners.change[0]();

    t.check("choosing English shows English", showing(select),
        { value: "en", marked: ["en"] });
    t.check("and it is remembered for the next visit",
        page.store["wdprop-language"], "en");
}

/* ------------------------------------------------------------ still reachable */

{
    const page = load();
    const select = page.chooser();
    t.check("the chooser names itself for a screen reader",
        typeof select.getAttribute("aria-label"), "string");
    t.check("and offers every language WDProp has",
        select.options.map(o => o.getAttribute("value")), ["en", "fr", "es"]);
}

/* ------------------------------------------- the change is announced */

/*
 * The interface retranslates itself from the message files; a table of
 * property labels cannot. search.html listens for this and asks Wikidata
 * again, which is what stops a French page carrying English labels.
 */
{
    const page = load({ search: "?uselang=fr" });
    page.deliver("fr", { "app.subtitle": "Tout sur les propriétés" });
    t.check("applying a language says so",
        page.announced.map(e => e.type), ["wdprop:language"]);
    t.check("and says which one", page.announced[0].detail, "fr");
}

process.exit(t.done());
