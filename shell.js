/*
 * WDProp - The chrome every page carries
 *
 * The skip link, the menu button, the header and the sidebar landmark were
 * written out by hand in all forty-one pages. The sidebar's *links* had
 * already been reduced to one list in wdprop.js; the frame around them had
 * not, and forty-one copies of anything drift. They had:
 *
 *   - ten pages under aliases/, labels/, descriptions/ and templates/ carried
 *     a header search box the other thirty-one did not have. It was styled
 *     `display: none` throughout, so it had never been visible on any of them,
 *     and the keyboard handler behind it — document.onkeydown in wdprop.js —
 *     read the value of an element that exists on no page that shows it. On
 *     the thirty-one it threw on every Enter key; on the ten it navigated to
 *     ./search.html, which from a subdirectory is a page that does not exist.
 *     Both are gone with it;
 *   - the theme and menu buttons were wired with inline onclick attributes,
 *     eighty-two of them, each a copy of the same two calls.
 *
 * This is a custom element rather than a template because there is no build
 * step to expand a template with and no server to include one: WDProp is
 * static files, and has to keep working when they are opened from a disk.
 * Custom elements need neither, and unlike ES modules they load from file://.
 *
 * It renders into the light DOM and then removes itself, leaving exactly the
 * markup the pages had before. A shadow root would be tidier and would break
 * everything: style.css addresses this markup by id, from a stylesheet that
 * cannot reach inside a shadow tree, and the rest of WDProp reaches it with
 * getElementById.
 *
 * Author: John Samuel
 */

(function () {
    "use strict";

    /*
     * Where WDProp's root is, worked out from this script's own address, so a
     * page in a subdirectory links back out correctly. wdprop.js does the same
     * with its own src; it has not run yet when this does, so the answer
     * cannot be borrowed from it.
     */
    var base = (function () {
        var script = document.currentScript;
        if (script && script.src) {
            return script.src.replace(/shell\.js(\?.*)?$/, "");
        }
        return "./";
    })();

    function el(tag, attrs, text) {
        var node = document.createElement(tag);
        for (var key in attrs || {}) {
            node.setAttribute(key, attrs[key]);
        }
        if (text !== undefined) {
            node.appendChild(document.createTextNode(text));
        }
        return node;
    }

    /*
     * The English text is written into the markup as well as the message key.
     * i18n.js goes over the document afterwards and replaces it, but until it
     * does — and if a message file fails to load — the page reads rather than
     * showing key names.
     */
    function build() {
        var fragment = document.createDocumentFragment();

        fragment.appendChild(
            el("a", { href: "#content", "class": "skip-link", "data-i18n": "a11y.skip" },
                "Skip to main content"));

        var menu = el("div", {
            id: "mobile-menu-toggle",
            role: "button",
            tabindex: "0",
            "aria-expanded": "false",
            "aria-controls": "sidebar",
            "data-i18n-label": "a11y.menuToggle",
            "aria-label": "Show or hide the navigation"
        });
        menu.appendChild(el("span"));
        menu.appendChild(el("span"));
        menu.appendChild(el("span"));
        fragment.appendChild(menu);

        var header = el("div", { id: "header", role: "banner" });
        var logo = el("div", { id: "logo" });
        logo.appendChild(el("a", { href: base + "index.html" }, "WDProp"));
        logo.appendChild(el("span", { id: "subtitle", "data-i18n": "app.subtitle" },
            "Everything about Wikidata properties"));
        header.appendChild(logo);
        header.appendChild(el("div", {
            id: "theme-toggle",
            role: "button",
            tabindex: "0",
            "data-i18n-label": "a11y.themeToggle",
            "data-i18n-title": "a11y.themeToggle",
            "aria-label": "Switch between light and dark theme",
            title: "Switch between light and dark theme"
        }));
        fragment.appendChild(header);

        var sidebar = el("div", {
            id: "sidebar",
            role: "navigation",
            "data-i18n-label": "a11y.nav",
            "aria-label": "Sections of WDProp"
        });
        sidebar.appendChild(el("div", { id: "sidebarlinks" }));
        fragment.appendChild(sidebar);

        return fragment;
    }

    /*
     * Both controls are divs with role="button". A real button answers Enter
     * and Space on its own; a div does not, so the keyboard is wired here or
     * neither control can be reached without a mouse.
     */
    function onActivate(element, action) {
        element.addEventListener("click", action);
        element.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                action();
            }
        });
    }

    function toggleMenu() {
        var sidebar = document.getElementById("sidebar");
        var toggle = document.getElementById("mobile-menu-toggle");
        if (!sidebar || !toggle) {
            return;
        }
        var open = sidebar.classList.toggle("mobile-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function toggleTheme() {
        if (window.WDProp && window.WDProp.theme) {
            window.WDProp.theme.toggle();
        }
    }

    function closeMenu() {
        var sidebar = document.getElementById("sidebar");
        var toggle = document.getElementById("mobile-menu-toggle");
        if (sidebar) {
            sidebar.classList.remove("mobile-open");
        }
        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }
    }

    function wire() {
        var theme = document.getElementById("theme-toggle");
        var menu = document.getElementById("mobile-menu-toggle");
        if (theme) {
            onActivate(theme, toggleTheme);
        }
        if (menu) {
            onActivate(menu, toggleMenu);
        }

        /* An open menu covers the page, so anywhere else closes it. */
        document.addEventListener("click", function (event) {
            var sidebar = document.getElementById("sidebar");
            var toggle = document.getElementById("mobile-menu-toggle");
            if (!sidebar || !toggle || !sidebar.classList.contains("mobile-open")) {
                return;
            }
            if (!sidebar.contains(event.target) && !toggle.contains(event.target)) {
                closeMenu();
            }
        });

        /*
         * And Escape, which is how a keyboard closes anything that covers the
         * page. Focus goes back to the button that opened it, or it is left
         * wherever the menu was when it vanished.
         */
        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" && event.key !== "Esc") {
                return;
            }
            var sidebar = document.getElementById("sidebar");
            if (sidebar && sidebar.classList.contains("mobile-open")) {
                closeMenu();
                var toggle = document.getElementById("mobile-menu-toggle");
                if (toggle) {
                    toggle.focus();
                }
            }
        });
    }

    class WDPropShell extends HTMLElement {
        /*
         * Replaces itself with its own contents rather than rendering inside
         * itself: the stylesheet lays the page out from #header, #sidebar and
         * #content as siblings, and an extra wrapper between them is a layout
         * change in four thousand lines of CSS for no gain.
         */
        connectedCallback() {
            if (!this.parentNode) {
                return;
            }
            this.replaceWith(build());
            wire();
        }
    }

    if (window.customElements && !window.customElements.get("wdprop-shell")) {
        window.customElements.define("wdprop-shell", WDPropShell);
    }

    window.WDProp = window.WDProp || {};
    window.WDProp.shell = { base: base, build: build, wire: wire };
})();
