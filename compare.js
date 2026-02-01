/**
 * compare.js — Animated horizontal bar chart visualization for compare.html
 *
 * Strategy:
 *   1. Wraps createDivTranslatedLabelsCount so that after the original renders
 *      its .language chips into the hidden #comparisonResults div, this code
 *      reads the chip text, parses language + count, and renders a bar chart
 *      into the visible chart area.
 *   2. A shared colorMap ensures the same language always gets the same color
 *      across Labels / Descriptions / Aliases charts.
 *   3. Bars animate their width via a requestAnimationFrame loop for a smooth
 *      fill effect on load / re-render.
 */

(function () {

    // 8-colour palette — distinct, accessible, works on dark and light backgrounds
    var PALETTE = [
        '#667eea', // indigo
        '#E67E22', // orange
        '#27AE60', // green
        '#9B59B6', // purple
        '#E74C3C', // red
        '#1ABC9C', // teal
        '#F39C12', // amber
        '#3498DB'  // sky blue
    ];

    // Maps languageCode → palette colour, stable across all three charts
    var colorMap = {};
    var colorIndex = 0;
    var generation = 0; // incremented on each new comparison to ignore stale callbacks

    function resetColors() {
        colorMap = {};
        colorIndex = 0;
        generation++;
    }

    function getColorFor(lang) {
        if (!(lang in colorMap)) {
            colorMap[lang] = PALETTE[colorIndex % PALETTE.length];
            colorIndex++;
        }
        return colorMap[lang];
    }

    // ── Mapping: hidden div id  →  chart container id
    var CHART_MAP = {
        'comparisonResultsLabels':       'compare-chart-labels',
        'comparisonResultsDescriptions': 'compare-chart-descriptions',
        'comparisonResultsAliases':      'compare-chart-aliases'
    };

    // ── Parse chips rendered by createDivTranslatedLabelsCount ──
    // Each chip is a <div class="language"><a>en (2847)</a></div>
    function parseChips(sourceDiv) {
        var chips = sourceDiv.querySelectorAll('.language a');
        var data = [];
        chips.forEach(function (a) {
            var txt = a.textContent.trim();        // "en (2847)"
            var match = txt.match(/^(.+?)\s*\((\d+)\)$/);
            if (match) {
                data.push({
                    lang: match[1].trim(),
                    count: parseInt(match[2], 10),
                    href: a.getAttribute('href') || '#'
                });
            }
        });
        return data; // already sorted DESC by SPARQL
    }

    // ── Render a horizontal bar chart ──
    function renderCompareChart(chartId, data) {
        var container = document.getElementById(chartId);
        if (!container) return;
        container.innerHTML = ''; // clear previous

        if (data.length === 0) {
            container.innerHTML = '<p class="compare-chart-empty">No data available.</p>';
            return;
        }

        var max = data[0].count; // first item is the leader (DESC order)

        data.forEach(function (item, idx) {
            var pct = max > 0 ? (item.count / max) * 100 : 0;
            var color = getColorFor(item.lang);

            // Row
            var row = document.createElement('div');
            row.className = 'compare-bar-row';

            // Language label (clickable)
            var labelLink = document.createElement('a');
            labelLink.className = 'compare-bar-label';
            labelLink.href = item.href;
            labelLink.textContent = item.lang;
            labelLink.style.color = color;
            row.appendChild(labelLink);

            // Bar track (background)
            var track = document.createElement('div');
            track.className = 'compare-bar-track';

            // Bar fill
            var bar = document.createElement('div');
            bar.className = 'compare-bar-fill';
            bar.style.backgroundColor = color;
            bar.style.width = '0%'; // starts at 0, animated below
            track.appendChild(bar);
            row.appendChild(track);

            // Count badge
            var badge = document.createElement('span');
            badge.className = 'compare-bar-count';
            badge.textContent = item.count.toLocaleString();
            row.appendChild(badge);

            container.appendChild(row);

            // Animate bar fill after a staggered delay
            setTimeout(function () {
                bar.style.width = pct + '%';
            }, 60 + idx * 40);
        });
    }

    // ── Build the shareable URL row ──
    function updateURLRow() {
        var row = document.getElementById('compareURLRow');
        if (!row) return;
        var langInput = document.getElementById('languages');
        if (!langInput) return;
        var val = langInput.value;
        row.innerHTML = '';
        var label = document.createElement('span');
        label.className = 'compare-url-label';
        label.textContent = 'Share: ';
        row.appendChild(label);
        var link = document.createElement('a');
        link.className = 'compare-url-link';
        link.href = './compare.html?languages=' + val;
        link.textContent = 'compare.html?languages=' + val;
        row.appendChild(link);
    }

    // ── Tab switching ──
    window.switchCompareTab = function (tab) {
        ['labels', 'descriptions', 'aliases'].forEach(function (t) {
            document.getElementById('ctab-' + t).classList.toggle('active', t === tab);
            document.getElementById('cpanel-' + t).classList.toggle('active', t === tab);
        });
    };

    // ── Hook into createDivTranslatedLabelsCount ──
    // Wait for wdprop.js to define it, then wrap it.
    function installHook() {
        if (typeof createDivTranslatedLabelsCount === 'undefined' ||
            typeof getComparisonResult === 'undefined') {
            setTimeout(installHook, 50);
            return;
        }

        // Wrap getComparisonResult to reset colors and show the chart area
        // (with a loading spinner) BEFORE the 3 queries fire
        var originalGetComparison = getComparisonResult;
        window.getComparisonResult = function (search) {
            resetColors();

            // Reveal the chart area immediately so the loading spinner inside
            // each chart panel is visible while the fetches are in-flight
            var chartArea = document.getElementById('compareChartArea');
            if (chartArea) chartArea.style.display = 'block';

            // Place a loading spinner into each chart container
            ['compare-chart-labels', 'compare-chart-descriptions', 'compare-chart-aliases'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) {
                    el.innerHTML = '<div class="wdprop-loading"><span class="wdprop-loading-spinner"></span> Fetching data\u2026</div>';
                }
            });

            originalGetComparison(search);
        };

        // Wrap the callback to convert chips → bar chart
        var originalCallback = createDivTranslatedLabelsCount;
        window.createDivTranslatedLabelsCount = function (divId, json) {
            var myGen = generation; // snapshot generation at callback entry

            // Let the original render its chips into the hidden div
            originalCallback(divId, json);

            // Ignore stale callbacks from a previous comparison
            if (myGen !== generation) return;

            // If this divId is one we care about, convert to chart
            if (divId in CHART_MAP) {
                var sourceDiv = document.getElementById(divId);
                var data = parseChips(sourceDiv);
                renderCompareChart(CHART_MAP[divId], data);

                // Show the chart area once at least one chart has rendered
                var chartArea = document.getElementById('compareChartArea');
                if (chartArea) chartArea.style.display = 'block';

                updateURLRow();
            }
        };
    }

    // Install hook as soon as DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHook);
    } else {
        installHook();
    }

})();
