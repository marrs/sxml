exports.identify_operator = function(token) {
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
