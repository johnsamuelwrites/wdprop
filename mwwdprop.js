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
 * Lists the languages a property-discussion template has been translated
 * into. Deliberately named apart from the same-named helper in wdprop.js,
 * which renders language chips: property.html loads both files, and
 * whichever was defined last used to win.
 */
function createDivTemplateLanguages(divId, json, url) {
    xml = json.parse["parsetree"]["*"];
    var languagesDiv = document.getElementById(divId);
    var count = 0;
    var regexp = /<name>(.+?)<\/name>/g;
    var languages = document.createElement("div");
    while (true) {
        match = regexp.exec(xml);
        if (match == null) {
            break;
        }
        var languageText = match[1].replace(/\s/g, "")
        if (languageText == "lang" || languageText == "#default" ||
            languageText == "templatedata") {
            continue;
        }
        count++;
        var language = document.createElement("div");
        language.setAttribute('class', "language");
        var a = document.createElement("a");
        a.setAttribute('href', url);
        var text = document.createTextNode(languageText);
        a.appendChild(text);
        language.appendChild(a);
        languages.appendChild(language);
    }
    var total = document.createElement("h4");
    total.innerHTML = wdpropText("js.templateTranslated", [count]);
    languagesDiv.appendChild(total);
    languagesDiv.appendChild(languages);
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
    var queryparams = "parse&page=Template:Support&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivTemplateLanguages,
        "translatedTemplateSupport",
        "https://www.wikidata.org/wiki/Template:Support");

    var queryparams = "parse&page=Template:Oppose&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivTemplateLanguages,
        "translatedTemplateOppose",
        "https://www.wikidata.org/wiki/Template:Oppose");

    var queryparams = "parse&page=Template:Neutral&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivTemplateLanguages,
        "translatedTemplateNeutral",
        "https://www.wikidata.org/wiki/Template:Neutral");

    var queryparams = "parse&page=Template:Comment&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivTemplateLanguages,
        "translatedTemplateComment",
        "https://www.wikidata.org/wiki/Template:Comment");
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
