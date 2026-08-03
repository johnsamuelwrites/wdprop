/*
 * WDProp - Contributions and verification
 *
 * Exporting a batch is where WDProp's part ends and QuickStatements' begins,
 * so nothing here can know whether an edit was actually made. What it can do
 * is remember what was proposed and, later, ask Wikidata what is there now.
 *
 * A proposal is reported as:
 *
 *   live     the value on Wikidata is the one that was proposed;
 *   missing  there is still nothing, so the batch was not run, or it failed,
 *            or the edit was reverted;
 *   changed  something else is there, whether an earlier value that was never
 *            replaced or someone's later correction.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";
    var STORAGE_KEY = "wdprop-contributions";
    var API_BATCH = 50;

    /*
     * Exporting the same work twice — copying it and then downloading it — is
     * one act, not two. A repeat of the identical set within this window
     * updates the record instead of adding another.
     */
    var SAME_EXPORT_WINDOW = 5 * 60 * 1000;

    function read() {
        try {
            var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function write(batches) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
        } catch (e) {
            // History is a convenience; never let it break an export.
        }
    }

    function signature(entries) {
        return entries.map(function (e) {
            return [e.property, e.lang, e.type, e.value].join("|");
        }).sort().join("\n");
    }

    /*
     * Takes a copy of what was exported. The cart is left alone: emptying it
     * is the translator's decision, and the record must survive that.
     */
    function record(entries) {
        if (!entries.length) {
            return null;
        }

        var batches = read();
        var snapshot = entries.map(function (e) {
            return {
                property: e.property,
                lang: e.lang,
                type: e.type,
                value: e.value,
                pivot: e.pivot || null
            };
        });

        var last = batches[batches.length - 1];
        if (last &&
            Date.now() - last.exported < SAME_EXPORT_WINDOW &&
            signature(last.entries) === signature(snapshot)) {
            last.exported = Date.now();
            write(batches);
            return last;
        }

        var batch = {
            id: "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            exported: Date.now(),
            entries: snapshot
        };
        batches.push(batch);
        write(batches);
        return batch;
    }

    /*
     * Newest first. Reversed before sorting so that two exports recorded in
     * the same millisecond — which happens easily — fall back to the order
     * they were made in rather than an arbitrary one.
     */
    function batches() {
        return read().slice().reverse().sort(function (a, b) {
            return b.exported - a.exported;
        });
    }

    function removeBatch(id) {
        write(read().filter(function (b) {
            return b.id !== id;
        }));
    }

    function clear() {
        write([]);
    }

    function fetchEntities(ids, languages) {
        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(ids.join("|")) +
            "&props=" + encodeURIComponent("labels|descriptions|aliases") +
            "&languages=" + encodeURIComponent(languages.join("|")) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status + ".");
            }
            return r.json();
        }).then(function (json) {
            return json.entities || {};
        });
    }

    function unique(values) {
        return values.filter(function (v, i, a) {
            return a.indexOf(v) === i;
        });
    }

    /*
     * Reads the current state of every proposal in one pass. Resolves to a map
     * keyed the same way the entries are, so a caller can look up an entry
     * without depending on ordering.
     */
    function verify(entries) {
        if (!entries.length) {
            return Promise.resolve({});
        }

        var properties = unique(entries.map(function (e) {
            return e.property;
        }));
        var languages = unique(entries.map(function (e) {
            return e.lang;
        }));

        var groups = [];
        for (var i = 0; i < properties.length; i += API_BATCH) {
            groups.push(properties.slice(i, i + API_BATCH));
        }

        return Promise.all(groups.map(function (group) {
            return fetchEntities(group, languages);
        })).then(function (results) {
            var entities = {};
            results.forEach(function (part) {
                Object.keys(part).forEach(function (id) {
                    entities[id] = part[id];
                });
            });

            var report = {};
            entries.forEach(function (entry) {
                report[keyOf(entry)] = statusOf(entry, entities[entry.property]);
            });
            return report;
        });
    }

    function keyOf(entry) {
        return [entry.property, entry.lang, entry.type, entry.value].join("|");
    }

    function statusOf(entry, entity) {
        if (!entity || entity.missing !== undefined) {
            return { state: "missing", current: null };
        }

        if (entry.type === "alias") {
            var aliases = ((entity.aliases && entity.aliases[entry.lang]) || []).map(function (a) {
                return a.value;
            });
            return aliases.indexOf(entry.value) !== -1 ?
                { state: "live", current: entry.value } :
                { state: "missing", current: aliases.length ? aliases.join(", ") : null };
        }

        var field = entry.type === "label" ? "labels" : "descriptions";
        var current = entity[field] && entity[field][entry.lang] ?
            entity[field][entry.lang].value : null;

        if (current === null) {
            return { state: "missing", current: null };
        }
        if (current === entry.value) {
            return { state: "live", current: current };
        }
        return { state: "changed", current: current };
    }

    WDProp.contributions = {
        record: record,
        batches: batches,
        removeBatch: removeBatch,
        clear: clear,
        verify: verify,
        keyOf: keyOf,
        statusOf: statusOf
    };
})(window.WDProp);
