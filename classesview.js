/*
 * WDProp - classes.html
 *
 * The collapsible SPARQL panel, and the filter over the classes table.
 *
 * Moved out of an inline <script> in classes.html: it wraps getClasses from
 * wdprop.js, and an inline script runs during parsing, before any deferred
 * file has defined anything to wrap.
 *
 * This page used to carry a second file, classes.js, which let the ordinary
 * renderer draw a table into a hidden div, parsed that table's HTML back into
 * objects, and re-rendered them into a virtual scroller of its own — a round
 * trip through the DOM to arrive where the data had already been. The classes
 * are now the same paged table as every other listing in WDProp, so all that
 * is left here is the filter, which the table itself pages.
 *
 * Author: John Samuel
 */

function toggleClassesQuery() {
    var body     = document.getElementById('propertyClassesQuery');
    var chevron  = document.querySelector('#classesQuerySection .search-query-chevron');
    var btn      = document.querySelector('#classesQuerySection .search-query-toggle');
    var section  = document.getElementById('classesQuerySection');
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
 * Narrows the table to the classes whose item identifier contains what has
 * been typed, and pages what is left.
 *
 * It matches the identifier and not the class name, because the names are not
 * all here to match against: they are fetched for the rows on show, fifty at a
 * time, which is what keeps the page off a twenty-nine second query. To search
 * classes by name, the search page asks Wikidata itself.
 */
function filterClasses() {
    var input = document.getElementById('classes-search');
    var table = document.querySelector('#propertyClasses table');
    if (!input || !table) {
        return;
    }

    var wanted = input.value.trim().toLowerCase();

    wdpropFilterTable(table, function (row) {
        return wanted === '' ||
            String(row.wdpropEntityId).toLowerCase().indexOf(wanted) !== -1;
    });
}

/*
 * The table does not exist until the query comes back, so the filter is bound
 * to the box rather than to the table, and finds the table each time it runs.
 */
function watchClassesFilter() {
    var input = document.getElementById('classes-search');
    if (input) {
        input.addEventListener('input', filterClasses);
    }
}

/* Reveal the query section once showQuery has had a chance to fill it. */
var _origGetClasses = getClasses;
getClasses = function () {
    _origGetClasses();
    setTimeout(function () {
        document.getElementById('classesQuerySection').style.display = 'block';
    }, 200);
};

WDProp.actions.add({
    toggleClassesQuery: function () { toggleClassesQuery(); }
});

WDProp.ready(watchClassesFilter);
