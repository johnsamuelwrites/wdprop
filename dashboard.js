/**
 * WDProp Dashboard
 * Real-time data from Wikidata with animations
 */

/*
 * Interface text, from i18n.js. Falls back to the key if the message
 * files somehow did not load, which keeps the page working.
 */
function wdpropText(key, params) {
    return (window.WDProp && window.WDProp.i18n) ? window.WDProp.i18n.t(key, params) : key;
}

const dashboardEndpoint = 'https://query.wikidata.org/sparql';
const mediawikiEndpoint = 'https://www.wikidata.org/w/api.php';

/*
 * Which services have answered.
 *
 * The status panel used to be written into the markup as "Online", with a
 * green dot, whether or not anything had been asked of either service — so it
 * said the same thing when Wikidata was down. Nothing is claimed here that
 * the page has not seen for itself: each service stays "checking" until one
 * of its own requests has either worked or failed, and no request is made
 * merely to find out.
 */
const serviceState = {
    wdqs: null,
    mediawiki: null,
    at: null
};

function record(service, ok) {
    /* One failure is enough to report; one success does not undo it. */
    if (serviceState[service] !== false) {
        serviceState[service] = ok;
    }
    if (ok) {
        serviceState.at = new Date();
    }
    renderServiceStatus();
}

function clearNode(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function textNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.setAttribute('class', className);
    }
    if (text !== undefined) {
        node.appendChild(document.createTextNode(text));
    }
    return node;
}

/* What a widget shows in place of results it could not get. */
function showWidgetFailure(container) {
    if (!container) {
        return;
    }
    clearNode(container);
    const note = textNode('p', 'wdp-empty', wdpropText('dash.loadFailed'));
    note.setAttribute('role', 'status');
    container.appendChild(note);
}

// Fetch data from Wikidata
function queryDashboardData(sparqlQuery) {
    const fullUrl = dashboardEndpoint + '?query=' + encodeURIComponent(sparqlQuery) + "&format=json";
    const headers = { 'Accept': 'application/sparql-results+json' };

    return fetch(fullUrl, { headers })
        .then(response => {
            /*
             * Checked before parsing: the query service answers a refusal in
             * prose, and reading that as JSON fails with a message about an
             * unexpected token that says nothing about what happened.
             */
            if (!response.ok) {
                throw new Error('The query service answered ' + response.status);
            }
            return response.json();
        })
        .then(json => {
            record('wdqs', true);
            return json;
        })
        .catch(error => {
            record('wdqs', false);
            throw error;
        });
}

/* The single number a COUNT query returns. */
function countFrom(json) {
    if (json && json.results && json.results.bindings.length > 0) {
        const binding = json.results.bindings[0];
        const key = Object.keys(binding)[0];
        return parseInt(binding[key].value, 10);
    }
    throw new Error('The query returned no count.');
}

const HERO = [
    {
        id: 'statProperties',
        query: `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?property) as ?count)
    WHERE {
      ?property rdf:type wikibase:Property.
    }`
    },
    {
        id: 'statLanguages',
        query: `SELECT (COUNT(DISTINCT ?language) as ?count)
    WHERE {
       [] wdt:P31 wd:Q10876391;
          wdt:P407 [wdt:P424 ?language]
    }`
    },
    {
        id: 'statDatatypes',
        query: `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?datatype) as ?count)
    WHERE {
       [] wikibase:propertyType ?datatype.
    }`
    },
    {
        /* Mirrors allClassesQuery in wdprop.js. */
        id: 'statClasses',
        query: `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?item) as ?count)
    WHERE {
      {
        ?item wdt:P1963 [].
      }
      UNION
      {
        ?property a wikibase:Property;
                  (wdt:P31|wdt:P279) ?item.
      }
    }`
    }
];

/*
 * Counting up to a figure is decoration, and someone who has asked for less
 * movement gets the figure itself.
 */
function animateCounter(element, target) {
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
        element.textContent = target.toLocaleString();
        return;
    }

    const duration = 2000;
    const increment = target / (duration / 16);
    let current = 0;

    /*
     * let, and assigned rather than initialised: the callback names the timer
     * it is stopping, and a const would not yet be readable if anything ever
     * called it before setInterval had returned.
     */
    let timer = null;
    timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target.toLocaleString();
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current).toLocaleString();
        }
    }, 16);
}

