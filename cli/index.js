#!/usr/bin/env node
import fs from 'fs'
import { StringDecoder } from 'string_decoder'
import { Buffer } from 'buffer';
import { init_parse_state, parse_chunk } from '../src/parser'

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
    parseState.lastChunk = chunk;
    process.stdout.write(Buffer.from(result.join('')));
});
