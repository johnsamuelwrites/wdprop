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

function createDivWikprojectProperties(divId, json) {
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");

    let count = 0;
    let wdproperties = [];

    for (const page of Object.keys(json.query.pages)) {
        for (const result of json.query.pages[page].links) {
            if (!result.title.startsWith("Property:")) {
                continue;
            }
            let text = result.title.replace("Property", "wd");
            wdproperties = wdproperties + " " + text + " ";
            count++;
        }
    }
    total.innerHTML = wdpropText("js.totalProperties", [count]);

    addDivPropertyLabels(divId, wdproperties);
}

function createDivPropertyList(divId, json, url) {
    var properties = document.getElementById(divId);
    var total = document.createElement("h3");
    var count = 0;
    properties.appendChild(total);
    for (const page of Object.keys(json.query.pages)) {
        var div = document.getElementById("WikiProject");
        div.innerHTML = json.query.pages[page].title;
        for (const result of json.query.pages[page].links) {
            if (result.title.indexOf("Property:") !== -1 && result.title !== "Property:P") {
                var property = document.createElement("div");
                property.setAttribute('class', "property");
                var a = document.createElement("a");
                propertyid = result.title.replace("Property:", "");
                a.setAttribute('href', "property.html?property=" + propertyid);
                var text = document.createTextNode(propertyid);
                a.appendChild(text);
                property.appendChild(a);
                properties.appendChild(property);
                count++;
            }
        }
    }
    total.innerHTML = wdpropText("js.totalProperties", [count]);
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
