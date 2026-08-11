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
* A section shows placeholder rows the shape of the results it is waiting for,
  says so plainly when a query finds nothing, and when a query fails says what
  went wrong and offers to ask again
* Long tables are shown 50 rows at a time, with the position announced
* The sidebar is built from one list rather than repeated in the markup of
  every page, where the copies had begun to drift apart

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
