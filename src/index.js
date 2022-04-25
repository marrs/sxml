var fs = require('fs');
var StringDecoder = require('string_decoder').StringDecoder;
var Buffer = require('buffer').Buffer;
var parser = require('./parser');

var idxFilename = (/node$/.test(process.argv[0]))? 2 : 1;
var filename = process.argv[idxFilename];
if (!filename) {
    console.error("Please provide and SXML file");
    process.exit();
}

var readStream = fs.createReadStream(filename);

var parseState, decoder;

readStream.on('open', function() {
    parseState = parser.init_parse_state();
    decoder = new StringDecoder('utf8');
    console.error("FILE OPENED");
});

readStream.on('data', function(chunk) {
    var result = [];
    parse_chunk(decoder.write(chunk), result, parseState)
    process.stdout.write(Buffer.from(result.join('')));
});
