/*
 * WDProp - How much a property is used
 *
 * Translating P31 helps far more readers than translating an obscure external
 * identifier, so the workbench shows how heavily each property is used and can
 * order a page by it.
 *
 * There is no way to rank every property at once. The obvious query — count
 * statements grouped by property — times out on the query service.
 *
 * The search API answers for one property at a time, from totalhits for
 * haswbstatement, in well under a second. That was how the column was filled,
 * and it is what makes this file worth rereading: a page of fifty rows was
 * fifty requests. Paged through a datatype holding four thousand properties it
 * was fifty more for every page turned, all of them to fill one column, and
 * the fault was invisible from the outside because each was quick.
 *
 * The community maintains the answer already. Its property reports are ranked
 * by use and paged a thousand at a time — 1-1000 is the thousand most used
 * properties with their exact counts, then 1001-2000, and so on to the end of
 * about fourteen thousand. One page is one request and covers a thousand
 * properties, so a table of fifty costs nothing at all once it has been read.
 *
 * Being ranked is what makes the tail cheap too. A property absent from the
 * pages read so far is used less than the last row of the deepest one read,
 * and that bound is the honest answer — "fewer than 1,200" — rather than a
 * request per cell for a figure nobody needs precisely. It is exactly the
 * information the column is for: enough to sort by, enough to choose by. The
 * exact figure is a single request on the property's own page, where one
 * request answers for one property, which is a fair trade.
 *
 * At most two report pages are read for any one call, so a page of a table
 * costs at most two requests however obscure its properties. The pages read
 * accumulate in the day's cache, so the second page of a listing usually costs
 * none.
 *
 * Nothing is stored in the repository. Everything is cached in the browser for
 * a day, which is far shorter than the time it takes these numbers to move.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";
    var COUNTS_KEY = "wdprop-usage-counts";
    var TOP_KEY = "wdprop-usage-top";
    var RANKS_KEY = "wdprop-usage-ranks";
    var TOP_PAGE = "Wikidata:Database reports/List of properties/Top100";
    var RANK_PAGE = "Wikidata:Database reports/List of properties/";

    var DAY = 24 * 60 * 60 * 1000;

    /* Properties per report page, which is how the community pages them. */
    var RANK_SIZE = 1000;

    /*
     * How deep the reports go. Read in order and stopped at the first one that
     * does not exist, so this is a ceiling rather than a count: Wikidata gains
     * properties, and a new report page appears without anything changing
     * here. Twenty thousand is comfortably beyond the fourteen thousand that
     * exist.
     */
    var RANK_LIMIT = 20;

    /*
     * Report pages read for any single call. The bound on what a page of a
     * table can cost: two requests, whatever is in it and however many rows it
     * has. What is not resolved within them is answered as a bound instead,
     * and the next call may read two more.
     */
    var RANK_BUDGET = 2;

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
     * How many items carry a statement using this property, asked of the
     * search API. One request for one property, so it is used where that is
     * the whole question — a single property's own page — and never to fill a
     * column of a table.
     */
    function exact(property) {
        var cache = readCache(COUNTS_KEY);
        if (fresh(cache[property])) {
            return Promise.resolve(cache[property].n);
        }

        var url = API + "?action=query&list=search" +
            "&srsearch=" + encodeURIComponent("haswbstatement:" + property) +
            "&srlimit=0&srinfo=totalhits&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
            return r.json();
        }).then(function (json) {
            var n = json.query && json.query.searchinfo
                ? json.query.searchinfo.totalhits : null;
            if (typeof n === "number") {
                cache[property] = { n: n, at: Date.now() };
                writeCache(COUNTS_KEY, cache);
            }
            return n;
        }).catch(function () {
            // A property whose count cannot be read simply shows no figure.
            return null;
        });
    }

    /* ------------------------------------------------------ the ranked reports */

    /*
     * The report pages are titled by rank, a thousand at a time: the first is
     * "1-1000" and holds the thousand most used properties.
     */
    function rankTitle(index) {
        return RANK_PAGE + (index * RANK_SIZE + 1) + "-" + ((index + 1) * RANK_SIZE);
    }

    function emptyRanks() {
        return { at: Date.now(), depth: 0, floor: null, end: false, counts: {} };
    }

    function readRanks() {
        var held = readCache(RANKS_KEY);
        if (held && held.counts && (Date.now() - held.at) < DAY) {
            return held;
        }
        return emptyRanks();
    }

    /*
     * One report page: a table of properties and their counts, rendered rather
     * than as wikitext, because the page itself is two lines invoking a module
     * and the figures only exist once that has run.
     *
     * Parsed a row at a time rather than with one expression over the whole
     * page. A row missing its figure would otherwise let the match run on into
     * the next one and pair a property with another property's count, which is
     * the kind of wrong that looks entirely plausible.
     */
    function fetchRankPage(index) {
        var url = API + "?action=parse&page=" +
            encodeURIComponent(rankTitle(index)) +
            "&prop=text&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
            return r.json();
        }).then(function (json) {
            /* Past the last report page. Not a failure: it is how the end of
             * the list is found without hard-coding how long it is. */
            if (json.error) {
                return null;
            }
            if (!json.parse || !json.parse.text) {
                throw new Error("The report page could not be read.");
            }

            var html = String(json.parse.text["*"]);
            var found = {};
            var lowest = null;
            var rows = html.split("<tr");

            for (var i = 0; i < rows.length; i++) {
                var property = /Property:(P[0-9]+)/.exec(rows[i]);
                var figure = /<td>\s*([0-9]+)\s*(?:<|$)/.exec(rows[i]);
                if (property && figure) {
                    var n = parseInt(figure[1], 10);
                    found[property[1]] = n;
                    if (lowest === null || n < lowest) {
                        lowest = n;
                    }
                }
            }

            if (!Object.keys(found).length) {
                throw new Error("No properties were listed on the report page.");
            }
            return { counts: found, lowest: lowest };
        });
    }

    /*
     * Reads further report pages, in rank order, until every wanted property
     * is accounted for or the budget is spent.
     *
     * The order matters and is not an implementation detail: it is what makes
     * an absent property meaningful. Pages one to n having been read, anything
     * not in them is used less than the lowest figure in page n, and that is
     * the bound the caller shows.
     */
    function loadRanks(ranks, wanted, budget) {
        if (budget <= 0 || ranks.end || ranks.depth >= RANK_LIMIT) {
            return Promise.resolve(ranks);
        }

        var outstanding = wanted.filter(function (id) {
            return !(id in ranks.counts);
        });
        if (!outstanding.length) {
            return Promise.resolve(ranks);
        }

        return fetchRankPage(ranks.depth).then(function (page) {
            if (!page) {
                ranks.end = true;
                return ranks;
            }

            Object.keys(page.counts).forEach(function (id) {
                ranks.counts[id] = page.counts[id];
            });
            ranks.depth++;
            ranks.floor = page.lowest;

            return loadRanks(ranks, wanted, budget - 1);
        });
    }

    /*
     * Usage counts for the given properties, in as few requests as the reports
     * allow — none at all when the day's cache already covers them.
     *
     * Resolves to a map of identifier to either a number, which is exact, or
     * an object { below: n }, which says the property is used less than n
     * times. A property that could not be placed at all is absent rather than
     * zero, so "unknown" is never shown as "unused".
     */
    function counts(ids) {
        var ranks = readRanks();
        var wanted = ids.filter(function (id, at) {
            return ids.indexOf(id) === at;
        });

        var before = ranks.depth;

        return loadRanks(ranks, wanted, RANK_BUDGET).catch(function () {
            /* A report that could not be read leaves whatever was already
             * held usable, rather than emptying the column. */
            return ranks;
        }).then(function (loaded) {
            if (loaded.depth !== before) {
                loaded.at = Date.now();
                writeCache(RANKS_KEY, loaded);
            } else if (loaded.depth > 0 && window.WDProp && window.WDProp.activity) {
                /*
                 * Worth saying out loud. Without it the request panel shows a
                 * page that cost nothing and gives no hint why, when the
                 * reason — a report read earlier answering fifty rows — is the
                 * interesting part.
                 */
                window.WDProp.activity.note("activity.usagecached", [wanted.length]);
            }

            var known = {};
            wanted.forEach(function (id) {
                if (id in loaded.counts) {
                    known[id] = loaded.counts[id];
                } else if (typeof loaded.floor === "number") {
                    /*
                     * The reports list every property used at least once, so
                     * a property missing from all of them is used no times.
                     * That is a claim about a property Wikidata may have
                     * created this morning, and being wrong about it would
                     * read as fact, so the bound is never narrowed past two.
                     */
                    known[id] = { below: Math.max(loaded.floor, 2) };
                }
            });
            return known;
        });
    }

    /*
     * A count as a number to sort by. A bound sorts just under the figure it
     * is bounded by, which is where the property belongs: below everything
     * counted exactly at that figure or above, and above nothing at all.
     */
    function value(count) {
        if (typeof count === "number") {
            return count;
        }
        if (count && typeof count.below === "number") {
            return count.below - 1;
        }
        return -1;
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

        /*
         * The first ranked report is the same hundred properties and more, so
         * if it has already been read this costs nothing. Only worth using
         * when it is there: fetching a thousand rows to show a hundred would
         * be the wrong way round.
         */
        var ranks = readRanks();
        if (ranks.depth > 0) {
            var ordered = Object.keys(ranks.counts).sort(function (a, b) {
                return ranks.counts[b] - ranks.counts[a];
            }).slice(0, 100);
            if (ordered.length === 100) {
                writeCache(TOP_KEY, { ids: ordered, at: Date.now() });
                return Promise.resolve(ordered);
            }
        }

        var url = API + "?action=parse&page=" + encodeURIComponent(TOP_PAGE) +
            "&prop=wikitext&format=json&origin=*";

        return fetch(url).then(function (r) {
            /*
             * Checked before parsing. Wikidata answers a request it is
             * refusing with plain prose rather than JSON — "You are making
             * too many requests to the API." — and reading that as JSON
             * fails with a message about an unexpected token, which says
             * nothing about what actually happened.
             */
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
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
        writeCache(RANKS_KEY, {});
    }

    WDProp.usage = {
        counts: counts,
        exact: exact,
        value: value,
        topProperties: topProperties,
        format: format,
        clearCache: clearCache,
        internals: { fresh: fresh, rankTitle: rankTitle, readRanks: readRanks }
    };
})(window.WDProp);
