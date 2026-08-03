/*
 * WDProp - Translation composer
 *
 * A small dialog for writing one translation, with the property's existing
 * terms in a language the translator reads shown alongside. Opened from the
 * property page and from each property listed as needing translation on the
 * language page.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";

    var TYPES = [
        { value: "label", text: "Label" },
        { value: "description", text: "Description" },
        { value: "alias", text: "Alias" }
    ];

    /* Which list on the language page corresponds to which kind of term. */
    var CONTAINER_TYPE = {
        propertyLabelsNeedingTranslation: "label",
        propertyDescriptionsNeedingTranslation: "description",
        missingPropertyAliases: "alias"
    };

    var state = null;
    var backdrop = null;

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
            box.appendChild(element("p", "wdp-muted", "Loading the existing terms…"));
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
                td.appendChild(element("span", "wdp-missing", "no label"));
            }
            if (terms.description) {
                td.appendChild(element("span", "wdp-sep", " — "));
                td.appendChild(element("span", "wdp-desc", terms.description));
            }
            if (terms.aliases.length) {
                td.appendChild(element("div", "wdp-aliases", "also: " + terms.aliases.join(", ")));
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
                "This property already has a " + state.type + " in " + state.lang +
                " (“" + existing + "”). WDProp only proposes missing terms."));
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
                element("p", "wdp-message wdp-warning", "Could not load existing terms: " + e.message));
        });
    }

    function close() {
        if (backdrop) {
            document.body.removeChild(backdrop);
            backdrop = null;
            state = null;
            document.removeEventListener("keydown", onKeyDown);
        }
    }

    function onKeyDown(event) {
        if (event.key === "Escape") {
            close();
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
            "Added to the batch. " + WDProp.cart.count() + " waiting to be exported."));
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

        backdrop = element("div", "wdp-modal-backdrop");
        var modal = element("div", "wdp-modal");
        backdrop.appendChild(modal);

        var head = element("div", "wdp-modal-head");
        head.appendChild(element("h3", null, "Propose a translation"));
        var closeButton = element("button", "wdp-close", "×");
        closeButton.setAttribute("type", "button");
        closeButton.setAttribute("title", "Close");
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

        function field(labelText, control) {
            var wrapper = element("div", "wdp-field");
            var label = element("label", null, labelText);
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
        state.nodes.pivot = field("I am translating from", pivotInput);

        var langInput = element("input", "wdp-input wdp-input-small");
        langInput.setAttribute("type", "text");
        langInput.setAttribute("value", state.lang);
        langInput.setAttribute("size", "6");
        langInput.addEventListener("change", function () {
            state.lang = langInput.value.trim();
            loadEntity();
        });
        state.nodes.lang = field("into", langInput);

        var typeSelect = element("select", "wdp-input");
        TYPES.forEach(function (t) {
            var option = element("option", null, t.text);
            option.setAttribute("value", t.value);
            if (t.value === state.type) {
                option.setAttribute("selected", "selected");
            }
            typeSelect.appendChild(option);
        });
        typeSelect.addEventListener("change", function () {
            state.type = typeSelect.value;
            renderMessages();
        });
        state.nodes.type = field("Term", typeSelect);

        var valueInput = element("input", "wdp-input wdp-input-value");
        valueInput.setAttribute("type", "text");
        valueInput.setAttribute("autocomplete", "off");
        valueInput.setAttribute("dir", "auto");
        valueInput.addEventListener("input", renderMessages);
        state.nodes.value = field("Translation", valueInput);

        state.nodes.messages = element("div", "wdp-messages");
        form.appendChild(state.nodes.messages);

        var foot = element("div", "wdp-modal-foot");
        var submitButton = element("button", "wdp-button wdp-primary", "Add to batch");
        submitButton.setAttribute("type", "button");
        submitButton.disabled = true;
        submitButton.addEventListener("click", submit);
        state.nodes.submit = submitButton;
        foot.appendChild(submitButton);

        var batchLink = element("a", "wdp-button", "Review batch");
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
        button.setAttribute("title", "Propose a " + type + " in " + lang);
        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            open({ property: property, lang: lang, type: type });
        });
        propertyDiv.appendChild(button);
    }

    WDProp.compose = {
        open: open,
        close: close,
        enhanceLanguagePage: enhanceLanguagePage
    };

    function init() {
        if (document.getElementById("propertyLabelsNeedingTranslation")) {
            enhanceLanguagePage();
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
