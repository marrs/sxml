function reduce_attr(acc, arr) {
    var ws = (arr[0] || ' ');
    if (arr[2]) {
        return acc + ws + arr[1] + '=' + arr[2];
    } else if (arr[1]) {
        return acc + ws + arr[1];
    }
    return acc + (arr[0] || '');
}

export function html(event, data) {
    // Preserve whitespace for self-closing tags.
    switch (event) {
        case 'close-tag:no-children':
            var attr = data.slice(2);
            var closingWs = attr.length && !attr[0][0]? ' ' : '';

            return data[0] +
                '<' +
                data[1] +
                attr.reduce(reduce_attr, '') +
                closingWs +
                '/>';

        case 'open-tag':
            return data[0] +
                '<' +
                data[1] +
                data.slice(2).reduce(reduce_attr, '') +
                '>';
        case 'begin-escape-bracket':
            return '(';
        case 'close-tag':
            return ["</", ">"].join(data[1]);
    }
}
