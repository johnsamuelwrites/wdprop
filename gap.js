/*
 * WDProp - Translation Gap Radar
 *
 * A deliberately bounded live page: two SPARQL requests build the coverage
 * figure and the worklist, and the shared property table fetches terms for
 * the visible rows in one entity API request.
 */

(function () {
    "use strict";

    var TERMS = {
        label: "rdfs:label",
        description: "schema:description",
        alias: "skos:altLabel"
    };

    function t(key, params) {
        return (window.WDProp && window.WDProp.i18n)
            ? window.WDProp.i18n.t(key, params) : key;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function param(search, name, fallback) {
        var value = new URLSearchParams(search || window.location.search).get(name);
        return value === null ? fallback : value;
    }

    function cleanLanguage(value) {
        return String(value || "").trim().toLowerCase();
    }

    function validLanguage(value) {
        return /^[a-z][a-z0-9-]{0,14}$/.test(value);
    }

    function validDatatype(value) {
        return /^wikibase:[A-Za-z][A-Za-z0-9]*$/.test(value);
    }

    function validClass(value) {
        return /^Q[1-9][0-9]*$/.test(value);
    }

    function termProperty(term) {
        return TERMS[term] || TERMS.label;
    }

    function scopeWhere(options) {
        if (options.scope === "datatype") {
            return "?property a wikibase:Property;\n" +
                "          wikibase:propertyType " + options.value + ".";
        }
        if (options.scope === "class") {
            return "{ wd:" + options.value + " wdt:P1963 ?property. }\n" +
                "UNION\n" +
                "{ ?property a wikibase:Property;\n" +
                "            (wdt:P31|wdt:P279) wd:" + options.value + ". }";
        }
        return "?property a wikibase:Property.";
    }

    function coverageQuery(options) {
        var where = scopeWhere(options);
        var prop = termProperty(options.term);
        return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT ?total ?translated ?missing WHERE {\n" +
            "  { SELECT (COUNT(DISTINCT ?property) AS ?total) WHERE {\n" +
            "      " + where + "\n" +
            "    }\n" +
            "  }\n" +
            "  { SELECT (COUNT(DISTINCT ?property) AS ?translated) WHERE {\n" +
            "      " + where + "\n" +
            "      ?property " + prop + " ?term.\n" +
            "      FILTER(lang(?term) = \"" + options.language + "\")\n" +
            "    }\n" +
            "  }\n" +
            "  BIND((?total - ?translated) AS ?missing)\n" +
            "}";
    }

    function worklistQuery(options) {
        var where = scopeWhere(options);
        var prop = termProperty(options.term);
        return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT DISTINCT ?property WHERE {\n" +
            "  " + where + "\n" +
            "  FILTER NOT EXISTS {\n" +
            "    ?property " + prop + " ?term.\n" +
            "    FILTER(lang(?term) = \"" + options.language + "\")\n" +
            "  }\n" +
            "}\n" +
            "ORDER BY ?property\n" +
            "LIMIT " + options.limit;
    }

    function readOptions() {
        return {
            language: cleanLanguage(byId("gapLanguage").value),
            term: byId("gapTerm").value,
            scope: byId("gapScope").value,
            value: String(byId("gapScopeValue").value || "").trim(),
            limit: Math.min(100, Math.max(1, parseInt(byId("gapLimit").value, 10) || 50))
        };
    }

    function validate(options) {
        if (!validLanguage(options.language)) {
            return t("gap.badLanguage", [options.language || ""]);
        }
        if (options.scope === "datatype" && !validDatatype(options.value)) {
            return t("gap.badDatatype");
        }
        if (options.scope === "class" && !validClass(options.value)) {
            return t("gap.badClass");
        }
        return "";
    }

    function setScopeHint() {
        var scope = byId("gapScope").value;
        var input = byId("gapScopeValue");
        var wrap = byId("gapScopeValueWrap");
        if (!input || !wrap) {
            return;
        }
        wrap.style.display = scope === "all" ? "none" : "";
        input.disabled = scope === "all";
        input.placeholder = scope === "class" ? "Q18616576" : "wikibase:ExternalId";
    }

    function updateUrl(options) {
        var params = new URLSearchParams();
        params.set("language", options.language);
        params.set("term", options.term);
        params.set("scope", options.scope);
        if (options.scope !== "all") {
            params.set("value", options.value);
        }
        params.set("limit", String(options.limit));
        history.replaceState(null, "", window.location.pathname + "?" + params.toString());
    }

    function configureWorkbench(options) {
        var link = byId("gapWorkbench");
        if (!link) {
            return;
        }
        var params = new URLSearchParams();
        params.set("target", options.language);
        params.set("type", options.term);
        if (options.scope === "datatype") {
            params.set("scope", "datatype");
            params.set("datatype", options.value);
        } else if (options.scope === "class") {
            params.set("scope", "class");
            params.set("class", options.value);
        } else {
            params.set("scope", "all");
        }
        link.href = "./translate.html?" + params.toString();
    }

    function createCoverage(divId, json) {
        var container = byId(divId);
        var binding = json.results.bindings[0];
        var total = parseInt(binding.total.value, 10);
        var translated = parseInt(binding.translated.value, 10);
        var missing = parseInt(binding.missing.value, 10);
        var percent = total > 0 ? Math.round((translated / total) * 1000) / 10 : 0;

        var box = document.createElement("div");
        box.setAttribute("class", "gap-meter");

        var number = document.createElement("div");
        number.setAttribute("class", "gap-meter-number");
        number.appendChild(document.createTextNode(percent.toLocaleString() + "%"));
        box.appendChild(number);

        var bar = document.createElement("div");
        bar.setAttribute("class", "gap-meter-bar");
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", t("gap.coverageAria", [percent]));
        var fill = document.createElement("span");
        fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
        bar.appendChild(fill);
        box.appendChild(bar);

        var detail = document.createElement("p");
        detail.appendChild(document.createTextNode(
            t("gap.coverageDetail", [
                translated.toLocaleString(),
                total.toLocaleString(),
                missing.toLocaleString()
            ])));
        box.appendChild(detail);

        container.appendChild(box);
    }

    function createGapResults(divId, json) {
        var records = createDivPropertyTable(divId, json);
        var heading = byId(divId).wdpropTotalHeading;
        if (heading) {
            heading.appendChild(document.createTextNode(" " +
                t("gap.limitedTo", [records.length.toLocaleString()])));
        }
    }

    function showValidation(message) {
        wdpropShowError(byId("gapResults"), message, null);
        wdpropClear(byId("gapCoverage"));
    }

    function run() {
        var options = readOptions();
        var problem = validate(options);
        setScopeHint();
        if (problem) {
            showValidation(problem);
            return;
        }

        updateUrl(options);
        configureWorkbench(options);
        queryWikidata(coverageQuery(options), createCoverage, "gapCoverage");
        queryWikidata(worklistQuery(options), createGapResults, "gapResults");
    }

    function populateFromUrl() {
        var language = cleanLanguage(param(null, "language",
            (window.WDProp && window.WDProp.i18n) ? window.WDProp.i18n.current() : "en"));
        byId("gapLanguage").value = language || "en";
        byId("gapTerm").value = param(null, "term", "label");
        byId("gapScope").value = param(null, "scope", "all");
        byId("gapScopeValue").value = param(null, "value", "");
        byId("gapLimit").value = param(null, "limit", "50");
        setScopeHint();
    }

    function init() {
        var form = byId("gapForm");
        if (!form) {
            return;
        }
        populateFromUrl();
        byId("gapScope").addEventListener("change", setScopeHint);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            run();
        });
        run();
    }

    window.initGapRadar = init;
    window.WDProp = window.WDProp || {};
    window.WDProp.gap = {
        coverageQuery: coverageQuery,
        worklistQuery: worklistQuery,
        scopeWhere: scopeWhere,
        validate: validate
    };
})();
