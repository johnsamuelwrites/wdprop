# v0.13 (under progress)
===============================================================================
Human-driven translation, alongside the existing analysis.

* Propose translations of property labels, descriptions and aliases, and export
  them as QuickStatements commands. WDProp never edits Wikidata itself: the
  commands are run by the contributor, under their own account
* Translation workbench: work through the properties still missing a term in a
  language, with the property's meaning shown in one or more languages the
  translator reads, and a keyboard-driven flow
* Validate proposals before export — duplicate property labels, length limits,
  script mismatches, and terms added to Wikidata since the batch was started
* Per-property context while translating: real usage examples, property
  constraints, and the same label in related languages and variants
* Terminology suggestions drawn from how the same words were translated before
* Translation campaigns: a shareable link pairing a language with a set of
  properties, showing live progress for labels, descriptions and aliases
* Contributions: what was exported to QuickStatements, checked back against
  Wikidata, with anything that never arrived returned to the batch
* Terminology consistency report: find words translated several different ways
  in a language, with the properties behind each rendering
* Show how heavily each property is used, and order a page by it
* Localised interface in English, French and Spanish, switchable from the header
  or with ?uselang=; messages are plain JavaScript files, so WDProp still works
  when the pages are opened directly from disk
* Keyboard and screen-reader accessible: skip links, landmarks, named controls,
  a focus-trapping dialog, and status never signalled by colour alone
* The sidebar shows which section you are in, and pages reached by a shared or
  bookmarked link — a property, a class, a WikiProject — carry a breadcrumb
  back to the listing they belong to
* Sixteen pages could be reached only by someone who already knew they were
  there. WDProp knew its own shape — which page sits under which section — but
  used it solely to draw that breadcrumb, which is read after arriving. Read
  the other way, the same list gives each section page a card for everything
  beneath it, with a line saying what it is for. Only one section had linked
  its own pages at all, and the Language Atlas was a bare line of text at the
  foot of it
* An index of every page, one line in the sidebar rather than sixteen, built
  from that same list. A test compares it against the files on disk in both
  directions, so a page that exists cannot go unlisted
* The search finds WDProp's own pages as well as properties, matching a name,
  a description or an address. The list is already in the browser, so they are
  on screen before Wikidata has answered
* A section shows placeholder rows the shape of the results it is waiting for,
  says so plainly when a query finds nothing, and when a query fails says what
  went wrong and offers to ask again
* Long tables are shown 50 rows at a time, with the position announced
* Properties are listed as tables that name them, rather than as a wall of
  chips carrying a bare P-number. A datatype, a class or a provenance listing
  now shows each property's label and description, marks the ones the language
  being read has not reached yet, counts them in the heading, and offers that
  set to the workbench in one step. The listings were also cut at a hundred
  rows in silence, under a heading that counted the whole result, and cut by
  property number rather than in the order the query asked for — a datatype
  holding ten thousand properties announced ten thousand and drew the hundred
  oldest
* The property classes are that same table. classes.html had a mechanism of
  its own: the ordinary renderer drew a table into a hidden div, a second file
  parsed that table's HTML back into objects, and re-rendered them into a
  bespoke virtual scroller — a round trip through the DOM to arrive where the
  data had started. It is paged like every other listing now, and classes.js
  is gone. Its label filter becomes an identifier filter, the class names no
  longer all being present to match against
* The classes query dropped from 28.7 to 5.3 seconds by not asking for the
  labels, which were 67 KB of its 433 KB but most of its time. It also could
  not say what it had not found: 2,610 of the 3,082 classes have no Tamil
  label, and the old table printed the item identifier in the label column
  when one was missing, so five rows in six read as though the class were
  named "Q21451142"
* The WikiProjects are that table too, and wikiprojects.js is gone with
  classes.js. The listing asked the query service, which federated the question
  straight back to the MediaWiki search API through SERVICE wikibase:mwapi:
  thirty-five seconds for four thousand project names. Asked of that API
  directly, by title rather than by free text, and with its nine pages of five
  hundred requested at once — they are reached by offset, so none waits on
  another — the same listing is 4,339 projects in 1.6 seconds
