var path = require('path');
var fs = require('fs');
var semver = require('semver');


var API = require('./api').API;
var {Bridge} = require('./bridge');
const {log} = require('./logger');

'use strict';

/**
 * @class Server
 * @classdesc ioriver main program started from cli
 * @version 0.2.0 
 * 
 */
class Server{

   
    /**
     * @constructor 
     * @param {object} options optional associative array 
     * @see setupPaths 
     */
    constructor(options={}){
        /** keep us running until shutdown */
        this.shutdown = false;
        /** keep us from running more than one update at a time */
        this.syncing = false;
        /** used to check we are still running */
        this.timestamp = Date.now();
        /** api and event emitter to pass to plugins */
        this._api = new API(); 
        this._api.on('registerPlatform', (platform)=>{
            this._api.registerPlatform(platform);
        });
        this._api.on('updateDevice', (device)=>{
            this._api.updateDevice(device);
        });
        this._api.on('registerDevice', (device)=>{
            this._api.registerDevice(device);
        });
        
        this.setupPaths(options);
        this.loadConfig().then(config=>{
            this._config = config;
            log.debug("Using config=");
            log.debug(this._config);

            this.checkAtStartup();
            this.startHeartbeat();
            this.init();
        });
        
    }

    /**
     * Start heartbeat that updates the pidfile and prevent multiple instances with the same serial
     */
    startHeartbeat() {
        var pidfile = this.pidfile;
        this.heartbeat = setInterval(function(){
            log.debug(`   updateFidFile ${pidfile}`);
            if(pidfile && pidfile!=='')
                fs.writeFileSync(pidfile, process.pid); 
        },3000);
    }

    /**
     * make sure only one instance with the same serial is running at the same time
     */
    checkAtStartup() {
        var pidfile = `/run/ioriver_`+this._config.bridge.sn_x100000+`.pid`;
        this.pidfile = pidfile;
        log.debug(`this.pidfile=${pidfile}`);
            
        if (fs.existsSync(pidfile)) {
            var stat = fs.statSync(pidfile);
            var modTime = stat.mtimeMs + 30000; //not older than 30 seconds
            log.debug(`Tests if modTime(${modTime}) > now(${Date.now()})`);
            if(modTime > Date.now()) {
                log.error('An instance of ioriver is running. Exiting.');
                 process.exit(1);
            }
        }
    }

    /**
     * setup basic paths for config and plugins
     * @param {object} options associative array with 
     * {string} customPath - path to config.json file (command line: ioriver -U path)
     */
    setupPaths(options) {
        /** Used for where to find config.json */
        this.storagePath = options.customPath || '~/.ioriver/';

        this.pluginPaths = [];
        this.pluginPaths = this.pluginPaths.concat(require.main.paths);
        this.pluginPaths.push(path.resolve(process.cwd(), './plugins/'));
        this.pluginPaths.push('/usr/local/lib/node_modules');
        this.pluginPaths.push('/usr/lib/node_modules'); 
        const exec = require('child_process').execSync;
        this.pluginPaths.push(exec('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8'));
    }

    /**
     * async constructor
     */
    async init(){

        //register base serialnumber to bind our devices
        if(this._config.bridge.sn_x100000)
            this._api.baseSn = this._config.bridge.sn_x100000*100000;

        /** npm package information storage for use of plugins to verify version*/
        this.package = {};
        this.package = await this._api.loadPackage(this.storagePath);
        
        //do setup
        await this.loadPlatforms();
        this.bridge = await new Bridge(this._config.bridge, this._api);
        
    }

    
    /**
     * loads config.json and return it
     */
    async loadConfig() {

        var configFile = `${this.storagePath}/config.json`;

        //default config
        var config = {
            "bridge":{
                "name":"ioriver",
                "ip":"10.0.48.94",
                "username":"config",
                "password": "ef56",
                "port":"443",
                "path":"",
                "sn_x100000": 4212
            }
        };

        if(!fs.existsSync(configFile)) {
            log.warn(`config.json (${configFile}) not found! Using defaults.`);
            return config;
        }

        //loading config
        try{
            config = JSON.parse(fs.readFileSync(configFile));
        }catch(e){
            log.error("There was a problem reading your config.json file.");
            log.error("Please try pasting your config.json file here to validate it: http://jsonlint.com");
            log.error("");
            throw e;
        }

        //todo: check config sn

        return config;
    }

    async run() {
        log.debug(`Server.run()`);

        while(!this.shutdown) {

            //if bridge is connected start updating it
            if(this.bridge && this.bridge.connected && !this.syncing) {
                this.timestamp = Date.now();
                this.syncing = true;
                log.debug(`*** Starting sync`);
                

                // get current state from bridge
                var state = await this.bridge.getState();

                //get all platforms to update the api device list 
                await this._api.runPlatforms();

                //check and update state
                await this.updateManager(state);

                //execute actions towards imse
                await this.bridge.run();

                this.syncing = false;
                log.debug(`*** Ending sync`);
            }

            await this.sleep(500);
        }

        //Shuting down

        await clearInterval(this.heartbeat); //stoping heartbeat
        if(fs.existsSync(this.pidfile))
            fs.unlink(this.pidfile,err=>{//remove pid file
                if(err) log.error(`Unable to remove pid file (${this.pidfile}) error=${err}`);
            });

        //exit

    }

