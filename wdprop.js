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

/*
 * The properties of one datatype — the identifiers, and only those.
 *
 * What each property is called is fetched a page at a time from the entity
 * API, for the fifty rows on show; see the note above wdpropPropertyRecord for
 * why, and what asking the query service for all of it costs.
 *
 * Usage is not asked for either. wikibase:statements sits on the property node
 * and would cost nothing, but it counts the statements on the property's own
 * page — its constraints, formatter URLs and equivalences — not the statements
 * across Wikidata that use it. The two are unrelated: P31 carries 240 and is
 * used 119 million times, while P2860, the most used property on Wikidata,
 * carries 27. The real figure comes from usage.js, likewise a page at a time.
 */
propertiesWithDatatypeQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT DISTINCT ?property
WHERE
{
{{where}}
}
ORDER by ?property
`;

/*
 * The body of the datatype query, shared with the count of how many of those
 * properties still need a translation. Kept in one place so the two can never
 * come to be asking about different sets — a heading counting one selection
 * over a table showing another would be worse than no heading.
 */
propertiesWithDatatypeWhere =
    `    ?property rdf:type wikibase:Property;
              wikibase:propertyType {{datatype}}.`;

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

/*
 * The classes that group properties: the items, and only those.
 *
 * The label this used to carry cost more than everything else in the query.
 * Asked with it, the three thousand classes take twenty-nine seconds; without
 * it, thirteen — and the labels themselves were only 67 KB of the 433 KB that
 * came back, so this is time, not payload. What each class is called is
 * fetched from the entity API for the rows on show, as it is everywhere else.
 */
allClassesQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT DISTINCT ?item
{
  {
    SELECT ?item
    WHERE
    {
      ?item wdt:P1963 [].
    }
  }
  UNION
  {
    SELECT ?item
    WHERE
    {
      ?property a wikibase:Property;
                (wdt:P31|wdt:P279) ?item.
    }
  }
}
ORDER by ?item
`;

