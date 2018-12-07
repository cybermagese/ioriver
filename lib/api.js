const {logger,log} = require('./logger');
var fs = require('fs');

var serverVersion = require("./version");
const Device = require(`./device`);

'use strict';


class API{
    constructor(baseSn) {
        this.platforms = {};
        this.registerdPlatforms = [];
        this.devices = {};
        this.registerdDevices = [];

        this.baseSn = 421200000; //assigned in Server.init() otherwise choose this default
        
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

    async registerDevice(proto, platform_api){
        var device = new Device(proto,platform_api);
        if(!device.getSn() || !device.name) {
            log.warn(`Unable to register device! Required fields are missing!`);
            log.warn(`Device=`);
            log.warn(device);
            log.warn(``);
        } else {
            log.debug(`Registering device ${device.Sn}=`);
            log.debug(device.getConfig());
            this.devices[device.getSn()] = device;
            this.registerdDevices.push(device.getSn());
        }

        //todo: run setup on imse
    }

    async getRegisterdDevices() {
        var result = {};
        var rd = this.registerdDevices;
        for(var i=0; i < rd.length; i++) {
            if(this.devices[rd[i]]) result[rd[i]] = this.devices[rd[i]];
        }

        return result;
    }
}


module.exports = {
    API:API
  }
  