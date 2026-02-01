/**
 * visualization.js — Language codes table with live names from Wikidata
 *
 * Fetches all language codes + their English names in a single SPARQL query,
 * then renders a searchable/filterable table. Each language links to its
 * language.html page.
 */

(function () {

    var SPARQL_QUERY = `SELECT DISTINCT ?code ?languageLabel WHERE {
      ?languageWiki wdt:P424 ?code ;
                    wdt:P407 ?language .
      ?language rdfs:label ?languageLabel .
      FILTER(lang(?languageLabel) = "en")
    }
    ORDER BY ?code`;

    // ── Fetch languages from Wikidata ──
    function fetchLanguages(callback) {
        var url = 'https://query.wikidata.org/sparql?query=' +
            encodeURIComponent(SPARQL_QUERY) + '&format=json';
        var loading = document.getElementById('viz-loading');
        if (loading) {
            loading.style.display = 'block';
            loading.innerHTML = '<span class="wdprop-loading-spinner"></span> Fetching data\u2026';
            loading.className = 'wdprop-loading';
        }

        fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (loading) loading.style.display = 'none';
                var rows = json.results.bindings.map(function (b) {
                    return {
                        code: b['code'].value,
                        name: b['languageLabel'].value
                    };
                });
                callback(rows);
            })
            .catch(function () {
                if (loading) loading.style.display = 'none';
                var err = document.getElementById('viz-error');
                if (err) err.style.display = 'block';
            });
    }

    // ── Render table ──
    function renderTable(allRows) {
        var tbody = document.getElementById('viz-tbody');
        var countEl = document.getElementById('viz-count');
        if (!tbody) return;

        tbody.innerHTML = '';
        allRows.forEach(function (row) {
            var tr = document.createElement('tr');
            tr.dataset.code = row.code.toLowerCase();
            tr.dataset.name = row.name.toLowerCase();

            // Code cell
            var tdCode = document.createElement('td');
            tdCode.className = 'viz-code';
            var link = document.createElement('a');
            link.href = './language.html?language=' + row.code;
            link.textContent = row.code;
            tdCode.appendChild(link);
            tr.appendChild(tdCode);

            // Name cell
            var tdName = document.createElement('td');
            tdName.className = 'viz-name';
            tdName.textContent = row.name;
            tr.appendChild(tdName);

            tbody.appendChild(tr);
        });

        if (countEl) countEl.textContent = allRows.length;
    }

    // ── Filter table rows based on search input ──
    function filterTable(query) {
        var q = query.toLowerCase().trim();
        var rows = document.querySelectorAll('#viz-tbody tr');
        var visible = 0;
        rows.forEach(function (tr) {
            var match = (q === '') ||
                tr.dataset.code.indexOf(q) !== -1 ||
                tr.dataset.name.indexOf(q) !== -1;
            tr.style.display = match ? '' : 'none';
            if (match) visible++;
        });
        var countEl = document.getElementById('viz-count');
        if (countEl) countEl.textContent = visible;
    }

    // ── Entry point ──
    window.initVisualization = function () {
        var searchInput = document.getElementById('viz-search');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                filterTable(this.value);
            });
        }

        fetchLanguages(function (rows) {
            renderTable(rows);
            // If there's a ?language= param in the URL, pre-fill search
            var match = window.location.search.match(/[?&]language=([^&#]*)/);
            if (match && searchInput) {
                searchInput.value = decodeURIComponent(match[1]);
                filterTable(searchInput.value);
            }
        });
    };

})();
