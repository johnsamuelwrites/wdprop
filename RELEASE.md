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
* Headings of the long tables stay in place as the rows scroll past

Fixes

* All fifteen sidebar entries now fit on a laptop screen; the last few sat
  below the fold behind a scrollbar that was almost invisible
* templates/translated.html loaded neither script defining toggleTheme or
  toggleMobileMenu, so its theme switch and menu button did nothing, and it
  was missing the Dashboard entry the other pages have
* Downloading the batch as a file reported nothing at all; it now confirms
* Six SPARQL templates were overwritten in place, destroying their own
  placeholders on first use
* On the language page for a chosen property, the description and alias
  sections ran the label query, so all three showed the same result
* mwwdprop.js and wdprop.js both defined createDivLanguage; on the property
  page, which one ran depended on script order

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
