/*
 * Author: John Samuel
 */
function createDivProperties(divId, json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById(divId);
  var total = document.createElement("h3"); 
  total.innerHTML = "Total " + results.bindings.length + " properties";
  properties.appendChild(total);
  for ( const result of results.bindings ) {
    for ( const variable of vars ) {
      var property = document.createElement("div"); 
      property.setAttribute('class', "property");
      var a = document.createElement("a"); 
      a.setAttribute('href', "https://www.wikidata.org/wiki/Property:" + result[variable].value.replace("http://www.wikidata.org/entity/", ""));
      var text = document.createTextNode(result[variable].value.replace("http://www.wikidata.org/entity/", ""));
      a.appendChild(text);
      property.appendChild(a);
      properties.appendChild(property);
    }
  }
}

function createDivSearchProperties(divId, json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById(divId);
  var total = document.createElement("h3"); 
  total.innerHTML = "Total " + results.bindings.length + " properties";
  while (properties.hasChildNodes()) {
    properties.removeChild(properties.lastChild);
  }
  properties.appendChild(total);
  var table = document.createElement("table"); 
  var th = document.createElement("th"); 
  var td = document.createElement("td"); 
  td.innerHTML = "Property";
  th.append(td);
  td = document.createElement("td"); 
  td.innerHTML = "Language";
  th.append(td);
  td = document.createElement("td"); 
  td.innerHTML = "Label";
  th.append(td);
  table.append(th);
  var tr = "";
  for ( const result of results.bindings ) {
    tr = document.createElement("tr");

    td = document.createElement("td"); 
    td.innerHTML = result['language'].value;
    tr.append(td);

    var property = document.createElement("th"); 
    property.setAttribute('class', "property");
    var a = document.createElement("a"); 
    a.setAttribute('href', "https://www.wikidata.org/wiki/Property:" + result['property'].value.replace("http://www.wikidata.org/entity/", ""));
    var text = document.createTextNode(result['property'].value.replace("http://www.wikidata.org/entity/", ""));
    a.appendChild(text);
    property.appendChild(a);
    tr.appendChild(property);

    td = document.createElement("td"); 
    td.innerHTML = result['label'].value;
    tr.append(td);

    table.appendChild(tr);
  }
  properties.appendChild(table);
}

function getColor(colors, index, total) {
  var colorCount = colors.length;
  var groupSize = total/colorCount;

  for (i = 0; i * groupSize < total; i ++) {
    if (index >= i * groupSize && index <= (i + 1) * groupSize) {
      return colors[i];
    }
  }
}

function createDivTranslatedAliasesCount(divId, json) {
  const { head: { vars }, results } = json;
  var languages = document.getElementById(divId);
  var colors =  ["#002171", "#004ba0", 
                 "#0069c0", "#2286c3", "#bbdefb"]; 
  var backgroundColors =  ["#ffffff", "#ffffff", 
                 "#000000", "#000000", "#000000"]; 
 
  var count = 0;
  for ( const result of results.bindings ) {
    var language = document.createElement("div"); 
    language.setAttribute('class', "language");

    language.style['background-color'] = getColor(colors, count, results.bindings.length);

    var a = document.createElement("a"); 
    a.setAttribute('href', "language.html?language=" + result['languageCode'].value);
    a.style['color'] = getColor(backgroundColors, count, results.bindings.length);
    var text = document.createTextNode(result['languageCode'].value + " (" + result['total'].value +")");
    a.appendChild(text);
    language.appendChild(a);
    languages.appendChild(language);

    count++;
  }
}

function createDivTranslatedLabelsCount(divId, json) {
  const { head: { vars }, results } = json;
  var languages = document.getElementById(divId);
  var colors =  ["#002171", "#004ba0", 
                 "#0069c0", "#2286c3", "#bbdefb"]; 
  var backgroundColors =  ["#ffffff", "#ffffff", 
                 "#000000", "#000000", "#000000"]; 
 
  var count = 0;
  for ( const result of results.bindings ) {
    var language = document.createElement("div"); 
    language.setAttribute('class', "language");

    language.style['background-color'] = getColor(colors, count, results.bindings.length);

    var a = document.createElement("a"); 
    a.setAttribute('href', "../language.html?language=" + result['languageCode'].value);
    a.style['color'] = getColor(backgroundColors, count, results.bindings.length);
    var text = document.createTextNode(result['languageCode'].value + " (" + result['total'].value +")");
    a.appendChild(text);
    language.appendChild(a);
    languages.appendChild(language);

    count++;
  }
}

