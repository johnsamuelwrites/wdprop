/*
 * WDProp - Translation workbench
 *
 * Drives translate.html: builds the list of properties still missing a term
 * in the target language, shows each one alongside what it says in a language
 * the translator reads, and collects the translations into the batch.
 *
 * Three sources of data, chosen for how they behave rather than for symmetry:
 *
 *   - the worklist comes from one SPARQL query. It returns identifiers only,
 *     because asking the query service to join two languages or to sort is
 *     an order of magnitude slower;
 *   - the terms shown for each property come from the MediaWiki API, fifty at
 *     a time, for the page on screen. It answers in milliseconds;
 *   - the glossary used for terminology consistency comes from SPARQL, loaded
 *     in the background because it can take half a minute on a cold cache.
 *     Everything else works while it loads.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
    var API = "https://www.wikidata.org/w/api.php";

    var PAGE_SIZE = 25;
    var API_BATCH = 50;
    var SKIPS_KEY = "wdprop-translation-skips";

    /* Parameters reach SPARQL, so each is checked against its shape. */
    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
    var CLASS_RE = /^Q[0-9]+$/;
    var DATATYPE_RE = /^wikibase:[A-Za-z]+$/;
    var PROPERTY_LIST_RE = /^P[0-9]+(,P[0-9]+)*$/;

    var TERM_PREDICATE = {
        label: "rdfs:label",
        description: "schema:description",
        alias: "skos:altLabel"
    };

    function t(key, params) {
        return WDProp.i18n.t(key, params);
    }

    /* "label", "description" or "alias" as a word inside a sentence. */
    function termNoun(type) {
        return t("term." + type);
    }

    /*
     * Function words carry no terminology, so they are not worth matching on.
     * A language without a list here still works — its function words simply
     * show up as weak matches — so this can be extended one language at a time.
     */
    var STOPWORDS = {
        en: ["that", "this", "with", "from", "which", "were", "have", "has", "been",
            "the", "and", "for", "are", "was", "its", "into", "than", "then",
            "such", "used", "using", "when", "where", "what", "some", "other",
            "their", "these", "those", "also", "only", "each", "both", "more",
            "of", "in", "to", "by", "on", "at", "as", "or", "is", "an", "it",
            "be", "if", "no", "do", "a"],
        fr: ["de", "la", "le", "les", "des", "du", "un", "une", "et", "ou", "au",
            "aux", "en", "dans", "pour", "par", "sur", "avec", "ce", "cette",
            "qui", "que", "est", "sont", "se", "sa", "son", "ses", "leur", "aussi"],
        es: ["de", "la", "el", "los", "las", "un", "una", "unos", "unas", "del",
            "al", "en", "para", "por", "con", "que", "es", "son", "se", "su",
            "sus", "lo", "como", "más", "este", "esta", "esto"],
        hi: ["का", "की", "के", "में", "से", "को", "पर", "है", "हैं", "और", "या",
            "एक", "यह", "वह", "जो", "कि", "ने", "तक", "भी", "इस", "उस", "हो",
            "था", "थी", "थे", "गया", "गयी", "किसी", "कोई"],
        ta: ["இது", "அது", "ஒரு", "மற்றும்", "அல்லது", "என்ற", "என்று", "ஆகும்",
            "உள்ள", "இங்கே", "இங்கு", "அந்த", "இந்த", "ஆன", "மேலும்", "இவை",
            "அவை", "எனும்", "ஆகிய", "உடைய"]
    };

    /*
     * Languages written without spaces cannot be split into words without a
     * segmenter, so their labels are matched whole.
     */
    var UNSEGMENTED = ["zh", "ja", "ko", "th", "lo", "km", "my", "bo"];

    var state = {
        target: "en",
        pivots: ["en"],
        type: "label",
        scope: { kind: "all", value: "" },
        worklist: [],
        remaining: [],
        page: 0,
        entities: {},
        glossary: null,
        glossaryStatus: "idle",
        context: {},
        showSkipped: false,
        sortByUsage: false,
        usage: {},
        added: 0,
        skippedThisSession: 0,
        /* Set when the worklist or the terms came out of the offline store. */
        fromStore: false
    };

    /* ---------------------------------------------------------------- utils */

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.setAttribute("class", className);
        }
        if (text != null) {
            node.appendChild(document.createTextNode(text));
        }
        return node;
    }

    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function urlValue(name, fallback) {
        var match = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
        return match ? decodeURIComponent(match[1]) : fallback;
    }

    function propertyNumber(id) {
        return parseInt(id.slice(1), 10);
    }

    /* ---------------------------------------------------------------- skips */

    /*
     * Held in memory as well as in storage. A worklist runs to thousands of
     * entries and is filtered against this, so re-parsing it per entry would
     * cost tens of thousands of parses per render.
     */
    var skipsCache = null;

    function readSkips() {
        if (skipsCache) {
            return skipsCache;
        }
        try {
            skipsCache = JSON.parse(localStorage.getItem(SKIPS_KEY)) || {};
        } catch (e) {
            skipsCache = {};
        }
        return skipsCache;
    }

    function skipKey(property) {
        return state.target + "|" + state.type + "|" + property;
    }

    function setSkipped(property, skipped) {
        var skips = readSkips();
        if (skipped) {
            skips[skipKey(property)] = Date.now();
        } else {
            delete skips[skipKey(property)];
        }
        skipsCache = skips;
        try {
            localStorage.setItem(SKIPS_KEY, JSON.stringify(skips));
        } catch (e) {
            // Skipping is a convenience; ignore storage failures.
        }
    }

    function skippedCount() {
        var prefix = state.target + "|" + state.type + "|";
        return Object.keys(readSkips()).filter(function (key) {
            return key.indexOf(prefix) === 0;
        }).length;
    }

    /* ------------------------------------------------------------ retrieval */

    /*
     * The query service returns an occasional 502 under load. These queries
     * take several seconds each, so one transient failure should not cost the
     * translator the whole worklist: retry once, briefly, before giving up.
     */
    function sparql(query, attempt) {
        var url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(query) + "&format=json";
        return fetch(url, { headers: { Accept: "application/sparql-results+json" } })
            .then(function (r) {
                if (r.status >= 500 && !attempt) {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 3000);
                    }).then(function () {
                        return sparql(query, 1);
                    });
                }
                if (!r.ok) {
                    throw new Error("the query service answered " + r.status +
                        (r.status >= 500 ? ". It is busy; trying again in a moment usually works." : "."));
                }
                return r.json();
            });
    }

    /*
     * Deliberately returns identifiers only, and does not sort. Asking the
     * query service to also fetch the source language, or to order by property
     * number, turns a six second query into forty. Both are done in the
     * browser instead.
     */
    function worklistQuery(settings) {
        var predicate = TERM_PREDICATE[settings.type];
        var missing =
            "  OPTIONAL { ?property " + predicate + ' ?term FILTER(lang(?term) = "' + settings.target + '") }\n' +
            "  FILTER(!BOUND(?term))\n";

        /*
         * A class holds properties either through "properties for this type"
         * (P1963) or by being their instance, the same pair of routes the
         * class pages use.
         */
        if (settings.scope.kind === "class") {
            return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
                "SELECT DISTINCT ?property WHERE {\n" +
                "  { wd:" + settings.scope.value + " wdt:P1963 ?property. }\n" +
                "  UNION\n" +
                "  { ?property rdf:type wikibase:Property; wdt:P31 wd:" + settings.scope.value + ". }\n" +
                missing +
                "}";
        }

        if (settings.scope.kind === "datatype") {
            return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
                "SELECT DISTINCT ?property WHERE {\n" +
                "  ?property rdf:type wikibase:Property;\n" +
                "            wikibase:propertyType " + settings.scope.value + ".\n" +
                missing +
                "}";
        }

        return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT DISTINCT ?property WHERE {\n" +
            "  ?property rdf:type wikibase:Property.\n" +
            missing +
            "}";
    }

    function worklistCacheKey() {
        return ["wdprop-worklist", state.type, state.target, state.scope.kind, state.scope.value].join(":");
    }

    /*
     * Identifiers are cached as plain numbers: the full list for a language
     * runs to thirteen thousand entries, and the URIs the query service
     * returns are a hundred times larger than the numbers inside them.
     */
    /*
     * When the selection is an explicit list of properties, the terms are read
     * from the MediaWiki API rather than SPARQL. Naming a hundred properties in
     * a VALUES clause takes seconds; asking the API for the same hundred takes
     * about one.
     */
    function loadWorklistByApi(ids) {
        var batches = [];
        for (var i = 0; i < ids.length; i += API_BATCH) {
            batches.push(ids.slice(i, i + API_BATCH));
        }

        return Promise.all(batches.map(function (batch) {
            var url = API + "?action=wbgetentities" +
                "&ids=" + encodeURIComponent(batch.join("|")) +
                "&props=" + encodeURIComponent("labels|descriptions|aliases") +
                "&languages=" + encodeURIComponent(state.target) +
                "&format=json&origin=*";
            return fetch(url).then(function (r) {
                return r.json();
            });
        })).then(function (results) {
            var missing = [];
            results.forEach(function (json) {
                var entities = json.entities || {};
                Object.keys(entities).forEach(function (id) {
                    var entity = entities[id];
                    if (entity.missing !== undefined) {
                        return;
                    }
                    var has;
                    if (state.type === "alias") {
                        var aliases = entity.aliases && entity.aliases[state.target];
                        has = !!(aliases && aliases.length);
                    } else {
                        var field = state.type === "label" ? "labels" : "descriptions";
                        has = !!(entity[field] && entity[field][state.target]);
                    }
                    if (!has) {
                        missing.push(propertyNumber(id));
                    }
                });
            });
            return missing;
        });
    }

    /*
     * ----------------------------------------------------------------------
     * Reading from the offline store
     * ----------------------------------------------------------------------
     *
     * The store holds terms and nothing else, so it can answer for the whole
     * of Wikidata, for one datatype, or for a named list — the selections that
     * are decided by a property's terms and its datatype. It cannot answer for
     * a class, which is a statement, or for the most used, which is a report
     * on the wiki; those still need Wikidata and say so.
     *
     * The store is preferred only when there is no connection. A stored copy
     * is a day or a month old, and while Wikidata is reachable its answer is
     * the true one.
     */
    function storeCanAnswer() {
        return !!(WDProp.offline && WDProp.offline.available() &&
            WDProp.offline.scopes.indexOf(state.scope.kind) !== -1);
    }

    function worklistFromStore() {
        return WDProp.offline.worklist({
            target: state.target,
            type: state.type,
            scope: state.scope
        }).then(function (numbers) {
            state.fromStore = true;
            return numbers;
        });
    }

    function loadWorklist() {
        if (!storeCanAnswer()) {
            return loadWorklistLive();
        }

        if (!WDProp.offline.online()) {
            return worklistFromStore();
        }

        /*
         * A connection that is reported as present but reaches nothing is the
         * ordinary case on a bad link, so the fallback hangs off the failure
         * rather than off navigator.onLine. The live error is what is raised
         * if the store cannot answer either: it describes what the translator
         * was actually waiting for.
         */
        return loadWorklistLive().catch(function (error) {
            return worklistFromStore().catch(function () {
                throw error;
            });
        });
    }

    function loadWorklistLive() {
        /* A ranked list, so its order is kept rather than sorted by number. */
        if (state.scope.kind === "top") {
            return WDProp.usage.topProperties().then(function (ids) {
                state.rankedOrder = ids.map(propertyNumber);
                return loadWorklistByApi(ids);
            }).then(function (numbers) {
                var rank = {};
                state.rankedOrder.forEach(function (n, i) {
                    rank[n] = i;
                });
                return numbers.sort(function (a, b) {
                    return rank[a] - rank[b];
                });
            });
        }

        if (state.scope.kind === "properties") {
            return loadWorklistByApi(state.scope.value.split(",")).then(function (numbers) {
                return numbers.sort(function (a, b) {
                    return a - b;
                });
            });
        }

        var key = worklistCacheKey();
        try {
            var cached = sessionStorage.getItem(key);
            if (cached) {
                return Promise.resolve(JSON.parse(cached));
            }
        } catch (e) {
            // No cache available; fall through to the query.
        }

        return sparql(worklistQuery(state)).then(function (json) {
            var numbers = json.results.bindings.map(function (b) {
                return propertyNumber(b.property.value.replace("http://www.wikidata.org/entity/", ""));
            }).filter(function (n) {
                return !isNaN(n);
            });

            /*
             * Sorted here rather than in SPARQL. Ordering in the query costs
             * several seconds; the low numbers first are the properties that
             * carry most of Wikidata, so they are what a translator should
             * meet first.
             */
            numbers.sort(function (a, b) {
                return a - b;
            });

            try {
                sessionStorage.setItem(key, JSON.stringify(numbers));
            } catch (e) {
                // Cache is optional.
            }
            return numbers;
        });
    }

    function fetchEntities(ids) {
        var languages = [state.target].concat(state.pivots).filter(function (l, i, a) {
            return a.indexOf(l) === i;
        });

        function fromStore() {
            if (!WDProp.offline || !WDProp.offline.available()) {
                return Promise.reject(new Error(t("translate.noStore")));
            }
            return WDProp.offline.entities(ids, languages).then(function (entities) {
                if (!Object.keys(entities).length) {
                    throw new Error(t("translate.noStore"));
                }
                state.fromStore = true;
                return entities;
            });
        }

        if (WDProp.offline && !WDProp.offline.online()) {
            return fromStore();
        }

        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(ids.join("|")) +
            "&props=" + encodeURIComponent("labels|descriptions|aliases|datatype") +
            "&languages=" + encodeURIComponent(languages.join("|")) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error(t("translate.apiAnswered", [r.status]));
            }
            return r.json();
        }).then(function (json) {
            if (json.error) {
                throw new Error(json.error.code || "api");
            }
            return json.entities || {};
        }).catch(function (error) {
            return fromStore().catch(function () {
                throw error;
            });
        });
    }

    /*
     * How the words of this property's source label have been translated
     * before. Loaded once per language pair and matched in the browser, so a
     * suggestion appears the moment a field is focused.
     */
    function loadGlossary() {
        var pivot = state.pivots[0];
        var key = ["wdprop-glossary", state.target, pivot].join(":");

        try {
            var cached = sessionStorage.getItem(key);
            if (cached) {
                state.glossary = indexGlossary(JSON.parse(cached), pivot);
                state.glossaryStatus = "ready";
                return Promise.resolve();
            }
        } catch (e) {
            // Fall through to the query.
        }

        state.glossaryStatus = "loading";
        renderProgress();

        var query = "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT ?property ?src ?tgt WHERE {\n" +
            "  ?property rdf:type wikibase:Property; rdfs:label ?tgt.\n" +
            '  FILTER(lang(?tgt) = "' + state.target + '")\n' +
            '  OPTIONAL { ?property rdfs:label ?src FILTER(lang(?src) = "' + pivot + '") }\n' +
            "}";

        return sparql(query).then(function (json) {
            var pairs = json.results.bindings.filter(function (b) {
                return b.src && b.tgt;
            }).map(function (b) {
                return {
                    property: b.property.value.replace("http://www.wikidata.org/entity/", ""),
                    src: b.src.value,
                    tgt: b.tgt.value
                };
            });

            try {
                sessionStorage.setItem(key, JSON.stringify(pairs));
            } catch (e) {
                // Cache is optional.
            }

            state.glossary = indexGlossary(pairs, pivot);
            state.glossaryStatus = "ready";
            renderProgress();
            refreshVisibleTerminology();
        }).catch(function () {
            state.glossaryStatus = "failed";
            renderProgress();
        });
    }

    function tokenize(text, language) {
        var value = String(text || "");
        var base = String(language || "").toLowerCase().split("-")[0];

        if (UNSEGMENTED.indexOf(base) !== -1) {
            var whole = value.trim().toLowerCase();
            return whole ? [whole] : [];
        }

        var stop = STOPWORDS[base] || [];

        /*
         * Combining marks are part of the word. Without \p{M} a Tamil or
         * Devanagari label is cut at every vowel sign and matches nothing,
         * which would break this for the languages that most need it.
         */
        return value.toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(function (token) {
            return token.length >= 2 && stop.indexOf(token) === -1;
        });
    }

    function indexGlossary(pairs, pivot) {
        var index = {};
        pairs.forEach(function (pair) {
            tokenize(pair.src, pivot).forEach(function (token) {
                (index[token] = index[token] || []).push(pair);
            });
        });
        return { pairs: pairs, index: index };
    }

    function terminologyFor(sourceLabel, glossary, pivot) {
        if (!glossary || !sourceLabel) {
            return [];
        }
        var seen = {};
        var matches = [];

        /*
         * Rarest word first. "identifier" says something about how a term is
         * translated; "id" appears in thousands of labels and says nothing.
         */
        var tokens = tokenize(sourceLabel, pivot).sort(function (a, b) {
            return (glossary.index[a] || []).length - (glossary.index[b] || []).length;
        });

        tokens.forEach(function (token) {
            (glossary.index[token] || []).forEach(function (pair) {
                if (!seen[pair.property]) {
                    seen[pair.property] = true;
                    matches.push({ pair: pair, token: token });
                }
            });
        });
        return matches.slice(0, 6);
    }

    /* --------------------------------------------------------------- render */

    function termsOf(entity, lang) {
        if (!entity) {
            return { label: null, description: null, aliases: [] };
        }
        var aliases = (entity.aliases && entity.aliases[lang]) || [];
        return {
            label: entity.labels && entity.labels[lang] ? entity.labels[lang].value : null,
            description: entity.descriptions && entity.descriptions[lang] ? entity.descriptions[lang].value : null,
            aliases: aliases.map(function (a) {
                return a.value;
            })
        };
    }

    /* The value already on Wikidata for the term being written, if any. */
    function existingTarget(entity) {
        var terms = termsOf(entity, state.target);
        if (state.type === "alias") {
            return terms.aliases.length ? terms.aliases.join(", ") : null;
        }
        return terms[state.type];
    }

    function sourceLabelOf(entity) {
        for (var i = 0; i < state.pivots.length; i++) {
            var terms = termsOf(entity, state.pivots[i]);
            if (terms.label) {
                return terms.label;
            }
        }
        return null;
    }

    /*
     * Drops what is already in the batch or has been skipped before. Run when
     * a worklist is loaded, not after each translation: removing rows as they
     * are filled would shift every later page under the translator, silently
     * stepping over properties. Work done in this session stays in place and
     * is marked instead.
     */
    function computeRemaining() {
        var skips = readSkips();
        var inBatch = {};
        WDProp.cart.list().forEach(function (entry) {
            if (entry.lang === state.target && entry.type === state.type) {
                inBatch[entry.property] = true;
            }
        });

        state.remaining = state.worklist.filter(function (n) {
            var id = "P" + n;
            if (inBatch[id]) {
                return false;
            }
            return state.showSkipped ||
                !Object.prototype.hasOwnProperty.call(skips, skipKey(id));
        });
    }

    /* Properties on the current page. */
    function visibleProperties() {
        var start = state.page * PAGE_SIZE;
        var page = state.remaining.slice(start, start + PAGE_SIZE).map(function (n) {
            return "P" + n;
        });

        if (state.sortByUsage) {
            page = page.slice().sort(function (a, b) {
                var left = typeof state.usage[a] === "number" ? state.usage[a] : -1;
                var right = typeof state.usage[b] === "number" ? state.usage[b] : -1;
                return right - left;
            });
        }

        return { total: state.remaining.length, page: page };
    }

    function renderProgress() {
        var box = document.getElementById("workbenchProgress");
        if (!box.getAttribute("role")) {
            box.setAttribute("role", "status");
            box.setAttribute("aria-live", "polite");
        }
        clear(box);

        if (!state.worklist.length) {
            return;
        }

        var view = visibleProperties();
        var start = state.page * PAGE_SIZE;

        var heading = element("h3", null,
            t("translate.stillNeed", [state.worklist.length.toLocaleString(), termNoun(state.type), state.target]));
        box.appendChild(heading);

        var line = element("p", "wdp-muted");
        line.appendChild(document.createTextNode(
            view.total ? t("translate.showing", [start + 1, Math.min(start + PAGE_SIZE, view.total), view.total.toLocaleString()]) : t("translate.nothingLeft")));
        line.appendChild(document.createTextNode(
            t("translate.sessionCounts", [state.added, skippedCount()])));
        box.appendChild(line);

        /*
         * Ordering the page by usage, rather than the whole worklist: a full
         * ranking would need a count for every one of thousands of properties.
         */
        var sort = element("button", "wdp-button",
            state.sortByUsage ? t("translate.sortByNumber") : t("translate.sortByUsage"));
        sort.setAttribute("type", "button");
        sort.addEventListener("click", function () {
            state.sortByUsage = !state.sortByUsage;
            if (state.sortByUsage) {
                loadUsage(visibleProperties().page).then(renderAll);
            } else {
                renderAll();
            }
        });
        box.appendChild(sort);

        if (skippedCount()) {
            var toggle = element("button", "wdp-button",
                state.showSkipped ? t("translate.hideSkipped") : t("translate.showSkipped", [skippedCount()]));
            toggle.setAttribute("type", "button");
            toggle.addEventListener("click", function () {
                state.showSkipped = !state.showSkipped;
                state.page = 0;
                computeRemaining();
                renderAll();
            });
            box.appendChild(toggle);
        }

        /*
         * Said whenever the store was used, not only when the browser reports
         * itself offline: a stored copy can be weeks old, and a translator
         * choosing what to work on should know that the list of what is
         * missing was true as of a download rather than as of now.
         */
        if (state.fromStore) {
            box.appendChild(element("p", "wdp-message wdp-warning",
                t("translate.fromStore")));
        }

        if (state.glossaryStatus === "loading") {
            box.appendChild(element("p", "wdp-muted",
                t("translate.glossaryLoading", [state.target])));
        } else if (state.glossaryStatus === "failed") {
            box.appendChild(element("p", "wdp-message wdp-warning",
                t("translate.glossaryFailed")));
        }
    }

    function renderTerminology(container, sourceLabel) {
        clear(container);
        var matches = terminologyFor(sourceLabel, state.glossary, state.pivots[0]);
        if (!matches.length) {
            return;
        }

        container.appendChild(element("span", "wb-terms-title",
            t("translate.alreadyTranslated", [state.target])));

        matches.forEach(function (match) {
            var item = element("span", "wb-term");
            item.setAttribute("title", match.pair.property + ": " + match.pair.src);
            item.appendChild(element("span", "wb-term-src", match.pair.src));
            item.appendChild(document.createTextNode(" → "));
            item.appendChild(element("span", "wb-term-tgt", match.pair.tgt));
            container.appendChild(item);
        });
    }

    function refreshVisibleTerminology() {
        var rows = document.querySelectorAll(".wb-row");
        for (var i = 0; i < rows.length; i++) {
            var property = rows[i].getAttribute("data-property");
            var box = rows[i].querySelector(".wb-terms");
            if (box) {
                renderTerminology(box, sourceLabelOf(state.entities[property]));
            }
        }
    }

    /* ------------------------------------------------- per-property context */

    /*
     * Languages close enough that a translator who reads one often reads
     * another, and that share vocabulary worth comparing. A rough grouping,
     * used only to decide what to offer as further reading.
     */
    var LANGUAGE_FAMILIES = [
        ["hi", "mr", "ne", "sa", "bho", "mai", "gu", "pa", "bn", "as", "or", "sd", "si"],
        ["ta", "te", "kn", "ml"],
        ["es", "pt", "ca", "gl", "it", "fr", "ro", "oc", "an", "ast"],
        ["de", "nl", "da", "sv", "nb", "nn", "is", "af", "lb", "fy"],
        ["ru", "uk", "be", "pl", "cs", "sk", "bg", "mk", "sr", "hr", "bs", "sl"],
        ["ar", "he", "am", "ti", "mt", "arz", "ary"],
        ["tr", "az", "kk", "ky", "uz", "tt", "ba", "tk"],
        ["id", "ms", "jv", "su", "tl", "ceb", "war"],
        ["fi", "et", "hu"],
        ["zh", "yue", "wuu", "nan", "hak"],
        ["sw", "zu", "xh", "yo", "ig", "ha", "am"]
    ];

    function relatedLanguages(target) {
        var base = String(target || "").toLowerCase().split("-")[0];
        var related = [];
        LANGUAGE_FAMILIES.forEach(function (family) {
            if (family.indexOf(base) !== -1) {
                family.forEach(function (code) {
                    if (code !== base && related.indexOf(code) === -1) {
                        related.push(code);
                    }
                });
            }
        });
        return related;
    }

    /*
     * A handful of real statements. The inner LIMIT keeps this bounded on
     * properties used millions of times; without it the query service walks
     * the whole set before discarding it.
     */
    function fetchExamples(property) {
        var languages = state.pivots.concat(["en"]).join(",");
        var query = "SELECT ?itemLabel ?value ?valueLabel WHERE {\n" +
            "  { SELECT ?item ?value WHERE { ?item wdt:" + property + " ?value. } LIMIT 4 }\n" +
            '  SERVICE wikibase:label { bd:serviceParam wikibase:language "' + languages + '". }\n' +
            "}";

        return sparql(query).then(function (json) {
            return json.results.bindings.map(function (b) {
                var value = b.valueLabel ? b.valueLabel.value :
                    (b.value ? b.value.value.replace("http://www.wikidata.org/entity/", "") : "");
                return {
                    item: b.itemLabel ? b.itemLabel.value : "",
                    value: value
                };
            }).filter(function (example) {
                return example.item && example.value;
            });
        });
    }

    /* What the property is required to look like, which a description must respect. */
    function fetchConstraints(property) {
        var languages = state.pivots.concat(["en"]).join(",");
        var query = "SELECT ?constraintLabel WHERE {\n" +
            "  wd:" + property + " p:P2302 ?statement.\n" +
            "  ?statement ps:P2302 ?constraint.\n" +
            '  SERVICE wikibase:label { bd:serviceParam wikibase:language "' + languages + '". }\n' +
            "}";

        return sparql(query).then(function (json) {
            var counts = {};
            json.results.bindings.forEach(function (b) {
                if (b.constraintLabel) {
                    counts[b.constraintLabel.value] = (counts[b.constraintLabel.value] || 0) + 1;
                }
            });
            return Object.keys(counts).map(function (name) {
                return { name: name, count: counts[name] };
            }).sort(function (a, b) {
                return b.count - a.count;
            });
        });
    }

    /*
     * Every label the property has, so the ones in languages close to the
     * target can be offered. Asked for without a language filter, which is a
     * single small request.
     */
    function fetchRelatedLabels(property) {
        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(property) +
            "&props=labels&format=json&origin=*";

        return fetch(url).then(function (r) {
            return r.json();
        }).then(function (json) {
            var entity = json.entities && json.entities[property];
            var labels = (entity && entity.labels) || {};
            var base = state.target.toLowerCase().split("-")[0];
            var neighbours = relatedLanguages(state.target);
            var found = [];

            Object.keys(labels).forEach(function (code) {
                var codeBase = code.toLowerCase().split("-")[0];
                if (code === state.target || state.pivots.indexOf(code) !== -1) {
                    return;
                }
                var isVariant = codeBase === base;
                if (isVariant || neighbours.indexOf(codeBase) !== -1) {
                    found.push({ code: code, value: labels[code].value, variant: isVariant });
                }
            });

            /* Variants of the target language first: they are the closest. */
            return found.sort(function (a, b) {
                return (b.variant ? 1 : 0) - (a.variant ? 1 : 0);
            }).slice(0, 8);
        });
    }

    function renderContextPanel(box, property) {
        clear(box);
        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' + t("translate.lookingUp");
        box.appendChild(loading);

        var cached = state.context[property];
        var pending = cached ? Promise.resolve(cached) : Promise.all([
            fetchExamples(property).catch(function () {
                return null;
            }),
            fetchConstraints(property).catch(function () {
                return null;
            }),
            fetchRelatedLabels(property).catch(function () {
                return null;
            })
        ]).then(function (results) {
            state.context[property] = {
                examples: results[0],
                constraints: results[1],
                related: results[2]
            };
            return state.context[property];
        });

        pending.then(function (context) {
            clear(box);

            function section(title, contents) {
                if (!contents) {
                    return;
                }
                box.appendChild(element("h4", "wb-more-title", title));
                box.appendChild(contents);
            }

            if (context.examples && context.examples.length) {
                var list = element("ul", "wb-examples");
                context.examples.forEach(function (example) {
                    var item = element("li");
                    item.appendChild(element("span", "wb-example-item", example.item));
                    item.appendChild(document.createTextNode(" → "));
                    item.appendChild(element("strong", null, example.value));
                    list.appendChild(item);
                });
                section(t("translate.usedLikeThis"), list);
            } else if (context.examples) {
                section(t("translate.usedLikeThis"), element("p", "wdp-muted", t("translate.noStatements")));
            }

            if (context.constraints && context.constraints.length) {
                var rules = element("div", "wb-constraints");
                context.constraints.forEach(function (constraint) {
                    rules.appendChild(element("span", "wb-constraint",
                        constraint.name + (constraint.count > 1 ? " ×" + constraint.count : "")));
                });
                section(t("translate.constraints"), rules);
            }

            if (context.related && context.related.length) {
                var languages = element("div", "wb-related");
                context.related.forEach(function (entry) {
                    var chip = element("span", entry.variant ? "wb-related-item wb-variant" : "wb-related-item");
                    chip.setAttribute("title", entry.variant ?
                        t("translate.isVariant", [entry.code, state.target]) :
                        t("translate.isRelated", [entry.code]));
                    chip.appendChild(element("span", "wb-lang-code", entry.code));
                    chip.appendChild(document.createTextNode(" " + entry.value));
                    languages.appendChild(chip);
                });
                section(t("translate.relatedLanguages"), languages);
            }

            if (!box.firstChild) {
                box.appendChild(element("p", "wdp-muted",
                    t("translate.nothingFurther")));
            }
        });
    }

    function inputs() {
        return Array.prototype.slice.call(document.querySelectorAll(".wb-input:not([disabled])"));
    }

    function focusOffset(from, offset) {
        var all = inputs();
        var index = all.indexOf(from);
        var next = all[index + offset];
        if (next) {
            next.focus();
            next.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }

    function renderRow(property) {
        var entity = state.entities[property];
        var row = element("div", "wb-row");
        row.setAttribute("data-property", property);

        var head = element("div", "wb-head");
        var link = element("a", "wb-property", property);
        link.setAttribute("href", "https://www.wikidata.org/wiki/Property:" + property);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
        head.appendChild(link);

        if (entity && entity.datatype) {
            head.appendChild(element("span", "wdp-tag", entity.datatype));
        }

        var used = element("span", "wb-usage");
        used.setAttribute("data-usage-for", property);
        if (typeof state.usage[property] === "number") {
            used.appendChild(document.createTextNode(
                t("translate.usedOn", [WDProp.usage.format(state.usage[property])])));
        }
        head.appendChild(used);

        var details = element("a", "wb-link", t("translate.inWDProp"));
        details.setAttribute("href", "property.html?property=" + property);
        head.appendChild(details);

        var talk = element("a", "wb-link", t("translate.discussion"));
        talk.setAttribute("href", "https://www.wikidata.org/wiki/Property_talk:" + property);
        talk.setAttribute("target", "_blank");
        talk.setAttribute("rel", "noopener");
        head.appendChild(talk);
        row.appendChild(head);

        /* What the property says in each language the translator reads. */
        var context = element("div", "wb-context");
        state.pivots.forEach(function (lang) {
            var terms = termsOf(entity, lang);
            if (!terms.label && !terms.description && !terms.aliases.length) {
                return;
            }
            var line = element("div", "wb-context-line");
            line.appendChild(element("span", "wb-lang", lang));
            var body = element("span", "wb-context-body");
            if (terms.label) {
                body.appendChild(element("strong", null, terms.label));
            }
            if (terms.description) {
                body.appendChild(element("span", "wdp-desc", (terms.label ? " — " : "") + terms.description));
            }
            if (terms.aliases.length) {
                body.appendChild(element("div", "wdp-aliases", "also: " + terms.aliases.join(", ")));
            }
            line.appendChild(body);
            context.appendChild(line);
        });
        if (!context.firstChild) {
            context.appendChild(element("p", "wdp-missing",
                t("translate.noSource", [state.pivots.join(", ")])));
        }
        row.appendChild(context);

        var existing = existingTarget(entity);

        /*
         * The worklist can be minutes old. A term added in the meantime is
         * shown rather than offered for overwriting.
         */
        if (existing && state.type !== "alias") {
            var done = element("div", "wb-done");
            done.appendChild(document.createTextNode(
                t("translate.sinceAdded", [termNoun(state.type), state.target])));
            done.appendChild(element("strong", null, existing));
            row.appendChild(done);
            return row;
        }

        var entry = element("div", "wb-entry");
        entry.appendChild(element("span", "wb-lang wb-target", state.target));

        var input = element("input", "wdp-input wb-input");
        input.setAttribute("type", "text");
        input.setAttribute("dir", "auto");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("placeholder", t("translate.fieldPlaceholder", [termNoun(state.type), state.target]));
        entry.appendChild(input);

        var add = element("button", "wdp-button wdp-primary wb-add", t("common.add"));
        add.setAttribute("type", "button");
        entry.appendChild(add);

        var skip = element("button", "wdp-button wb-skip", t("common.skip"));
        skip.setAttribute("type", "button");
        entry.appendChild(skip);
        row.appendChild(entry);

        var terms = element("div", "wb-terms");
        row.appendChild(terms);

        /*
         * Examples and constraints are several seconds each, so they are
         * fetched when asked for rather than for every row on the page.
         */
        var more = element("details", "wb-more");
        var summary = element("summary", null, t("translate.moreContext"));
        more.appendChild(summary);
        var moreBody = element("div", "wb-more-body");
        more.appendChild(moreBody);
        more.addEventListener("toggle", function () {
            if (more.open && !moreBody.firstChild) {
                renderContextPanel(moreBody, property);
            }
        });
        row.appendChild(more);

        var messages = element("div", "wdp-messages");
        row.appendChild(messages);

        var sourceLabel = sourceLabelOf(entity);
        var sourcePivot = null;
        for (var i = 0; i < state.pivots.length; i++) {
            if (termsOf(entity, state.pivots[i]).label) {
                sourcePivot = state.pivots[i];
                break;
            }
        }

        function pivotValue() {
            var terms = termsOf(entity, sourcePivot || state.pivots[0]);
            if (state.type === "alias") {
                return terms.aliases.length ? terms.aliases[0] : null;
            }
            return terms[state.type];
        }

        function draft() {
            return {
                property: property,
                lang: state.target,
                type: state.type,
                value: input.value,
                pivot: sourcePivot || state.pivots[0],
                pivotValue: pivotValue()
            };
        }

        function check() {
            clear(messages);
            if (input.value.trim() === "") {
                return { blocking: [], warnings: [] };
            }
            var result = WDProp.validate.entry(draft());
            result.blocking.forEach(function (message) {
                messages.appendChild(element("p", "wdp-message wdp-blocking", message));
            });
            result.warnings.forEach(function (message) {
                messages.appendChild(element("p", "wdp-message wdp-warning", message));
            });
            return result;
        }

        function commit() {
            if (input.value.trim() === "") {
                return false;
            }
            if (check().blocking.length) {
                return false;
            }
            WDProp.cart.add(draft());
            WDProp.cart.savePrefs({ lang: state.target, pivot: state.pivots[0] });
            state.added++;

            row.setAttribute("class", "wb-row wb-committed");
            clear(messages);
            messages.appendChild(element("p", "wdp-message wdp-success",
                t("translate.addedToBatch", [input.value.trim()])));
            input.setAttribute("disabled", "disabled");
            add.disabled = true;
            skip.disabled = true;
            renderProgress();
            return true;
        }

        function doSkip() {
            setSkipped(property, true);
            state.skippedThisSession++;
            row.setAttribute("class", "wb-row wb-skipped");
            input.setAttribute("disabled", "disabled");
            add.disabled = true;
            skip.disabled = true;
            renderProgress();
        }

        input.addEventListener("input", check);
        input.addEventListener("focus", function () {
            renderTerminology(terms, sourceLabel);
        });

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                if (commit()) {
                    focusOffset(input, 1);
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                var next = inputs()[inputs().indexOf(input) + 1];
                doSkip();
                if (next) {
                    next.focus();
                }
            } else if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                focusOffset(input, 1);
            } else if (event.altKey && event.key === "ArrowUp") {
                event.preventDefault();
                focusOffset(input, -1);
            }
        });

        add.addEventListener("click", commit);
        skip.addEventListener("click", doSkip);

        return row;
    }

    function renderRows() {
        var box = document.getElementById("workbenchRows");
        clear(box);

        var view = visibleProperties();
        if (!view.page.length) {
            box.appendChild(element("p", "wdp-muted",
                state.worklist.length ?
                    t("translate.emptyPage") :
                    t("translate.chooseLanguages")));
            return;
        }

        view.page.forEach(function (property) {
            box.appendChild(renderRow(property));
        });
    }

    function renderPager() {
        var box = document.getElementById("workbenchPager");
        clear(box);

        var view = visibleProperties();
        var pages = Math.ceil(view.total / PAGE_SIZE);
        if (pages <= 1) {
            return;
        }

        /*
         * The control is in pager.js, shared with the data tables. It brings
         * with it the announcement this pager did not make: turning a page
         * replaces every row above the buttons, and nothing said so.
         */
        var pager = WDProp.pager({
            previousText: t("translate.previous"),
            nextText: t("translate.next"),
            onChange: function (page) {
                state.page = page;
                loadPage();
            }
        });

        pager.update(state.page, pages,
            t("translate.page", [state.page + 1, pages.toLocaleString()]));
        box.appendChild(pager.element);
    }

    function renderAll() {
        renderProgress();
        renderRows();
        renderPager();
    }

    /*
     * Usage figures arrive after the page is already usable: they inform the
     * choice of what to work on, so they must never hold up the work itself.
     */
    function loadUsage(ids) {
        var wanted = ids.filter(function (id) {
            return typeof state.usage[id] !== "number";
        });
        if (!wanted.length) {
            applyUsage();
            return Promise.resolve();
        }

        return WDProp.usage.counts(wanted).then(function (found) {
            Object.keys(found).forEach(function (id) {
                state.usage[id] = found[id];
            });
            applyUsage();
        });
    }

    function applyUsage() {
        var slots = document.querySelectorAll("[data-usage-for]");
        for (var i = 0; i < slots.length; i++) {
            var id = slots[i].getAttribute("data-usage-for");
            clear(slots[i]);
            if (typeof state.usage[id] === "number") {
                slots[i].appendChild(document.createTextNode(
                    t("translate.usedOn", [WDProp.usage.format(state.usage[id])])));
            }
        }
    }

    /* ------------------------------------------------------------- controls */

    function loadPage() {
        var view = visibleProperties();
        var needed = view.page.filter(function (id) {
            return !state.entities[id];
        });

        if (!needed.length) {
            renderAll();
            window.scrollTo({ top: 0, behavior: "smooth" });
            return Promise.resolve();
        }

        var box = document.getElementById("workbenchRows");
        clear(box);
        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' + t("translate.fetchingProperties");
        box.appendChild(loading);

        var batches = [];
        for (var i = 0; i < needed.length; i += API_BATCH) {
            batches.push(needed.slice(i, i + API_BATCH));
        }

        return Promise.all(batches.map(fetchEntities)).then(function (results) {
            results.forEach(function (entities) {
                Object.keys(entities).forEach(function (id) {
                    state.entities[id] = entities[id];
                });
            });
            renderAll();
            window.scrollTo({ top: 0, behavior: "smooth" });
            loadUsage(visibleProperties().page);
        }).catch(function (e) {
            clear(box);
            box.appendChild(element("p", "wdp-message wdp-blocking",
                t("translate.propertiesFailed", [e.message])));
        });
    }

    function readControls() {
        var pivots = document.getElementById("wbPivots").value
            .split(",").map(function (s) {
                return s.trim();
            }).filter(function (s) {
                return s !== "";
            });

        var scopeKind = document.getElementById("wbScope").value;
        var scopeValue = document.getElementById("wbScopeValue").value.trim();

        return {
            target: document.getElementById("wbTarget").value.trim(),
            pivots: pivots.length ? pivots : ["en"],
            type: document.getElementById("wbType").value,
            scope: { kind: scopeKind, value: scopeValue }
        };
    }

    function validateSettings(settings) {
        var problems = [];
        if (!LANGUAGE_RE.test(settings.target)) {
            problems.push(t("translate.badLanguage", [settings.target]));
        }
        settings.pivots.forEach(function (lang) {
            if (!LANGUAGE_RE.test(lang)) {
                problems.push(t("translate.badLanguage", [lang]));
            }
        });
        if (settings.scope.kind === "class" && !CLASS_RE.test(settings.scope.value)) {
            problems.push(t("translate.badClass"));
        }
        if (settings.scope.kind === "datatype" && !DATATYPE_RE.test(settings.scope.value)) {
            problems.push(t("translate.badDatatype"));
        }
        if (settings.scope.kind === "top") {
            return problems;
        }
        if (settings.scope.kind === "properties" && !PROPERTY_LIST_RE.test(settings.scope.value)) {
            problems.push(t("translate.badPropertyList"));
        }
        return problems;
    }

    function syncUrl() {
        var params = ["target=" + encodeURIComponent(state.target),
            "pivots=" + encodeURIComponent(state.pivots.join(",")),
            "type=" + encodeURIComponent(state.type)];
        if (state.scope.kind === "top") {
            params.push("top=1");
        } else if (state.scope.kind !== "all") {
            params.push(state.scope.kind + "=" + encodeURIComponent(state.scope.value));
        }
        window.history.replaceState(null, "", "translate.html?" + params.join("&"));
    }

    function start() {
        var settings = readControls();
        var problems = validateSettings(settings);
        var box = document.getElementById("workbenchRows");

        clear(document.getElementById("workbenchProgress"));
        clear(document.getElementById("workbenchPager"));
        clear(box);

        if (problems.length) {
            problems.forEach(function (message) {
                box.appendChild(element("p", "wdp-message wdp-blocking", message));
            });
            return;
        }

        state.target = settings.target;
        state.pivots = settings.pivots;
        state.type = settings.type;
        state.scope = settings.scope;
        state.worklist = [];
        state.remaining = [];
        state.entities = {};
        state.glossary = null;
        state.glossaryStatus = "idle";
        state.context = {};
        state.page = 0;
        state.added = 0;
        state.fromStore = false;
        syncUrl();

        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' +
            t("translate.askingWikidata", [termNoun(state.type), state.target]);
        box.appendChild(loading);

        loadWorklist().then(function (numbers) {
            state.worklist = numbers;
            computeRemaining();
            if (!numbers.length) {
                clear(box);
                box.appendChild(element("p", "wdp-message wdp-success",
                    t("translate.nothingMissing", [termNoun(state.type), state.target])));
                return;
            }
            return loadPage().then(function () {
                // Terminology can take much longer than the worklist, so it
                // arrives after the translator has already started.
                loadGlossary();
            });
        }).catch(function (e) {
            clear(box);
            box.appendChild(element("p", "wdp-message wdp-blocking",
                t("translate.worklistFailed", [e.message])));
        });
    }

    function init() {
        var form = document.getElementById("workbenchControls");
        if (!form) {
            return;
        }

        var prefs = WDProp.cart.prefs();
        var target = urlValue("target", prefs.lang || "");
        var pivots = urlValue("pivots", prefs.pivot || "en");
        var type = urlValue("type", "label");
        var scopeClass = urlValue("class", "");
        var scopeDatatype = urlValue("datatype", "");
        var scopeProperties = urlValue("properties", "");
        var scopeTop = urlValue("top", "");

        document.getElementById("wbTarget").value = target;
        document.getElementById("wbPivots").value = pivots;
        document.getElementById("wbType").value = type;

        var scopeSelect = document.getElementById("wbScope");
        var scopeValue = document.getElementById("wbScopeValue");
        if (scopeClass) {
            scopeSelect.value = "class";
            scopeValue.value = scopeClass;
        } else if (scopeDatatype) {
            scopeSelect.value = "datatype";
            scopeValue.value = scopeDatatype;
        } else if (scopeProperties) {
            scopeSelect.value = "properties";
            scopeValue.value = scopeProperties;
        } else if (scopeTop) {
            scopeSelect.value = "top";
        }

        function updateScopeVisibility() {
            var needsValue = scopeSelect.value !== "all" && scopeSelect.value !== "top";
            scopeValue.style.display = needsValue ? "" : "none";
            scopeValue.setAttribute("placeholder",
                scopeSelect.value === "datatype" ? "wikibase:WikibaseItem" :
                    scopeSelect.value === "properties" ? "P31,P17,P1476" : "Q18616576");
        }
        scopeSelect.addEventListener("change", updateScopeVisibility);
        updateScopeVisibility();

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            start();
        });

        // A worklist is only loaded unprompted when the link already says
        // which languages to use.
        if (target) {
            start();
        }
    }

    /*
     * `internals` holds the parts that depend on nothing but their arguments,
     * so that the query building and terminology matching can be exercised
     * without a page around them.
     */
    WDProp.translate = {
        start: start,
        internals: {
            worklistQuery: worklistQuery,
            validateSettings: validateSettings,
            tokenize: tokenize,
            indexGlossary: indexGlossary,
            terminologyFor: terminologyFor,
            relatedLanguages: relatedLanguages
        }
    };

    WDProp.ready(init);
})(window.WDProp);
