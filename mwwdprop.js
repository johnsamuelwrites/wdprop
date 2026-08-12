/*
 * Interface text, from i18n.js. Falls back to the key if the message
 * files somehow did not load, which keeps the page working.
 */
function wdpropText(key, params) {
    return (window.WDProp && window.WDProp.i18n) ? window.WDProp.i18n.t(key, params) : key;
}

const endpointUrl = 'https://www.wikidata.org/w/api.php';

function showMediaWikiQuery(fullurl, divId) {
    let queryLink = document.getElementById(divId + "Query");
    if (queryLink != null) {
        // Clear previous query link before adding the new one
        while (queryLink.firstChild) {
            queryLink.removeChild(queryLink.firstChild);
        }
        let a = document.createElement("a");
        a.setAttribute('href', fullurl);
        let text = document.createTextNode(wdpropText("js.runApiQuery"));
        a.appendChild(text);
        queryLink.appendChild(a);
    }
}

/*
 * The loading, empty and failure states are the ones wdprop.js defines, so
 * that a MediaWiki section behaves the same as a Wikidata one. Every page
 * that loads this file loads that one as well.
 */
function queryMediaWiki(queryparams, func, divId, url) {
    var div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);

    fullUrl = endpointUrl + '?action=' + queryparams + "&format=json";
    showMediaWikiQuery(fullUrl, divId);

    fetch(fullUrl, {}).then(wdpropReadJson).then(json => {
        wdpropClear(div);
        /*
         * The MediaWiki API answers a request it could not carry out with a
         * 200 and an error in the body, so the status alone does not say
         * whether this worked.
         */
        if (json && json.error) {
            throw new Error(json.error.code || "api");
        }
        func(divId, json, url);
        wdpropPaginate(div);
    }).catch(error => {
        wdpropShowError(div, wdpropReason(error), function () {
            queryMediaWiki(queryparams, func, divId, url);
        });
    });
}

/*
 * ===========================================================================
 * The WikiProjects listing
 * ===========================================================================
 *
 * This page used to ask the query service, which federated the question
 * straight back to the MediaWiki search API through SERVICE wikibase:mwapi.
 * Going round by SPARQL cost thirty-five seconds for four thousand project
 * names; asked of the search API directly the same first results arrive in a
 * little over one.
 *
 * The search is by title — intitle:WikiProject within the Project namespace —
 * rather than the free-text search the old query used and then filtered by
 * hand, so a page that merely mentions a WikiProject is never fetched only to
 * be discarded.
 *
 * Its pages are reached by offset rather than by a continuation token, which
 * means they do not depend on one another and can be asked for at once. Nine
 * requests in parallel bring back four and a half thousand projects in about
 * a second and a half.
 */

var wikiProjectsPerRequest = 500;
var wikiProjectsRequests = 9;

function wikiProjectsSearchUrl(offset) {
    return endpointUrl + "?action=query&list=search" +
        "&srsearch=" + encodeURIComponent("intitle:WikiProject") +
        "&srnamespace=4&srlimit=" + wikiProjectsPerRequest +
        "&sroffset=" + offset +
        "&srprop=&format=json&origin=*";
}

/*
 * Every project title the search knows of, in search order and without
 * repeats. A request that fails contributes nothing rather than failing the
 * whole listing: one missing page of a long list is worth far less than the
 * list.
 */
function fetchWikiProjects() {
    var offsets = [];
    for (var i = 0; i < wikiProjectsRequests; i++) {
        offsets.push(i * wikiProjectsPerRequest);
    }

    return Promise.all(offsets.map(function (offset) {
        return fetch(wikiProjectsSearchUrl(offset)).then(wdpropReadJson)
            .then(function (json) {
                if (json && json.error) {
                    throw new Error(json.error.code || "api");
                }
                return (json.query && json.query.search) || [];
            }).catch(function () {
                return [];
            });
    })).then(function (parts) {
        var seen = {};
        var titles = [];
        for (var i = 0; i < parts.length; i++) {
            for (var j = 0; j < parts[i].length; j++) {
                var title = parts[i][j].title;
                /*
                 * A project's title continues past the prefix, with a space
                 * before its name or a slash before a subpage. Testing the
                 * prefix alone would keep "Wikidata:WikiProjects", the index
                 * page listing them, and the bare "Wikidata:WikiProject" —
                 * neither of which is a project.
                 */
                if (!/^Wikidata:WikiProject[ /]/.test(title)) {
                    continue;
                }
                if (!seen[title]) {
                    seen[title] = true;
                    titles.push(title);
                }
            }
        }
        return titles;
    });
}