function createDivTranslatedDescriptionsCount(divId, json) {
  const { head: { vars }, results } = json;
  var languages = document.getElementById(divId);
  var colors =  ["#002171", "#004ba0", 
                 "#0069c0", "#2286c3", "#bbdefb"]; 
  var backgroundColors =  ["#ffffff", "#ffffff", 
                 "#000000", "#000000", "#000000"]; 
 
  var count = 0;
  for ( const result of results.bindings ) {
    var language = document.createElement("div"); 
    language.setAttribute('class', "language");

    language.style['background-color'] = getColor(colors, count, results.bindings.length);

    var a = document.createElement("a"); 
    a.setAttribute('href', "language.html?language=" + result['languageCode'].value);
    a.style['color'] = getColor(backgroundColors, count, results.bindings.length);
    var text = document.createTextNode(result['languageCode'].value + " (" + result['total'].value +")");
    a.appendChild(text);
    language.appendChild(a);
    languages.appendChild(language);

    count++;
  }
}

function createDivLanguage(divId, json) {
  const { head: { vars }, results } = json;
  var languages = document.getElementById(divId);
  var total = document.createElement("h3"); 
  total.innerHTML = "Total " + results.bindings.length + " languages";
  languages.appendChild(total);
  for ( const result of results.bindings ) {
    for ( const variable of vars ) {
      var language = document.createElement("div"); 
      language.setAttribute('class', "language");
      var a = document.createElement("a"); 
      a.setAttribute('href', "language.html?language=" + result[variable].value);
      var text = document.createTextNode(result[variable].value);
      a.appendChild(text);
      language.appendChild(a);
      languages.appendChild(language);
    }
  }
}

function createDivPropertyDetails(divId, json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById(divId);
  var total = document.createElement("h3"); 
  total.innerHTML = "Total " + results.bindings.length + " properties";
  properties.appendChild(total);
  for ( const result of results.bindings ) {
    for ( const variable of vars ) {
      var property = document.createElement("div"); 
      property.setAttribute('class', "property");
      var a = document.createElement("a"); 
      a.setAttribute('href', "property.html?property=" + result[variable].value.replace("http://www.wikidata.org/entity/", ""));
      var text = document.createTextNode(result[variable].value.replace("http://www.wikidata.org/entity/", ""));
      a.appendChild(text);
      property.appendChild(a);
      properties.appendChild(property);
    }
  }
}

function queryWikidata(sparqlQuery, func, divId) {
     /*
      * Following script is a modified form of automated
      * script generated from Wikidata Query services
      */
     const endpointUrl = 'https://query.wikidata.org/sparql',
     fullUrl = endpointUrl + '?query=' + encodeURIComponent( sparqlQuery )+"&format=json";
     headers = { 'Accept': 'application/sparql-results+json' };

     fetch( fullUrl, { headers } ).then( body => body.json() ).then( json => {
       func(divId, json)
     } );
}

function getLanguages() {
  const sparqlQuery = `PREFIX schema: <http://schema.org/>

      SELECT DISTINCT ?language
      WHERE
      {
        [] schema:inLanguage ?language.
      }
      ORDER by ?language
      `;
  queryWikidata(sparqlQuery, createDivLanguage, "languages");
}

