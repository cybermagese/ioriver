const {log,transports} = require('./logger');

'use strict';


class Device {

    constructor (config) {
        /** set if needed and return to false after action */
        this.setOnPlaform = false;
        /** IOUNIT in Ultra with DecSN === this.config.Sn */
        this.parentUnit = {}; 
        /** iochannel type used for mapping device in-/out-puts to plugin data, each plugin should map their types to conform to these */
        this.ConnectionIO2name = {
            //method based
            1: "on/off",
            2: "dimmer",
            3: "toggle",
            //Sensor types
            101: "temp",
            102: "humidity",
            103: "wdir",
            104:"dewp",
            105: "barpress",
            106: "wgust",
            107: "wavg",
            108: "power", 
            109: "energy", 
            110: "current",
            111: "voltage", 
            // system types
            200: "unknown",
            252: "battery",
            254: "mode",
            255: "status"
        }

        this.name2ConnectionIO = {
            //method based
            "on/off": 1,
            "dimmer": 2,
            "toggle": 3,
            //Sensor input types
            "temp": 101,
            "humidity": 102,
            "wdir": 103,
            "dewp": 104,
            "barpress": 105,
            "wgust": 106,
            "wavg": 107,
            "power":108,
            "energy": 109,
            "current": 110,
            "voltage": 111,
            // system types
            "unknown": 200,
            "battery": 252,
            "mode": 254,
            "status":255
        }
        
        
        
        if(!config.Sn) {
            log.error(`A device must have a serial number!`); 
            log.error(config);          
        }
        this.config = config;
        this.timestamp = Date.now();

    }

    getSn() {
        return this.config.Sn;
    }

    getConnectionIObyName(name) {
        if(this.name2ConnectionIO[name]) {
            return this.name2ConnectionIO[name]
        }
        return this.name2ConnectionIO.unknown;
    }

    getNameByConnectionIO(ConnectionIO){
        if(this.ConnectionIO2name[ConnectionIO]) {
            return this.ConnectionIO2name[ConnectionIO];
        }
        return this.ConnectionIO2name[this.ConnectionIO2name.unknown];
    }

    /**
     * @deprecated not used
     */
    getMode() {
        log.debug(this.parentUnit.channels);
        if(this.hasParentUnit() && this.parentUnit.channels) {
            for(var i = 0; i < this.parentUnit.channels.length; i++) {
                if(this.parentUnit.channels[i].order === this.name2ConnectionIO.mode) {
                    return this.parentUnit.channels[i].value;
                }
            }
        }
        return false;
    }

    getName() {
        return this.config.name;
    }

    /**
     * @deprecated not used
     */
    getBattery() {
        return this.config.battery;
    }

    /**
     * @deprecated not used
     */
    getBatteryIOChannelId() {
        return this.parentUnit.byConnectionIO[this.name2ConnectionIO.battery].id;
    }

    /**
     * @deprecated not used
     */
    getIOChannelIdByName(name) {
        log.debug(`Device.getIOChannelIdByName(${name}) with ConnectionIO ${this.getConnectionIObyName(name)}`);
        log.debug(this.parentUnit.byConnectionIO[this.getConnectionIObyName(name)]);
        if(this.parentUnit && this.parentUnit.byConnectionIO && this.parentUnit.byConnectionIO[this.getConnectionIObyName(name)].id) {
            return this.parentUnit.byConnectionIO[this.getConnectionIObyName(name)].id;
        };
        log.warn(`Device.getIOChannelIdByName(name): No such IOChannel ${name}`);
        return false;
    }

    //todo: add needNameUpdate()

    /**
     * @deprecated not used
     */
    needBatteryUpdate() {
        return this.hasBattery() 
        && this.hasParentUnit() 
        && this.parentUnit.byConnectionIO[this.name2ConnectionIO.battery] 
        && typeof this.parentUnit.byConnectionIO[this.name2ConnectionIO.battery].value !== undefined 
        && typeof this.parentUnit.byConnectionIO[this.name2ConnectionIO.battery].value === "number" 
        && this.parentUnit.byConnectionIO[this.name2ConnectionIO.battery].value.toFixed(1) !== this.config.battery.toFixed(1);
    }

    /**
     * @deprecated not used
     */
    need2UpdateInput(name) {
        if(!this.name2ConnectionIO[name]) return false;
        var ConnectionIO = this.name2ConnectionIO[name];
        return this.hasParentUnit() 
        && this.parentUnit.byConnectionIO[ConnectionIO] 
        && this.getInputByName(name) 
        && this.parentUnit.byConnectionIO[ConnectionIO].value !== this.getInputByName(name).value;
    }

    /**
     * @deprecated not used
     */
    getType() {
        return this.config.type;
    }

    getState() {
        return this.config.state;
    }

    getValue() {
        return this.config.value;
    }


    getMethods() {
        return this.config.methods
    }

    getConfig() {
        return this.config;
    }

    getInputs() {
        if(!this.config.inputs) return [];
        return this.config.inputs;
    }



    getInputByName(name) {
        if(this.config.inputs) {
            for(var i=0; i < this.config.inputs.length;i++) {
                if(this.config.inputs[i].name === name) return this.config.inputs[i]; 
            }
        }
        return false;
    }

    /**
     * @deprecated not used
     */
    getParentUnit() {
        if(this.hasParentUnit()) {
            return this.parentUnit;
        } else {
            return false;
        }
    }

    getParentUnitId() {
        if(this.hasParentUnit()) {
            return this.parentUnit.id;
        } else {
            return false;
        }
    }

    getParentUnitName() {
        if(this.hasParentUnit()) {
            return this.parentUnit.name;
        } else {
            return false;
        }
    }

    /**
     * @deprecated not used
     */
    storeParentUnit(id,name=this.config.name) {
        log.debug(`storeParentUnit(${id}, ${name})`);
        this.parentUnit = {
            id: id, //IOUNIT.i
            name: name
        };
    }

    hasParentUnit() {
        return (typeof this.parentUnit.id !== `undefined`);
    }

    /**
     * @deprecated not used
     */
    hasIOChannels() {
        return (typeof this.parentUnit.channels !== 'undefined');
    }

    /**
     * @deprecated not used
     */
    hasBattery() {
        return (typeof this.config.battery !== `undefined`);
    }

    isSensor() {
        return this.config.isSensor;
    }

    isDevice() {
        return this.config.isDevice;
    }

    updateState(state) {
        this.parentUnit = state;
        this.parentUnit.byConnectionIO = {};
        if(this.parentUnit && this.parentUnit.channels) {
            var channels = this.parentUnit.channels;
            for(var i=0; i < channels.length; i++) {
                this.parentUnit.byConnectionIO[channels[i].order]=channels[i];
            }
        }
    }

    updateTime() {
        this.timestamp = Date.now();
    }

}

module.exports = {Device:Device};