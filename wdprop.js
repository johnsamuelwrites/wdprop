/*
 * Author: John Samuel
 */

/*
 * Interface text, from i18n.js. Falls back to the key if the message
 * files somehow did not load, which keeps the page working.
 */
function wdpropText(key, params) {
    return (window.WDProp && window.WDProp.i18n) ? window.WDProp.i18n.t(key, params) : key;
}

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
   OPTIONAL{?property {{translationType}} ?translation FILTER (lang(?translation)="{{language}}")}
   FILTER (!BOUND(?translation)).
}
`;

/*
 * Fills {{name}} placeholders in a query template and returns the result.
 *
 * The templates above are module-level values reused across calls, so they
 * must never be written back to: substituting into the template itself
 * destroys its placeholders, and any later call gets a query that is already
 * filled in, or one whose placeholders can no longer be filled at all.
 */
function fillQuery(template, values) {
    let query = template;
    Object.keys(values).forEach(function (name) {
        query = query.replaceAll("{{" + name + "}}", values[name]);
    });
    return query;
}

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
        // Clear previous query link before adding the new one
        while (queryLink.firstChild) {
            queryLink.removeChild(queryLink.firstChild);
        }
        let a = document.createElement("a");
        a.setAttribute('href', fullurl);
        let text = document.createTextNode(wdpropText("js.runQuery"));
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
    total.innerHTML = wdpropText("js.totalProperties", [maxPropertyId]);
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

/*
 * An SVG element with its attributes and inline styles set.
 *
 * SVG elements have to be created in their own namespace — createElement
 * gives an unknown HTML element that lays out as nothing — which is the only
 * reason this helper exists rather than the DOM being used directly.
 *
 * attrs and styles are kept apart because the difference is load-bearing: a
 * presentation attribute loses to any stylesheet rule, an inline style beats
 * one. The text fill below is var(--text-primary) and has to follow the theme,
 * so it is a style; the stroke colours are fixed per diagram and are
 * attributes.
 */
function wdpropSvg(name, attrs, styles) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", name);
    var key;
    for (key in attrs || {}) {
        if (attrs[key] !== null && attrs[key] !== undefined) {
            el.setAttribute(key, attrs[key]);
        }
    }
    for (key in styles || {}) {
        el.style.setProperty(key, styles[key]);
    }
    return el;
}

/*
 * Where each language sits down the diagram.
 *
 * This is d3's scalePoint with its default padding and alignment, which is all
 * the scale the arc diagram ever used: n points spread evenly across the
 * range, the first and last sitting on its ends. Written out because pulling
 * in half a megabyte of d3 to divide a number by another was not a good
 * trade, and because the one case worth getting right is easy to lose — a
 * single language, where there is no gap to divide and the point is centred
 * rather than stacked against the top edge.
 */
function wdpropPointScale(count, span) {
    var step = span / Math.max(1, count - 1);
    var origin = (span - step * (count - 1)) / 2;
    return function (index) {
        return origin + step * index;
    };
}

function visualizePath(languageData) {
    //Wikidata supported languages
    //Reference: https://www.d3-graph-gallery.com/graph/arc_basic.html

    var vizTypes = [
        { key: "labels", containerId: "pathviz-labels", color: "#1B80CF", emptyMsg: "No label translations recorded." },
        { key: "descriptions", containerId: "pathviz-descriptions", color: "#E67E22", emptyMsg: "No description translations recorded." },
        { key: "aliases", containerId: "pathviz-aliases", color: "#27AE60", emptyMsg: "No alias translations recorded." }
    ];

    vizTypes.forEach(function (viz) {
        var data = languageData[viz.key];
        var container = document.getElementById(viz.containerId);
        if (!container) return;

        // Show empty message if no data
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="pathviz-empty">' + viz.emptyMsg + '</p>';
            return;
        }

        // Clean whitespace from entries
        data = data.map(function (d) { return d.replace(/\s+/g, '').trim(); });

        // Deduplicate and sort for y-axis
        var languageSet = new Set();
        data.forEach(function (l) { languageSet.add(l); });
        var languages = Array.from(languageSet);
        languages.sort();

        var labelMargin = 0;
        languages.forEach(function (l) { if (l.length > labelMargin) labelMargin = l.length; });
        var leftMargin = Math.max(90, labelMargin * 7.5 + 20);

        var height = languages.length > 50 ? languages.length * 15 : languages.length * 20;
        var width = Math.max(600, leftMargin + 350);

        var svgRoot = wdpropSvg("svg", { width: width, height: height + 10 });
        container.appendChild(svgRoot);

        // Define arrow marker in defs (must be child of svg, not g)
        var defs = wdpropSvg("defs");
        var marker = wdpropSvg("marker", {
            id: "arrowhead-" + viz.key,
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 5,
            markerHeight: 5,
            orient: "auto-start-reverse"
        });
        marker.appendChild(wdpropSvg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: viz.color }));
        defs.appendChild(marker);
        svgRoot.appendChild(defs);

        var svg = wdpropSvg("g", { transform: "translate(10, 5)" });
        svgRoot.appendChild(svg);

        var scale = wdpropPointScale(languages.length, height - 5);

        /* Every language's position, by name, so the arcs can look them up. */
        var x = {};
        languages.forEach(function (language, index) {
            x[language] = scale(index);
        });

        /*
         * Drawn in four passes rather than one per language, because SVG has
         * no z-index and paints in document order: the sequence numbers have
         * to be written after the arcs to stay readable where an arc passes
         * through one.
         */

        // Nodes
        languages.forEach(function (language) {
            svg.appendChild(wdpropSvg("circle",
                { cy: x[language], cx: leftMargin, r: 4 },
                { fill: viz.color }));
        });

        // Language labels
        languages.forEach(function (language) {
            var label = wdpropSvg("text",
                { y: x[language], x: leftMargin - 10 },
                { "text-anchor": "end", "font-size": "12px", fill: "var(--text-primary)" });
            label.textContent = language;
            svg.appendChild(label);
        });

        // Draw arcs with direction arrows, one per consecutive pair in the path
        for (var i = 0; i < data.length - 1; i++) {
            var start = x[data[i]];
            var end = x[data[i + 1]];
            if (start === end) continue; // Skip self-loops

            var arcInflectionPoint = Math.abs(start - end) > 400 ? (start - end) / 1.2 : (start - end) / 2;
            var d = ['M', leftMargin, start,
                'A',
                arcInflectionPoint, ',',
                arcInflectionPoint, 0, 0, ',',
                start < end ? 1 : 0, leftMargin, ',', end
            ].join(' ');

            svg.appendChild(wdpropSvg("path",
                {
                    d: d,
                    stroke: viz.color,
                    "stroke-width": "1.5",
                    "marker-end": "url(#arrowhead-" + viz.key + ")"
                },
                { fill: "none" }));
        }

        // Sequence numbers on the nodes: where each language first appears
        var firstOccurrence = {};
        data.forEach(function (d, idx) {
            if (!(d in firstOccurrence)) firstOccurrence[d] = idx + 1;
        });
        languages.forEach(function (language) {
            var seq = wdpropSvg("text",
                { y: x[language] - 7, x: leftMargin },
                { "text-anchor": "middle", "font-size": "9px", fill: viz.color, "font-weight": "bold" });
            seq.textContent = firstOccurrence[language];
            svg.appendChild(seq);
        });
    });
}

function createDivProperties(divId, json) {
    const { head: { vars }, results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    total.innerHTML = wdpropText("js.totalProperties", [results.bindings.length]);
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
    total.innerHTML = wdpropText("js.totalClasses", [results.bindings.length]);
    properties.appendChild(total);

    let table = document.createElement("table");
    table.setAttribute("class", "alternate");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.item");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.classLabel");
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
    total.innerHTML = wdpropText("js.totalProperties", [results.bindings.length]);
    properties.appendChild(total);

    let table = document.createElement("table");
    table.setAttribute("class", "alternate");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.property");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.propertyLabel");
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
    total.innerHTML = wdpropText("js.translationStatistics");
    while (properties.hasChildNodes()) {
        properties.removeChild(properties.lastChild);
    }
    properties.appendChild(total);
    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.language");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.property");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.label");
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
    td.innerHTML = wdpropText("js.projects");
    th.appendChild(td);
    table.appendChild(th);

    td = document.createElement("th");
    td.innerHTML = wdpropText("js.link");
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
        let textF = document.createTextNode(wdpropText("js.next"));
        let textL = document.createTextNode(wdpropText("js.next"));
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
    total.innerHTML = wdpropText("js.totalProperties", [results.bindings.length]);
    while (properties.hasChildNodes()) {
        properties.removeChild(properties.lastChild);
    }
    properties.appendChild(total);
    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.property");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.label");
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
    total.innerHTML = wdpropText("js.totalProperties", [results.bindings.length]);
    properties.appendChild(total);

    let table = document.createElement("table");
    let th = document.createElement("tr");
    let td = document.createElement("th");
    td.innerHTML = wdpropText("js.property");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.value");
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
    total.innerHTML = wdpropText("js.totalLanguages", [results.bindings.length]);
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
    total.innerHTML = wdpropText("js.totalProperties", [results.bindings.length]);
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

/*
 * ===========================================================================
 * What a section shows while it has no results
 * ===========================================================================
 *
 * Every section of every page is filled by one query, and until now only one
 * of the three possible outcomes was accounted for. A query that returned
 * nothing left an empty box with no way to tell that from a query still
 * running, and a query that failed — Wikidata timing out, rate limiting, or
 * simply no network — left the spinner turning for good, because nothing
 * caught the rejection.
 */

function wdpropClear(div) {
    while (div.firstChild) {
        div.removeChild(div.firstChild);
    }
}

/*
 * The placeholder shown while a query runs. Bars the shape of the rows that
 * are coming, rather than a spinner: the section keeps its height, so the
 * page stops jumping when results arrive, and the reader can see what kind of
 * thing to expect. The text is there for screen readers, which have nothing
 * to make of the bars.
 */
function wdpropShowLoading(div) {
    wdpropClear(div);

    let skeleton = document.createElement("div");
    skeleton.setAttribute("class", "wdp-skeleton");
    skeleton.setAttribute("role", "status");
    skeleton.setAttribute("aria-label", wdpropText("js.fetching"));

    for (let i = 0; i < 5; i++) {
        let bar = document.createElement("div");
        bar.setAttribute("class", "wdp-skeleton-bar");
        skeleton.appendChild(bar);
    }

    div.appendChild(skeleton);
}

function wdpropShowEmpty(div) {
    wdpropClear(div);

    let empty = document.createElement("p");
    empty.setAttribute("class", "wdp-empty");
    empty.appendChild(document.createTextNode(wdpropText("js.noResults")));
    div.appendChild(empty);
}

/*
 * A failure the reader can act on: what went wrong, and a way to ask again
 * without losing the page they are on. Most of these are a timeout on a
 * heavy query, where asking again is exactly the right move.
 */
function wdpropShowError(div, reason, again) {
    wdpropClear(div);

    let box = document.createElement("div");
    box.setAttribute("class", "wdp-query-error");
    box.setAttribute("role", "alert");

    let text = document.createElement("p");
    text.appendChild(document.createTextNode(wdpropText("js.failed", [reason])));
    box.appendChild(text);

    if (again) {
        let retry = document.createElement("button");
        retry.setAttribute("type", "button");
        retry.setAttribute("class", "wdp-button");
        retry.appendChild(document.createTextNode(wdpropText("js.retry")));
        retry.addEventListener("click", again);
        box.appendChild(retry);
    }

    div.appendChild(box);
}

/*
 * A SPARQL answer with no rows. Checked before rendering rather than left to
 * each of the twenty-odd render functions, none of which said anything when
 * handed nothing.
 */
function wdpropHasNoRows(json) {
    return !!(json && json.results && Array.isArray(json.results.bindings) &&
        json.results.bindings.length === 0);
}

/*
 * Why a request failed, in words rather than as an exception. The message is
 * shown to the reader, so it says what happened, not where in the code.
 */
function wdpropReason(error) {
    if (error && error.wdpropStatus) {
        return wdpropText("js.failedStatus", [error.wdpropStatus]);
    }
    return wdpropText("js.failedNetwork");
}

/* Rejects on anything that is not a usable response, so one catch covers all. */
function wdpropReadJson(response) {
    if (!response.ok) {
        let error = new Error("HTTP " + response.status);
        error.wdpropStatus = response.status;
        throw error;
    }
    return response.json();
}

/*
 * ===========================================================================
 * Long tables
 * ===========================================================================
 *
 * A language missing translations for several thousand properties produced
 * several thousand rows in one table: slow to lay out, and impossible to
 * work through or to say anything about where you had got to.
 *
 * The rows are all present — they have been fetched, and searching the page
 * still needs them — so this shows them a page at a time rather than asking
 * for them a page at a time. That keeps a bookmarked address meaning what it
 * did before, which server-side paging would not.
 */

var wdpropRowsPerPage = 50;

/* The rows of a table, whether or not the markup wrapped them in a tbody. */
function wdpropTableRows(table) {
    let rows = [];
    for (let i = 0; i < table.children.length; i++) {
        let child = table.children[i];
        if (child.tagName === "TR") {
            rows.push(child);
        } else if (child.tagName === "TBODY" || child.tagName === "THEAD") {
            for (let j = 0; j < child.children.length; j++) {
                rows.push(child.children[j]);
            }
        }
    }
    return rows;
}

/* A heading row is one whose cells are th; the rest carry the data. */
function wdpropIsHeaderRow(row) {
    return !!(row.children.length && row.children[0].tagName === "TH");
}

function wdpropPaginateTable(table) {
    let body = wdpropTableRows(table).filter(function (row) {
        return !wdpropIsHeaderRow(row);
    });

    if (body.length <= wdpropRowsPerPage || table.parentNode == null) {
        return;
    }

    let pages = Math.ceil(body.length / wdpropRowsPerPage);

    /* The control is in pager.js; what a page means is decided here. */
    let pager = window.WDProp.pager({
        previousText: wdpropText("js.previous"),
        nextText: wdpropText("js.next"),
        onChange: show
    });

    function show(page) {
        let from = page * wdpropRowsPerPage;
        let to = from + wdpropRowsPerPage;

        for (let i = 0; i < body.length; i++) {
            body[i].style.display = (i >= from && i < to) ? "" : "none";
        }

        pager.update(page, pages, wdpropText("js.pageOf",
            [page + 1, pages, Math.min(to, body.length), body.length]));
    }

    show(0);
    table.parentNode.insertBefore(pager.element, table.nextSibling);
}

/*
 * Pages every long table a section has just rendered.
 *
 * A section hidden by the page's own script — the classes and WikiProjects
 * pages render into a hidden table and then virtualise it themselves — is
 * left alone: paging what nobody sees would be work for nothing.
 */
function wdpropPaginate(container) {
    if (container.style && container.style.display === "none") {
        return;
    }

    let tables = container.querySelectorAll("table");
    for (let i = 0; i < tables.length; i++) {
        wdpropPaginateTable(tables[i]);
    }
}

function queryWikidata(sparqlQuery, func, divId) {
    /*
     * Following script is a modified form of automated
     * script generated from Wikidata Query services
     */
    let div = document.getElementById(divId);
    if (div == null) {
        return;
    }

    wdpropShowLoading(div);

    fullUrl = endpointurl + '?query=' + encodeURIComponent(sparqlQuery) + "&format=json";
    showQuery(sparqlQuery, divId);
    headers = { 'Accept': 'application/sparql-results+json' };

    fetch(fullUrl, { headers }).then(wdpropReadJson).then(json => {
        wdpropClear(div);
        if (wdpropHasNoRows(json)) {
            wdpropShowEmpty(div);
            return;
        }
        func(divId, json);
        wdpropPaginate(div);
    }).catch(error => {
        wdpropShowError(div, wdpropReason(error), function () {
            queryWikidata(sparqlQuery, func, divId);
        });
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
        queryWikidata(fillQuery(allClassesQuery, { language: language }),
            createDivClasses, "propertyClasses");
    } else {
        queryWikidata(fillQuery(allClassesWithPropertyQuery, {
            language: language,
            property: property
        }), createDivClasses, "propertyClasses");
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
    let textURL = document.createTextNode(wdpropText("js.url"));
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
    total.innerHTML = wdpropText("page.countLabels");
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
    total.innerHTML = wdpropText("page.countDescriptions");
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
    total.innerHTML = wdpropText("page.countAvailableAliases");
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
    const forClass = fillQuery(translationStatisticsForClassQuery, { class: className });

    queryWikidata(fillQuery(forClass, { translationType: "rdfs:label" }),
        createDivTranslatedLabelsCount, "translatedLabelsCount");
    queryWikidata(fillQuery(forClass, { translationType: "schema:description" }),
        createDivTranslatedLabelsCount, "translatedDescriptionsCount");
    queryWikidata(fillQuery(forClass, { translationType: "skos:altLabel" }),
        createDivTranslatedLabelsCount, "translatedAliasesCount");
}

function getTranslationStatisticsForWikiProject(wdproperties) {
    wikiprojectProperties = wdproperties;
    const forProject = fillQuery(translationStatisticsForWikiProjectQuery, { wdproperties: wdproperties });

    queryWikidata(fillQuery(forProject, { translationType: "rdfs:label" }),
        createDivTranslatedLabelsCount, "translatedLabelsCount");
    queryWikidata(fillQuery(forProject, { translationType: "schema:description" }),
        createDivTranslatedLabelsCount, "translatedDescriptionsCount");
    queryWikidata(fillQuery(forProject, { translationType: "skos:altLabel" }),
        createDivTranslatedLabelsCount, "translatedAliasesCount");
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
    total.innerHTML = wdpropText("js.totalDatatypes", [results.bindings.length]);
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
    const forClass = fillQuery(propertiesForClassRequiringTranslationQuery, {
        class: propertyClass,
        language: language
    });

    queryWikidata(fillQuery(forClass, { translationType: "rdfs:label" }),
        createDivProperties, "propertyLabelsNeedingTranslation");
    queryWikidata(fillQuery(forClass, { translationType: "schema:description" }),
        createDivProperties, "propertyDescriptionsNeedingTranslation");
    queryWikidata(fillQuery(forClass, { translationType: "skos:altLabel" }),
        createDivProperties, "missingPropertyAliases");
}

function getSpecifiedPropertiesRequiringTranslation(property) {
    let language = getValueFromURL("language=([^&#=]*)", "en")
    getLanguage(language);
    const forProperty = fillQuery(specifiedPropertiesRequiringTranslationQuery, {
        property: property,
        language: language
    });

    queryWikidata(fillQuery(forProperty, { translationType: "rdfs:label" }),
        createDivProperties, "propertyLabelsNeedingTranslation");
    queryWikidata(fillQuery(forProperty, { translationType: "schema:description" }),
        createDivProperties, "propertyDescriptionsNeedingTranslation");
    queryWikidata(fillQuery(forProperty, { translationType: "skos:altLabel" }),
        createDivProperties, "missingPropertyAliases");
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
    datatypeCode.innerHTML = wdpropText("page.propsWithDatatype") + datatype;

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
    total.innerHTML = wdpropText("js.totalProperties", [count]);
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
    td.innerHTML = wdpropText("js.time");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("term.labels");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("term.descriptions");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("term.aliases");
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
                languageData["descriptions"].push(comment);
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
                languageData["aliases"].push(comment);
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
                languageData["aliases"].push(comment);
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
                languageData["descriptions"].push(comment);
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
                languageData["aliases"].push(comment);
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
                languageData["descriptions"].push(comment);
                languageData["aliases"].push(comment);
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
                languageData["labels"].push(comment);
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
                languageData["descriptions"].push(comment);
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
                languageData["aliases"].push(comment);
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
    percentageDiv.innerHTML = wdpropText("js.referencedStatements", [
        results.bindings[0]["referencecount"]["value"],
        results.bindings[0]["statementcount"]["value"],
        percentage
    ]);
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
    statementTotal.innerHTML = wdpropText("js.referenceStatements",
        [Object.keys(refs).length, results.bindings.length]);
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
    td.innerHTML = wdpropText("js.property");
    th.appendChild(td);
    td = document.createElement("th");
    td.innerHTML = wdpropText("js.numberOfStatements");
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
    statementTotal.innerHTML = wdpropText("js.totalEquivalent", [results.bindings.length]);
    references.appendChild(statementTotal);
}

function getLinks() {
    getReferences();
    getReferencesCount();
    getEquivalentProperties();
}
/*
 * There was a document.onkeydown here that took any Enter key anywhere on any
 * page, read the value of #headersearchtext and navigated to ./search.html.
 *
 * #headersearchtext existed on ten pages, all of them in subdirectories, and
 * was styled display:none on every one — so the box it read had never been
 * visible and was always empty. On the other thirty-one pages the element does
 * not exist at all, so the handler threw on every Enter key; on the ten it
 * navigated to ./search.html relative to a subdirectory, which is nowhere.
 *
 * Searching is done by the forms on search.html, which have always worked.
 */

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

/*
 * Theme Management
 *
 * The work is in theme.js, which runs before the page is painted; this is the
 * handler the toggle in the header calls. Applying the theme here as well
 * would be too late to matter and, when the two disagreed, wrong.
 */
function toggleTheme() {
    if (window.WDProp && window.WDProp.theme) {
        window.WDProp.theme.toggle();
    }
}

/*
 * The menu button, the theme switch, their keyboard handling and closing the
 * menu on a click elsewhere all moved to shell.js, which is what builds those
 * controls now. Wiring them here as well attached a second keydown listener to
 * each, so Enter on the theme switch toggled it twice and appeared to do
 * nothing at all.
 */

/*
 * ===========================================================================
 * Where you are
 * ===========================================================================
 *
 * The sidebar is written out again in the markup of every page rather than
 * generated once, so nothing in it says which entry is the current one. And a
 * page showing a single property, class or WikiProject is reached by a
 * bookmarked or shared link at least as often as by navigation, with nothing
 * on it pointing back to the listing it belongs to.
 *
 * Both are worked out here from the address: the current sidebar entry is
 * marked, and pages below a sidebar entry are given a breadcrumb.
 */

/*
 * The sidebar, in order. This is the only place it is written down: the list
 * used to be repeated in the markup of all thirty pages, which meant adding
 * or renaming an entry was a thirty-file edit, and the copies had already
 * begun to drift apart.
 */
var wdpropSections = [
    { file: "index.html",                key: "nav.dashboard" },
    { file: "translate.html",            key: "nav.translate" },
    { file: "campaign.html",             key: "nav.campaigns" },
    { file: "stale.html",                key: "nav.stale" },
    { file: "contributions.html",        key: "nav.contributions" },
    { file: "terminology.html",          key: "nav.terminology" },
    { file: "languages.html",            key: "nav.languages" },
    { file: "datatypes.html",            key: "nav.datatypes" },
    { file: "properties.html",           key: "nav.properties" },
    { file: "classes.html",              key: "nav.classes" },
    { file: "provenance.html",           key: "nav.provenance" },
    { file: "search.html",               key: "nav.search" },
    { file: "compare.html",              key: "nav.compare" },
    { file: "templates/translated.html", key: "nav.discussion" },
    { file: "wikiprojects.html",         key: "nav.wikiprojects" },
    { file: "offline.html",              key: "nav.offline" },
    { file: "wdprop.html",               key: "nav.about" }
];

/*
 * Pages that are not themselves sidebar entries.
 *
 *   under    the sidebar entry the page belongs beneath
 *   subject  the query parameter naming what the page is about, used as the
 *            last step of the breadcrumb
 *   label    a message key for that last step, for pages about no one thing
 */
var wdpropPagesBelow = {
    "property.html":           { under: "properties.html",   subject: "property" },
    "propertydesc.html":       { under: "properties.html",   label: "page.propsDescribing" },
    "class.html":              { under: "classes.html",      subject: "class" },
    "datatype.html":           { under: "datatypes.html",    subject: "datatype" },
    "language.html":           { under: "languages.html",    subject: "language" },
    "labels.html":             { under: "languages.html",    label: "page.labelsNeeding" },
    "descriptions.html":       { under: "languages.html",    label: "page.descriptionsNeeding" },
    "translated.html":         { under: "languages.html",    label: "page.translationStats" },
    "untranslated.html":       { under: "languages.html",    label: "page.missingStats" },
    "visualization.html":      { under: "languages.html",    label: "page.languageCodes" },
    "wikiproject.html":        { under: "wikiprojects.html", subject: "project" },
    "path.html":               { under: "provenance.html",   label: "page.pathOfTranslation" },
    "pathviz.html":            { under: "provenance.html",   label: "page.pathVisualization" },
    "propertyprovenance.html": { under: "provenance.html",   label: "page.statementsReferences" },
    "batch.html":              { under: "translate.html",    label: "batch.heading" }
};

/* The sidebar entries a page can sit beneath, named without their icon. */
var wdpropSectionNames = {
    "properties.html":   "crumb.properties",
    "classes.html":      "crumb.classes",
    "datatypes.html":    "crumb.datatypes",
    "languages.html":    "crumb.languages",
    "provenance.html":   "crumb.provenance",
    "wikiprojects.html": "crumb.wikiprojects",
    "translate.html":    "crumb.translate"
};

/*
 * Identifies a page from a path or a link, so that the address of the page
 * being shown and the href of a sidebar entry can be compared whatever form
 * either takes: "./index.html", "../properties.html", a full pathname, or the
 * bare "/" a web server hands out for the front page.
 *
 * The directory is dropped except for templates/, because that directory
 * holds a translated.html of its own and the root has another; on filename
 * alone the two are indistinguishable.
 */
function wdpropPageKey(path) {
    var raw = String(path || "").split(/[?#]/)[0];
    var parts = raw.split("/").filter(function (part) {
        return part && part !== "." && part !== "..";
    });

    /*
     * A path ending in a slash names a directory, and what is served for it is
     * that directory's index — so its last segment is the directory, not a
     * file. Taken as a file, WDProp installed at /wdprop/ and opened at its
     * root gave the key "wdprop", which matches no page, so the dashboard was
     * the one page whose sidebar entry was never marked.
     */
    var file = /\/$/.test(raw) || raw === "" ? "index.html" : (parts.pop() || "index.html");
    return parts.pop() === "templates" ? "templates/" + file : file;
}

/* The sidebar entry a page belongs to: itself, or the one it sits beneath. */
function wdpropSectionOf(pageKey) {
    var below = wdpropPagesBelow[pageKey];
    return below ? below.under : pageKey;
}

function wdpropValueFromSearch(search, name) {
    var found = new RegExp("[?&]" + name + "=([^&#]*)").exec(String(search || ""));
    if (!found) {
        return "";
    }
    try {
        return decodeURIComponent(found[1].replace(/\+/g, " ")).trim();
    } catch (e) {
        // A malformed escape must not cost the page its breadcrumb.
        return found[1];
    }
}

/*
 * What the last step of the breadcrumb should read. Datatypes and WikiProjects
 * arrive with a prefix that is the same on every one of them and so tells the
 * reader nothing: wikibase:WikibaseItem, Wikidata:WikiProject Sports.
 */
function wdpropSubjectLabel(name, value) {
    if (name === "datatype") {
        return value.replace(/^wikibase:/, "");
    }
    if (name === "project") {
        return value.replace(/^Wikidata:WikiProject\s*/, "");
    }
    return value;
}

/*
 * The trail for a page, as data: each step is either a message `key` or plain
 * `text`, with `file` on the steps that are links. Empty for a page that is
 * itself a sidebar entry, which needs no trail.
 */
function wdpropBreadcrumbTrail(pageKey, search) {
    var below = wdpropPagesBelow[pageKey];
    if (!below) {
        return [];
    }

    var trail = [{ file: "index.html", key: "crumb.home" }];

    var sectionKey = wdpropSectionNames[below.under];
    if (sectionKey) {
        trail.push({ file: below.under, key: sectionKey });
    }

    if (below.subject) {
        var value = wdpropValueFromSearch(search, below.subject);
        if (value) {
            trail.push({ text: wdpropSubjectLabel(below.subject, value), current: true });
        }
    } else if (below.label) {
        trail.push({ key: below.label, current: true });
    }

    return trail;
}

/*
 * Where wdprop.js was loaded from, which is the root of WDProp whatever
 * directory the page itself sits in. Pages under templates/ need it to link
 * back out, and cart.js and compose.js already look for it.
 */
var wdpropBase = (function () {
    var script = document.currentScript;
    if (script && script.src) {
        return script.src.replace(/wdprop\.js(\?.*)?$/, "");
    }
    return "./";
})();

window.WDPropPathPrefix = wdpropBase;

/*
 * Builds the sidebar and marks the entry for the page being shown.
 *
 * The markup keeps the landmark and its name; only the list of links is
 * built here. The links carry data-i18n as well as their text, so that
 * choosing another interface language retranslates them the same way it does
 * the rest of the page — i18n.js has already been over the document by the
 * time this runs.
 */
function wdpropMountSidebar() {
    var container = document.getElementById("sidebarlinks");
    if (!container || container.firstChild) {
        return;
    }

    var section = wdpropSectionOf(wdpropPageKey(window.location.pathname));
    var list = document.createElement("ul");

    wdpropSections.forEach(function (entry) {
        var item = document.createElement("li");
        var link = document.createElement("a");

        link.setAttribute("href", wdpropBase + entry.file);
        link.setAttribute("data-i18n", entry.key);
        link.appendChild(document.createTextNode(wdpropText(entry.key)));

        if (entry.file === section) {
            link.setAttribute("aria-current", "page");
            item.setAttribute("class", "wdp-current");
        }

        item.appendChild(link);
        list.appendChild(item);
    });

    container.appendChild(list);
}

/*
 * Puts the trail at the top of the content, ahead of everything else on the
 * page. The steps carry data-i18n so that changing the interface language
 * retranslates them; the text is also set here, because i18n.js has already
 * been over the page by the time this runs.
 */
function wdpropMountBreadcrumb() {
    var content = document.getElementById("content");
    if (!content) {
        return;
    }

    var trail = wdpropBreadcrumbTrail(
        wdpropPageKey(window.location.pathname), window.location.search);
    if (!trail.length) {
        return;
    }

    var nav = document.createElement("nav");
    nav.setAttribute("class", "wdp-breadcrumb");
    nav.setAttribute("data-i18n-label", "a11y.breadcrumb");
    nav.setAttribute("aria-label", wdpropText("a11y.breadcrumb"));

    var list = document.createElement("ol");

    trail.forEach(function (step) {
        var item = document.createElement("li");
        var cell = document.createElement(step.file ? "a" : "span");

        if (step.file) {
            cell.setAttribute("href", wdpropBase + step.file);
        }
        if (step.current) {
            cell.setAttribute("aria-current", "page");
        }
        if (step.key) {
            cell.setAttribute("data-i18n", step.key);
            cell.appendChild(document.createTextNode(wdpropText(step.key)));
        } else {
            cell.setAttribute("title", step.text);
            cell.appendChild(document.createTextNode(step.text));
        }

        item.appendChild(cell);
        list.appendChild(item);
    });

    nav.appendChild(list);
    content.insertBefore(nav, content.firstChild);
}

/*
 * ===========================================================================
 * Transient messages
 * ===========================================================================
 *
 * For an action whose result is not visible on the page — downloading the
 * batch, copying it to the clipboard — which otherwise finishes in silence.
 *
 * The region is put in place once and kept there: a live region that arrives
 * carrying its message is not reliably announced, because assistive software
 * has had no chance to start watching it.
 */
function wdpropToastRegion() {
    var region = document.getElementById("wdp-toast-region");
    if (region) {
        return region;
    }

    region = document.createElement("div");
    region.setAttribute("id", "wdp-toast-region");
    region.setAttribute("class", "wdp-toast-region");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
    return region;
}

/*
 * Shows a message that takes itself away again. `kind` is "error" for
 * something that did not work, which stays longer because it asks the reader
 * to do something about it.
 */
function wdpropToast(message, kind) {
    var region = wdpropToastRegion();
    var failed = (kind === "error");

    var toast = document.createElement("div");
    toast.setAttribute("class", failed ? "wdp-toast wdp-toast-error" : "wdp-toast");
    toast.appendChild(document.createTextNode(message));
    region.appendChild(toast);

    setTimeout(function () {
        toast.setAttribute("class", toast.getAttribute("class") + " wdp-toast-leaving");
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, failed ? 6000 : 4000);

    return toast;
}

window.WDProp = window.WDProp || {};
window.WDProp.toast = wdpropToast;

/*
 * Exposed for the tests, which exercise the path handling without a browser.
 */
window.WDProp.nav = {
    pageKey: wdpropPageKey,
    sectionOf: wdpropSectionOf,
    trail: wdpropBreadcrumbTrail
};

/*
 * Mount what the page needs before anyone looks at it.
 *
 * These scripts are deferred, so this file runs once the document has been
 * parsed and after shell.js has put the header and sidebar in place — the
 * sidebar links have somewhere to go. i18n.js has been over the page by then
 * too, which is why the entries can take their translated text directly.
 *
 * The readyState check remains for the case where wdprop.js is loaded some
 * other way, from a page that does not defer it.
 */
function wdpropMountPage() {
    wdpropMountSidebar();
    wdpropMountBreadcrumb();
    wdpropToastRegion();
}

window.WDProp.ready(wdpropMountPage);