/*
 * ===========================================================================
 * Searching for a property
 * ===========================================================================
 *
 * search.html asked the query service three questions at once and joined them
 * with UNION: properties whose label contains the term, properties named by
 * P1963 on an item whose label contains it, and properties whose P31 class is
 * labelled with it. The last two matched a label in every language Wikidata
 * has and threw all but English away afterwards, which is the whole cost:
 * measured against the live service, ?search=software took 58 seconds, of
 * which the first branch was 5; the third, asked on its own, was refused
 * after 8.
 *
 * A triple store has no text index, so every one of those contains() is a
 * scan. The search index is a text index, and answers the same question in a
 * third of a second. This is the move the WikiProjects listing above already
 * made, for the same reason, and the comment there records the same figures.
 *
 * What comes back is not the same set, and is better rather than only faster.
 * A property page carries its labels, aliases and descriptions in every
 * language, so the index finds a property described as being about software
 * without being called software, which is what the two expensive branches
 * were reaching for by way of P1963 and P31. The order is by relevance
 * instead of alphabetical, so the property being looked for is near the top
 * rather than wherever the alphabet puts it.
 */

/*
 * 50 is the most the API will return in one request to an ordinary client, so
 * two pages are asked for at once rather than one after the other. Beyond the
 * first hundred the relevance is thin and nobody is reading.
 */
var propertySearchPerRequest = 50;
var propertySearchRequests = 2;

/* Namespace 120 is Property: on Wikidata. */
function propertySearchUrl(term, offset) {
    return endpointUrl + "?action=query&list=search" +
        "&srsearch=" + encodeURIComponent(term) +
        "&srnamespace=120&srlimit=" + propertySearchPerRequest +
        "&sroffset=" + offset +
        "&srprop=&format=json&origin=*";
}

function propertyLabelsUrl(ids, language) {
    return endpointUrl + "?action=wbgetentities" +
        "&ids=" + encodeURIComponent(ids.join("|")) +
        "&props=labels" +
        "&languages=" + encodeURIComponent(language + "|en") +
        "&format=json&origin=*";
}

/*
 * The property identifiers the search knows of, in relevance order and
 * without repeats.
 *
 * A page that fails contributes nothing rather than failing the search: the
 * second fifty are worth less than the first. All of them failing is a failed
 * search, though, and says so — an empty list would otherwise be shown as
 * "nothing found", which is a different statement and an untrue one.
 */
function fetchPropertySearch(term) {
    var offsets = [];
    for (var i = 0; i < propertySearchRequests; i++) {
        offsets.push(i * propertySearchPerRequest);
    }

    var failures = 0;

    return Promise.all(offsets.map(function (offset) {
        return fetch(propertySearchUrl(term, offset)).then(wdpropReadJson)
            .then(function (json) {
                if (json && json.error) {
                    throw new Error(json.error.code || "api");
                }
                return (json.query && json.query.search) || [];
            }).catch(function () {
                failures++;
                return [];
            });
    })).then(function (parts) {
        if (failures === offsets.length) {
            throw new Error("search");
        }

        var seen = {};
        var ids = [];
        for (var i = 0; i < parts.length; i++) {
            for (var j = 0; j < parts[i].length; j++) {
                var id = String(parts[i][j].title || "").replace(/^Property:/, "");
                /* A search can reach a subpage or a redirect; neither is a
                   property, and property.html would have nothing to show. */
                if (!/^P\d+$/.test(id) || seen[id]) {
                    continue;
                }
                seen[id] = true;
                ids.push(id);
            }
        }
        return ids;
    });
}

/*
 * What each of them is called. The search answers with identifiers, and P1547
 * on its own tells a reader nothing.
 *
 * English is asked for alongside the language wanted, and both are handed on:
 * a property with no label in the language being read is still named, and the
 * row says that is what happened rather than passing the English one off as a
 * translation. That is the same three states every other listing shows, and
 * on a tool about which languages Wikidata has reached, the difference is the
 * point rather than a detail.
 *
 * Fifty identifiers to a request, which is the API's limit, so a full search
 * costs two of these however many rows it draws.
 */
