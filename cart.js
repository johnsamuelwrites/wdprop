/*
 * WDProp - Translation batch (cart)
 *
 * Holds translations proposed by the user until they are exported to
 * QuickStatements. Everything lives in localStorage: WDProp never writes
 * to Wikidata and never sends a proposal anywhere.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var STORAGE_KEY = "wdprop-translation-batch";
    var PREFS_KEY = "wdprop-translation-prefs";
    var listeners = [];

    /*
     * An entry is one proposed edit, not one property:
     *
     *   {
     *     id, property: "P1476", lang: "ta", type: "label",
     *     value: "தலைப்பு", pivot: "en", pivotValue: "title", added: <ts>
     *   }
     *
     * `pivot` records which language the translator was reading from. It is
     * not exported to QuickStatements (QuickStatements has nowhere to put
     * it), but it cannot be reconstructed afterwards, so it is kept here.
     */

    /*
     * Labels and descriptions are single valued per language, so a second
     * proposal for the same property replaces the first. Aliases accumulate,
     * so only an identical alias is treated as a duplicate.
     */
    function keyOf(entry) {
        if (entry.type === "alias") {
            return [entry.property, entry.lang, entry.type, entry.value].join("|");
        }
        return [entry.property, entry.lang, entry.type].join("|");
    }

    function read() {
        var raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return [];
        }
        if (!raw) {
            return [];
        }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            // Corrupt payload: better to start clean than to break every page.
            return [];
        }
    }

    function write(entries) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        } catch (e) {
            // Quota exceeded or storage disabled. The in-page state is still
            // correct for this session, so carry on rather than losing work.
        }
        notify(entries);
    }

    function notify(entries) {
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i](entries);
            } catch (e) {
                // A broken listener must not stop the others.
            }
        }
    }

    function newId() {
        return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    var cart = {
        list: function () {
            return read();
        },

        count: function () {
            return read().length;
        },

        /*
         * Adds a proposal, replacing an existing one with the same key.
         * Returns the stored entry, or null when the value is empty.
         */
        add: function (entry) {
            var value = String(entry.value == null ? "" : entry.value).trim();
            if (value === "") {
                return null;
            }

            var stored = {
                id: newId(),
                property: entry.property,
                lang: entry.lang,
                type: entry.type,
                value: value,
                pivot: entry.pivot || null,
                pivotValue: entry.pivotValue || null,
                added: Date.now()
            };

            var key = keyOf(stored);
            var entries = read().filter(function (e) {
                return keyOf(e) !== key;
            });
            entries.push(stored);
            write(entries);
            return stored;
        },

        remove: function (id) {
            write(read().filter(function (e) {
                return e.id !== id;
            }));
        },

        clear: function () {
            write([]);
        },

        /* True when this property/language/type already has a proposal. */
        has: function (property, lang, type) {
            var prefix = [property, lang, type].join("|");
            return read().some(function (e) {
                return keyOf(e) === prefix || keyOf(e).indexOf(prefix + "|") === 0;
            });
        },

        onChange: function (fn) {
            listeners.push(fn);
        },

        /* Remembers the last language pair so the next proposal is prefilled. */
        prefs: function () {
            try {
                return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
            } catch (e) {
                return {};
            }
        },

        savePrefs: function (prefs) {
            try {
                localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
            } catch (e) {
                // Preferences are a convenience; ignore storage failures.
            }
        },

        /*
         * Adds a link to the batch in the page header, showing how many
         * proposals are waiting. Safe to call on any page.
         */
        mountBadge: function () {
            var header = document.getElementById("header");
            if (!header || document.getElementById("cart-badge")) {
                return;
            }

            var prefix = window.WDPropPathPrefix || "./";
            var badge = document.createElement("a");
            badge.setAttribute("id", "cart-badge");
            badge.setAttribute("href", prefix + "batch.html");
            badge.setAttribute("title", WDProp.i18n ? WDProp.i18n.t("batch.heading") : "Translation batch");

            var themeToggle = document.getElementById("theme-toggle");
            if (themeToggle) {
                header.insertBefore(badge, themeToggle);
            } else {
                header.appendChild(badge);
            }

            function render(entries) {
                var n = entries ? entries.length : cart.count();
                badge.innerHTML = "";
                badge.appendChild(document.createTextNode("🧺 " + n));
                badge.setAttribute("class", n > 0 ? "cart-badge has-items" : "cart-badge");
            }

            cart.onChange(render);
            render(null);
        }
    };

    WDProp.cart = cart;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            cart.mountBadge();
        });
    } else {
        cart.mountBadge();
    }
})(window.WDProp);
