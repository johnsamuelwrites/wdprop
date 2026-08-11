/*
 * WDProp - Moving through a long list a page at a time
 *
 * Two places page: the data tables, which hide rows already in the document,
 * and the translation workbench, which pages a list of properties and fetches
 * each page as it is reached. Those are different mechanisms and are still
 * separate. What they had in common was the control — a previous button, a
 * next button, and a line saying where you are — written twice, and the two
 * copies had already diverged on the part that matters least to look at and
 * most to use:
 *
 *   the tables      announced the position through role="status", so a screen
 *                   reader hears "Page 2 of 3" when the button is pressed
 *   the workbench   did not, so it changed forty rows well above the button
 *                   and said nothing at all
 *
 * The control is built here once and both use it, which settles that.
 *
 * The caller keeps the paging: it says how many pages there are and what the
 * position reads, and is told which page was asked for. This file does not
 * know what is being paged, and cannot — one is rows in a table, the other is
 * property identifiers waiting to be fetched.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    function button(label, onClick) {
        var element = document.createElement("button");
        element.setAttribute("type", "button");
        element.setAttribute("class", "wdp-button");
        element.appendChild(document.createTextNode(label));
        element.addEventListener("click", onClick);
        return element;
    }

    /*
     * options.previousText, options.nextText   what the buttons say
     * options.onChange(page)                   the page asked for, from zero
     */
    WDProp.pager = function (options) {
        var page = 0;
        var pages = 1;

        var bar = document.createElement("div");
        bar.setAttribute("class", "wdp-pager");

        function step(by) {
            var wanted = Math.min(Math.max(page + by, 0), pages - 1);
            if (wanted === page) {
                return;
            }
            page = wanted;
            options.onChange(page);
        }

        var previous = button(options.previousText, function () { step(-1); });
        var next = button(options.nextText, function () { step(1); });

        /*
         * Announced, because paging changes the rows well above the buttons,
         * where a screen reader has no reason to look and no way to know
         * anything happened.
         */
        var position = document.createElement("span");
        position.setAttribute("class", "wdp-pager-position");
        position.setAttribute("role", "status");
        position.setAttribute("aria-live", "polite");

        bar.appendChild(previous);
        bar.appendChild(position);
        bar.appendChild(next);

        return {
            element: bar,

            /* Where we now are: the page, how many there are, what to read. */
            update: function (currentPage, totalPages, positionText) {
                page = currentPage;
                pages = totalPages;
                position.textContent = positionText;
                previous.disabled = (page === 0);
                next.disabled = (page >= pages - 1);
            }
        };
    };
})(window.WDProp);