function fetchPropertyLabels(ids, language) {
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) {
        chunks.push(ids.slice(i, i + 50));
    }

    return Promise.all(chunks.map(function (chunk) {
        return fetch(propertyLabelsUrl(chunk, language)).then(wdpropReadJson)
            .then(function (json) {
                return (json && json.entities) || {};
            }).catch(function () {
                return {};
            });
    })).then(function (parts) {
        var labels = {};
        for (var i = 0; i < parts.length; i++) {
            for (var id in parts[i]) {
                labels[id] = parts[i][id].labels || {};
            }
        }
        return labels;
    });
}

/*
 * The whole search: the index for what matches, then the names for what it
 * found. Four requests at the most, whatever the term, and they overlap.
 */
function searchProperties(term, language, divId) {
    var div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);
    showMediaWikiQuery(propertySearchUrl(term, 0), divId);

    fetchPropertySearch(term).then(function (ids) {
        if (!ids.length) {
            wdpropClear(div);
            wdpropShowEmpty(div);
            return;
        }
        return fetchPropertyLabels(ids, language).then(function (labels) {
            wdpropClear(div);
            createDivSearchProperties(divId, ids.map(function (id) {
                return { property: id, labels: labels[id] || {} };
            }), language);
            wdpropPaginate(div);
        });
    }).catch(function (error) {
        wdpropShowError(div, wdpropReason(error), function () {
            searchProperties(term, language, divId);
        });
    });
}

/*
 * ===========================================================================
 * Searching for a WikiProject
 * ===========================================================================
 *
 * The same fault, on the other tab of the same page: a SPARQL query that
 * federated to the search API for every page whose text mentions
 * "Wikidata:WikiProject", brought them all back, and then filtered them by
 * title with contains(). 27 seconds for "heritage".
 *
 * Asked of the index as a title search it is one request and four tenths of a
 * second, and it is a better question: a project is found by its name rather
 * than by a page somewhere happening to mention both words.
 */
function wikiProjectSearchUrl(term) {
    return endpointUrl + "?action=query&list=search" +
        "&srsearch=" + encodeURIComponent("intitle:WikiProject intitle:" + term) +
        "&srnamespace=4&srlimit=" + wikiProjectsPerRequest +
        "&srprop=&format=json&origin=*";
}

function searchWikiProjects(term, divId) {
    var div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);
    showMediaWikiQuery(wikiProjectSearchUrl(term), divId);

    fetch(wikiProjectSearchUrl(term)).then(wdpropReadJson).then(function (json) {
        if (json && json.error) {
            throw new Error(json.error.code || "api");
        }

        var titles = ((json.query && json.query.search) || []).map(function (hit) {
            return hit.title;
        }).filter(function (title) {
            /* As the listing does: the prefix alone would keep the index page
               that lists the projects, and the bare "Wikidata:WikiProject". */
            return /^Wikidata:WikiProject[ /]/.test(title);
        });

        wdpropClear(div);
        if (!titles.length) {
            wdpropShowEmpty(div);
            return;
        }
        createDivWikiProjects(divId, titles);
        wdpropPaginate(div);
    }).catch(function (error) {
        wdpropShowError(div, wdpropReason(error), function () {
            searchWikiProjects(term, divId);
        });
    });
}

/*
 * ===========================================================================
 * The property-discussion templates
 * ===========================================================================
 *
 * Support, Oppose, Neutral and Comment are the four templates a property
 * proposal is voted with, and each carries its own set of translations. The
 * page used to show them as four separate walls of language codes with a count
 * over each, which said how many languages had a template but never which
 * languages, nor — the question actually worth asking — which languages have
 * some of the four and not the rest.
 *
 * That is where the work is: 65 languages appear across the four, 38 have all
 * of them, and 27 are missing at least one, so a property discussion in those
 * 27 falls back to English partway through. Four lists cannot show that; one
 * row per language can.
 *
 * Deliberately named apart from the same-named helper in wdprop.js, which
 * renders language chips: property.html loads both files, and whichever was
 * defined last used to win.
 */

var DISCUSSION_TEMPLATES = ["Support", "Oppose", "Neutral", "Comment"];

/*
 * The languages one template has been translated into, read out of its wiki
 * parse tree. The translations live in a switch on {{{lang}}}, so each case
 * name is a language code — apart from the three that are not.
 */