allClassesWithPropertyQuery =
    `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT DISTINCT ?item
{
  {
    SELECT ?item
    WHERE
    {
      ?item wdt:P1963 wd:{{property}}.
    }
  }
  UNION
  {
    SELECT ?item
    WHERE
    {
      wd:{{property}} (wdt:P31|wdt:P279) ?item.
    }
  }
}
ORDER by ?item
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

/*
 * The property number space, live properties and gaps alike.
 *
 * This one stays a wall of chips, because here the wall is the point: the gaps
 * are the properties that were deleted, and seeing them among their neighbours
 * is the whole of what the section shows. A table would say the same thing
 * worse.
 *
 * What it no longer does is stop at a hundred in silence. It still stops —
 * fourteen thousand chips is not a picture anyone can read, and it is a great
 * many elements — but the heading now says where the map reaches rather than
 * implying it covers everything.
 */
function createDivAllProperties(divId, json) {
    const { results } = json;
    let properties = document.getElementById(divId);
    let total = document.createElement("h3");
    properties.appendChild(total);

    let propertySet = new Set();
    let maxPropertyId = 0;
    for (const result of results.bindings) {
        let propertyId = Number(
            result['property'].value.replace("http://www.wikidata.org/entity/P", ""));
        propertySet.add(propertyId);
        if (propertyId > maxPropertyId) {
            maxPropertyId = propertyId;
        }
    }

    let shownTo = Math.min(maxPropertyCount, maxPropertyId);
    total.innerHTML = wdpropText("js.propertyNumberSpace",
        [shownTo, maxPropertyId, results.bindings.length]);

    for (let i = 1; i <= shownTo; i++) {
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

/*
 * The properties still needing a translation, on the pages that list them by
 * language, by class or by a single property.
 *
 * These queries ask only for ?property — they select on a label being absent,
 * so there is nothing in the target language to show — and the table is
 * correspondingly narrow. It is still the table rather than the wall of chips
 * this used to draw: the chips stopped at a hundred without saying so, under a
 * heading that counted the whole result.
 */
function createDivProperties(divId, json) {
    return createDivPropertyTable(divId, json);
}

/*
 * The property classes.
 *
 * This page used to render a table into a hidden div, have classes.js parse
 * that table's HTML back into objects, and re-render them into a bespoke
 * virtual scroller — a round trip through the DOM to arrive where the data
 * had started. It is the same table as every other listing now, paged the
 * same way, with the class names fetched for the rows on show.
 *
 * That last part matters more here than anywhere else: of the 3,082 classes,
 * 2,610 have no Tamil label, and the old table printed the item identifier in
 * the label column when one was missing — so five rows in six read as though
 * the class were named "Q21451142".
 */
function createDivClasses(divId, json) {
    return wdpropEntityTable(divId, json, wdpropClassListing);
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

/*
 * ===========================================================================
 * Listing properties
 * ===========================================================================
 *
 * Every page that lists properties used to render the same thing: a wall of
 * floating chips carrying a P-number and nothing else. That was wrong in three
 * separate ways, and the same three ways on each page.
 *
 * It could not say what a property was. A translator looking at P4765 has no
 * way to judge it without opening it, and the SPARQL behind the page did not
 * even ask for the label, so the chip could not have shown one.
 *
 * It cut the list at maxPropertyCount and said nothing. The heading counted
 * every row the query returned, then a hundred were drawn — so a datatype with
 * two hundred properties announced two hundred and showed half.
 *
 * It cut the wrong hundred. The loop walked the P-number space from P1 and
 * took the first hundred it recognised, discarding the order the query had
 * asked for. That is the hundred oldest properties: neither the most used nor
 * the least translated, and no use to anyone.
 *
 * What follows is one table renderer for all of those pages. It shows every
 * row — queryWikidata hands the result to wdpropPaginate, which pages anything
 * long — and it adapts to the query it is given, so a caller that asks only
 * for ?property still gets a usable table, and one that also asks for labels,
 * descriptions or statement counts gets those columns too.
 */

/*
 * ---------------------------------------------------------------------------
 * Filling a row from the entity API
 * ---------------------------------------------------------------------------
 *
 * The listing queries ask Wikidata for identifiers and nothing else, and the
 * terms that make a row readable are fetched afterwards, fifty at a time, for
 * the rows actually on show. The reason is what the alternative costs: asked
 * for the external identifiers with their labels and descriptions, the query
 * service answers with four and a half megabytes after twenty seconds, and a
 * reader sees fifty rows of it. The identifiers alone are 1.25 MB in four
 * seconds, and each page of fifty is a further 13 KB in half a second.
 *
 * Fetching them from the entity API rather than the query service also settles
 * a question the label service cannot answer. That service falls back to
 * English, so it cannot say whether a label exists in the language being
 * worked in — asked for the external identifiers in Tamil it names all ten
 * thousand of them, one of which has a Tamil label. wbgetentities returns
 * exactly the languages asked for, so a missing one is missing.
 */

/* The entity API takes fifty identifiers per request from an anonymous
 * caller, which is also how many rows a page of a table holds. */
var wdpropTermsPerRequest = 50;

function wdpropPropertyRecord(binding, variable) {
    return {
        id: binding[variable || 'property'].value
            .replace("http://www.wikidata.org/entity/", "")
    };
}

/*
 * The terms of up to fifty properties, in the language being worked in and in
 * English. Resolves to the API's entity map; a request that fails resolves to
 * nothing rather than rejecting, so one bad page cannot break the table.
 */
function wdpropFetchTerms(ids, language) {
    let languages = (language === "en") ? "en" : language + "|en";
    let url = "https://www.wikidata.org/w/api.php?action=wbgetentities" +
        "&ids=" + encodeURIComponent(ids.join("|")) +
        "&props=" + encodeURIComponent("labels|descriptions") +
        "&languages=" + encodeURIComponent(languages) +
        "&format=json&origin=*";

    return fetch(url).then(function (response) {
        if (!response.ok) {
            throw new Error(String(response.status));
        }
        return response.json();
    }).then(function (json) {
        return json.entities || {};
    }).catch(function () {
        return {};
    });
}

/*
 * Puts one property's terms into its row, and says which of three states it
 * is in: named in the language being worked in, named only in English, or not
 * named at all.
 */
function wdpropShowTerms(row, entity, language) {
    let labels = (entity && entity.labels) || {};
    let descriptions = (entity && entity.descriptions) || {};

    let target = labels[language];
    let fallback = labels["en"];

    let cell = row.wdpropLabelCell;
    wdpropClear(cell);
    cell.setAttribute("class", target || fallback ? "propertylabel" : "missingvalue");

    if (target) {
        cell.appendChild(document.createTextNode(target.value));
    } else if (fallback) {
        cell.appendChild(document.createTextNode(fallback.value));
        /*
         * The label is readable, but it is the English one and the row is not
         * done. Said in words rather than left to the row's tint, which a
         * monochrome screen and a screen reader both lose.
         */
        let note = document.createElement("span");
        note.setAttribute("class", "missingvalue fallbacklabel");
        note.appendChild(document.createTextNode(" " + wdpropText("js.fallbackLabel")));
        cell.appendChild(note);
    } else {
        cell.appendChild(document.createTextNode(wdpropText("js.notInLanguage")));
    }

    if (!target) {
        row.setAttribute("class", "untranslatedrow");
    }

    let described = descriptions[language] || descriptions["en"];
    wdpropClear(row.wdpropDescriptionCell);
    if (described) {
        row.wdpropDescriptionCell.appendChild(
            document.createTextNode(described.value));
    }
}

/*
 * Fills the label and description of the rows currently on show.
 *
 * Rows already filled are skipped, so paging back and forth costs nothing
 * beyond the first visit to each page.
 */
function wdpropFillTerms(rows) {
    let pending = rows.filter(function (row) {
        return row.wdpropLabelCell && !row.wdpropTermsFilled;
    });
    if (pending.length === 0) {
        return;
    }

    let language = wdpropLabelLanguage();

    for (let from = 0; from < pending.length; from += wdpropTermsPerRequest) {
        let batch = pending.slice(from, from + wdpropTermsPerRequest);
        let ids = batch.map(function (row) { return row.wdpropEntityId; });

        batch.forEach(function (row) { row.wdpropTermsFilled = true; });

        wdpropFetchTerms(ids, language).then(function (entities) {
            for (const row of batch) {
                wdpropShowTerms(row, entities[row.wdpropEntityId], language);
            }
        });
    }
}

/*
 * Fills the usage column of the rows currently on show.
 *
 * How often a property is used cannot come out of the same query as the
 * labels — see the note on wdpropPropertyRecord — so it is fetched
 * afterwards, from usage.js, which reads it from the search API and caches it
 * for a day.
 *
 * Only the rows on show are asked for. A datatype can hold several thousand
 * properties, and counting all of them would mean thousands of requests to
 * fill fifty cells. Rows already filled are skipped, so paging back and forth
 * costs nothing.
 */
function wdpropFillUsage(rows) {
    if (!(window.WDProp && window.WDProp.usage)) {
        return;
    }

    let pending = rows.filter(function (row) {
        return row.wdpropUsageCell && !row.wdpropUsageCell.wdpropFilled;
    });
    if (pending.length === 0) {
        return;
    }

    let ids = pending.map(function (row) { return row.wdpropEntityId; });

    window.WDProp.usage.counts(ids).then(function (counts) {
        for (const row of pending) {
            let cell = row.wdpropUsageCell;
            let count = counts[row.wdpropEntityId];
            cell.wdpropFilled = true;
            wdpropClear(cell);
            if (typeof count === "number") {
                cell.setAttribute("title", count.toLocaleString());
                cell.appendChild(document.createTextNode(
                    window.WDProp.usage.format(count)));
            } else {
                /*
                 * A count that could not be read is left blank rather than
                 * shown as zero, which would read as "never used".
                 */
                cell.setAttribute("class", "propertyusage missingvalue");
                cell.appendChild(document.createTextNode(
                    wdpropText("js.unavailable")));
            }
        }
    });
}

/*
 * The language to ask the label service for.
 *
 * A page reached with ?language= is being read about that language, so its
 * labels should be in it; otherwise the reader's own interface language is
 * the best guess. English is appended by the caller as the fallback.
 */
function wdpropLabelLanguage() {
    let fromUrl = getValueFromURL("language=([^&#=]*)", "");
    if (fromUrl !== "") {
        return fromUrl;
    }
    return (window.WDProp && window.WDProp.i18n)
        ? window.WDProp.i18n.current() : "en";
}

function wdpropHeaderCell(row, key) {
    let cell = document.createElement("th");
    cell.innerHTML = wdpropText(key);
    row.appendChild(cell);
    return cell;
}

/*
 * Lists properties as a table, with whichever of label, description and usage
 * the query supplied. Returns the records it drew, so a caller can offer an
 * action over them — the datatype page uses this to link the properties still
 * needing a translation into the workbench.
 */
/*
 * How a listing of one kind of entity differs from another: what the query
 * called it, where a row links, and what its identifier column is headed.
 * Everything else — the lazy terms, the paging, the marking of what the
 * language has not reached — is the same for all of them.
 */
var wdpropPropertyListing = {
    variable: "property",
    href: "property.html?property=",
    idHeader: "js.property",
    total: "js.totalProperties",
    usage: true
};

var wdpropClassListing = {
    variable: "item",
    href: "class.html?class=",
    idHeader: "js.item",
    total: "js.totalClasses",
    /* How often a class is used is not a question usage.js can answer: it
     * counts statements using a property, which a class is not. */
    usage: false
};

function wdpropEntityTable(divId, json, listing) {
    const { results } = json;
    let container = document.getElementById(divId);

    let records = results.bindings.map(function (binding) {
        return wdpropPropertyRecord(binding, listing.variable);
    });

    /*
     * The heading counts the rows straight away. How many of them the language
     * being worked in has not reached is a question about the whole set, not
     * about the page on show, so it cannot come from the rows — it is asked
     * separately by wdpropCountUntranslated and appended when it arrives.
     */
    let total = document.createElement("h3");
    total.innerHTML = wdpropText(listing.total, [records.length]);
    container.appendChild(total);
    container.wdpropTotalHeading = total;

    let table = document.createElement("table");
    table.setAttribute("class", "alternate propertytable");

    let head = document.createElement("tr");
    wdpropHeaderCell(head, listing.idHeader);
    wdpropHeaderCell(head, "js.label");
    wdpropHeaderCell(head, "js.description");

    /* Usage comes from usage.js, which not every page loads. */
    let hasUsage = listing.usage && !!(window.WDProp && window.WDProp.usage);
    if (hasUsage) {
        wdpropHeaderCell(head, "js.usage");
    }
    table.appendChild(head);

    for (const record of records) {
        let row = document.createElement("tr");
        row.wdpropEntityId = record.id;

        let cell = document.createElement("td");
        cell.setAttribute("class", "property");
        let link = document.createElement("a");
        link.setAttribute("href", listing.href + record.id);
        link.appendChild(document.createTextNode(record.id));
        cell.appendChild(link);
        row.appendChild(cell);

        /*
         * The cells below are placeholders. They are held on the row so that
         * the fill functions, which are handed rows by the pager and know
         * nothing of this loop, can find them.
         */
        cell = document.createElement("td");
        cell.appendChild(document.createTextNode("\u2026"));
        row.wdpropLabelCell = cell;
        row.appendChild(cell);

        cell = document.createElement("td");
        cell.setAttribute("class", "propertydescription");
        row.wdpropDescriptionCell = cell;
        row.appendChild(cell);

        if (hasUsage) {
            cell = document.createElement("td");
            cell.setAttribute("class", "propertyusage");
            cell.appendChild(document.createTextNode("\u2026"));
            row.wdpropUsageCell = cell;
            row.appendChild(cell);
        }

        table.appendChild(row);
    }

    /*
     * Called by wdpropPaginateTable with the rows of each page as it is
     * reached, and once for the first page. A table too short to page is
     * filled the same way, since the pager never runs for it.
     */
    table.wdpropOnPage = wdpropFillRows;

    container.appendChild(table);
    return records;
}

function createDivPropertyTable(divId, json) {
    return wdpropEntityTable(divId, json, wdpropPropertyListing);
}

/* Everything a page of rows needs fetching for it, once it is on show. */
function wdpropFillRows(rows) {
    wdpropFillTerms(rows);
    wdpropFillUsage(rows);
}

/*
 * How many of a listing's properties the language being worked in has not
 * reached, added to the heading when it is known.
 *
 * This is the one thing that cannot be answered a page at a time: it is a
 * count over the whole set, and it is what makes the page actionable — it
 * says how much work is left, and the workbench link offers exactly that set.
 * Asked on its own it is a few hundred bytes, and it runs beside the listing
 * rather than after it.
 *
 * A count that cannot be obtained simply never appears. The heading is still
 * correct without it, and a figure that was not fetched is never shown.
 */
function wdpropCountUntranslated(divId, whereClause) {
    let language = wdpropLabelLanguage();
    let sparqlQuery = fillQuery(
        `PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT (COUNT(DISTINCT ?property) AS ?untranslated)
