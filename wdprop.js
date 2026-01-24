/*
 * Author: John Samuel
 */

/*
 * SPARQL endpoint URL 
 */
const browserendpointurl = 'https://query.wikidata.org/#';
const endpointurl = 'https://query.wikidata.org/sparql';

/*
 * For pagination
 */
var limit = 100;
var offset = 0;
var maxPropertyCount = 100;
var wikiprojectProperties = null;

/*
 * All Queries
 */

/*
 * Get all supported datatypes
 */
allDatatypesQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT DISTINCT ?datatype
WHERE
{
   [] wikibase:propertyType ?datatype.
}
`;

/*
 * Get all supported languages
 */
allLanguagesQuery =
    `SELECT DISTINCT ?language
WHERE
{
   [] wdt:P31 wd:Q10876391;
      wdt:P407 [wdt:P424 ?language]
}
ORDER by ?language
`;

/*
 * Get all properties belonging to a particular datatype
 */

propertiesWithDatatypeQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT DISTINCT ?property
WHERE
{
    ?property rdf:type wikibase:Property;
              wikibase:propertyType {{datatype}}
}
ORDER by ?property
`;

allWikiProjectsQuery =
    `SELECT DISTINCT ?title WHERE {
   SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "Search" .
        bd:serviceParam wikibase:endpoint "www.wikidata.org" .
        bd:serviceParam mwapi:srsearch "Wikidata:WikiProject" .
        ?title wikibase:apiOutput mwapi:title .
   }
      FILTER(contains(?title, "Wikidata:WikiProject" )).
}
LIMIT {{limit}}
OFFSET {{offset}}
`;

/*
 * Get property labels
 */
propertyLabelsQuery =
    `
SELECT ?property ?label {
  VALUES ?property { {{wdproperties}} }
  ?property rdfs:label ?label.

  FILTER(lang(?label)="{{language}}")
}
`;

allClassesQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT DISTINCT ?item ?label
{
  {
    SELECT ?item ?label
    WHERE
    {
      ?item wdt:P1963 [].
    }
  }
  UNION
  {
    SELECT ?item ?label
    WHERE
    {
      ?property a wikibase:Property;
                (wdt:P31|wdt:P279) ?item.
    }
  }
  OPTIONAL{ ?item rdfs:label ?label FILTER (lang(?label)="{{language}}").}.
}
ORDER by ?label
`;

allClassesWithPropertyQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT DISTINCT ?item ?label
{
  {
    SELECT ?item ?label
    WHERE
    {
      ?item wdt:P1963 wd:{{property}}.
    }
  }
  UNION
  {
    SELECT ?item ?label
    WHERE
    {
      wd:{{property}} (wdt:P31|wdt:P279) ?item.
    }
  }
  OPTIONAL{ ?item rdfs:label ?label FILTER (lang(?label)="{{language}}").}.
}
ORDER by ?label
`;


translationStatisticsForClassQuery =
    `SELECT ?languageCode (SUM(?count) as ?total)
WHERE
{
  SELECT ?property ?languageCode (count(?translation) as ?count)
  WHERE
  {
    {
      SELECT DISTINCT ?property ?translation ?languageCode
      {
        ?property a wikibase:Property;
              (wdt:P31|wdt:P279) wd:{{class}};
	      {{translationType}} ?translation.
        BIND(lang(?translation) as ?languageCode)
      }
    }
    UNION
    {
         SELECT DISTINCT ?property  ?translation ?languageCode
         {
		  wd:{{class}} wdt:P1963 ?property.
                  ?property {{translationType}} ?translation.
                  BIND(lang(?translation) as ?languageCode)
         }
     }
  }
  GROUP BY ?property ?languageCode
}
GROUP BY ?languageCode
ORDER BY DESC(?total)
`;

propertiesForClassRequiringTranslationQuery = `
SELECT DISTINCT ?property
{
  {
    SELECT ?property
    WHERE
    {
      wd:{{class}} wdt:P1963 ?property.
      OPTIONAL{?property {{translationType}} ?translation FILTER (lang(?translation)="{{language}}")}
      FILTER (!BOUND(?translation)).
    }
  }
  UNION
  {
    SELECT ?property
    WHERE
    {
      ?property a wikibase:Property;
                wdt:P31  wd:{{class}}.
      OPTIONAL{?property {{translationType}} ?translation FILTER (lang(?translation)="{{language}}")}
      FILTER (!BOUND(?translation)).
    }
  }
}`;
translationStatisticsForWikiProjectQuery = `
SELECT ?languageCode (SUM(?count) as ?total)
WHERE
{
  SELECT ?property ?languageCode (count(?translation) as ?count)
  WHERE
  {
      VALUES ?property { {{wdproperties}} }
      ?property {{translationType}} ?translation.
      BIND(lang(?translation) as ?languageCode)
  }
  GROUP BY ?property ?languageCode
}
GROUP BY ?languageCode
ORDER BY DESC(?total)
`;
specifiedPropertiesRequiringTranslationQuery = `
SELECT DISTINCT ?property
{
   VALUES ?property { {{property}} }
   OPTIONAL{?property rdfs:label ?translation FILTER (lang(?translation)="{{language}}")}
   FILTER (!BOUND(?translation)).
}
`;

function getValueFromURL(regexp, defaultValue) {
    let reg, value;
    if (window.location.search.length > 0) {
        reg = new RegExp(regexp);
        value = reg.exec(window.location.search);
        if (value != null) {
            value = decodeURIComponent(value[1]);
        } else {
            value = defaultValue;
        }
    } else {
        value = defaultValue;
    }
    return (value);
}

function showQuery(sparqlQuery, divId) {
    fullurl = browserendpointurl + encodeURIComponent(sparqlQuery);
    let queryLink = document.getElementById(divId + "Query");
    if (queryLink != null) {
        let a = document.createElement("a");
        a.setAttribute('href', fullurl);
        let text = document.createTextNode("Run Query on Wikidata. ");
        a.appendChild(text);
        queryLink.appendChild(a);
    }
}

function createDivAllProperties(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    properties.appendChild(total);
    propertySet = new Set();
    maxPropertyId = 0;
    for (const result of results.bindings) {
        for (const variable of vars) {
            propertyId = Number(result['property'].value.replace("http://www.wikidata.org/entity/P", ""));
            propertySet.add(propertyId);
            if (propertyId > maxPropertyId) {
                maxPropertyId = propertyId;
            }
        }
    }
    total.innerHTML = "Total " + maxPropertyId + " properties";
    for (let count = 0, i = 1; count < maxPropertyCount && i < maxPropertyId; i++, count++) {
        let property = document.createElement("div");
        let text = document.createTextNode("P" + String(i));
        if (propertySet.has(i)) {
            property.setAttribute('class', "property");
            let a = document.createElement("a");
            a.setAttribute('href', "property.html?property=P" + String(i));
            a.appendChild(text);
            property.appendChild(a);
        } else {
            property.setAttribute('class', "deletedproperty");
            property.appendChild(text);
        }
        properties.appendChild(property);
    }
    propertySet.clear();
}