function createDivTemplateLanguages(json) {
    var tree = json && json.parse && json.parse.parsetree &&
        json.parse.parsetree["*"];
    if (!tree) {
        return [];
    }

    var found = [];
    var pattern = /<name>(.+?)<\/name>/g;
    var match;
    while ((match = pattern.exec(tree)) !== null) {
        var name = match[1].replace(/\s/g, "");
        if (name === "lang" || name === "#default" || name === "templatedata") {
            continue;
        }
        if (found.indexOf(name) === -1) {
            found.push(name);
        }
    }
    return found;
}

function templateParseUrl(template) {
    return endpointUrl + "?action=parse&page=" +
        encodeURIComponent("Template:" + template) +
        "&prop=parsetree&origin=*&format=json";
}

/*
 * One row per language, one column per template, so a gap is visible along the
 * row rather than having to be worked out by comparing four lists.
 *
 * The languages missing something come first: a page about what still needs
 * translating should open on what still needs translating.
 */
function createDivTemplateMatrix(divId, byTemplate) {
    var container = document.getElementById(divId);

    var languages = [];
    DISCUSSION_TEMPLATES.forEach(function (template) {
        (byTemplate[template] || []).forEach(function (code) {
            if (languages.indexOf(code) === -1) {
                languages.push(code);
            }
        });
    });

    function has(template, code) {
        return (byTemplate[template] || []).indexOf(code) !== -1;
    }

    function missingCount(code) {
        return DISCUSSION_TEMPLATES.filter(function (template) {
            return !has(template, code);
        }).length;
    }

    languages.sort(function (a, b) {
        var difference = missingCount(b) - missingCount(a);
        return difference !== 0 ? difference : a.localeCompare(b);
    });

    var incomplete = languages.filter(function (code) {
        return missingCount(code) > 0;
    }).length;

    var total = document.createElement("h3");
    total.innerHTML = wdpropText("js.templateLanguages",
        [languages.length, languages.length - incomplete]);
    container.appendChild(total);

    var table = document.createElement("table");
    table.setAttribute("class", "alternate propertytable");

    var head = document.createElement("tr");
    var cell = document.createElement("th");
    cell.innerHTML = wdpropText("js.language");
    head.appendChild(cell);
    DISCUSSION_TEMPLATES.forEach(function (template) {
        cell = document.createElement("th");
        cell.innerHTML = template;
        head.appendChild(cell);
    });
    table.appendChild(head);

    languages.forEach(function (code) {
        var row = document.createElement("tr");
        if (missingCount(code) > 0) {
            row.setAttribute("class", "untranslatedrow");
        }

        cell = document.createElement("td");
        cell.setAttribute("class", "property");
        cell.appendChild(document.createTextNode(code));
        row.appendChild(cell);

        DISCUSSION_TEMPLATES.forEach(function (template) {
            cell = document.createElement("td");
            cell.setAttribute("class", "templatecell");
            var present = has(template, code);

            /*
             * The mark is a link when the template exists, so the row is a way
             * into the translation and not only a report on it. Both states are
             * named for a screen reader, which cannot see a tick.
             */
            if (present) {
                var link = document.createElement("a");
                link.setAttribute("href",
                    "https://www.wikidata.org/wiki/Template:" + template);
                link.setAttribute("title", wdpropText("js.templateHas", [template, code]));
                link.appendChild(document.createTextNode("\u2713"));
                cell.appendChild(link);
            } else {
                cell.setAttribute("class", "templatecell missingvalue");
                cell.appendChild(document.createTextNode("\u2014"));
            }

            var reading = document.createElement("span");
            reading.setAttribute("class", "visually-hidden");
            reading.appendChild(document.createTextNode(
                wdpropText(present ? "js.templateHas" : "js.templateMissing",
                    [template, code])));
            cell.appendChild(reading);

            row.appendChild(cell);
        });

        table.appendChild(row);
    });

    container.appendChild(table);
    wdpropPaginate(container);
}

/*
 * Fills in the details table on the property page.
 *
 * Each field is set on its own. They used to be set in a row off one
 * unguarded chain, so a property with no label in the language being asked
 * about — which is the ordinary case on a page about translating them —
 * threw on the first field and left every field after it silently blank.
 */
