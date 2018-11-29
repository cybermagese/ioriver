const {logger,log} = require('./logger');


class Plattform {
    constructor(config, api){
        this.config = config;
        this.api = api;
        this.setup().then(()=>{
            api.registerPlatform(this);
        });
    }

    async setup() {

    }

    async run() {

    }

    async shutdown() {

    }
}