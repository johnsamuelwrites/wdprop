/*
 * WDProp - Waiting until the page is there
 *
 * Fifteen files opened with the same five lines: run now if the document has
 * been parsed, otherwise wait for DOMContentLoaded. They now share this, for
 * two reasons, and the second is the one that matters.
 *
 * The first is that it was the same five lines fifteen times.
 *
 * The second is that those five lines stopped being right when the scripts
 * were given defer. A deferred script runs after the document is parsed but
 * before DOMContentLoaded, and readyState is "interactive" by then, not
 * "loading" — so every one of those files took the second branch and started
 * immediately, in the order the scripts happen to be listed.
 *
 * That ordering is not free. i18n.js works out the interface language and
 * translates the document when it is ready, and a module that renders before
 * it has done so renders in English. Anything it writes carrying data-i18n is
 * caught and corrected a moment later; anything it writes as plain text is
 * not, and stays English for a reader who asked for French.
 *
 * Waiting for the event puts them back in a defined order — the order they
 * registered, which is the order they are loaded, which puts i18n.js first
 * because it is loaded first.
 *
 * Both events are listened for because readyState cannot distinguish "before
 * DOMContentLoaded" from "after" — it reads "interactive" either side of it —
 * so a file loaded after that event would otherwise wait for one that has
 * already been and gone.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    WDProp.ready = function (callback) {
        if (document.readyState === "complete") {
            callback();
            return;
        }

        var done = false;

        function run() {
            if (done) {
                return;
            }
            done = true;
            callback();
        }

        document.addEventListener("DOMContentLoaded", run);
        window.addEventListener("load", run);
    };
})(window.WDProp);
