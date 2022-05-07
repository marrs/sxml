var buffer = require('./buffer');
var Buffer_Trait = buffer.Buffer_Trait;
var Sexp_Buffer_Trait = buffer.Sexp_Buffer_Trait;
var util = require('./util');

// String catenation by joining an array is a bit faster
// than using +.  Therefore we prefer to build an array
// of string parts rather than appending to a preexisting
// string variable.

function is_found(idxOrStr, substr) {
    if (void 0 === substr) {
        return idxOrStr > -1;
    }
    return idxOrStr.indexOf(substr) > -1;
}

function is_valid_attr_name(name) {
    if (0 === name.length) return false;
    if (is_found(name, '"')) return false;
    if (is_found(name, "'")) return false;
    if (is_found(name, ">")) return false;
    if (is_found(name, "/")) return false;
    if (is_found(name, "=")) return false;
    // Reject control chars
    if (/[\u0000-\u001F\u0020]/.test(name)) return false;
    // Reject nonchars
    if (/[\uFDD0-\uFDEF\uFFFE\uFFFF\u1FFFE\u1FFFF\u2FFFE\u2FFFF\u3FFFE\u3FFFF\u4FFFE\u4FFFF\u5FFFE\u5FFFF\u6FFFE\u6FFFF\u7FFFE\u7FFFF\u8FFFE\u8FFFF\u9FFFE\u9FFFF\uAFFFE\uAFFFF\uBFFFE\uBFFFF\uCFFFE\uCFFFF\uDFFFE\uDFFFF\uEFFFE\uEFFFF\uFFFFE\uFFFFF\u10FFFE\u10FFFF]/.test(name)) return false;
    return true;
}

function last(arr) {
    return arr[arr.length -1];
}

function is_char_quote_mark(ch) {
    return ['"', "'"].indexOf(ch) > -1;
}

function convert_html_chars(str) {
    return str.replace('<', '&lt;').replace('>', '&gt;');
}

exports.log_parse_error = function(data) {
    console.info("TODO: LOG TO STDERR -", data.msg, "- line:", data.line, "token:", data.token);
}

function log_parse_error(data) {
    return exports.log_parse_error(data);
}

function is_within_quote(isQuoting, idxQuote, idxString) {
    if (idxQuote === idxString) {
        throw new Error("Substring and quote char cannot begin at same index");
    }
    if (isQuoting) {
        if (is_found(idxQuote)) {
            return idxQuote > idxString;
        }
        return true;
    }

    if (is_found(idxQuote)) { 
        return idxQuote < idxString;
    }

    return false;
}

function is_quoting_by(idx, idxQuote, isAlreadyQuoting) {
    if (is_found(idxQuote) && idxQuote <= idx) {
        return !isAlreadyQuoting;
    }
    return isAlreadyQuoting;
}

function index_of_closing_quote(str, quoteChar) {
    var maybeClosingQuote = str.indexOf(quoteChar);
    if (maybeClosingQuote < 0) return -1;
    if (0 === maybeClosingQuote) return 0;
    if ('\\' === str.charAt(maybeClosingQuote -1)) {
        // XXX Could stack-overflow in theory
        return maybeClosingQuote + 1 + index_of_closing_quote(str.substring(maybeClosingQuote +1), quoteChar);
    }
    return maybeClosingQuote;
}

function definitely_comes_before(idx1, idx2) {
    if (idx1 > -1 && idx2 < 0) return true;
    return idx1 > -1 && idx1 < idx2;
}