function visualizePath(languageData) {
    //Wikidata supported languages
    //Reference: https://www.d3-graph-gallery.com/graph/arc_basic.html

    languages = new Set();
    languageData["labels"].forEach(function (l) {
        languages.add(l);
    });
    languages = Array.from(languages);
    languages.sort();

    let height = languages.length > 50 ? languages.length * 15 : languages.length * 20;
    let width = 800;
    let svg = d3.select("#pathviz")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform",
            "translate( 10 , 10 )");
    let x = d3.scalePoint()
        .range([0, height - 10])
        .domain(languages);
    nodes = svg
        .selectAll("nodes")
        .data(languages)
        .enter()
        .append("circle")
        .attr("cy", function (d) { return (x(d)) })
        .attr("cx", 90)
        .attr("r", 4)
        .style("fill", "#00549d");
    svg.selectAll("language")
        .data(languages)
        .enter()
        .append("text")
        .attr("y", function (d) { return (x(d)) })
        .attr("x", 80)
        .text(function (d) { return (d) })
        .style("text-anchor", "end");

    // Create links
    links = [];
    if (languageData["labels"].length > 1) {
        links.push([languageData["labels"][0], languageData["labels"][1]]);
        for (let i = 1; i < languageData["labels"].length - 1; i++) {
            links.push([languageData["labels"][i], languageData["labels"][i + 1]]);
        }
    }
    languageData["labels"][0] = languageData["labels"][0].replace(" ", "");
    slinks = svg
        .selectAll('links')
        .data(links)
        .enter()
        .append('path')
        .attr('d', function (d) {
            start = x(d[0]);
            end = x(d[1]);
            arcInflectionPoint = Math.abs(start - end) > 400 ? (start - end) / 1.2 : (start - end) / 2;
            return ['M', 90, start,
                'A',
                arcInflectionPoint, ',',
                arcInflectionPoint, 0, 0, ',',
                start < end ? 1 : 0, 90, ',', end
            ]
                .join(' ');
        })
        .style("fill", "none")
        .attr("stroke", "#1B80CF");


}