// Update hero stats with real data
function updateHeroStats() {
    HERO.forEach(stat => {
        const element = document.getElementById(stat.id);
        if (!element) {
            return;
        }

        element.textContent = '';

        queryDashboardData(stat.query).then(json => {
            const count = countFrom(json);
            element.setAttribute('class', 'stat-value');
            animateCounter(element, count);
        }).catch(() => {
            /*
             * A dash, not a nought and not the figure that was in the markup:
             * "we could not count this" and "there are none" are different
             * things, and only one of them is true.
             */
            element.setAttribute('class', 'stat-value wdp-stat-unknown');
            element.textContent = '—';
            element.setAttribute('title', wdpropText('dash.countFailed'));
        });
    });
}

/*
 * Translation coverage for a handful of widely read languages.
 *
 * One query rather than one per language: each is a count over every property
 * in Wikidata, and five of those in parallel is a heavy thing to ask on a page
 * someone has merely opened.
 */
const COVERAGE_LANGUAGES = [
    { code: 'en', name: 'lang.en' },
    { code: 'de', name: 'lang.de' },
    { code: 'fr', name: 'lang.fr' },
    { code: 'es', name: 'lang.es' },
    { code: 'ja', name: 'lang.ja' }
];

function coverageQuery() {
    const counts = COVERAGE_LANGUAGES.map(({ code }) => `
      (COUNT(DISTINCT ?label_${code}) as ?n_${code})`).join('');
    const optionals = COVERAGE_LANGUAGES.map(({ code }) => `
      OPTIONAL { ?property rdfs:label ?label_${code} FILTER(lang(?label_${code})="${code}") }`).join('');

    return `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?property) as ?total)${counts}
    WHERE {
      ?property rdf:type wikibase:Property.${optionals}
    }`;
}

function renderCoverage(binding) {
    const list = document.getElementById('translationProgress');
    if (!list) {
        return;
    }
    clearNode(list);

    const total = parseInt(binding.total.value, 10);
    if (!total) {
        throw new Error('No properties were counted.');
    }

    COVERAGE_LANGUAGES.forEach(({ code, name }) => {
        const translated = parseInt(binding['n_' + code].value, 10);
        const percentage = Math.round((translated / total) * 100);

        const item = textNode('div', 'progress-item');
        const header = textNode('div', 'progress-header');
        header.appendChild(textNode('span', 'progress-label',
            wdpropText('dash.languageNamed', [wdpropText(name), code])));
        header.appendChild(textNode('span', 'progress-value', percentage + '%'));
        item.appendChild(header);

        const track = textNode('div', 'progress-bar-container');
        /*
         * The bar is one way of reading the figure beside it, not the only
         * one, so it is hidden from screen readers rather than repeated.
         */
        track.setAttribute('aria-hidden', 'true');
        track.setAttribute('title',
            wdpropText('dash.coverageOf', [translated.toLocaleString(), total.toLocaleString()]));

        const level = percentage >= 90 ? 'high' : (percentage >= 50 ? 'medium' : 'low');
        const bar = textNode('div', 'progress-bar ' + level);
        bar.style.width = percentage + '%';
        track.appendChild(bar);
        item.appendChild(track);

        list.appendChild(item);
    });
}

function updateTranslationProgress() {
    const list = document.getElementById('translationProgress');
    if (list) {
        clearNode(list);
        list.appendChild(textNode('p', 'wdp-empty', wdpropText('js.fetching')));
    }

    queryDashboardData(coverageQuery()).then(json => {
        if (!json.results || !json.results.bindings.length) {
            throw new Error('The coverage query returned nothing.');
        }
        renderCoverage(json.results.bindings[0]);
    }).catch(() => {
        showWidgetFailure(list);
    });
}

/*
 * The most used properties, from the report the Wikidata community keeps.
 */
