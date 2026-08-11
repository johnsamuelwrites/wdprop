/*
 * WDProp - Working without a connection
 *
 * The languages whose properties are least translated are, with striking
 * regularity, spoken where the connection is worst. A tool for translating
 * them that only works while a query service in Europe is answering has
 * already excluded the people it was built for.
 *
 * WDProp is a set of static files and has always opened from a disk. What it
 * could not do without a network was the part that matters: it had nothing to
 * show, because every property, every label and every description was fetched
 * on demand. This adds the missing half.
 *
 *   - the pages themselves are kept by a service worker, so the application
 *     opens with no connection at all;
 *   - the property vocabulary — every property, with its labels, descriptions
 *     and aliases in the languages asked for — is downloaded once into
 *     IndexedDB. Wikidata has about thirteen thousand properties, which for
 *     two languages is a few megabytes: small enough to hold, large enough
 *     that it has to be asked for rather than assumed;
 *   - the workbench reads from that store when the network is not there, so a
 *     translator can work through a language for days offline;
 *   - the batch travels as a file. A workshop with one connected laptop can
 *     collect everyone's work on a memory stick and export it from that one.
 *
 * On the last of these: a QR code was the obvious carrier and is the wrong
 * one. The densest a phone camera reads reliably holds about two kilobytes,
 * which is a dozen descriptions — less than an afternoon's work, and the
 * failure is silent, because a batch that overflows simply stops encoding.
 * A file has no such ceiling and needs no second device.
 *
 * What each part needs:
 *
 *   the service worker   a served origin. Browsers do not register one for a
 *                        file:// page, so opening the files directly still
 *                        works but is not itself offline-capable — the browser
 *                        already has the files in that case
 *   the vocabulary       IndexedDB, which some browsers withhold from
 *                        file:// pages. Said plainly on the page rather than
 *                        failing quietly
 *   the batch file       nothing beyond a browser
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";
    var SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

    var DB_NAME = "wdprop";
    var DB_VERSION = 1;
    var STORE = "properties";
    var META = "meta";
    var META_KEY = "dataset";

    /* wbgetentities takes fifty identifiers per request for an anonymous caller. */
    var BATCH = 50;
    var CONCURRENCY = 4;

    var BATCH_FORMAT = "wdprop-batch";
    var BATCH_VERSION = 1;

    function t(key, params) {
        return WDProp.i18n ? WDProp.i18n.t(key, params) : key;
    }

    /* --------------------------------------------------------- the network */

    /*
     * navigator.onLine is only ever trustworthy when it says false: a machine
     * can be attached to a network that reaches nothing. It is used for
     * choosing what to try first, never for deciding that something failed.
     */
    function online() {
        return !(typeof navigator !== "undefined" && navigator.onLine === false);
    }

    /* ------------------------------------------------------------ the store */

    function unsupported() {
        return typeof indexedDB === "undefined" || indexedDB === null;
    }

    var opening = null;

    function open() {
        if (unsupported()) {
            return Promise.reject(new Error(t("offline.noIndexedDb")));
        }
        if (opening) {
            return opening;
        }
        opening = new Promise(function (resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: "p" });
                }
                if (!db.objectStoreNames.contains(META)) {
                    db.createObjectStore(META);
                }
            };
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function () {
                opening = null;
                reject(request.error || new Error(t("offline.storeFailed")));
            };
        });
        return opening;
    }

    /*
     * One transaction, resolving when it commits rather than when its last
     * request succeeds. A request can succeed inside a transaction that then
     * fails to commit, and waiting on the request alone would report the data
     * as stored when it is not.
     *
     * `work` must issue all of its requests before it returns. IndexedDB
     * closes a transaction as soon as its queue empties and the turn ends, so
     * a request issued from a later turn — anything after an await or a then —
     * arrives to find the transaction gone. Everything here issues its
     * requests in one go and only then waits.
     */
    function transact(stores, mode, work) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(stores, mode);
                var result;
                var failure = null;

                tx.oncomplete = function () {
                    resolve(result);
                };
                tx.onerror = function () {
                    reject(failure || tx.error);
                };
                tx.onabort = function () {
                    reject(failure || tx.error || new Error(t("offline.storeFailed")));
                };

                function fail(error) {
                    failure = error;
                    try {
                        tx.abort();
                    } catch (e) {
                        // Already finished; onerror or onabort has the answer.
                    }
                }

                try {
                    var value = work(tx);
                    if (value && typeof value.then === "function") {
                        value.then(function (resolved) {
                            result = resolved;
                        }, fail);
                    } else {
                        result = value;
                    }
                } catch (error) {
                    fail(error);
                }
            });
        });
    }

    function request(req) {
        return new Promise(function (resolve, reject) {
            req.onsuccess = function () {
                resolve(req.result);
            };
            req.onerror = function () {
                reject(req.error);
            };
        });
    }

    function putRecords(records) {
        return transact([STORE], "readwrite", function (tx) {
            var store = tx.objectStore(STORE);
            records.forEach(function (record) {
                store.put(record);
            });
        });
    }

    function readMeta() {
        if (unsupported()) {
            return Promise.resolve(null);
        }
        return transact([META], "readonly", function (tx) {
            return request(tx.objectStore(META).get(META_KEY));
        }).catch(function () {
            return null;
        });
    }

    function writeMeta(value) {
        return transact([META], "readwrite", function (tx) {
            tx.objectStore(META).put(value, META_KEY);
        });
    }

    function info() {
        return readMeta().then(function (meta) {
            return meta || null;
        });
    }

    function clearStore() {
        return transact([STORE, META], "readwrite", function (tx) {
            tx.objectStore(STORE).clear();
            tx.objectStore(META).clear();
        });
    }

    /* ---------------------------------------------------------- downloading */

    /*
     * Every property, with the datatype. The datatype comes along because it
     * is what lets the workbench narrow a worklist by datatype offline, where
     * there is no query service to ask.
     */
    function allProperties() {
        var query = "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT ?property ?datatype WHERE {\n" +
            "  ?property rdf:type wikibase:Property;\n" +
            "            wikibase:propertyType ?datatype.\n" +
            "}";
        var url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(query) + "&format=json";

        return fetch(url, { headers: { Accept: "application/sparql-results+json" } })
            .then(function (r) {
                if (!r.ok) {
                    throw new Error(t("offline.listFailed", [r.status]));
                }
                return r.json();
            }).then(function (json) {
                return json.results.bindings.map(function (binding) {
                    return {
                        id: binding.property.value.replace("http://www.wikidata.org/entity/", ""),
                        datatype: binding.datatype.value.replace("http://wikiba.se/ontology#", "")
                    };
                }).filter(function (entry) {
                    return /^P[0-9]+$/.test(entry.id);
                });
            });
    }

    /* The terms of fifty properties, reduced to what is worth keeping. */
    function fetchBatch(ids, languages, datatypes) {
        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(ids.join("|")) +
            "&props=" + encodeURIComponent("labels|descriptions|aliases") +
            "&languages=" + encodeURIComponent(languages.join("|")) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error(t("offline.termsFailed", [r.status]));
            }
            return r.json();
        }).then(function (json) {
            var entities = json.entities || {};
            return Object.keys(entities).filter(function (id) {
                return entities[id].missing === undefined;
            }).map(function (id) {
                var entity = entities[id];
                var terms = {};
                languages.forEach(function (lang) {
                    var label = entity.labels && entity.labels[lang];
                    var description = entity.descriptions && entity.descriptions[lang];
                    var aliases = entity.aliases && entity.aliases[lang];
                    if (!label && !description && !(aliases && aliases.length)) {
                        /*
                         * Nothing in this language. Left out rather than
                         * stored empty: absent and "translated into nothing"
                         * are the same fact, and the store is a third smaller
                         * for saying it once.
                         */
                        return;
                    }
                    terms[lang] = {
                        l: label ? label.value : null,
                        d: description ? description.value : null,
                        a: aliases ? aliases.map(function (a) {
                            return a.value;
                        }) : []
                    };
                });
                return { p: id, d: datatypes[id] || null, t: terms };
            });
        });
    }

    /*
     * Downloads the vocabulary in the given languages.
     *
     * Returns a promise with a stop() on it. A download of thirteen thousand
     * properties is two hundred and sixty requests and takes a few minutes;
     * anyone who started it against the wrong languages must be able to call
     * it off without closing the page, and what has already been written stays
     * — a partial store is still useful, and the next run fills the rest in.
     */
    function download(options) {
        var languages = (options.languages || []).filter(function (lang, i, all) {
            return lang && all.indexOf(lang) === i;
        });
        var onProgress = options.onProgress || function () {};
        var stopped = false;

        if (!languages.length) {
            return Promise.reject(new Error(t("offline.noLanguages")));
        }

        var running = allProperties().then(function (properties) {
            var datatypes = {};
            var ids = properties.map(function (entry) {
                datatypes[entry.id] = entry.datatype;
                return entry.id;
            });

            var batches = [];
            for (var i = 0; i < ids.length; i += BATCH) {
                batches.push(ids.slice(i, i + BATCH));
            }

            var index = 0;
            var stored = 0;

            function next() {
                if (stopped || index >= batches.length) {
                    return Promise.resolve();
                }
                var batch = batches[index++];
                return fetchBatch(batch, languages, datatypes).then(function (records) {
                    return putRecords(records).then(function () {
                        stored += records.length;
                        onProgress(stored, ids.length);
                    });
                }).then(next);
            }

            var runners = [];
            for (var j = 0; j < Math.min(CONCURRENCY, batches.length); j++) {
                runners.push(next());
            }

            return Promise.all(runners).then(function () {
                return writeMeta({
                    languages: languages,
                    count: stored,
                    total: ids.length,
                    at: Date.now(),
                    partial: stopped || stored < ids.length
                }).then(function () {
                    return { count: stored, total: ids.length, stopped: stopped };
                });
            });
        });

        running.stop = function () {
            stopped = true;
        };
        return running;
    }

    /* ------------------------------------------------------------- reading */

    /*
     * Entities in the shape wbgetentities returns them, so that a caller can
     * use the store and the API interchangeably. Translating the store into
     * the API's shape here is what keeps the workbench from having to know
     * which of the two it is reading.
     */
    function entities(ids, languages) {
        if (unsupported()) {
            return Promise.reject(new Error(t("offline.noIndexedDb")));
        }

        return transact([STORE], "readonly", function (tx) {
            var store = tx.objectStore(STORE);
            return Promise.all(ids.map(function (id) {
                return request(store.get(id));
            }));
        }).then(function (records) {
            var out = {};
            (records || []).forEach(function (record) {
                if (!record) {
                    return;
                }
                out[record.p] = asEntity(record, languages);
            });
            return out;
        });
    }

    function asEntity(record, languages) {
        var entity = { id: record.p, datatype: record.d, labels: {}, descriptions: {}, aliases: {} };
        var wanted = languages && languages.length ? languages : Object.keys(record.t);

        wanted.forEach(function (lang) {
            var terms = record.t[lang];
            if (!terms) {
                return;
            }
            if (terms.l) {
                entity.labels[lang] = { language: lang, value: terms.l };
            }
            if (terms.d) {
                entity.descriptions[lang] = { language: lang, value: terms.d };
            }
            if (terms.a && terms.a.length) {
                entity.aliases[lang] = terms.a.map(function (value) {
                    return { language: lang, value: value };
                });
            }
        });

        return entity;
    }

    /*
     * The properties missing a term, worked out from the store rather than
     * from the query service.
     *
     * Only the scopes the store can answer: everything, a datatype, or a named
     * list. A class is a set of statements, and statements are not downloaded
     * — storing them would multiply the size of the vocabulary for one filter.
     * The caller is told which of these it may ask for by `scopes` below,
     * rather than finding out from an empty result.
     */
    function worklist(options) {
        if (unsupported()) {
            return Promise.reject(new Error(t("offline.noIndexedDb")));
        }

        var type = options.type;
        var target = options.target;
        var scope = options.scope || { kind: "all" };
        var wanted = scope.kind === "properties" ?
            scope.value.split(",").map(function (id) {
                return id.trim();
            }) : null;

        return transact([STORE], "readonly", function (tx) {
            return request(tx.objectStore(STORE).getAll());
        }).then(function (records) {
            var numbers = (records || []).filter(function (record) {
                if (wanted && wanted.indexOf(record.p) === -1) {
                    return false;
                }
                if (scope.kind === "datatype" &&
                    record.d !== scope.value.replace(/^wikibase:/, "")) {
                    return false;
                }
                return !hasTerm(record, target, type);
            }).map(function (record) {
                return parseInt(record.p.slice(1), 10);
            });

            numbers.sort(function (a, b) {
                return a - b;
            });
            return numbers;
        });
    }

    function hasTerm(record, language, type) {
        var terms = record.t[language];
        if (!terms) {
            return false;
        }
        if (type === "alias") {
            return !!(terms.a && terms.a.length);
        }
        return !!terms[type === "label" ? "l" : "d"];
    }

    /* Which scopes can be answered from the store, for a caller to check first. */
    var scopes = ["all", "datatype", "properties"];

    /* ------------------------------------------------------ the batch file */

    /*
     * The batch as a file, so that work done on a machine with no connection
     * can be carried to one that has it.
     *
     * Deliberately WDProp's own entries rather than QuickStatements commands:
     * the commands are the end of the road and drop everything that is not an
     * edit — which language the translator was reading from, when the proposal
     * was made, whether it revises something that had drifted. A batch moved
     * between machines should arrive as what it was, and can be turned into
     * commands at the far end like any other.
     */
    function exportBatch(entries) {
        var payload = {
            format: BATCH_FORMAT,
            version: BATCH_VERSION,
            exported: new Date().toISOString(),
            entries: entries
        };

        var blob = new Blob([JSON.stringify(payload, null, 1) + "\n"],
            { type: "application/json;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.setAttribute("href", url);
        a.setAttribute("download",
            "wdprop-batch-" + new Date().toISOString().slice(0, 10) + ".json");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return payload;
    }

    /*
     * Reads a batch file into the batch already in this browser.
     *
     * Merged rather than replacing it: the machine doing the importing is
     * usually the one that has been collecting, and an import that wiped what
     * was there would lose the previous person's work with no way back. The
     * batch's own rule decides collisions — a second proposal for the same
     * label replaces the first, a repeated alias is dropped.
     *
     * Every field is taken apart and checked. This file has been on a memory
     * stick and is not to be trusted with the shape of what it contains.
     */
    function importBatch(text) {
        var payload;
        try {
            payload = JSON.parse(text);
        } catch (e) {
            throw new Error(t("offline.notJson"));
        }

        if (!payload || payload.format !== BATCH_FORMAT || !Array.isArray(payload.entries)) {
            throw new Error(t("offline.notABatch"));
        }
        if (payload.version > BATCH_VERSION) {
            throw new Error(t("offline.newerVersion", [payload.version, BATCH_VERSION]));
        }

        var added = 0;
        var rejected = 0;

        payload.entries.forEach(function (entry) {
            if (!entry || typeof entry !== "object" ||
                !/^P[0-9]+$/.test(String(entry.property)) ||
                !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(String(entry.lang)) ||
                ["label", "description", "alias"].indexOf(entry.type) === -1 ||
                typeof entry.value !== "string" || !entry.value.trim()) {
                rejected++;
                return;
            }
            var stored = WDProp.cart.add({
                property: String(entry.property),
                lang: String(entry.lang),
                type: entry.type,
                value: entry.value,
                pivot: entry.pivot ? String(entry.pivot) : null,
                pivotValue: entry.pivotValue ? String(entry.pivotValue) : null,
                reason: entry.reason === "drift" ? "drift" : null
            });
            if (stored) {
                added++;
            } else {
                rejected++;
            }
        });

        return { added: added, rejected: rejected, total: payload.entries.length };
    }

    /* --------------------------------------------------- the service worker */

    /*
     * Registered from the directory WDProp was loaded from, because a service
     * worker may only control pages at or below its own path — an installation
     * under /wdprop/ cannot register one served from the root.
     */
    function register() {
        if (typeof navigator === "undefined" || !navigator.serviceWorker) {
            return Promise.resolve({ ok: false, reason: "unsupported" });
        }
        if (window.location.protocol === "file:") {
            return Promise.resolve({ ok: false, reason: "file" });
        }

        var base = window.WDPropPathPrefix || "./";
        return navigator.serviceWorker.register(base + "sw.js", { scope: base })
            .then(function (registration) {
                return { ok: true, registration: registration };
            }).catch(function (error) {
                return { ok: false, reason: "failed", error: error };
            });
    }

    /*
     * A mark in the header while there is no connection, so that a page
     * showing older figures says why. It is a live region: going offline
     * changes nothing visible on the page itself, and the reason results have
     * stopped moving should not have to be guessed at.
     */
    function mountIndicator() {
        var header = document.getElementById("header");
        if (!header || document.getElementById("offline-badge")) {
            return;
        }

        var badge = document.createElement("span");
        badge.setAttribute("id", "offline-badge");
        badge.setAttribute("class", "offline-badge");
        badge.setAttribute("role", "status");
        badge.setAttribute("aria-live", "polite");

        var themeToggle = document.getElementById("theme-toggle");
        if (themeToggle) {
            header.insertBefore(badge, themeToggle);
        } else {
            header.appendChild(badge);
        }

        function show() {
            while (badge.firstChild) {
                badge.removeChild(badge.firstChild);
            }
            if (online()) {
                badge.setAttribute("class", "offline-badge");
                return;
            }
            badge.setAttribute("class", "offline-badge is-offline");
            badge.appendChild(document.createTextNode(t("offline.badge")));
            badge.setAttribute("title", t("offline.badgeTitle"));
        }

        window.addEventListener("online", show);
        window.addEventListener("offline", show);
        show();
    }

    WDProp.offline = {
        online: online,
        available: function () {
            return !unsupported();
        },
        info: info,
        download: download,
        entities: entities,
        worklist: worklist,
        scopes: scopes,
        clear: clearStore,
        exportBatch: exportBatch,
        importBatch: importBatch,
        register: register,
        internals: {
            asEntity: asEntity,
            hasTerm: hasTerm,
            BATCH_FORMAT: BATCH_FORMAT,
            BATCH_VERSION: BATCH_VERSION
        }
    };

    function init() {
        mountIndicator();
        register();
    }

    WDProp.ready(init);
})(window.WDProp);
