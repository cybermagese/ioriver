const {logger,log} = require('./logger');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');

var serverVersion = require("./version");

'use strict';


class API{
    constructor() {
        this.platforms = {};
        this.registerdPlatforms = [];
        this.accessories = {};
        
        // expose the ioriver API version
        this.version = 0.1;

        // expose the ioriver server version
        this.serverVersion = serverVersion;
    }

    async loadPackage(path="./") {
        try{
            log.debug("Loading package path="+path + 'package.json');
            return JSON.parse(fs.readFileSync(path + 'package.json', 'utf8'));
        }catch(e){
            log.warn("There was a problem reading " + path + "package.json.");
            log.warn("Please try pasting your file here to validate it: http://jsonlint.com");
            log.warn("");
            return false;
        }

    }
}


module.exports = {
    API:API
  }
  