function topPropertyIds() {
    const url = mediawikiEndpoint + '?action=query&prop=links&pllimit=500&origin=*' +
        '&titles=Wikidata:Database_reports/List_of_properties/Top100&format=json';

    return fetch(url).then(response => {
        if (!response.ok) {
            throw new Error('Wikidata answered ' + response.status);
        }
        return response.json();
    }).then(json => {
        record('mediawiki', true);
        if (json.error) {
            throw new Error(json.error.code || 'api');
        }

        const properties = [];
        const pages = (json.query && json.query.pages) || {};
        for (const page of Object.keys(pages)) {
            for (const link of pages[page].links || []) {
                if (link.title.indexOf('Property:') !== -1 && link.title !== 'Property:P') {
                    properties.push(link.title.replace('Property:', ''));
                }
            }
        }
        if (!properties.length) {
            throw new Error('The report page listed no properties.');
        }
        return properties.slice(0, 5);
    }).catch(error => {
        record('mediawiki', false);
        throw error;
    });
}

/*
 * Labels for all of them in one query. They used to be fetched one at a time
 * and each row appended as its own answer came back, so the rows arrived in
 * whichever order the network happened to return them — the ranks read #3,
 * #1, #5 down the page.
 */
function propertyLabels(ids) {
    const values = ids.map(id => 'wd:' + id).join(' ');
    const query = `SELECT ?property ?label WHERE {
      VALUES ?property { ${values} }
      ?property rdfs:label ?label.
      FILTER(lang(?label)="en")
    }`;

    return queryDashboardData(query).then(json => {
        const labels = {};
        for (const binding of json.results.bindings) {
            const id = binding.property.value.replace('http://www.wikidata.org/entity/', '');
            labels[id] = binding.label.value;
        }
        return labels;
    }).catch(() => {
        /* Without labels the identifiers still name the properties. */
        return {};
    });
}

function renderTopProperties(ids, labels, counts) {
    const table = document.getElementById('topProperties');
    if (!table) {
        return;
    }
    clearNode(table);

    ids.forEach((id, index) => {
        const row = document.createElement('tr');
        row.appendChild(textNode('td', 'rank', '#' + (index + 1)));

        const cell = document.createElement('td');
        const link = textNode('a', 'property-name', labels[id] || id);
        link.setAttribute('href', './property.html?property=' + id);
        cell.appendChild(link);
        cell.appendChild(textNode('div', 'property-id', id));
        row.appendChild(cell);

        /*
         * The real figure, or nothing. This column used to read "Top 1",
         * "Top 2" — the rank again, in a column headed by a usage count.
         */
        const used = counts && typeof counts[id] === 'number' ?
            WDProp.usage.format(counts[id]) : '';
        const usage = textNode('td', 'usage-count', used);
        if (used) {
            usage.setAttribute('title', wdpropText('translate.usedOn', [counts[id].toLocaleString()]));
        }
        row.appendChild(usage);

        table.appendChild(row);
    });
}

function updateTopProperties() {
    const table = document.getElementById('topProperties');
    if (table) {
        clearNode(table);
        const row = document.createElement('tr');
        const cell = textNode('td', null, wdpropText('js.fetching'));
        cell.setAttribute('colspan', '3');
        row.appendChild(cell);
        table.appendChild(row);
    }

    topPropertyIds().then(ids => {
        /*
         * Labels and usage counts are both optional decoration on a list that
         * is already correct, so the rows are not held back for either.
         */
        renderTopProperties(ids, {}, null);

        propertyLabels(ids).then(labels => {
            const counting = (window.WDProp && WDProp.usage) ?
                WDProp.usage.counts(ids).catch(() => null) : Promise.resolve(null);
            return counting.then(counts => renderTopProperties(ids, labels, counts));
        });
    }).catch(() => {
        if (table) {
            clearNode(table);
            const row = document.createElement('tr');
            const cell = textNode('td', 'wdp-empty', wdpropText('dash.loadFailed'));
            cell.setAttribute('colspan', '3');
            row.appendChild(cell);
            table.appendChild(row);
        }
    });
}

/*
 * How long ago, in words. Anything within the minute is "just now"; past an
 * hour the clock time is more use than a count of minutes.
 */
function whenText(at) {
    if (!at) {
        return wdpropText('dash.notYet');
    }
    const minutes = Math.floor((Date.now() - at.getTime()) / 60000);
    if (minutes < 1) {
        return wdpropText('dash.justNow');
    }
    if (minutes < 60) {
        return wdpropText('dash.minutesAgo', [minutes]);
    }
    return at.toLocaleTimeString();
}

