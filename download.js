/*
 * WDProp - Taking away what is on the screen
 *
 * Every figure WDProp shows was fetched to be looked at once and then thrown
 * away. A listing that took twenty seconds to assemble cannot be cited, cannot
 * be put in a spreadsheet beside last month's, and cannot be handed to someone
 * without sending them the link and hoping the query still answers. The tool
 * has papers written about it and no way to get a table out of it.
 *
 * So: a table leaves as CSV or JSON, and a diagram leaves as SVG. Both are
 * made here from what is already in the page — no request is sent, and nothing
 * is asked of Wikidata that the page has not already asked.
 *
 * Two things this has to be honest about.
 *
 * The rows of a long listing are filled as they are paged to, so a table of
 * four thousand properties may hold four thousand identifiers and only the
 * fifty names that have been looked at. Exporting that silently would produce
 * a file that reads as though Wikidata had no name for 3,950 properties. The
 * control says how many rows are named, the file carries every row it has, and
 * a row that was never fetched is empty rather than guessed at.
 *
 * A diagram styled with var(--text-primary) is styled by a stylesheet that is
 * not coming with it. Left alone, the labels of a downloaded SVG resolve to
 * nothing and the file opens blank. Every custom property is therefore
 * resolved to the colour it currently stands for, so the file is what was on
 * screen rather than a reference to a page it has left.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var SVG_NS = "http://www.w3.org/2000/svg";
    var XLINK_NS = "http://www.w3.org/1999/xlink";

    function text(key, params) {
        return (WDProp.i18n && WDProp.i18n.t) ? WDProp.i18n.t(key, params) : key;
    }

    /* ------------------------------------------------------------- delivering */

    /*
     * The same few lines qs.js and offline.js each grew a copy of. A download
     * changes nothing on the page, so there is nothing to report afterwards.
     */
    function save(content, filename, type) {
        var blob = new Blob([content], { type: type });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /* --------------------------------------------------------------- reading */

    /*
     * What a cell says, as a reader sees it. Not innerHTML: a label cell holds
     * the term and, when the language has not reached it, a note in a span
     * saying so. Both are text and both belong in the file; the markup around
     * them does not.
     */
    function cellText(cell) {
        return String(cell.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function isHeaderRow(row) {
        return row.children.length > 0 && row.children[0].tagName === "TH";
    }

    /*
     * A table as headings and rows. Every row the table holds, not only the
     * page on show — paging hides rows, it does not remove them, and a reader
     * asking for the table means the table.
     */
    function readTable(table) {
        var headings = [];
        var rows = [];
        var all = table.rows ? Array.prototype.slice.call(table.rows) : [];

        for (var i = 0; i < all.length; i++) {
            var cells = Array.prototype.slice.call(all[i].cells || []);
            if (isHeaderRow(all[i])) {
                if (!headings.length) {
                    headings = cells.map(cellText);
                }
                continue;
            }
            rows.push(cells.map(cellText));
        }

        return { headings: headings, rows: rows };
    }

    /*
     * How many rows have been fetched, which is what the control reports. A row
     * is counted as named when anything beyond its identifier has arrived —
     * the placeholder is a single ellipsis, and an empty cell is a cell that
     * was never asked about.
     */
    function namedRows(read) {
        var named = 0;
        for (var i = 0; i < read.rows.length; i++) {
            var rest = read.rows[i].slice(1);
            for (var j = 0; j < rest.length; j++) {
                if (rest[j] && rest[j] !== "…") {
                    named++;
                    break;
                }
            }
        }
        return named;
    }

    /* ------------------------------------------------------------------- CSV */

    /*
     * RFC 4180. A field holding a comma, a quote or a newline is quoted and its
     * quotes are doubled — property descriptions contain all three, and a
     * spreadsheet given an unquoted one silently gains a column.
     */
    function csvField(value) {
        var field = String(value === null || value === undefined ? "" : value);
        if (/[",\r\n]/.test(field)) {
            return '"' + field.split('"').join('""') + '"';
        }
        return field;
    }

    function csvText(read) {
        var lines = [];
        if (read.headings.length) {
            lines.push(read.headings.map(csvField).join(","));
        }
        for (var i = 0; i < read.rows.length; i++) {
            lines.push(read.rows[i].map(csvField).join(","));
        }
        return lines.join("\r\n") + "\r\n";
    }

    /* ------------------------------------------------------------------ JSON */

    /*
     * Objects keyed by heading rather than arrays of cells, so the file says
     * what each value is without the reader counting columns. Headings are
     * taken as the interface shows them, which means a file downloaded from a
     * page being read in French has French keys — that is what was on screen,
     * and guessing at canonical English names for columns whose English the
     * page never showed would be inventing a schema.
     */
    function jsonText(read) {
        var out = [];
        for (var i = 0; i < read.rows.length; i++) {
            var record = {};
            for (var j = 0; j < read.rows[i].length; j++) {
                record[read.headings[j] || String(j + 1)] = read.rows[i][j];
            }
            out.push(record);
        }
        return JSON.stringify(out, null, 2) + "\n";
    }

    /* ------------------------------------------------------------------- SVG */

    /*
     * Every custom property in the copy replaced by what it currently stands
     * for. A downloaded file is opened away from the stylesheet that gave
     * var(--text-primary) a meaning, and an SVG whose text is filled with an
     * unresolvable colour draws no text at all.
     */
    function resolveVariables(node, computed) {
        var attributes = ["fill", "stroke", "color", "stop-color"];

        function fix(value) {
            return String(value).replace(/var\(\s*(--[a-z0-9-]+)\s*\)/gi,
                function (whole, name) {
                    var resolved = computed.getPropertyValue(name);
                    return resolved ? resolved.trim() : whole;
                });
        }

        function walk(element) {
            for (var i = 0; i < attributes.length; i++) {
                var name = attributes[i];
                if (element.hasAttribute && element.hasAttribute(name)) {
                    element.setAttribute(name, fix(element.getAttribute(name)));
                }
                if (element.style && element.style.getPropertyValue(name)) {
                    element.style.setProperty(name,
                        fix(element.style.getPropertyValue(name)));
                }
            }
            var children = element.children || [];
            for (var c = 0; c < children.length; c++) {
                walk(children[c]);
            }
        }

        walk(node);
        return node;
    }

    /*
     * A diagram as a file that stands on its own: the namespaces a bare
     * <svg> in an HTML page does without, the colours resolved, and a
     * background, since an SVG is transparent and the diagram is drawn in
     * colours chosen against the page it was on.
     */
    function svgText(svg) {
        var copy = svg.cloneNode(true);
        var computed = window.getComputedStyle(document.documentElement);

        copy.setAttribute("xmlns", SVG_NS);
        copy.setAttribute("xmlns:xlink", XLINK_NS);
        if (!copy.getAttribute("width") && svg.getBoundingClientRect) {
            var box = svg.getBoundingClientRect();
            copy.setAttribute("width", Math.round(box.width));
            copy.setAttribute("height", Math.round(box.height));
        }

        resolveVariables(copy, computed);

        var background = document.createElementNS(SVG_NS, "rect");
        background.setAttribute("x", "0");
        background.setAttribute("y", "0");
        background.setAttribute("width", "100%");
        background.setAttribute("height", "100%");
        background.setAttribute("fill",
            (computed.getPropertyValue("--bg-secondary") || "#ffffff").trim());
        copy.insertBefore(background, copy.firstChild);

        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            new XMLSerializer().serializeToString(copy) + "\n";
    }

    /* -------------------------------------------------------------- the control */

    function button(label, onClick) {
        var control = document.createElement("button");
        control.setAttribute("type", "button");
        control.setAttribute("class", "wdp-button wdp-download-button");
        control.appendChild(document.createTextNode(label));
        control.addEventListener("click", onClick);
        return control;
    }

    /*
     * Put under a table. `name` becomes the file name, so it says what the
     * table was of rather than "table.csv" for all thirty of them.
     */
    function offerTable(table, name) {
        if (!table) {
            return null;
        }

        var box = document.createElement("div");
        box.setAttribute("class", "wdp-download");

        var note = document.createElement("span");
        note.setAttribute("class", "wdp-download-note");
        box.appendChild(note);

        function refresh() {
            var read = readTable(table);
            var named = namedRows(read);
            while (note.firstChild) {
                note.removeChild(note.firstChild);
            }
            /*
             * Said before the file is asked for, not after. A reader who has
             * looked at one page of four thousand rows should know that is
             * what they are about to take away.
             */
            note.appendChild(document.createTextNode(
                named < read.rows.length
                    ? text("download.partial", [read.rows.length, named])
                    : text("download.whole", [read.rows.length])));
            return read;
        }

        box.appendChild(button(text("download.csv"), function () {
            /*
             * A byte order mark, which is not decoration: without it a
             * spreadsheet opening this on a Windows machine reads the UTF-8 as
             * the local code page, and a file of Tamil labels arrives as
             * mojibake. The properties WDProp exists to translate are exactly
             * the ones this ruins.
             */
            save("﻿" + csvText(readTable(table)), name + ".csv",
                "text/csv;charset=utf-8");
        }));

        box.appendChild(button(text("download.json"), function () {
            save(jsonText(readTable(table)), name + ".json",
                "application/json;charset=utf-8");
        }));

        refresh();

        /*
         * The count follows the table. Rows are filled as they are paged to,
         * so a note written once would be out of date by the second page.
         */
        if (typeof MutationObserver === "function") {
            var watching = new MutationObserver(function () { refresh(); });
            watching.observe(table, { childList: true, subtree: true, characterData: true });
        }

        table.parentNode.insertBefore(box, table.nextSibling);
        return box;
    }

    function offerSvg(container, name) {
        if (!container) {
            return null;
        }
        var svg = container.querySelector ? container.querySelector("svg") : null;
        if (!svg) {
            return null;
        }

        var box = document.createElement("div");
        box.setAttribute("class", "wdp-download");
        box.appendChild(button(text("download.svg"), function () {
            save(svgText(svg), name + ".svg", "image/svg+xml;charset=utf-8");
        }));

        container.appendChild(box);
        return box;
    }

    WDProp.download = {
        save: save,
        readTable: readTable,
        namedRows: namedRows,
        csvField: csvField,
        csvText: csvText,
        jsonText: jsonText,
        svgText: svgText,
        resolveVariables: resolveVariables,
        offerTable: offerTable,
        offerSvg: offerSvg
    };
})(window.WDProp);