function parse_chunk(strChunk, result, data) {
    var lineLength = strChunk.length;

    var buf = Object.create(Sexp_Buffer_Trait);
    Object.assign(buf, {
        cursor: 0,
        str: strChunk,
        token: '',
        substr: strChunk,
    });

    var tmp = '';

    while (buf.cursor < buf.str.length) {
        // Code:
        //   #?  : Possible escape sequence
        //   #(  : Opened trapdoor
        //   )#? : Closing trapdoor?
        //   (?  : Discover purpose of opening bracket
        //   (#  : Opening an s-exp for a tag
        //   (# ?: Discover what comes after tag operator
        //   (# (: Handle opener discovered within tag operand
        //   (@ ?: Discover what comes after attr operator
        //   (@1 : Handle first char of s-exp for attribute name
        //   (@! : Bad attribute
        //   (@_ : Acquire attribute name
        //   (@ ": Parsing an attribute value wrapped in double quotes
        //   (@ ': Parsing an attribute value wrapped in single quotes
        //   (@ _: Parsing an attribute value not wrapped in quotes
        //   ))  : Handle second closing bracket
        switch (data.processing) {
            case '#?': {
                if ('(' === buf.substr[0]) {
                    data.processing = '#(';
                } else {
                    result[result.length] = '#';
                    data.processing = null;
                }
                buf.step();
            } break;
            case '#(': {
                result[result.length] = buf.read_to(')')
                if (!buf.substr) {
                    return;
                } else {
                    buf.step();
                    data.processing = ')#?';
                }
            } break;
            case ')#?': {
                if ('#' === buf.substr[0]) {
                    buf.step();
                    data.processing = null;
                } else {
                    result[result.length] = ')';
                    data.processing = '#(';
                }
            } break;
            case '(?': {
                if (!buf.substr.length) { return; }
                tmp = util.identify_operator(buf.substr);
                switch (tmp) {
                    case 'tag': {
                        result[result.length] = '<';
                        result[result.length] = ''; // Required by next iteration
                        data.tagStack.push('');
                        data.processing = '(#';
                    } break;
                    case 'attr': {
                        buf.step();
                        data.processing = '(@1';
                    } break;
                    case 'bracket': {
                        data.tagStack.push('(');
                        result[result.length] = '(';
                        buf.step();
                        data.processing = null;
                    } break;
                    default: {
                        result[result.length] = '(';
                        data.processing = null;
                        // XXX Why don't we advance here?
                        // We must be advancing somewhere else?
                        // Is that ok?
                    }
                }
            } break;
            case '(#': {
                tmp = buf.eventually_read_token();
                if (false === tmp) {
                    result[result.length -1] += buf.read_to_end()
                    continue;
                }
                result[result.length -1] += tmp;
                data.tagStack[data.tagStack.length -1] += last(result);
                data.processing = '(# ?';
            } break;
            case '(# (': {
                switch (util.identify_operator(buf.substr)) {
                    case 'attr': {
                        if (!/[\s]$/.test(last(result)) && !data.wsBuf) {

                            data.wsBuf = ' ';
                        }
                        result[result.length] = data.barf_ws();
                        buf.step();
                        data.processing = '(@1';
                    } break;
                    case 'tag': {
                        data.tagStack.push('');
                        result[result.length] = ['>', '<'].join(
                            is_found(data.wsBuf, '\n')? data.barf_ws() : data.barf_ws().substring(1)
                        )
                        result[result.length] = '';
                        data.processing = '(#';
                    } break;
                    case 'bracket': {
                        data.tagStack.push('(');
                        result[result.length] = '>(';
                        buf.step();
                        data.wsBuf = '';
                        data.processing = null;
                    } break;
                    default: {
                        console.error("I should not be here");
                    }
                }
            } break;
            case '(# ?': {
                data.wsBuf += buf.read_whitespace();
                if (!buf.substr) { return; }
                if (buf.substr[0] === ')') {
                    buf.step();
                    // Preserve whitespace for self-closing tags.
                    result[result.length] = (data.barf_ws() || ' ') + '/>';
                    data.tagStack.pop();
                    data.processing = null;
                } else if (buf.substr[0] === '(') {
                    buf.step();
                    data.processing = '(# (';
                } else {
                    result[result.length] = '>';
                    if (is_found(data.wsBuf, '\n')) {
                        result[result.length] = data.barf_ws();
                    } else {
                        result[result.length] = data.barf_ws().substring(1);
                    }
                    data.processing = null;
                }
            } break;
            case '(@1': {
                tmp = buf.substr[0];
                switch (tmp) {
                    case ')': {
                        buf.step();
                        data.processing = null;
                    } break;
                    case /\s/.test(tmp): {
                    } break;
                    default: {
                        if (/[\s'"]/.test(tmp)) {
                            data.processing = '(@!';
                        } else {
                            buf.step();
                            data.tagStack.push('@');
                            result[result.length] = tmp;
                            data.processing = '(@_';
                        }
                    }
                }
            } break;
            case '(@!': {
                result[result.length] = buf.read_to(')')
                if (!buf.substr) {
                    return;
                }
                buf.step();
                data.processing = null;
            } break;
            case '(@_': {
                tmp = buf.eventually_read_token();
                if (false === tmp) {
                    result[result.length -1] += buf.read_to_end()
                    continue;
                }
                result[result.length -1] += tmp;
                data.tagStack[data.tagStack.length -1] += last(result);
                if (!is_valid_attr_name(last(result))) {
                    // XXX Will read funny for super-long attribute names
                    log_parse_error({
                        msg: "Invalid attribute name",
                        line: data.line,
                        token: last(result)
                    });
                }
                data.processing = '(@ ?';
            } break;
            case '(@ ?': {
                buf.skip_whitespace();
                if (buf.substr) {
                    tmp = buf.substr[0];
                    if (is_char_quote_mark(tmp)) {
                        result[result.length] = '=';
                        result[result.length] = tmp;
                        buf.step();
                        data.processing = '(@ ' + tmp;
                    } else if (')' === tmp) {
                        data.tagStack.pop();
                        buf.step();
                        data.processing = '(# ?';
                    } else {
                        result[result.length] = '=';
                        result[result.length] = '"';
                        buf.skip_whitespace();
                        data.processing = '(@ _';
                    }
                }
            } break;
            case '(@ "':
            case "(@ '": {
                tmp = index_of_closing_quote(buf.substr, last(data.processing));
                if (tmp > -1) {
                    result[result.length] = buf.read_to(tmp +1);
                    if (!(0 === tmp && '\\' === data.lastChar)) {
                        data.processing = '(@ ?';
                    }
                } else {
                    result[result.length] = buf.read_to_end();
                }
            } break;

            case '(@ _': {
                tmp = buf.substr.indexOf(')');
                if (tmp > -1) {
                    result[result.length] =
                        buf.read_to(tmp).replace('"', '&quot;');
                    result[result.length] = '"';
                    data.processing = '(@ ?';
                } else {
                    result[result.length] =
                        buf.read_to_end().replace('"', '&quot;');
                }
                continue;
            } break;

            case '))': {
                if (!buf.substr.length) {
                    return;
                }
                if (')' === buf.substr[0]) {
                    buf.step();
                }
                data.processing = null;
            } break;

            default: {
                // Not quoting an attribute value.  Any string that's
                // within an s-exp is a text node (barring the operator).
                //
                // We can put anything up to a closing bracket straight
                // to result if we're in a stack. Anything up to an opener
                // if we're not.

                var idxOpeningBracket = buf.substr.indexOf('(');
                var idxClosingBracket = buf.substr.indexOf(')');
                var idxHash = buf.substr.indexOf('#');

                if (definitely_comes_before(idxClosingBracket, idxOpeningBracket)) {
                    result[result.length] = convert_html_chars(buf.read_to(idxClosingBracket));
                    if (data.tagStack.length) {
                        if ('(' === last(data.tagStack)) {
                            result[result.length] = ')';
                            data.tagStack.pop();
                            data.processing = '))';
                        } else {
                            tmp = data.tagStack.pop();
                            if ('tag' === util.identify_operator(tmp)) {
                                result[result.length] = ["</", ">"].join(tmp);
                            }
                        }
                    } else {
                        result[result.length] = ')';
                    }
                    buf.step();
                    continue;
                }

                if (idxOpeningBracket > -1) {
                    if (idxHash > -1 && idxHash === idxOpeningBracket -1) {
                        result[result.length] = convert_html_chars(buf.read_to(idxHash));
                        buf.step(2);
                        data.processing = '#(';
                        continue;
                    }
                    result[result.length] = convert_html_chars(buf.read_to(idxOpeningBracket));
                    buf.step();
                    data.processing = '(?';
                    continue;
                } else if (idxHash === buf.str.length -1) {
                    result[result.length] = convert_html_chars(buf.read_to(idxHash));
                    data.processing = '#?';
                    buf.step();
                    break;
                } else {
                    result[result.length] = convert_html_chars(buf.read_to_end());
                    break;
                }
            }
        }
        continue;
    }
}

function init_parse_state() {
    var data = {
        line: 1,
        tagStack: [],
        processing: null,
        wsBuf: '',
        lastChar: ''
    };
    data.barf_ws = function() {
        var buf = this.wsBuf;
        this.wsBuf = '';
        return buf;
    }
    return data;
}

exports.parse = function (s) {
    var chunklen = 1;
    var chunk = s.substring(0, chunklen);
    var result = [];
    var data = init_parse_state();
    for (; s.length; s = s.substring(chunklen), chunk = s.substring(0, chunklen)) {
        parse_chunk(chunk, result, data);
        data.lastChar = last(chunk);
    }
    return result.join('');
}

exports.init_parse_state = init_parse_state;
exports.parse_chunk = parse_chunk;
