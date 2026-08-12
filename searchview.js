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
    showResultsSection();
    searchWikiProjects(value, "searchResults");
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

/*
 * What was typed: the form's own field where there is one, the field on the
 * page otherwise, and the address if neither has anything. The field is looked
 * for by id as well as through the form because the wrapper is called from
 * more than one place, and a term read as empty would be written into the
 * address as no term at all.
 */
function searchTerm(form) {
    var input = (form && form.search) || document.getElementById('search');
    var field = input ? String(input.value || '').trim() : '';
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

/* The language the results on screen were fetched in, so that a change of
   language can tell whether they are still the right ones. */
var searchedIn = null;

/*
 * The address says what is being shown.
 *
 * A search typed into the form never reached it: the submit is cancelled so
 * the results can be drawn in place, and with it went the one thing that made
 * a result page worth keeping. There was nothing to bookmark and nothing to
 * send to anyone — the address still read whatever it did before the search,
 * or nothing at all.
 *
 * The language goes in with the term, and that is the point rather than a
 * detail: a link carrying it shows its recipient what its sender saw, whatever
 * language their own interface happens to be in. wdprop.js decided before this
 * ran whether the language in the address was the reader's own or one we
 * filled in, so writing it here cannot be mistaken for a choice they made.
 *
 * replaceState rather than pushState: a search replaces the results on the
 * page, and the back button should leave the page rather than walk through
 * every term tried on the way. It is wrapped because a page opened from a
 * disk is a file:// address, which some browsers refuse to rewrite, and a
 * search must not fail over its own address bar.
 */
function rememberSearch(params) {
    if (!window.history || !window.history.replaceState) {
        return;
    }

    /* uselang was asked for explicitly, so it survives; the switcher's own
       choice is remembered in this browser and needs no help from the URL. */
    var uselang = /[?&]uselang=([^&#]*)/.exec(window.location.search);
    if (uselang) {
        params.uselang = decodeURIComponent(uselang[1]);
    }

    var query = Object.keys(params).filter(function (key) {
        return params[key];
    }).map(function (key) {
        return key + "=" + encodeURIComponent(params[key]);
    }).join("&");

    try {
        window.history.replaceState(null, "", "./search.html" + (query ? "?" + query : ""));
    } catch (e) {
        /* Nothing is lost but the bookmark. */
    }
}

// Wrap findProperty so the results section (containing the spinner)
// is revealed BEFORE the search fires — not only after data arrives.
var _origFindProperty = findProperty;
findProperty = function(event, form) {
    showResultsSection();
    showPageMatches(searchTerm(form));
    searchedIn = wdpropSearchLanguage();
    rememberSearch({ search: searchTerm(form), language: searchedIn });
    _origFindProperty(event, form);
};

/*
 * A WikiProject search carried in the address, the way ?search= carries a
 * property search: the tab is opened, the field filled in, and the search run.
 *
 * wikiproject.html offered two examples — "WikiProjects related to Heritage",
 * "…to programming language" — as links to itself carrying ?search=, which
 * that page reads nothing of. Both landed on the default project, the same
 * one, whatever they said. They point here now, and here it means something.
 */
function projectTermFromUrl() {
    var found = /[?&]searchproject=([^&#]*)/.exec(window.location.search);
    if (!found) {
        return '';
    }
    try {
        return decodeURIComponent(found[1].replace(/\+/g, ' ')).trim();
    } catch (e) {
        return found[1];
    }
}

// Same for the on-load path (handles ?search= and ?searchproject= URL params)
var _origFindPropertyOnLoad = findPropertyOnLoad;
findPropertyOnLoad = function() {
    var project = projectTermFromUrl();
    if (project) {
        switchSearchTab('wikiprojects');
        document.getElementById('searchproject').value = project;
        showResultsSection();
        searchWikiProjects(project, 'searchResults');
        return;
    }

    // Only reveal if there's actually a search param pending
    if (window.location.search.indexOf('search=') !== -1) {
        showResultsSection();
        showPageMatches(searchTerm(null));
        searchedIn = wdpropSearchLanguage();
        /*
         * A link that named no language is answered with the one being read,
         * and made explicit here — so that passing it on again sends what was
         * actually seen rather than the same open question.
         */
        rememberSearch({ search: searchTerm(null), language: searchedIn });
    }
    _origFindPropertyOnLoad();
};

// Wrap findWikiProjects for the WikiProjects tab
var _origFindWikiProjects = findWikiProjects;
findWikiProjects = function(event, form) {
    showResultsSection();
    /* No language: a project is found by its title, which is one string on
       Wikidata and the same in every interface language. */
    rememberSearch({ searchproject: document.getElementById('searchproject').value.trim() });
    _origFindWikiProjects(event, form);
};

/*
 * Results already on screen, when the reader changes language.
 *
 * The interface retranslates itself, and the property labels cannot: they are
 * Wikidata's text, fetched in one language, and the only way to have them in
 * another is to ask again. Left alone, choosing French put a French page
 * around a table of English labels — the same complaint as a hardcoded "en",
 * arrived at by a different route.
 *
 * Only when there is something to redraw, and only when the language really
 * changed: this fires on the first application of a language too, which is
 * before any search has run.
 */
document.addEventListener('wdprop:language', function () {
    var results = document.getElementById('resultsSection');
    var field = document.getElementById('search');
    if (!results || results.style.display !== 'block' || !field || !field.value.trim()) {
        return;
    }
    if (projectTermFromUrl()) {
        return;     // A WikiProject search: its titles are language-neutral.
    }

    /*
     * Not when the address named the language. That is the reader's own
     * choice, and a link that says language=ta is a link about Tamil however
     * the person opening it has set their interface — which is the whole
     * reason for having the two apart.
     *
     * When it did not, the labels are in the language being read because
     * nothing said otherwise, and reading in another language changes what
     * they should be.
     */
    var language = wdpropSearchLanguage();
    if (wdpropLanguagePinned || language === searchedIn) {
        return;
    }
    searchProperties(field.value.trim(), language, 'searchResults');
    searchedIn = language;
    rememberSearch({ search: field.value.trim(), language: language });
});

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
