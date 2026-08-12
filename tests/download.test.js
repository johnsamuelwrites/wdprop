/*
 * download.js: what leaves the page, and whether it is true.
 *
 * The interesting cases are all about honesty rather than formatting. A long
 * listing holds every row and the names of only the rows that have been paged
 * to, so the file that leaves says less than the heading above it does; the
 * control has to say so before it is clicked. And a description holding a
 * comma, a quote or a newline — property descriptions hold all three — turns
 * into extra columns in a spreadsheet unless it is quoted properly, which is
 * the sort of fault nobody sees until the data is somewhere else.
 */
const path = require("path");
const { browser, element, suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

browser();
global.window.WDProp = {};
global.WDProp = global.window.WDProp;

/* The real English messages, so the note is checked in the words it shows. */
const dict = {};
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
require(ROOT + "/i18n/en.js");

require(ROOT + "/download.js");
const download = global.window.WDProp.download;

const t = suite("download");

/* ------------------------------------------------------------- a table stub */

/*
 * The DOM's own shape: a table reports its rows, a row reports its cells. The
 * shared stub does not model either, and download.js reads both, so they are
 * built here rather than pretended away.
 */
function table(headings, rows) {
    const node = element("table");
    const made = [];

    function row(values, tag) {
        const tr = element("tr");
        tr.cells = values.map(v => {
            const cell = element(tag);
            cell.textContent = v;
            return cell;
        });
        tr.children = tr.cells;
        return tr;
    }

    made.push(row(headings, "th"));
    for (const r of rows) made.push(row(r, "td"));
    node.rows = made;
    return node;
}

/* ------------------------------------------------------------------ reading */

{
    const node = table(["Property", "Label", "Description"], [
        ["P31", "instance of", "that class of which this subject is a particular example"],
        ["P279", "subclass of", "this item is a subclass of that item"],
    ]);

    const read = download.readTable(node);
    t.check("the headings come from the header row", read.headings,
        ["Property", "Label", "Description"]);
    t.check("and every row is read, not only the page on show",
        read.rows.length, 2);
    t.check("a row is its cells in order", read.rows[0][1], "instance of");
}

/* --------------------------------------------------- rows that are not filled */

{
    /*
     * What a listing of four thousand properties looks like after one page has
     * been looked at: the identifiers are all there, the names are not.
     */
    const rows = [["P31", "instance of", "a description"]];
    for (let i = 0; i < 9; i++) rows.push(["P" + (100 + i), "…", ""]);

    const node = table(["Property", "Label", "Description"], rows);
    const read = download.readTable(node);

    t.check("every row is still exported", read.rows.length, 10);
    t.check("but only the fetched ones count as named",
        download.namedRows(read), 1);

    const csv = download.csvText(read);
    t.check("an unfetched row carries its identifier and nothing invented",
        csv.split("\r\n")[2], "P100,…,");
}

/* ----------------------------------------------------------- CSV that survives */

{
    /*
     * The three characters that break a CSV, all of which occur in real
     * property descriptions.
     */
    const node = table(["Property", "Description"], [
        ["P1476", 'title of a published work, e.g. "Hamlet"'],
        ["P17", "country, state or region"],
        ["P18", "an image\nover two lines"],
    ]);

    const csv = download.csvText(download.readTable(node));

    t.check("a quote is doubled and the field is quoted",
        csv.indexOf('"title of a published work, e.g. ""Hamlet"""') !== -1, true);
    t.check("a comma alone is enough to need quoting",
        csv.indexOf('"country, state or region"') !== -1, true);
    /*
     * A newline inside a cell is collapsed rather than quoted through: it is
     * whitespace in the markup, and a spreadsheet given a real line break in a
     * quoted field is correct but unreadable.
     */
    t.check("a line break inside a cell becomes a space",
        csv.indexOf("an image over two lines") !== -1, true);
    t.check("the file ends with a line ending, as a text file should",
        /\r\n$/.test(csv), true);
}

/* ------------------------------------------------------------------ JSON */

{
    const node = table(["Property", "Label"], [["P31", "instance of"]]);
    const parsed = JSON.parse(download.jsonText(download.readTable(node)));

    t.check("one object per row", parsed.length, 1);
    t.check("keyed by heading, so no one counts columns",
        parsed[0], { Property: "P31", Label: "instance of" });
}

/* ------------------------------------------------------------------ the note */

{
    /*
     * The control is built against the real DOM shape, so this checks the
     * wording rather than the plumbing — the wording is the part that has to
     * be right before anyone clicks.
     */
    const whole = global.window.WDProp.i18n.t("download.whole", [4339]);
    const partial = global.window.WDProp.i18n.t("download.partial", [4339, 50]);

    t.check("a fully fetched table just says how many rows", whole, "4339 rows");
    t.check("a partly fetched one says how many are named",
        partial.indexOf("4339 rows, 50 named so far") === 0, true);
    t.check("and what the rest hold",
        partial.indexOf("only their identifier") !== -1, true);
}

/* ------------------------------------------------- an SVG that leaves the page */

{
    /*
     * The diagram fills its text with var(--text-primary). Away from this
     * stylesheet that resolves to nothing and the labels do not draw, so the
     * copy that leaves has the colours written into it.
     */
    const svg = element("svg");
    const label = element("text");
    label.setAttribute("fill", "var(--text-primary)");
    const arc = element("path");
    arc.style.setProperty("stroke", "var(--accent-color)");
    svg.children = [label, arc];

    download.resolveVariables(svg, {
        getPropertyValue: name => ({
            "--text-primary": " #1a202c",
            "--accent-color": "#667eea",
        }[name] || ""),
    });

    t.check("a colour named in an attribute is resolved",
        label.getAttribute("fill"), "#1a202c");
    t.check("and one named in a style is too",
        arc.style.getPropertyValue("stroke"), "#667eea");

    /* A variable with nothing behind it is left alone rather than blanked. */
    const orphan = element("text");
    orphan.setAttribute("fill", "var(--not-a-token)");
    download.resolveVariables(orphan, { getPropertyValue: () => "" });
    t.check("an unknown variable is left as it was, not emptied",
        orphan.getAttribute("fill"), "var(--not-a-token)");
}

process.exit(t.done());
