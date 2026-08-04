# WDProp 

## Objectives
* Understanding and improving translation of Wikidata properties
* Provide bookmarkable links for different statistics

## Demo
* [https://wdprop.toolforge.org/](https://wdprop.toolforge.org/)
* [WDProp](http://johnsamuel.info/wdprop/index.html)

## Features
* Bookmarkable links
* List of supported languages
* Translation statistics of labels, descriptions and aliases of Wikidata properties
* Missing translation statistics: property labels, descriptions and aliases needing translation
* Search properties by their labels (multilingual)
* Compare translation statistics among different languages
* Navigation of properties by their datatypes and their describing properties
* View already translated labels, descriptions and aliases in any supported language
* Translation statistics of property discussion templates
* Support navigation by classes
* Improve search results
* Support search and language parameter in URLs ([classes,class,search].html)
* Search and Navigate WikiProjects
* Visualize path of translation and provenance information
* Propose translations of property labels, descriptions and aliases, and export them as [QuickStatements](https://www.wikidata.org/wiki/Help:QuickStatements) commands (human-driven)
* Translation workbench: work through the properties still missing a translation, with their meaning shown in the languages you read and the terminology already used in your language
* Translation campaigns: a shareable link pairing a language with a set of properties (a class, a datatype, a WikiProject or a list), showing live progress for labels, descriptions and aliases
* Per-property context while translating: real usage examples, property constraints, and the same label in related languages and variants
* Contributions: what you exported to QuickStatements, checked back against Wikidata, with anything that never arrived put back into your batch
* Terminology consistency: find words that have been translated several different ways in a language, with the properties behind each rendering
* Fully localised interface (English, French, Spanish), switchable from the header or with `?uselang=fr`; messages are plain JavaScript files, so WDProp works when opened directly from disk as well as when hosted. Adding a language means adding one file under `i18n/`
* Keyboard and screen-reader accessible: skip links, landmarks, named controls, a focus-trapping dialog, and status that is never signalled by colour alone

## Tests

    node tests/run.js

Plain Node, no dependencies. See [tests/README.md](tests/README.md).

## Author
* John Samuel
* [List of all contributors](https://github.com/johnsamuelwrites/wdprop/graphs/contributors)

## Conference Proceedings
* **WDProp: Web Application to Analyse Multilingual Aspects of Wikidata Properties**, John Samuel, OpenSym 2021, 15-17 September 2021, Madrid ([Slides](https://figshare.com/articles/presentation/WDProp_Web_Application_to_Analyse_Multilingual_Aspects_of_Wikidata_Properties/16641502))
* **Analyzing and Visualizing Translation Patterns of Wikidata Properties**, John Samuel, [CLEF 2018](http://clef2018.clef-initiative.eu/index.php?page=Pages/accepted_papers.html"), Avignon, France, 10-14 September, 2018, Lecture Notes in Computer Science, vol 11018. Springer, Cham ([Slides](https://figshare.com/articles/presentation/Analyzing_and_Visualizing_Translation_Patterns_of_Wikidata_Properties/7067510), [Link](https://link.springer.com/chapter/10.1007%2F978-3-319-98932-7_12))
* **Towards Understanding and Improving Multilingual Collaborative Ontology Development in Wikidata**, John Samuel, Wiki Workshop 2018 (held at The Web Conference 2018), Lyon, France, 24 April 2018 ([Slides](https://figshare.com/articles/Towards_Understanding_and_Improving_Multilingual_Collaborative_Ontology_Development_in_Wikidata/6171080), [Link](http://wikiworkshop.org/2018/#papers), [PDF](http://wikiworkshop.org/2018/papers/wikiworkshop2018_paper_12.pdf), [Open access](https://doi.org/10.5281/zenodo.1219239))
* **Collaborative Approach to Developing a Multilingual Ontology: A Case Study of Wikidata**, John Samuel, Metadata and Semantic Research. MTSR 2017. Communications in Computer and Information Science, vol 755. Springer, Cham ([Slides](https://figshare.com/articles/journal_contribution/Towards_Understanding_and_Improving_Multilingual_Collaborative_Ontology_Development_in_Wikidata/6171080), [Link](https://link.springer.com/chapter/10.1007%2F978-3-319-70863-8_16))

## Acknowledgements
* Wikidata Community

## Archives and Releases
* [Software Heritage](https://archive.softwareheritage.org/browse/origin/https://github.com/johnsamuelwrites/wdprop/directory/)
* [Zenodo](https://doi.org/10.5281/zenodo.1174371)
* [Release Notes](RELEASE.md)

## Licence
All code are released under GPLv3+ licence. The associated documentation and other content are released under [CC-BY-SA](http://creativecommons.org/licenses/by-sa/4.0/).
