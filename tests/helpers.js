/*
 * Shared scaffolding for the tests.
 *
 * WDProp runs in a browser, so the modules expect window, document and
 * localStorage. These are the smallest stand-ins that let the logic run under
 * Node: enough DOM to build and inspect elements, and nothing more.
 */

function element(tag) {
    return {
        tag, children: [], attrs: {}, dataset: {}, listeners: {}, style: {},
        innerHTML: "", value: "", disabled: false, text: "",
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
        appendChild(c) { this.children.push(c); c.parent = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        insertBefore(c) { this.children.unshift(c); return c; },
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
        get textContent() { return this.children.map(c => c.text ?? c.textContent ?? "").join(""); },
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