function createDivProperties(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " properties";
    properties.appendChild(total);

    let count = 0;
    for (const result of results.bindings) {
        for (const variable of vars) {
            let property = document.createElement("div");
            property.setAttribute('class', "property");
            let a = document.createElement("a");
            a.setAttribute('href', "property.html?property=" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
            let text = document.createTextNode(result[variable].value.replace("http://www.wikidata.org/entity/", ""));
            a.appendChild(text);
            property.appendChild(a);
            properties.appendChild(property);
        }
        count++;
        if (count > maxPropertyCount) {
            break;
        }
    }
}

function createDivClasses(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " classes";
    properties.appendChild(total);

    let table = document.createElement("table");
    table.setAttribute("class", "alternate");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Item";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Class label";
    th.appendChild(td);
    table.append(th);

    for (const result of results.bindings) {
        tr = document.createElement("tr");

        td = document.createElement("td");
        td.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', "class.html?class=" + result['item'].value.replace("http://www.wikidata.org/entity/", ""));
        let text = document.createTextNode(result['item'].value.replace("http://www.wikidata.org/entity/", ""));
        a.append(text);
        td.appendChild(a);
        tr.appendChild(td);

        td = document.createElement("td");
        text = null;
        if (result.hasOwnProperty("label")) {
            text = document.createTextNode(result['label'].value);
        } else {
            text = document.createTextNode(result['item'].value.replace("http://www.wikidata.org/entity/", ""));
        }
        td.appendChild(text);
        tr.appendChild(td);
        table.appendChild(tr);
    }
    properties.appendChild(table);
}

function createDivClassProperties(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " properties";
    properties.appendChild(total);

    let table = document.createElement("table");
    table.setAttribute("class", "alternate");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Property";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Property label";
    th.appendChild(td);
    table.append(th);

    for (const result of results.bindings) {
        tr = document.createElement("tr");

        td = document.createElement("td");
        td.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', "property.html?property=" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        let text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        a.append(text);
        td.appendChild(a);
        tr.appendChild(td);

        td = document.createElement("td");
        text = null;

        if (result.hasOwnProperty("label")) {
            text = document.createTextNode(result['label'].value);
            a.appendChild(text);
        } else {
            text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
            a.appendChild(text);
        }
        td.appendChild(text);
        tr.appendChild(td);
        table.appendChild(tr);
    }
    properties.appendChild(table);
}

function createDivComparisonResults(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Translation statistics";
    while (properties.hasChildNodes()) {
        properties.removeChild(properties.lastChild);
    }
    properties.appendChild(total);
    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Language";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Property";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Label";
    th.appendChild(td);
    table.appendChild(th);
    let tr = "";
    for (const result of results.bindings) {
        tr = document.createElement("tr");

        td = document.createElement("td");
        td.innerHTML = result['language'].value;
        tr.appendChild(td);

        let property = document.createElement("th");
        property.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', "property.html?property=" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        let text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        a.appendChild(text);
        property.appendChild(a);
        tr.appendChild(property);

        td = document.createElement("td");
        td.innerHTML = result['label'].value;
        tr.appendChild(td);

        table.appendChild(tr);
    }
    properties.appendChild(table);
}

function createDivWikiProjects(divId, json) {
    const { head: { vars }, results } = json;
    let projects = document.getElementById(divId);
    while (projects.hasChildNodes()) {
        projects.removeChild(projects.lastChild);
    }

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
    for (const result of results.bindings) {
        tr = document.createElement("tr");

        td = document.createElement("td");
        let a = document.createElement("a");
        a.setAttribute('href', "https://www.wikidata.org/wiki/" + result['title'].value);
        let title = result['title'].value.replace("Wikidata:WikiProject", "");
        let text = document.createTextNode(title);
        a.appendChild(text);
        td.appendChild(a);
        tr.appendChild(td);

        td = document.createElement("td");
        let wdproject = document.createElement("a");
        let link = "wikiproject.html?project=" + result['title'].value;
        wdproject.setAttribute('href', link);
        text = document.createTextNode(link);
        wdproject.appendChild(text);
        td.appendChild(wdproject);
        tr.appendChild(td);
        table.appendChild(tr);
    }
    if (results.bindings.length == limit) {
        offset = offset + limit;
        let nextFirst = document.createElement("div");
        let nextLast = document.createElement("div");
        nextFirst.setAttribute('class', "property");
        nextLast.setAttribute('class', "property");
        let aF = document.createElement("a");
        aF.setAttribute('href', "wikiprojects.html?limit=" + limit + "&offset=" + offset);
        let aL = document.createElement("a");
        aL.setAttribute('href', "wikiprojects.html?limit=" + limit + "&offset=" + offset);
        let textF = document.createTextNode("Next");
        let textL = document.createTextNode("Next");
        aF.appendChild(textF);
        aL.appendChild(textL);
        nextFirst.appendChild(aF);
        nextLast.appendChild(aL);
        projects.appendChild(nextFirst);
        projects.appendChild(table);
        projects.appendChild(nextLast);
    } else {
        projects.appendChild(table);
    }
}

function createDivSearchProperties(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " properties";
    while (properties.hasChildNodes()) {
        properties.removeChild(properties.lastChild);
    }
    properties.appendChild(total);
    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Property";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Label";
    th.appendChild(td);
    table.appendChild(th);
    let tr = "";
    for (const result of results.bindings) {
        tr = document.createElement("tr");

        let property = document.createElement("td");
        property.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', "property.html?property=" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        let text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        a.appendChild(text);
        property.appendChild(a);
        tr.appendChild(property);

        td = document.createElement("td");
        td.setAttribute('class', "searchresultvalue");
        td.innerHTML = result['label'].value;
        tr.appendChild(td);

        table.appendChild(tr);
    }
    properties.appendChild(table);
}

function getColor(colors, index, total) {
    let colorCount = colors.length;
    let groupSize = total / colorCount;

    for (i = 0; i * groupSize < total; i++) {
        if (index >= i * groupSize && index <= (i + 1) * groupSize) {
            return colors[i];
        }
    }
}

function createDivTranslatedValues(divId, json) {
    const { head: { vars }, results } = json;

    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " properties";
    properties.appendChild(total);

    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Property";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Value";
    th.appendChild(td);
    table.appendChild(th);
    for (const result of results.bindings) {
        tr = document.createElement("tr");

        let property = document.createElement("div");
        property.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', "https://www.wikidata.org/wiki/Property:" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        let text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
        a.appendChild(text);
        property.appendChild(a);
        td = document.createElement("td");
        td.appendChild(property);
        tr.appendChild(td);

        td = document.createElement("td");
        td.innerHTML = result['label'].value;
        tr.appendChild(td);
        table.appendChild(tr);
    }
    properties.appendChild(table);
}

function createDivTranslatedLabelsCount(divId, json) {
    const { head: { vars }, results } = json;
    let languages = document.getElementById(divId);
    let colors = ["#002171", "#004ba0",
        "#0069c0", "#2286c3", "#bbdefb"
    ];
    let backgroundColors = ["#ffffff", "#ffffff",
        "#000000", "#000000", "#000000"
    ];
    let propertyClass = getValueFromURL("class=([^&#=]*)", "");

    let count = 0;
    for (const result of results.bindings) {
        let language = document.createElement("div");
        language.setAttribute('class', "language");

        language.style['background-color'] = getColor(colors, count, results.bindings.length);

        let a = document.createElement("a");
        if (wikiprojectProperties != null) {
            a.setAttribute('href', "./language.html?language=" + result['languageCode'].value +
                "&property=" + wikiprojectProperties);
        } else if (propertyClass != "") {
            a.setAttribute('href', "./language.html?language=" + result['languageCode'].value +
                "&class=" + propertyClass);
        } else {
            a.setAttribute('href', "./language.html?language=" + result['languageCode'].value);
        }
        a.style['color'] = getColor(backgroundColors, count, results.bindings.length);
        let text = document.createTextNode(result['languageCode'].value + " (" + result['total'].value + ")");
        a.appendChild(text);
        language.appendChild(a);
        languages.appendChild(language);

        count++;
    }
}

function createDivLanguage(divId, json) {
    const { head: { vars }, results } = json;
    let languages = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " languages";
    languages.appendChild(total);
    for (const result of results.bindings) {
        for (const variable of vars) {
            let language = document.createElement("div");
            language.setAttribute('class', "language");
            let a = document.createElement("a");
            a.setAttribute('href', "./language.html?language=" + result[variable].value);
            let text = document.createTextNode(result[variable].value);
            a.appendChild(text);
            language.appendChild(a);
            languages.appendChild(language);
        }
    }
}

function createDivPropertyDetails(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " properties";
    properties.appendChild(total);
    propertySet = new Set();
    maxPropertyId = 0;
    for (const result of results.bindings) {
        for (const variable of vars) {
            propertyId = Number(result['property'].value.replace("http://www.wikidata.org/entity/P", ""));
            propertySet.add(propertyId);
            if (propertyId > maxPropertyId) {
                maxPropertyId = propertyId;
            }
        }
    }
    for (let count = 0, i = 1; count < maxPropertyCount && i <= maxPropertyId; i++) {
        let property = document.createElement("div");
        let text = document.createTextNode("P" + String(i));
        if (propertySet.has(i)) {
            property.setAttribute('class', "property");
            let a = document.createElement("a");
            a.setAttribute('href', "property.html?property=P" + String(i));
            a.appendChild(text);
            property.appendChild(a);
            properties.appendChild(property);
            count++;
        }
    }
    propertySet.clear();
}

function queryWikidata(sparqlQuery, func, divId) {
    /*
     * Following script is a modified form of automated
     * script generated from Wikidata Query services
     */
    let div = document.getElementById(divId);
    let fetchText = document.createElement("h4");
    fetchText.innerHTML = "Fetching data...";
    div.append(fetchText);

    fullUrl = endpointurl + '?query=' + encodeURIComponent(sparqlQuery) + "&format=json";
    showQuery(sparqlQuery, divId);
    headers = { 'Accept': 'application/sparql-results+json' };

    fetch(fullUrl, { headers }).then(body => body.json()).then(json => {
        div.removeChild(fetchText);
        func(divId, json)
    });
}

function getLanguages() {
    const sparqlQuery = allLanguagesQuery;
    queryWikidata(sparqlQuery, createDivLanguage, "languages");
}

function getProperty(item, language) {
    const sparqlQuery = `
      SELECT ?propertyLabel
      {
        wd:` + item + ` rdfs:label ?propertyLabel FILTER (lang(?propertyLabel) = "` + language + `").
      }
      `;
    queryWikidata(sparqlQuery, createDivProperty, "property");
}

function getClasses() {
    let language = getValueFromURL("language=([^&#=]*)", "en")

    let property = getValueFromURL("property=([^&#=]*)", "");

    if (property == "" || property == undefined) {
        allClassesQuery = allClassesQuery.replaceAll("{{language}}", language);
        const sparqlQuery = allClassesQuery;
        queryWikidata(sparqlQuery, createDivClasses, "propertyClasses");
    } else {
        allClassesWithPropertyQuery = allClassesWithPropertyQuery.replaceAll("{{language}}", language);
        allClassesWithPropertyQuery = allClassesWithPropertyQuery.replaceAll("{{property}}", property);
        const sparqlQuery = allClassesWithPropertyQuery;
        queryWikidata(sparqlQuery, createDivClasses, "propertyClasses");
    }
}

function getClassProperties() {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    let item = getValueFromURL("class=([^&#=]*)", "Q9143")

    getProperty(item, language);

    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT DISTINCT ?property ?label
    {
      {
        SELECT ?property ?label
        WHERE
        {
          wd:` + item + ` wdt:P1963 ?property.
          OPTIONAL{ ?property rdfs:label ?label FILTER (lang(?label)="` + language + `").}
        }
      }
      UNION
      {
        SELECT DISTINCT ?property ?label
        WHERE
        {
          ?property a wikibase:Property;
                    wdt:P31  wd:` + item + `.
          OPTIONAL{ ?property rdfs:label ?label FILTER (lang(?label)="` + language + `").}
        }
      } 
    }
    ORDER by ?label
    `;
    queryWikidata(sparqlQuery, createDivClassProperties, "classProperties");
    getTranslationStatisticsForClass(item);
}

function getMissingPropertyAliases() {
    let language = getValueFromURL("language=([^&#=]*)", "en")

    getLanguage(language);

    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property skos:altLabel ?alias FILTER (lang(?alias)="` +
        language + `")}
      FILTER (!BOUND(?alias)).
    }
    ORDER by ?alias
    `;
    queryWikidata(sparqlQuery, createDivProperties, "missingPropertyAliases");
}

function getPropertyLabelsNeedingTranslation() {
    let language = getValueFromURL("language=([^&#=]*)", "en")

    getLanguage(language);

    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property rdfs:label ?label FILTER (lang(?label)="` +
        language + `")}
      FILTER (!BOUND(?label)).
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivProperties, "propertyLabelsNeedingTranslation");
}

function createDivProperty(divId, json) {
    const { head: { vars }, results } = json;
    let languageText = document.getElementById(divId);
    if (results.bindings.length > 0) {
        languageText.innerHTML = results.bindings[0]['propertyLabel']['value'];
    }
}

function createDivLanguageCode(divId, json) {
    const { head: { vars }, results } = json;
    let languageText = document.getElementById(divId);
    if (results.bindings.length > 0) {
        languageText.innerHTML = results.bindings[0]['languageLabel']['value'];
    }
}

function getLanguage(language) {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?languageLabel
    WHERE
    {
      ?languageWiki wdt:P424 "` + language + `";
               wdt:P407 ?language.   
      ?language rdfs:label ?languageLabel.
      FILTER(lang(?languageLabel) = "en")
       
    }
    LIMIT 1`;
    queryWikidata(sparqlQuery, createDivLanguageCode, "languageCode");
}

function getPropertyDescriptionsNeedingTranslation() {
    let language = getValueFromURL("language=([^&#=]*)", "en")

    getLanguage(language);

    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property schema:description ?description FILTER (lang(?description)="` +
        language + `")}
      FILTER (!BOUND(?description)).
    }
    ORDER by ?description
    `;
    queryWikidata(sparqlQuery, createDivProperties, "propertyDescriptionsNeedingTranslation");
}

function getCountOfTranslatedLabels() {
    const sparqlQuery = `
     SELECT ?languageCode (SUM(?count) as ?total)
     WHERE
     {
       SELECT ?property ?languageCode (count(?label) as ?count)
       WHERE
       {
         ?property a wikibase:Property;
                rdfs:label ?label.
         BIND(lang(?label) as ?languageCode)            
       }
       GROUP BY ?property ?languageCode
     }
     GROUP BY ?languageCode
     ORDER BY DESC(?total)    `;

    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedLabelsCount");
}

function getComparisonResultsOnLoad() {
    let search = getValueFromURL("languages=([^&#=]*)", "en, fr");
    document.getElementById("languages").value = search;
    search = "('" + search + "')";
    search = search.replace(/ /g, "");
    search = search.replace(/,/g, "') ('");
    getComparisonResult(search);
}

function getComparisonResultsOnEvent(e, form) {
    e.preventDefault();
    let search = getValueFromURL("languages=([^&#=]*)", "en, fr");
    search = "('" + document.getElementById("languages").value + "')";
    search = search.replace(/ /g, "");
    search = search.replace(/,/g, "') ('");
    getComparisonResult(search);
}

function getComparisonResult(search) {
    let sparqlQuery = `
      SELECT ?languageCode (COUNT(?label) as ?total)
      {
        VALUES (?languageCode) {` + search + `}
        [] a wikibase:Property;
             rdfs:label ?label FILTER(lang(?label)= ?languageCode)
      }
      GROUP BY ?languageCode
      ORDER BY DESC(?total)
     `;

    let compareDiv = document.getElementById("comparisonResults");
    while (compareDiv.hasChildNodes()) {
        compareDiv.removeChild(compareDiv.lastChild);
    }

    //URL to comparison page
    let compareURLdiv = document.createElement("div");
    let textURL = document.createTextNode("URL: ");
    compareURLdiv.appendChild(textURL);
    let compareURL = document.createElement("a");
    compareURL.setAttribute("href", "./compare.html?languages=" + document.getElementById("languages").value);
    let text = document.createTextNode("compare.html?languages=" + document.getElementById("languages").value);
    compareURL.appendChild(text);
    compareURLdiv.appendChild(compareURL);
    compareDiv.appendChild(compareURLdiv);

    let labels = document.createElement("div");
    labels.setAttribute("id", "comparisonResultsLabels");
    let total = document.createElement("h3");
    total.innerHTML = "Count of translated labels";
    compareDiv.appendChild(total);
    compareDiv.appendChild(labels);
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "comparisonResultsLabels");

    sparqlQuery = `
      SELECT ?languageCode (COUNT(?label) as ?total)
      {
        VALUES (?languageCode) {` + search + `}
        [] a wikibase:Property;
             schema:description ?label FILTER(lang(?label)= ?languageCode)
      }
      GROUP BY ?languageCode
      ORDER BY DESC(?total)
     `;

    let descriptions = document.createElement("div");
    descriptions.setAttribute("id", "comparisonResultsDescriptions");
    total = document.createElement("h3");
    total.innerHTML = "Count of translated descriptions";
    compareDiv.appendChild(total);
    compareDiv.appendChild(descriptions);
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "comparisonResultsDescriptions");

    sparqlQuery = `
      SELECT ?languageCode (COUNT(?label) as ?total)
      {
        VALUES (?languageCode) {` + search + `}
        [] a wikibase:Property;
             skos:altLabel ?label FILTER(lang(?label)= ?languageCode)
      }
      GROUP BY ?languageCode
      ORDER BY DESC(?total)
     `;

    let aliases = document.createElement("div");
    aliases.setAttribute("id", "comparisonResultsAliases");
    total = document.createElement("h3");
    total.innerHTML = "Count of available aliases";
    compareDiv.appendChild(total);
    compareDiv.appendChild(aliases);
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "comparisonResultsAliases");
}

