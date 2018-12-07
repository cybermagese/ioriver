'use strict';


class Device {

    constructor (config, platform_api) {
        this.api = platform_api;
        
        if(!config.Sn) {
            this.api.log.error(`A device must have a serial number!`);           
        }
        this.config = config;

    }

    getSn() {
        return this.config.Sn;
    }

    getName() {
        return this.config.name;
    }

    getMethods() {
        return this.config.methods
    }

    getConfig() {
        return this.config;
    }

}