var chai = require('chai')
var parser = require('../src/parser');
var parse = parser.parse;
var render = parser.render;
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.use(sinonChai);
var expect = chai.expect;

describe('log_parse_error', function() {
    it.skip('logs to stderr', function() {
        expect(true).to.eql(false);
    });
});

describe('whitespace between an opening bracket and a token', function() {
    it('writes it out as a string', function() {
        expect(parse('( token)')).to.eql('( token)');
    });
});

describe('(tag)', function() {
    it('maintains whitespace when self-closing a tag', function() {
        expect(parse('(tag )')).to.eql('<tag />');
    });

    it('adds a space to a self-closing tag if non is present', function() {
        expect(parse('(tag)')).to.eql('<tag />');
    });

    it('handles spaces between nested tags on same line', function() {
        expect(parse('(li (em Item 1))')).to.eql('<li><em>Item 1</em></li>');
        expect(parse('(li  (em Item 1))')).to.eql('<li> <em>Item 1</em></li>');
    });

    it('preserves newlines when auto-closing a tag', function() {
        var input = `(tag
)`;
        var output = `<tag
/>`;
        expect(parse(input)).to.eql(output);
    });

    it('respects newlines when adding operands', function() {
        var input = `(tag
foobar)`;
        var output = `<tag>
foobar</tag>`;  // Should we put the closing tag on a new line? Perhaps have a format mode?
        expect(parse(input)).to.eql(output);
    });

    it('maintains nesting of s-exp when producing html', function() {
        var input = `(tag
  (subtag foo)
)`;
        var output = `<tag>
  <subtag>foo</subtag>
</tag>`;
    });

    it('adds an attribute to opening tag if it is the first operand', function() {
        expect(parse('(tag (@attr))')).to.eql('<tag attr />');
    });

    it('adds an attribute with value to opening tag if it is the first operand', function() {
        expect(parse('(tag (@attr foo))')).to.eql('<tag attr="foo" />');
    });

    it('adds multiple attributes to opening tag if they are amongst the first operands', function() {
        expect(parse('(tag (@attr) (@attr val))')).to.eql('<tag attr attr="val" />');
    });

    it('preserves whitespace when adding multiple attributes', function() {
        var input = `(tag
  (@attr)  (@attr val)
  (@foo bar))`;

        var output = `<tag
  attr  attr="val"
  foo="bar" />`;

        expect(parse(input)).to.eql(output);
    });

    it('nests tags', function() {
        expect(parse('(ul (li List Item))')).to.eql('<ul><li>List Item</li></ul>');
    });
    it('preserves whitespace while nesting tags', function() {
        var input = `(ul
  (li List Item)
)`;

        var output = `<ul>
  <li>List Item</li>
</ul>`;
        expect(parse(input)).to.eql(output);
    });
});

