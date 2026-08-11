/*
 * WDProp - Translations that no longer match their source
 *
 * A property's Tamil description was written when the English description
 * said one thing. The English description has since been rewritten to say
 * something else. The Tamil description is still there, still counted as
 * translated, and nothing anywhere says it is now describing a property that
 * has changed under it.
 *
 * Wikidata has no notion of this. Every term is an independent value with no
 * link to the term it was translated from, so a translation cannot go stale
 * in any way the software can see. It can only go stale in fact.
 *
 * This works it out from the revision history, which does record it, though
 * not on purpose. Wikibase writes a structured edit summary for every term
 * change:
 *
 *     /* wbsetlabel-add:1|ta *\/ உயிரினம்
 *     /* wbsetdescription-set:1|en *\/ that class of which this subject …
 *     /* wbsetaliases-add:1|fr *\/
 *
 * so the history of a property is also a log of which term, in which
 * language, was last touched when. Comparing the two timestamps — the target
 * term's and the source term's — says whether the translation predates the
 * text it was made from.
 *
 * Three states, and the third is not a failure but a real answer:
 *
 *   current    the translation is at least as new as the source term
 *   drifted    the source term was changed after the translation was made
 *   unknown    something touched the terms without saying which, so neither
 *              can be established. Said plainly rather than guessed at.
 *
 * A drifted translation is not necessarily wrong: the source edit may have
 * been a typo fix. That is why every finding can be opened to show what the
 * source term said before and after, and why the wording throughout is "may
 * be out of date" rather than "is wrong". These are leads for a translator to
 * judge, in the same spirit as the terminology report.
 *
 * Author: John Samuel
 */

window.WDProp = window.WDProp || {};

