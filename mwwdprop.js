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
 * The properties a WikiProject page links to.
 *
 * The identifiers are already here, in the links the API returned, so the
 * SPARQL query this used to run purely to put a label beside each one is gone:
 * the table names them from the entity API, for the rows on show, as every
 * other property listing does. That also settles what the labels are in — the
 * old query asked for English and nothing else, on a page about translating
 * into other languages.
 *
 * The heading it built is now attached to something. It was created, filled in
 * with the count, and then dropped: nothing ever appended it, so the page has
 * never shown how many properties a project has.
 */
function createDivWikprojectProperties(divId, json) {
    let ids = [];

    for (const page of Object.keys(json.query.pages)) {
        /*
         * Which project this is. The page says so in its own heading rather
         * than only in the address bar, and nothing else fills it in now that
         * the second, unused renderer that did has gone.
         */
        let heading = document.getElementById("WikiProject");
        if (heading != null) {
            heading.textContent = json.query.pages[page].title || "";
        }

        let links = json.query.pages[page].links || [];
        for (const result of links) {
            if (!result.title.startsWith("Property:")) {
                continue;
            }
            let id = result.title.replace("Property:", "");
            /* "Property:P" appears as a bare link on some project pages. */
            if (/^P\d+$/.test(id)) {
                ids.push(id);
            }
        }
    }

    /*
     * The table reads a SPARQL answer, and this is a MediaWiki one. Shaping it
     * here rather than teaching the table a second format keeps every listing
     * in WDProp built by the same function.
     */
    createDivPropertyTable(divId, {
        head: { vars: ["property"] },
        results: {
            bindings: ids.map(function (id) {
                return { property: { value: "http://www.wikidata.org/entity/" + id } };
            })
        }
    });
    wdpropPaginate(document.getElementById(divId));

    let project = getValueFromURL("project=([^&#=]*)", "");
    if (project != "" && project != undefined) {
        getTranslationStatisticsForWikiProject(
            ids.map(function (id) { return "wd:" + id; }).join(" "));
    }
}


function showWikiProjectProperties(project, divId) {
    var queryparams = "query&prop=links&pllimit=500&origin=*&titles=" + project;
    queryMediaWiki(queryparams, createDivWikprojectProperties,
        divId,
        "");
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
