/*
 * WDProp - Terminology consistency
 *
 * The workbench builds a glossary to suggest how a word has been translated
 * before. Turning that glossary around answers a different question: where has
 * one source word been translated several different ways?
 *
 * There is no word alignment between a source label and its translation, so
 * this works by association. For a source word — "identifier", say — it takes
 * every property whose source label contains it, and looks at which words
 * recur in those properties' target labels. Two or more strong candidates mean
 * the term is being translated inconsistently.
 *
 * Two rules keep the noise down, both of them learned from real data:
 *
 *   - a candidate is measured against the properties outside its group rather
 *     than against the language as a whole, since the whole contains the group
 *     and caps the ratio;
 *   - a target word belongs to whichever source word it is most associated
 *     with, and only that one. Otherwise words that merely travel together are
 *     reported as translations of each other.
 *
 * Function words are dropped by the shared tokeniser's stopword lists. Results
 * are leads worth checking, not errors.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

    /*
     * A candidate rendering must appear in at least this share of the group,
     * in at least this many properties, and be this many times more common in
     * the group than in the language overall.
     */
    var MIN_SHARE = 0.25;
    var MIN_COUNT = 2;
    var MIN_LIFT = 3;

    var state = {
        target: "",
        pivot: "en",
        minProperties: 3,
        pairs: null,
        findings: []
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
        var match = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
        return match ? decodeURIComponent(match[1]) : fallback;
    }

    /* The workbench's tokeniser, so both features split words the same way. */
    function tokenize(text, language) {
        return WDProp.translate.internals.tokenize(text, language);
    }

    function unique(values) {
        return values.filter(function (v, i, a) {
            return a.indexOf(v) === i;
        });
    }

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
                    throw new Error("the query service answered " + r.status + ".");
                }
                return r.json();
            });
    }

    /*
     * The same glossary the workbench loads, and the same cache key, so
     * whichever page is opened first pays for it and the other is instant.
     */
    function loadGlossary(target, pivot) {
        var key = ["wdprop-glossary", target, pivot].join(":");
        try {
            var cached = sessionStorage.getItem(key);
            if (cached) {
                return Promise.resolve(JSON.parse(cached));
            }
        } catch (e) {
            // Fall through to the query.
        }

        var query = "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT ?property ?src ?tgt WHERE {\n" +
            "  ?property rdf:type wikibase:Property; rdfs:label ?tgt.\n" +
            '  FILTER(lang(?tgt) = "' + target + '")\n' +
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
            return pairs;
        });
    }

    /*
     * Returns one entry per source word that has more than one rendering,
     * most-used words first. Exported for testing.
     */
    function analyse(pairs, options) {
        var pivot = options.pivot;
        var target = options.target;
        var minProperties = options.minProperties;

        /* How common each target word is across the whole language. */
        var corpus = {};
        pairs.forEach(function (pair) {
            unique(tokenize(pair.tgt, target)).forEach(function (word) {
                corpus[word] = (corpus[word] || 0) + 1;
            });
        });
        var total = pairs.length;

        /* Which properties each source word appears in. */
        var bySource = {};
        pairs.forEach(function (pair) {
            unique(tokenize(pair.src, pivot)).forEach(function (word) {
                (bySource[word] = bySource[word] || []).push(pair);
            });
        });

        var sources = Object.keys(bySource).filter(function (word) {
            return bySource[word].length >= minProperties;
        });

        /*
         * For every source word, how strongly each target word is associated
         * with it.
         *
         * Enrichment is measured against the properties *outside* the group,
         * not against the language as a whole. The whole includes the group,
         * which caps the ratio at total/group — so a word appearing in a third
         * of the data could never clear any meaningful threshold, however
         * lopsided its translations were.
         */
        var candidates = {};
        sources.forEach(function (word) {
            var group = bySource[word];
            var counts = {};
            group.forEach(function (pair) {
                unique(tokenize(pair.tgt, target)).forEach(function (targetWord) {
                    counts[targetWord] = (counts[targetWord] || 0) + 1;
                });
            });

            var outsideTotal = total - group.length;
            candidates[word] = Object.keys(counts).map(function (targetWord) {
                var share = counts[targetWord] / group.length;
                var outside = (corpus[targetWord] || 0) - counts[targetWord];
                var outsideShare = outsideTotal > 0 ? outside / outsideTotal : 0;
                return {
                    word: targetWord,
                    count: counts[targetWord],
                    share: share,
                    lift: outsideShare > 0 ? share / outsideShare : Infinity
                };
            }).filter(function (r) {
                return r.count >= MIN_COUNT && r.share >= MIN_SHARE && r.lift >= MIN_LIFT;
            });
        });

        /*
         * A target word belongs to whichever source word it is most associated
         * with, and only to that one. Without this, words that merely travel
         * together are reported as translations of each other: most properties
         * whose label contains "id" are film identifiers, so "film" looks like
         * a rendering of "id" — when it is plainly the rendering of "film".
         */
        var owner = {};
        sources.forEach(function (word) {
            candidates[word].forEach(function (r) {
                var held = owner[r.word];
                if (!held || r.lift > held.lift ||
                    (r.lift === held.lift && r.share > held.share)) {
                    owner[r.word] = { source: word, lift: r.lift, share: r.share };
                }
            });
        });

        var findings = [];
        sources.forEach(function (word) {
            var renderings = candidates[word].filter(function (r) {
                return owner[r.word].source === word;
            }).sort(function (a, b) {
                return b.count - a.count;
            });

            if (renderings.length >= 2) {
                findings.push({
                    source: word,
                    properties: bySource[word].length,
                    group: bySource[word],
                    renderings: renderings
                });
            }
        });

        return findings.sort(function (a, b) {
            return b.properties - a.properties;
        });
    }

    /* The properties whose target label contains a given rendering. */
    function propertiesUsing(finding, rendering, target) {
        return finding.group.filter(function (pair) {
            return tokenize(pair.tgt, target).indexOf(rendering.word) !== -1;
        });
    }

    /* --------------------------------------------------------------- render */

    function renderFinding(finding) {
        var box = element("div", "tm-finding");

        var head = element("div", "tm-finding-head");
        var term = element("h3", "tm-source");
        term.setAttribute("lang", state.pivot);
        term.appendChild(document.createTextNode(finding.source));
        head.appendChild(term);
        head.appendChild(element("span", "wdp-muted",
            t("terminology.inProperties", [finding.properties])));
        box.appendChild(head);

        var chips = element("div", "tm-renderings");
        finding.renderings.forEach(function (rendering) {
            var chip = element("span", "tm-rendering");
            chip.setAttribute("lang", state.target);
            chip.appendChild(element("span", "tm-rendering-word", rendering.word));
            chip.appendChild(element("span", "tm-rendering-count",
                " " + rendering.count + " (" + Math.round(rendering.share * 100) + "%)"));
            chips.appendChild(chip);
        });
        box.appendChild(chips);

        var details = element("details", "tm-details");
        details.appendChild(element("summary", null, t("terminology.showProperties")));

        finding.renderings.forEach(function (rendering) {
            var used = propertiesUsing(finding, rendering, state.target);
            if (!used.length) {
                return;
            }
            var group = element("div", "tm-group");
            var label = element("h4", "tm-group-title");
            label.setAttribute("lang", state.target);
            label.appendChild(document.createTextNode(rendering.word));
            group.appendChild(label);

            var list = element("ul", "tm-property-list");
            used.slice(0, 20).forEach(function (pair) {
                var item = element("li");
                var link = element("a", null, pair.property);
                link.setAttribute("href", "property.html?property=" + pair.property);
                item.appendChild(link);
                item.appendChild(document.createTextNode(" "));
                var src = element("span", "wdp-muted", pair.src);
                src.setAttribute("lang", state.pivot);
                item.appendChild(src);
                item.appendChild(document.createTextNode(" → "));
                var tgt = element("strong", null, pair.tgt);
                tgt.setAttribute("lang", state.target);
                item.appendChild(tgt);
                list.appendChild(item);
            });
            group.appendChild(list);
            if (used.length > 20) {
                group.appendChild(element("p", "wdp-muted", t("terminology.andMore", [used.length - 20])));
            }
            details.appendChild(group);
        });

        box.appendChild(details);
        return box;
    }

    function render() {
        var summary = document.getElementById("terminologySummary");
        var results = document.getElementById("terminologyResults");
        clear(summary);
        clear(results);

        if (!state.pairs) {
            return;
        }

        summary.appendChild(element("h3", null,
            state.findings.length ?
                t("terminology.foundCount", [state.findings.length, state.target]) :
                t("terminology.foundNone", [state.target])));
        summary.appendChild(element("p", "wdp-muted",
            t("terminology.basedOn", [state.pairs.length.toLocaleString(), state.target, state.pivot])));

        if (!state.findings.length) {
            return;
        }

        state.findings.forEach(function (finding) {
            results.appendChild(renderFinding(finding));
        });
    }

    function run() {
        var results = document.getElementById("terminologyResults");
        clear(document.getElementById("terminologySummary"));
        clear(results);

        var problems = [];
        if (!LANGUAGE_RE.test(state.target)) {
            problems.push(t("translate.badLanguage", [state.target]));
        }
        if (!LANGUAGE_RE.test(state.pivot)) {
            problems.push(t("translate.badLanguage", [state.pivot]));
        }
        if (problems.length) {
            problems.forEach(function (message) {
                results.appendChild(element("p", "wdp-message wdp-blocking", message));
            });
            return;
        }

        var loading = element("div", "wdprop-loading");
        loading.setAttribute("role", "status");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' + t("terminology.loading", [state.target]);
        results.appendChild(loading);

        window.history.replaceState(null, "", "terminology.html?target=" +
            encodeURIComponent(state.target) + "&pivot=" + encodeURIComponent(state.pivot));

        loadGlossary(state.target, state.pivot).then(function (pairs) {
            state.pairs = pairs;
            if (!pairs.length) {
                clear(results);
                results.appendChild(element("p", "wdp-message wdp-warning",
                    t("terminology.noGlossary", [state.target, state.pivot])));
                return;
            }
            state.findings = analyse(pairs, {
                pivot: state.pivot,
                target: state.target,
                minProperties: state.minProperties
            });
            render();
        }).catch(function (e) {
            clear(results);
            results.appendChild(element("p", "wdp-message wdp-blocking",
                t("terminology.failed", [e.message])));
        });
    }

    function init() {
        var form = document.getElementById("terminologyControls");
        if (!form) {
            return;
        }

        var prefs = WDProp.cart.prefs();
        state.target = urlValue("target", prefs.lang || "");
        state.pivot = urlValue("pivot", prefs.pivot || "en");

        document.getElementById("tmTarget").value = state.target;
        document.getElementById("tmPivot").value = state.pivot;
        document.getElementById("tmMin").value = String(state.minProperties);

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            state.target = document.getElementById("tmTarget").value.trim();
            state.pivot = document.getElementById("tmPivot").value.trim();
            state.minProperties = Math.max(2, parseInt(document.getElementById("tmMin").value, 10) || 3);
            run();
        });

        if (state.target) {
            run();
        }
    }

    WDProp.terminology = { run: run, internals: { analyse: analyse, propertiesUsing: propertiesUsing } };

    WDProp.ready(init);
})(window.WDProp);
