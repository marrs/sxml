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

    skip_to_str: function(str) {
        var idx = this.substr.indexOf(str);
        if (idx > -1) {
            this.advance(idx);
            return this.reset(idx, this.str.length);
        }
        this.reset(this.str.length);
    },

    read_whitespace: function() {
        var nextNonWsChar = this.substr.match(/[^\s]/);
        if (nextNonWsChar) {
            return this.read_to(nextNonWsChar.index);
        }
        return this.read_to_end();
    },

    read_to: function(offset) {
        if (typeof offset === 'string') {
            offset = this.substr.indexOf(offset);
            if (offset < 0) {
                offset = this.substr.length;
            }
        }
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
    eventually_read_token: function() {
        var idxTokenEnd = index_of_token_end(this.substr);
        if (idxTokenEnd < 0) {
            return false;
        }
        var result = this.read_to(idxTokenEnd);
        return result;
    }
});

