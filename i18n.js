/*
 * WDProp - Interface localisation
 *
 * Messages are JavaScript, not JSON, and arrive through ordinary <script>
 * tags. That is deliberate: a browser treats a page opened from the file
 * system as an opaque origin and refuses fetch() and module imports against
 * it, so a JSON message store would leave WDProp blank when the pages are
 * opened directly from disk. Script tags are not subject to that rule, which
 * is why every other script in WDProp is loaded the same way — and why none
 * of them is an ES module, which a browser fetches under those same rules.
 *
 * English is loaded by every page as a plain script tag, so it is always
 * present. Any other language is added afterwards by injecting a script; if
 * that file is missing or fails to load, English simply remains. The default
 * cannot break, because it is the only thing loaded unconditionally.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var FALLBACK = "en";
    var STORAGE_KEY = "wdprop-language";

    var AVAILABLE = [
        { code: "en", name: "English" },
        { code: "fr", name: "Français" },
        { code: "es", name: "Español" }
    ];

    var messages = {};
    var current = FALLBACK;
    var requested = null;

    /*
     * Where the other message files live, worked out from this script's own
     * location so that pages in subdirectories load them correctly.
     */
    var base = (function () {
        var script = document.currentScript;
        if (script && script.src) {
            return script.src.replace(/i18n\.js(\?.*)?$/, "");
        }
        return "";
    })();

    function add(language, dictionary) {
        messages[language] = messages[language] || {};
        Object.keys(dictionary).forEach(function (key) {
            messages[language][key] = dictionary[key];
        });

        // A language may arrive after the page has been laid out.
        if (language === current || language === requested) {
            current = language;
            apply();
        }
    }

    /*
     * The message for a key, falling back to English and then to the key
     * itself, so a missing translation shows something usable rather than
     * nothing. $1, $2 … are replaced by the given parameters.
     */
    function t(key, params) {
        var text = (messages[current] && messages[current][key]);
        if (text === undefined) {
            text = (messages[FALLBACK] && messages[FALLBACK][key]);
        }
        if (text === undefined) {
            return key;
        }
        if (params && params.length) {
            params.forEach(function (value, index) {
                text = text.split("$" + (index + 1)).join(String(value));
            });
        }
        return text;
    }

    /*
     * Applies the current language to the page.
     *
     *   data-i18n              replaces the element's text
     *   data-i18n-html         replaces its markup, for messages that contain
     *                          a link; message files are part of WDProp, not
     *                          user input, so this stays under our control
     *   data-i18n-title        sets the title attribute
     *   data-i18n-label        sets aria-label, for icon-only controls
     *   data-i18n-placeholder  sets the placeholder attribute
     */
    function apply(root) {
        var scope = root || document;

        each(scope, "[data-i18n]", function (node, key) {
            var text = t(key);
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
            node.appendChild(document.createTextNode(text));
        }, "i18n");

        each(scope, "[data-i18n-html]", function (node, key) {
            node.innerHTML = t(key);
        }, "i18nHtml");

        each(scope, "[data-i18n-title]", function (node, key) {
            node.setAttribute("title", t(key));
        }, "i18nTitle");

        /* Names a control that shows only an icon, for screen readers. */
        each(scope, "[data-i18n-label]", function (node, key) {
            node.setAttribute("aria-label", t(key));
        }, "i18nLabel");

        each(scope, "[data-i18n-placeholder]", function (node, key) {
            node.setAttribute("placeholder", t(key));
        }, "i18nPlaceholder");

        var title = document.querySelector("[data-i18n-title-tag]");
        if (title) {
            document.title = t(title.getAttribute("data-i18n-title-tag"));
        }

        document.documentElement.setAttribute("lang", current);
        showCurrentInSwitcher();
    }

    /*
     * The chooser has to say which language is being shown.
     *
     * It did not. mountSwitcher runs before setLanguage — the switcher has to
     * exist before there is a language to mark in it — so the option it marked
     * as selected was whatever `current` was at the time, which is the fallback
     * and always English. Then the language was worked out, the page was
     * translated into French, and nothing went back to the chooser: it read
     * "English" over a French page, and picking French from it did nothing
     * visible, French already being what was on screen.
     *
     * The selected option cannot be settled once at mount for the further
     * reason that a language other than English arrives asynchronously — the
     * message file is fetched by a script tag — so `current` changes again when
     * it lands. Doing it here means it is put right whenever the language
     * actually takes effect, which is the only moment that is true for every
     * route in: uselang in the address, the stored choice, and the browser's
     * own setting.
     */
    function showCurrentInSwitcher() {
        var select = document.getElementById("language-switcher");
        if (!select) {
            return;
        }

        if (select.value !== current) {
            select.value = current;
        }

        /*
         * The attribute as well as the property. They are the same thing to a
         * browser once the element is live, but the attribute is what a test
         * reading the built markup sees, and what a page restored from the
         * back-forward cache is rebuilt from.
         */
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === current) {
                select.options[i].setAttribute("selected", "selected");
            } else {
                select.options[i].removeAttribute("selected");
            }
        }
    }

    function each(scope, selector, fn, dataKey) {
        var nodes = scope.querySelectorAll(selector);
        for (var i = 0; i < nodes.length; i++) {
            fn(nodes[i], nodes[i].dataset[dataKey]);
        }
    }

    function known(language) {
        return AVAILABLE.some(function (entry) {
            return entry.code === language;
        });
    }

    /*
     * Loads a language and switches to it. English is already present, so it
     * never needs fetching.
     */
    function setLanguage(language) {
        if (!known(language)) {
            language = FALLBACK;
        }

        try {
            localStorage.setItem(STORAGE_KEY, language);
        } catch (e) {
            // Remembering the choice is optional.
        }

        /*
         * English arrives through its own script tag on every page, so it is
         * never fetched here — asking for it again would load the same file
         * twice if this runs before that tag has executed.
         */
        if (language === FALLBACK || messages[language]) {
            current = language;
            apply();
            return;
        }

        requested = language;
        var script = document.createElement("script");
        script.src = base + "i18n/" + language + ".js";
        script.onerror = function () {
            // The file is missing or blocked: English stays, nothing breaks.
            requested = null;
        };
        document.head.appendChild(script);
    }

    /*
     * uselang in the address follows MediaWiki, so a link can carry the
     * language; otherwise the last choice, then what the browser asks for.
     */
    function detect() {
        var match = /[?&]uselang=([^&#]*)/.exec(window.location.search);
        if (match) {
            var fromUrl = decodeURIComponent(match[1]);
            if (known(fromUrl)) {
                return fromUrl;
            }
        }

        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored && known(stored)) {
                return stored;
            }
        } catch (e) {
            // No stored preference available.
        }

        var browser = (navigator.language || "").toLowerCase().split("-")[0];
        return known(browser) ? browser : FALLBACK;
    }

    function mountSwitcher() {
        var header = document.getElementById("header");
        if (!header || document.getElementById("language-switcher")) {
            return;
        }

        var select = document.createElement("select");
        select.setAttribute("id", "language-switcher");
        select.setAttribute("class", "language-switcher");
        select.setAttribute("title", t("a11y.languageChooser"));
        select.setAttribute("aria-label", t("a11y.languageChooser"));

        AVAILABLE.forEach(function (entry) {
            var option = document.createElement("option");
            option.setAttribute("value", entry.code);
            if (entry.code === current) {
                option.setAttribute("selected", "selected");
            }
            option.appendChild(document.createTextNode(entry.name));
            select.appendChild(option);
        });

        select.addEventListener("change", function () {
            setLanguage(select.value);
        });

        var themeToggle = document.getElementById("theme-toggle");
        if (themeToggle) {
            header.insertBefore(select, themeToggle);
        } else {
            header.appendChild(select);
        }
    }

    WDProp.i18n = {
        add: add,
        t: t,
        apply: apply,
        setLanguage: setLanguage,
        available: AVAILABLE,
        current: function () {
            return current;
        }
    };

    function init() {
        mountSwitcher();
        setLanguage(detect());
    }

    /*
     * Waits, rather than starting here. The scripts are deferred, so this runs
     * before i18n/<lang>.js has registered a single message — starting now
     * would resolve every key on the page to its own name.
     *
     * It also has to be first: this registers before any other module, so the
     * page is translated before anything renders into it. See ready.js.
     */
    WDProp.ready(init);
})(window.WDProp);
