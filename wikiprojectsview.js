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

/*
 * Narrows the table to the projects whose name contains what has been typed,
 * and pages what is left.
 *
 * The names are all present to match against — unlike the classes page, whose
 * labels are fetched a page at a time — because a project's name is its title,
 * and the titles are the whole of what the listing fetched.
 */
function filterWikiProjects() {
    var input = document.getElementById('wp-search');
    var table = document.querySelector('#allWikiProjects table');
    if (!input || !table) {
        return;
    }

    var wanted = input.value.trim().toLowerCase();

    wdpropFilterTable(table, function (row) {
        return wanted === '' ||
            String(row.wdpropProjectName).toLowerCase().indexOf(wanted) !== -1;
    });
}

/*
 * The table does not exist until the search comes back, so the filter is bound
 * to the box rather than to the table, and finds the table each time it runs.
 */
function watchWikiProjectsFilter() {
    var input = document.getElementById('wp-search');
    if (input) {
        input.addEventListener('input', filterWikiProjects);
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

WDProp.ready(watchWikiProjectsFilter);
