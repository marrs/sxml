export function last(arr) {
    return arr[arr.length -1];
}

export function count_newlines(str) {
    return (str.match(/\n/g) || []).length;
}
