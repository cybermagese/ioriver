'use strict';

const {log,transports} = require('./logger');
var fs = require('fs');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var serverVersion = require("./version");
const {Device} = require(`./device`);




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
        if(path.substr(-1) !== "/") {
            path+="/";
        }
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
            log.info(`API: register platform ${platform.baseSn}`);
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
            log.info(`Register Device in updateDevice(${device.name()})`);
            this.registeredDevices.push(serial);
        }
    }

    hasRegisterdPlatforms() {
        return this.registerdPlatforms.length>0;
    }


    async registerDevice(proto){
        log.debug(proto);
        log.debug(`  device serial = ${proto.Sn}`);
        var device = new Device(proto);
        var serial = device.getSn();
        if(!serial || !device.getName()) {
            log.warn(`  Unable to register device! Required fields are missing!`);
            log.warn(`Device=`);
            log.warn(device.config);
            log.warn(``);
        } else {
            log.debug(`Registering device ${device.getName()} ${serial}`);
            log.debug(device.getConfig());
            if(this.devices[serial]) {
                log.debug(`Merging with existing device:`);
                log.debug(this.devices[serial]);
                
                if(device.hasBattery()){
                    this.devices[serial].config.battery = device.getBattery();
                }

                if(device.isDevice()) {
                    if(!this.devices[serial].isDevice()) {
                        this.devices[serial].config.isDevice=true;    
                    }
                    this.devices[serial].config.methods=device.getMethods();
                    this.devices[serial].config.state=device.getState();
                    this.devices[serial].config.value=device.getValue();    
                }

                if(device.isSensor()) {
                    if(!this.devices[serial].isSensor()) {
                        this.devices[serial].config.isSensor=true; 
                    }
                    this.devices[serial].config.inputs=device.getInputs(); 
                }
                
                this.devices[serial].updateTime();

                log.debug(`After merge:`);
                log.debug(this.devices[serial]);
            } else {
                this.devices[device.getSn()] = device;
            }
            if(!this.registeredDevices.includes(serial)) {
                log.info(`Register device ${proto.name}`);
                this.registeredDevices.push(serial);
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
        log.debug('API: Running platforms');
        if(this.registerdPlatforms.length === 0) {
            log.debug('API: No registerd platforms to run.');
        }
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

    /**
     * custom sleep function
     * @param {number} ms milliseconds to sleep, 1000 ms = 1 sec
     */
    sleep(ms){
        return new Promise(resolve=>{
            setTimeout(resolve,ms);
        });
    }
}

inherits(API, EventEmitter);

module.exports = {
    API:API
  };
  