* Both searches on search.html make the same move, and were worse. Finding a
  property asked the query service three questions joined with UNION: labels
  containing the term, properties named by P1963 on an item whose label
  contains it, and properties whose P31 class is labelled with it. The last
  two matched a label in every language Wikidata has and threw all but English
  away afterwards, which is a scan per language for want of a text index.
  ?search=software took 58 seconds, of which the first branch was 5; the third,
  asked on its own, was refused after 8. The search index answers in 0.4, and
  answers better: a property page carries its labels, aliases and descriptions
  in every language, so a property described as being about software is found
  without being called software, ranked by relevance rather than sorted by
  label. Finding a WikiProject was the same shape — every page mentioning
  "Wikidata:WikiProject" fetched through SPARQL and then filtered by title,
  27 seconds for "heritage" — and is now one title search, four tenths of a
  second
* A property label was put into its cell through innerHTML, so a label
  containing a `<` was markup by the time it was read. It is text now
* Search results came back in English however the interface was set. "en" was
  the default written into the search, and written again into every example
  link on the dashboard and the search page, so a reader working in French
  searched in French, read a French interface, and got English labels — on a
  tool whose subject is which languages Wikidata has been translated into. The
  results are named in the language being read; an address naming a language
  still means that language. Where a property has no label in it, the English
  one is shown and marked as English, which is the same three states every
  other listing shows rather than a silent substitution
* The interface language and the `language` parameter are two questions and are
  kept apart. The first is what WDProp's own words are in, chosen with the
  switcher or with uselang, and belongs to whoever is reading; the second is
  which language's labels a page is about, and is what makes a link worth
  sending to someone. A search typed into the form never reached the address at
  all — the submit is cancelled so the results can be drawn in place — so there
  was nothing to bookmark and nothing to share. The address now carries the
  term and the language actually used, and a link that names a language means
  that language whatever the interface of whoever opens it. One that names none
  is answered with the language being read, and changing that changes the
  results
* Changing language with results on screen refetches them. The interface
  retranslates itself from the message files, and Wikidata's text cannot: it
  was fetched in one language and has to be asked for again. i18n.js announces
  the change now, for any section that needs to
* The dashboard is drawn again when the language changes, and it needed to be:
  its language names, service words and the line saying when the coverage
  figures are from are built in JavaScript from messages looked up as they are
  built, and that moment is before the language has arrived — every message
  file but English is fetched by a script tag. A French page drew its dashboard
  in English and never revisited it
* The translation coverage list is in order of coverage. It came out in the
  order the languages are declared in, which put German above French on three
  thousand fewer property labels, so the bars went up and then down again
* A WikiProject is not one page, and its properties are no longer looked for
  as though it were. Wikidata:WikiProject Cultural heritage links to no
  property at all — the 56 it works with are spread over its reports and
  guidelines — and Organizations keeps its 44 on /Ontology and /Public Sector
  Organizations. Both came back empty. The project's whole tree is asked for
  at once now, as allpages over the project namespace with the links of every
  page it returns narrowed to properties: one request and a third of a second
  for either of those, and a line under the table saying how many pages the
  properties were found across. Backlinks — "what links here" — answer the
  question from the other end, for one property at a time, so finding a
  project's properties that way would mean asking it of all thirteen thousand.
  A property named in prose rather than linked is still not found: the link
  tables are what MediaWiki records, transclusions included
* A project with no properties left three sections saying they were still
  fetching. Their statistics take the properties from a SPARQL VALUES block,
  and with none to put in it WDQS reads the empty block as no constraint at
  all and goes through every label in Wikidata — 33 seconds, three times over,
  before answering 502. Nothing is asked when there is nothing to ask about
* wikiproject.html offered two examples — "WikiProjects related to Heritage",
  "…to programming language" — as links to itself carrying a search parameter
  that page reads nothing of, so both landed on the same default project
  whatever they said. They point at the search now, which honours them
* compare.html said "No data available" for every comparison. Its bar charts
  read their numbers back out of the page — the callback drew a chip per
  language reading "en (2847)", and the chart found each `.language a`, matched
  that text with a regular expression, and turned it back into a language and a
  count. The chips became a table, as every listing did, and the selector then
  matched nothing, while the query behind it answered perfectly well. The
  answer is the argument to that callback; nothing needs parsing
* The dashboard's translation coverage took 20 seconds to arrive, which is
  longer than a dashboard is looked at. There is no faster way to ask it —
  labels are not indexed, so each of the five counts is a scan of thirteen
  thousand properties, and asking as one pass rather than five joins is 19
  seconds — so the figures are kept for a day. What was kept is drawn at once,
  whatever its age, refreshed behind it only when the day is up, and dated
  where it came from store rather than from Wikidata
