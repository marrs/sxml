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
    skip_whitespace: function() {
        var nextNonWsChar = this.substr.match(/[^\s]/);
        if (nextNonWsChar) {
            this.advance(nextNonWsChar.index);
        }
    },
    read_whitespace: function() {
        var nextNonWsChar = this.substr.match(/[^\s]/);
        if (nextNonWsChar) {
            return this.read_to(nextNonWsChar.index);
        }
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
        this.skip_whitespace();
        return result;
    }
});

