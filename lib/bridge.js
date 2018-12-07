var UltraApi = require(`imse-ultra-api`).Api;

const {log} = require('./logger');

'use strict';


class Bridge {
    constructor (bridgeconfig, ioriver_api) {
        this.config = bridgeconfig;
        this._api = ioriver_api;

        log.debug(`Bridge created with config =`);
        log.debug(this.config);
        log.debug('');

        //todo: check api version

        this.init();

    }

    async init() {
        this.api = await new UltraApi(this.config);

        //get system information
        var sys = await this.api.systemInfo();

        if(!sys) {
            log.error(`Unable to get system information from https://${this.config.host + (this.config.port!=="443" ? ":" + this.config.port : "") + (this.config.path!=="" ? "/" + this.config.path : "")}.`);
        }
    }

    async run() {

        //get all iounits of Type=5 with DecSN as the index in _api.devices
 

        
    }

}