WHERE
{
{{where}}
    FILTER NOT EXISTS { ?property rdfs:label ?t FILTER (lang(?t) = "{{language}}") }
}
`, { where: whereClause, language: language });

    fetch(endpointurl + '?query=' + encodeURIComponent(sparqlQuery) + "&format=json",
        { headers: { 'Accept': 'application/sparql-results+json' } })
        .then(wdpropReadJson).then(function (json) {
            let rows = json.results.bindings;
            let count = rows.length ? Number(rows[0]['untranslated'].value) : 0;
            if (!count) {
                return;
            }

            let container = document.getElementById(divId);
            if (!container) {
                return;
            }

            if (container.wdpropTotalHeading) {
                let note = document.createElement("span");
                note.setAttribute("class", "propertytablenote");
                note.innerHTML = wdpropText("js.withoutLabel", [count]);
                container.wdpropTotalHeading.appendChild(note);
            }

            /* The offer was made without a figure; now it has one. */
            if (container.wdpropWorkbenchLink) {
                wdpropClear(container.wdpropWorkbenchLink);
                container.wdpropWorkbenchLink.appendChild(
                    document.createTextNode(wdpropText("js.translateThese", [count])));
            }
        }).catch(function () {
            /* Nothing to say: the heading stands without it. */
        });
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

/*
 * Tells a table which of its rows are now on show, if it asked to be told.
 *
 * A table can carry work that is worth doing only for the rows being looked
 * at — the property tables fetch a usage count per row, which would be
 * thousands of requests if done for a whole datatype at once.
 */
function wdpropRowsShown(table, rows) {
    if (typeof table.wdpropOnPage === "function") {
        table.wdpropOnPage(rows);
    }
}

/*
 * Pages a table, or re-pages it over a chosen subset of its rows.
 *
 * Filtering goes through the subset form. The rows that match become the whole
 * of what there is to move through, so the number of pages, the position that
 * is read out, and which rows the fill functions are told about all have to be
 * worked out again — a filter that only hid rows would leave a control paging
 * through gaps and announcing a total that no longer existed.
 */
function wdpropPaginateTable(table, subset) {
    let all = wdpropTableRows(table).filter(function (row) {
        return !wdpropIsHeaderRow(row);
    });
    let body = subset || all;

    /* Anything outside the subset is hidden, and paging never reaches it. */
    if (subset) {
        for (const row of all) {
            row.style.display = "none";
        }
    }

    /*
     * A control left over from an earlier pass would page rows that are no
     * longer part of the set.
     */
    if (table.wdpropPagerElement) {
        let stale = table.wdpropPagerElement;
        table.wdpropPagerElement = null;
        if (stale.parentNode) {
            stale.parentNode.removeChild(stale);
        }
    }

    if (body.length <= wdpropRowsPerPage || table.parentNode == null) {
        /* Short enough to show whole: every row is on show, and stays so. */
        for (const row of body) {
            row.style.display = "";
        }
        wdpropRowsShown(table, body);
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

        wdpropRowsShown(table, body.slice(from, to));
    }

    show(0);
    table.parentNode.insertBefore(pager.element, table.nextSibling);
    table.wdpropPagerElement = pager.element;
}

/*
 * Narrows a table to the rows a test accepts, and pages what is left.
 *
 * The test is given the row, which carries the identifier it was built from,
 * so a caller can match on that without reading it back out of the cell.
 */
function wdpropFilterTable(table, matches) {
    let body = wdpropTableRows(table).filter(function (row) {
        return !wdpropIsHeaderRow(row);
    });
    wdpropPaginateTable(table, body.filter(matches));
}

/*
 * Pages every long table a section has just rendered.
 *
 * A section hidden by the page's own script — the WikiProjects page renders
 * into a hidden table and then virtualises it itself — is left alone: paging
 * what nobody sees would be work for nothing.
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
    let property = getValueFromURL("property=([^&#=]*)", "");

    if (property == "" || property == undefined) {
        queryWikidata(allClassesQuery, createDivClasses, "propertyClasses");
    } else {
        queryWikidata(fillQuery(allClassesWithPropertyQuery, { property: property }),
            createDivClasses, "propertyClasses");
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

/*
 * Every property there is — close to fourteen thousand of them, which is why
 * this listing in particular is fetched the way it is. Asked of the query
 * service with its labels and descriptions, the whole set is six megabytes and
 * forty seconds, of which a reader sees fifty rows; the identifiers alone are
 * a fifth of that, and each page of fifty costs 13 KB when it is reached.
 */
function getProperties() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyTable, "existingProperties");
    queryWikidata(sparqlQuery, createDivAllProperties, "allProperties");
}


/*
 * Properties whose own statements carry a reference.
 *
 * The condition is a FILTER EXISTS rather than a join. Joined, the pattern
 * matches every referenced statement in Wikidata — hundreds of millions of
 * them — before DISTINCT reduces the result to a few thousand properties, and
 * the query service gives up long before that. EXISTS stops at the first
 * referenced statement each property has, which is all the question needs.
 * The joined form timed out; this one answers.
 *
 * The REGEX the joined form used to keep ?statement to statement nodes is
 * gone with it: prov:wasDerivedFrom only ever leaves a statement, so it was
 * both expensive and redundant.
 */
function getPropertyWithReference() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
   SELECT DISTINCT ?property
    {
      ?property a wikibase:Property.
      FILTER EXISTS {
        ?property ?prop ?statement.
        ?statement prov:wasDerivedFrom ?reference.
      }
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyTable, "propertywithreference");
}

/*
 * Properties declaring an equivalent property on an external vocabulary.
 *
 * The ?prop ?statement clause this query used to carry bound every statement
 * of every matching property and was then discarded by DISTINCT — it
 * constrained nothing, since wdt:P1628 already selects the properties wanted,
 * and it was enough to make the query time out once labels were asked for.
 */
function getPropertyWithEquivPropertySet() {
    const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
   SELECT DISTINCT ?property
    {
      ?property a wikibase:Property;
         wdt:P1628 ?equivproperty.
    }
    ORDER by ?property
    `;
    queryWikidata(sparqlQuery, createDivPropertyTable, "propertywithequivpropertyset");
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

