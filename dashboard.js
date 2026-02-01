/**
 * WDProp Dashboard
 * Real-time data from Wikidata with animations
 */

const dashboardEndpoint = 'https://query.wikidata.org/sparql';

// Counter animation for stat cards
function animateCounter(element, target) {
    const duration = 2000; // 2 seconds
    const start = 0;
    const increment = target / (duration / 16); // 60fps
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target.toLocaleString();
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current).toLocaleString();
        }
    }, 16);
}

// Fetch data from Wikidata
function queryDashboardData(sparqlQuery) {
    const fullUrl = dashboardEndpoint + '?query=' + encodeURIComponent(sparqlQuery) + "&format=json";
    const headers = { 'Accept': 'application/sparql-results+json' };

    return fetch(fullUrl, { headers })
        .then(response => response.json())
        .catch(error => {
            console.error('Dashboard query error:', error);
            return null;
        });
}

// Get total count of properties
function getTotalPropertiesCount() {
    const query = `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?property) as ?count)
    WHERE {
      ?property rdf:type wikibase:Property.
    }`;

    return queryDashboardData(query).then(json => {
        if (json && json.results && json.results.bindings.length > 0) {
            return parseInt(json.results.bindings[0].count.value);
        }
        return 0;
    });
}

// Get total count of languages
function getLanguagesCount() {
    const query = `SELECT (COUNT(DISTINCT ?language) as ?count)
    WHERE {
       [] wdt:P31 wd:Q10876391;
          wdt:P407 [wdt:P424 ?language]
    }`;

    return queryDashboardData(query).then(json => {
        if (json && json.results && json.results.bindings.length > 0) {
            return parseInt(json.results.bindings[0].count.value);
        }
        return 0;
    });
}

// Get total count of datatypes
function getDatatypesCount() {
    const query = `PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT (COUNT(DISTINCT ?datatype) as ?count)
    WHERE {
       [] wikibase:propertyType ?datatype.
    }`;

    return queryDashboardData(query).then(json => {
        if (json && json.results && json.results.bindings.length > 0) {
            return parseInt(json.results.bindings[0].count.value);
        }
        return 0;
    });
}

// Get total count of property classes (mirrors allClassesQuery in wdprop.js)
function getPropertyClassesCount() {
    const query = `PREFIX wikibase: <http://wikiba.se/ontology#>
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
    }`;

    return queryDashboardData(query).then(json => {
        if (json && json.results && json.results.bindings.length > 0) {
            return parseInt(json.results.bindings[0].count.value);
        }
        return 0;
    });
}

// Get translation statistics for top languages
function getTranslationStats() {
    const languages = [
        { code: 'en', name: 'English' },
        { code: 'de', name: 'German' },
        { code: 'fr', name: 'French' },
        { code: 'es', name: 'Spanish' },
        { code: 'ja', name: 'Japanese' }
    ];

    const promises = languages.map(lang => {
        const query = `PREFIX wikibase: <http://wikiba.se/ontology#>
        SELECT
          (COUNT(DISTINCT ?property) as ?total)
          (COUNT(DISTINCT ?label) as ?translated)
        WHERE {
          ?property rdf:type wikibase:Property.
          OPTIONAL {
            ?property rdfs:label ?label.
            FILTER(lang(?label)="${lang.code}")
          }
        }`;

        return queryDashboardData(query).then(json => {
            if (json && json.results && json.results.bindings.length > 0) {
                const binding = json.results.bindings[0];
                const total = parseInt(binding.total.value);
                const translated = parseInt(binding.translated.value);
                const percentage = total > 0 ? Math.round((translated / total) * 100) : 0;

                return {
                    code: lang.code,
                    name: lang.name,
                    percentage: percentage,
                    translated: translated,
                    total: total
                };
            }
            return { code: lang.code, name: lang.name, percentage: 0, translated: 0, total: 0 };
        });
    });

    return Promise.all(promises);
}

// Update hero stats with real data
function updateHeroStats() {
    const stats = document.querySelectorAll('.stat-value[data-target]');

    // Update Total Properties
    getTotalPropertiesCount().then(count => {
        if (count > 0 && stats[0]) {
            stats[0].setAttribute('data-target', count);
            animateCounter(stats[0], count);
        }
    });

    // Update Languages
    getLanguagesCount().then(count => {
        if (count > 0 && stats[1]) {
            stats[1].setAttribute('data-target', count);
            animateCounter(stats[1], count);
        }
    });

    // Update Data Types
    getDatatypesCount().then(count => {
        if (count > 0 && stats[2]) {
            stats[2].setAttribute('data-target', count);
            animateCounter(stats[2], count);
        }
    });

    // Update Property Classes
    getPropertyClassesCount().then(count => {
        if (count > 0 && stats[3]) {
            stats[3].setAttribute('data-target', count);
            animateCounter(stats[3], count);
        }
    });
}