(function (WDProp) {
    "use strict";

    var API = "https://www.wikidata.org/w/api.php";

    var HISTORY_KEY = "wdprop-stale-history";
    var DAY = 24 * 60 * 60 * 1000;

    /* Enough requests in flight to be quick, few enough to stay polite. */
    var CONCURRENCY = 4;

    /*
     * One request per property, because the API refuses rvlimit for more than
     * one title at a time. 500 is the most an anonymous request may ask for,
     * and it covers the whole history of all but a few dozen properties.
     *
     * A history longer than this is not a dead end. Scanning newest first, a
     * target term that never appears was set before the window began, which is
     * to say before everything in it — including the source change. The
     * verdict is still sound; only the date of the translation is lost.
     */
    var REVISION_LIMIT = 500;

    /* Properties kept in the cache, oldest dropped first. */
    var CACHE_LIMIT = 400;

    var TERM_TYPES = ["label", "description", "alias"];

    /*
     * A language code, or a list of them. Wikibase writes the language into
     * the summary as a bare code, and everything else it writes in that
     * position — a claim's revision number, a merge target — does not look
     * like one.
     */
    var LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

    /*
     * Which terms an edit changed, from the name of the API module that made
     * it. Anything not listed here either says nothing about terms or is not
     * a term edit at all.
     */
    var TERMS_OF_ACTION = [
        { prefix: "wbsetlabeldescriptionaliases", types: TERM_TYPES },
        { prefix: "wbsetlabel", types: ["label"] },
        { prefix: "wbsetdescription", types: ["description"] },
        { prefix: "wbsetaliases", types: ["alias"] },
        /*
         * The bulk form names its languages but not which of their terms it
         * set: "wbeditentity-update-languages-short:0||en, fr". Treated as
         * having touched all three, which is the reading that produces fewer
         * findings rather than more.
         */
        { prefix: "wbeditentity-update-languages", types: TERM_TYPES }
    ];

    /*
     * Edits that cannot have changed a term, so a property whose recent
     * history is all constraint work does not become unreadable. Without this
     * nearly every heavily maintained property would answer "unknown".
     */
    var NOT_TERMS = ["wbsetclaim", "wbcreateclaim", "wbremoveclaims", "wbsetqualifier",
        "wbremovequalifiers", "wbsetreference", "wbremovereferences", "wbsetsitelink",
        "wbcreateredirect", "wblinktitles"];

    /*
     * Written out in full rather than built as "stale.reason." + reason. A
     * key assembled at runtime cannot be found by anything that reads the
     * source, so it looks dead to the message-file check and would be dropped
     * by the next person tidying up unused keys.
     */
    var REASON_KEY = {
        sourceNotFound: "stale.reason.sourceNotFound",
        languageTouched: "stale.reason.languageTouched",
        bulkEdit: "stale.reason.bulkEdit",
        unavailable: "stale.reason.unavailable",
        sourceUnchanged: "stale.reason.sourceUnchanged"
    };

    function t(key, params) {
        return WDProp.i18n ? WDProp.i18n.t(key, params) : key;
    }

    /* ------------------------------------------------------- edit summaries */

    /*
     * What an edit summary says about the terms it changed.
     *
     * Returns one of:
     *   { kind: "terms", types: [...], langs: [...] }  established
     *   { kind: "terms", types: [...], langs: null }   terms, language unsaid
     *   { kind: "other" }                              cannot have been a term
     *   { kind: "unknown" }                            no structured summary
     *
     * A summary whose language list has been abbreviated — Wikibase writes
     * "en, fr, and 3 others" once there are too many to name — is reported as
     * langs: null. The named languages are true but the list is not complete,
     * and a partial list read as a complete one would call a translation
     * current on the strength of a language that is not in it.
     */
    function parseSummary(comment) {
        var text = String(comment == null ? "" : comment);
        var match = /\/\*\s*([a-z][a-z-]*)\s*:([^*]*?)\*\//.exec(text);
        if (!match) {
            return { kind: "unknown" };
        }

        var action = match[1];
        /* The first field is a count of what was changed, not a language. */
        var fields = match[2].split("|").slice(1).map(function (field) {
            return field.trim();
        });

        for (var i = 0; i < NOT_TERMS.length; i++) {
            if (action.indexOf(NOT_TERMS[i]) === 0) {
                return { kind: "other" };
            }
        }

        var types = null;
        for (var j = 0; j < TERMS_OF_ACTION.length; j++) {
            if (action.indexOf(TERMS_OF_ACTION[j].prefix) === 0) {
                types = TERMS_OF_ACTION[j].types;
                break;
            }
        }

        if (!types) {
            /*
             * wbeditentity-update, wbcreate-new, a rollback, an undo, or a
             * summary written by a person: a term may or may not have moved.
             */
            return { kind: "unknown" };
        }

        return { kind: "terms", types: types, langs: languagesIn(fields) };
    }

    /* The language codes named in a summary, or null when they are not all there. */
    function languagesIn(fields) {
        for (var i = 0; i < fields.length; i++) {
            if (!fields[i]) {
                continue;
            }
            var parts = fields[i].split(",").map(function (part) {
                return part.trim();
            });
            if (parts.every(function (part) {
                return LANGUAGE_RE.test(part);
            })) {
                return parts;
            }
            /*
             * A field that holds something other than languages — a revision
             * number, "and 3 others" — is not read as one. Looking at the
             * next field rather than giving up here is what lets
             * "wbsetlabel-add:1|ta" and the two-pipe bulk forms both work.
             */
        }
        return null;
    }

    /* ------------------------------------------------------------ the digest */

    /*
     * Reduces a revision list to the few dates a verdict needs. Everything
     * else about the history is dropped, which is what makes it small enough
     * to cache: a property with four hundred revisions comes down to a few
     * dozen entries.
     *
     *   explicit  newest revision that set exactly this language's term of
     *             this kind, with the revision it happened in
     *   touched   newest revision that changed some term in this language
     *   unsaid    newest revision that may have changed a term without
     *             saying which language
     *   first     the oldest revision in the window
     *   complete  whether the window reaches the creation of the property
     *
     * Revisions must arrive newest first, which is how the API returns them:
     * the first mention of anything is therefore the last time it happened,
     * and everything after it is ignored.
     */
    function buildDigest(revisions, complete) {
        var digest = {
            explicit: {},
            touched: {},
            unsaid: null,
            first: null,
            complete: !!complete,
            n: revisions.length
        };

        revisions.forEach(function (revision) {
            var at = Date.parse(revision.timestamp);
            if (isNaN(at)) {
                return;
            }

            digest.first = at;

            var summary = parseSummary(revision.comment);

            if (summary.kind === "other") {
                return;
            }

            if (summary.kind === "unknown" || !summary.langs) {
                if (digest.unsaid === null) {
                    digest.unsaid = at;
                }
                return;
            }

            summary.langs.forEach(function (lang) {
                if (!(lang in digest.touched)) {
                    digest.touched[lang] = at;
                }
                summary.types.forEach(function (type) {
                    var key = lang + "|" + type;
                    if (!(key in digest.explicit)) {
                        digest.explicit[key] = [at, revision.revid, revision.parentid || 0];
                    }
                });
            });
        });

        return digest;
    }

    /* ----------------------------------------------------------- the verdict */

    /*
     * Whether a translation predates the source term it was made from.
     *
     * The two sides are deliberately not treated alike. The source date must
     * be established — only an edit that named the source language and that
     * kind of term counts — while the target date is allowed the benefit of
     * every doubt: an edit that touched the target language without saying
     * which term, or an edit that said nothing at all, is enough to withhold
     * a verdict. A translator sent to look at a translation that turns out to
     * be fine has been sent for nothing, and a report that does that often is
     * one nobody opens twice.
     */
    function verdict(digest, options) {
        var type = options.type;
        var source = options.source;
        var target = options.target;

        var sourceEdit = digest.explicit[source + "|" + type] || null;
        var sourceAt = sourceEdit ? sourceEdit[0] : null;

        if (sourceAt === null) {
            /*
             * The source term was never explicitly set. With the whole
             * history in the window that means it has stood as it was written
             * when the property was created, and nothing can have drifted
             * from it since.
             */
            if (digest.complete) {
                return { state: "current", sourceAt: digest.first, translatedAt: null,
                    reason: "sourceUnchanged" };
            }
            return { state: "unknown", reason: "sourceNotFound" };
        }

        var targetEdit = digest.explicit[target + "|" + type] || null;
        var targetAt = targetEdit ? targetEdit[0] :
            (digest.complete ? digest.first : null);

        if (targetAt !== null && targetAt >= sourceAt) {
            return { state: "current", sourceAt: sourceAt, translatedAt: targetAt };
        }

        /* Something did touch this language after the source changed. */
        if (digest.touched[target] && digest.touched[target] >= sourceAt) {
            return { state: "unknown", reason: "languageTouched",
                sourceAt: sourceAt, translatedAt: targetAt };
        }

        if (digest.unsaid !== null && digest.unsaid >= sourceAt) {
            return { state: "unknown", reason: "bulkEdit",
                sourceAt: sourceAt, translatedAt: targetAt };
        }

        return {
            state: "drifted",
            sourceAt: sourceAt,
            translatedAt: targetAt,
            revision: sourceEdit[1],
            parent: sourceEdit[2],
            /* The translation is older than the window, date unrecoverable. */
            beyondWindow: targetAt === null
        };
    }

    /* --------------------------------------------------------------- caching */

    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
        } catch (e) {
            return {};
        }
    }

    function writeCache(cache) {
        var ids = Object.keys(cache);
        if (ids.length > CACHE_LIMIT) {
            ids.sort(function (a, b) {
                return cache[a].at - cache[b].at;
            }).slice(0, ids.length - CACHE_LIMIT).forEach(function (id) {
                delete cache[id];
            });
        }
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(cache));
        } catch (e) {
            // The cache saves requests; losing it costs only time.
        }
    }

    function fresh(entry) {
        return !!(entry && entry.digest && (Date.now() - entry.at) < DAY);
    }

    /* Runs the tasks a few at a time rather than all at once. */
    function pool(items, worker) {
        var results = {};
        var index = 0;
        var stopped = false;

        function next() {
            if (stopped || index >= items.length) {
                return Promise.resolve();
            }
            var item = items[index++];
            return worker(item).then(function (value) {
                results[item] = value;
                return next();
            });
        }

        var runners = [];
        for (var i = 0; i < Math.min(CONCURRENCY, items.length); i++) {
            runners.push(next());
        }

        var all = Promise.all(runners).then(function () {
            return results;
        });
        all.stop = function () {
            stopped = true;
        };
        return all;
    }

    /* ------------------------------------------------------------- retrieval */

    function fetchHistory(property) {
        var url = API + "?action=query&prop=revisions" +
            "&titles=" + encodeURIComponent("Property:" + property) +
            "&rvprop=" + encodeURIComponent("timestamp|comment|ids") +
            "&rvlimit=" + REVISION_LIMIT +
            "&rvdir=older&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
            return r.json();
        }).then(function (json) {
            if (json.error) {
                throw new Error(json.error.code || "api");
            }
            var pages = (json.query && json.query.pages) || {};
            var page = pages[Object.keys(pages)[0]];
            if (!page || page.missing !== undefined || !page.revisions) {
                throw new Error("no history");
            }
            /*
             * continue is present when there are older revisions still. Its
             * absence is what tells us the window reaches the creation of the
             * property, which is what lets an unedited source term count as
             * unchanged rather than as unknown.
             */
            return buildDigest(page.revisions, !json["continue"]);
        });
    }

    /*
     * The digest for a property, from the cache when it is recent enough.
     *
     * Cached per property rather than per question: one history answers for
     * every language and every kind of term, so checking Tamil descriptions
     * after Tamil labels costs no requests at all.
     */
    function history(property) {
        var cache = readCache();
        if (fresh(cache[property])) {
            return Promise.resolve(cache[property].digest);
        }
        return fetchHistory(property).then(function (digest) {
            var current = readCache();
            current[property] = { digest: digest, at: Date.now() };
            writeCache(current);
            return digest;
        });
    }

    /*
     * Checks a list of properties. Resolves to a map of property to verdict;
     * a property whose history could not be read gets state "unknown" with a
     * reason of "unavailable" rather than being left out, so the counts on the
     * page always add up to the number of properties asked about.
     */
    function check(properties, options) {
        var done = 0;
        var running = pool(properties, function (property) {
            return history(property).then(function (digest) {
                return verdict(digest, options);
            }).catch(function () {
                return { state: "unknown", reason: "unavailable" };
            }).then(function (result) {
                done++;
                if (options.onProgress) {
                    options.onProgress(done, properties.length);
                }
                return result;
            });
        });
        return running;
    }

    /*
     * What the source term said before and after the edit that a finding
     * rests on.
     *
     * Two revisions of the whole property, which is more than is needed, but
     * there is no way to ask Wikibase for one term at one revision. Fetched
     * only when a reader opens a finding, never for a whole page of them.
     */
    function changed(property, options, revision, parent) {
        var ids = parent ? [revision, parent] : [revision];
        var url = API + "?action=query&prop=revisions" +
            "&revids=" + ids.join("|") +
            "&rvprop=" + encodeURIComponent("content|ids|timestamp") +
            "&rvslots=main&format=json&origin=*";

        return fetch(url).then(function (r) {
            if (!r.ok) {
                throw new Error("Wikidata answered " + r.status);
            }
            return r.json();
        }).then(function (json) {
            var byId = {};
            var pages = (json.query && json.query.pages) || {};
            Object.keys(pages).forEach(function (key) {
                (pages[key].revisions || []).forEach(function (rev) {
                    byId[rev.revid] = termAt(rev, options);
                });
            });
            return {
                before: parent ? (byId[parent] === undefined ? null : byId[parent]) : null,
                after: byId[revision] === undefined ? null : byId[revision]
            };
        });
    }

    /* The source-language term of the wanted kind, out of a revision's JSON. */
    function termAt(revision, options) {
        var slot = revision.slots && revision.slots.main;
        var text = slot && slot["*"];
        if (!text) {
            return null;
        }

        var entity;
        try {
            entity = JSON.parse(text);
        } catch (e) {
            /* An older revision may predate the JSON content model. */
            return null;
        }

        var lang = options.source;
        if (options.type === "alias") {
            var aliases = entity.aliases && entity.aliases[lang];
            return aliases && aliases.length ? aliases.map(function (a) {
                return a.value;
            }).join(", ") : null;
        }

        var group = entity[options.type === "label" ? "labels" : "descriptions"];
        return (group && group[lang] && group[lang].value) || null;
    }

    /* ------------------------------------------------------------ presenting */

    /* A timestamp as a plain date, in the interface language. */
    function date(at) {
        if (!at) {
            return "";
        }
        try {
            return new Date(at).toLocaleDateString(
                WDProp.i18n ? WDProp.i18n.current() : "en",
                { year: "numeric", month: "short", day: "numeric" });
        } catch (e) {
            return new Date(at).toISOString().slice(0, 10);
        }
    }

    /* Why a verdict could not be reached, in words. */
    function explain(result) {
        return t(REASON_KEY[result.reason] || REASON_KEY.unavailable);
    }

    function clearCache() {
        try {
            localStorage.removeItem(HISTORY_KEY);
        } catch (e) {
            // Nothing to do: the cache is optional.
        }
    }

    WDProp.stale = {
        check: check,
        history: history,
        changed: changed,
        verdict: verdict,
        date: date,
        explain: explain,
        clearCache: clearCache,
        internals: {
            parseSummary: parseSummary,
            languagesIn: languagesIn,
            buildDigest: buildDigest,
            pool: pool,
            termAt: termAt,
            REVISION_LIMIT: REVISION_LIMIT
        }
    };
})(window.WDProp);