function fetchWikidataPage(property, language) {
    var FIELDS = ["wikidatalabel", "wikidatadescription", "wikidataalias",
        "wikidatadatatype", "wikidatastatements", "wikidataconstraints"];

    function setDetail(id, text) {
        var link = document.getElementById(id);
        if (link == null) {
            return;
        }
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property);
        /* Wikidata content, so it is text and never markup. */
        link.textContent = text;
    }

    /* A property need not have a term in every language. */
    function term(group) {
        return (group && group[language] && group[language]["value"]) ||
            wdpropText("js.notInLanguage");
    }

    url = "https://www.wikidata.org/w/api.php?action=parse&page=Property:" +
        property +
        "&prop=wikitext&format=json&origin=*";
    fetch(url, {}).then(wdpropReadJson).then(json => {
        result = json.parse.wikitext["*"];
        parsedResult = JSON.parse(result);
        let claims = parsedResult.claims || {};

        let aliases = [];
        if (parsedResult.aliases && language in parsedResult.aliases) {
            for (let i = 0; i < parsedResult.aliases[language].length; i++) {
                aliases.push(parsedResult.aliases[language][i]["value"]);
            }
        }

        setDetail("wikidatalabel", term(parsedResult.labels));
        setDetail("wikidatadescription", term(parsedResult.descriptions));
        setDetail("wikidataalias",
            aliases.length ? aliases.join(", ") : wdpropText("js.notInLanguage"));
        setDetail("wikidatadatatype", parsedResult.datatype || wdpropText("js.unavailable"));
        setDetail("wikidatastatements", String(Object.keys(claims).length));
        setDetail("wikidataconstraints",
            'P2302' in claims ? String(Object.keys(claims['P2302']).length) : "0");
    }).catch(() => {
        FIELDS.forEach(id => setDetail(id, wdpropText("js.unavailable")));
    });
}

function getTemplateTranslationStatistics() {
    var divId = "templateTranslations";
    var div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);
    showMediaWikiQuery(templateParseUrl(DISCUSSION_TEMPLATES[0]), divId);

    /* Four independent pages: asked for together rather than one after another. */
    Promise.all(DISCUSSION_TEMPLATES.map(function (template) {
        return fetch(templateParseUrl(template)).then(wdpropReadJson)
            .then(createDivTemplateLanguages)
            .catch(function () { return []; });
    })).then(function (parts) {
        var byTemplate = {};
        DISCUSSION_TEMPLATES.forEach(function (template, i) {
            byTemplate[template] = parts[i];
        });

        wdpropClear(div);
        if (!parts.some(function (part) { return part.length; })) {
            wdpropShowEmpty(div);
            return;
        }
        createDivTemplateMatrix(divId, byTemplate);
    }).catch(function (error) {
        wdpropShowError(div, wdpropReason(error), getTemplateTranslationStatistics);
    });
}

function createDivWikprojectsWithProperty(divId, json) {
    let wikiprojects = document.getElementById(divId);
    let total = document.createElement("h3");

    let count = 0;
    let table = document.createElement("table");
    table.setAttribute("class", "alternate");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.projects");
    th.appendChild(td);
    table.appendChild(th);

    td = document.createElement("th");
    td.innerHTML = wdpropText("js.link");
    th.appendChild(td);
    table.appendChild(th);

    let tr = "";
    for (const page of Object.keys(json.query.search)) {
        if (!json.query.search[page]["title"].startsWith("Wikidata:WikiProject")) {
            continue;
        }
        tr = document.createElement("tr");

        td = document.createElement("td");
        let a = document.createElement("a");
        a.setAttribute('href', "https://www.wikidata.org/wiki/" + json.query.search[page]["title"]);
        let title = json.query.search[page]["title"].replace("Wikidata:WikiProject", "");
        let text = document.createTextNode(title);
        a.appendChild(text);
        td.appendChild(a);
        tr.appendChild(td);

        td = document.createElement("td");
        let wdproject = document.createElement("a");
        let link = "wikiproject.html?project=" + json.query.search[page]["title"];
        wdproject.setAttribute('href', link);
        text = document.createTextNode(link);
        wdproject.appendChild(text);
        td.appendChild(wdproject);
        tr.appendChild(td);
        table.appendChild(tr);
    }
    wikiprojects.append(table);

}

