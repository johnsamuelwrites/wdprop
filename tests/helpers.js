/*
 * Shared scaffolding for the tests.
 *
 * WDProp runs in a browser, so the modules expect window, document and
 * localStorage. These are the smallest stand-ins that let the logic run under
 * Node: enough DOM to build and inspect elements, and nothing more.
 */

/*
 * The style object behaves both ways round: assigned to directly, as the
 * application does for display and visibility, and through setProperty, which
 * is the only way to set a hyphenated SVG presentation property. Both write
 * the same keys, so a test can read either.
 */
function styleObject() {
    const style = {};
    Object.defineProperty(style, "setProperty", {
        enumerable: false,
        value(name, value) { this[name] = String(value); },
    });
    return style;
}

function element(tag) {
    return {
        tag, children: [], attrs: {}, dataset: {}, listeners: {}, style: styleObject(),
        innerHTML: "", value: "", disabled: false, text: "",
        /*
         * The DOM's own spelling, upper-cased as a browser reports it. The
         * paging code tells a heading row from a data row this way, and with
         * only `tag` here it saw neither and left long tables unpaged.
         */
        get tagName() { return String(this.tag).toUpperCase(); },
        setAttribute(k, v) {
            this.attrs[k] = String(v);
            if (k.indexOf("data-i18n") === 0) {
                const suffix = k.slice("data-i18n".length);
                this.dataset[suffix
                    ? "i18n" + suffix.replace(/-(\w)/g, (_, c) => c.toUpperCase())
                    : "i18n"] = v;
            }
        },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        removeAttribute(k) { delete this.attrs[k]; },
        appendChild(c) { this.children.push(c); c.parent = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        /* Sets parentNode, as the DOM does: the pager control is inserted this
           way and has to be findable again to be removed when a filter
           re-pages. appendChild deliberately does not, so that tables built by
           the other suites stay outside the paging code's reach. */
        insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
        addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
        focus() { global.document.__active = this; },
        querySelector() { return null; },
        querySelectorAll(sel) {
            const want = sel.split(",").map(s => s.trim().replace(/\[href\]/, ""));
            const out = [];
            (function walk(x) {
                for (const c of x.children) { if (want.includes(c.tag)) out.push(c); walk(c); }
            })(this);
            return out;
        },
        get firstChild() { return this.children[0] || null; },
        get textContent() {
            if (this.text) return this.text;
            return this.children.map(c => c.text ?? c.textContent ?? "").join("");
        },
        /* Setting it replaces the children, as the DOM does. */
        set textContent(value) { this.children = []; this.text = String(value); },
    };
}

/* A browser-shaped global environment. Returns the store so tests can inspect it. */
function browser(options) {
    options = options || {};
    const store = options.store || {};
    const storage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    };

    global.window = {
        localStorage: storage,
        location: { search: options.search || "" },
        matchMedia: () => ({ matches: false }),
        history: { replaceState() {} },
    };
    global.localStorage = storage;
    global.sessionStorage = storage;
    global.navigator = { language: options.language || "en" };
    global.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() {} };
    global.document = {
        readyState: "complete",
        body: element("body"),
        documentElement: element("html"),
        head: { appendChild() {} },
        getElementById: options.getElementById || (() => null),
        createElement: element,
        /* SVG elements, which have to be created in their own namespace. */
        createElementNS: (ns, tag) => { const el = element(tag); el.namespace = ns; return el; },
        createTextNode: t => { const n = element("#text"); n.text = String(t); return n; },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        get activeElement() { return this.__active || null; },
    };
    return store;
}

/* Loads the real English messages behind a minimal i18n implementation. */
function messages(root) {
    const dict = {};
    global.window.WDProp = global.window.WDProp || {};
    global.WDProp = global.window.WDProp;
    global.window.WDProp.i18n = {
        add: (lang, d) => { if (lang === "en") Object.assign(dict, d); },
        t: (key, params) => {
            let s = dict[key];
            if (s === undefined) return key;
            (params || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(String(v)); });
            return s;
        },
        current: () => "en",
    };
    require(root + "/i18n/en.js");
    return dict;
}

/* A tiny assertion recorder. */
function suite(name) {
    const state = { pass: 0, fail: 0, name };
    return {
        check(label, actual, expected) {
            const a = JSON.stringify(actual), e = JSON.stringify(expected);
            if (a === e) { state.pass++; }
            else {
                state.fail++;
                console.log(`  FAIL ${label}\n        expected ${e}\n        actual   ${a}`);
            }
        },
        note(text) { console.log("       " + text); },
        done() {
            console.log(`  ${state.name}: ${state.pass} passed, ${state.fail} failed`);
            return state.fail;
        },
    };
}

module.exports = { element, browser, messages, suite };