/*
 * What the local cache of usage figures holds. usage.js keeps them for a day,
 * so this says how many are being reused rather than fetched again.
 */
function cacheText() {
    let cached = 0;
    try {
        const held = JSON.parse(localStorage.getItem('wdprop-usage-counts')) || {};
        const day = 24 * 60 * 60 * 1000;
        cached = Object.keys(held).filter(id => (Date.now() - held[id].at) < day).length;
    } catch (e) {
        cached = 0;
    }
    return cached ? wdpropText('dash.cacheHolding', [cached]) : wdpropText('dash.cacheEmpty');
}

function statusRow(labelKey, value, state) {
    const item = textNode('div', 'status-item');
    item.appendChild(textNode('span', 'status-label', wdpropText(labelKey)));

    const shown = textNode('span', 'status-value');
    if (state !== undefined) {
        /*
         * The dot repeats what the word beside it already says, so it is not
         * the only thing carrying the answer, and it is not announced twice.
         */
        const dot = textNode('span',
            state === true ? 'status-dot' : (state === false ? 'status-dot error' : 'status-dot warning'));
        dot.setAttribute('aria-hidden', 'true');
        shown.appendChild(dot);
    }
    shown.appendChild(document.createTextNode(value));
    item.appendChild(shown);
    return item;
}

function renderServiceStatus() {
    const grid = document.getElementById('serviceStatus');
    if (!grid) {
        return;
    }
    clearNode(grid);

    function word(state) {
        if (state === null) {
            return wdpropText('dash.checking');
        }
        return state ? wdpropText('dash.answering') : wdpropText('dash.notAnswering');
    }

    grid.appendChild(statusRow('dash.wikidataQueryService',
        word(serviceState.wdqs), serviceState.wdqs));
    grid.appendChild(statusRow('dash.mediawikiApi',
        word(serviceState.mediawiki), serviceState.mediawiki));
    grid.appendChild(statusRow('dash.lastUpdated', whenText(serviceState.at)));
    grid.appendChild(statusRow('dash.cacheStatus', cacheText()));
}

// Animate all stat values on page load
function initDashboard() {
    renderServiceStatus();
    updateHeroStats();
    updateTranslationProgress();

    // Add entrance animations to cards
    const cards = document.querySelectorAll('.stat-card, .dashboard-widget, .project-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 50));
    });
}

// Search input enhancements
function initSearchInput() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            const container = searchInput.closest('.search-widget');
            if (container) {
                container.style.transform = 'translateY(-4px)';
                container.style.boxShadow = '0 12px 40px var(--shadow-color)';
            }
        });

        searchInput.addEventListener('blur', () => {
            const container = searchInput.closest('.search-widget');
            if (container) {
                container.style.transform = '';
                container.style.boxShadow = '';
            }
        });
    }
}

// Add ripple effect to action buttons
function addRippleEffect(button, event) {
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');

    const rippleContainer = button.querySelector('.ripple');
    if (rippleContainer) {
        rippleContainer.remove();
    }

    button.appendChild(ripple);

    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Initialize ripple effects on action buttons
function initRippleEffects() {
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            addRippleEffect(button, e);
        });
    });
}

// Add CSS for ripple effect dynamically
function addRippleStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .action-btn {
            position: relative;
            overflow: hidden;
        }
        .ripple {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.4);
            transform: scale(0);
            animation: ripple-animation 0.6s ease-out;
            pointer-events: none;
        }
        @keyframes ripple-animation {
            to {
                transform: scale(2);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

function start() {
    initDashboard();
    initSearchInput();
    initRippleEffects();
    addRippleStyles();
    updateTopProperties();
}

// Initialize everything when DOM is ready
WDProp.ready(start);

/*
 * The four cards at the top of the dashboard are whole clickable panels rather
 * than links, so they need a handler. The destination is a page of WDProp
 * named in the markup, resolved against where WDProp is rather than where the
 * current page is.
 */
WDProp.actions.add({
    goTo: function (event, element, page) {
        var base = (WDProp.shell && WDProp.shell.base) || './';
        window.location.href = base + page;
    }
});
