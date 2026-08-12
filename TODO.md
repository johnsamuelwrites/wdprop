1. ~~Which properties are highly used and their translation status~~
2. ~~Language~~
     * ~~Top used properties that still miss translation~~
     * ~~Show language labels~~
3. Statistics
     * Visualize language translation statistics (labels, descriptions and
       aliases) — compare.html draws bars for the languages being compared and
       pathviz.html draws the path each term took, but a language on its own
       has figures and no picture
4. ~~Export statistics~~
     * ~~JSON~~
     * ~~CSV~~ — every listing carries a download beneath it. The file holds
       every row the table holds, not only the page on show, and the control
       says how many of them have been named so far, since a long listing is
       fetched as it is paged through. Nothing is requested to build the file
6. Add one-line description on the main page for every section
    * Translation statistics by languages
    * Navigate properties
    * Search properties
    * Compare translation statistics
    * Wikidata property discussion
    * Wikidata WikiProjects
    * About
7. Add description on every subpage
    * Example: Supported languages: what does that mean?
    * Example: WikiProjects: What does that mean?
8. Add search/filter option on every subpage
    * The property classes and the WikiProjects filter as you type, through
      wdpropFilterTable, which re-pages what matches rather than hiding rows
    * ~~Datatypes~~ — the datatype table now has a search box before the rows;
      it narrows the rows by datatype name and lets the existing pager rebuild
      itself over the match set
    * The listings that do not yet offer it: provenance and the per-language
      property lists. It is one call per page against a table that is already
      built
    * Example: User can type en or eng or english
9. Languages:
    * Group languages by
        * Alphabetical order
        * Language tree
    * Show languages on World Map
10. Properties:
    * ~~Display available information like label, description or alias on
      hovering~~ — shown in the row itself rather than on hover, so it is
      there for a keyboard and a touch screen too
    * ~~Group properties by usage count~~
    * Group properties by
        * Property subclasses
        * Possible visualisation: Hierarchical visualisation, treemap or heatmap
11. ~~Property classes~~
    * ~~Show paginated tables~~ — every long table, the classes among them, is
      paged 50 rows at a time; the classes page filters by item identifier
12. ~~Show loading symbol in addition to 'Fetching data'~~ — a section now
    shows placeholder rows the shape of what is coming, and says so when a
    query finds nothing or fails, with a way to ask again
13. ~~WikiProjects~~
    * ~~Paginated tables~~ — the same paged table as every other listing, with
      the projects fetched from the search API in parallel rather than through
      the query service
14. ~~Highlight~~
    * ~~Sidebar elements on click~~ — the entry for the page being shown is
      marked, and pages below one carry a breadcrumb back to it
15. Use of subtabs for every subpage
    * Load information on clicking of subtabs
16. Add comments to the scripts: wdprop.js and mwwdprop.js
    * The navigation, query-state, paging and row-filling code is commented;
      the older query-building and rendering code is not yet
17. Refactor codes of wdprop.js and mwwdprop.js: Explore classes and better way to handle queries (mediawiki and wikidata).
    * ~~The sidebar is built from one list instead of being repeated in the
      markup of all 39 pages~~
    * ~~Loading, empty and failure states are handled once, in queryWikidata
      and queryMediaWiki, rather than left to each caller~~
    * ~~A listing's columns are grouped by the request that answers them
      rather than each fetching for itself, so a page costs one request per
      source however many columns it draws~~
    * The listing renderers are still six near-copies of one table
18. ~~Show additional information on property page~~
    * ~~property creation date~~
    * ~~property data type~~
    * ~~how many items use the property~~ — exactly, which the listings give
      only as a bound
19. ~~Show Wikidata query and Mediawiki API along with the results~~
20. ~~Download SVG option for path visualization~~ — the diagram is drawn as
    SVG rather than as a picture of one, so what leaves can be scaled or put
    in a paper. The colours are resolved on the way out, the text being filled
    with a custom property that means nothing away from the stylesheet
21. Link to property discussion page
    * Support, Oppose, Neutral and Oppose count
22. ~~Show what a page costs~~
    * ~~A count of requests in the header, and what they were for~~
    * Watch the count on the pages not yet looked at — anything that grows
      with the number of rows is the same fault the usage column had. The
      dashboard, the workbench and stale.html have not been read this way yet
23. Colour
    * ~~Contrast is checked by the test suite rather than by eye~~ — both
      themes, every ink-on-background pair the stylesheet actually makes,
      against WCAG AA. It was written after white on the dark accent (1.77:1)
      and the light accent as link text (3.41:1) had both been shipped
    * ~~Sidebar and language chooser hover contrast~~ — the hover state now has
      its own surface and ink tokens. Light mode uses a white navigation tile
      with dark text; dark mode uses the cyan accent with the dark on-accent
      ink, so hovering Properties, Languages or the chooser changes both the
      background and the text as one decision
    * ~~Filled accent controls carry the readable accent~~ — table headings,
      primary action buttons, skip links, primary WDProp buttons and small
      tags use `--accent-strong` with `--on-accent`, leaving `--accent-color`
      for decoration that does not carry text
    * Add a pair to tests/contrast.test.js whenever a rule puts an ink on a
      background it did not before. The list is deliberately written by hand:
      a pairing is a decision, and this is where the decisions are declared
    * The status colours are checked on a card only. They also appear on the
      page background and inside filled chips, which are different sums
24. The stylesheet is 4,400 lines and addresses several things by more than
    one name. `.property` naming both a floating pill and a table cell is what
    made a row unreadable when pointed at; that one is split, the rest are not
    looked for yet