function getTranslatedLabels() {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);

    const sparqlQuery = `
    SELECT ?property ?label
    WHERE
    {
      ?property a wikibase:Property;
              rdfs:label ?label.
      FILTER(lang(?label) = "` + language + `")            
    }
    ORDER by ?property
   `;
    queryWikidata(sparqlQuery, createDivTranslatedValues, "translatedLabels");
}

function getTranslatedDescriptions() {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);

    const sparqlQuery = `
    SELECT ?property ?label
    WHERE
    {
      ?property a wikibase:Property;
              schema:description ?label.
      FILTER(lang(?label) = "` + language + `")            
    }
    ORDER by ?property
   `;
    queryWikidata(sparqlQuery, createDivTranslatedValues, "translatedDescription");
}

function getTranslatedAliases() {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);

    const sparqlQuery = `
    SELECT ?property ?label
    WHERE
    {
      ?property a wikibase:Property;
              skos:altLabel ?label.
      FILTER(lang(?label) = "` + language + `")            
    }
    ORDER by ?property
   `;
    queryWikidata(sparqlQuery, createDivTranslatedValues, "translatedAliases");
}


function getCountOfTranslatedDescriptions() {
    const sparqlQuery = `
    SELECT ?languageCode (SUM(?count) as ?total)
    WHERE
    {
      SELECT ?property ?languageCode (count(?description) as ?count)
      WHERE
      {
        ?property a wikibase:Property;
                schema:description ?description.
        BIND(lang(?description) as ?languageCode)            
      }
      GROUP BY ?property ?languageCode
    }
    GROUP BY ?languageCode
    ORDER BY DESC(?total) `;

    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedDescriptionsCount");
}

function getCountOfTranslatedAliases() {
    const sparqlQuery = `
   SELECT ?languageCode (SUM(?count) as ?total)
   WHERE
   {
     SELECT ?property ?languageCode (count(?altLabel) as ?count)
     WHERE
     {
       ?property a wikibase:Property;
                skos:altLabel ?altLabel.
       BIND(lang(?altLabel) as ?languageCode)            
     }
     GROUP BY ?property ?languageCode
   }
   GROUP BY ?languageCode
   ORDER BY DESC(?total) `;

    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedAliasesCount");
}

function getTranslationStatisticsForClass(className) {
    translationStatisticsForClassQuery = translationStatisticsForClassQuery.replaceAll("{{class}}", className);
    let sparqlQuery = translationStatisticsForClassQuery.replaceAll("{{translationType}}", "rdfs:label");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedLabelsCount");

    sparqlQuery = translationStatisticsForClassQuery.replaceAll("{{translationType}}", "schema:description");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedDescriptionsCount");

    sparqlQuery = translationStatisticsForClassQuery.replaceAll("{{translationType}}", "skos:altLabel");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedAliasesCount");
}

function getTranslationStatisticsForWikiProject(wdproperties) {
    wikiprojectProperties = wdproperties;
    translationStatisticsForWikiProjectQuery = translationStatisticsForWikiProjectQuery.replaceAll("{{wdproperties}}", wdproperties);
    let sparqlQuery = translationStatisticsForWikiProjectQuery.replaceAll("{{translationType}}", "rdfs:label");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedLabelsCount");

    sparqlQuery = translationStatisticsForWikiProjectQuery.replaceAll("{{translationType}}", "schema:description");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedDescriptionsCount");

    sparqlQuery = translationStatisticsForWikiProjectQuery.replaceAll("{{translationType}}", "skos:altLabel");
    queryWikidata(sparqlQuery, createDivTranslatedLabelsCount, "translatedAliasesCount");
}

function getLanguagesWithUntranslatedLabels() {
    const sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      ?wikipedia wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {[a wikibase:Property] rdfs:label ?label. BIND(lang(?label) as ?language)}
    }
    ORDER by ?language
   `;

    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedLabelsInLanguages");
}

function getLanguagesWithUntranslatedDescriptions() {
    const sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      ?wikipedia wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {[a wikibase:Property] schema:description ?description. BIND(lang(?description) as ?language)}
    }
    ORDER by ?language
   `;

    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedDescriptionsInLanguages");
}