// Update translation progress bars with real data
function updateTranslationProgress() {
    getTranslationStats().then(stats => {
        stats.forEach((lang, index) => {
            const progressItems = document.querySelectorAll('.progress-item');
            if (progressItems[index]) {
                const labelEl = progressItems[index].querySelector('.progress-label');
                const valueEl = progressItems[index].querySelector('.progress-value');
                const barEl = progressItems[index].querySelector('.progress-bar');

                if (labelEl) labelEl.textContent = `${lang.name} (${lang.code})`;
                if (valueEl) valueEl.textContent = `${lang.percentage}%`;
                if (barEl) {
                    barEl.style.width = `${lang.percentage}%`;

                    // Update color class based on percentage
                    barEl.classList.remove('high', 'medium', 'low');
                    if (lang.percentage >= 90) {
                        barEl.classList.add('high');
                    } else if (lang.percentage >= 50) {
                        barEl.classList.add('medium');
                    } else {
                        barEl.classList.add('low');
                    }
                }
            }
        });
    });
}

// Animate all stat values on page load
function initDashboard() {
    // Show loading state
    const statValues = document.querySelectorAll('.stat-value[data-target]');
    statValues.forEach(stat => {
        stat.textContent = '...';
    });

    // Fetch and update real data
    updateHeroStats();
    updateTranslationProgress();

    // Animate progress bars
    setTimeout(() => {
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach((bar, index) => {
            const width = bar.style.width;
            bar.style.width = '0%';
            setTimeout(() => {
                bar.style.width = width;
            }, 500 + (index * 100));
        });
    }, 1000);

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

// Update last updated time
function updateLastUpdatedTime() {
    const statusItems = document.querySelectorAll('.status-item');
    statusItems.forEach(item => {
        const label = item.querySelector('.status-label');
        if (label && label.textContent === 'Last Updated') {
            const valueElement = item.querySelector('.status-value');
            if (valueElement) {
                const now = new Date();
                valueElement.textContent = 'Just now';
            }
        }
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

// Get Top Properties from MediaWiki
function getTopPropertiesFromMediaWiki() {
    const url = 'https://www.wikidata.org/w/api.php?action=query&prop=links&pllimit=500&origin=*&titles=Wikidata:Database_reports/List_of_properties/Top100&format=json';

    return fetch(url)
        .then(response => response.json())
        .then(json => {
            const properties = [];
            for (const page of Object.keys(json.query.pages)) {
                for (const link of json.query.pages[page].links || []) {
                    if (link.title.indexOf("Property:") !== -1 && link.title !== "Property:P") {
                        const propertyId = link.title.replace("Property:", "");
                        properties.push(propertyId);
                    }
                }
            }
            return properties.slice(0, 5); // Return top 5
        })
        .catch(error => {
            console.error('Error fetching top properties:', error);
            return [];
        });
}

// Get property label for a given property ID
function getPropertyLabel(propertyId) {
    const query = `
        SELECT ?label WHERE {
          wd:${propertyId} rdfs:label ?label.
          FILTER(lang(?label)="en")
        }
    `;

    return queryDashboardData(query).then(json => {
        if (json && json.results && json.results.bindings.length > 0) {
            return json.results.bindings[0].label.value;
        }
        return propertyId;
    });
}

// Update Top Properties table with real data
function updateTopProperties() {
    getTopPropertiesFromMediaWiki().then(propertyIds => {
        if (propertyIds.length === 0) return;

        const table = document.querySelector('.top-properties-table');
        if (!table) return;

        // Clear existing rows
        table.innerHTML = '';

        // Add new rows with real data
        propertyIds.forEach((propId, index) => {
            getPropertyLabel(propId).then(label => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="rank">#${index + 1}</td>
                    <td>
                        <div class="property-name">${label}</div>
                        <div class="property-id">${propId}</div>
                    </td>
                    <td class="usage-count">Top ${index + 1}</td>
                `;
                table.appendChild(tr);
            });
        });
    });
}

// Initialize everything when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initDashboard();
        initSearchInput();
        initRippleEffects();
        addRippleStyles();
        updateLastUpdatedTime();
        updateTopProperties();
    });
} else {
    initDashboard();
    initSearchInput();
    initRippleEffects();
    addRippleStyles();
    updateLastUpdatedTime();
    updateTopProperties();
}
