/*
 * WDProp - The offline page
 *
 * Drives offline.html: reports what this browser can actually do, downloads
 * and deletes the property vocabulary, and moves the batch in and out as a
 * file.
 *
 * Everything on this page is reported from what was checked, not from what is
 * usually true. Whether a service worker registered, whether IndexedDB is
 * there, how many properties are stored and when — each is asked for and
 * shown, or shown as unavailable. A page about working offline is the last
 * place that should tell somebody they are covered when they are not.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
    var LANGUAGES_KEY = "wdprop-offline-languages";

    var running = null;

    function t(key, params) {
        return WDProp.i18n.t(key, params);
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.setAttribute("class", className);
        }
        if (text != null) {
            node.appendChild(document.createTextNode(text));
        }
        return node;
    }

    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    /* A line of the state table: what was asked, and what came back. */
    function stateRow(table, label, answer, good) {
        var row = element("tr");
        row.appendChild(element("th", null, label));
        var cell = element("td", good === null ? "wdp-muted" : (good ? "wdp-ok" : "wdp-message wdp-warning"));
        cell.appendChild(document.createTextNode(answer));
        row.appendChild(cell);
        table.appendChild(row);
    }

    /* --------------------------------------------------------- this browser */

    function renderState() {
        var container = document.getElementById("offlineState");
        clear(container);

        var table = element("table", "wdp-context-table");
        container.appendChild(table);

        stateRow(table, t("offline.connection"),
            WDProp.offline.online() ? t("offline.connected") : t("offline.disconnected"),
            WDProp.offline.online());

        stateRow(table, t("offline.storage"),
            WDProp.offline.available() ? t("offline.storageReady") : t("offline.storageMissing"),
            WDProp.offline.available());

        /*
         * Asked again here rather than reported from what offline.js did at
         * start-up. Registration is asynchronous and may still have been in
         * flight then; this is the state now.
         */
        stateRow(table, t("offline.appFiles"), t("offline.checking"), null);
        var appRow = table.children[table.children.length - 1];

        WDProp.offline.register().then(function (result) {
            var cell = appRow.children[1];
            clear(cell);
            var message;
            var good;
            if (result.ok) {
                message = t("offline.appFilesKept");
                good = true;
            } else if (result.reason === "file") {
                /* Opened from a disk: the files are already local by definition. */
                message = t("offline.appFilesLocal");
                good = true;
            } else if (result.reason === "unsupported") {
                message = t("offline.appFilesUnsupported");
                good = false;
            } else {
                message = t("offline.appFilesFailed");
                good = false;
            }
            cell.setAttribute("class", good ? "wdp-ok" : "wdp-message wdp-warning");
            cell.appendChild(document.createTextNode(message));
        });
    }

    /* ------------------------------------------------------- the vocabulary */

    function renderDataset() {
        var container = document.getElementById("offlineDataset");
        clear(container);

        if (!WDProp.offline.available()) {
            container.appendChild(element("p", "wdp-message wdp-warning",
                t("offline.storageMissingLong")));
            return;
        }

        container.appendChild(element("p", "wdprop-loading", t("offline.readingStore")));

        WDProp.offline.info().then(function (meta) {
            clear(container);

            if (!meta || !meta.count) {
                container.appendChild(element("p", "wdp-muted", t("offline.nothingStored")));
                return;
            }

            var table = element("table", "wdp-context-table");
            stateRow(table, t("offline.storedLanguages"), meta.languages.join(", "), null);
            stateRow(table, t("offline.storedCount"),
                t("offline.ofProperties", [meta.count.toLocaleString(),
                    (meta.total || meta.count).toLocaleString()]), null);
            stateRow(table, t("offline.storedWhen"), when(meta.at), null);
            container.appendChild(table);

            if (meta.partial) {
                container.appendChild(element("p", "wdp-message wdp-warning",
                    t("offline.partial")));
            }
        }).catch(function () {
            clear(container);
            container.appendChild(element("p", "wdp-message wdp-warning",
                t("offline.storeUnreadable")));
        });
    }

    function when(at) {
        try {
            return new Date(at).toLocaleString(WDProp.i18n.current());
        } catch (e) {
            return new Date(at).toISOString();
        }
    }

    function progress(message, className) {
        var box = document.getElementById("offlineProgress");
        if (!box.getAttribute("role")) {
            box.setAttribute("role", "status");
            box.setAttribute("aria-live", "polite");
        }
        clear(box);
        box.appendChild(element("p", className || "wdp-muted", message));
    }

    function readLanguages() {
        return String(document.getElementById("offLanguages").value)
            .split(",").map(function (code) {
                return code.trim();
            }).filter(Boolean);
    }

    function startDownload() {
        var languages = readLanguages();

        if (!languages.length) {
            progress(t("offline.nameALanguage"), "wdp-message wdp-blocking");
            return;
        }
        var bad = languages.filter(function (code) {
            return !LANGUAGE_RE.test(code);
        });
        if (bad.length) {
            progress(t("offline.badLanguage", [bad.join(", ")]), "wdp-message wdp-blocking");
            return;
        }
        if (!WDProp.offline.online()) {
            progress(t("offline.needsConnection"), "wdp-message wdp-blocking");
            return;
        }

        try {
            localStorage.setItem(LANGUAGES_KEY, languages.join(","));
        } catch (e) {
            // Remembering the choice is a convenience.
        }

        document.getElementById("offStart").disabled = true;
        progress(t("offline.listing"));

        running = WDProp.offline.download({
            languages: languages,
            onProgress: function (done, total) {
                progress(t("offline.downloading", [done.toLocaleString(), total.toLocaleString()]));
            }
        });

        running.then(function (result) {
            running = null;
            document.getElementById("offStart").disabled = false;
            progress(result.stopped ?
                t("offline.stopped", [result.count.toLocaleString()]) :
                t("offline.downloaded", [result.count.toLocaleString()]),
                result.stopped ? "wdp-message wdp-warning" : "wdp-ok");
            renderDataset();
        }).catch(function (error) {
            running = null;
            document.getElementById("offStart").disabled = false;
            progress(error && error.message ? error.message : t("offline.downloadFailed"),
                "wdp-message wdp-blocking");
            renderDataset();
        });
    }

    /* ------------------------------------------------------- the batch file */

    function renderBatch() {
        var container = document.getElementById("offlineBatch");
        clear(container);

        var count = WDProp.cart.count();

        container.appendChild(element("p", "wdp-muted",
            count ? t("offline.batchHolds", [count]) : t("offline.batchEmpty")));

        var save = element("button", "wdp-button wdp-primary", t("offline.saveBatch"));
        save.setAttribute("type", "button");
        save.disabled = !count;
        save.addEventListener("click", function () {
            var entries = WDProp.cart.list();
            WDProp.offline.exportBatch(entries);
            WDProp.toast(t("offline.batchSaved", [entries.length]));
        });
        container.appendChild(save);

        var label = element("label", "wdp-button", t("offline.loadBatch"));
        label.setAttribute("for", "offBatchFile");
        container.appendChild(label);

        var file = document.createElement("input");
        file.setAttribute("type", "file");
        file.setAttribute("id", "offBatchFile");
        file.setAttribute("accept", ".json,application/json");
        file.setAttribute("class", "wdp-file-input");
        file.addEventListener("change", function () {
            var chosen = file.files && file.files[0];
            if (!chosen) {
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                takeIn(String(reader.result));
                /* Cleared so that choosing the same file twice fires again. */
                file.value = "";
            };
            reader.onerror = function () {
                WDProp.toast(t("offline.fileUnreadable"), "error");
            };
            reader.readAsText(chosen);
        });
        container.appendChild(file);
    }

    function takeIn(text) {
        var result;
        try {
            result = WDProp.offline.importBatch(text);
        } catch (error) {
            WDProp.toast(error.message, "error");
            return;
        }

        /*
         * Both numbers, always. An import that says only what it took in
         * leaves the reader to work out from the batch count that four
         * proposals were dropped, which is exactly the moment they would want
         * to know.
         */
        WDProp.toast(result.rejected ?
            t("offline.imported", [result.added, result.rejected]) :
            t("offline.importedAll", [result.added]));
        renderBatch();
    }

    /* --------------------------------------------------------- what is left */

    /*
     * The honest list. Every one of these is a consequence of WDProp holding
     * terms and nothing else: statements, usage counts and revision histories
     * are not in the store, so anything computed from them needs Wikidata.
     */
    function renderLimits() {
        var container = document.getElementById("offlineLimits");
        clear(container);

        var works = element("ul");
        [t("offline.worksWorkbench"), t("offline.worksBatch"),
            t("offline.worksSearch"), t("offline.worksPages")].forEach(function (line) {
            works.appendChild(element("li", null, line));
        });
        container.appendChild(element("h4", null, t("offline.worksHeading")));
        container.appendChild(works);

        var not = element("ul");
        [t("offline.notStatistics"), t("offline.notStale"),
            t("offline.notUsage"), t("offline.notClasses"),
            t("offline.notExport")].forEach(function (line) {
            not.appendChild(element("li", null, line));
        });
        container.appendChild(element("h4", null, t("offline.notHeading")));
        container.appendChild(not);
    }

    /* ------------------------------------------------------------ start-up */

    function init() {
        if (!document.getElementById("offlineState")) {
            return;
        }

        var stored = "";
        try {
            stored = localStorage.getItem(LANGUAGES_KEY) || "";
        } catch (e) {
            stored = "";
        }
        if (!stored) {
            var prefs = WDProp.cart.prefs();
            stored = [prefs.lang, prefs.pivot].filter(Boolean).join(", ");
        }
        document.getElementById("offLanguages").value = stored;

        document.getElementById("offlineDownload").addEventListener("submit", function (event) {
            event.preventDefault();
            startDownload();
        });

        document.getElementById("offStop").addEventListener("click", function () {
            if (running) {
                running.stop();
                progress(t("offline.stopping"));
            }
        });

        document.getElementById("offClear").addEventListener("click", function () {
            if (!window.confirm(t("offline.confirmDelete"))) {
                return;
            }
            WDProp.offline.clear().then(function () {
                progress(t("offline.deleted"), "wdp-ok");
                renderDataset();
            }).catch(function () {
                progress(t("offline.deleteFailed"), "wdp-message wdp-blocking");
            });
        });

        window.addEventListener("online", renderState);
        window.addEventListener("offline", renderState);

        renderState();
        renderDataset();
        renderBatch();
        renderLimits();
    }

    WDProp.ready(init);
})(window.WDProp);