function getLanguagesWithUntranslatedAliases() {
    const sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      ?wikipedia wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {[a wikibase:Property] skos:altLabel ?alias. BIND(lang(?alias) as ?language)}
    }
    ORDER by ?language
   `;

    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedAliasesInLanguages");
}

function getMissingTranslationStatistics() {
    getLanguagesWithUntranslatedLabels();
    getLanguagesWithUntranslatedDescriptions();
    getLanguagesWithUntranslatedAliases();
}

function getTranslationStatistics() {
    getCountOfTranslatedLabels();
    getCountOfTranslatedDescriptions();
    getCountOfTranslatedAliases();
}

function createDivDataTypes(divId, json) {
    const { head: { vars }, results } = json;
    let datatypes = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = "Total " + results.bindings.length + " datatypes";
    datatypes.appendChild(total);
    for (const result of results.bindings) {
        for (const variable of vars) {
            let datatype = document.createElement("div");
            datatype.setAttribute('class', "datatype");
            let a = document.createElement("a");
            let datatypeValue = result[variable].value.replace("http://wikiba.se/ontology#", "");
            let text = document.createTextNode(datatypeValue);
            a.setAttribute('href', "datatype.html?datatype=wikibase:" + datatypeValue);
            a.appendChild(text);
            datatype.appendChild(a);
            datatypes.appendChild(datatype);
        }
    }
}

function getDatatypes() {
    language = getValueFromURL("lang=([^&#=]*)", "en");
    const sparqlQuery = allDatatypesQuery;
    queryWikidata(sparqlQuery, createDivDataTypes, "propertyDatatypes");
}

function getProperties() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyDetails, "existingProperties");
    queryWikidata(sparqlQuery, createDivAllProperties, "allProperties");
}


function getPropertyWithReference() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
   SELECT DISTINCT ?property 
    {
      ?property a wikibase:Property;
         ?prop ?statement.
      ?statement prov:wasDerivedFrom ?reference.
      FILTER(REGEX(STR(?statement), "http://www.wikidata.org/entity/statement/") && bound(?reference))
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyDetails, "propertywithreference");
}

function getPropertyWithEquivPropertySet() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
   SELECT DISTINCT ?property 
    {
      ?property a wikibase:Property;
         ?prop ?statement;
         wdt:P1628 ?equivproperty.
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyDetails, "propertywithequivpropertyset");
}

function getOverallProvenance() {
    getPropertyWithEquivPropertySet();
    getPropertyWithReference();
}

function getPropertiesForClassRequiringTranslationQuery(propertyClass) {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);
    getProperty(propertyClass, language);
    propertiesForClassRequiringTranslationQuery = propertiesForClassRequiringTranslationQuery.replaceAll("{{class}}", propertyClass);
    propertiesForClassRequiringTranslationQuery = propertiesForClassRequiringTranslationQuery.replaceAll("{{language}}", language);
    let sparqlQuery = propertiesForClassRequiringTranslationQuery.replaceAll("{{translationType}}", "rdfs:label");
    queryWikidata(sparqlQuery, createDivProperties, "propertyLabelsNeedingTranslation");

    sparqlQuery = propertiesForClassRequiringTranslationQuery.replaceAll("{{translationType}}", "schema:description");
    queryWikidata(sparqlQuery, createDivProperties, "propertyDescriptionsNeedingTranslation");

    sparqlQuery = propertiesForClassRequiringTranslationQuery.replaceAll("{{translationType}}", "skos:altLabel");
    queryWikidata(sparqlQuery, createDivProperties, "missingPropertyAliases");
}

function getSpecifiedPropertiesRequiringTranslation(property) {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);
    specifiedPropertiesRequiringTranslationQuery = specifiedPropertiesRequiringTranslationQuery.replaceAll("{{property}}", property);
    specifiedPropertiesRequiringTranslationQuery = specifiedPropertiesRequiringTranslationQuery.replaceAll("{{language}}", language);
    let sparqlQuery = specifiedPropertiesRequiringTranslationQuery.replaceAll("{{translationType}}", "rdfs:label");
    queryWikidata(sparqlQuery, createDivProperties, "propertyLabelsNeedingTranslation");

    sparqlQuery = specifiedPropertiesRequiringTranslationQuery.replaceAll("{{translationType}}", "schema:description");
    queryWikidata(sparqlQuery, createDivProperties, "propertyDescriptionsNeedingTranslation");

    sparqlQuery = specifiedPropertiesRequiringTranslationQuery.replaceAll("{{translationType}}", "skos:altLabel");
    queryWikidata(sparqlQuery, createDivProperties, "missingPropertyAliases");
}

function getPropertiesNeedingTranslation() {
    let propertyClass = getValueFromURL("class=([^&#=]*)", "");
    let property = getValueFromURL("property=([^&#=]*)", "");
    if (property != "") {
        getSpecifiedPropertiesRequiringTranslation(property)
    } else if (propertyClass != "") {
        getPropertiesForClassRequiringTranslationQuery(propertyClass)
    } else {
        getPropertyLabelsNeedingTranslation();
        getPropertyDescriptionsNeedingTranslation();
        getMissingPropertyAliases();
    }
}


function getPropertyDetails() {
    let property = getValueFromURL("property=([^&#=]*)", "P31");

    let language = getValueFromURL("language=([^&#=]*)", "en");

    let div = document.getElementById("propertyCode");
    div.innerHTML = property;
    fetchWikidataPage(property, language);
    updateModificationDate(property, language);
    updateCreationDate(property, language);

    link = document.getElementById("wikidatalink");
    link.setAttribute('href', "https://www.wikidata.org/entity/" + property);
    link.innerHTML = "https://www.wikidata.org/entity/" + property;


    link = document.getElementById("wikidatastatements");
    link.setAttribute('href', "https://www.wikidata.org/entity/" + property);
    link.innerHTML = "https://www.wikidata.org/entity/" + property;

    link = document.getElementById("wikidatawikiprojects");
    link.setAttribute('href', "wikiprojects.html?property=" + property);
    link.innerHTML = "wikiprojects.html?property=" + property;

    link = document.getElementById("wikidatatranslationpath");
    link.setAttribute('href', "path.html?property=" + property);
    link.innerHTML = "path.html?property=" + property;

    link = document.getElementById("wikidatatranslationpathviz");
    link.setAttribute('href', "pathviz.html?property=" + property);
    link.innerHTML = "pathviz.html?property=" + property;

    link = document.getElementById("wikidataprovenance");
    link.setAttribute('href', "propertyprovenance.html?property=" + property);
    link.innerHTML = "provenance.html?property=" + property;

    link = document.getElementById("wikidataclass");
    link.setAttribute('href', "classes.html?property=" + property);
    link.innerHTML = "classes.html?property=" + property;

    link = document.getElementById("wikidatawikiprojects");
    link.setAttribute('href', "wikiprojects.html?property=" + property);
    link.innerHTML = "wikiprojects.html?property=" + property;

    link = document.getElementById("sqidlink");
    link.setAttribute('href', "https://sqid.toolforge.org/#/view?id=" + property);
    link.innerHTML = "https://sqid.toolforge.org/#/view?id=" + property;

    let sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      [] wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {wd:` + property + ` rdfs:label ?label. BIND(lang(?label) as ?language)}
    }
    ORDER by ?language
    `;
    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedLabelsInLanguages");

    sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      [] wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {wd:` + property + ` schema:description ?description. BIND(lang(?description) as ?language)}
    }
    ORDER by ?language
    `;
    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedDescriptionsInLanguages");

    sparqlQuery = `
    SELECT DISTINCT ?language
    WHERE
    {
      [] wdt:P31 wd:Q10876391;
                 wdt:P407 [wdt:P424 ?language]
      MINUS {wd:` + property + ` skos:altLabel ?alias. BIND(lang(?alias) as ?language)}
    }
    ORDER by ?language
    `;

    queryWikidata(sparqlQuery, createDivLanguage, "untranslatedAliasesInLanguages");
    sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:` + property + ` rdfs:label ?label.
      BIND(lang(?label) as ?language)
    }
    ORDER by ?language`;
    queryWikidata(sparqlQuery, createDivLanguage, "translatedLabelsInLanguages");

    sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:` + property + ` schema:description ?description.
      BIND(lang(?description) as ?language)
    } 
    ORDER by ?language`;
    queryWikidata(sparqlQuery, createDivLanguage, "translatedDescriptionsInLanguages");

    sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:` + property + ` skos:altLabel ?alias.
      BIND(lang(?alias) as ?language)
    }
    ORDER by ?language`;
    queryWikidata(sparqlQuery, createDivLanguage, "translatedAliasesInLanguages");

}

