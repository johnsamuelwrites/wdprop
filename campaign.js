/*
 * WDProp - Translation campaigns
 *
 * A campaign is nothing but a link: a target language and a set of properties.
 * Everything shown is recomputed from Wikidata when the page is opened, so a
 * campaign shared with a group is never out of date and nothing has to be
 * stored anywhere.
 *
 *   campaign.html?target=ta&class=Q18616576
 *   campaign.html?target=ta&wikiproject=Wikidata:WikiProject Books
 *   campaign.html?target=ta&properties=P31,P17,P1476&name=Tamil sprint
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
    var API = "https://www.wikidata.org/w/api.php";

    /* Property namespace on Wikidata. */
    var PROPERTY_NAMESPACE = 120;

    /* Maximum entities per wbgetentities call. */
    var API_BATCH = 50;

    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
    var CLASS_RE = /^Q[0-9]+$/;
    var DATATYPE_RE = /^wikibase:[A-Za-z]+$/;
    var PROPERTY_LIST_RE = /^P[0-9]+(,P[0-9]+)*$/;

    var GOALS = [
        { type: "label", field: "hasLabel", title: "term.labels" },
        { type: "description", field: "hasDescription", title: "term.descriptions" },
        { type: "alias", field: "hasAlias", title: "term.aliases" }
    ];

    var state = {
        target: null,
        scope: null,
        name: null,
        rows: []
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
        return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : fallback;
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

    /* ----------------------------------------------------------------- scope */

    function readScope() {
        var value = urlValue("class", "");
        if (value) {
            return { kind: "class", value: value, label: "property class " + value };
        }
        value = urlValue("datatype", "");
        if (value) {
            return { kind: "datatype", value: value, label: "datatype " + value };
        }
        value = urlValue("properties", "");
        if (value) {
            return {
                kind: "properties",
                value: value,
                label: value.split(",").length + " chosen properties"
            };
        }
        value = urlValue("wikiproject", "");
        if (value) {
            return { kind: "wikiproject", value: value, label: value };
        }
        return null;
    }

    function scopeProblem(scope) {
        if (scope.kind === "class" && !CLASS_RE.test(scope.value)) {
            return t("translate.badClass");
        }
        if (scope.kind === "datatype" && !DATATYPE_RE.test(scope.value)) {
            return t("translate.badDatatype");
        }
        if (scope.kind === "properties" && !PROPERTY_LIST_RE.test(scope.value)) {
            return t("translate.badPropertyList");
        }
        return null;
    }

    /*
     * WikiProject pages are free-form: some list their properties as links,
     * many transclude them or keep them on a subpage. Where the links are not
     * there, the campaign says so rather than reporting an empty selection as
     * if it were finished work.
     */
    function resolveWikiProject(project) {
        var url = API + "?action=query&prop=links&pllimit=500" +
            "&plnamespace=" + PROPERTY_NAMESPACE +
            "&titles=" + encodeURIComponent(project) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            return r.json();
        }).then(function (json) {
            var pages = (json.query && json.query.pages) || {};
            var properties = [];
            Object.keys(pages).forEach(function (key) {
                if (pages[key].missing !== undefined) {
                    throw new Error(t("campaign.noSuchPage", [project]));
                }
                (pages[key].links || []).forEach(function (link) {
                    var id = link.title.replace("Property:", "");
                    if (/^P[0-9]+$/.test(id) && properties.indexOf(id) === -1) {
                        properties.push(id);
                    }
                });
            });
            return properties;
        });
    }

    /* --------------------------------------------------------------- progress */

    function byPropertyNumber(a, b) {
        return parseInt(a.property.slice(1), 10) - parseInt(b.property.slice(1), 10);
    }

    /*
     * For a class or a datatype, one query answers the whole campaign: EXISTS
     * is evaluated per property, so the result carries the totals and the
     * outstanding properties together.
     *
     * This shape is not used for an explicit list of properties. Naming them
     * in a VALUES clause is far slower than describing them — a hundred
     * properties took eight seconds against one and a half for a class of a
     * hundred and fifty — so those go to the MediaWiki API instead.
     */
    function progressQuery(target, scope) {
        var pattern = scope.kind === "class" ?
            "  { wd:" + scope.value + " wdt:P1963 ?property. }\n" +
            "  UNION\n" +
            "  { ?property rdf:type wikibase:Property; wdt:P31 wd:" + scope.value + ". }\n" :
            "  ?property rdf:type wikibase:Property;\n" +
            "            wikibase:propertyType " + scope.value + ".\n";

        return "PREFIX wikibase: <http://wikiba.se/ontology#>\n" +
            "SELECT DISTINCT ?property ?hasLabel ?hasDescription ?hasAlias WHERE {\n" +
            pattern +
            '  BIND(EXISTS { ?property rdfs:label ?l. FILTER(lang(?l) = "' + target + '") } AS ?hasLabel)\n' +
            '  BIND(EXISTS { ?property schema:description ?d. FILTER(lang(?d) = "' + target + '") } AS ?hasDescription)\n' +
            '  BIND(EXISTS { ?property skos:altLabel ?a. FILTER(lang(?a) = "' + target + '") } AS ?hasAlias)\n' +
            "}";
    }

    function loadProgressBySparql(scope, target) {
        return sparql(progressQuery(target, scope)).then(function (json) {
            return json.results.bindings.map(function (b) {
                return {
                    property: b.property.value.replace("http://www.wikidata.org/entity/", ""),
                    hasLabel: b.hasLabel.value === "true",
                    hasDescription: b.hasDescription.value === "true",
                    hasAlias: b.hasAlias.value === "true"
                };
            }).sort(byPropertyNumber);
        });
    }

    /* Fifty properties per call, which answers in about half a second. */
    function loadProgressByApi(ids, target) {
        var batches = [];
        for (var i = 0; i < ids.length; i += API_BATCH) {
            batches.push(ids.slice(i, i + API_BATCH));
        }

        return Promise.all(batches.map(function (batch) {
            var url = API + "?action=wbgetentities" +
                "&ids=" + encodeURIComponent(batch.join("|")) +
                "&props=" + encodeURIComponent("labels|descriptions|aliases") +
                "&languages=" + encodeURIComponent(target) +
                "&format=json&origin=*";
            return fetch(url).then(function (r) {
                return r.json();
            });
        })).then(function (results) {
            var rows = [];
            results.forEach(function (json) {
                var entities = json.entities || {};
                Object.keys(entities).forEach(function (id) {
                    var entity = entities[id];
                    if (entity.missing !== undefined) {
                        return;
                    }
                    var aliases = entity.aliases && entity.aliases[target];
                    rows.push({
                        property: id,
                        hasLabel: !!(entity.labels && entity.labels[target]),
                        hasDescription: !!(entity.descriptions && entity.descriptions[target]),
                        hasAlias: !!(aliases && aliases.length)
                    });
                });
            });
            return rows.sort(byPropertyNumber);
        });
    }

    function loadProgress(scope, target) {
        return scope.kind === "properties" ?
            loadProgressByApi(scope.value.split(","), target) :
            loadProgressBySparql(scope, target);
    }

    /* ----------------------------------------------------------------- render */

    /*
     * The link that hands this goal to the workbench. A class or a datatype
     * travels as itself; anything else travels as the properties still
     * outstanding, which is both shorter than the full selection and exactly
     * the work that is left.
     */
    function workbenchLink(goal, missing) {
        var link = "translate.html?target=" + encodeURIComponent(state.target) +
            "&type=" + goal.type;

        if (state.scope.kind === "class" || state.scope.kind === "datatype") {
            return link + "&" + state.scope.kind + "=" + encodeURIComponent(state.scope.value);
        }

        return link + "&properties=" + encodeURIComponent(missing.map(function (row) {
            return row.property;
        }).join(","));
    }

    function renderGoal(goal) {
        var total = state.rows.length;
        var done = state.rows.filter(function (row) {
            return row[goal.field];
        }).length;
        var remaining = total - done;
        var percent = total ? Math.round((done / total) * 100) : 0;

        var box = element("div", "cm-goal");

        var head = element("div", "cm-goal-head");
        head.appendChild(element("h3", null, t(goal.title)));
        head.appendChild(element("span", "cm-goal-count",
            t("campaign.goalDone", [done.toLocaleString(), total.toLocaleString(), percent])));
        box.appendChild(head);

        var track = element("div", "cm-bar");
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(percent));
        track.setAttribute("aria-label", t(goal.title) + ": " + t("a11y.progress", [percent]));
        var fill = element("div", "cm-bar-fill");
        fill.style.width = percent + "%";
        if (percent === 100) {
            fill.setAttribute("class", "cm-bar-fill cm-complete");
        }
        track.appendChild(fill);
        box.appendChild(track);

        if (!remaining) {
            box.appendChild(element("p", "wdp-message wdp-success",
                t("campaign.allDone", [t("term." + goal.type), state.target])));
            return box;
        }

        var missing = state.rows.filter(function (row) {
            return !row[goal.field];
        });

        var actions = element("p", "cm-actions");
        var work = element("a", "wdp-button wdp-primary",
            t("campaign.translateRemaining", [remaining.toLocaleString()]));
        work.setAttribute("href", workbenchLink(goal, missing));
        actions.appendChild(work);
        box.appendChild(actions);

        /* Which properties are outstanding, for anyone dividing up the work. */
        var details = element("details", "cm-remaining");
        var summary = element("summary", null, t("campaign.showRemaining", [missing.length.toLocaleString(), t("term." + goal.type)]));
        details.appendChild(summary);
        var list = element("div", "cm-property-list");
        missing.forEach(function (row) {
            var chip = element("div", "property");
            var link = element("a", null, row.property);
            link.setAttribute("href", "property.html?property=" + row.property);
            chip.appendChild(link);
            list.appendChild(chip);
        });
        details.appendChild(list);
        box.appendChild(details);

        return box;
    }

    function renderShare() {
        var box = document.getElementById("campaignShare");
        clear(box);

        var link = element("input", "wdp-input cm-share-input");
        link.setAttribute("type", "text");
        link.setAttribute("readonly", "readonly");
        link.value = window.location.href;
        box.appendChild(link);

        var copy = element("button", "wdp-button", t("campaign.copyLink"));
        copy.setAttribute("type", "button");
        copy.addEventListener("click", function () {
            WDProp.qs.copy(window.location.href).then(function () {
                copy.textContent = t("campaign.copied");
                setTimeout(function () {
                    copy.textContent = t("campaign.copyLink");
                }, 2000);
            }).catch(function () {
                link.select();
            });
        });
        box.appendChild(copy);

        var refresh = element("button", "wdp-button", t("campaign.refresh"));
        refresh.setAttribute("type", "button");
        refresh.addEventListener("click", run);
        box.appendChild(refresh);

        box.appendChild(element("p", "wdp-muted",
            t("campaign.shareHint")));
    }

    function renderCampaign() {
        var heading = document.getElementById("campaignHeading");
        clear(heading);
        heading.appendChild(element("h2", null,
            state.name || (state.target + " · " + state.scope.label)));
        heading.appendChild(element("p", "wdp-muted",
            t("campaign.propertyCount", [state.rows.length.toLocaleString(), state.target])));

        var goals = document.getElementById("campaignGoals");
        clear(goals);
        GOALS.forEach(function (goal) {
            goals.appendChild(renderGoal(goal));
        });

        renderShare();
    }

    function fail(message) {
        var box = document.getElementById("campaignGoals");
        clear(document.getElementById("campaignHeading"));
        clear(box);
        box.appendChild(element("p", "wdp-message wdp-blocking", message));
    }

    function run() {
        var box = document.getElementById("campaignGoals");
        clear(box);
        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' + t("campaign.measuring");
        box.appendChild(loading);

        var scope = state.scope;

        var resolved = scope.kind === "wikiproject" ?
            resolveWikiProject(scope.value).then(function (properties) {
                if (!properties.length) {
                    throw new Error(t("campaign.noWikiProjectLinks", [scope.value]));
                }
                state.resolvedProperties = properties;
                return { kind: "properties", value: properties.join(","), label: scope.label };
            }) :
            Promise.resolve(scope);

        resolved.then(function (effective) {
            return loadProgress(effective, state.target);
        }).then(function (rows) {
            if (!rows.length) {
                fail(t("campaign.emptyScope"));
                return;
            }
            state.rows = rows;
            renderCampaign();
        }).catch(function (e) {
            fail(e.message);
        });
    }

    function init() {
        if (!document.getElementById("campaignGoals")) {
            return;
        }

        state.target = urlValue("target", "");
        state.name = urlValue("name", "");
        state.scope = readScope();

        var form = document.getElementById("campaignForm");
        if (form) {
            document.getElementById("cmTarget").value = state.target || WDProp.cart.prefs().lang || "";
            if (state.scope && state.scope.kind !== "wikiproject") {
                document.getElementById("cmScope").value = state.scope.kind;
                document.getElementById("cmScopeValue").value = state.scope.value;
            } else if (state.scope) {
                document.getElementById("cmScope").value = "wikiproject";
                document.getElementById("cmScopeValue").value = state.scope.value;
            }

            form.addEventListener("submit", function (event) {
                event.preventDefault();
                var target = document.getElementById("cmTarget").value.trim();
                var kind = document.getElementById("cmScope").value;
                var value = document.getElementById("cmScopeValue").value.trim();
                window.location.search = "?target=" + encodeURIComponent(target) +
                    "&" + kind + "=" + encodeURIComponent(value);
            });
        }

        if (!state.target && !state.scope) {
            return;
        }
        if (!LANGUAGE_RE.test(state.target)) {
            fail(t("campaign.needLanguage"));
            return;
        }
        if (!state.scope) {
            fail(t("campaign.needScope"));
            return;
        }
        var problem = scopeProblem(state.scope);
        if (problem) {
            fail(problem);
            return;
        }

        run();
    }

    WDProp.campaign = {
        run: run,
        internals: {
            progressQuery: progressQuery,
            readScope: readScope,
            scopeProblem: scopeProblem,
            loadProgress: loadProgress
        }
    };

    WDProp.ready(init);
})(window.WDProp);
