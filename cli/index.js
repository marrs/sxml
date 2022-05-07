#!/usr/bin/env node
var fs = require('fs');
var StringDecoder = require('string_decoder').StringDecoder;
var Buffer = require('buffer').Buffer;
var parser = require('../src/parser');

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
});

readStream.on('data', function(chunk) {
    var result = [];
    parser.parse_chunk(decoder.write(chunk), result, parseState)
    parseState.lastChar = chunk[chunk.length -1];
    process.stdout.write(Buffer.from(result.join('')));
});
