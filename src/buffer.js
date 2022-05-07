function index_of_token_end(tkn) {
    var matchEndOfToken = tkn.match(/(\)|\s)/);
    return matchEndOfToken? matchEndOfToken.index : -1
}

export var Buffer_Trait = {
    reset: function(idx) {
        this.cursor = idx || 0;
        if (this.cursor > this.str.length) {
            this.cursor = this.str.length;
        }
        this.substr = this.str.substring(this.cursor);
    },

    step: function(offset) {
        if (void 0 === offset) {
            offset = 1;
        }
        this.reset(this.cursor + offset);
    },

    skip_whitespace: function(x) {
        x = (x === void 0)? Number.MAX_VALUE : x;

        var nextNonWsChar = this.substr.match(/[^\s]/);
        return nextNonWsChar?
            this.step(Math.min(x, nextNonWsChar.index)):
            this.reset(Math.min(x, this.str.length));
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
        this.step(offset);
        return output;
    },

    read_to_end: function() {
        var output = this.str.substring(this.cursor);
        this.reset(this.str.length);
        return output;
    }
};

export var Sexp_Buffer_Trait = Object.create(Buffer_Trait);

Object.assign(Sexp_Buffer_Trait, {
    eventually_read_token: function() {
        var idxTokenEnd = index_of_token_end(this.substr);
        if (idxTokenEnd < 0) {
            return false;
        }
        var result = this.read_to(idxTokenEnd);
        return result;
    }
});