/*
 * Lists the properties of one datatype, and offers the ones still unnamed in
 * the reader's language to the workbench.
 *
 * The workbench already accepts a datatype as its scope, so the offer is a
 * link rather than any new machinery: it carries the same datatype and the
 * language the labels were asked in, and lands on the same set of properties
 * with somewhere to type the translations.
 */
/*
 * The way out of the listing: the properties this datatype still needs
 * translated, handed to the workbench.
 *
 * The workbench already takes a datatype as its scope, so this is a link
 * rather than any new machinery — the same datatype, the language the terms
 * were asked in.
 *
 * It carries no number to begin with, and does not wait for one. Counting the
 * untranslated properties of a large datatype is a slow query on a cold cache
 * — seventy seconds for the external identifiers, against two for the listing
 * itself — and the way out of the page should not disappear because a figure
 * beside it was slow to arrive. wdpropCountUntranslated relabels the button if
 * the count lands.
 */
function wdpropOfferToWorkbench(divId) {
    let container = document.getElementById(divId);
    if (!container) {
        return;
    }

    let datatype = getValueFromURL("datatype=([^&#=]*)", "wikibase:WikibaseItem");
    let language = wdpropLabelLanguage();

    let action = document.createElement("p");
    action.setAttribute("class", "propertytableaction");

    let link = document.createElement("a");
    link.setAttribute("class", "wdp-button");
    link.setAttribute("href", "translate.html?datatype=" +
        encodeURIComponent(datatype) + "&target=" + encodeURIComponent(language));
    link.appendChild(document.createTextNode(wdpropText("js.translateMissing")));

    action.appendChild(link);
    container.appendChild(action);
    container.wdpropWorkbenchLink = link;
}

function getPropertiesWithDatatype() {
    let datatype = getValueFromURL("datatype=([^&#=]*)", "wikibase:WikibaseItem");

    let datatypeCode = document.getElementById("datatypeCode");
    datatypeCode.innerHTML = wdpropText("page.propsWithDatatype") + datatype;

    let where = fillQuery(propertiesWithDatatypeWhere, { datatype: datatype });

    queryWikidata(fillQuery(propertiesWithDatatypeQuery, { where: where }),
        function (divId, json) {
            let records = createDivPropertyTable(divId, json);
            wdpropOfferToWorkbench(divId);
            return records;
        }, "propertiesWithDatatype");

    /* Asked beside the listing rather than after it, and awaited by neither. */
    wdpropCountUntranslated("propertiesWithDatatype", where);
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