* A page has to load the files it will actually reach into. search.html did not
  load mwwdprop.js, where its search had just moved, so the search called a
  function that did not exist on that page and quietly returned nothing. The
  test suite now walks each page's entry point in pageinit.js through WDProp's
  own calls and fails if it reaches a file the page does not load
* Beneath it sat two paging schemes, neither of which ran. The renderer
  appended "next" links carrying limit and offset in the URL, while
  wikiprojects.js overrode the query to drop LIMIT and OFFSET altogether and
  virtualised the result instead — parsing the table's HTML back into objects
  to do it
* wikiproject.html ran a SPARQL query for no reason but to put a label beside
  each of a project's properties, in English, on a page about translating them
  into other languages. The identifiers were already in the links the API had
  returned, so the properties are simply the ordinary table now, named in the
  reader's language. Its "Total N properties" heading was built, filled in, and
  never appended to anything, so the page had never once shown the figure
* The datatypes page was eighteen links and nothing else. The links are still
  the point of each row and still the first thing in it, but beside them now
  are how many properties the datatype holds and how many the reader's
  language has not reached — the two figures that say which link is worth
  following. ExternalId holds 10,497 properties of which 10,462 have no Tamil
  label; CommonsMedia 93 of which 70
* Those figures cost far more than the links do, so they are fetched after
  them rather than with them. The bare list answers in a quarter of a second,
  adding the property counts takes it to one, and adding the per-language
  check takes it to ten: asked as one query, a page that had appeared at once
  showed nothing at all for ten seconds. The links now go up immediately and
  the counts arrive into the rows already on screen — and as two queries
  rather than one, so the sizes are not held up behind the slow figure
* The property-discussion templates were four separate walls of language codes,
  one per template, each under a count. That says how many languages have a
  template but never which, and never the question worth asking — which
  languages have some of the four and not the rest. It is one row per language
  now, one column per template, the languages missing most first: 65 languages
  appear across the four, 38 have all of them, and 27 fall back to English
  partway through a property discussion
* Those terms are fetched for the fifty rows on show, not for the whole
  listing. Asked of the query service with their labels and descriptions, the
  ten thousand external-identifier properties are 4.6 MB and twenty seconds,
  of which a reader sees fifty rows; the identifiers alone are 1.25 MB in two,
  and each page costs a further 13 KB when it is reached. Usage figures are
  fetched the same way, and were already
* The sidebar is built from one list rather than repeated in the markup of
  every page, where the copies had begun to drift apart

What a page costs

* The header shows how many requests the page has made, turning while any of
  them is in flight, and opens into what they were for — "terms of 50
  properties", not "action=wbgetentities" — with how long each took and whether
  it worked. The figure is the point rather than the list: it should stay where
  it is as a table is paged through, and a page whose count climbs with every
  page turn has a fault in it. It counts by replacing window.fetch rather than
  by asking each caller to report itself, because a request that forgets to
  report is exactly the one worth knowing about. Nothing is sent anywhere and
  nothing is kept between page loads
* It found the fault it was built to find. The usage column asked the search
  API for one property at a time: a page of fifty rows was fifty requests, and
  fifty more for every page turned. Each was quick, so from the outside there
  was nothing to see but a page that was slow today
* The community already maintains the answer. Its property reports are ranked
  by use and paged a thousand at a time — 1-1000 is the thousand most used
  properties with their exact counts, then 1001-2000, to the end of about
  fourteen thousand. One page is one request, 18 KB compressed, and covers a
  thousand properties. A table of fifty now costs one request, and the next
  page of it costs none
* Being ranked is what makes the tail cheap too. A property absent from the
  reports read so far is used less than the last row of the deepest one read,
  so the honest answer is "fewer than 1,200" rather than a request per cell for
  a figure nobody needs precisely — which is all the column is for: enough to
  sort by, enough to choose by. A bound is shown as a bound and never as a
  count. The exact figure is on the property's own page, where one request
  answers for one property, and that page now shows it
* At most two reports are read for any one call, so a page of a table costs at
  most two requests however obscure its properties are. What is read
  accumulates in the day's cache, which the dashboard now counts properly: it
  had been reporting an empty cache while thousands of figures were being
  reused
* Underneath, a listing's columns are grouped by the request that answers them
  rather than each fetching for itself. The label and the description always
  came from one call because they happened to be written as one column; the
  aliases and the term in a related language are in that same answer and are
  columns WDProp does not draw yet. Under the old shape each would have added a
  request per page. A column reading from an answer already being fetched now
  costs nothing, and the fault the usage column had is structurally harder to
  reintroduce
