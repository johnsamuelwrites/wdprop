/*
 * WDProp - What the page is asking for, and how much of it
 *
 * Every figure WDProp shows is fetched while the reader waits, from two
 * services that are shared with everyone else using Wikidata. How many
 * requests a page costs is therefore a property of the page worth seeing, and
 * until now it was invisible: a listing that cost two requests and a listing
 * that cost fifty looked exactly alike from the outside, and the difference
 * only showed up as "this page is slow today".
 *
 * So this counts them, and shows the count.
 *
 *   - a dot in the header turns while anything is in flight and rests when
 *     nothing is, so there is somewhere to look other than an empty table;
 *   - beside it, the number of requests this page has made. That number is
 *     the one that matters: it should stay flat as a table is paged through,
 *     and a page whose cost grows with the number of rows on it is a page
 *     with a fault in it;
 *   - opening it lists what was actually asked for, in words — "terms of 50
 *     properties", not "action=wbgetentities" — with how long each took and
 *     whether it worked.
 *
 * It counts by replacing window.fetch rather than by asking each caller to
 * report itself. Callers forget, and a request that forgets to report is
 * exactly the one worth knowing about: the point of the number is to catch
 * the request nobody meant to make. Everything WDProp fetches goes through
 * fetch, so wrapping it once here sees all of it, including the parts written
 * before this file existed.
 *
 * What it deliberately does not do: send anything anywhere, or keep anything
 * between page loads. The log is a variable in this tab, it is thrown away
 * when the page is, and the count starts at nought each time a page opens —
 * which is what makes it a measure of that page.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    /*
     * Calls remembered for the panel. The count is not capped — it is the
     * figure the whole thing exists for — but the list behind it is, since a
     * long session on the workbench would otherwise grow without end.
     */
    var LIMIT = 50;

    var state = {
        inflight: 0,
        total: 0,
        calls: [],
        listeners: []
    };

    var nextId = 1;

    /* ------------------------------------------------------------ describing */

    /*
     * What a request is for, in terms of the thing being fetched rather than
     * the API being used. Worked out from the URL, because that is what a
     * wrapper around fetch has: no call site tells us what it is doing, and
     * the ones that could be asked to are the ones that already know.
     *
     * Returns a message key and its parameters, so the panel reads in the
     * reader's own language like everything else.
     */
    function describe(url) {
        var text = String(url || "");

        if (text.indexOf("query.wikidata.org") >= 0) {
            return { source: "activity.query", key: "activity.sparql", params: [] };
        }

        if (text.indexOf("quickstatements") >= 0) {
            return { source: "activity.other", key: "activity.quickstatements", params: [] };
        }

        if (text.indexOf("api.php") < 0) {
            return { source: "activity.other", key: "activity.request", params: [] };
        }

        var action = parameter(text, "action");

        if (action === "wbgetentities") {
            var ids = parameter(text, "ids");
            var count = ids ? decodeURIComponent(ids).split("|").length : 0;
            return {
                source: "activity.api",
                key: "activity.terms",
                params: [count]
            };
        }

        if (action === "parse") {
            var page = parameter(text, "page");
            return {
                source: "activity.api",
                key: "activity.page",
                params: [page ? shorten(decodeURIComponent(page.replace(/\+/g, " "))) : ""]
            };
        }

        if (action === "query") {
            if (parameter(text, "list") === "search") {
                var search = parameter(text, "srsearch");
                return {
                    source: "activity.api",
                    key: "activity.search",
                    params: [search ? shorten(decodeURIComponent(search.replace(/\+/g, " "))) : ""]
                };
            }
            if (parameter(text, "list") === "recentchanges") {
                return { source: "activity.api", key: "activity.changes", params: [] };
            }

            var prop = parameter(text, "prop") || "";
            if (prop.indexOf("revisions") >= 0) {
                return { source: "activity.api", key: "activity.revisions", params: [] };
            }
            if (prop.indexOf("links") >= 0) {
                return { source: "activity.api", key: "activity.links", params: [] };
            }
        }

        return { source: "activity.api", key: "activity.request", params: [] };
    }

    /* One query parameter out of a URL, without needing URL(), which wants an
     * absolute address and gets a relative one from more than one caller. */
    function parameter(url, name) {
        var match = new RegExp("[?&]" + name + "=([^&#]*)").exec(url);
        return match ? match[1] : null;
    }

    function shorten(text) {
        var value = String(text);
        return value.length > 42 ? value.slice(0, 41) + "…" : value;
    }

    /* --------------------------------------------------------------- counting */

    function record(entry) {
        state.calls.unshift(entry);
        if (state.calls.length > LIMIT) {
            state.calls.pop();
        }
    }

    function announce() {
        for (var i = 0; i < state.listeners.length; i++) {
            try {
                state.listeners[i](snapshot());
            } catch (e) {
                /* A listener that throws must not take the request with it. */
            }
        }
    }

    function begin(url) {
        var entry = {
            id: nextId++,
            what: describe(url),
            status: "pending",
            started: Date.now(),
            ms: null
        };

        state.inflight++;
        state.total++;
        record(entry);
        announce();
        return entry;
    }

    function end(entry, status, detail) {
        entry.status = status;
        entry.detail = detail;
        entry.ms = Date.now() - entry.started;
        state.inflight = Math.max(0, state.inflight - 1);
        announce();
    }

    /*
     * Something worth showing that was not a request — the usage counts being
     * answered out of the day's cache, say. Without these the panel is honest
     * but misleading: it shows the one request a page made and says nothing
     * about the fifty it did not have to make, which is the part worth being
     * pleased about.
     */
    function note(key, params) {
        record({
            id: nextId++,
            what: { source: "activity.local", key: key, params: params || [] },
            status: "local",
            started: Date.now(),
            ms: 0
        });
        announce();
    }

    function snapshot() {
        return {
            inflight: state.inflight,
            total: state.total,
            calls: state.calls.slice()
        };
    }

    function subscribe(listener) {
        state.listeners.push(listener);
        listener(snapshot());
    }

    /* ---------------------------------------------------------------- wrapping */

    /*
     * Wrapped once. A second copy of this file — or a test that loads it
     * twice — would otherwise count every request as two.
     */
    function watch(scope) {
        if (!scope || typeof scope.fetch !== "function" || scope.fetch.wdpropWatched) {
            return;
        }

        var native = scope.fetch;

        var wrapped = function (input, init) {
            var url = typeof input === "string"
                ? input
                : (input && input.url) || "";
            var entry = begin(url);

            return native.call(scope, input, init).then(function (response) {
                /*
                 * A 404 answered promptly is still a request that happened and
                 * still cost a round trip, so it is counted; it is marked as a
                 * failure so that a page full of them is visibly a page full
                 * of them.
                 */
                end(entry, response && response.ok ? "ok" : "failed",
                    response ? response.status : null);
                return response;
            }, function (error) {
                end(entry, "failed", null);
                throw error;
            });
        };

        wrapped.wdpropWatched = true;
        scope.fetch = wrapped;
    }

    /* ---------------------------------------------------------------- showing */

    var view = null;

    /*
     * The messages are not loaded yet when this is mounted: shell.js builds
     * the header before i18n.js has run, which is why everything it writes
     * carries an English fallback in the markup for i18n.js to replace.
     *
     * The same applies here, with one difference — the button's name carries a
     * number, so it cannot be written once into the markup and left to
     * i18n.js. It is rewritten as the count changes, and until the messages
     * are there the English written at mount is what stands.
     */
    function translating() {
        return !!(WDProp.i18n && WDProp.i18n.t);
    }

    function text(key, params) {
        return translating() ? WDProp.i18n.t(key, params) : key;
    }

    function el(tag, attrs, content) {
        var node = document.createElement(tag);
        for (var key in attrs || {}) {
            node.setAttribute(key, attrs[key]);
        }
        if (content !== undefined) {
            node.appendChild(document.createTextNode(content));
        }
        return node;
    }

    /*
     * The indicator, built into whatever the caller gives it — the header, in
     * practice, put there by shell.js so that it is on every page without
     * thirty-nine copies of the markup.
     */
    function mount(container) {
        if (!container || view) {
            return null;
        }

        var wrap = el("div", { "class": "wdp-activity" });

        var button = el("button", {
            type: "button",
            "class": "wdp-activity-button",
            "aria-expanded": "false",
            "aria-controls": "wdp-activity-log",
            "data-i18n-title": "activity.title",
            title: "What this page has asked Wikidata for",
            "aria-label": "0 requests for this page"
        });
        button.appendChild(el("span", { "class": "wdp-activity-dot", "aria-hidden": "true" }));
        var count = el("span", { "class": "wdp-activity-count" }, "0");
        button.appendChild(count);
        wrap.appendChild(button);

        /*
         * The count on its own is a number with no noun, which a screen reader
         * reads as a bare digit sitting in the banner. The button's accessible
         * name carries the noun and is rewritten as the number changes.
         */
        var status = el("span", { "class": "visually-hidden", role: "status" });
        wrap.appendChild(status);

        var panel = el("div", {
            id: "wdp-activity-log",
            "class": "wdp-activity-log",
            role: "region",
            "data-i18n-label": "activity.heading",
            "aria-label": "What this page has asked Wikidata for",
            hidden: "hidden"
        });
        wrap.appendChild(panel);

        view = {
            button: button, count: count, status: status, panel: panel,
            open: false, announced: null
        };

        button.addEventListener("click", function () {
            toggle();
        });

        /* Escape closes it, as it does the other panel WDProp opens. */
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && view && view.open) {
                toggle(false);
            }
        });

        container.appendChild(wrap);
        subscribe(draw);
        return wrap;
    }

    function toggle(force) {
        if (!view) {
            return;
        }
        view.open = force === undefined ? !view.open : force;
        view.button.setAttribute("aria-expanded", view.open ? "true" : "false");
        if (view.open) {
            view.panel.removeAttribute("hidden");
        } else {
            view.panel.setAttribute("hidden", "hidden");
        }
        draw(snapshot());
    }

    function draw(now) {
        if (!view) {
            return;
        }

        view.count.textContent = String(now.total);
        view.button.setAttribute("class",
            "wdp-activity-button" + (now.inflight > 0 ? " wdp-activity-busy" : ""));

        if (translating()) {
            var name = now.inflight > 0
                ? text("activity.busy", [now.inflight, now.total])
                : text("activity.idle", [now.total]);
            view.button.setAttribute("aria-label", name);

            /*
             * Said aloud only when the page settles, and only when the figure
             * has changed since it was last said. Announcing every request
             * would make a screen reader talk over a table of fifty rows
             * arriving.
             */
            if (now.inflight === 0 && view.announced !== now.total) {
                view.announced = now.total;
                view.status.textContent = name;
            }
        }

        if (view.open) {
            drawPanel(now);
        }
    }

    function drawPanel(now) {
        var panel = view.panel;
        while (panel.firstChild) {
            panel.removeChild(panel.firstChild);
        }

        panel.appendChild(el("h2", { "class": "wdp-activity-heading" },
            text("activity.heading")));

        if (!now.calls.length) {
            panel.appendChild(el("p", { "class": "wdp-activity-empty" },
                text("activity.none")));
            return;
        }

        var list = el("ul", { "class": "wdp-activity-list" });
        for (var i = 0; i < now.calls.length; i++) {
            list.appendChild(entryRow(now.calls[i]));
        }
        panel.appendChild(list);

        panel.appendChild(el("p", { "class": "wdp-activity-total" },
            text("activity.idle", [now.total])));
    }

    function entryRow(call) {
        var item = el("li", { "class": "wdp-activity-entry wdp-activity-" + call.status });

        item.appendChild(el("span", { "class": "wdp-activity-what" },
            text(call.what.key, call.what.params)));

        item.appendChild(el("span", { "class": "wdp-activity-source" },
            text(call.what.source)));

        var when;
        if (call.status === "pending") {
            when = text("activity.pending");
        } else if (call.status === "local") {
            when = text("activity.nocall");
        } else if (call.status === "failed") {
            when = text("activity.failed");
        } else {
            when = text("activity.ms", [call.ms]);
        }
        item.appendChild(el("span", { "class": "wdp-activity-when" }, when));

        return item;
    }

    /*
     * Marks a region of the page as waiting on something, so the cue is next
     * to the table being filled as well as in the header. aria-busy is the
     * standard way of saying it and needs no styling to mean something.
     */
    function busy(element, waiting) {
        if (!element) {
            return;
        }
        if (waiting) {
            element.setAttribute("aria-busy", "true");
        } else {
            element.removeAttribute("aria-busy");
        }
    }

    watch(window);

    WDProp.activity = {
        describe: describe,
        snapshot: snapshot,
        subscribe: subscribe,
        note: note,
        mount: mount,
        busy: busy,
        watch: watch
    };
})(window.WDProp);
