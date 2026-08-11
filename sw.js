/*
 * WDProp - Service worker
 *
 * Keeps WDProp openable with no connection, and keeps what it has already
 * read from Wikidata readable too.
 *
 * Two caches, because the two hold different kinds of thing and must be able
 * to be thrown away separately:
 *
 *   the shell   the pages, scripts and stylesheet. Fixed, versioned, replaced
 *               wholesale when SHELL_VERSION changes
 *   the data    answers from Wikidata. Unbounded in principle, so it is
 *               capped and trimmed oldest-first
 *
 * The shell is served from the cache first. That is the right way round here
 * and not everywhere: these files change when a release is made, never
 * between one page and the next, and a translator on a slow connection should
 * not spend it re-fetching a stylesheet. A fresh copy is fetched in the
 * background all the same, so the next visit has it.
 *
 * Wikidata is asked first and the cache used only if it does not answer.
 * Translation statistics that are a day old are worth showing when there is
 * nothing else; they are not worth showing when the live figures are there.
 *
 * A service worker is only registered for a served origin — opening the files
 * from a disk gives no registration, and needs none. See offline.js.
 */

var SHELL_VERSION = "wdprop-shell-v2";
var DATA_VERSION = "wdprop-data-v1";

/* Answers from Wikidata kept at once, oldest discarded first. */
var DATA_LIMIT = 300;

var WIKIDATA = ["www.wikidata.org", "query.wikidata.org", "quickstatements.toolforge.org"];

/*
 * Every file WDProp is made of. Written out rather than discovered, because
 * there is nothing to discover it with: these are static files on whatever is
 * serving them, with no index to read.
 *
 * A file added to WDProp and not added here still works — it is simply
 * fetched from the network like anything else — but it will not be there
 * without one. The check in tests/offline.test.js compares this list against
 * what is actually in the directory, so the omission is caught rather than
 * discovered by someone on a train.
 */
var SHELL = [
    "./",
    "index.html",
    "style.css",
    "manifest.webmanifest",
    "images/wdprop.svg",

    "theme.js",
    "ready.js",
    "shell.js",
    "actions.js",
    "pager.js",
    "pageinit.js",
    "i18n.js",
    "i18n/en.js",
    "i18n/fr.js",
    "i18n/es.js",

    "wdprop.js",
    "mwwdprop.js",
    "cart.js",
    "qs.js",
    "validate.js",
    "usage.js",
    "offline.js",
    "stale.js",
    "staleview.js",
    "translate.js",
    "compose.js",
    "batch.js",
    "campaign.js",
    "contributions.js",
    "contributionsview.js",
    "terminology.js",
    "dashboard.js",
    "wikiprojects.js",
    "visualization.js",
    "compare.js",
    "offlineview.js",
    "searchview.js",
    "classesview.js",
    "wikiprojectsview.js",

    "batch.html",
    "campaign.html",
    "class.html",
    "classes.html",
    "compare.html",
    "contributions.html",
    "datatype.html",
    "datatypes.html",
    "descriptions.html",
    "labels.html",
    "language.html",
    "languages.html",
    "offline.html",
    "path.html",
    "pathviz.html",
    "properties.html",
    "property.html",
    "propertydesc.html",
    "propertyprovenance.html",
    "provenance.html",
    "search.html",
    "stale.html",
    "terminology.html",
    "translate.html",
    "translated.html",
    "untranslated.html",
    "visualization.html",
    "wdprop.html",
    "wikiproject.html",
    "wikiprojects.html",

    "templates/translated.html",
    "aliases/language.html",
    "aliases/translated.html",
    "aliases/untranslated.html",
    "descriptions/language.html",
    "descriptions/translated.html",
    "descriptions/untranslated.html",
    "labels/language.html",
    "labels/translated.html",
    "labels/untranslated.html"
];

/*
 * Each file on its own rather than one addAll. addAll is a single promise:
 * one file that has been renamed and not corrected here would fail the whole
 * installation, and WDProp would silently have no offline copy of anything.
 */
self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(SHELL_VERSION).then(function (cache) {
            return Promise.all(SHELL.map(function (path) {
                return cache.add(new Request(path, { cache: "reload" })).catch(function () {
                    /* Reported rather than thrown: the rest is still worth having. */
                    console.warn("WDProp: could not cache " + path);
                });
            }));
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names.filter(function (name) {
                return name.indexOf("wdprop-") === 0 &&
                    name !== SHELL_VERSION && name !== DATA_VERSION;
            }).map(function (name) {
                return caches.delete(name);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

/* Discards the oldest entries once the data cache is over its limit. */
function trim(cache) {
    return cache.keys().then(function (keys) {
        if (keys.length <= DATA_LIMIT) {
            return null;
        }
        return Promise.all(keys.slice(0, keys.length - DATA_LIMIT).map(function (key) {
            return cache.delete(key);
        }));
    });
}

/*
 * Wikidata: live if it answers, cached if it does not.
 *
 * An answer from the cache is not marked as such here. The pages say it
 * themselves, from the offline indicator, because a response cannot carry a
 * caveat that the section rendering it would know how to show.
 */
function fromNetworkFirst(request) {
    return fetch(request).then(function (response) {
        if (response && response.ok) {
            var copy = response.clone();
            caches.open(DATA_VERSION).then(function (cache) {
                return cache.put(request, copy).then(function () {
                    return trim(cache);
                });
            }).catch(function () {
                /* Storage full or refused: the live answer is still going back. */
            });
        }
        return response;
    }).catch(function (error) {
        return caches.match(request).then(function (cached) {
            if (cached) {
                return cached;
            }
            throw error;
        });
    });
}

/*
 * WDProp's own files: cached if they are there, and refreshed behind the
 * reader's back for next time.
 */
function fromCacheFirst(request) {
    /*
     * ignoreSearch, because every view in WDProp is addressed by its query
     * string — property.html?property=P31, translate.html?target=ta — and the
     * file behind all of them is the same one. Matching on the full address
     * would cache the front door and miss every room.
     */
    return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        var live = fetch(request).then(function (response) {
            if (response && response.ok) {
                var copy = response.clone();
                caches.open(SHELL_VERSION).then(function (cache) {
                    cache.put(request, copy);
                });
            }
            return response;
        });

        if (cached) {
            /*
             * The background refresh must not be left to reject on its own:
             * an unhandled rejection every time a page is opened offline is
             * noise that hides the failures worth seeing.
             */
            live.catch(function () {});
            return cached;
        }
        return live;
    });
}

self.addEventListener("fetch", function (event) {
    var request = event.request;

    /*
     * Only GET. A POST is not addressable as a cache key, and nothing WDProp
     * does with one — it makes no edits — would be safe to replay anyway.
     */
    if (request.method !== "GET") {
        return;
    }

    var url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return;
    }

    if (WIKIDATA.indexOf(url.hostname) !== -1) {
        event.respondWith(fromNetworkFirst(request));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(fromCacheFirst(request));
    }
});