* A table says it is waiting while its rows are being filled, so there is a cue
  beside the data and not only in the header

Colours that can be read

* A property identifier became unreadable exactly when it was pointed at. The
  cell carried white text on the accent colour, and `tr:hover > td` sets a
  background without setting an ink — it wins on specificity, so hovering a row
  replaced the accent behind the identifier with the page's own background and
  left the text white: white on #f5f7fa. A link that disappears when the
  pointer reaches it is a link that cannot be followed
* Underneath it, one class doing two jobs. `.property` names a floating pill in
  a wall of them and the identifier cell of a table row, and the styling was
  written for the pill: an accent fill, white ink, and `float: left`, which on
  a `<td>` takes the cell out of the row it belongs to. The pill is now asked
  for by element, and the identifier cell is a link on the row's own background
* The dark theme was worse and always had been. Its accent is a bright cyan and
  the ink on it was white — 1.77:1, against 4.5:1 for AA — so every identifier
  on every listing had been drawn that way since the theme was added. There is
  now a token for the ink that goes on the accent, declared beside it, because
  it is not white in both themes
* The light accent is 3.41:1 as text on the page: fine behind a gradient, below
  AA for anything anyone has to read, and it was the colour of every link.
  Rather than darken the brand and change every header, sidebar and card, the
  two obligations are separated — `--accent-color` for decoration that carries
  no text, `--accent-strong` for text and for a filled surface that carries it.
  Links are 4.98:1 now and the hue is the same indigo
* None of this was visible in a diff, and all of it is arithmetic, so it is a
  test. tests/contrast.test.js reads the tokens out of style.css, resolves both
  themes, and measures every ink-on-background pair the stylesheet actually
  makes against WCAG 2.1. The pairs are listed by hand: a pairing is a decision
  and this is where the decisions are declared. Its first version resolved both
  themes to the light palette and passed the dark assertions by measuring light
  colours, which is the fault it exists to catch, one level up

The language chooser

* The application opened in French, correctly, and the chooser beside it read
  "English". The chooser is built before the language is worked out — it has to
  exist before there is anything to mark in it — so the option it marked was
  whatever the language was at that moment, which is the fallback and always
  English. Nothing went back afterwards. Picking French to correct it did
  nothing anyone could see, French already being what was on screen
* It cannot be settled once at mount for a second reason: a language other than
  English arrives when its message file loads, which is after everything else
  has finished. It is now put right whenever the language actually takes
  effect, which is the one moment that is true for all three ways in — uselang
  in the address, the choice remembered from last time, and the browser's own
  setting

Taking the results away

* Every listing carries a download beneath it: CSV or JSON, built from the
  table already in the page, with no request sent. A listing that took twenty
  seconds to assemble could not be put in a spreadsheet, cited, or handed to
  anyone without sending them the link and hoping the query still answered
* The file holds every row the table holds rather than the fifty on show, and
  the control says how many of them have been named so far — a listing is
  fetched as it is paged through, so a table of four thousand properties may
  hold four thousand identifiers and fifty names. Exporting that quietly would
  produce a file reading as though Wikidata had no name for 3,950 properties
* The CSV carries a byte order mark. Without one a spreadsheet on Windows reads
  the UTF-8 as the local code page, and a file of Tamil labels arrives as
  mojibake — which ruins exactly the properties WDProp exists to translate
* The path visualisation downloads as SVG, so what leaves is the diagram rather
  than a picture of it. Its custom properties are resolved to the colours they
  currently stand for on the way out: the labels are filled with
  var(--text-primary), which away from this stylesheet means nothing, and the
  file would otherwise open with no text in it

The application itself

* d3 is gone. It was 511 KB — more than every other script in WDProp put
  together — loaded on one page out of forty-one, and what that page used of
  it was a helper for setting attributes and a division. The arc diagram is
  drawn in plain SVG, checked against d3's own arithmetic
* The header, sidebar and skip link are one element, <wdprop-shell>, instead
  of being written out by hand in all forty-one pages. A custom element, not a
  template or an include, because WDProp has no build step and no server and
  still has to open from a disk
* Every on* attribute is gone — a hundred and thirty-three of them. Controls
  name an action, the scripts register what the name does, and the name is
  looked up rather than evaluated. What each page starts when it opens is one
  table in pageinit.js instead of thirty-two body onload attributes
* Five places had grown their own copy of the six lines that ask the query
  service — the URL, the Accept header, the status check and the parse — and
  had begun to differ in which of those they remembered. There is one now, and
  queryWikidata is the version that also owns the loading, empty and failure
  states around it. Two implicit globals went with the copies
