/*
 * WDProp - QuickStatements export
 *
 * Turns batch entries into QuickStatements V1 commands. WDProp does not
 * perform any edit itself: the commands are handed to the user, who runs
 * them on QuickStatements under their own account.
 *
 * Command syntax (V1), one command per line, fields separated by TAB:
 *
 *   P1476<TAB>Lta<TAB>"தலைப்பு"
 *   P1476<TAB>Dta<TAB>"வெளியிடப்பட்ட படைப்பின் தலைப்பு"
 *   P1476<TAB>Ata<TAB>"பெயர்"
 *
 * L and D overwrite the existing term, A appends an alias. WDProp only ever
 * emits L and D for terms it has established are missing.
 *
 * Reference: https://www.wikidata.org/wiki/Help:QuickStatements
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var QUICKSTATEMENTS_URL = "https://quickstatements.toolforge.org/#/v1=";

    /*
     * The one-click URL carries the commands in the fragment, so it is bound
     * by what browsers and QuickStatements will accept. Past this length the
     * export falls back to copy or download, which have no limit.
     */
    var MAX_URL_LENGTH = 1900;

    var TYPE_PREFIX = {
        label: "L",
        description: "D",
        alias: "A"
    };

    /*
     * QuickStatements does not use backslash escapes. A value containing a
     * double quote is wrapped in triple quotes with its own quotes doubled:
     *
     *   Toys "R" Us   ->   """Toys ""R"" Us"""
     */
    function escapeValue(value) {
        if (value.indexOf('"') === -1) {
            return '"' + value + '"';
        }
        return '"""' + value.replace(/"/g, '""') + '"""';
    }

    function command(entry) {
        var prefix = TYPE_PREFIX[entry.type];
        if (!prefix) {
            return null;
        }
        return entry.property + "\t" + prefix + entry.lang + "\t" + escapeValue(entry.value);
    }

    function batchText(entries) {
        return entries.map(command).filter(function (c) {
            return c !== null;
        }).join("\n");
    }

    /*
     * Builds the QuickStatements pre-load URL: TAB becomes "|", newline
     * becomes "||", then the whole thing is URL encoded.
     *
     * Returns {ok: false, reason} when the batch cannot travel this way, so
     * the caller can offer copy or download instead.
     */
    function urlFor(entries) {
        if (!entries.length) {
            return { ok: false, reason: "empty" };
        }

        /*
         * "|" is the field separator once TABs are substituted, so a value
         * containing one would be read as extra fields. Such a batch can
         * still be pasted into QuickStatements, where TAB is the separator.
         */
        var piped = entries.filter(function (e) {
            return e.value.indexOf("|") !== -1;
        });
        if (piped.length) {
            return { ok: false, reason: "pipe-in-value", entries: piped };
        }

        var text = batchText(entries);
        var encoded = encodeURIComponent(text.replace(/\t/g, "|").replace(/\n/g, "||"));

        if (encoded.length > MAX_URL_LENGTH) {
            return { ok: false, reason: "too-long", length: encoded.length };
        }

        return { ok: true, url: QUICKSTATEMENTS_URL + encoded };
    }

    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        // Fallback for browsers without the async clipboard API.
        return new Promise(function (resolve, reject) {
            var area = document.createElement("textarea");
            area.value = text;
            area.setAttribute("readonly", "readonly");
            area.style.position = "fixed";
            area.style.left = "-9999px";
            document.body.appendChild(area);
            area.select();
            try {
                document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
            } catch (e) {
                reject(e);
            } finally {
                document.body.removeChild(area);
            }
        });
    }

    function download(entries, filename) {
        var blob = new Blob([batchText(entries) + "\n"], {
            type: "text/plain;charset=utf-8"
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.setAttribute("href", url);
        a.setAttribute("download", filename || "wdprop-quickstatements.txt");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    WDProp.qs = {
        escapeValue: escapeValue,
        command: command,
        batchText: batchText,
        urlFor: urlFor,
        copy: copy,
        download: download,
        MAX_URL_LENGTH: MAX_URL_LENGTH
    };
})(window.WDProp);
