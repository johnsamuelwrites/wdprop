/*
 * WDProp - Translation batch review and export
 *
 * Drives batch.html: lists the proposed translations, validates them against
 * Wikidata, and hands the resulting QuickStatements commands to the user.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    /*
     * Deliberate overrides of "this term already exists on Wikidata". Kept in
     * memory only: reloading the page re-checks against Wikidata, which is the
     * safer default.
     */
    var overrides = {};
    var validation = { byId: {}, offline: false };

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

    function statusOf(entry) {
        var result = validation.byId[entry.id];
        if (!result) {
            return { state: "pending", messages: [] };
        }
        if (result.blocking.length) {
            return { state: "blocked", messages: result.blocking };
        }
        if (result.conflict && !overrides[entry.id]) {
            return { state: "conflict", messages: [result.conflict] };
        }
        if (result.conflict) {
            return { state: "overridden", messages: [result.conflict + " Overwriting deliberately."] };
        }
        if (result.warnings.length) {
            return { state: "warning", messages: result.warnings };
        }
        return { state: "ok", messages: [] };
    }

    function exportable() {
        return WDProp.cart.list().filter(function (entry) {
            var state = statusOf(entry).state;
            return state === "ok" || state === "warning" || state === "overridden" || state === "pending";
        });
    }

    function renderTable() {
        var container = document.getElementById("batchEntries");
        clear(container);

        var entries = WDProp.cart.list();
        if (!entries.length) {
            container.appendChild(element("p", "wdp-muted",
                "The batch is empty. Open a property or a language page and use ＋ to propose a translation."));
            return;
        }

        var table = element("table", "alternate wdp-batch-table");
        var head = element("tr");
        ["Property", "Into", "Term", "Translation", "From", "Status", ""].forEach(function (title) {
            head.appendChild(element("th", null, title));
        });
        table.appendChild(head);

        entries.forEach(function (entry) {
            var status = statusOf(entry);
            var tr = element("tr", "wdp-status-" + status.state);

            var td = element("td");
            var link = element("a", null, entry.property);
            link.setAttribute("href", "property.html?property=" + entry.property);
            td.appendChild(link);
            tr.appendChild(td);

            tr.appendChild(element("td", null, entry.lang));
            tr.appendChild(element("td", null, entry.type));

            td = element("td", "wdp-value");
            td.setAttribute("dir", "auto");
            td.appendChild(document.createTextNode(entry.value));
            tr.appendChild(td);

            td = element("td", "wdp-muted");
            if (entry.pivot) {
                td.appendChild(document.createTextNode(entry.pivot));
                if (entry.pivotValue) {
                    td.setAttribute("title", entry.pivotValue);
                }
            }
            tr.appendChild(td);

            td = element("td", "wdp-status-cell");
            status.messages.forEach(function (message) {
                td.appendChild(element("div", "wdp-message wdp-" +
                    (status.state === "blocked" ? "blocking" : status.state === "conflict" ? "blocking" : "warning"),
                    message));
            });
            if (status.state === "ok") {
                td.appendChild(element("span", "wdp-ok", "✓"));
            }
            if (status.state === "pending") {
                td.appendChild(element("span", "wdp-muted", "not yet checked"));
            }
            if (status.state === "conflict" || status.state === "overridden") {
                var label = element("label", "wdp-override");
                var box = element("input");
                box.setAttribute("type", "checkbox");
                if (overrides[entry.id]) {
                    box.setAttribute("checked", "checked");
                }
                box.addEventListener("change", function () {
                    overrides[entry.id] = box.checked;
                    render();
                });
                label.appendChild(box);
                label.appendChild(document.createTextNode(" Replace it anyway"));
                td.appendChild(label);
            }
            tr.appendChild(td);

            td = element("td");
            var remove = element("button", "wdp-remove", "Remove");
            remove.setAttribute("type", "button");
            remove.addEventListener("click", function () {
                WDProp.cart.remove(entry.id);
                render();
            });
            td.appendChild(remove);
            tr.appendChild(td);

            table.appendChild(tr);
        });

        container.appendChild(table);
    }

    function renderCommands() {
        var container = document.getElementById("batchCommands");
        clear(container);

        var entries = exportable();
        var total = WDProp.cart.count();

        if (!entries.length) {
            container.appendChild(element("p", "wdp-muted",
                total ? "Nothing can be exported until the problems above are resolved." : "Nothing to export yet."));
            return;
        }

        if (entries.length < total) {
            container.appendChild(element("p", "wdp-message wdp-warning",
                (total - entries.length) + " of " + total + " proposals are held back and are not in the commands below."));
        }

        var pre = element("pre", "wdp-commands");
        pre.appendChild(document.createTextNode(WDProp.qs.batchText(entries)));
        container.appendChild(pre);
    }

    /*
     * Records what left WDProp so the contributions page can look it up later.
     * All three routes record: which one the translator used says nothing about
     * what they intend to run.
     */
    function recordExport(entries) {
        if (WDProp.contributions) {
            WDProp.contributions.record(entries);
        }
    }

    function renderExport() {
        var container = document.getElementById("batchExport");
        clear(container);

        var entries = exportable();
        if (!entries.length) {
            return;
        }

        var link = WDProp.qs.urlFor(entries);

        if (link.ok) {
            var open = element("a", "wdp-button wdp-primary", "Open in QuickStatements");
            open.setAttribute("href", link.url);
            open.setAttribute("target", "_blank");
            open.setAttribute("rel", "noopener");
            open.addEventListener("click", function () {
                recordExport(entries);
            });
            container.appendChild(open);
        } else {
            var note = element("p", "wdp-message wdp-warning");
            if (link.reason === "too-long") {
                note.appendChild(document.createTextNode(
                    "This batch is too large for a one-click link (" + link.length +
                    " characters). Copy the commands or download them and paste them into QuickStatements."));
            } else if (link.reason === "pipe-in-value") {
                note.appendChild(document.createTextNode(
                    "A translation contains “|”, which the one-click link uses as a separator. " +
                    "Copy the commands or download them instead; pasting into QuickStatements is unaffected."));
            }
            container.appendChild(note);
        }

        var copy = element("button", "wdp-button", "Copy commands");
        copy.setAttribute("type", "button");
        copy.addEventListener("click", function () {
            recordExport(entries);
            WDProp.qs.copy(WDProp.qs.batchText(entries)).then(function () {
                copy.textContent = "Copied";
                setTimeout(function () {
                    copy.textContent = "Copy commands";
                }, 2000);
            }).catch(function () {
                copy.textContent = "Copy failed — select the text above";
            });
        });
        container.appendChild(copy);

        var save = element("button", "wdp-button", "Download .txt");
        save.setAttribute("type", "button");
        save.addEventListener("click", function () {
            recordExport(entries);
            WDProp.qs.download(entries, "wdprop-quickstatements.txt");
        });
        container.appendChild(save);

        var help = element("p", "wdp-muted");
        help.appendChild(document.createTextNode("The edits are made under your own account, after you authorise QuickStatements. See "));
        var helpLink = element("a", null, "Help:QuickStatements");
        helpLink.setAttribute("href", "https://www.wikidata.org/wiki/Help:QuickStatements");
        helpLink.setAttribute("target", "_blank");
        helpLink.setAttribute("rel", "noopener");
        help.appendChild(helpLink);
        help.appendChild(document.createTextNode(". Afterwards, "));
        var mine = element("a", null, "your contributions");
        mine.setAttribute("href", "contributions.html");
        help.appendChild(mine);
        help.appendChild(document.createTextNode(" shows what arrived."));
        container.appendChild(help);
    }

    function renderSummary() {
        var container = document.getElementById("batchSummary");
        clear(container);

        var total = WDProp.cart.count();
        var ready = exportable().length;

        container.appendChild(element("h3", null,
            total === 0 ? "No proposals yet" : ready + " of " + total + " ready to export"));

        if (validation.offline) {
            container.appendChild(element("p", "wdp-message wdp-warning",
                "Wikidata could not be reached, so only the local checks have run. " +
                "Duplicate labels and terms added in the meantime have not been verified."));
        }
    }

    function render() {
        renderSummary();
        renderTable();
        renderCommands();
        renderExport();
    }

    function revalidate() {
        var entries = WDProp.cart.list();
        if (!entries.length) {
            validation = { byId: {}, offline: false };
            render();
            return;
        }

        var status = document.getElementById("batchSummary");
        clear(status);
        status.appendChild(element("p", "wdprop-loading", "Checking the batch against Wikidata…"));

        WDProp.validate.batch(entries).then(function (result) {
            validation = result;
            render();
        });
    }

    function init() {
        var clearButton = document.getElementById("batchClear");
        if (clearButton) {
            clearButton.addEventListener("click", function () {
                if (WDProp.cart.count() && window.confirm("Remove all " + WDProp.cart.count() + " proposals from the batch?")) {
                    WDProp.cart.clear();
                    overrides = {};
                    revalidate();
                }
            });
        }

        var recheck = document.getElementById("batchRecheck");
        if (recheck) {
            recheck.addEventListener("click", revalidate);
        }

        render();
        revalidate();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window.WDProp);
