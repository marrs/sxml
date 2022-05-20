import { Buffer_Trait, Sexp_Buffer_Trait } from './buffer.js'
import { last } from './util.js';
import { html } from './processors/index.js';

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

export function log_parse_error(data) {
    console.info("TODO: LOG TO STDERR -", data.msg, "- line:", data.lineNumber, "token:", data.token);
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

export function init_parse_state() {
    var data = {
        defaultProcessor: 'html',
        lineCount: 0,
        lexicalStack: {
            frames: [],
            push: function(x) {
                return this.frames.push(x);
            },
            current_frame: function() {
                return last(this.frames);
            },
            processor: function() {
                if (!this.frames.length) {
                    return data.defaultProcessor || null;
                }
                return this.current_frame().processor;
            },
            pop: function(isTagChildless) {
                var event = isTagChildless? 'close-tag:no-children' : 'close-tag';
                var poppedFrame = this.frames.pop();
                var currentFrame = this.current_frame();
                var poppedFrameData = poppedFrame.data;
                switch (identify_operator(poppedFrame.operator)) {
                    case 'tag':
                        poppedFrame.processedData = data.processors[this.processor()](event, poppedFrameData);
                    break;
                    case 'attr':
                        if (currentFrame) {
                            switch (identify_operator(currentFrame.operator)) {
                            case 'tag':
                                currentFrame.data.push(poppedFrameData);
                            break;
                            case 'attr':
                                currentFrame.data.push(poppedFrameData);
                            break;
                            default:
                                console.error("Could not merge attributes. Stack frame did not represent attribute or tag.");
                            }
                        }
                    break;
                    default:
                    break;
                }
                return poppedFrame;
            }
        },
        processors: {
            html: html
        },
        state: null,
        wsBuf: '',
        lastChunk: ''
    };
    data.barf_ws = function() {
        var buf = this.wsBuf;
        this.wsBuf = '';
        return buf;
    }
    return data;
}

// The AST for lexical stack frame data is represented like so:
// [ LEADING_WHITESPACE, TAG [ [LEADING_WHITESPACE, ATTR_NAME, ATTR_VALUE], ...]]

export function parse_chunk(strChunk, result, data) {
    var lineLength = strChunk.length;

    var defaultProcessor = data.defaultProcessor;
    var buf = Object.create(Sexp_Buffer_Trait);
    Object.assign(buf, {
        cursor: 0,
        lineCount: data.lineCount,
        str: strChunk,
        token: '',
        substr: strChunk,
    });

    var $1, $2, $3;

    // TODO Establish the performance hit of using const in this position?
    const AST_IDX_WS = 0;
    const AST_IDX_TAG = 1;
    const AST_IDX_NAME = 1;
    const AST_IDX_VAL = 2;
    const AST_IDX_AT1 = 2;

    var count = 0;
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
        switch (data.state) {
            case '#?': {
                if ('(' === buf.substr[0]) {
                    data.state = '#(';
                } else {
                    result[result.length] = '#';
                    data.state = null;
                }
                buf.step();
            } break;
            case '#(': {
                result[result.length] = buf.read_to(')')
                if (!buf.substr) {
                    return;
                } else {
                    buf.step();
                    data.state = ')#?';
                }
            } break;
            case ')#?': {
                if ('#' === buf.substr[0]) {
                    buf.step();
                    data.state = null;
                } else {
                    result[result.length] = ')';
                    data.state = '#(';
                }
            } break;
            case '(?': {
                if (!buf.substr) { return; }
                $1 = identify_operator(buf.substr);
                switch ($1) {
                    case 'tag':
                        data.lexicalStack.push({
                            processor: null, // Unknown
                            operator: '',
                            data: [''] // 1st element contains whitespace
                        });
                        data.state = '(#';
                    break;
                    case 'attr':
                        buf.step();
                        data.state = '(@1';
                    break;
                    case 'bracket':
                        data.lexicalStack.push({
                            processor: defaultProcessor,
                            operator: '('
                        });
                        result[result.length] = '(';
                        buf.step();
                        data.state = null;
                    break;
                    case 'specialchar':
                        data.lexicalStack.push({
                            processor: defaultProcessor,
                            operator: '&',
                            data: ['']
                        });
                        data.state = '(&';
                        buf.step();
                    break;
                    default:
                        result[result.length] = '(';
                        data.state = null;
                        // XXX Why don't we advance here?
                        // We must be advancing somewhere else?
                        // Is that ok?
                }
            } break;
            case '(#': {
                $1 = data.lexicalStack.current_frame();
                $1.operator += buf.read_token();
                if (!buf.substr) { return; }
                if ($1.operator.indexOf(':') < 0) {
                    $1.processor = defaultProcessor;
                    $1.data[AST_IDX_TAG] = $1.operator;
                    $1.data[AST_IDX_AT1] = [];
                }
                data.state = '(# ?';
            } break;
            case '(# (': {
                switch (identify_operator(buf.substr)) {
                    case 'attr':
                        data.lexicalStack.push({
                            processor: defaultProcessor,
                            operator: '@',
                            data: [data.barf_ws()]
                        });
                        $1 = data.lexicalStack.current_frame().data;
                        buf.step();
                        data.state = '(@1';
                    break;
                    case 'tag':
                        result[result.length] =
                            data.processors[data.lexicalStack.processor()](
                                'open-tag',
                                data.lexicalStack.current_frame().data
                            );
                        data.lexicalStack.push({
                            processor: null,
                            operator: '',
                            data: ['']
                        });
                        data.lexicalStack.current_frame().data[AST_IDX_WS] = (
                            is_found(data.wsBuf, '\n')? data.barf_ws() : data.barf_ws().substring(1)
                        )
                        data.state = '(#';
                    break;
                    case 'bracket':
                        result[result.length] =
                            data.processors[data.lexicalStack.processor()](
                                'open-tag',
                                data.lexicalStack.current_frame().data
                            );
                        data.lexicalStack.push({
                            processor: defaultProcessor,
                            operator: '('
                        });
                        result[result.length] =
                            data.processors[data.lexicalStack.processor()](
                                'begin-escape-bracket',
                                null
                            );
                        buf.step();
                        data.wsBuf = '';
                        data.state = null;
                    break;
                    case 'specialchar':
                    case 'none':
                        result[result.length] =
                            data.processors[data.lexicalStack.processor()](
                                'open-tag',
                                data.lexicalStack.current_frame().data
                            );
                        data.state = null;
                        buf.step();
                    break;
                    default: {
                        console.error(["ERR: ", identify_operator(buf.substr), "did not match a pattern"].join(' '));
                    }
                }
            } break;
            case '(# ?': {
                data.wsBuf += buf.read_whitespace();
                $1 = data.lexicalStack.current_frame().data
                if (!buf.substr) { return; }
                if (buf.substr[0] === ')') {
                    buf.step();
                    $1[AST_IDX_AT1] = [data.barf_ws()];
                    $2 = data.lexicalStack.pop(true);
                    result[result.length] = $2.processedData;
                    data.state = null;
                } else if (buf.substr[0] === '(') {
                    buf.step();
                    data.state = '(# (';
                } else {
                    result[result.length] =
                        data.processors[data.lexicalStack.processor()](
                            'open-tag',
                            $1
                        );
                    // TODO: Work out how to handle this whitespace after opening tag.
                    if (is_found(data.wsBuf, '\n')) {
                        result[result.length] = data.barf_ws();
                    } else {
                        result[result.length] = data.barf_ws().substring(1);
                    }
                    data.state = null;
                }
            } break;
            case '(@1': {
                $1 = buf.substr[0];
                switch ($1) {
                    case ')':
                        buf.step();
                        data.state = null;
                    break;
                    default: {
                        if (/[\s'"]/.test($1)) {
                            data.state = '(@!';
                        } else {
                            buf.step();
                            if (!data.lexicalStack.current_frame()) {
                                data.lexicalStack.push({
                                    processor: defaultProcessor,
                                    operator: '@',
                                    data: []
                                });
                            }
                            data.lexicalStack.current_frame().data[AST_IDX_NAME] = $1;
                            data.state = '(@_';
                        }
                    }
                }
            } break;
            case '(@!': {
                // TODO: Put bad attributes into AST.
                //   Maybe by appending to ws string.
                result[result.length] = buf.read_to(')')
                if (!buf.substr) {
                    return;
                }
                buf.step();
                data.state = null;
            } break;
            case '(@_': {
                $1 = data.lexicalStack.current_frame();
                $2 = $1.data;
                $2[AST_IDX_NAME] += buf.read_token();
                if (!buf.substr) { return; }
                if (!is_valid_attr_name($2[AST_IDX_NAME])) {
                    // XXX Will read funny for super-long attribute names
                    log_parse_error({
                        msg: "Invalid attribute name",
                        lineNumber: data.lineCount,
                        token: last($2)[AST_IDX_NAME]
                    });
                }
                $2[AST_IDX_VAL] = '';
                data.state = '(@ ?';
            } break;
            case '(@ ?': {
                buf.skip_whitespace();
                if (!buf.substr) { return; }
                $1 = buf.substr[0];
                if (is_char_quote_mark($1)) {
                    data.lexicalStack.current_frame().data[AST_IDX_VAL] = $1;
                    buf.step();
                    data.state = '(@ ' + $1;
                } else if (')' === $1) {
                    data.lexicalStack.pop();
                    buf.step();
                    data.state = '(# ?';
                } else {
                    data.lexicalStack.current_frame().data[AST_IDX_VAL] = '"';
                    buf.skip_whitespace();
                    data.state = '(@ _';
                }
            } break;
            case '(@ "':
            case "(@ '": {
                $1 = index_of_closing_quote(buf.substr, last(data.state));
                $2 = data.lexicalStack.current_frame().data;
                if ($1 > -1) {
                    $2[AST_IDX_VAL] += buf.read_to($1 +1);
                    if (!(0 === $1 && '\\' === (last(data.lastChunk)))) {
                        data.state = '(@ ?';
                    }
                } else {
                    $2[AST_IDX_VAL] += buf.read_to_end();
                    return;
                }
            } break;

            case '(@ _': {
                $1 = buf.substr.indexOf(')');
                $2 = data.lexicalStack.current_frame().data;
                if ($1 > -1) {
                    $2[AST_IDX_VAL] += buf.read_to($1).replace('"', '&quot;') + '"';
                    data.state = '(@ ?';
                } else {
                    $2[AST_IDX_VAL] += buf.read_to_end().replace('"', '&quot;');
                    return;
                }
            } break;

            case '(&': {
                $1 = data.lexicalStack.current_frame();
                $1.data[0] += buf.read_token();
                if (!buf.substr) { return }
                if (')' === buf.substr[0]) {
                    $1.data[1] = 1;
                    data.state = '(& )';
                } else {
                    $1.data[1] = '';
                    buf.step();
                    data.state = '(& 1';
                }
            } break;

            case '(& 1': {
                $1 = data.lexicalStack.current_frame();
                $1.data[1] += buf.read_token()
                if (!buf.substr) { return; }
                $1.data[1] = parseInt($1.data[1], 10);
                if (')' === buf.substr[0]) {
                    data.state = '(& )';
                } else {
                    data.state = '(& _';
                }
            } break;

            case '(& _': {
                $1 = buf.substr.indexOf(')');
                if ($1 < 0) { return; }
                buf.reset($1);
                data.state = '(& )';
            } break;

            case '(& )': {
                $1 = data.lexicalStack.current_frame();
                $2 = special_char($1.data[0]);
                for ($3 = 0; $3 < $1.data[1]; ++$3) {
                    result[result.length] = $2;
                }
                buf.step();
                data.lexicalStack.pop();
                data.state = null;
            } break;

            case '))': {
                if (!buf.substr.length) {
                    return;
                }
                if (')' === buf.substr[0]) {
                    buf.step();
                }
                data.state = null;
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
                    if ('html' === data.lexicalStack.processor()) {
                        result[result.length] = convert_html_chars(buf.read_to(idxClosingBracket));
                    }
                    if (data.lexicalStack.frames.length) {
                        if ('(' === data.lexicalStack.current_frame().operator) {
                            if ('html' === data.lexicalStack.processor()) {
                                result[result.length] = ')';
                            }
                            data.lexicalStack.pop();
                            data.state = '))'; // TODO: This is probably an html processor thing
                        } else {
                            $1 = data.lexicalStack.pop()
                            if ('tag' === identify_operator($1.operator)) {
                                result[result.length] = $1.processedData;
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
                        data.state = '#(';
                        continue;
                    }
                    result[result.length] = convert_html_chars(buf.read_to(idxOpeningBracket));
                    buf.step();
                    data.state = '(?';
                    continue;
                } else if (idxHash === buf.str.length -1) {
                    result[result.length] = convert_html_chars(buf.read_to(idxHash));
                    data.state = '#?';
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
