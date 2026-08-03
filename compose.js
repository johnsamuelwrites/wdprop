/*
 * WDProp - Translation composer
 *
 * A small dialog for writing one translation, with the property's existing
 * terms in a language the translator reads shown alongside.
 *
 * It is reached from either side of the same gap: on the language page, from
 * each property still missing a term in that language; on the property page,
 * from each language still missing that property's label, description or
 * alias.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";

    var TYPES = [
        { value: "label", text: "term.labels" },
        { value: "description", text: "term.descriptions" },
        { value: "alias", text: "term.aliases" }
    ];

    /*
     * The two pages approach the same gap from opposite sides: the language
     * page fixes the language and lists properties, the property page fixes
     * the property and lists languages. Each list gets the same control.
     */
    var CONTAINER_TYPE = {
        propertyLabelsNeedingTranslation: "label",
        propertyDescriptionsNeedingTranslation: "description",
        missingPropertyAliases: "alias"
    };

    var LANGUAGE_CONTAINER_TYPE = {
        untranslatedLabelsInLanguages: "label",
        untranslatedDescriptionsInLanguages: "description",
        untranslatedAliasesInLanguages: "alias"
    };

    var LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

    var state = null;
    var backdrop = null;

    /* Where focus was before the dialog opened, so it can be given back. */
    var opener = null;

    function t(key, params) {
        return WDProp.i18n.t(key, params);
    }

    function urlValue(name, fallback) {
        var match = new RegExp(name + "=([^&#=]*)").exec(window.location.search);
        return match ? decodeURIComponent(match[1]) : fallback;
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

    /*
     * Fetches labels, descriptions and aliases for one property in both the
     * pivot and the target language in a single call.
     */
    function fetchTerms(property, languages) {
        var url = API + "?action=wbgetentities" +
            "&ids=" + encodeURIComponent(property) +
            "&props=" + encodeURIComponent("labels|descriptions|aliases|datatype") +
            "&languages=" + encodeURIComponent(languages.join("|")) +
            "&format=json&origin=*";

        return fetch(url).then(function (r) {
            return r.json();
        }).then(function (json) {
            if (!json.entities || !json.entities[property]) {
                throw new Error("No data for " + property);
            }
            return json.entities[property];
        });
    }

    function termsFor(entity, lang) {
        var aliases = (entity.aliases && entity.aliases[lang]) || [];
        return {
            label: entity.labels && entity.labels[lang] ? entity.labels[lang].value : null,
            description: entity.descriptions && entity.descriptions[lang] ? entity.descriptions[lang].value : null,
            aliases: aliases.map(function (a) {
                return a.value;
            }),
            datatype: entity.datatype || null
        };
    }

    function renderContext() {
        var box = state.nodes.context;
        clear(box);

        if (!state.entity) {
            box.appendChild(element("p", "wdp-muted", t("compose.loadingTerms")));
            return;
        }

        var pivot = termsFor(state.entity, state.pivot);
        var target = termsFor(state.entity, state.lang);

        if (pivot.datatype) {
            var meta = element("p", "wdp-datatype");
            meta.appendChild(element("span", "wdp-tag", pivot.datatype));
            box.appendChild(meta);
        }

        var table = element("table", "wdp-context-table");

        function row(languageCode, terms, isTarget) {
            var tr = element("tr", isTarget ? "wdp-target-row" : null);
            tr.appendChild(element("th", null, languageCode));

            var td = element("td");
            if (terms.label) {
                td.appendChild(element("strong", null, terms.label));
            } else {
                td.appendChild(element("span", "wdp-missing", t("compose.noLabel")));
            }
            if (terms.description) {
                td.appendChild(element("span", "wdp-sep", " — "));
                td.appendChild(element("span", "wdp-desc", terms.description));
            }
            if (terms.aliases.length) {
                td.appendChild(element("div", "wdp-aliases", t("compose.alsoKnown", [terms.aliases.join(", ")])));
            }
            tr.appendChild(td);
            return tr;
        }

        table.appendChild(row(state.pivot, pivot, false));
        if (state.lang !== state.pivot) {
            table.appendChild(row(state.lang, target, true));
        }
        box.appendChild(table);
    }

    /*
     * Existing terms are shown as read-only context, but the composer also
     * prefills the pivot value so validation can spot an untouched copy.
     */
    function pivotValueForType() {
        if (!state.entity) {
            return null;
        }
        var pivot = termsFor(state.entity, state.pivot);
        if (state.type === "alias") {
            return pivot.aliases.length ? pivot.aliases[0] : null;
        }
        return pivot[state.type];
    }

    function renderMessages() {
        var box = state.nodes.messages;
        clear(box);

        var value = state.nodes.value.value;
        if (value.trim() === "") {
            // Nothing to report yet, but an emptied field must not leave the
            // button enabled from the previous keystroke.
            state.nodes.submit.disabled = true;
            return;
        }

        var result = WDProp.validate.entry({
            property: state.property,
            lang: state.lang,
            type: state.type,
            value: value,
            pivot: state.pivot,
            pivotValue: pivotValueForType()
        });

        result.blocking.forEach(function (message) {
            box.appendChild(element("p", "wdp-message wdp-blocking", message));
        });
        result.warnings.forEach(function (message) {
            box.appendChild(element("p", "wdp-message wdp-warning", message));
        });

        /*
         * A term that already exists is not offered for overwriting here: the
         * composer only adds what is missing. Replacing a term that appeared
         * while the batch was waiting is a deliberate choice, made on the
         * batch page.
         */
        var existing = existingTerm();
        if (existing) {
            box.appendChild(element("p", "wdp-message wdp-blocking",
                t("compose.onlyMissing", [t("term." + state.type), state.lang, existing])));
        }

        state.nodes.submit.disabled = result.blocking.length > 0 || existing !== null;
    }

    /*
     * The current value of the term being written, if Wikidata already has
     * one. Aliases are added rather than replaced, so they never conflict.
     */
    function existingTerm() {
        if (!state.entity || state.type === "alias") {
            return null;
        }
        return termsFor(state.entity, state.lang)[state.type] || null;
    }

    function loadEntity() {
        state.entity = null;
        renderContext();
        var languages = state.lang === state.pivot ? [state.lang] : [state.pivot, state.lang];

        fetchTerms(state.property, languages).then(function (entity) {
            if (!state || state.property !== entity.id) {
                return;
            }
            state.entity = entity;
            renderContext();
            renderMessages();
        }).catch(function (e) {
            if (!state) {
                return;
            }
            clear(state.nodes.context);
            state.nodes.context.appendChild(
                element("p", "wdp-message wdp-warning", t("compose.termsFailed", [e.message])));
        });
    }

    function close() {
        if (backdrop) {
            document.body.removeChild(backdrop);
            backdrop = null;
            state = null;
            document.removeEventListener("keydown", onKeyDown);

            /* Returning focus to whatever opened the dialog. */
            if (opener && opener.focus) {
                opener.focus();
            }
            opener = null;
        }
    }

    /* Everything inside the dialog that can take focus, in document order. */
    function focusable() {
        if (!backdrop) {
            return [];
        }
        return Array.prototype.filter.call(
            backdrop.querySelectorAll("button, input, select, textarea, a[href]"),
            function (node) {
                return !node.disabled;
            });
    }

    function onKeyDown(event) {
        if (event.key === "Escape") {
            close();
            return;
        }

        /*
         * Tab must not walk out of the dialog and into the page behind it,
         * which is still there and still focusable.
         */
        if (event.key === "Tab") {
            var items = focusable();
            if (!items.length) {
                return;
            }
            var first = items[0];
            var last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    function submit() {
        var value = state.nodes.value.value;
        var result = WDProp.validate.entry({
            property: state.property,
            lang: state.lang,
            type: state.type,
            value: value,
            pivot: state.pivot,
            pivotValue: pivotValueForType()
        });
        if (result.blocking.length || existingTerm()) {
            renderMessages();
            return;
        }

        WDProp.cart.add({
            property: state.property,
            lang: state.lang,
            type: state.type,
            value: value,
            pivot: state.pivot,
            pivotValue: pivotValueForType()
        });
        WDProp.cart.savePrefs({ lang: state.lang, pivot: state.pivot });

        clear(state.nodes.messages);
        state.nodes.messages.appendChild(element("p", "wdp-message wdp-success",
            t("compose.added", [WDProp.cart.count()])));
        state.nodes.value.value = "";
        state.nodes.value.focus();
        state.nodes.submit.disabled = true;

        if (state.onAdd) {
            state.onAdd();
        }
    }

    /*
     * Opens the composer. `type` selects which kind of term is being written,
     * `lang` the language being written into, `pivot` the language read from.
     */
    function open(options) {
        close();

        var prefs = WDProp.cart.prefs();
        state = {
            property: options.property,
            lang: options.lang || prefs.lang || "en",
            pivot: options.pivot || prefs.pivot || "en",
            type: options.type || "label",
            onAdd: options.onAdd || null,
            entity: null,
            nodes: {}
        };

        opener = document.activeElement;

        backdrop = element("div", "wdp-modal-backdrop");
        var modal = element("div", "wdp-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "wdp-modal-heading");
        backdrop.appendChild(modal);

        var head = element("div", "wdp-modal-head");
        var heading = element("h3", null, t("compose.heading"));
        heading.setAttribute("id", "wdp-modal-heading");
        head.appendChild(heading);
        var closeButton = element("button", "wdp-close", "×");
        closeButton.setAttribute("type", "button");
        closeButton.setAttribute("aria-label", t("a11y.closeDialog"));
        closeButton.setAttribute("title", t("a11y.closeDialog"));
        closeButton.addEventListener("click", close);
        head.appendChild(closeButton);
        modal.appendChild(head);

        var body = element("div", "wdp-modal-body");
        modal.appendChild(body);

        var identity = element("p", "wdp-identity");
        var link = element("a", null, state.property);
        link.setAttribute("href", "https://www.wikidata.org/wiki/Property:" + state.property);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
        identity.appendChild(link);
        body.appendChild(identity);

        state.nodes.context = element("div", "wdp-context");
        body.appendChild(state.nodes.context);

        var form = element("form", "wdp-form");
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            submit();
        });
        body.appendChild(form);

        var fieldCount = 0;
        function field(labelText, control) {
            var wrapper = element("div", "wdp-field");
            var label = element("label", null, labelText);
            var id = "wdp-field-" + (++fieldCount);
            control.setAttribute("id", id);
            label.setAttribute("for", id);
            wrapper.appendChild(label);
            wrapper.appendChild(control);
            form.appendChild(wrapper);
            return control;
        }

        var pivotInput = element("input", "wdp-input wdp-input-small");
        pivotInput.setAttribute("type", "text");
        pivotInput.setAttribute("value", state.pivot);
        pivotInput.setAttribute("size", "6");
        pivotInput.addEventListener("change", function () {
            state.pivot = pivotInput.value.trim() || "en";
            loadEntity();
        });
        state.nodes.pivot = field(t("compose.from"), pivotInput);

        var langInput = element("input", "wdp-input wdp-input-small");
        langInput.setAttribute("type", "text");
        langInput.setAttribute("value", state.lang);
        langInput.setAttribute("size", "6");
        langInput.addEventListener("change", function () {
            state.lang = langInput.value.trim();
            loadEntity();
        });
        state.nodes.lang = field(t("compose.into"), langInput);

        var typeSelect = element("select", "wdp-input");
        TYPES.forEach(function (kind) {
            var option = element("option", null, t(kind.text));
            option.setAttribute("value", kind.value);
            if (kind.value === state.type) {
                option.setAttribute("selected", "selected");
            }
            typeSelect.appendChild(option);
        });
        typeSelect.addEventListener("change", function () {
            state.type = typeSelect.value;
            renderMessages();
        });
        state.nodes.type = field(t("compose.term"), typeSelect);

        var valueInput = element("input", "wdp-input wdp-input-value");
        valueInput.setAttribute("type", "text");
        valueInput.setAttribute("autocomplete", "off");
        valueInput.setAttribute("dir", "auto");
        valueInput.addEventListener("input", renderMessages);
        state.nodes.value = field(t("compose.translation"), valueInput);

        state.nodes.messages = element("div", "wdp-messages");
        state.nodes.messages.setAttribute("role", "status");
        state.nodes.messages.setAttribute("aria-live", "polite");
        form.appendChild(state.nodes.messages);

        var foot = element("div", "wdp-modal-foot");
        var submitButton = element("button", "wdp-button wdp-primary", t("compose.addToBatch"));
        submitButton.setAttribute("type", "button");
        submitButton.disabled = true;
        submitButton.addEventListener("click", submit);
        state.nodes.submit = submitButton;
        foot.appendChild(submitButton);

        var batchLink = element("a", "wdp-button", t("compose.reviewBatch"));
        batchLink.setAttribute("href", (window.WDPropPathPrefix || "./") + "batch.html");
        foot.appendChild(batchLink);
        modal.appendChild(foot);

        backdrop.addEventListener("click", function (event) {
            if (event.target === backdrop) {
                close();
            }
        });
        document.addEventListener("keydown", onKeyDown);

        document.body.appendChild(backdrop);
        loadEntity();
        valueInput.focus();
    }

    /*
     * The language page renders its results asynchronously, so the buttons are
     * attached as the properties appear rather than on load.
     */
    function enhanceLanguagePage() {
        var lang = urlValue("language", "en");

        Object.keys(CONTAINER_TYPE).forEach(function (containerId) {
            var container = document.getElementById(containerId);
            if (!container) {
                return;
            }

            function attach() {
                var properties = container.querySelectorAll("div.property");
                for (var i = 0; i < properties.length; i++) {
                    addButton(properties[i], CONTAINER_TYPE[containerId], lang);
                }
            }

            /*
             * The property divs are direct children, so watching only those
             * avoids re-triggering on the buttons this adds inside them.
             */
            new MutationObserver(attach).observe(container, { childList: true });
            attach();
        });
    }

    /*
     * The property page lists, for each kind of term, the languages still
     * missing it. Each of those languages gets the same control the language
     * page puts on each property.
     */
    function enhancePropertyPage() {
        var property = urlValue("property", "P31");

        Object.keys(LANGUAGE_CONTAINER_TYPE).forEach(function (containerId) {
            var container = document.getElementById(containerId);
            if (!container) {
                return;
            }

            function attach() {
                var languages = container.querySelectorAll("div.language");
                for (var i = 0; i < languages.length; i++) {
                    addLanguageButton(languages[i], property, LANGUAGE_CONTAINER_TYPE[containerId]);
                }
            }

            new MutationObserver(attach).observe(container, { childList: true });
            attach();
        });
    }

    function addLanguageButton(languageDiv, property, type) {
        if (languageDiv.querySelector(".wdp-add")) {
            return;
        }
        var link = languageDiv.querySelector("a");
        if (!link) {
            return;
        }
        var lang = link.textContent.trim();
        if (!LANGUAGE_CODE_RE.test(lang)) {
            return;
        }

        var button = element("button", "wdp-add", "＋");
        button.setAttribute("type", "button");
        button.setAttribute("title", t("compose.proposeIn", [t("term." + type), lang]));
        button.setAttribute("aria-label", t("compose.proposeIn", [t("term." + type), lang]));
        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            open({ property: property, lang: lang, type: type });
        });
        languageDiv.setAttribute("class", languageDiv.getAttribute("class") + " has-add");
        languageDiv.appendChild(button);
    }

    function addButton(propertyDiv, type, lang) {
        if (propertyDiv.querySelector(".wdp-add")) {
            return;
        }
        var link = propertyDiv.querySelector("a");
        if (!link) {
            return;
        }
        var property = link.textContent.trim();
        if (!/^P[0-9]+$/.test(property)) {
            return;
        }

        var button = element("button", "wdp-add", "＋");
        button.setAttribute("type", "button");
        button.setAttribute("title", t("compose.proposeIn", [t("term." + type), lang]));
        button.setAttribute("aria-label", t("compose.proposeIn", [t("term." + type), lang]));
        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            open({ property: property, lang: lang, type: type });
        });
        propertyDiv.setAttribute("class", propertyDiv.getAttribute("class") + " has-add");
        propertyDiv.appendChild(button);
    }

    WDProp.compose = {
        open: open,
        close: close,
        enhanceLanguagePage: enhanceLanguagePage,
        enhancePropertyPage: enhancePropertyPage
    };

    function init() {
        if (document.getElementById("propertyLabelsNeedingTranslation")) {
            enhanceLanguagePage();
        }

        /*
         * untranslated.html reuses these container identifiers for a different
         * question — which languages have no translations at all — so the
         * property page is identified by an element only it has.
         */
        if (document.getElementById("propertyCode")) {
            enhancePropertyPage();
        }

        var propose = document.getElementById("proposeTranslation");
        if (propose) {
            propose.addEventListener("click", function () {
                open({
                    property: urlValue("property", "P31"),
                    pivot: urlValue("language", null) || undefined
                });
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window.WDProp);
