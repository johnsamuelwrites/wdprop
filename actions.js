/*
 * WDProp - Controls in the markup, handlers in the scripts
 *
 * The buttons and forms carried their behaviour in onclick and onsubmit
 * attributes. That works, and costs three things worth having:
 *
 *   - the attribute is executed as source, so every page needs a Content
 *     Security Policy permitting inline script, which is the policy that
 *     permits everything else injected into a page as well;
 *   - it can only call a global. Every handler a control needs has to be
 *     hung on window, which is how WDProp came to have two functions called
 *     createDivLanguage and to depend on which script loaded last;
 *   - it is a listener per control, attached during parsing, so a control
 *     added afterwards has none.
 *
 * So a control names an action instead:
 *
 *     <button data-action="switchSearchTab" data-arg="properties">
 *
 * and the script that owns the page registers what that name does. The name
 * is looked up in a registry, never evaluated, so an attribute that does not
 * match a registered action does nothing at all rather than something.
 *
 * One listener each for click and submit, on the document, so this holds for
 * controls that are rendered later as well as those in the markup.
 *
 * Author: John Samuel
 */

(function () {
    "use strict";

    var registry = {};

    /*
     * Walks up from the clicked element: the target of a click on a button is
     * often a span inside it, and the action is on the button.
     */
    function actionFor(node) {
        while (node && node !== document) {
            if (node.getAttribute && node.getAttribute("data-action")) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function dispatch(event) {
        var element = actionFor(event.target);
        if (!element) {
            return;
        }
        var handler = registry[element.getAttribute("data-action")];
        if (!handler) {
            return;
        }
        handler(event, element, element.getAttribute("data-arg"));
    }

    document.addEventListener("click", dispatch);
    document.addEventListener("submit", dispatch);

    window.WDProp = window.WDProp || {};
    window.WDProp.actions = {
        /* Several at once: {name: handler}. */
        add: function (handlers) {
            for (var name in handlers) {
                registry[name] = handlers[name];
            }
        },
        /* For the tests, and for working out why a control does nothing. */
        registered: function () {
            return Object.keys(registry).sort();
        }
    };
})();
