/*
 * The service worker's list of files.
 *
 * sw.js names every file WDProp is made of, because there is no index to
 * discover them from: they are static files on whatever is serving them. A
 * file added to WDProp and left out of that list still works — it is fetched
 * from the network like anything else — and the omission shows up only when
 * someone opens that page with no connection, which is the one case the list
 * exists for.
 *
 * So the list is compared against the directory, in both directions:
 *
 *   listed but not on disk   the shell install fails outright. addAll rejects
 *                            as a unit, so one bad path means nothing at all
 *                            is cached and the whole application stays online-
 *                            only, silently
 *   on disk but not listed   that page or script is missing offline
 *
 * The second direction found compare.js and offlineview.js, which had been
 * left out since they were written, so compare.html and offline.html — the
 * page about working offline — were the two that did not.
 */
const fs = require("fs"), path = require("path");
const { suite } = require("./helpers");
const ROOT = path.join(__dirname, "..");

const t = suite("offline shell");

const source = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

/*
 * Files that are deliberately not in the shell.
 *
 * A service worker does not cache itself: the browser fetches sw.js on its own
 * terms to find out whether it has changed, and a cached copy would be how it
 * never does.
 */
const EXCLUDED = ["sw.js"];

const SUBDIRECTORIES = ["i18n", "aliases", "labels", "descriptions", "templates", "images"];

function shellList() {
    const block = source.match(/var SHELL = \[([\s\S]*?)\n\];/);
    if (!block) return null;
    return [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

function filesOnDisk() {
    const wanted = /\.(html|js|css|webmanifest|svg)$/;
    const out = [];
    for (const f of fs.readdirSync(ROOT)) {
        if (wanted.test(f) && fs.statSync(path.join(ROOT, f)).isFile()) out.push(f);
    }
    for (const d of SUBDIRECTORIES) {
        const dir = path.join(ROOT, d);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
            if (wanted.test(f)) out.push(d + "/" + f);
        }
    }
    return out;
}

console.log("\n-- The list can be read --");
const shell = shellList();
t.check("SHELL is where the test expects it", shell !== null, true);

if (shell) {
    console.log("\n-- Everything listed exists --");
    {
        /* addAll rejects as a unit: one wrong path and nothing is cached. */
        const absent = shell.filter(f => f !== "./" && !fs.existsSync(path.join(ROOT, f)));
        t.check("no entry names a file that is not there", absent, []);
        t.check("the application's own page is first", shell[0], "./");
        t.check("no duplicates", shell.length, new Set(shell).size);
    }

    console.log("\n-- Everything that exists is listed --");
    {
        const onDisk = filesOnDisk();
        const missing = onDisk.filter(f => !shell.includes(f) && !EXCLUDED.includes(f));
        t.check("every page and script is in the shell", missing, []);
        t.note(`${shell.length} entries, ${onDisk.length} files on disk`);
    }

    console.log("\n-- Every page's scripts are listed with it --");
    {
        /*
         * A page in the shell whose scripts are not is worse than a page left
         * out altogether: it opens offline and then does nothing.
         */
        const broken = [];
        for (const entry of shell) {
            if (!entry.endsWith(".html")) continue;
            const html = fs.readFileSync(path.join(ROOT, entry), "utf8");
            const dir = path.dirname(entry);
            for (const m of html.matchAll(/src="([^"]+\.js)"/g)) {
                const resolved = path.normalize(path.join(dir === "." ? "" : dir, m[1]));
                if (!shell.includes(resolved.split(path.sep).join("/"))) {
                    broken.push(entry + " needs " + m[1]);
                }
            }
        }
        t.check("no page is cached without the scripts it loads", broken, []);
    }

    console.log("\n-- Versioning --");
    {
        /*
         * The shell is replaced wholesale when this changes. Editing the list
         * without changing it leaves everyone who has already visited on the
         * old set of files.
         */
        t.check("the shell cache is versioned",
            /var SHELL_VERSION = "wdprop-shell-v\d+"/.test(source), true);
        t.check("the data cache is versioned separately",
            /var DATA_VERSION = "wdprop-data-v\d+"/.test(source), true);
        t.check("and the two are not the same name",
            source.match(/SHELL_VERSION = "([^"]+)"/)[1] !== source.match(/DATA_VERSION = "([^"]+)"/)[1],
            true);
    }
}

process.exit(t.done() ? 1 : 0);
