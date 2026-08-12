/*
 * WDProp - What each page asks for when it opens
 *
 * Thirty-two pages started their work from a body onload attribute. Gathered
 * here instead, for the same reason the sidebar was gathered into one list:
 * so that what WDProp does on each page can be read in one place rather than
 * found thirty-two times, and so that a page whose bootstrap is missing shows
 * up as a gap in a table rather than as a page that quietly does nothing.
 *
 * Every entry is a function rather than a reference to one, and that is not
 * incidental. searchview.js, classesview.js and wikiprojectsview.js each wrap
 * a function this table names — replacing the global with one that reveals a
 * panel before the query is sent. Naming the function here would capture
 * whichever version existed when this file was read, which is the unwrapped
 * one; calling it from inside a function looks it up when the page opens,
 * which is the wrapped one.
 *
 * Runs on load rather than on DOMContentLoaded, which is when the onload
 * attributes ran, so nothing moves relative to the queries they start.
 *
 * Author: John Samuel
 */

(function () {
    "use strict";

    /*
     * Keyed by path from the root of WDProp, keeping the directory where there
     * is one: four pages are called translated.html and they do four different
     * things.
     */
    var PAGES = {
        "aliases/language.html": function () { getTranslatedAliases(); },
        "aliases/translated.html": function () { getCountOfTranslatedAliases(); },
        "aliases/untranslated.html": function () { getMissingPropertyAliases(); },
        "atlas.html": function () { initLanguageAtlas(); },
        "class.html": function () { getClassProperties(); },
        "classes.html": function () { getClasses(); },
        "compare.html": function () { getComparisonResultsOnLoad(); },
        "datatype.html": function () { getPropertiesWithDatatype(); },
        "datatypes.html": function () { getDatatypes(); },
        "descriptions.html": function () {
            getPropertyDescriptionsNeedingTranslation();
        },
        "gap.html": function () { initGapRadar(); },
        "descriptions/language.html": function () { getTranslatedDescriptions(); },
        "descriptions/translated.html": function () {
            getCountOfTranslatedDescriptions();
        },
        "descriptions/untranslated.html": function () {
            getPropertyDescriptionsNeedingTranslation();
        },
        "labels.html": function () { getPropertyLabelsNeedingTranslation(); },
        "labels/language.html": function () { getTranslatedLabels(); },
        "labels/translated.html": function () { getCountOfTranslatedLabels(); },
        "labels/untranslated.html": function () {
            getPropertyLabelsNeedingTranslation();
        },
        "language.html": function () { getPropertiesNeedingTranslation(); },
        "languages.html": function () { getLanguages(); },
        "path.html": function () { getTranslationPathTableOptimized(); },
        "pathviz.html": function () { getTranslationPathVizOptimized(); },
        "properties.html": function () {
            getProperties();
            showWikiProjectProperties('Wikidata:Database_reports/List_of_properties/Top100', 'tophundredProperties');
        },
        "property.html": function () { getPropertyDetails(); },
        "propertydesc.html": function () { getPropertyDescriptors(); },
        "propertyprovenance.html": function () { getLinks(); },
        "provenance.html": function () { getOverallProvenance(); },
        "search.html": function () { findPropertyOnLoad(); },
        "templates/translated.html": function () {
            getTemplateTranslationStatistics();
        },
        "translated.html": function () { getTranslationStatistics(); },
        "untranslated.html": function () { getMissingTranslationStatistics(); },
        "visualization.html": function () { initVisualization(); },
        "wikiproject.html": function () { showWikiProjectOnLoad(); },
        "wikiprojects.html": function () { getWikiProjects(); }
    };

    /*
     * The directories WDProp keeps pages in. A page's key is its file name
     * prefixed by its directory when the directory is one of these, and the
     * file name alone otherwise — so that WDProp installed under /wdprop/ or
     * /tools/wdprop/ or opened from a disk all give the same key.
     *
     * This is not wdpropPageKey from wdprop.js, which is for a different
     * question and keeps only templates/. It answers "translated.html" for
     * three pages that need three different things done, because for choosing
     * a sidebar entry those three do belong to one section.
     */
    var DIRECTORIES = ["aliases", "labels", "descriptions", "templates"];

    function key(path) {
        var raw = String(path || "").split(/[?#]/)[0];
        var parts = raw.split("/").filter(function (part) {
            return part && part !== "." && part !== "..";
        });

        /*
         * A path ending in a slash is a directory, and the page served for it
         * is its index — so the last segment is the directory's name, not a
         * file. Reading it as a file is how /wdprop/ came out as "wdprop".
         */
        var file = /\/$/.test(raw) || raw === "" ? "index.html" : (parts.pop() || "index.html");
        var parent = parts.pop();
        return DIRECTORIES.indexOf(parent) >= 0 ? parent + "/" + file : file;
    }

    function start() {
        var init = PAGES[key(window.location.pathname)];
        if (init) {
            init();
        }
    }

    window.addEventListener("load", start);

    window.WDProp = window.WDProp || {};
    window.WDProp.pages = { table: PAGES, key: key };
})();
