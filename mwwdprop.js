function queryMediaWiki(queryparams, func, divId, url) {
     var div = document.getElementById(divId);
     var fetchText = document.createElement("h4"); 
     fetchText.innerHTML = "Fetching data...";
     div.append(fetchText);

     const endpointUrl = 'https://www.wikidata.org/w/api.php',
     fullUrl = endpointUrl + '?action=' + queryparams+"&format=json";
   
     fetch( fullUrl, { } ).then( body => body.json() ).then( json => {
       div.removeChild(fetchText);
       func(divId, json, url)
     } );
}

function createDivLanguage(divId, json, url) {
  console.log(json);
  xml = json.parse["parsetree"]["*"];
  console.log(xml);
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