/* The timestamp of the first or last revision of a property's page. */
function showRevisionTimestamp(property, direction, divId) {
    url = "https://www.wikidata.org/w/api.php?action=query&prop=revisions&titles=Property:" +
        property +
        "&rvlimit=1&rvprop=timestamp&rvdir=" + direction +
        "&origin=*&format=json";

    function show(text) {
        let field = document.getElementById(divId);
        if (field != null) {
            field.textContent = text;
        }
    }

    fetch(url, {}).then(wdpropReadJson).then(json => {
        let pages = (json.query && json.query.pages) || {};
        let first = pages[Object.keys(pages)[0]];
        let revisions = first && first.revisions;
        if (!revisions || !revisions.length) {
            throw new Error("no revisions");
        }
        show(revisions[0]["timestamp"]);
    }).catch(() => {
        show(wdpropText("js.unavailable"));
    });
}

function updateCreationDate(property, language) {
    showRevisionTimestamp(property, "newer", "wikidatapropertycreationdate");
}

function updateModificationDate(property, language) {
    showRevisionTimestamp(property, "older", "wikidatapropertylastmodified");
}

/*
 * ===========================================================================
 * The properties a WikiProject uses
 * ===========================================================================
 *
 * A project is not one page. Wikidata:WikiProject Cultural heritage links to
 * no property at all; the fifty-six it works with are spread over its reports
 * and guidelines. Wikidata:WikiProject Organizations is the same, its
 * forty-four sitting on /Ontology and /Public Sector Organizations. Asked for
 * the links of the one page named in the address — which is what this did —
 * both projects came back with nothing, which is not what either of them says
 * about itself.
 *
 * So the project's whole tree is asked for at once: allpages over the project
 * namespace as a generator, with the links of every page it returns, narrowed
 * to the property namespace. One request, a quarter of a second, and it is the
 * same request whether a project has two pages or forty.
 *
 * Backlinks — "what links here" — answer the question the other way round: for
 * one property, which pages mention it. That is the shape of
 * showWikiProjectsWithProperty below, and it is the wrong end for this: it
 * would mean asking it of every property in Wikidata to find the few a project
 * uses. Links out of a known set of pages is one request; links into an
 * unknown set is thirteen thousand.
 *
 * What this cannot see is a property named in prose rather than linked. The
 * link tables are what MediaWiki actually records, transclusions included, so
 * a property listed through a template is found; one written as "P31" in a
 * sentence, with no link, is not there to find.
 */

/* Namespaces: 4 is Wikidata: (the project namespace), 120 is Property:. */
function wikiProjectPagesUrl(project, cont) {
    /* The generator takes the title without its namespace, which it is given
       separately; the project arrives with "Wikidata:" on the front. */
    var prefix = String(project).replace(/^Wikidata:/, "");

    return endpointUrl + "?action=query&generator=allpages" +
        "&gapprefix=" + encodeURIComponent(prefix) +
        "&gapnamespace=4&gaplimit=max" +
        "&prop=links&plnamespace=120&pllimit=max" +
        "&format=json&origin=*" +
        (cont ? "&" + cont : "");
}

/*
 * Every page of the project, and the properties each links to.
 *
 * A prefix search matches more than a project's own tree — "WikiProject
 * Organizations" is a prefix of "WikiProject Organizations Extra" — so what
 * comes back is narrowed to the page itself and what sits under it.
 *
 * Continuation is followed because a large project exceeds a page of results,
 * and the links are what would be cut: the first request would answer with the
 * project's pages and only some of their properties.
 */
