const endpointUrl = 'https://www.wikidata.org/w/api.php';

function showMediaWikiQuery(fullurl, divId) {
    let queryLink = document.getElementById(divId + "Query");
    if (queryLink != null) {
        let a = document.createElement("a");
        a.setAttribute('href', fullurl);
        let text = document.createTextNode("Run Query using Wikidata Mediawiki API. ");
        a.appendChild(text);
        queryLink.appendChild(a);
    }
}

function queryMediaWiki(queryparams, func, divId, url) {
    var div = document.getElementById(divId);
    var fetchText = document.createElement("h4");
    fetchText.innerHTML = "Fetching data...";
    div.append(fetchText);

    fullUrl = endpointUrl + '?action=' + queryparams + "&format=json";
    showMediaWikiQuery(fullUrl, divId);

    fetch(fullUrl, {}).then(body => body.json()).then(json => {
        div.removeChild(fetchText);
        func(divId, json, url)
    });
}

function createDivLanguage(divId, json, url) {
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
    total.innerHTML = "Template translated in total " + count + " languages";
    languagesDiv.appendChild(total);
    languagesDiv.appendChild(languages);
}

function fetchWikidataPage(property, language) {
    url = "https://www.wikidata.org/w/api.php?action=parse&page=Property:" +
        property +
        "&prop=wikitext&format=json&origin=*";
    fetch(url, {}).then(body => body.json()).then(json => {
        result = json.parse.wikitext["*"];
        parsedResult = JSON.parse(result);
        let aliases = [];
        if (language in parsedResult.aliases) {
            for (let i = 0; i < parsedResult.aliases[language].length; i++) {
                aliases.push(parsedResult.aliases[language][i]["value"]);
            }
        }
        aliasesString = aliases.join(", ");

        link = document.getElementById("wikidatalabel");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        link.innerHTML = parsedResult.labels[language]["value"];

        link = document.getElementById("wikidatadescription");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        link.innerHTML = parsedResult.descriptions[language]["value"];

        link = document.getElementById("wikidataalias");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        link.innerHTML = aliasesString;

        link = document.getElementById("wikidatadatatype");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        link.innerHTML = parsedResult.datatype;

        link = document.getElementById("wikidatastatements");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        link.innerHTML = String(Object.keys(parsedResult.claims).length);

        link = document.getElementById("wikidataconstraints");
        link.setAttribute('href', "https://www.wikidata.org/entity/" + property)
        if ('P2302' in parsedResult.claims) {
            link.innerHTML = String(Object.keys(parsedResult.claims['P2302']).length);
        }
    });
}

function getTemplateTranslationStatistics() {
    var queryparams = "parse&page=Template:Support&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivLanguage,
        "translatedTemplateSupport",
        "https://www.wikidata.org/wiki/Template:Support");

    var queryparams = "parse&page=Template:Oppose&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivLanguage,
        "translatedTemplateOppose",
        "https://www.wikidata.org/wiki/Template:Oppose");

    var queryparams = "parse&page=Template:Neutral&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivLanguage,
        "translatedTemplateNeutral",
        "https://www.wikidata.org/wiki/Template:Neutral");

    var queryparams = "parse&page=Template:Comment&prop=parsetree&origin=*";
    queryMediaWiki(queryparams, createDivLanguage,
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
    td.innerHTML = "Projects";
    th.appendChild(td);
    table.appendChild(th);

    td = document.createElement("th");
    td.innerHTML = "Link";
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

function updateCreationDate(property, language) {
    url = "https://www.wikidata.org/w/api.php?action=query&prop=revisions&titles=Property:" +
        property +
        "&rvlimit=1&rvprop=timestamp&rvdir=newer" +
        "&origin=*&format=json";
    fetch(url, {}).then(body => body.json()).then(json => {
        let creationDate = document.getElementById("wikidatapropertycreationdate");
        creationDate.innerHTML = json.query.pages[Object.keys(json.query.pages)[0]].revisions[0]["timestamp"];
    });
}

function updateModificationDate(property, language) {
    url = "https://www.wikidata.org/w/api.php?action=query&prop=revisions&titles=Property:" +
        property +
        "&rvlimit=1&rvprop=timestamp&rvdir=older" +
        "&origin=*&format=json";
    fetch(url, {}).then(body => body.json()).then(json => {
        let modificationDate = document.getElementById("wikidatapropertylastmodified");
        modificationDate.innerHTML = json.query.pages[Object.keys(json.query.pages)[0]].revisions[0]["timestamp"];
    });
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
    total.innerHTML = "Total " + count + " properties";

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
    total.innerHTML = "Total " + count + " properties";
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