describe('(@)', function() {
    var logger;

    before(function() {
        logger = sinon.stub(parser, 'log_parse_error').callsFake(function(){});
    });

    afterEach(function() {
        logger.reset();
    });

    it('writes out an empty string if no attribute name is provided', function() {
        expect(parse('(@)')).to.eql('');
    });

    // Might change this rule to just write out the whitespace
    it.skip('writes out an empty string if no attribute name an only whitespace is provided', function() {
        expect(parse('(@ )')).to.eql('');
    });

    it.skip('logs to stderr if no attribute name is provided', function() {
        parse('(@)')
        expect(logger).to.have.been.calledWith({
            msg: "Invalid attribute name", line: 1, token: ''
        });
    });

    it('writes out a bad attribute name if that is what is provided', function() {
        var badAttrNames = ["(@' )"];
        badAttrNames.forEach(function(name) {
            expect(parse(name)).to.eql("' ");
        });
    });

    it.skip('logs to stderr if a bad attribute name is provided', function() {
        parse("(@')");
        expect(logger).to.have.been.calledWith({
            msg: "Invalid attribute name", line: 1, token: "'"
        });
    });

    it('writes out just the name if it is the only thing provided', function() {
        expect(parse('(@attr)')).to.eql('attr');
    });

    it('writes out a double quoted value in double quotes', function() {
        expect(parse('(@attr "val")')).to.eql('attr="val"');
    });

    it('writes out a single quoted value in single quotes', function() {
        expect(parse("(@attr 'val')")).to.eql("attr='val'");
    });

    it('skips escaped quotes when writing out single quoted attribute values', function() {
        expect(parse("(@attr 'va\\'l')")).to.eql("attr='va\\'l'");
    });

    it('skips escaped quotes when writing out double quoted attribute values', function() {
        expect(parse('(@attr "va\\"l")')).to.eql('attr="va\\"l"');
    });

    it('writes out the name equal to the value wrapped in quotes when no quotes are provided', function() {
        expect(parse('(@attr val)')).to.eql('attr="val"');
        expect(parse('(@attr false)')).to.eql('attr="false"');
        expect(parse('(@attr multi word val)')).to.eql('attr="multi word val"');
    });

    // Not sure how best to deal with this.  Should we tidy
    // things up or leave it to the user to get it right?
    it.skip('escapes single quotes within non-quoted value', function() {
        expect(parse('(@attr va"l)')).to.eql('attr="va\\\"l"');
    });

    it('writes out values with the same quotes that are provided', function() {
        expect(parse('(@attr "multi word val")')).to.eql('attr="multi word val"');
        expect(parse("(@attr 'multi word val')")).to.eql("attr='multi word val'");
    });

    it('ignores escaped brackets when parsing attribute value and makes no attempt to balance them.', function() {
        expect(parse('(tag (@attr ((val))))')).to.eql('<tag attr="((val" />))');
    });

    it('writes out bracketed attribute values and makes no attempt to balance them. They have no significance in this position', function() {
        expect(parse('(tag (@attr (val)))')).to.eql('<tag attr="(val" />)');
    });
    describe('other scenarios', function() {

        it('ignores unmatched closing bracket', function() {
            expect(parse('(foo (@attr )(val)))')).to.eql('<foo attr><val /></foo>)');
        });
    });

    describe('brackets between quoted attribute values', function() {
        it('considers them as part of the string literal', function() {
            var str = '(@attr "(val)")';
            expect(parse(str)).to.eql('attr="(val)"');

            var str = "(@attr '(val)')";
            expect(parse(str)).to.eql("attr='(val)'");

            var str = "(@attr 'val)')";
            expect(parse(str)).to.eql("attr='val)'");
        });
    });


    describe('badly formed XML', function() {
        it('writes out the same attribute twice if it is provided twice', function() {
            expect(parse('(tag (@attr foo)(@attr bar))')).to.eql('<tag attr="foo" attr="bar" />');
        });

        it('ignores nested attributes and matches first bracket it finds', function() {
            expect(parse('(tag (@attr foo (@attr bar)))')).to.eql('<tag attr="foo (@attr bar" />)');
        });

    });
});

describe.skip('escape sequence', function() {
    // - Could have a fn? (&l) (&r) (&nbsp) etc
    it('the provided char to its escape sequence', function() {
        expect(parse('(&&)')).to.eql('&amp;');
        expect(parse('(&<)')).to.eql('&lt;');
        expect(parse('(&>)')).to.eql('&gt;');
    });

    it('repeats the char the number of times provided in the argument', function() {
        expect(parse('(&nbsp 4)')).to.eql('&nbsp;&nbsp;&nbsp;&nsbp;');
    });
});

describe.skip('automatically escaped chars', function() {
    it('automatically escapes <', function() {
        expect(parse('<')).to.eql('&lt;');
    });

    it('automatically escapes >', function() {
        expect(parse('>')).to.eql('&gt;');
    });
});

describe('brackets', function() {
    it('an s-exp with an opening bracket demarks bracketed text', function() {
        expect(parse('A minor ((or slight) change')).to.eql('A minor (or slight) change');
    });

    it('a bracketing s-exp can be closed with 2 closing brackets', function() {
        expect(parse('A minor ((or slight)) change')).to.eql('A minor (or slight) change');
    });

    it('allows for parsing within bracketed area', function() {
        expect(parse('(AB (((CD (EF lorem:) ipsum dolar))))')).to.eql('<AB>(<CD><EF>lorem:</EF> ipsum dolar</CD>)</AB>');
    });

    it('can be closed with a single bracket', function() {
        expect(parse('(AB hello ((bracketed) world)')).to.eql('<AB>hello (bracketed) world</AB>');
    });

    it('can be closed with a double bracket', function() {
        expect(parse('(span ((bracketed)))')).to.eql('<span>(bracketed)</span>');
    });
});


// TODO:
// - Quirks attribute within HTML tag should remove doctype definition.
