/*
 * WDProp - How much a property is used
 *
 * Translating P31 helps far more readers than translating an obscure external
 * identifier, so the workbench shows how heavily each property is used and can
 * order a page by it.
 *
 * There is no way to rank every property at once. The obvious query — count
 * statements grouped by property — times out on the query service, so the
 * figures come from two live sources instead:
 *
 *   - a count for any single property, from the search API's totalhits for
 *     haswbstatement, which answers in well under a second;
 *   - a ranked list of the hundred most used, parsed from the community's own
 *     report page, which is fetched like any other wiki page.
 *
 * Nothing is stored in the repository. Counts are cached in the browser for a
 * day, which is far shorter than the time it takes these numbers to move.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";
    var COUNTS_KEY = "wdprop-usage-counts";
    var TOP_KEY = "wdprop-usage-top";
    var TOP_PAGE = "Wikidata:Database reports/List of properties/Top100";

    var DAY = 24 * 60 * 60 * 1000;

    /* Enough requests in flight to be quick, few enough to stay polite. */
    var CONCURRENCY = 6;

    function readCache(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch (e) {
            return {};
        }
    }

    function writeCache(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // The cache is an optimisation; losing it costs only time.
        }
    }

    function fresh(entry) {
        return entry && typeof entry.n === "number" && (Date.now() - entry.at) < DAY;
    }

    /*
     * How many items carry a statement using this property. This is the same
     * measure for every property, which the report page's figures are not —
     * those count incoming links, including references — so the report is used
     * only for its ordering.
     */
    function fetchCount(property) {
        var url = API + "?action=query&list=search" +
            "&srsearch=" + encodeURIComponent("haswbstatement:" + property) +
            "&srlimit=0&srinfo=totalhits&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
            return r.json();
        }).then(function (json) {
            return json.query && json.query.searchinfo ?
                json.query.searchinfo.totalhits : null;
        }).catch(function () {
            // A property whose count cannot be read simply shows no figure.
            return null;
        });
    }

    /* Runs the tasks a few at a time rather than all at once. */
    function pool(items, worker) {
        var results = {};
        var index = 0;

        function next() {
            if (index >= items.length) {
                return Promise.resolve();
            }
            var item = items[index++];
            return worker(item).then(function (value) {
                results[item] = value;
                return next();
            });
        }

        var runners = [];
        for (var i = 0; i < Math.min(CONCURRENCY, items.length); i++) {
            runners.push(next());
        }
        return Promise.all(runners).then(function () {
            return results;
        });
    }

    /*
     * Usage counts for the given properties. Resolves to a map of identifier
     * to number; a property whose count could not be read is absent rather
     * than zero, so "unknown" is never shown as "unused".
     */
    function counts(ids) {
        var cache = readCache(COUNTS_KEY);
        var known = {};
        var wanted = [];

        ids.forEach(function (id) {
            if (fresh(cache[id])) {
                known[id] = cache[id].n;
            } else if (wanted.indexOf(id) === -1) {
                wanted.push(id);
            }
        });

        if (!wanted.length) {
            return Promise.resolve(known);
        }

        return pool(wanted, fetchCount).then(function (fetched) {
            Object.keys(fetched).forEach(function (id) {
                if (typeof fetched[id] === "number") {
                    known[id] = fetched[id];
                    cache[id] = { n: fetched[id], at: Date.now() };
                }
            });
            writeCache(COUNTS_KEY, cache);
            return known;
        });
    }

    /*
     * The hundred most used properties, in order, from the report the Wikidata
     * community maintains. Read live, so it is as current as that page.
     */
    function topProperties() {
        var cached = readCache(TOP_KEY);
        if (cached.ids && cached.ids.length && (Date.now() - cached.at) < DAY) {
            return Promise.resolve(cached.ids);
        }

        var url = API + "?action=parse&page=" + encodeURIComponent(TOP_PAGE) +
            "&prop=wikitext&format=json&origin=*";

        return fetch(url).then(function (r) {
            return r.json();
        }).then(function (json) {
            if (json.error || !json.parse) {
                throw new Error("The report page could not be read.");
            }
            var wikitext = json.parse.wikitext["*"];

            /* Rows look like:  | {{P|P2860}} || [ …WhatLinksHere… 313782331 ] */
            var ids = [];
            var pattern = /\{\{P\|(P[0-9]+)\}\}/g;
            var match = pattern.exec(wikitext);
            while (match) {
                if (ids.indexOf(match[1]) === -1) {
                    ids.push(match[1]);
                }
                match = pattern.exec(wikitext);
            }
            if (!ids.length) {
                throw new Error("No properties were listed on the report page.");
            }

            writeCache(TOP_KEY, { ids: ids, at: Date.now() });
            return ids;
        });
    }

    /* 118879567 becomes "119M", 2377 becomes "2,377". */
    function format(n) {
        if (typeof n !== "number") {
            return "";
        }
        if (n >= 1000000) {
            return Math.round(n / 1000000).toLocaleString() + "M";
        }
        if (n >= 10000) {
            return Math.round(n / 1000).toLocaleString() + "k";
        }
        return n.toLocaleString();
    }

    function clearCache() {
        writeCache(COUNTS_KEY, {});
        writeCache(TOP_KEY, {});
    }

    WDProp.usage = {
        counts: counts,
        topProperties: topProperties,
        format: format,
        clearCache: clearCache,
        internals: { fresh: fresh, pool: pool }
    };
})(window.WDProp);
