S-Expression Markup Language (SXML)

This is a simple language for writing XML and HTML.  It's for those of us who
would like to write HTML directly but find the language a little bit too
clunky and a little too easy to make mistakes with.  SXML just makes it a
little bit nicer.

Minimal effort is made to guard against bad code and it is quite possible to
produce broken HTML. For convenience, angled brackets are escaped in positions
where that is likely to be the preferred option.

If you need to guard against script injection, you should run the HTML
generated from the SXML against a library dedicated to that purpose.