function getPropertiesWithDatatype() {
    let datatype = getValueFromURL("datatype=([^&#=]*)", "wikibase:WikibaseItem");

    let datatypeCode = document.getElementById("datatypeCode");
    datatypeCode.innerHTML = "Properties with datatype- " + datatype;

    let sparqlQuery = propertiesWithDatatypeQuery;
    sparqlQuery = propertiesWithDatatypeQuery.replace(
        "{{datatype}}", datatype);
    queryWikidata(sparqlQuery, createDivPropertyDetails, "propertiesWithDatatype");
}

function createDivPropertyDescriptors(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    let count = 0;
    properties.appendChild(total);
    for (const result of results.bindings) {
        for (const variable of vars) {
            let property = document.createElement("div");
            property.setAttribute('class', "property");
            let a = document.createElement("a");
            if (result[variable].value.indexOf("/direct") != -1 ||
                result[variable].value.indexOf("wikiba.se") != -1 ||
                result[variable].value.indexOf("schema.org") != -1 ||
                result[variable].value.indexOf("w3.org") != -1) {
                continue; //To avoid properties  
            }
            count = count + 1;
            //a.setAttribute('href', result[variable].value);
            a.setAttribute('href', "property.html?property=" + result[variable].value.replace("http://www.wikidata.org/prop/", ""));
            let text = document.createTextNode(result[variable].value.replace(new RegExp(".*/"), ""));
            a.appendChild(text);
            property.appendChild(a);
            properties.appendChild(property);
        }
    }
    total.innerHTML = "Total " + count + " properties";
}

function getPropertyDescriptors() {
    const sparqlQuery = `
    PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?subproperty
    WHERE
    {
      [] rdf:type wikibase:Property;
                ?subproperty [].
    }
    ORDER by ?subproperty

    `;
    queryWikidata(sparqlQuery, createDivPropertyDescriptors, "propertyDescriptors");
}

function getSearchQuery(language, search) {
    const sparqlQuery = `
    PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT DISTINCT ?property ?label
    {
      {
        SELECT ?property ?label
        WHERE
        {
          ?property a wikibase:Property;
                      rdfs:label ?label FILTER (lang(?label) = "` + language + `").
          FILTER(contains(lcase(?label), lcase(` + search + `)))
        }
      }
      UNION
      {
        SELECT ?property ?label
        WHERE
        {
          [rdfs:label ?ilabel] wdt:P1963 ?property.
          ?property rdfs:label ?label FILTER(lang(?label)="` + language + `").
          FILTER (lang(?ilabel)="en" && contains(lcase(?ilabel), lcase(` + search + `)))
        }
      }
      UNION
      {
        SELECT DISTINCT ?property ?label
        WHERE
        {
          ?property a wikibase:Property;
                    wdt:P31  [rdfs:label ?ilabel];
                    rdfs:label ?label FILTER (lang(?label)="` + language + `").
          FILTER (lang(?ilabel)="en" && contains(lcase(?ilabel), lcase(` + search + `)))
        }
      } 
    }
    ORDER by ?label
    `;
    return (sparqlQuery);
}

function getSearchWikiProjectQuery(search) {
    const sparqlQuery = `
    SELECT ?title WHERE{
     FILTER (contains(lcase(?title), lcase(` + search + `))).
     {
       SELECT ?title WHERE {
        SERVICE wikibase:mwapi {
          bd:serviceParam wikibase:api "Search" .
          bd:serviceParam wikibase:endpoint "www.wikidata.org" .
          bd:serviceParam mwapi:srsearch "Wikidata:WikiProject" .
          ?title wikibase:apiOutput mwapi:title .
        }
        FILTER(contains(?title, "Wikidata:WikiProject" ))
       }
      }
    }
  `;
    return sparqlQuery;
}

function getWikiProjects() {
    let limitString = getValueFromURL("limit=([^&#=]*)", 100);
    if (limitString) {
        limit = Number(limitString);
    }
    let offsetString = getValueFromURL("offset=([^&#=]*)", 100);
    if (offsetString) {
        offset = Number(offsetString);
    }

    let property = getValueFromURL("property=([^&#=]*)", "");

    if (property != undefined && property != "") {
        showWikiProjectsWithProperty(property, "allWikiProjects")
    } else {
        allWikiProjectsQuery = allWikiProjectsQuery.replace("{{limit}}", limit);
        allWikiProjectsQuery = allWikiProjectsQuery.replace("{{offset}}", offset);
        const sparqlQuery = allWikiProjectsQuery;
        queryWikidata(sparqlQuery, createDivWikiProjects, "allWikiProjects");
    }
}

function addDivPropertyLabels(divId, wdproperties) {
    propertyLabelsQuery = propertyLabelsQuery.replace("{{wdproperties}}", wdproperties);
    propertyLabelsQuery = propertyLabelsQuery.replace("{{language}}", "en");
    const sparqlQuery = propertyLabelsQuery;
    queryWikidata(sparqlQuery, createDivClassProperties, divId);
    let project = getValueFromURL("project=([^&#=]*)", "");
    if (project != "" && project != undefined) {
        getTranslationStatisticsForWikiProject(wdproperties);
    }
}

function findWikiProjects(e, form) {
    e.preventDefault();
    let search = document.getElementById("searchproject").value;
    sparqlQuery = getSearchWikiProjectQuery("'" + search + "'");
    queryWikidata(sparqlQuery, createDivWikiProjects, "searchResults");
}


function findWikiProjectsOnLoad() {
    limit = 500;
    offset = 500;
    let search = getValueFromURL("search=([^&#=]*)", "heritage");
    sparqlQuery = getSearchWikiProjectQuery('"' + search + '"');
    document.getElementById("search").value = search;
    queryWikidata(sparqlQuery, createDivWikiProjects, "allWikiProjects");
}

function findPropertyOnLoad() {
    let language = getValueFromURL("language=([^&#=]*)", "en");
    let search = getValueFromURL("search=([^&#=]*)", "");

    if (search == "") {
        return;
    }

    sparqlQuery = getSearchQuery(language, '"' + search + '"');
    document.getElementById("search").value = search;
    queryWikidata(sparqlQuery, createDivSearchProperties, "searchResults");
}

function findProperty(e) {
    e.preventDefault();
    let language = getValueFromURL("language=([^&#=]*)", "en");
    let search = '"' + document.getElementById("search").value + '"';
    sparqlQuery = getSearchQuery(language, search);
    queryWikidata(sparqlQuery, createDivSearchProperties, "searchResults");
}

function createDivTranslationPathOptimized(divId, json) {
    createDivTranslationPath(divId, json, true, false);
}

function createDivTranslationPathVizOptimized(divId, json) {
    createDivTranslationPath(divId, json, true, true);
}

function createDivTranslationPathNonOptimized(divId, json) {
    createDivTranslationPath(divId, json, false);
}

