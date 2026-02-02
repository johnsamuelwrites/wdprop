/**
 * wikiprojects.js — Searchable, virtually-scrolled WikiProjects table
 *
 * Strategy:
 *   1. Override getWikiProjects so that on the main listing page (no ?property= param)
 *      we fire a single SPARQL query WITHOUT LIMIT/OFFSET, fetching every project at once.
 *   2. Wrap createDivWikiProjects: let the original render its table into the hidden
 *      #allWikiProjects div, parse every row, then re-render into our virtual-scroll UI.
 *   3. Live client-side filter on every keystroke.
 *
 * When ?property= is present (WikiProjects-for-a-property mode), we fall through to the
 * original behaviour unchanged — that dataset is small enough not to need virtualisation.
 */

(function () {

    // ── state ──
    var allRows  = [];
    var filtered = [];
    var ROW_HEIGHT = 44;   // px — must match .vst-row height in CSS
    var BUFFER     = 5;

    // ── DOM refs ──
    var scrollEl, viewportEl, containerEl, searchEl, countEl, hiddenDiv;

    function resolveRefs() {
        scrollEl    = document.getElementById('wp-scroll');
        viewportEl  = document.getElementById('wp-scroll-viewport');
        containerEl = document.getElementById('wp-scroll-container');
        searchEl    = document.getElementById('wp-search');
        countEl     = document.getElementById('wp-count');
        hiddenDiv   = document.getElementById('allWikiProjects');
    }

    // ── Parse the table the original callback rendered ──
    function parseOriginalTable() {
        var table = hiddenDiv.querySelector('table');
        if (!table) return [];
        var rows = table.querySelectorAll('tr');
        var data = [];
        rows.forEach(function (tr) {
            var tds = tr.querySelectorAll('td');
            if (tds.length < 2) return;  // skip header <th> row
            var nameCell = tds[0];
            var linkCell = tds[1];
            var a = nameCell.querySelector('a');
            if (!a) return;
            var extHref  = a.getAttribute('href') || '';   // https://www.wikidata.org/wiki/...
            var name     = a.textContent.trim();
            var intLink  = linkCell.querySelector('a');
            var intHref  = intLink ? intLink.getAttribute('href') : '';  // wikiproject.html?project=...
            data.push({ name: name, extHref: extHref, intHref: intHref });
        });
        return data;
    }

    // ── Filter ──
    function applyFilter() {
        var q = searchEl ? searchEl.value.toLowerCase().trim() : '';
        if (q === '') {
            filtered = allRows;
        } else {
            filtered = allRows.filter(function (r) {
                return r.name.toLowerCase().indexOf(q) !== -1;
            });
        }
        updateCount();
        // Reset scroll to top when filter changes
        if (scrollEl) scrollEl.scrollTop = 0;
        renderVisibleRows();
    }

    function updateCount() {
        if (countEl) {
            countEl.innerHTML = '<strong>' + filtered.length.toLocaleString() + '</strong>' +
                (filtered.length !== allRows.length
                    ? ' of ' + allRows.length.toLocaleString()
                    : '');
        }
    }

    // ── Virtual scroll ──
    function renderVisibleRows() {
        if (!scrollEl || !viewportEl || !containerEl) return;

        var totalHeight = filtered.length * ROW_HEIGHT;
        viewportEl.style.height = totalHeight + 'px';

        var scrollTop = scrollEl.scrollTop;
        var clientH   = scrollEl.clientHeight;
        var startIdx  = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
        var endIdx    = Math.min(filtered.length, Math.ceil((scrollTop + clientH) / ROW_HEIGHT) + BUFFER);
        var offsetY   = startIdx * ROW_HEIGHT;

        containerEl.style.transform = 'translateY(' + offsetY + 'px)';

        var existingRows = containerEl.children;
        var needed       = endIdx - startIdx;

        while (existingRows.length > needed) {
            containerEl.removeChild(containerEl.lastChild);
        }

        for (var i = 0; i < needed; i++) {
            var dataIdx = startIdx + i;
            var item    = filtered[dataIdx];
            var row;
            if (i < existingRows.length) {
                row = existingRows[i];
            } else {
                row = document.createElement('div');
                row.className = 'vst-row';
                // name cell
                var nameCell = document.createElement('div');
                nameCell.className = 'vst-cell vst-cell-name';
                var a = document.createElement('a');
                a.className = 'vst-name-link';
                nameCell.appendChild(a);
                row.appendChild(nameCell);
                // internal link cell
                var linkCell = document.createElement('div');
                linkCell.className = 'vst-cell vst-cell-intlink';
                var intA = document.createElement('a');
                intA.className = 'vst-intlink';
                linkCell.appendChild(intA);
                row.appendChild(linkCell);
                containerEl.appendChild(row);
            }
            // update content
            var nameLink = row.querySelector('.vst-name-link');
            var intLink  = row.querySelector('.vst-intlink');
            nameLink.setAttribute('href', item.extHref);
            nameLink.textContent = item.name;
            intLink.setAttribute('href', item.intHref);
            intLink.textContent = item.intHref;
        }
    }

    // ── Scroll listener ──
    var rafPending = false;
    function onScroll() {
        if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(function () {
                renderVisibleRows();
                rafPending = false;
            });
        }
    }

    // ── Hook installation ──
    function installHook() {
        if (typeof createDivWikiProjects === 'undefined' ||
            typeof getWikiProjects === 'undefined') {
            setTimeout(installHook, 50);
            return;
        }

        // ── Override getWikiProjects to remove LIMIT/OFFSET on the main listing ──
        var originalGetWikiProjects = getWikiProjects;
        window.getWikiProjects = function () {
            // If there's a ?property= param, fall through to original (small dataset)
            var property = '';
            var reg = new RegExp("property=([^&#=]*)");
            var value = reg.exec(window.location.search);
            if (value != null) property = decodeURIComponent(value[1]);

            if (property !== '') {
                originalGetWikiProjects();
                return;
            }

            // Otherwise fire a query without LIMIT/OFFSET to get everything
            var fullQuery =
                'SELECT DISTINCT ?title WHERE {\n' +
                '  SERVICE wikibase:mwapi {\n' +
                '    bd:serviceParam wikibase:api "Search" .\n' +
                '    bd:serviceParam wikibase:endpoint "www.wikidata.org" .\n' +
                '    bd:serviceParam mwapi:srsearch "Wikidata:WikiProject" .\n' +
                '    ?title wikibase:apiOutput mwapi:title .\n' +
                '  }\n' +
                '  FILTER(contains(?title, "Wikidata:WikiProject" )).\n' +
                '}\n';
            queryWikidata(fullQuery, createDivWikiProjects, 'allWikiProjects');
        };

        // ── Wrap createDivWikiProjects to intercept and virtualise ──
        var originalCreateDivWikiProjects = createDivWikiProjects;
        window.createDivWikiProjects = function (divId, json) {
            // Let original render
            originalCreateDivWikiProjects(divId, json);

            // Only intercept the main listing target
            if (divId !== 'allWikiProjects') return;

            resolveRefs();
            allRows  = parseOriginalTable();
            filtered = allRows;

            // Show modern UI, hide original
            hiddenDiv.style.display = 'none';
            var modernUI = document.getElementById('wp-modern');
            if (modernUI) modernUI.style.display = 'block';

            updateCount();
            renderVisibleRows();

            // Wire search
            if (searchEl) {
                searchEl.addEventListener('input', applyFilter);
            }

            // Wire scroll
            if (scrollEl) {
                scrollEl.addEventListener('scroll', onScroll);
                window.addEventListener('resize', function () { renderVisibleRows(); });
            }

            requestAnimationFrame(renderVisibleRows);
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHook);
    } else {
        installHook();
    }

})();