function fetchWikiProjectProperties(project) {
    var seen = {};
    var ids = [];
    var pages = {};

    /*
     * How many rounds of continuation are worth following. The two projects
     * this was written for take one apiece; WikiProject Books, at 49 pages and
     * 291 properties, takes 19, because the API caps the links in one answer
     * however many pages it is asked about. The cap is here so that a project
     * larger still, or an API that answered with a token it never withdrew,
     * costs a browser a bounded number of requests rather than all of them.
     */
    var rounds = 0;
    var MOST_ROUNDS = 40;

    function under(title) {
        return title === project || title.indexOf(project + "/") === 0;
    }

    function ask(cont) {
        return fetch(wikiProjectPagesUrl(project, cont)).then(wdpropReadJson)
            .then(function (json) {
                if (json && json.error) {
                    throw new Error(json.error.code || "api");
                }

                var found = (json.query && json.query.pages) || {};
                for (var key in found) {
                    var page = found[key];
                    if (!under(page.title || "")) {
                        continue;
                    }
                    pages[page.title] = true;

                    var links = page.links || [];
                    for (var i = 0; i < links.length; i++) {
                        var id = String(links[i].title).replace(/^Property:/, "");
                        /* "Property:P" appears as a bare link on some pages. */
                        if (!/^P\d+$/.test(id) || seen[id]) {
                            continue;
                        }
                        seen[id] = true;
                        ids.push(id);
                    }
                }

                if (json.continue && ++rounds < MOST_ROUNDS) {
                    var parts = [];
                    for (var name in json.continue) {
                        parts.push(name + "=" + encodeURIComponent(json.continue[name]));
                    }
                    return ask(parts.join("&"));
                }

                return { ids: ids, pages: Object.keys(pages) };
            });
    }

    return ask("");
}

/*
 * The table, and the line saying where the properties were found.
 *
 * The identifiers are already here, in the links the API returned, so the
 * SPARQL query this used to run purely to put a label beside each one is gone:
 * the table names them from the entity API, for the rows on show, as every
 * other property listing does. That also settles what the labels are in — the
 * old query asked for English and nothing else, on a page about translating
 * into other languages.
 */
function createDivWikprojectProperties(divId, found, project) {
    var heading = document.getElementById("WikiProject");
    if (heading != null) {
        heading.textContent = project || "";
    }

    /*
     * The table reads a SPARQL answer, and this is a MediaWiki one. Shaping it
     * here rather than teaching the table a second format keeps every listing
     * in WDProp built by the same function.
     */
    createDivPropertyTable(divId, {
        head: { vars: ["property"] },
        results: {
            bindings: found.ids.map(function (id) {
                return { property: { value: "http://www.wikidata.org/entity/" + id } };
            })
        }
    });

    /*
     * Said plainly, because a reader who knows the project's main page lists
     * nothing has every reason to wonder where these came from.
     */
    var container = document.getElementById(divId);
    if (container && found.pages.length) {
        var note = document.createElement("p");
        note.setAttribute("class", "wdp-note");
        note.appendChild(document.createTextNode(
            wdpropText("js.acrossProjectPages", [found.pages.length])));
        container.appendChild(note);
    }

    wdpropPaginate(container);
}

function showWikiProjectProperties(project, divId) {
    var div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);
    showMediaWikiQuery(wikiProjectPagesUrl(project, ""), divId);

    fetchWikiProjectProperties(project).then(function (found) {
        wdpropClear(div);

        if (!found.ids.length) {
            wdpropShowEmpty(div);
            /*
             * And nothing is asked about them. The three statistics queries
             * take their properties from a VALUES block; with none to put in
             * it, WDQS reads the empty block as no constraint at all and goes
             * through every label in Wikidata — 33 seconds, three times over,
             * before answering 502. That is what left this page saying it was
             * still fetching long after it had found nothing to fetch.
             */
            [
                "translatedLabelsCount",
                "translatedDescriptionsCount",
                "translatedAliasesCount"
            ].forEach(function (id) {
                var section = document.getElementById(id);
                if (section) {
                    wdpropShowEmpty(section);
                }
            });
            return;
        }

        createDivWikprojectProperties(divId, found, project);
        getTranslationStatisticsForWikiProject(
            found.ids.map(function (id) { return "wd:" + id; }).join(" "));
    }).catch(function (error) {
        wdpropShowError(div, wdpropReason(error), function () {
            showWikiProjectProperties(project, divId);
        });
    });
}

function showWikiProjectsWithProperty(property, divId) {
    var queryparams = "query&list=search&origin=*&srnamespace=4&srsearch=Wikidata:WikiProject%20haswbstatement=" +
        property + "&srlimit=500&format=json";
    queryMediaWiki(queryparams, createDivWikprojectsWithProperty,
        divId,
        "");
}


function showWikiProjectOnLoad() {
    limit = 500;
    offset = 500;
    var project = 'Wikidata:WikiProject Properties';
    if (window.location.search.length > 0) {
        var reg = new RegExp("project=([^&#=]*)");
        var value = reg.exec(window.location.search);
        if (value != null) {
            project = decodeURIComponent(value[1]);
        }
    }
    showWikiProjectProperties(project, "allProperties");
}