function createDivTranslationPath(divId, json, optimized, visualization) {
    let languageData = {};
    languageData["labels"] = [];
    languageData["descriptions"] = [];
    languageData["aliases"] = [];
    const { head: { vars }, results } = json;
    let path = document.getElementById(divId);

    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    table.setAttribute("class", "path");
    td.innerHTML = "Time";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "L";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "D";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "A";
    th.appendChild(td);
    table.append(th);

    trMap = {};

    count = 0;
    for (const result of results.bindings) {
        let totalCount = 1;
        if (optimized) {
            totalCount = 15;
        }
        for (count = 1; count <= totalCount; count++) {
            let newEntry = false;
            tr = null;
            let comment = "";
            let time = "";
            if (optimized) {
                if ('comment' + count in result) {
                    comment = result['comment' + count].value;
                    time = result['time' + count].value;
                } else {
                    continue;
                }
            } else {
                comment = result['comment'].value;
                time = result['time'].value;
            }
            comment = comment.replace(/\*\/.*/g, '');
            comment = comment.replace(/\/\* wb.*[0-9]| /, '');
            if (time + comment in trMap) {
                tr = trMap[time + comment];
            }
            alanguagedifflink = document.createElement("a");
            if (optimized) {
                alanguagedifflink.setAttribute('href',
                    "https://www.wikidata.org/wiki/Special:Diff/" +
                    result['revision' + count].value);
            } else {
                alanguagedifflink.setAttribute('href',
                    "https://www.wikidata.org/wiki/Special:Diff/" +
                    result['revision'].value);
            }

            atimepermalink = document.createElement("a");
            if (optimized) {
                atimepermalink.setAttribute('href',
                    "https://www.wikidata.org/wiki/Special:PermaLink/" +
                    result['revision' + count].value);
            } else {
                atimepermalink.setAttribute('href',
                    "https://www.wikidata.org/wiki/Special:PermaLink/" +
                    result['revision'].value);
            }
            if (tr == null) {
                tr = document.createElement("tr");
                tr.setAttribute('id', time + comment);
                trMap[time + comment] = tr;
                td = document.createElement("td");
                text = document.createTextNode(time);
                atimepermalink.append(text);
                td.appendChild(atimepermalink);
                tr.appendChild(td);
                newEntry = true;
            }

            if (optimized) {
                comment = result['comment' + count].value;
            } else {
                comment = result['comment'].value;
            }

            if (comment.indexOf('wbeditentity-create') != -1) {
                td = document.createElement("td");
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\* wbeditentity-create:[0-9]| /, '');
                comment = comment.replace('|', '');
                comment = comment.replace(" ", "");
                languageData["labels"].push(comment);
                text = document.createTextNode(comment);
                textDiv = document.createElement("div");
                textDiv.setAttribute('class', "pathlanguage");
                textDiv.style['background-color'] = '#002171';
                alanguagedifflink.append(text);
                textDiv.append(alanguagedifflink);
                td.appendChild(textDiv);
                tr.appendChild(td);
                td = document.createElement("td");
                tr.appendChild(td);
                td = document.createElement("td");
                tr.appendChild(td);
                table.appendChild(tr);
            }

            if (comment.indexOf('special-create-property') != -1) {
                td = document.createElement("td");
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\* special-create-property:[0-9]| /, '');
                comment = comment.replace('|', '');
                comment = comment.replace(" ", "");
                languageData["labels"].push(comment);
                text = document.createTextNode(comment);
                textDiv = document.createElement("div");
                textDiv.setAttribute('class', "pathlanguage");
                textDiv.style['background-color'] = '#002171';
                alanguagedifflink.append(text);
                textDiv.append(alanguagedifflink);
                td.appendChild(textDiv);
                tr.appendChild(td);
                td = document.createElement("td");
                tr.appendChild(td);
                td = document.createElement("td");
                tr.appendChild(td);
                table.appendChild(tr);
            }

            if (comment.indexOf('wbsetlabel-add') != -1) {
                td = document.createElement("td");
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\* wbsetlabel-add:[0-9]| /, '');
                comment = comment.replace('|', '');
                comment = comment.replace(" ", "");
                languageData["labels"].push(comment);
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[1].appendChild(textDiv);
                } else {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetdescription-add') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetdescription-add:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[2].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }
            if (comment.indexOf('wbsetaliases-add-remove') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetaliases-add-remove:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[3].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetaliases-add') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetaliases-add:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[3].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#002171';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetlabel-set') != -1) {
                td = document.createElement("td");
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\* wbsetlabel-set:[0-9]| /, '');
                comment = comment.replace('|', '');
                comment = comment.replace(" ", "");
                languageData["labels"].push(comment);
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[1].appendChild(textDiv);
                } else {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetdescription-set') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetdescription-set:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[2].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetaliases-set') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetaliases-set:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[3].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = '#0069c0';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetlabeldescriptionaliases') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetlabeldescriptionaliases:[0-9]| /, '');
                comment = comment.replace('|', '');
                comment = comment.replace(" ", "");
                languageData["labels"].push(comment);
                if (!newEntry) {
                    text1 = document.createTextNode(comment);
                    text2 = document.createTextNode(comment);
                    text3 = document.createTextNode(comment);
                    textDiv1 = document.createElement("div");
                    textDiv2 = document.createElement("div");
                    textDiv3 = document.createElement("div");
                    textDiv1.setAttribute('class', "pathlanguage");
                    textDiv1.style['background-color'] = '#0069c0';
                    textDiv1.append(text1);

                    textDiv2.setAttribute('class', "pathlanguage");
                    textDiv2.style['background-color'] = '#0069c0';
                    textDiv2.append(text2);

                    textDiv3.setAttribute('class', "pathlanguage");
                    textDiv3.style['background-color'] = '#0069c0';
                    textDiv3.append(text3);
                    tr.children[1].appendChild(textDiv1);
                    tr.children[2].appendChild(textDiv2);
                    tr.children[3].appendChild(textDiv3);
                } else {
                    text1 = document.createTextNode(comment);
                    text2 = document.createTextNode(comment);
                    text3 = document.createTextNode(comment);
                    textDiv1 = document.createElement("div");
                    textDiv2 = document.createElement("div");
                    textDiv3 = document.createElement("div");
                    textDiv1.setAttribute('class', "pathlanguage");
                    textDiv1.style['background-color'] = '#0069c0';
                    textDiv1.append(text1);

                    textDiv2.setAttribute('class', "pathlanguage");
                    textDiv2.style['background-color'] = '#0069c0';
                    textDiv2.append(text2);

                    textDiv3.setAttribute('class', "pathlanguage");
                    textDiv3.style['background-color'] = '#0069c0';
                    textDiv3.append(text3);

                    td = document.createElement("td");
                    td.appendChild(textDiv1);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    td.appendChild(textDiv2);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    td.appendChild(textDiv3);
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetlabel-remove') != -1) {
                td = document.createElement("td");
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\* wbsetlabel-remove:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[1].appendChild(textDiv);
                } else {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetdescription-remove') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetdescription-remove:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[2].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }

            if (comment.indexOf('wbsetaliases-remove') != -1) {
                comment = comment.replace(/\*\/.*/g, '');
                comment = comment.replace(/\/\*.*wbsetaliases-remove:[0-9]| /, '');
                comment = comment.replace('|', '');
                if (!newEntry) {
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    tr.children[3].appendChild(textDiv);
                } else {
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    tr.appendChild(td);
                    td = document.createElement("td");
                    text = document.createTextNode(comment);
                    textDiv = document.createElement("div");
                    textDiv.setAttribute('class', "pathlanguage");
                    textDiv.style['background-color'] = 'red';
                    alanguagedifflink.append(text);
                    textDiv.append(alanguagedifflink);
                    td.appendChild(textDiv);
                    tr.appendChild(td);
                    table.appendChild(tr);
                }
            }
        }
    }
    path.appendChild(table);
    if (visualization)
        visualizePath(languageData);
}

function getTranslationPathQueryOptimized() {
    let property = getValueFromURL("property=([^&#=]*)", "P3966");

    let sparqlQuery = `SELECT * {
     SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "www.wikidata.org" .
      bd:serviceParam wikibase:api "Generator" .
      bd:serviceParam mwapi:generator "revisions" .
      bd:serviceParam mwapi:titles "Property:` + property + `" .
      bd:serviceParam mwapi:grvprop "timestamp|comment" .
      bd:serviceParam mwapi:grvlimit "15".
      bd:serviceParam mwapi:prop  "revisions". `;
    for (i = 1; i < 16; i++) {
        sparqlQuery = sparqlQuery +
            `?time` + i + ` wikibase:apiOutput "revisions/rev[` + i + `]/@timestamp" . 
         ?comment` + i + ` wikibase:apiOutput "revisions/rev[` + i + `]/@comment" .
         ?revision` + i + ` wikibase:apiOutput "revisions/rev[` + i + `]/@revid" .`;
    }
    sparqlQuery = sparqlQuery + `
      }
    }
    order by ?time1
    `;
    return sparqlQuery;
}

