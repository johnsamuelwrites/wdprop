const endpointUrl = 'https://www.wikidata.org/w/api.php';

function showQuery(fullurl, divId) {
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

     fullUrl = endpointUrl + '?action=' + queryparams+"&format=json";
     showQuery(fullUrl, divId);
   
     fetch( fullUrl, { } ).then( body => body.json() ).then( json => {
       div.removeChild(fetchText);
       func(divId, json, url)
     } );
}

function createDivLanguage(divId, json, url) {
  xml = json.parse["parsetree"]["*"];
  var languagesDiv = document.getElementById(divId);
  var count = 0;
  var regexp = /<name>(.+?)<\/name>/g;
  var languages = document.createElement("div"); 
  while(true) {
    match = regexp.exec(xml);
    if(match == null) {
      break;
    }
    var languageText = match[1].replace(/\s/g, "") 
    if(languageText == "lang" || languageText == "#default"
       || languageText == "templatedata") {
      continue;
    }
    count ++;
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

function createDivWikprojectProperties(divId, json) {
  let properties = document.getElementById(divId);
  let total = document.createElement("h3");

  let count = 0;
  let wdproperties = [];

  for ( const page of Object.keys(json.query.pages) ) {
   for ( const result of json.query.pages[page].links ) {
    if (!result.title.startsWith("Property:")) {
       continue;
    }
    let text = result.title.replace("Property", "wd");
    console.log(text);
    wdproperties = wdproperties + " " + text + " ";
    count++;
   }
  }
  total.innerHTML = "Total " + count + " properties";

  addDivPropertyLabels(divId, wdproperties);
}

function createDivPropertyList(divId, json, url) {
  console.log(json);
  var properties = document.getElementById(divId);
  var total = document.createElement("h3"); 
  var count = 0;
  properties.appendChild(total);
  for ( const page of Object.keys(json.query.pages) ) {
    var div = document.getElementById("WikiProject");
    div.innerHTML = json.query.pages[page].title;
    for ( const result of json.query.pages[page].links ) {
      if(result.title.indexOf("Property:") !== -1 && result.title !== "Property:P") {
        var property = document.createElement("div"); 
        property.setAttribute('class', "property");
        var a = document.createElement("a"); 
        propertyid = result.title.replace("Property:", "");
        a.setAttribute('href', "property.html?property=" + propertyid);
        var text = document.createTextNode(propertyid);
        a.appendChild(text);
        property.appendChild(a);
        properties.appendChild(property);
        count ++;
      }
    }
  }
  total.innerHTML = "Total " + count + " properties";
}

function showWikiProjectProperties(project, divId) {
  var queryparams = "query&prop=links&pllimit=500&origin=*&titles="+project;
  queryMediaWiki(queryparams, createDivWikprojectProperties,
           divId,
           "");
}

function showWikiProjectOnLoad() {
  limit = 500;
  offset = 500;
  var project = 'Wikidata:WikiProject Properties';
  if(window.location.search.length > 0) {
    var reg = new RegExp("project=([^&#=]*)");
    var value = reg.exec(window.location.search);
    if (value != null) {
       project = decodeURIComponent(value[1]);
    }
  }
  showWikiProjectProperties(project, "allProperties");
}
