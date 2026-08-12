/*
 * Whether the colours can actually be read.
 *
 * A stylesheet with two themes has twice as many ways to be unreadable, and
 * neither shows up in a test that only looks at markup. Both faults this
 * suite was written after were of that kind:
 *
 *   - white on the dark theme's accent, which is a bright cyan: 1.77:1. The
 *     property identifiers on every listing were drawn that way;
 *   - the light theme's accent as link text: 3.41:1 on the page background,
 *     below AA for anything anyone has to read.
 *
 * Neither was a mistake anyone could see in a diff. Both are arithmetic, and
 * arithmetic is what a test is for.
 *
 * So the tokens are read out of style.css, both themes are resolved, and every
 * pair the stylesheet actually puts together is measured against WCAG 2.1. The
 * pairs are listed here by hand: a rule that puts an ink on a background is a
 * decision, and this is where the decisions are declared so that a new one has
 * to be added deliberately rather than being discovered by a reader.
 */
const fs = require("fs"), path = require("path");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
const s = suite("contrast");

/* ------------------------------------------------------------------ reading */

/*
 * Which block a declaration came from decides what it means, so the blocks are
 * read separately rather than as one heap.
 *
 * A working name like --accent-color is declared twice: once in :root, where
 * it points at the light palette, and once in :root[data-theme="dark"], where
 * it points at the dark one. Reading them into a single map and letting the
 * first win — which is what this did at first — silently resolves both themes
 * to the light palette, and every dark-theme assertion then passes by
 * measuring light-theme colours. The bug this suite exists to catch is exactly
 * the sort that hides there.
 *
 * The media-query form is deliberately not read. It says the same thing as the
 * [data-theme] block for a reader who has chosen nothing, and reading one of
 * the two is enough to know what the dark theme resolves to.
 */
function blocks(selector) {
    const found = [];
    const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "\\s*\\{([^}]*)\\}", "g");
    for (const m of css.matchAll(pattern)) {
        found.push(m[1]);
    }
    return found;
}

function declarations(text) {
    const out = {};
    for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) {
        out[m[1]] = m[2].trim();
    }
    return out;
}

/* The palettes and everything else, from the theme-neutral :root blocks. */
const light = Object.assign({}, ...blocks(":root").map(declarations));
const dark = Object.assign({}, light,
    ...blocks(':root[data-theme="dark"]').map(declarations));

const palette = { light: light, dark: dark };

/* A token resolved down to a literal colour, following var() indirection. */
function resolve(name, theme) {
    let value = palette[theme][name];
    for (let step = 0; step < 8; step++) {
        const via = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(String(value || "").trim());
        if (!via) {
            return String(value || "").trim();
        }
        value = palette[theme][via[1]];
    }
    return String(value || "").trim();
}

/* ----------------------------------------------------------------- measuring */

function channels(colour) {
    const hex = colour.replace("#", "");
    const full = hex.length === 3
        ? hex.split("").map(c => c + c).join("")
        : hex;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
}

/* WCAG 2.1 relative luminance. */
function luminance(colour) {
    const [r, g, b] = channels(colour).map(c =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(front, back) {
    const a = luminance(front), b = luminance(back);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ------------------------------------------------- the pairs the CSS makes */

/*
 * Each entry is an ink, a background, and where the two meet. AA is 4.5:1 for
 * text at ordinary sizes, which is what all of these are — WDProp has no
 * display type, and a threshold that has to be argued for is a threshold that
 * will be argued down.
 */
const AA = 4.5;

const pairs = [
    ["--text-primary", "--bg-primary", "body text on the page"],
    ["--text-primary", "--bg-secondary", "body text on a card"],
    ["--text-secondary", "--bg-primary", "secondary text on the page"],
    ["--text-secondary", "--bg-secondary", "secondary text on a card"],

    /*
     * The two the faults were in. The first is a link anywhere on the page;
     * the second is the ink inside a filled pill, which is where white on
     * cyan was.
     */
    ["--accent-strong", "--bg-primary", "a link on the page"],
    ["--accent-strong", "--bg-secondary", "a link on a card"],
    ["--on-accent", "--accent-strong", "the ink inside a filled accent"],
    ["--nav-hover-text", "--nav-hover-bg", "a navigation link being pointed at"],

    ["--accent-hover", "--bg-primary", "a link being pointed at"],
    ["--accent-hover", "--bg-secondary", "a link being pointed at, on a card"],

    /* Status colours are read as words, not only as colours. */
    ["--wdp-danger", "--bg-secondary", "a failure message"],
    ["--wdp-ok", "--bg-secondary", "a success message"],
];

for (const theme of ["light", "dark"]) {
    for (const [ink, ground, where] of pairs) {
        const front = resolve(ink, theme);
        const back = resolve(ground, theme);

        if (!/^#[0-9a-f]{3,8}$/i.test(front) || !/^#[0-9a-f]{3,8}$/i.test(back)) {
            s.check(`${theme}: ${where} resolves to colours`,
                [ink, front, ground, back], "two colours");
            continue;
        }

        const measured = ratio(front, back);
        s.check(`${theme}: ${where} reaches AA (${measured.toFixed(2)}:1)`,
            measured >= AA, true);
    }
}

/* ------------------------------------------------------ what went wrong before */

/*
 * The specific pairing that was on screen, kept as a test of its own so that
 * the number is written down: white on the dark accent is 1.77:1, and if
 * anyone reaches for white there again this says what it costs.
 */
{
    const darkAccent = resolve("--accent-color", "dark");
    s.check("white on the dark accent is still as unreadable as it was",
        ratio("#ffffff", darkAccent) < 2, true);
    s.check("which is why --on-accent exists and is not white there",
        resolve("--on-accent", "dark").toLowerCase() === "#ffffff", false);
}

/*
 * A background changed without its ink is what made a hovered row unreadable:
 * the cell kept a colour chosen for a background that had been taken away.
 * Nothing here can check every rule, but the one that caused it is named.
 */
{
    const rule = /tr:hover>td\s*\{([^}]*)\}/.exec(css);
    s.check("the row-hover rule exists", !!rule, true);
    if (rule) {
        s.check("and sets an ink as well as a background",
            /background\s*:/.test(rule[1]) && /color\s*:/.test(rule[1]), true);
    }
}

/*
 * The pill styling is asked for by element, so it cannot reach the table cells
 * that carry the same class for a different reason.
 */
s.check("the filled pill is scoped to the element it was written for",
    /div\.property,\s*\n\s*div\.deletedproperty/.test(css), true);
s.check("and the identifier cell is styled separately",
    /td\.property,/.test(css), true);

process.exit(s.done());
