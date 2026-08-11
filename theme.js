/*
 * WDProp - Which theme the page opens in
 *
 * This file is small and loaded without defer, on purpose. It is the one
 * script that has to run before the page is painted: it writes the reader's
 * saved choice onto the root element, and anything that happens after the
 * first paint is a flash of the wrong colours.
 *
 * There are three states, and only two of them are a choice:
 *
 *   nothing saved    follow the system. The stylesheet does this on its own,
 *                    through prefers-color-scheme, so this file writes no
 *                    attribute at all and a reader with JavaScript turned off
 *                    still gets the theme their machine asked for
 *   "dark"           data-theme="dark"
 *   "light"          data-theme="light", which is not the same as nothing:
 *                    it means light on a machine set to dark, which the media
 *                    query alone cannot express
 *
 * The attribute goes on documentElement rather than body because body does
 * not exist yet while this runs.
 *
 * Author: John Samuel
 */

(function () {
    "use strict";

    var KEY = "wdprop-theme";

    /*
     * localStorage throws rather than returning null when a browser is set to
     * refuse storage to a page — including any file:// page in some browsers,
     * which is a way WDProp is meant to be usable. A theme is not worth an
     * exception that stops the rest of the page's scripts from running.
     */
    function saved() {
        try {
            return window.localStorage.getItem(KEY);
        } catch (e) {
            return null;
        }
    }

    function store(value) {
        try {
            window.localStorage.setItem(KEY, value);
        } catch (e) {
            /* The theme lasts for this page only. Nothing else is affected. */
        }
    }

    function systemPrefersDark() {
        return typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    /* The theme in force now, whether chosen or inherited from the system. */
    function current() {
        var choice = saved();
        if (choice === "dark" || choice === "light") {
            return choice;
        }
        return systemPrefersDark() ? "dark" : "light";
    }

    function apply(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    /*
     * Switching returns to following the system when the reader picks the
     * theme the system was already asking for, rather than pinning it. Someone
     * who toggles to dark on a machine that is dark at night and light by day
     * has expressed no preference worth remembering.
     */
    function toggle() {
        var next = current() === "dark" ? "light" : "dark";
        if (next === (systemPrefersDark() ? "dark" : "light")) {
            try {
                window.localStorage.removeItem(KEY);
            } catch (e) {
                /* Nothing to clear. */
            }
            document.documentElement.removeAttribute("data-theme");
        } else {
            store(next);
            apply(next);
        }
        return next;
    }

    /* Runs now, not on load: the point is to be ahead of the first paint. */
    var choice = saved();
    if (choice === "dark" || choice === "light") {
        apply(choice);
    }

    window.WDProp = window.WDProp || {};
    window.WDProp.theme = { current: current, toggle: toggle, apply: apply };
})();
