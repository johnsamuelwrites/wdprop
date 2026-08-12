/*
 * WDProp - Language Atlas
 *
 * One live SPARQL request reads the supported language codes, English labels,
 * writing systems and direct classification statements Wikidata knows. The
 * grouping and filtering are client-side over that one response.
 */

(function () {
    "use strict";

    var UNKNOWN = "__unknown__";
    var rows = [];

    var ATLAS_QUERY = `SELECT ?code ?languageLabel
       (GROUP_CONCAT(DISTINCT ?scriptLabel; separator=", ") AS ?scripts)
       (GROUP_CONCAT(DISTINCT ?familyLabel; separator=", ") AS ?families)
WHERE {
  ?languageWiki wdt:P31 wd:Q10876391;
                wdt:P407 ?language.
  ?language wdt:P424 ?code;
            rdfs:label ?languageLabel.
  FILTER(lang(?languageLabel) = "en")
  OPTIONAL {
    ?language wdt:P282 ?script.
    ?script rdfs:label ?scriptLabel.
    FILTER(lang(?scriptLabel) = "en")
  }
  OPTIONAL {
    ?language wdt:P279 ?family.
    ?family rdfs:label ?familyLabel.
    FILTER(lang(?familyLabel) = "en")
  }
}
GROUP BY ?code ?languageLabel
ORDER BY ?code`;

    function t(key, params) {
        return (window.WDProp && window.WDProp.i18n)
            ? window.WDProp.i18n.t(key, params) : key;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function clear(node) {
        while (node && node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function text(tag, className, value) {
        var node = document.createElement(tag);
        if (className) {
            node.setAttribute("class", className);
        }
        node.appendChild(document.createTextNode(value));
        return node;
    }

    function value(binding, name) {
        return binding[name] ? binding[name].value : "";
    }

    function parts(value) {
        return String(value || "").split(/\s*,\s*/).filter(Boolean);
    }

    function shown(value) {
        return value || t("atlas.unknown");
    }

    function keyFor(value) {
        return value || UNKNOWN;
    }

    function groupCounts(records, field) {
        var counts = {};
        records.forEach(function (record) {
            var values = parts(record[field]);
            if (!values.length) {
                values = [""];
            }
            values.forEach(function (entry) {
                var key = keyFor(entry);
                counts[key] = (counts[key] || 0) + 1;
            });
        });
        return Object.keys(counts).map(function (key) {
            return {
                label: key === UNKNOWN ? "" : key,
                count: counts[key]
            };
        }).sort(function (a, b) {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return shown(a.label).localeCompare(shown(b.label));
        });
    }

    function renderGroups(container, groups) {
        clear(container);
        groups.slice(0, 18).forEach(function (group) {
            var chip = document.createElement("button");
            chip.setAttribute("type", "button");
            chip.setAttribute("class", "atlas-chip");
            chip.appendChild(document.createTextNode(
                t("atlas.groupCount", [shown(group.label), group.count.toLocaleString()])));
            chip.addEventListener("click", function () {
                var input = byId("atlasFilter");
                input.value = shown(group.label);
                filter(input.value);
            });
            container.appendChild(chip);
        });
    }

    function renderTable(records) {
        var container = byId("atlasLanguages");
        clear(container);

        var table = document.createElement("table");
        table.setAttribute("class", "alternate atlas-table");

        var head = document.createElement("tr");
        ["atlas.code", "atlas.language", "atlas.script", "atlas.family"].forEach(function (key) {
            var cell = document.createElement("th");
            cell.appendChild(document.createTextNode(t(key)));
            head.appendChild(cell);
        });
        table.appendChild(head);

        records.forEach(function (record) {
            var row = document.createElement("tr");
            row.wdpropAtlasText = [
                record.code, record.language, record.scripts, record.families
            ].join(" ").toLowerCase();

            var code = document.createElement("td");
            var link = document.createElement("a");
            link.setAttribute("href", "./language.html?language=" + encodeURIComponent(record.code));
            link.appendChild(document.createTextNode(record.code));
            code.appendChild(link);
            row.appendChild(code);

            row.appendChild(text("td", null, record.language));
            row.appendChild(text("td", record.scripts ? null : "missingvalue", shown(record.scripts)));
            row.appendChild(text("td", record.families ? null : "missingvalue", shown(record.families)));
            table.appendChild(row);
        });

        container.appendChild(table);
        if (window.WDProp && window.WDProp.download) {
            window.WDProp.download.offerTable(table, "wdprop-language-atlas");
        }
        wdpropPaginate(container);
    }

    function setCount(visible) {
        var count = byId("atlasCount");
        if (count) {
            count.textContent = t("atlas.showing", [visible.toLocaleString(), rows.length.toLocaleString()]);
        }
    }

    function filter(query) {
        var q = String(query || "").trim().toLowerCase();
        var table = byId("atlasLanguages").querySelector("table");
        if (!table) {
            return;
        }
        var all = wdpropTableRows(table).filter(function (row) {
            return !wdpropIsHeaderRow(row);
        });
        var subset = all.filter(function (row) {
            return !q || row.wdpropAtlasText.indexOf(q) !== -1;
        });
        wdpropPaginateTable(table, subset);
        setCount(subset.length);
    }

    function createAtlas(divId, json) {
        rows = json.results.bindings.map(function (binding) {
            return {
                code: value(binding, "code"),
                language: value(binding, "languageLabel"),
                scripts: value(binding, "scripts"),
                families: value(binding, "families")
            };
        });

        renderGroups(byId("atlasScripts"), groupCounts(rows, "scripts"));
        renderGroups(byId("atlasFamilies"), groupCounts(rows, "families"));
        renderTable(rows);
        setCount(rows.length);
    }

    function init() {
        var input = byId("atlasFilter");
        if (input) {
            input.addEventListener("input", function () {
                filter(input.value);
            });
        }
        queryWikidata(ATLAS_QUERY, createAtlas, "atlasLanguages");
    }

    window.initLanguageAtlas = init;
    window.WDProp = window.WDProp || {};
    window.WDProp.atlas = {
        query: ATLAS_QUERY,
        groupCounts: groupCounts,
        parts: parts
    };
})();