* Drawing what is cheap and then filling in the rest for the rows on show was
  written out twice, once for the terms and once for the usage counts, and the
  two had diverged on what happens when the request fails. One function takes
  both, and the failure is decided in one place
* The scripts are deferred, so a page is no longer laid out around four
  blocking downloads. theme.js is deliberately not, being the one that has to
  run before the first paint
* The stylesheet carries the dark palette itself, through prefers-color-scheme,
  so a reader whose system is dark gets a dark page with no flash of white and
  without JavaScript. Choosing a theme still overrides it, in both directions
* Fifteen files opened with the same five lines of "run now or wait for the
  document"; they share WDProp.ready. The previous/next control was written
  twice; it is now in pager.js
* The tests run on push and on every pull request

Fixes

* The translation statistics were 491 language chips with no paging, coloured
  by a five-step gradient over their rank — which put the same shade on the
  second language and the fiftieth. They are a table now, sorted by count,
  paged like every other long listing, with a bar giving each language's share
  of the best-served one: English and Dutch have labels on all 13,807
  properties, French on 10,892. The comparison, class and WikiProject pages
  draw the same table, so all four improve together
* translated.html and untranslated.html had a query each asking the same
  question — how many properties carry a term in each language — one of which
  additionally sorted. They share one query now, and the sorting is done in
  the browser on a few hundred rows rather than by the query service at the
  end of an aggregation over a million terms
* A failed terms request reported every property on the page as untranslated.
  The fetch caught its own errors and returned no entities, which is what a
  property with no label in any language also looks like, so a page that could
  not reach the entity API said "not in this language" against every row —
  claiming a translation was missing on no evidence, on the page whose purpose
  is to say which ones are. It says "unavailable" now, and asks again
* All three sections of untranslated.html had stopped working. Each asked for
  every Wikipedia language MINUS every language a property carries a term in,
  and none of them finished: the MINUS is evaluated against roughly a million
  terms, and the query service answered 504 after seventy-five seconds, so the
  page showed a failure rather than an answer. The same result comes from two
  questions that each finish, subtracted in the browser — which languages
  Wikipedia is written in, and which languages properties are named in — at six
  seconds and four. The second is the query translated.html already asks, and
  the first is asked once for the whole page rather than once per section.
  31 of the 351 Wikipedia languages have no property label at all
* "Properties with references" timed out, and paging it would not have helped:
  the query service tests all fourteen thousand properties and orders what it
  finds before it can return any slice, so a LIMIT saves a third of the work at
  best — measured, nine seconds against fifteen — and an OFFSET pays that again
  for every page. The question is split instead of the answer: the properties
  are listed first, and the reference test is asked of five hundred at a time,
  six batches at once. Each answers in about four seconds, comfortably inside
  the sixty allowed, where the single query sat close enough to the edge to
  fall over it under load. The whole set now comes back in ten seconds, and a
  batch that fails costs its own five hundred rather than the page
* The WikiProjects listing counted the index page as a project. It kept every
  title beginning "Wikidata:WikiProject", which "Wikidata:WikiProjects" does —
  so the list carried that page and its seventy translations among the real
  ones. A project's title continues with a space before its name or a slash
  before a subpage, and that is what is now tested

* Two provenance queries could not be answered at all. Both bound every
  statement of every property — the equivalent-property one did so for no
  reason, since wdt:P1628 already selected what it wanted, and DISTINCT threw
  the result away — and the referenced-statement one then joined that against
  every reference in Wikidata and filtered it with a regular expression over
  the statement URIs. It timed out; asked as a FILTER EXISTS, which stops at
  each property's first referenced statement, it answers in twenty seconds
* Whether a property still needs translating cannot be read off the query
  service's label service, which falls back to English: asked for the external
  identifiers in Tamil it names all ten thousand of them, one of which has a
  Tamil label, so every listing would have reported itself finished. The terms
  come from the entity API, which returns the languages asked for and no
  others, so the English fallback can be shown — a row should be readable
  either way — and still be marked and counted as needing work
* The dashboard stated things it had not checked. The service panel said
  "Online" with a green dot whether or not either service had been asked, and
  every widget carried a specimen figure written into the markup — 12,847
  properties, English 98%, P31 with 89.2M uses — which stayed on screen,
  looking authoritative, whenever the query behind it failed. Nothing is now
  shown that was not fetched: a figure that could not be counted reads as a
  dash rather than a nought, a widget that could not load says so, and each
  service is reported from what this page's own requests actually did
