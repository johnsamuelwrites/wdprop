/*
 * Runs every *.test.js in this directory and reports the total.
 *
 *     node tests/run.js
 *
 * Some suites reach Wikidata, so a run needs a network connection and takes a
 * few seconds.
 */
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
let failed = 0;

for (const file of files) {
    try {
        process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, file)],
            { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
    } catch (e) {
        if (e.stdout) process.stdout.write(e.stdout);
        console.log(`  ${file}: FAILED`);
        failed++;
    }
}

console.log(failed ? `\n${failed} of ${files.length} suites failed` : `\nall ${files.length} suites passed`);
process.exit(failed ? 1 : 0);
