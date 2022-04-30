var util = require('./util');
function index_of_token_end(tkn) {
    var matchEndOfToken = tkn.match(/(\)|\s)/);
    return matchEndOfToken? matchEndOfToken.index : -1
}

exports.Buffer_Trait = {
    reset: function(idx) {
        this.cursor = idx || 0;
        if (this.cursor > this.str.length) {
            this.cursor = this.str.length;
        }
        this.substr = this.str.substring(this.cursor);
    },

    advance: function(offset) {
        this.reset(this.cursor + offset);
    },

    skip_whitespace: function(x) {
        x = (x === void 0)? Number.MAX_VALUE : x;

        var nextNonWsChar = this.substr.match(/[^\s]/);
        return nextNonWsChar?
            this.advance(Math.min(x, nextNonWsChar.index)):
            this.reset(Math.min(x, this.str.length));
    },

    is_next_char: function(ch) {
        return this.substr[0] === ch;
    },

    read_whitespace: function() {
        var nextNonWsChar = this.substr.match(/[^\s]/);
        if (nextNonWsChar) {
            return this.read_to(nextNonWsChar.index);
        }
        return this.read_to_end();
    },

    read_to: function(offset) {
        var output = this.substr.substring(0, offset);
        this.advance(offset);
        return output;
    },

    read_to_end: function() {
        var output = this.str.substring(this.cursor);
        this.reset(this.str.length);
        return output;
    }
};

exports.Sexp_Buffer_Trait = Object.create(exports.Buffer_Trait);

Object.assign(exports.Sexp_Buffer_Trait, {
    eventually_read_operator: function() {
        if (this.substr.charAt(1) === '(') {
            this.advance(1);
            return '(';
        }
        var idxTokenEnd = index_of_token_end(this.substr);
        if (idxTokenEnd < 0) {
            return false;
        }
        var result = this.read_to(idxTokenEnd);
        return result;
    },

    process_opening_bracket: function() {
        // Returns array of statuses in reverse order, with
        // sub-status coming before super-status.  That way
        // the consumer can drill down into specifics by
        // using the Array.prototype.pop method.
        this.advance(1);
        switch(util.identify_operator(this.substr)) {
            case 'tag': {
                return ['tag'];
            } break;
            case 'attr': {
                if (this.substr.indexOf('@)') === 0) {
                    this.advance(2);
                    return ['empty', 'attr'];
                }
                var badAttr = this.substr.match(/@\s*\)/);
                if (badAttr && badAttr.index === 0) {
                    this.advance(badAttr[0].length);
                    return ['bad', 'attr'];
                }
                this.advance(1);
                return ['attr'];
            } break;
            case 'bracket': {
                this.advance(1);
                return ['bracket'];
            } break;
        }
        return [];
    }
});