function getTranslationPathTableOptimized() {
    sparqlQuery = getTranslationPathQueryOptimized();
    queryWikidata(sparqlQuery, createDivTranslationPathOptimized, "translationPath");
}

function getTranslationPathVizOptimized() {
    sparqlQuery = getTranslationPathQueryOptimized();
    queryWikidata(sparqlQuery, createDivTranslationPathVizOptimized, "translationPath");
}

function getPath() {
    let property = getValueFromURL("property=([^&#=]*)", "P3966");

    const sparqlQuery = `
     SELECT * {
     SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "www.wikidata.org" .
      bd:serviceParam wikibase:api "Generator" .
      bd:serviceParam mwapi:generator "revisions" .
      bd:serviceParam mwapi:titles "Property:` + property + `" .
      bd:serviceParam mwapi:grvprop "timestamp|comment" .
      bd:serviceParam mwapi:grvlimit "1".
      bd:serviceParam mwapi:prop  "revisions".
      ?time wikibase:apiOutput "revisions/rev[1]/@timestamp" . 
      ?comment wikibase:apiOutput "revisions/rev[1]/@comment" .
      ?revision wikibase:apiOutput "revisions/rev[1]/@revid" .
     }
    }
    order by ?time
    `;
    queryWikidata(sparqlQuery, createDivTranslationPath, "translationPath");
}

function createDivReferencesCount(divId, json) {
    const { head: { vars }, results } = json;
    let referencesCount = document.getElementById(divId);
    percentage = parseFloat(results.bindings[0]["percentage"]["value"]).toFixed(2);
    let percentageDiv = document.createElement("h3");
    percentageDiv.innerHTML = "Total " +
        results.bindings[0]["referencecount"]["value"] +
        " referenced statements from a total of " +
        results.bindings[0]["statementcount"]["value"] +
        " statements (" + percentage + "%)";
    referencesCount.appendChild(percentageDiv);
}

function getReferencesCount() {
    let property = getValueFromURL("property=([^&#=]*)", "P31");
    let div = document.getElementById("itemCode");
    div.innerHTML = property;

    const sparqlQuery = `
    SELECT (count(?reference) as ?referencecount ) (count(?statement) as ?statementcount ) (?referencecount*100/?statementcount as ?percentage)
    WITH {
      SELECT ?statement
      {
        [] p:` + property + ` ?statement
      }
    } AS %result
    WHERE {
      INCLUDE %result
      OPTIONAL{?statement prov:wasDerivedFrom ?reference}
    }
    `;
    queryWikidata(sparqlQuery, createDivReferencesCount, "referencesCount");
}

function getReferences() {
    let property = getValueFromURL("property=([^&#=]*)", "P31");
    let div = document.getElementById("itemCode");
    div.innerHTML = property;

    const sparqlQuery = `
    SELECT ?statement ?prop ?reference
    {
      wd:` + property + ` ?prop ?statement.
      OPTIONAL{?statement prov:wasDerivedFrom ?reference}
      FILTER(REGEX(STR(?statement), "http://www.wikidata.org/entity/statement/"))
    }
    ORDER by ?statement
    `;
    queryWikidata(sparqlQuery, createDivReferences, "references");
}

function createDivReferences(divId, json) {
    const { head: { vars }, results } = json;
    let references = document.getElementById(divId);
    refs = {};
    for (const result of results.bindings) {
        if (result["reference"] != undefined) {
            if (result['prop'].value in refs) {
                refs[result['prop'].value] += 1;
            } else {
                refs[result['prop'].value] = 1;
            }
        }
    }
    let statementTotal = document.createElement("h3");
    statementTotal.innerHTML = "Total " + Object.keys(refs).length + " reference statements" +
        " for a total of " + results.bindings.length + " statements";
    if (results.bindings.length != 0) {
        statementTotal.innerHTML = statementTotal.innerHTML +
            " (" + ((Object.keys(refs).length * 100) / results.bindings.length).toFixed(2) + "%)"
    }
    references.appendChild(statementTotal);

    if (Object.keys(refs).length == 0) {
        return;
    }

    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = "Property";
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = "Number of statements";
    th.appendChild(td);
    table.append(th);
    data = Object.keys(refs);
    for (i = 0; i < data.length; i++) {
        tr = document.createElement("tr");

        td = document.createElement("td");
        td.setAttribute('class', "property");
        let a = document.createElement("a");
        a.setAttribute('href', data[i]);
        let text = document.createTextNode(data[i].replace("http://www.wikidata.org/prop/", ""));
        a.append(text);
        td.appendChild(a);
        tr.appendChild(td);

        td = document.createElement("td");
        text = null;
        text = document.createTextNode(refs[data[i]]);
        td.appendChild(text);
        tr.appendChild(td);
        table.appendChild(tr);

    }
    references.appendChild(table);
}

function getEquivalentProperties() {
    let property = getValueFromURL("property=([^&#=]*)", "P31");

    const sparqlQuery = `
    SELECT ?equivproperty
    {
      wd:` + property + ` wdt:P1628 ?equivproperty
    }

    `;
    queryWikidata(sparqlQuery, createDivExternalLinks, "externalEquivProperties");
}

function createDivExternalLinks(divId, json) {
    const { head: { vars }, results } = json;
    let references = document.getElementById(divId);
    refs = {};
    let statementTotal = document.createElement("h3");
    statementTotal.innerHTML = "Total " + results.bindings.length + " equivalent properties on external sources";
    references.appendChild(statementTotal);
}

function getLinks() {
    getReferences();
    getReferencesCount();
    getEquivalentProperties();
}
document.onkeydown = function (event) {
    event = event || window.event;
    if (event.keyCode == '13') {
        let search = document.getElementById("headersearchtext").value;
        window.location = "./search.html?search=" + search;
        findProperty(event);
    }
}

/* Models*/
class Language {
    constructor() { }
}

class DataType {
    constructor() { }
}

class Property {
    constructor() { }
}

class PropertyClass {
    constructor() { }
}

class PropertyDiscussion {
    constructor() { }
}

class Reference {
    constructor() { }
}

class WikiProject {
    constructor() { }
}

/* View*/
class LanguageView {
    constructor() { }
}

class DataTypeView {
    constructor() { }
}

class PropertyView {
    constructor() { }
}

class PropertyClassView {
    constructor() { }
}

class PropertyDiscussionView {
    constructor() { }
}

class ReferenceView {
    constructor() { }
}

class SearchView {
    constructor() { }
}

class ComparisonView {
    constructor() { }
}

class WikiProjectView {
    constructor() { }
}

/* Controller*/
class LanguageController {
    constructor(model, view) { }
}

class DataTypeController {
    constructor() { }
}

class PropertyController {
    constructor() { }
}

class PropertyClassController {
    constructor() { }
}

class PropertyDiscussionController {
    constructor() { }
}

class ReferenceController {
    constructor() { }
}

class SearchController {
    constructor() { }
}

class ComparisonController {
    constructor() { }
}

class WikiProjectController {
    constructor() { }
}

/* Theme Management */
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';

    if (currentTheme === 'light') {
        body.classList.add('dark-theme');
        localStorage.setItem('wdprop-theme', 'dark');
    } else {
        body.classList.remove('dark-theme');
        localStorage.setItem('wdprop-theme', 'light');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('wdprop-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-theme');
    }
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('mobile-open');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('mobile-menu-toggle');

    if (sidebar && menuToggle && sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(event.target) && !menuToggle.contains(event.target)) {
            sidebar.classList.remove('mobile-open');
        }
    }
});

// Load theme on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTheme);
} else {
    loadTheme();
}