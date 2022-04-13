var chai = require('chai')
var index = require('../src/index');
var parse = index.parse;
var render = index.render;
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

describe('(@)', function() {
    var logger;

    before(function() {
        logger = sinon.stub(index, 'log_parse_error').callsFake(function(){});
    });

    afterEach(function() {
        logger.reset();
    });

    it('writes out an empty string if no attribute name is provided', function() {
        expect(parse('(@)')).to.eql('');
    });

    it('writes out an empty string if no attribute name an only whitespace is provided', function() {
        expect(parse('(@ )')).to.eql('');
    });

    it.skip('logs to stderr if no attribute name is provided', function() {
        parse('(@)')
        expect(logger).to.have.been.calledWith({
            msg: "Invalid attribute name", line: 1, token: ''
        });
    });

    it('writes out a bad attribute name if that is what is provided', function() {
        var badAttrNames = ["(@')"];
        badAttrNames.forEach(function(name) {
            expect(parse(name)).to.eql(" '");
        });
    });

    it.skip('logs to stderr if a bad attribute name is provided', function() {
        parse("(@')");
        expect(logger).to.have.been.calledWith({
            msg: "Invalid attribute name", line: 1, token: "'"
        });
    });

    it('writes out just the name if it is the only thing provided', function() {
        expect(parse('(@attr)')).to.eql(' attr');
    });

    it('writes out a double quoted value in double quotes', function() {
        expect(parse('(@attr "val")')).to.eql(' attr="val"');
    });

    it('writes out a single quoted value in single quotes', function() {
        expect(parse("(@attr 'val')")).to.eql(" attr='val'");
    });

    it('skips escaped quotes when writing out single quoted attribute values', function() {
        expect(parse("(@attr 'va\\'l')")).to.eql(" attr='va\\'l'");
    });

    it('skips escaped quotes when writing out double quoted attribute values', function() {
        expect(parse('(@attr "va\\"l")')).to.eql(' attr="va\\"l"');
    });

    it('writes out the name equal to the value wrapped in quotes when no quotes are provided', function() {
        expect(parse('(@attr val)')).to.eql(' attr="val"');
        expect(parse('(@attr false)')).to.eql(' attr="false"');
        expect(parse('(@attr multi word val)')).to.eql(' attr="multi word val"');
    });

    // Not sure how best to deal with this.  Should we tidy
    // things up or leave it to the user to get it right?
    it.skip('escapes single quotes within non-quoted value', function() {
        expect(parse('(@attr va"l)')).to.eql(' attr="va\\\"l"');
    });

    it('writes out values with the same quotes that are provided', function() {
        expect(parse('(@attr "multi word val")')).to.eql(' attr="multi word val"');
        expect(parse("(@attr 'multi word val')")).to.eql(" attr='multi word val'");
    });

    it('ignores escaped brackets when parsing attribute value and makes no attempt to balance them.', function() {
        expect(parse('(@attr ((val)))')).to.eql(' attr="((val"))');
    });

    it('writes out bracketed attribute values and makes no attempt to balance them. They have no significance in this position', function() {
        expect(parse('(@attr (val))')).to.eql(' attr="(val")');
    });

    // TODO: Test once we have completed tag writing.
    describe.skip('other scenarios', function() {
        it('ignores unmatched closing bracket', function() {
            expect(parse('(foo (@attr )(val)))')).to.eql('<foo attr><val/></foo>)');
        });
    });

    describe('brackets between quoted attribute values', function() {
        it('considers them as part of the string literal', function() {
            var str = '(@attr "(val)")';
            expect(parse(str)).to.eql(' attr="(val)"');

            var str = "(@attr '(val)')";
            expect(parse(str)).to.eql(" attr='(val)'");

            var str = "(@attr 'val)')";
            expect(parse(str)).to.eql(" attr='val)'");
        });
    });


    describe('badly formed XML', function() {
        it('writes out the same attribute twice if it is provided twice', function() {
            expect(parse('(@attr foo)(@attr bar)')).to.eql(' attr="foo" attr="bar"');
        });

        it('ignores nested attributes and matches first bracket it finds', function() {
            expect(parse('(@attr foo (@attr bar))')).to.eql(' attr="foo (@attr bar")');
        });

    });
});


// TODO:
// - Quirks attribute within HTML tag should remove doctype definition.
