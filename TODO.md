1. ~~Which properties are highly used and their translation status~~
2. ~~Language~~
     * ~~Top used properties that still miss translation~~
     * ~~Show language labels~~
3. Statistics
     * Visualize language translation statistics (labels, descriptions and aliases)
4. Export statistics
     * JSON
     * CSV
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
    * Example: User can type en or eng or english. 
9. Languages:
    * Group languages by
        * Alphabetical order
        * Language tree
    * Show languages on World Map
10. Properties:
    * Display available information like label, description or alias on hovering
    * ~~Group properties by usage count~~
    * Group properties by
        * Property subclasses
        * Possible visualisation: Hierarchical visualisation, treemap or heatmap
11. ~~Property classes~~
    * ~~Show paginated tables~~ — the classes table is virtually scrolled and
      searchable; every other long table is paged 50 rows at a time
12. ~~Show loading symbol in addition to 'Fetching data'~~ — a section now
    shows placeholder rows the shape of what is coming, and says so when a
    query finds nothing or fails, with a way to ask again
13. ~~WikiProjects~~
    * ~~Paginated tables~~
14. ~~Highlight~~
    * ~~Sidebar elements on click~~ — the entry for the page being shown is
      marked, and pages below one carry a breadcrumb back to it
15. Use of subtabs for every subpage
    * Load information on clicking of subtabs
16. Add comments to the scripts: wdprop.js and mwwdprop.js
    * The navigation, query-state and paging code is commented; the older
      query-building and rendering code is not yet
17. Refactor codes of wdprop.js and mwwdprop.js: Explore classes and better way to handle queries (mediawiki and wikidata).
    * ~~The sidebar is built from one list instead of being repeated in the
      markup of all 39 pages~~
    * ~~Loading, empty and failure states are handled once, in queryWikidata
      and queryMediaWiki, rather than left to each caller~~
18. ~~Show additional information on property page~~
    * ~~property creation date~~
    * ~~property data type~~
19. ~~Show Wikidata query and Mediawiki API along with the results~~
20. Download SVG option for path visualization
21. Link to property discussion page
    * Support, Oppose, Neutral and Oppose count