* The most used properties were appended as each label came back, so the ranks
  read #3, #1, #5 down the page depending on the network; and the column
  headed by a usage count repeated the rank instead ("Top 1", "Top 2")
* Property labels from Wikidata were written into the dashboard with innerHTML
* The dashboard was the one page with no translation at all
* All fifteen sidebar entries now fit on a laptop screen; the last few sat
  below the fold behind a scrollbar that was almost invisible
* A query that failed left its spinner turning for good: nothing caught the
  rejection, and no request checked the response status
* A query that returned nothing left an empty box indistinguishable from one
  still loading
* On the property page the details were filled in off a single unguarded
  chain, so a property with no label in the language being asked about — the
  ordinary case on a page about translating them — left the description,
  aliases, datatype and statement counts all silently blank
* Ten pages were missing the Dashboard entry, and templates/translated.html
  loaded neither script defining toggleTheme or toggleMobileMenu, so its theme
  switch and menu button did nothing
* Downloading the batch as a file reported nothing at all; it now confirms
* The Top Properties section of properties.html was written beside the main
  region rather than inside it, so it did not take the margin that keeps a
  page clear of the sidebar and its first column was covered by it
* The context table beside a translation took the styling meant for the
  full-width data tables, including a layout worked out from the content: its
  second column claimed every pixel and squeezed the first away underneath it
* The chips on the languages, properties and property pages disappeared: the
  boxes holding them had their overflow changed to clip, which trims the same
  corners but establishes no block formatting context, so the floated chips
  escaped their container and were clipped away
* Six SPARQL templates were overwritten in place, destroying their own
  placeholders on first use
* On the language page for a chosen property, the description and alias
  sections ran the label query, so all three showed the same result
* mwwdprop.js and wdprop.js both defined createDivLanguage; on the property
  page, which one ran depended on script order
* Pressing Enter anywhere on any page ran a handler that read the value of a
  header search box. The box was styled display:none on the ten pages that had
  it and absent from the other thirty-one, so on those thirty-one every Enter
  key threw, and on the ten it navigated to ./search.html — which, from a
  subdirectory, is a page that does not exist. Searching has always been done
  by the forms on search.html
* compare.js and offlineview.js were missing from the service worker's file
  list, so compare.html and offline.html — the page about working offline —
  were the two pages that did not work offline. sw.js said a test compared
  that list against the directory; no such test existed, and now does
* WDProp installed anywhere other than the root of a host and opened at its
  own root read the directory's name as the page, matching nothing, so the
  dashboard was the one page whose sidebar entry was never marked
* The workbench pager changed every row above it and said nothing: it had no
  live region, which the pager on the data tables has always had

# v0.12 
===============================================================================
* Display translation statistics for selected properties
* Display translation statistics for property classes and WikiProjects
* Display Wikidata or Wikidata Mediawiki query for all pages

# v0.11
===============================================================================
* Show properties used or discussed on Wikidata Wikiprojects
* Add subtitle to all pages
* Update CSS for better responsive interface
* Show all properties (including deleted ones)
* Add option to search Wikiprojects on search page
* Correct HTML tags
* Add links to conference article, Zenodo, Software Heritage and Release notes
* Add author and acknowledgement section

# v0.10
===============================================================================
* Responsive CSS support 


# v0.9
===============================================================================
* Add sidebar
* Remove auto-load search results and logging
* Test SVG-based visualization

# v0.8
===============================================================================
* Add link of the revision (diff and permalink)
* Optimized query to get revisions

# v0.7
===============================================================================
* Navigate properties with provenance information
* Visualization of provenance information

# v0.6
===============================================================================
* Example search and comparison queries
* Search and navigate Wikidata WikiProjects
* Visualize path of translation

# v0.5
===============================================================================
* Support navigation by classes
* Improve search results
* Support search and language parameter in URLs ([classes,class,search].html)

# v0.4
===============================================================================
* Compare translation statistics
* Add support to view translated labels, descriptions and aliases
* Translation statistics of templates

# v0.3
===============================================================================
* Search properties
* About WDProp
* Statistics on missing translations for property labels, descriptions and aliases
* Statistics on languages completely missing translations
* Add .gitignore

# v0.2
===============================================================================
* Statistics on property describing properties (property descriptors)
* Statistics on datatypes of properties 
* Update CSS

# v0.1
===============================================================================
* List of properties
* Statistics on translated labels, descriptions and aliases
