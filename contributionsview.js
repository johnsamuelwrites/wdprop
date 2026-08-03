/*
 * WDProp - Contributions page
 *
 * Drives contributions.html: lists what has been exported and what became of
 * it, and offers to put anything that never arrived back into the batch.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var reports = {};

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

    function formatDate(timestamp) {
        var date = new Date(timestamp);
        return date.toLocaleDateString() + " " +
            date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function countStates(batch) {
        var report = reports[batch.id];
        var counts = { live: 0, missing: 0, changed: 0, unknown: 0 };
        batch.entries.forEach(function (entry) {
            var result = report && report[WDProp.contributions.keyOf(entry)];
            counts[result ? result.state : "unknown"]++;
        });
        return counts;
    }

    function renderEntries(batch) {
        var report = reports[batch.id];
        var table = element("table", "alternate wdp-batch-table");
        var head = element("tr");
        [t("batch.colProperty"), t("campaign.language"), t("batch.colTerm"),
            t("contributions.colProposed"), t("contributions.colNow"), ""].forEach(function (title) {
            head.appendChild(element("th", null, title));
        });
        table.appendChild(head);

        batch.entries.forEach(function (entry) {
            var result = report && report[WDProp.contributions.keyOf(entry)];
            var stateName = result ? result.state : "unknown";
            var row = element("tr", "cn-" + stateName);

            var cell = element("td");
            var link = element("a", null, entry.property);
            link.setAttribute("href", "property.html?property=" + entry.property);
            cell.appendChild(link);
            row.appendChild(cell);

            row.appendChild(element("td", null, entry.lang));
            row.appendChild(element("td", null, entry.type));

            cell = element("td", "wdp-value");
            cell.setAttribute("dir", "auto");
            cell.appendChild(document.createTextNode(entry.value));
            row.appendChild(cell);

            cell = element("td");
            cell.setAttribute("dir", "auto");
            if (!result) {
                cell.appendChild(element("span", "wdp-muted", t("contributions.notChecked")));
            } else if (result.state === "live") {
                cell.appendChild(element("span", "wdp-ok", "✓ "));
                cell.appendChild(document.createTextNode(t("contributions.live")));
            } else if (result.state === "changed") {
                cell.appendChild(document.createTextNode(result.current));
            } else {
                cell.appendChild(element("span", "wdp-muted",
                    result.current ? t("contributions.stillThere", [result.current]) : t("contributions.missing")));
            }
            row.appendChild(cell);

            cell = element("td");
            if (result && result.state === "missing") {
                var retry = element("button", "wdp-remove", t("contributions.putBack"));
                retry.setAttribute("type", "button");
                retry.addEventListener("click", function () {
                    WDProp.cart.add(entry);
                    retry.textContent = t("contributions.inYourBatch");
                    retry.disabled = true;
                });
                cell.appendChild(retry);
            }
            row.appendChild(cell);

            table.appendChild(row);
        });

        return table;
    }

    function renderBatch(batch) {
        var box = element("div", "cn-batch");
        var counts = countStates(batch);

        var head = element("div", "cn-batch-head");
        head.appendChild(element("h3", null, t("contributions.exportedOn", [formatDate(batch.exported)])));

        var summary = element("span", "cn-summary");
        if (counts.unknown) {
            summary.appendChild(element("span", "wdp-muted", t("contributions.uncheckedCount", [batch.entries.length])));
        } else {
            summary.appendChild(element("span", "cn-pill cn-pill-live", "\u2713 " + t("contributions.liveCount", [counts.live])));
            if (counts.missing) {
                summary.appendChild(element("span", "cn-pill cn-pill-missing", "\u2717 " + t("contributions.missingCount", [counts.missing])));
            }
            if (counts.changed) {
                summary.appendChild(element("span", "cn-pill cn-pill-changed", "\u2260 " + t("contributions.changedCount", [counts.changed])));
            }
        }
        head.appendChild(summary);
        box.appendChild(head);

        box.appendChild(renderEntries(batch));

        var actions = element("p", "cn-actions");

        if (counts.missing) {
            var retryAll = element("button", "wdp-button", t("contributions.putAllBack", [counts.missing]));
            retryAll.setAttribute("type", "button");
            retryAll.addEventListener("click", function () {
                var report = reports[batch.id];
                var restored = 0;
                batch.entries.forEach(function (entry) {
                    var result = report && report[WDProp.contributions.keyOf(entry)];
                    if (result && result.state === "missing") {
                        WDProp.cart.add(entry);
                        restored++;
                    }
                });
                retryAll.textContent = t("contributions.putBackDone", [restored]);
                retryAll.disabled = true;
            });
            actions.appendChild(retryAll);
        }

        var forget = element("button", "wdp-button", t("contributions.forget"));
        forget.setAttribute("type", "button");
        forget.addEventListener("click", function () {
            if (window.confirm(t("contributions.confirmForget"))) {
                WDProp.contributions.removeBatch(batch.id);
                render();
            }
        });
        actions.appendChild(forget);
        box.appendChild(actions);

        return box;
    }

    function renderSummary(all) {
        var box = document.getElementById("contributionsSummary");
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        clear(box);

        if (!all.length) {
            box.appendChild(element("p", "wdp-muted",
                t("contributions.none")));
            return;
        }

        var totals = { live: 0, missing: 0, changed: 0, unknown: 0, all: 0 };
        all.forEach(function (batch) {
            var counts = countStates(batch);
            totals.live += counts.live;
            totals.missing += counts.missing;
            totals.changed += counts.changed;
            totals.unknown += counts.unknown;
            totals.all += batch.entries.length;
        });

        box.appendChild(element("h3", null,
            all.length === 1 ? t("contributions.proposedAcrossOne", [totals.all.toLocaleString()]) :
                t("contributions.proposedAcross", [totals.all.toLocaleString(), all.length])));

        if (!totals.unknown) {
            var line = element("p");
            line.appendChild(element("span", "cn-pill cn-pill-live", "\u2713 " + t("contributions.liveCount", [totals.live])));
            if (totals.missing) {
                line.appendChild(element("span", "cn-pill cn-pill-missing", "\u2717 " + t("contributions.missingCount", [totals.missing])));
            }
            if (totals.changed) {
                line.appendChild(element("span", "cn-pill cn-pill-changed", "\u2260 " + t("contributions.changedCount", [totals.changed])));
            }
            box.appendChild(line);
        }
    }

    function render() {
        var all = WDProp.contributions.batches();
        renderSummary(all);

        var box = document.getElementById("contributionsBatches");
        clear(box);
        all.forEach(function (batch) {
            box.appendChild(renderBatch(batch));
        });
    }

    function verifyAll() {
        var all = WDProp.contributions.batches();
        if (!all.length) {
            render();
            return;
        }

        var box = document.getElementById("contributionsBatches");
        clear(box);
        var loading = element("div", "wdprop-loading");
        loading.innerHTML = '<span class="wdprop-loading-spinner"></span> ' + t("contributions.checking");
        box.appendChild(loading);

        /*
         * One pass over every proposal ever exported, rather than one request
         * per export: the same property often appears in several of them.
         */
        var everything = [];
        all.forEach(function (batch) {
            everything = everything.concat(batch.entries);
        });

        WDProp.contributions.verify(everything).then(function (report) {
            all.forEach(function (batch) {
                reports[batch.id] = report;
            });
            render();
        }).catch(function (e) {
            clear(box);
            box.appendChild(element("p", "wdp-message wdp-blocking",
                t("contributions.checkFailed", [e.message])));
        });
    }

    function init() {
        if (!document.getElementById("contributionsBatches")) {
            return;
        }

        var recheck = document.getElementById("contributionsRecheck");
        if (recheck) {
            recheck.addEventListener("click", verifyAll);
        }

        var forgetAll = document.getElementById("contributionsClear");
        if (forgetAll) {
            forgetAll.addEventListener("click", function () {
                if (window.confirm(t("contributions.confirmForgetAll"))) {
                    WDProp.contributions.clear();
                    reports = {};
                    render();
                }
            });
        }

        render();
        verifyAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window.WDProp);
