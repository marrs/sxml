var buffer = require('./buffer');
var Buffer_Trait = buffer.Buffer_Trait;
var Sexp_Buffer_Trait = buffer.Sexp_Buffer_Trait;
var util = require('./util');

var last = util.last;

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

function identify_operator(token) {
    if (token.length) {
        var firstChar = token.charAt(0);
        if (/\s/.test(firstChar)) {
            return 'none';
        }
        switch(firstChar) {
            case "@": return 'attr';
            case ")": return 'none';
            case "(": return 'bracket';
            case "&": return 'specialchar';
            default: return  'tag';
        }
    }
    return 'none';
}

function special_char(x) {
    switch(x) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        default: return '&' + x + ';';
    }
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

    var $1, $2;

    while (true) {
        if (!buf.substr) { return; }
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
        //   (&  : Parse special char
        //   (& 1: Parse the first operand of the special char function
        //   (& _: Parse the remaining operands of the special char function
        //   (& ): Resolve the special char function
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
                if (!buf.substr) { return; }
                $1 = identify_operator(buf.substr);
                switch ($1) {
                    case 'tag':
                        result[result.length] = '<';
                        result[result.length] = ''; // Required by next iteration
                        data.tagStack.push('');
                        data.processing = '(#';
                    break;
                    case 'attr':
                        buf.step();
                        data.processing = '(@1';
                    break;
                    case 'bracket':
                        data.tagStack.push('(');
                        result[result.length] = '(';
                        buf.step();
                        data.processing = null;
                    break;
                    case 'specialchar':
                        data.lexicalStack.push(['']);
                        data.processing = '(&';
                        buf.step();
                    break;
                    default:
                        result[result.length] = '(';
                        data.processing = null;
                        // XXX Why don't we advance here?
                        // We must be advancing somewhere else?
                        // Is that ok?
                }
            } break;
            case '(#': {
                $1 = buf.eventually_read_token();
                if (false === $1) {
                    result[result.length -1] += buf.read_to_end()
                    return;
                }
                result[result.length -1] += $1;
                data.tagStack[data.tagStack.length -1] += last(result);
                data.processing = '(# ?';
            } break;
            case '(# (': {
                switch (identify_operator(buf.substr)) {
                    case 'attr':
                        if (!/[\s]$/.test(last(result)) && !data.wsBuf) {

                            data.wsBuf = ' ';
                        }
                        result[result.length] = data.barf_ws();
                        buf.step();
                        data.processing = '(@1';
                    break;
                    case 'tag':
                        data.tagStack.push('');
                        result[result.length] = ['>', '<'].join(
                            is_found(data.wsBuf, '\n')? data.barf_ws() : data.barf_ws().substring(1)
                        )
                        result[result.length] = '';
                        data.processing = '(#';
                    break;
                    case 'bracket':
                        data.tagStack.push('(');
                        result[result.length] = '>(';
                        buf.step();
                        data.wsBuf = '';
                        data.processing = null;
                    break;
                    case 'specialchar':
                    case 'none':
                        data.processing = null;
                        buf.step();
                    break;
                    default: {
                        console.error(["ERR: ", identify_operator(buf.substr), "did not match a pattern"].join(' '));
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
                $1 = buf.substr[0];
                switch ($1) {
                    case ')':
                        buf.step();
                        data.processing = null;
                    break;
                    default: {
                        if (/[\s'"]/.test($1)) {
                            data.processing = '(@!';
                        } else {
                            buf.step();
                            data.tagStack.push('@');
                            result[result.length] = $1;
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
                $1 = buf.eventually_read_token();
                if (false === $1) {
                    result[result.length -1] += buf.read_to_end()
                    return;
                }
                result[result.length -1] += $1;
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
                if (!buf.substr) { return; }
                $1 = buf.substr[0];
                if (is_char_quote_mark($1)) {
                    result[result.length] = '=';
                    result[result.length] = $1;
                    buf.step();
                    data.processing = '(@ ' + $1;
                } else if (')' === $1) {
                    data.tagStack.pop();
                    buf.step();
                    data.processing = '(# ?';
                } else {
                    result[result.length] = '=';
                    result[result.length] = '"';
                    buf.skip_whitespace();
                    data.processing = '(@ _';
                }
            } break;
            case '(@ "':
            case "(@ '": {
                $1 = index_of_closing_quote(buf.substr, last(data.processing));
                if ($1 > -1) {
                    result[result.length] = buf.read_to($1 +1);
                    if (!(0 === $1 && '\\' === data.lastChar)) {
                        data.processing = '(@ ?';
                    }
                } else {
                    result[result.length] = buf.read_to_end();
                    return;
                }
            } break;

            case '(@ _': {
                $1 = buf.substr.indexOf(')');
                if ($1 > -1) {
                    result[result.length] =
                        buf.read_to($1).replace('"', '&quot;');
                    result[result.length] = '"';
                    data.processing = '(@ ?';
                } else {
                    result[result.length] =
                        buf.read_to_end().replace('"', '&quot;');
                    return;
                }
            } break;

            case '(&': {
                $1 = buf.eventually_read_token();
                if (false === $1) {
                    last(data.lexicalStack)[0] += buf.read_to_end()
                    return;
                }
                last(data.lexicalStack)[0] += $1;
                if (!buf.substr.length) {
                    return;
                } else {
                    if (')' === buf.substr[0]) {
                        last(data.lexicalStack)[1] = 1;
                        data.processing = '(& )';
                    } else {
                        last(data.lexicalStack)[1] = '';
                        buf.step();
                        data.processing = '(& 1';
                    }
                }
            } break;

            case '(& 1': {
                $1 = buf.eventually_read_token();
                if (false === $1) {
                    last(data.lexicalStack)[1] += buf.read_to_end()
                    return;
                }
                last(data.lexicalStack)[1] += $1;
                last(data.lexicalStack)[1] = parseInt(last(data.lexicalStack)[1], 10);
                if (')' === buf.substr[0]) {
                    data.processing = '(& )';
                } else {
                    data.processing = '(& _';
                }
            } break;

            case '(& _': {
                $1 = buf.substr.indexOf(')');
                if ($1 < 0) { return; }
                buf.reset($1);
                data.processing = '(& )';
            } break;

            case '(& )': {
                $1 = last(data.lexicalStack);
                $2 = special_char($1[0]);
                for (x = 0; x < $1[1]; ++x) {
                    result[result.length] = $2;
                }
                buf.step();
                data.lexicalStack.pop();
                data.processing = null;
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
                            $1 = data.tagStack.pop();
                            if ('tag' === identify_operator($1)) {
                                result[result.length] = ["</", ">"].join($1);
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
                    return;
                } else {
                    result[result.length] = convert_html_chars(buf.read_to_end());
                    return;
                }
            }
        }
    }
}

exports.parse_chunk = parse_chunk;
