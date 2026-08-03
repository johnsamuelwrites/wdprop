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

    var TERM_PREDICATE = {
        label: "rdfs:label",
        description: "schema:description",
        alias: "skos:altLabel"
    };

    var TERM_NOUN = {
        label: "label",
        description: "description",
        alias: "alias"
    };

    /* Function words carry no terminology, so they are not worth matching on. */
    var STOPWORDS = {
        en: ["that", "this", "with", "from", "which", "were", "have", "has", "been",
            "the", "and", "for", "are", "was", "its", "into", "than", "then",
            "such", "used", "using", "when", "where", "what", "some", "other",
            "their", "these", "those", "also", "only", "each", "both", "more",
            "of", "in", "to", "by", "on", "at", "as", "or", "is", "an", "it",
            "be", "if", "no", "do", "a"]
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
        showSkipped: false,
        added: 0,
        skippedThisSession: 0
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
    function loadWorklist() {
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

        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(ids.join("|")) +
            "&props=" + encodeURIComponent("labels|descriptions|aliases|datatype") +
            "&languages=" + encodeURIComponent(languages.join("|")) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            return r.json();
        }).then(function (json) {
            return json.entities || {};
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
        return {
            total: state.remaining.length,
            page: state.remaining.slice(start, start + PAGE_SIZE).map(function (n) {
                return "P" + n;
            })
        };
    }

    function renderProgress() {
        var box = document.getElementById("workbenchProgress");
        clear(box);

        if (!state.worklist.length) {
            return;
        }

        var view = visibleProperties();
        var start = state.page * PAGE_SIZE;

        var heading = element("h3", null,
            state.worklist.length.toLocaleString() + " properties still need a " +
            TERM_NOUN[state.type] + " in " + state.target);
        box.appendChild(heading);

        var line = element("p", "wdp-muted");
        line.appendChild(document.createTextNode(
            view.total ? "Showing " + (start + 1) + "–" + Math.min(start + PAGE_SIZE, view.total) +
                " of " + view.total.toLocaleString() + " remaining. " : "Nothing left to show. "));
        line.appendChild(document.createTextNode(
            state.added + " added this session, " + skippedCount() + " skipped."));
        box.appendChild(line);

        if (skippedCount()) {
            var toggle = element("button", "wdp-button",
                state.showSkipped ? "Hide skipped" : "Show skipped (" + skippedCount() + ")");
            toggle.setAttribute("type", "button");
            toggle.addEventListener("click", function () {
                state.showSkipped = !state.showSkipped;
                state.page = 0;
                computeRemaining();
                renderAll();
            });
            box.appendChild(toggle);
        }

        if (state.glossaryStatus === "loading") {
            box.appendChild(element("p", "wdp-muted",
                "Collecting how these words were translated into " + state.target + " before…"));
        } else if (state.glossaryStatus === "failed") {
            box.appendChild(element("p", "wdp-message wdp-warning",
                "Earlier translations could not be loaded, so no terminology suggestions are shown. Everything else works."));
        }
    }

    function renderTerminology(container, sourceLabel) {
        clear(container);
        var matches = terminologyFor(sourceLabel, state.glossary, state.pivots[0]);
        if (!matches.length) {
            return;
        }

        container.appendChild(element("span", "wb-terms-title",
            "Already translated into " + state.target + ":"));

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

        var details = element("a", "wb-link", "in WDProp");
        details.setAttribute("href", "property.html?property=" + property);
        head.appendChild(details);

        var talk = element("a", "wb-link", "discussion");
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
                "No label or description in " + state.pivots.join(", ") +
                ". Open the property to find another language to work from."));
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
                "Someone has since added a " + TERM_NOUN[state.type] + " in " + state.target + ": "));
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
        input.setAttribute("placeholder", TERM_NOUN[state.type] + " in " + state.target);
        entry.appendChild(input);

        var add = element("button", "wdp-button wdp-primary wb-add", "Add");
        add.setAttribute("type", "button");
        entry.appendChild(add);

        var skip = element("button", "wdp-button wb-skip", "Skip");
        skip.setAttribute("type", "button");
        entry.appendChild(skip);
        row.appendChild(entry);

        var terms = element("div", "wb-terms");
        row.appendChild(terms);

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
                "Added to the batch: " + input.value.trim()));
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
                    "Nothing left on this page. Everything here is either in your batch or skipped." :
                    "Choose the languages you work with and load a worklist."));
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

        var previous = element("button", "wdp-button", "← Previous");
        previous.setAttribute("type", "button");
        previous.disabled = state.page === 0;
        previous.addEventListener("click", function () {
            state.page--;
            loadPage();
        });
        box.appendChild(previous);

        box.appendChild(element("span", "wdp-muted",
            " Page " + (state.page + 1) + " of " + pages.toLocaleString() + " "));

        var next = element("button", "wdp-button", "Next →");
        next.setAttribute("type", "button");
        next.disabled = state.page >= pages - 1;
        next.addEventListener("click", function () {
            state.page++;
            loadPage();
        });
        box.appendChild(next);
    }

    function renderAll() {
        renderProgress();
        renderRows();
        renderPager();
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
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> Fetching the properties…';
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
        }).catch(function (e) {
            clear(box);
            box.appendChild(element("p", "wdp-message wdp-blocking",
                "Could not fetch the properties: " + e.message));
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
            problems.push("“" + settings.target + "” does not look like a language code.");
        }
        settings.pivots.forEach(function (lang) {
            if (!LANGUAGE_RE.test(lang)) {
                problems.push("“" + lang + "” does not look like a language code.");
            }
        });
        if (settings.scope.kind === "class" && !CLASS_RE.test(settings.scope.value)) {
            problems.push("A property class is an item identifier, for example Q18616576.");
        }
        if (settings.scope.kind === "datatype" && !DATATYPE_RE.test(settings.scope.value)) {
            problems.push("A datatype looks like wikibase:WikibaseItem.");
        }
        return problems;
    }

    function syncUrl() {
        var params = ["target=" + encodeURIComponent(state.target),
            "pivots=" + encodeURIComponent(state.pivots.join(",")),
            "type=" + encodeURIComponent(state.type)];
        if (state.scope.kind !== "all") {
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
        state.page = 0;
        state.added = 0;
        syncUrl();

        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' +
            "Asking Wikidata which properties still need a " + TERM_NOUN[state.type] +
            " in " + state.target + ". This takes a few seconds…";
        box.appendChild(loading);

        loadWorklist().then(function (numbers) {
            state.worklist = numbers;
            computeRemaining();
            if (!numbers.length) {
                clear(box);
                box.appendChild(element("p", "wdp-message wdp-success",
                    "Nothing is missing here — every property in this selection has a " +
                    TERM_NOUN[state.type] + " in " + state.target + "."));
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
                "Could not load the worklist: " + e.message));
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
        }

        function updateScopeVisibility() {
            scopeValue.style.display = scopeSelect.value === "all" ? "none" : "";
            scopeValue.setAttribute("placeholder",
                scopeSelect.value === "datatype" ? "wikibase:WikibaseItem" : "Q18616576");
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
            terminologyFor: terminologyFor
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window.WDProp);