function getMissingPropertyAliases() {
  var language = "en";
  if(window.location.search.length > 0) {
    var reg = new RegExp("language=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       language = decodeURIComponent(value[1]);
    }
  }

  getLanguage(language);

  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property skos:altLabel ?alias FILTER (lang(?alias)="`
      + language + `")}
      FILTER (!BOUND(?alias)).
    }
    ORDER by ?alias
    `;
  queryWikidata(sparqlQuery, createDivProperties, "missingPropertyAliases");
}

function getPropertyLabelsNeedingTranslation() {
  var language = "en";
  if(window.location.search.length > 0) {
    var reg = new RegExp("language=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       language = decodeURIComponent(value[1]);
    }
  }

  getLanguage(language);

  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property rdfs:label ?label FILTER (lang(?label)="`
      + language + `")}
      FILTER (!BOUND(?label)).
    }
    ORDER by ?property
    `;
  queryWikidata(sparqlQuery, createDivProperties, "propertyLabelsNeedingTranslation");
}

function createDivLanguageCode(divId, json) { 
  const { head: { vars }, results } = json;
  var languageText = document.getElementById(divId);
  if(results.bindings.length > 0) {
    languageText.innerHTML = results.bindings[0]['languageLabel']['value'];
  }
}

function getLanguage(language){
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
  var language = "en";
  if(window.location.search.length > 0) {
    var reg = new RegExp("language=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       language = decodeURIComponent(value[1]);
    }
  }
  
  getLanguage(language);
  
  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property schema:description ?description FILTER (lang(?description)="`
      + language + `")}
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

function getCountOfTranslatedAliases() {
  const sparqlQuery = `
    SELECT ?languageCode (SUM(?count) as ?total)
    WHERE
    {
      SELECT ?property ?languageCode (count(?alias) as ?count)
      WHERE
      {
        ?property a wikibase:Property;
                skos:altLabel ?alias.
        BIND(lang(?alias) as ?languageCode)
      }
      GROUP BY ?property ?languageCode
    }
    GROUP BY ?languageCode
    ORDER BY DESC(?total) `;

  queryWikidata(sparqlQuery, createDivTranslatedAliasCount, "translatedAliasesCount");
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

  queryWikidata(sparqlQuery, createDivTranslatedDescriptionsCount, "translatedDescriptionsCount");
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

  queryWikidata(sparqlQuery, createDivTranslatedAliasesCount, "translatedAliasesCount");
}

function createDivDataTypes(divId, json) {
  const { head: { vars }, results } = json;
  var datatypes = document.getElementById(divId);
  var total = document.createElement("h3"); 
  total.innerHTML = "Total " + results.bindings.length + " datatypes";
  datatypes.appendChild(total);
  for ( const result of results.bindings ) {
    for ( const variable of vars ) {
      var datatype = document.createElement("div"); 
      datatype.setAttribute('class', "datatype");
      var a = document.createElement("a"); 
      var datatypeValue = result[variable].value.replace("http://wikiba.se/ontology#", "");
      var text = document.createTextNode(datatypeValue);
      a.setAttribute('href', "datatype.html?datatype=wikibase:" + datatypeValue);
      a.appendChild(text);
      datatype.appendChild(a);
      datatypes.appendChild(datatype);
    }
  }
}

function getDatatypes() {
  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?datatype
    WHERE
    {
      ?property rdf:type wikibase:Property;
                wikibase:propertyType ?datatype.
    }
    ORDER by ?property

    `;
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
  queryWikidata(sparqlQuery, createDivPropertyDetails, "allProperties");
}

function getPropertiesNeedingTranslation() {
  getPropertyLabelsNeedingTranslation();
  getPropertyDescriptionsNeedingTranslation();
  getMissingPropertyAliases();
}


function getPropertyDetails() {
  var property = "P31";
  if(window.location.search.length > 0) {
    var reg = new RegExp("property=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       property = decodeURIComponent(value[1]);
    }
  }
  var div = document.getElementById("propertyCode");
  div.innerHTML = property;

  var sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:`+ property + ` rdfs:label ?label.
      BIND(lang(?label) as ?language)
    }
    ORDER by ?language`;
   queryWikidata(sparqlQuery, createDivLanguage, "translatedLabelsInLanguages");
   
   sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:`+ property + ` schema:description ?description.
      BIND(lang(?description) as ?language)
    } 
    ORDER by ?language`;
   queryWikidata(sparqlQuery, createDivLanguage, "translatedDescriptionsInLanguages");

   sparqlQuery = `
    SELECT DISTINCT ?language
    {
      wd:`+ property + ` skos:altLabel ?alias.
      BIND(lang(?alias) as ?language)
    }
    ORDER by ?language`;
   queryWikidata(sparqlQuery, createDivLanguage, "translatedAliasesInLanguages");
}

function getPropertiesWithDatatype() {
  var datatype = "wikibase:WikibaseItem";
  if(window.location.search.length > 0) {
    var reg = new RegExp("datatype=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       datatype = decodeURIComponent(value[1]);
    }
  }

  var datatypeCode = document.getElementById("datatypeCode");
  datatypeCode.innerHTML = "Properties with datatype- "+ datatype;
  
  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property;
                wikibase:propertyType ` + datatype + `
    }
    ORDER by ?property

    `;
  queryWikidata(sparqlQuery, createDivPropertyDetails, "propertiesWithDatatype");
}

function createDivPropertyDescriptors(divId, json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById(divId);
  var total = document.createElement("h3"); 
  var count = 0;
  properties.appendChild(total);
  for ( const result of results.bindings ) {
    for ( const variable of vars ) {
      var property = document.createElement("div"); 
      property.setAttribute('class', "property");
      var a = document.createElement("a"); 
      if (result[variable].value.indexOf("/direct") != -1 || 
          result[variable].value.indexOf("wikiba.se") != -1  ||
          result[variable].value.indexOf("schema.org") != -1 ||
          result[variable].value.indexOf("w3.org") != -1) {
         continue; //To avoid properties  
      }
      count = count + 1;
      //a.setAttribute('href', result[variable].value);
      a.setAttribute('href', "property.html?property=" + result[variable].value.replace("http://www.wikidata.org/prop/", ""));
      var text = document.createTextNode(result[variable].value.replace(new RegExp(".*/"), ""));
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
      ?property rdf:type wikibase:Property;
                ?subproperty [].
    }
    ORDER by ?subproperty

    `;
  queryWikidata(sparqlQuery, createDivPropertyDescriptors, "propertyDescriptors");
}

function findProperty(e, form) {
  e.preventDefault();
  console.log("search: " + document.getElementById("searchText").value);
  var search = '"' + document.getElementById("searchText").value + '"';
  const sparqlQuery = `
    PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT DISTINCT ?property (LANG(?label) as ?language) ?label
    WHERE
    {
      ?property a wikibase:Property;
                  rdfs:label ?label.
      FILTER(contains(lcase(?label), ` + search +`))
    }
    `;
  queryWikidata(sparqlQuery, createDivSearchProperties, "searchResults");
}
