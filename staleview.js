/*
 * WDProp - The out-of-date translations page
 *
 * Drives stale.html. stale.js decides whether a translation predates the term
 * it was made from; this asks it about a set of properties and puts the
 * findings on screen.
 *
 * The order of work matters, because the expensive part is the last of it:
 *
 *   1. the properties in scope, from one query or from the usage report;
 *   2. their terms in both languages, from the MediaWiki API fifty at a time,
 *      which is what says whether there is a translation to be stale at all;
 *   3. a revision history for each of those that has one — a request apiece,
 *      and the reason the page asks for a scope and a limit rather than
 *      offering to check a language outright.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";
    var SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

    var API_BATCH = 50;
    var DEFAULT_LIMIT = 100;
    var MAX_LIMIT = 300;

    /* Parameters reach SPARQL, so each is checked against its shape. */
    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
    var CLASS_RE = /^Q[0-9]+$/;
    var DATATYPE_RE = /^wikibase:[A-Za-z]+$/;
    var PROPERTY_LIST_RE = /^P[0-9]+(\s*,\s*P[0-9]+)*$/;

    var state = {
        target: "",
        source: "en",
        type: "description",
        scope: { kind: "top", value: "" },
        limit: DEFAULT_LIMIT,
        terms: {},
        results: {},
        order: [],
        skipped: 0,
        running: null
    };

    function t(key, params) {
        return WDProp.i18n.t(key, params);
    }

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
        var found = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
        return found ? decodeURIComponent(found[1].replace(/\+/g, " ")) : fallback;
    }

    /* ------------------------------------------------------- what to check */

    function sparql(query) {
        var url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(query) + "&format=json";
        return fetch(url, { headers: { Accept: "application/sparql-results+json" } })
            .then(function (r) {
                if (!r.ok) {
                    throw new Error(t("stale.queryFailed", [r.status]));
                }
                return r.json();
            });
    }

    function scopeQuery() {
        if (state.scope.kind === "class") {
            return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
                "SELECT DISTINCT ?property WHERE {\n" +
                "  { wd:" + state.scope.value + " wdt:P1963 ?property. }\n" +
                "  UNION\n" +
                "  { ?property rdf:type wikibase:Property; wdt:P31 wd:" + state.scope.value + ". }\n" +
                "}";
        }
        return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT DISTINCT ?property WHERE {\n" +
            "  ?property rdf:type wikibase:Property;\n" +
            "            wikibase:propertyType " + state.scope.value + ".\n" +
            "}";
    }

    /*
     * The properties to check, already cut to the limit.
     *
     * A class or a datatype can hold thousands, and there is no ranking to
     * hand for them, so the cut is by property number: the low numbers are
     * the properties that have been in Wikidata longest and are used most, and
     * they are also the ones whose descriptions have had time to be rewritten.
     * The summary says this happened rather than quietly showing part of a set.
     */
    function propertiesInScope() {
        if (state.scope.kind === "top") {
            return WDProp.usage.topProperties().then(function (ids) {
                return ids.slice(0, state.limit);
            });
        }

        if (state.scope.kind === "properties") {
            return Promise.resolve(state.scope.value.split(",").map(function (id) {
                return id.trim();
            }).slice(0, state.limit));
        }

        return sparql(scopeQuery()).then(function (json) {
            var ids = json.results.bindings.map(function (binding) {
                return binding.property.value.replace("http://www.wikidata.org/entity/", "");
            }).filter(function (id) {
                return /^P[0-9]+$/.test(id);
            });
            ids.sort(function (a, b) {
                return Number(a.slice(1)) - Number(b.slice(1));
            });
            return ids.slice(0, state.limit);
        });
    }

    /*
     * The source and target terms as they stand now. This is also the filter:
     * a property with no translation cannot have a stale one, and one with no
     * source term has nothing to have drifted from. Both are counted and
     * reported rather than silently dropped.
     */
    function fetchTerms(ids) {
        var batches = [];
        for (var i = 0; i < ids.length; i += API_BATCH) {
            batches.push(ids.slice(i, i + API_BATCH));
        }

        return Promise.all(batches.map(function (batch) {
            var url = API + "?action=wbgetentities" +
                "&ids=" + encodeURIComponent(batch.join("|")) +
                "&props=" + encodeURIComponent("labels|descriptions|aliases") +
                "&languages=" + encodeURIComponent(state.target + "|" + state.source) +
                "&format=json&origin=*";
            return fetch(url).then(function (r) {
                if (!r.ok) {
                    throw new Error(t("stale.apiFailed", [r.status]));
                }
                return r.json();
            });
        })).then(function (results) {
            var terms = {};
            results.forEach(function (json) {
                var entities = json.entities || {};
                Object.keys(entities).forEach(function (id) {
                    var entity = entities[id];
                    if (entity.missing !== undefined) {
                        return;
                    }
                    terms[id] = {
                        source: termOf(entity, state.source),
                        target: termOf(entity, state.target)
                    };
                });
            });
            return terms;
        });
    }

    function termOf(entity, language) {
        if (state.type === "alias") {
            var aliases = entity.aliases && entity.aliases[language];
            return aliases && aliases.length ? aliases.map(function (a) {
                return a.value;
            }).join(", ") : null;
        }
        var group = entity[state.type === "label" ? "labels" : "descriptions"];
        return (group && group[language] && group[language].value) || null;
    }

    /* ------------------------------------------------------------ rendering */

    function summaryBox() {
        var box = document.getElementById("staleSummary");
        if (!box.getAttribute("role")) {
            box.setAttribute("role", "status");
            box.setAttribute("aria-live", "polite");
        }
        return box;
    }

    function say(message, className) {
        var box = summaryBox();
        clear(box);
        box.appendChild(element("p", className || "wdp-muted", message));
    }

    function countsOf() {
        var counts = { drifted: 0, current: 0, unknown: 0 };
        state.order.forEach(function (id) {
            var result = state.results[id];
            if (result) {
                counts[result.state]++;
            }
        });
        return counts;
    }

    function renderSummary() {
        var box = summaryBox();
        clear(box);

        var counts = countsOf();
        box.appendChild(element("h3", null,
            t("stale.summary", [counts.drifted, state.order.length,
                t("term." + state.type + "s"), state.target])));

        if (!counts.drifted) {
            box.appendChild(element("p", "wdp-muted", t("stale.noneDrifted")));
        }

        box.appendChild(element("p", "wdp-muted",
            t("stale.breakdown", [counts.current, counts.unknown])));

        if (state.skipped) {
            box.appendChild(element("p", "wdp-muted",
                t("stale.skipped", [state.skipped])));
        }
    }

    /*
     * What the source term said before the edit, and what it says now. Asked
     * for only when a reader opens a finding: it costs two whole revisions of
     * the property, and a page of them would be several megabytes.
     */
    function renderChange(container, property, result) {
        clear(container);
        container.appendChild(element("p", "wdprop-loading", t("stale.loadingChange")));

        WDProp.stale.changed(property,
            { source: state.source, type: state.type },
            result.revision, result.parent
        ).then(function (change) {
            clear(container);

            var table = element("table", "wdp-context-table");
            [[t("stale.wasOn", [WDProp.stale.date(result.sourceAt)]), change.before],
             [t("stale.nowReads"), change.after]].forEach(function (pair) {
                var row = element("tr");
                row.appendChild(element("th", null, pair[0]));
                var cell = element("td", "wdp-value");
                cell.setAttribute("dir", "auto");
                cell.appendChild(document.createTextNode(
                    pair[1] === null ? t("stale.termAbsent") : pair[1]));
                row.appendChild(cell);
                table.appendChild(row);
            });
            container.appendChild(table);

            var link = element("a", null, t("stale.seeEdit"));
            link.setAttribute("href",
                "https://www.wikidata.org/w/index.php?diff=" + result.revision);
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener");
            container.appendChild(link);
        }).catch(function () {
            clear(container);
            container.appendChild(element("p", "wdp-message wdp-warning",
                t("stale.changeUnavailable")));
        });
    }

    /*
     * The revision form. It starts from the translation that is already there
     * rather than from nothing: a drifted description usually needs a phrase
     * changed, not rewriting, and retyping it from scratch loses the wording a
     * language has settled on.
     */
    function renderRevise(container, property) {
        var terms = state.terms[property];

        var field = document.createElement("input");
        field.setAttribute("type", "text");
        field.setAttribute("class", "wdp-input");
        field.setAttribute("dir", "auto");
        field.setAttribute("aria-label", t("stale.reviseLabel", [state.target]));
        field.value = terms.target || "";

        var add = element("button", "wdp-button wdp-primary", t("stale.addRevision"));
        add.setAttribute("type", "button");
        add.addEventListener("click", function () {
            var value = String(field.value).trim();
            if (!value || value === terms.target) {
                WDProp.toast(t("stale.nothingChanged"), "error");
                return;
            }
            WDProp.cart.add({
                property: property,
                lang: state.target,
                type: state.type,
                value: value,
                pivot: state.source,
                pivotValue: terms.source,
                reason: "drift"
            });
            WDProp.toast(t("stale.addedToBatch", [property]));
        });

        var row = element("div", "wb-control");
        row.appendChild(field);
        row.appendChild(add);
        container.appendChild(row);

        /*
         * An alias is appended by QuickStatements rather than replacing what
         * is there, so revising one adds a second spelling instead of
         * correcting the first. Said here, where the choice is being made.
         */
        if (state.type === "alias") {
            container.appendChild(element("p", "wdp-message wdp-warning",
                t("stale.aliasAppends")));
        }
    }

    function renderRow(table, property) {
        var result = state.results[property];
        var terms = state.terms[property];

        var row = element("tr");

        var cell = element("td");
        var link = element("a", null, property);
        link.setAttribute("href", "property.html?property=" + property);
        cell.appendChild(link);
        row.appendChild(cell);

        cell = element("td", "wdp-value");
        cell.setAttribute("dir", "auto");
        cell.appendChild(document.createTextNode(terms.source || ""));
        row.appendChild(cell);

        cell = element("td", "wdp-value");
        cell.setAttribute("dir", "auto");
        cell.appendChild(document.createTextNode(terms.target || ""));
        row.appendChild(cell);

        row.appendChild(element("td", "wdp-muted", result.beyondWindow ?
            t("stale.beforeWindow", [WDProp.stale.internals.REVISION_LIMIT]) :
            WDProp.stale.date(result.translatedAt)));

        row.appendChild(element("td", "wdp-muted", WDProp.stale.date(result.sourceAt)));

        cell = element("td");
        var open = element("button", "wdp-button", t("stale.whatChanged"));
        open.setAttribute("type", "button");
        open.setAttribute("aria-expanded", "false");
        cell.appendChild(open);
        row.appendChild(cell);

        table.appendChild(row);

        var detailRow = element("tr", "wdp-stale-detail");
        var detailCell = element("td");
        detailCell.setAttribute("colspan", "6");
        detailRow.appendChild(detailCell);
        detailRow.style.display = "none";
        table.appendChild(detailRow);

        var loaded = false;
        open.addEventListener("click", function () {
            var showing = detailRow.style.display === "none";
            detailRow.style.display = showing ? "" : "none";
            open.setAttribute("aria-expanded", showing ? "true" : "false");
            if (showing && !loaded) {
                loaded = true;
                var change = element("div");
                var revise = element("div", "wdp-stale-revise");
                detailCell.appendChild(change);
                detailCell.appendChild(revise);
                renderChange(change, property, result);
                renderRevise(revise, property);
            }
        });
    }

    /*
     * The properties on which no verdict was reached, as a list of
     * identifiers with the reason beside each.
     *
     * These are not hidden. A report that shows only what it could decide
     * invites the reader to take the rest as decided, and on a heavily edited
     * property "cannot tell" is a common and honest answer.
     */
    function renderUnknown(container) {
        var unknown = state.order.filter(function (id) {
            return state.results[id].state === "unknown";
        });
        if (!unknown.length) {
            return;
        }

        var details = document.createElement("details");
        var summary = document.createElement("summary");
        summary.appendChild(document.createTextNode(
            t("stale.unknownHeading", [unknown.length])));
        details.appendChild(summary);

        var table = element("table", "alternate");
        var head = element("tr");
        [t("stale.colProperty"), t("stale.colWhy")].forEach(function (title) {
            head.appendChild(element("th", null, title));
        });
        table.appendChild(head);

        unknown.forEach(function (id) {
            var row = element("tr");
            var cell = element("td");
            var link = element("a", null, id);
            link.setAttribute("href", "property.html?property=" + id);
            cell.appendChild(link);
            row.appendChild(cell);
            row.appendChild(element("td", "wdp-muted",
                WDProp.stale.explain(state.results[id])));
            table.appendChild(row);
        });

        details.appendChild(table);
        container.appendChild(details);
    }

    function render() {
        renderSummary();

        var container = document.getElementById("staleResults");
        clear(container);

        var drifted = state.order.filter(function (id) {
            return state.results[id].state === "drifted";
        });

        if (drifted.length) {
            var table = element("table", "alternate");
            var head = element("tr");
            [t("stale.colProperty"), t("stale.colSource", [state.source]),
                t("stale.colTranslation", [state.target]), t("stale.colTranslated"),
                t("stale.colSourceChanged"), ""].forEach(function (title) {
                head.appendChild(element("th", null, title));
            });
            table.appendChild(head);

            /* Oldest translation first: the furthest behind is the most worth doing. */
            drifted.sort(function (a, b) {
                return (state.results[a].translatedAt || 0) - (state.results[b].translatedAt || 0);
            }).forEach(function (id) {
                renderRow(table, id);
            });

            container.appendChild(table);
        }

        renderUnknown(container);
    }

    /* ---------------------------------------------------------- running it */

    function readControls() {
        var scope = document.getElementById("stScope").value;
        return {
            target: String(document.getElementById("stTarget").value).trim(),
            source: String(document.getElementById("stSource").value).trim() || "en",
            type: document.getElementById("stType").value,
            scope: {
                kind: scope,
                value: String(document.getElementById("stScopeValue").value).trim()
            },
            limit: Math.min(Math.max(
                parseInt(document.getElementById("stLimit").value, 10) || DEFAULT_LIMIT, 10), MAX_LIMIT)
        };
    }

    /* Returns a message when the settings cannot be used, and nothing when they can. */
    function invalid(settings) {
        if (!LANGUAGE_RE.test(settings.target)) {
            return t("stale.badTarget");
        }
        if (!LANGUAGE_RE.test(settings.source)) {
            return t("stale.badSource");
        }
        if (settings.target === settings.source) {
            return t("stale.sameLanguage");
        }
        if (settings.scope.kind === "class" && !CLASS_RE.test(settings.scope.value)) {
            return t("stale.badClass");
        }
        if (settings.scope.kind === "datatype" && !DATATYPE_RE.test(settings.scope.value)) {
            return t("stale.badDatatype");
        }
        if (settings.scope.kind === "properties" && !PROPERTY_LIST_RE.test(settings.scope.value)) {
            return t("stale.badList");
        }
        return null;
    }

    function syncUrl() {
        var parts = ["target=" + encodeURIComponent(state.target),
            "source=" + encodeURIComponent(state.source),
            "type=" + state.type,
            "scope=" + state.scope.kind,
            "limit=" + state.limit];
        if (state.scope.value) {
            parts.push("value=" + encodeURIComponent(state.scope.value));
        }
        try {
            window.history.replaceState(null, "", "?" + parts.join("&"));
        } catch (e) {
            // A bookmarkable address is a convenience, not a requirement.
        }
    }

    function run() {
        var settings = readControls();
        var problem = invalid(settings);
        if (problem) {
            say(problem, "wdp-message wdp-blocking");
            return;
        }

        if (state.running) {
            state.running.stop();
        }

        state.target = settings.target;
        state.source = settings.source;
        state.type = settings.type;
        state.scope = settings.scope;
        state.limit = settings.limit;
        state.terms = {};
        state.results = {};
        state.order = [];
        state.skipped = 0;
        syncUrl();

        clear(document.getElementById("staleResults"));
        say(t("stale.findingProperties"));

        propertiesInScope().then(function (ids) {
            if (!ids.length) {
                say(t("stale.noProperties"), "wdp-message wdp-warning");
                return null;
            }
            say(t("stale.readingTerms", [ids.length]));
            return fetchTerms(ids).then(function (terms) {
                state.terms = terms;
                var checkable = ids.filter(function (id) {
                    return terms[id] && terms[id].target && terms[id].source;
                });
                state.skipped = ids.length - checkable.length;

                if (!checkable.length) {
                    say(t("stale.nothingTranslated", [state.target]), "wdp-message wdp-warning");
                    return null;
                }

                state.order = checkable;
                state.running = WDProp.stale.check(checkable, {
                    target: state.target,
                    source: state.source,
                    type: state.type,
                    onProgress: function (done, total) {
                        say(t("stale.checking", [done, total]));
                    }
                });
                return state.running;
            });
        }).then(function (results) {
            if (!results) {
                return;
            }
            state.results = results;
            state.running = null;
            render();
        }).catch(function (error) {
            state.running = null;
            say(error && error.message ? error.message : t("stale.failed"),
                "wdp-message wdp-blocking");
        });
    }

    /* ------------------------------------------------------------ start-up */

    function updateScopeVisibility() {
        var kind = document.getElementById("stScope").value;
        var control = document.getElementById("stScopeValueControl");
        control.style.display = (kind === "top") ? "none" : "";
    }

    function init() {
        var form = document.getElementById("staleControls");
        if (!form) {
            return;
        }

        var prefs = WDProp.cart.prefs();
        document.getElementById("stTarget").value = urlValue("target", prefs.lang || "");
        document.getElementById("stSource").value = urlValue("source", prefs.pivot || "en");
        document.getElementById("stType").value = urlValue("type", "description");
        document.getElementById("stScope").value = urlValue("scope", "top");
        document.getElementById("stScopeValue").value = urlValue("value", "");
        document.getElementById("stLimit").value = urlValue("limit", String(DEFAULT_LIMIT));

        document.getElementById("stScope").addEventListener("change", updateScopeVisibility);
        updateScopeVisibility();

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            run();
        });

        /* A shared address describes a check, so it runs without being asked. */
        if (/[?&]target=/.test(window.location.search)) {
            run();
        }
    }

    WDProp.ready(init);
})(window.WDProp);
