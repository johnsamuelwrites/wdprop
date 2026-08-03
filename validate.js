/*
 * WDProp - Validation of proposed translations
 *
 * QuickStatements reports failures long after the batch is submitted, and a
 * batch of a few hundred edits that silently fails is demoralising. These
 * checks run before export instead.
 *
 * Blocking problems make the edit fail on Wikidata or damage existing data.
 * Warnings are things a translator may well have meant.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var ENDPOINT = "https://query.wikidata.org/sparql";

    /* Wikibase term length limit. */
    var MAX_LENGTH = 250;

    /*
     * Scripts we can check with confidence. A language absent from this table
     * is assumed to be Latin-written, which is right often enough to catch the
     * common slip (text pasted under the wrong language code) without
     * producing false alarms on every entry.
     */
    var SCRIPTS = {
        Latn: /[A-Za-zÀ-ɏ]/,
        Deva: /[ऀ-ॿ]/,
        Beng: /[ঀ-৿]/,
        Guru: /[਀-੿]/,
        Gujr: /[઀-૿]/,
        Orya: /[଀-୿]/,
        Taml: /[஀-௿]/,
        Telu: /[ఀ-౿]/,
        Knda: /[ಀ-೿]/,
        Mlym: /[ഀ-ൿ]/,
        Sinh: /[඀-෿]/,
        Thai: /[฀-๿]/,
        Laoo: /[຀-໿]/,
        Tibt: /[ༀ-࿿]/,
        Mymr: /[က-႟]/,
        Geor: /[Ⴀ-ჿᲐ-Ჿ]/,
        Ethi: /[ሀ-፿]/,
        Khmr: /[ក-៿]/,
        Armn: /[԰-֏]/,
        Hebr: /[֐-׿]/,
        Arab: /[؀-ۿݐ-ݿ]/,
        Thaa: /[ހ-޿]/,
        Cyrl: /[Ѐ-ӿ]/,
        Grek: /[Ͱ-Ͽ]/,
        Hani: /[一-鿿㐀-䶿]/,
        Jpan: /[぀-ヿ一-鿿]/,
        Hang: /[가-힯ᄀ-ᇿ]/
    };

    var LANGUAGE_SCRIPT = {
        hi: "Deva", mr: "Deva", ne: "Deva", sa: "Deva", bho: "Deva", mai: "Deva",
        bn: "Beng", as: "Beng", pa: "Guru", gu: "Gujr", or: "Orya",
        ta: "Taml", te: "Telu", kn: "Knda", ml: "Mlym", si: "Sinh",
        th: "Thai", lo: "Laoo", bo: "Tibt", my: "Mymr", km: "Khmr",
        ka: "Geor", am: "Ethi", ti: "Ethi", hy: "Armn", dv: "Thaa",
        he: "Hebr", yi: "Hebr",
        ar: "Arab", fa: "Arab", ur: "Arab", ps: "Arab", sd: "Arab", ckb: "Arab", ug: "Arab",
        ru: "Cyrl", uk: "Cyrl", be: "Cyrl", bg: "Cyrl", mk: "Cyrl", sr: "Cyrl",
        kk: "Cyrl", ky: "Cyrl", mn: "Cyrl", tg: "Cyrl",
        el: "Grek", zh: "Hani", ja: "Jpan", ko: "Hang"
    };

    /* Strips the region subtag: pt-br is written in the same script as pt. */
    function baseLanguage(lang) {
        return String(lang || "").toLowerCase().split("-")[0];
    }

    function expectedScript(lang) {
        return LANGUAGE_SCRIPT[baseLanguage(lang)] || "Latn";
    }

    function scriptMismatch(value, lang) {
        var script = expectedScript(lang);
        var pattern = SCRIPTS[script];
        if (!pattern || pattern.test(value)) {
            return null;
        }

        // Only complain when the value actually contains letters of some other
        // script. Digits, punctuation and identifiers are script-neutral.
        var found = null;
        Object.keys(SCRIPTS).forEach(function (name) {
            if (!found && name !== script && SCRIPTS[name].test(value)) {
                found = name;
            }
        });
        return found ? { expected: script, found: found } : null;
    }

    function escapeLiteral(value) {
        return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function sparql(query) {
        var url = ENDPOINT + "?query=" + encodeURIComponent(query) + "&format=json";
        return fetch(url, { headers: { Accept: "application/sparql-results+json" } })
            .then(function (r) {
                if (!r.ok) {
                    throw new Error("SPARQL request failed: " + r.status);
                }
                return r.json();
            });
    }

    function propertyId(uri) {
        return uri.replace("http://www.wikidata.org/entity/", "");
    }

    /*
     * Checks that need no network. Safe to run on every keystroke.
     */
    function entry(e) {
        var blocking = [];
        var warnings = [];
        var value = String(e.value == null ? "" : e.value);

        if (value.trim() === "") {
            blocking.push("Value is empty.");
            return { blocking: blocking, warnings: warnings };
        }

        if (value.length > MAX_LENGTH) {
            blocking.push("Too long: " + value.length + " characters, the limit is " + MAX_LENGTH + ".");
        }

        if (/[\t\n\r]/.test(value)) {
            blocking.push("Contains a tab or line break, which QuickStatements uses as separators.");
        }

        if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(String(e.lang || ""))) {
            blocking.push("“" + e.lang + "” does not look like a language code.");
        }

        if (!/^P[0-9]+$/.test(String(e.property || ""))) {
            blocking.push("“" + e.property + "” is not a property identifier.");
        }

        /*
         * A value that starts or ends with a double quote cannot be expressed
         * unambiguously in the triple-quoted form QuickStatements uses.
         */
        if (/^"|"$/.test(value)) {
            blocking.push("Starts or ends with a double quote, which QuickStatements cannot quote unambiguously.");
        }

        if (value.indexOf("|") !== -1) {
            warnings.push("Contains “|”, so this batch cannot use the one-click link. Copy or download it instead.");
        }

        if (e.pivotValue && value.trim() === String(e.pivotValue).trim()) {
            warnings.push("Identical to the " + (e.pivot || "source") + " value. Intended for names and codes, but check it is not an accidental copy.");
        }

        var mismatch = scriptMismatch(value, e.lang);
        if (mismatch) {
            warnings.push("Written in " + mismatch.found + " script, but " + e.lang + " is normally written in " + mismatch.expected + ".");
        }

        if (e.type === "description" && /[.。]$/.test(value.trim())) {
            warnings.push("Descriptions do not normally end with a full stop.");
        }

        if (value !== value.trim()) {
            warnings.push("Has leading or trailing spaces; they will be removed.");
        }

        return { blocking: blocking, warnings: warnings };
    }

    /*
     * Two properties in the same language may not share a label: Wikidata
     * rejects the edit. Catches collisions inside the batch itself as well as
     * against labels already on Wikidata.
     */
    function checkDuplicateLabels(entries) {
        var labels = entries.filter(function (e) {
            return e.type === "label";
        });
        if (!labels.length) {
            return Promise.resolve({});
        }

        var problems = {};

        // Within the batch.
        var seen = {};
        labels.forEach(function (e) {
            var key = e.lang + "|" + e.value;
            if (seen[key] && seen[key].property !== e.property) {
                problems[e.id] = problems[e.id] || [];
                problems[e.id].push("Same label as " + seen[key].property + " in this batch; property labels must be unique per language.");
            } else {
                seen[key] = e;
            }
        });

        // Against Wikidata, one query per language.
        var byLanguage = {};
        labels.forEach(function (e) {
            (byLanguage[e.lang] = byLanguage[e.lang] || []).push(e);
        });

        var queries = Object.keys(byLanguage).map(function (lang) {
            var group = byLanguage[lang];
            var values = group.map(function (e) {
                return '"' + escapeLiteral(e.value) + '"@' + lang;
            }).join(" ");

            var query = "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
                "SELECT ?property ?label WHERE {\n" +
                "  VALUES ?label { " + values + " }\n" +
                "  ?property rdf:type wikibase:Property; rdfs:label ?label.\n" +
                "}";

            return sparql(query).then(function (json) {
                var taken = {};
                json.results.bindings.forEach(function (b) {
                    taken[b.label.value] = propertyId(b.property.value);
                });
                group.forEach(function (e) {
                    var holder = taken[e.value];
                    if (holder && holder !== e.property) {
                        problems[e.id] = problems[e.id] || [];
                        problems[e.id].push(holder + " already uses this label in " + lang + ". Wikidata requires property labels to be unique per language, so this edit would fail.");
                    }
                });
            });
        });

        return Promise.all(queries).then(function () {
            return problems;
        });
    }

    /*
     * A label or description added while the batch sat in the browser would be
     * overwritten without trace, so this is reported as blocking. The batch
     * page lets the translator override it deliberately.
     */
    function checkAlreadyTranslated(entries) {
        var terms = entries.filter(function (e) {
            return e.type === "label" || e.type === "description";
        });
        var aliases = entries.filter(function (e) {
            return e.type === "alias";
        });
        if (!terms.length && !aliases.length) {
            return Promise.resolve({ conflicts: {}, duplicateAliases: {} });
        }

        var conflicts = {};
        var duplicateAliases = {};
        var byLanguage = {};

        terms.concat(aliases).forEach(function (e) {
            (byLanguage[e.lang] = byLanguage[e.lang] || []).push(e);
        });

        var queries = Object.keys(byLanguage).map(function (lang) {
            var group = byLanguage[lang];
            var ids = {};
            group.forEach(function (e) {
                ids["wd:" + e.property] = true;
            });

            var query = "SELECT ?property ?label ?description WHERE {\n" +
                "  VALUES ?property { " + Object.keys(ids).join(" ") + " }\n" +
                '  OPTIONAL { ?property rdfs:label ?label. FILTER(lang(?label) = "' + lang + '") }\n' +
                '  OPTIONAL { ?property schema:description ?description. FILTER(lang(?description) = "' + lang + '") }\n' +
                "}";

            var pending = [sparql(query).then(function (json) {
                var current = {};
                json.results.bindings.forEach(function (b) {
                    current[propertyId(b.property.value)] = {
                        label: b.label ? b.label.value : null,
                        description: b.description ? b.description.value : null
                    };
                });
                group.forEach(function (e) {
                    if (e.type === "alias") {
                        return;
                    }
                    var existing = current[e.property] && current[e.property][e.type];
                    if (existing && existing !== e.value) {
                        conflicts[e.id] = e.property + " already has a " + e.type + " in " + lang +
                            " (“" + existing + "”). Exporting would replace it.";
                    }
                });
            })];

            var languageAliases = group.filter(function (e) {
                return e.type === "alias";
            });
            if (languageAliases.length) {
                var aliasIds = {};
                languageAliases.forEach(function (e) {
                    aliasIds["wd:" + e.property] = true;
                });
                var aliasQuery = "SELECT ?property ?alias WHERE {\n" +
                    "  VALUES ?property { " + Object.keys(aliasIds).join(" ") + " }\n" +
                    '  ?property skos:altLabel ?alias. FILTER(lang(?alias) = "' + lang + '")\n' +
                    "}";
                pending.push(sparql(aliasQuery).then(function (json) {
                    var existing = {};
                    json.results.bindings.forEach(function (b) {
                        var id = propertyId(b.property.value);
                        (existing[id] = existing[id] || []).push(b.alias.value);
                    });
                    languageAliases.forEach(function (e) {
                        if ((existing[e.property] || []).indexOf(e.value) !== -1) {
                            duplicateAliases[e.id] = "This alias already exists on " + e.property + " in " + lang + "; the edit would do nothing.";
                        }
                    });
                }));
            }

            return Promise.all(pending);
        });

        return Promise.all(queries).then(function () {
            return { conflicts: conflicts, duplicateAliases: duplicateAliases };
        });
    }

    /*
     * Full validation of a batch. Resolves to {byId: {<id>: {blocking,
     * warnings, conflict}}}, where `conflict` is the overridable case of a
     * term that has appeared on Wikidata in the meantime.
     */
    function batch(entries) {
        var byId = {};
        entries.forEach(function (e) {
            var result = entry(e);
            byId[e.id] = { blocking: result.blocking, warnings: result.warnings, conflict: null };
        });

        // Only send well-formed entries to the endpoint.
        var checkable = entries.filter(function (e) {
            return byId[e.id].blocking.length === 0;
        });
        if (!checkable.length) {
            return Promise.resolve({ byId: byId, offline: false });
        }

        return Promise.all([
            checkDuplicateLabels(checkable),
            checkAlreadyTranslated(checkable)
        ]).then(function (results) {
            var duplicates = results[0];
            var current = results[1];

            Object.keys(duplicates).forEach(function (id) {
                byId[id].blocking = byId[id].blocking.concat(duplicates[id]);
            });
            Object.keys(current.conflicts).forEach(function (id) {
                byId[id].conflict = current.conflicts[id];
            });
            Object.keys(current.duplicateAliases).forEach(function (id) {
                byId[id].warnings.push(current.duplicateAliases[id]);
            });

            return { byId: byId, offline: false };
        }).catch(function (e) {
            // Without the endpoint the local checks still stand; say so rather
            // than implying the batch was fully verified.
            return { byId: byId, offline: true, error: e.message };
        });
    }

    WDProp.validate = {
        MAX_LENGTH: MAX_LENGTH,
        entry: entry,
        batch: batch,
        expectedScript: expectedScript,
        sparql: sparql
    };
})(window.WDProp);
