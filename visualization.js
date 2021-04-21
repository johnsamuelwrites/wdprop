function visualizePath() {
   //Wikidata supported languages
   languages = [ "aa", "ab", "ace", "ady", "af", "ak", "als", "am", "an", "ang", "ar",
      "arc", "arz", "as", "ast", "atj", "av", "ay", "az", "azb", "ba", "ban",
      "bar", "bat-smg", "bcl", "be", "be-tarask", "be-x-old", "bg", "bi", "bjn",
      "bm", "bn", "bo", "bpy", "br", "bs", "bug", "bxr", "ca", "cbk-zam", "cdo",
      "ce", "ceb", "ch", "cho", "chr", "chy", "ckb", "co", "cr", "crh", "cs", "csb",
      "cu", "cv", "cy", "da", "de", "din", "diq", "dsb", "dty", "dv", "dz", "ee", "el",
      "eml", "en", "en-simple", "en-x-simple", "eo", "es", "eu", "ext", "fa", "ff",
      "fi", "fiu-vro", "fj", "fo", "fr", "fr-x-nrm", "frp", "frr", "fur", "fy", "ga",
      "gag", "gan", "gd", "gl", "glk", "gn", "gom", "gor", "got", "gsw", "gu", "gv",
      "ha", "hak", "haw", "he", "hi", "hif", "ho", "hr", "hsb", "ht", "hu", "hyw", "hz",
      "ia", "id", "ie", "ig", "ii", "ik", "ilo", "inh", "io", "is", "it", "it-x-tara", "iu",
      "ja", "jam", "jbo", "jv", "ka", "kaa", "kab", "kbd", "kbp", "kg", "ki", "kj", "kk",
      "kl", "km", "kn", "ko", "koi", "kr", "krc", "ks", "ksh", "ku", "kw", "ky", "la",
      "lad", "lb", "lbe", "lez", "lfn", "lg", "li", "lij", "lmo", "ln", "lo", "lrc", "lt",
      "ltg", "lv", "lzh", "mai", "map-bms", "mdf", "mg", "mh", "mhr", "mi", "min", "mk",
      "ml", "mn", "mo", "mr", "mrj", "ms", "mt", "mus", "mwl", "my", "myv", "mzn", "na",
      "nah", "nan", "nap", "nb", "nds-nl", "ne", "new", "ng", "nl", "nn", "nov", "nrm",
      "nso", "nv", "ny", "oc", "olo", "om", "or", "os", "pa", "pag", "pam", "pap", "pcd",
      "pdc", "pfl", "pi", "pl", "pms", "pnt", "ps", "pt", "rm", "rmy", "rn", "ro", "roa-tara",
      "ru", "ru-sib", "rue", "rup", "rw", "sa", "sah", "sat", "sc", "scn", "sco", "sd", "se",
      "sg", "sgs", "sh", "shn", "si", "simple", "sk", "sl", "sm", "sn", "so", "sq", "sr",
      "srn", "ss", "st", "stq", "su", "sv", "sw", "szl", "ta", "tcy", "te", "tet", "tg",
      "th", "ti", "tk", "tl", "tlh", "tn", "to", "tpi", "tr", "ts", "tt", "tum", "tw",
      "ty", "tyv", "udm", "ug", "uk", "ur", "uz", "ve", "vec", "vep", "vi", "vls", "vo",
      "vro", "wa", "war", "wo", "wuu", "xal", "xh", "xmf", "yi", "yo", "yue", "za",
      "zea", "zh-classical", "zh-min-nan", "zh-yue", "zu"];

    var height = 6000;
    var width = 500;
    var svg = d3.select("#path")
              .append("svg")
              .attr("width", width)
              .attr("height", height)
              .append("g")
              .attr("transform",
                 "translate( 10 , 10 )");
    var x = d3.scalePoint()
             .range([0, height])
             .domain(languages);
  svg
    .selectAll("nodes")
    .data(languages)
    .enter()
    .append("circle")
      .attr("cy", function(d){ console.log(x(d)); return(x(d))})
      .attr("cx", 390)
      .attr("r", 4)
      .style("fill", "#00549d");
    console.log(x);
    svg.selectAll("language")
       .data(languages)
       .enter()
       .append("text")
       .attr("y", function(d){ return(x(d))})
       .attr("x", 400)
       .text(function(d){ return(d)})
       .style("text-anchor", "left");
}