    async updateManager(state) {
        log.debug(`  updateManager(state) with state=`);
        log.debug(state);
        //update registeredDevices
        for(var serial in state){
            if(this._api.isRegisteredDevice(serial)){
                var device = this._api.getDevice(serial);
                if(device) {
                    log.debug(`Device before update:`);
                    log.debug(device);
                    device.updateState(state[serial]);
                    log.debug(`Server: bridge update device state ${device.getName()}`);
                    this._api.updateDevice(device);
                } else {
                    log.warn(`Serial ${serial} is not a device`);
                    log.debug(device);
                }
            } else {
                log.warn(`  Found iounit ${state[serial].name} (i=${state[serial].id}, serial=${serial}) but no registered device`);
                log.warn(this._api.registeredDevices);
            }
        } 
    }


    /**
     * custom sleep function
     * @param {number} ms milliseconds to sleep, 1000 ms = 1 sec
     */
    sleep(ms){
        return new Promise(resolve=>{
            setTimeout(resolve,ms)
        })
    }

    async loadPlatforms() {
        if(!this._config.platforms) {
            log.error("No platforms defined...");
            return
        }

        log.info("Loading " + await this._config.platforms.length + " platform(s)...");



        // check for platforms
        for(var i = 0; i < this._config.platforms.length; i++){
            let platform = this._config.platforms[i].platform;
            let name = this._config.platforms[i].name;

            log.info("Loading plugin'" + platform + "' as platform '" + name + "'");

            // check if path exists
            var plugin_path = null;
            for(var p=0;p< this.pluginPaths.length;p++){
                if(this.pluginPaths[p].substr(-1)!=="/") {
                    this.pluginPaths[p]+="/";
                }
                if (!fs.existsSync(this.pluginPaths[p]))
                    continue;
                if(fs.existsSync(this.pluginPaths[p] + platform + path.sep)) {
                    plugin_path = this.pluginPaths[p] + platform + path.sep;
                    log.debug("Found path="+this.pluginPaths[p] + platform + path.sep);

                }
                log.debug("Path: "+this.pluginPaths[p] + platform + path.sep+" tested");

            }

            if(!plugin_path) {
                log.warn(`Plugin for platform '${platform}' not found using path ${process.cwd()}! Skipping...`);
            } else {
                //load package.json
                let pjson = await this._api.loadPackage(plugin_path);
                log.debug(pjson);
                if(!pjson) {
                    log.warn(`Unable to find package.json for platform '${platform}'! Skipping...`);
                } else {
                    if(!pjson.engines || !pjson.engines.ioriver) {
                        log.debug(pjson);
                        throw new Error("Plugin " + platform + " does not contain the 'ioriver' package in 'engines'.");
                    }

                    var versionRequired = await pjson.engines.ioriver;

                    if (!semver.satisfies(this._api.serverVersion, versionRequired)) {
                        throw new Error("Plugin " + platform + " requires an Ioriver version of " + versionRequired + " which does not satisfy the current UltraBridge version of " + this._api.serverVersion + ". You may need to upgrade your installation of UltraBridge.");
                    }

                    // make sure the version is satisfied by the currently running version of Node
                    if (pjson.engines.node && !semver.satisfies(process.version, pjson.engines.node)) {
                        log.warn("Plugin " + plattform + " requires Node version of " + pjson.engines.node + " which does not satisfy the current Node version of " + process.version + ". You may need to upgrade your installation of Node.");
                    }

                    //todo: check kewords and prefix

                    // figure out the main module - index.js unless otherwise specified
                    var main = pjson.main || "./index.js";

                    var mainPath = path.relative(__dirname, path.join(plugin_path,main));
                    log.debug("Loadingpath for " + platform + " = "+ mainPath);

                    if(!this._api.platforms[name]) {
                        try{
                            this._api.platforms[name] = require(mainPath);
                            log.debug(`Platform '${platform}' loaded as '${name}'.`);
                        } catch(e) {
                            log.error(`Unable to load "${platform}", continue with next platform!`);
                            log.debug("path=" + mainPath);
                            log.error(e);
                            log.error("");
                            continue;
                        }

                        //if we dont have an identifier we make one
                        if(!this._config.platforms[i].sn_x1000){
                            this._config.platforms[i].identifier = i;
                        }

                        //setup platform
                        this._api.platforms[name].init(this._config.platforms[i], this._api, log);
                    } 
                    else {
                        log.warn("Duplicate platform name '" + name + "'! skipping " + platform + " with name " + name + "!");
                    }

                    
                }
            }
        }

        if(this.platforms === {}) {
            log.warn(`No platforms found!!!`);
        }

    }

    async stop(){
        this.shutdown = true;
        
        log.info('Shutting down ioriver server');

    }
}

module.exports = {
    Server: Server, log:log
}