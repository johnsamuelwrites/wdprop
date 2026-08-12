/*
 * WDProp - search.html
 *
 * Tab switching, and revealing the results panel before a query is sent
 * rather than after it answers, so the spinner that says something is
 * happening is on screen while it happens.
 *
 * This was an inline <script> at the foot of search.html. It wraps three
 * functions defined in wdprop.js, which it can only do after wdprop.js has
 * run — and an inline script runs while the page is being parsed, ahead of
 * every deferred file. As a separate file loaded after wdprop.js, the order
 * is the load order and holds.
 *
 * Author: John Samuel
 */

function switchSearchTab(tab) {
    // Update tab buttons
    document.getElementById('tab-properties').classList.toggle('active', tab === 'properties');
    document.getElementById('tab-wikiprojects').classList.toggle('active', tab === 'wikiprojects');
    // Update panels
    document.getElementById('panel-properties').classList.toggle('active', tab === 'properties');
    document.getElementById('panel-wikiprojects').classList.toggle('active', tab === 'wikiprojects');
}

/*
 * The event is passed in now. It used to read the global `event`, which the
 * browser sets while an inline handler runs and which is undefined anywhere
 * else — so this worked only for as long as it was called from an attribute.
 */
function fillAndSubmitProject(event, value) {
    event.preventDefault();
    document.getElementById('searchproject').value = value;
    let sparqlQuery = getSearchWikiProjectQuery("'" + value + "'");
    queryWikidata(sparqlQuery, createDivWikiProjects, "searchResults");
    showResultsSection();
}

function showResultsSection() {
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('querySection').style.display = 'block';
}

/*
 * Pages of WDProp whose name or description matches the term, shown above the
 * properties. This is the other half of what a search is asked for: "atlas",
 * "provenance" and "compare" are all names of pages, and a search that can
 * only answer with properties answers none of them.
 *
 * It costs nothing — the list of pages is already here — so it is drawn
 * before the query is sent rather than beside its results, and it is on
 * screen while Wikidata is still being waited on.
 */
function showPageMatches(term) {
    var section = document.getElementById('pageMatchesSection');
    var container = document.getElementById('pageMatches');
    if (!section || !container) {
        return;
    }

    var matches = WDProp.nav.match(term);

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    /* No heading over an empty list: nothing found is not a result. */
    section.style.display = matches.length ? 'block' : 'none';
    if (matches.length) {
        container.appendChild(WDProp.nav.grid(matches));
    }
}

/* What was typed, from the field if it is filled in and the address if not. */
function searchTerm(form) {
    var field = form && form.search ? form.search.value : null;
    if (field) {
        return field;
    }
    var found = /[?&]search=([^&#]*)/.exec(window.location.search);
    try {
        return found ? decodeURIComponent(found[1].replace(/\+/g, ' ')) : '';
    } catch (e) {
        return found[1];
    }
}

function toggleQuerySection() {
    let body = document.getElementById('searchResultsQuery');
    let chevron = document.querySelector('.search-query-chevron');
    let btn = document.querySelector('.search-query-toggle');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.textContent = '▲';
        btn.classList.add('open');
    } else {
        body.style.display = 'none';
        chevron.textContent = '▼';
        btn.classList.remove('open');
    }
}

// Wrap findProperty so the results section (containing the spinner)
// is revealed BEFORE queryWikidata fires — not only after data arrives.
var _origFindProperty = findProperty;
findProperty = function(event, form) {
    showResultsSection();
    showPageMatches(searchTerm(form));
    _origFindProperty(event, form);
};

// Same for the on-load path (handles ?search= URL param)
var _origFindPropertyOnLoad = findPropertyOnLoad;
findPropertyOnLoad = function() {
    // Only reveal if there's actually a search param pending
    if (window.location.search.indexOf('search=') !== -1) {
        showResultsSection();
        showPageMatches(searchTerm(null));
    }
    _origFindPropertyOnLoad();
};

// Wrap findWikiProjects for the WikiProjects tab
var _origFindWikiProjects = findWikiProjects;
findWikiProjects = function(event, form) {
    showResultsSection();
    _origFindWikiProjects(event, form);
};

/*
 * The controls on the page name these; actions.js looks the name up and calls
 * it. The two form actions are registered rather than the functions they call,
 * because those functions are replaced above and the wrapper must be the one
 * that runs.
 */
WDProp.actions.add({
    switchSearchTab: function (event, element, tab) { switchSearchTab(tab); },
    fillAndSubmitProject: function (event, element, value) {
        fillAndSubmitProject(event, value);
    },
    toggleQuerySection: function () { toggleQuerySection(); },
    submitPropertySearch: function (event, form) { findProperty(event, form); },
    submitWikiProjectSearch: function (event, form) { findWikiProjects(event, form); }
});
