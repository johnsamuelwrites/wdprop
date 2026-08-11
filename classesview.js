/*
 * WDProp - classes.html
 *
 * The collapsible SPARQL panel, and revealing it once the classes have
 * arrived.
 *
 * Moved out of an inline <script> in classes.html: it wraps getClasses from
 * classes.js, and an inline script runs during parsing, before any deferred
 * file has defined anything to wrap.
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

// Reveal query section once data has loaded (classes.js sets display:block on #classes-modern)
var _origGetClasses = getClasses;
getClasses = function () {
    _origGetClasses();
    // Show query section after a tick so showQuery() has already run
    setTimeout(function () {
        document.getElementById('classesQuerySection').style.display = 'block';
    }, 200);
};

WDProp.actions.add({
    toggleClassesQuery: function () { toggleClassesQuery(); }
});
