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
    if (name.length === 0) return false;
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

    while (buf.cursor < buf.str.length) {
        // Code:
        //   (#  : Opening an s-exp for a tag
        //   (# ?: Discover what comes after tag operator
        //   (@ ?: Discover what comes after attr operator
        //   (@  : Opening an s-exp for an attribute
        //   (@ ": Parsing an attribute value wrapped in double quotes
        //   (@ ': Parsing an attribute value wrapped in single quotes
        //   (@ _: Parsing an attribute value not wrapped in quotes
        //   ((  : Parsing a text node wrapped in brackets (not an s-exp)
        //   <>  : Finish opening tag
        switch (data.processing) {
            case '(#': {
                var op = buf.eventually_read_operator();
                if (false === op) {
                    result[result.length] = buf.read_to_end()
                    continue;
                }
                result[result.length] = op;
                data.tagStack[data.tagStack.length -1] += last(result);
                data.processing = '(# ?';
            } break;
            case '(# ?': {
                var wsBuf = buf.read_whitespace();
                if (buf.is_next_char(')')) {
                    buf.advance(1);
                    // Preserve whitespace for self-closing tags.
                    result[result.length] = (wsBuf || ' ') + '/>';
                    var currentTag = data.tagStack.pop();
                    data.processing = false;
                } else if (buf.is_next_char('(')) {
                    var opStatus = buf.process_opening_bracket();
                    switch (opStatus.pop()) {
                        case 'attr': {
                            if (!/[\s]$/.test(last(result)) && !wsBuf) {

                                wsBuf = ' ';
                            }
                            result[result.length] = wsBuf;
                            wsBuf = '';
                            data.tagStack.push('@');
                            data.processing = '(@';
                        } break;
                        case 'tag': {
                            result[result.length] = '>' + wsBuf || ' ';
                            data.processing = '(#';
                        } break;
                        case 'bracket': {
                            // TODO:
                        } break;
                    }
                } else {
                    if (buf.substr) {
                        result[result.length] = '>';
                        data.processing = false;
                    }
                    result[result.length] = wsBuf;
                }
            } break;
            case '(@': {
                var op = buf.eventually_read_operator();
                if (false === op) {
                    result[result.length] = buf.read_to_end();
                    continue;
                }
                result[result.length -1] += op;
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
                    var firstCharOfValue = buf.substr.charAt(0);
                    if (is_char_quote_mark(firstCharOfValue)) {
                        result[result.length] = '=';
                        result[result.length] = firstCharOfValue;
                        buf.advance(1);
                        data.processing = '(@ ' + firstCharOfValue;
                    } else if (firstCharOfValue === ')') {
                        data.tagStack.pop();
                        buf.advance(1);
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
                var idxClosingQuote = index_of_closing_quote(buf.substr, last(data.processing));
                if (idxClosingQuote > -1) {
                    result[result.length] = buf.read_to(idxClosingQuote +1);
                    data.processing = '(@ ?';
                } else {
                    result[result.length] = buf.read_to_end();
                }
            } break;
            case '(@ _': {
                var idxClosingBracket = buf.substr.indexOf(')');
                if (idxClosingBracket > -1) {
                    result[result.length] =
                        buf.read_to(idxClosingBracket).replace('\\"', '&#34;');
                    result[result.length] = '"';
                    data.processing = '(@ ?';
                } else {
                    result[result.length] =
                        buf.read_to_end().replace('\\"', '&#34;');
                }
                continue;
            } break;

            case '((': {
                break;
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

                if (definitely_comes_before(idxClosingBracket, idxOpeningBracket)) {
                    result[result.length] = buf.read_to(idxClosingBracket);
                    if (data.tagStack.length) {
                        var tag = data.tagStack.pop();
                        buf.advance(1);
                        if (util.identify_operator(tag) == 'tag') {
                            result[result.length] = ["</", tag, ">"].join('');
                        }
                    }
                    idxOpeningBracket = buf.substr.indexOf('(');
                }

                if (idxOpeningBracket > -1) {
                    result[result.length] = buf.read_to(idxOpeningBracket);
                    var opStatus = buf.process_opening_bracket();
                    switch (opStatus.pop()) {
                        case 'tag': {
                            result[result.length] = '<';
                            data.tagStack.push('');
                            data.processing = '(#';
                        } break;
                        case 'attr': {
                            switch (opStatus.pop()) {
                                case 'empty':
                                case 'bad': {
                                    data.processing = false;
                                } break;
                                default: {
                                    data.tagStack.push('@');
                                    data.processing = '(@';
                                    result[result.length] = ' ';
                                }
                            }
                        } break;
                        case 'bracket': {
                            data.tagStack.push('(');
                            data.processing = '((';
                        } break;
                        default: {
                            result[result.length] = '(';
                            data.processing = false;
                        }
                    }
                    continue;
                } else {
                    result[result.length] = buf.read_to_end();
                    break;
                }
            }
        }
        continue;
    }
}

function init_parse_state() {
    return {line: 1, tagStack: [], processing: false};
}

exports.parse = function (s) {
    var lines = s.split('\n');
    var chunklen = 10;
    var chunk = s.substring(0, chunklen);
    var result = [];
    var data = init_parse_state();
    for (; s.length; s = s.substring(chunklen), chunk = s.substring(0, chunklen)) {
        parse_chunk(chunk, result, data);
    }
    return result.join('');
}

exports.init_parse_state = init_parse_state;
