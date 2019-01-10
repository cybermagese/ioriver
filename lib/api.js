const {log,transports} = require('./logger');
var fs = require('fs');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var serverVersion = require("./version");
const {Device} = require(`./device`);

'use strict';


class API{
    constructor(baseSn) {
        this.platforms = {};
        this.registerdPlatforms = []; // {base serial : instance}
        this.devices = {}; // {serial : instance}
        this.registeredDevices = []; //[serial1, serial2 ...]
        this.i = 'api';
        this.baseSn = 121200000; //assigned in Server.init() otherwise this default
        
        // expose the ioriver API version
        this.version = "0.2.0";

        // expose the ioriver server version
        this.serverVersion = serverVersion;

    }

    /**
     * Loads npm package.json files
     * @param {string} path path to file
     */
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

    async registerPlatform(platform) {
        if(!platform.baseSn) {
            log.error(`Trying to register platform without base serial number`);
        } else {
            this.registerdPlatforms[platform.baseSn] = platform;
        }

    }

    isRegisteredPlatform(serial) {
        if(typeof serial === 'string') serial = parseInt(serial);
        return this.registerdPlatforms.includes(serial);
    }

    async updateDevice(device) {
        log.debug(`updateDevice(${device.getName()})`);
        var serial = device.getSn();
        this.devices[serial]=device;
        if(!this.isRegisteredDevice(serial)) {
            log.info(`Register Device in updateDevice(${proto.name})`);
            this.registeredDevices.push(serial);
        }
    }


    async registerDevice(proto){
        log.debug(proto);
        log.debug(`  device serial = ${proto.Sn}`);
        var device = new Device(proto);
        if(!device.getSn() || !device.getName()) {
            log.warn(`  Unable to register device! Required fields are missing!`);
            log.warn(`Device=`);
            log.warn(device.config);
            log.warn(``);
        } else {
            log.debug(`Registering device ${device.getName()} ${device.getSn()}`);
            log.debug(device.getConfig());
            this.devices[device.getSn()] = device;
            if(!this.registeredDevices.includes(device.getSn())) {
                log.info(`Register device ${proto.name}`);
                this.registeredDevices.push(device.getSn());
            } else {
                log.debug(`Api: Plugin update of device (${proto.name}).`);
            }
            
        }
    }

    getDevice(serial) {
        if(typeof serial === 'string') serial = parseInt(serial);
        if(!this.devices[serial]) return false;
        return this.devices[serial];
    }
    
    getRegisteredDevices() {
        return this.registeredDevices;
    }

    isRegisteredDevice(serial) {
        if(typeof serial === 'string') serial = parseInt(serial);
        return this.registeredDevices.includes(serial);
    }

    async runPlatforms() {
        log.debug('    Running platforms')
        for(var serial in this.registerdPlatforms) {
            if(this.registerdPlatforms[serial]) {
                //todo: update platform devices
                await this.registerdPlatforms[serial].run(this);
            }
        }
    }


    async getDevicePlatform(deviceSn) {
        log.debug(`getDevicePlatform(${deviceSn}) ${Math.floor(deviceSn/1000)*1000}`);
        var platformId = Math.floor(deviceSn/1000) * 1000;
        if(!this.registerdPlatforms[platformId]) return false;
        return this.registerdPlatforms[platformId];
    }
}

inherits(API, EventEmitter);

module.exports = {
    API:API
  }
  