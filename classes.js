/**
 * classes.js — Searchable, virtually-scrolled classes table
 *
 * Strategy (same wrapping pattern as compare.js):
 *   1. Let the original createDivClasses render its <table> into #propertyClasses
 *      (which is inside a hidden wrapper so the user never sees it).
 *   2. Parse every <tr> from that table into a plain array of {id, label} objects.
 *   3. Re-render into our own virtual-scroll container (#classes-scroll-viewport)
 *      with live client-side filtering.
 *
 * Virtual scroll keeps the live DOM to ~25 rows regardless of dataset size,
 * making 2 000+ row tables scroll at 60 fps with zero jank.
 */

(function () {

    // ── state ──
    var allRows = [];          // full dataset parsed from original table
    var filtered = [];         // subset after filter applied
    var ROW_HEIGHT = 44;       // px — must match CSS .vst-row height
    var BUFFER = 5;            // rows rendered above/below the visible window

    // ── DOM refs (resolved once after DOM is ready) ──
    var scrollEl, viewportEl, containerEl, searchEl, countEl, hiddenDiv;

    function resolveRefs() {
        scrollEl    = document.getElementById('classes-scroll');
        viewportEl  = document.getElementById('classes-scroll-viewport');
        containerEl = document.getElementById('classes-scroll-container');
        searchEl    = document.getElementById('classes-search');
        countEl     = document.getElementById('classes-count');
        hiddenDiv   = document.getElementById('propertyClasses');
    }

    // ── Parse the table that the original callback rendered ──
    function parseOriginalTable() {
        var table = hiddenDiv.querySelector('table');
        if (!table) return [];
        var rows = table.querySelectorAll('tbody tr, tr');  // covers both with/without tbody
        var data = [];
        rows.forEach(function (tr) {
            var tds = tr.querySelectorAll('td');
            if (tds.length < 2) return;  // skip header row (th)
            var idCell  = tds[0];
            var lblCell = tds[1];
            var a = idCell.querySelector('a');
            if (!a) return;
            var href = a.getAttribute('href') || '';
            var id   = a.textContent.trim();
            var label = lblCell.textContent.trim();
            data.push({ id: id, label: label, href: href });
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
                return r.id.toLowerCase().indexOf(q) !== -1 ||
                       r.label.toLowerCase().indexOf(q) !== -1;
            });
        }
        updateCount();
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

    // ── Virtual scroll rendering ──
    function renderVisibleRows() {
        if (!scrollEl || !viewportEl || !containerEl) return;

        var totalHeight = filtered.length * ROW_HEIGHT;
        viewportEl.style.height = totalHeight + 'px';

        var scrollTop   = scrollEl.scrollTop;
        var clientH     = scrollEl.clientHeight;
        var startIdx    = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
        var endIdx      = Math.min(filtered.length, Math.ceil((scrollTop + clientH) / ROW_HEIGHT) + BUFFER);
        var offsetY     = startIdx * ROW_HEIGHT;

        containerEl.style.transform = 'translateY(' + offsetY + 'px)';

        // Recycle: reuse existing row elements where possible
        var existingRows = containerEl.children;
        var needed       = endIdx - startIdx;

        // Remove excess rows
        while (existingRows.length > needed) {
            containerEl.removeChild(containerEl.lastChild);
        }

        for (var i = 0; i < needed; i++) {
            var dataIdx = startIdx + i;
            var item    = filtered[dataIdx];
            var row;
            if (i < existingRows.length) {
                row = existingRows[i];   // recycle
            } else {
                row = document.createElement('div');
                row.className = 'vst-row';
                // id cell
                var idCell = document.createElement('div');
                idCell.className = 'vst-cell vst-cell-id';
                var a = document.createElement('a');
                a.className = 'vst-id-link';
                idCell.appendChild(a);
                row.appendChild(idCell);
                // label cell
                var lblCell = document.createElement('div');
                lblCell.className = 'vst-cell vst-cell-label';
                row.appendChild(lblCell);
                containerEl.appendChild(row);
            }
            // update content
            var link  = row.querySelector('.vst-id-link');
            var label = row.querySelector('.vst-cell-label');
            link.setAttribute('href', item.href);
            link.textContent = item.id;
            label.textContent = item.label || item.id;
        }
    }

    // ── Scroll listener (throttled via rAF) ──
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

    // ── Hook: wrap createDivClasses ──
    function installHook() {
        if (typeof createDivClasses === 'undefined') {
            setTimeout(installHook, 50);
            return;
        }

        var originalCreateDivClasses = createDivClasses;
        window.createDivClasses = function (divId, json) {
            // Let original render its table into the hidden div
            originalCreateDivClasses(divId, json);

            // Only intercept the main classes page target
            if (divId !== 'propertyClasses') return;

            resolveRefs();
            allRows  = parseOriginalTable();
            filtered = allRows;

            // Show the modern UI, hide the original
            hiddenDiv.style.display = 'none';
            var modernUI = document.getElementById('classes-modern');
            if (modernUI) modernUI.style.display = 'block';

            updateCount();
            renderVisibleRows();

            // Wire up search
            if (searchEl) {
                searchEl.addEventListener('input', applyFilter);
            }

            // Wire up scroll
            if (scrollEl) {
                scrollEl.addEventListener('scroll', onScroll);
                // Also re-render on resize
                window.addEventListener('resize', function () { renderVisibleRows(); });
            }

            // Initial render after a frame (ensures scroll container has measured height)
            requestAnimationFrame(renderVisibleRows);
        };
    }

    // Install hook as soon as DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHook);
    } else {
        installHook();
    }

})();
