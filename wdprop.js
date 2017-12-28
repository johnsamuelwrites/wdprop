/*
 * Author: John Samuel
 */
function createDivProperties(json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById("properties");
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

function createDivLanguage(json) {
  const { head: { vars }, results } = json;
  var languages = document.getElementById("languages");
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

function createDivPropertyDetails(json) {
  const { head: { vars }, results } = json;
  var properties = document.getElementById("properties");
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

function queryWikidata(sparqlQuery, func) {
     /*
      * Following script is a modified form of automated
      * script generated from Wikidata Query services
      */
     const endpointUrl = 'https://query.wikidata.org/sparql',
     fullUrl = endpointUrl + '?query=' + encodeURIComponent( sparqlQuery ),
     headers = { 'Accept': 'application/sparql-results+json' };

     fetch( fullUrl, { headers } ).then( body => body.json() ).then( json => {
       func(json)
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
  queryWikidata(sparqlQuery, createDivLanguage);
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

    SELECT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property rdfs:label ?label FILTER (lang(?label)="`
      + language + `")}
      FILTER (!BOUND(?label)).
    }
    ORDER by ?property
    `;
  queryWikidata(sparqlQuery, createDivProperties);
}

function createDivLanguageCode(json) { 
  const { head: { vars }, results } = json;
  var languageText = document.getElementById("languagecode");
  if(results.bindings.length > 0) {
    languageText.innerHTML = results.bindings[0]['languageLabel']['value'];
  }
}

function getLanguage(language){
  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT ?languageLabel
    WHERE
    {
      ?languageWiki wdt:P424 "` + language + `";
               wdt:P407 ?language.   
      ?language rdfs:label ?languageLabel.
      FILTER(lang(?languageLabel) = "en")
       
    }
    LIMIT 1`;
  queryWikidata(sparqlQuery, createDivLanguageCode);
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

    SELECT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
      OPTIONAL{?property schema:description ?description FILTER (lang(?description)="`
      + language + `")}
      FILTER (!BOUND(?description)).
    }
    ORDER by ?description
    `;
  queryWikidata(sparqlQuery, createDivProperties);
}

function getProperties() {
  const sparqlQuery = `PREFIX wikibase: <http://wikiba.se/ontology#>

    SELECT ?property
    WHERE
    {
      ?property rdf:type wikibase:Property.
    }
    ORDER by ?property
    `;
  queryWikidata(sparqlQuery, createDivPropertyDetails);
}
