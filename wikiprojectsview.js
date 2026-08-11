/*
 * WDProp - wikiprojects.html
 *
 * The collapsible SPARQL panel, and revealing it once the WikiProjects have
 * arrived.
 *
 * Moved out of an inline <script> in wikiprojects.html, for the same reason as
 * classesview.js: it wraps a function another deferred file defines.
 *
 * Author: John Samuel
 */

function toggleWPQuery() {
    var body    = document.getElementById('allWikiProjectsQuery');
    var chevron = document.querySelector('#wpQuerySection .search-query-chevron');
    var btn     = document.querySelector('#wpQuerySection .search-query-toggle');
    var section = document.getElementById('wpQuerySection');
    section.style.display = 'block';
    if (body.style.display === 'none') {
        body.style.display  = 'block';
        chevron.textContent = '▲';
        btn.classList.add('open');
    } else {
        body.style.display  = 'none';
        chevron.textContent = '▼';
        btn.classList.remove('open');
    }
}

// Reveal query section after data loads
var _origGetWP = getWikiProjects;
getWikiProjects = function () {
    _origGetWP();
    setTimeout(function () {
        document.getElementById('wpQuerySection').style.display = 'block';
    }, 200);
};

WDProp.actions.add({
    toggleWPQuery: function () { toggleWPQuery(); }
});
