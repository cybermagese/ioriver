var util = require('util');
var path = require('path');
var fs = require('fs');
var semver = require('semver');

var API = require('./api').API;
const {logger,log} = require('./logger');

'use strict';

/**
 * @name Server
 * @classdesc Ioriver main program started from cli
 * @version 0.1.3 
 */
class Server{

    constructor(options={}){
        this._api = new API(); // api for plugin plattforms
        this.storagePath = options.customPath || '~/.ioriver/';
        
        this.pluginPaths = [];
        this.pluginPaths = this.pluginPaths.concat(require.main.paths);
        this.pluginPaths.push(path.resolve(process.cwd(), './plugins/'));
        this.pluginPaths.push('/usr/local/lib/node_modules');
        this.pluginPaths.push('/usr/lib/node_modules'); 
        const exec = require('child_process').execSync;
        this.pluginPaths.push(exec('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8'));
        //todo: add env paths paths (and maybe windows)

        this.loadConfig().then(config=>{
            this._config = config;
            log.debug("Using config=");
            log.debug(this._config);
            
            this.init();
        });
        
    }


    async init(){


        //register events and actions on them 


        this.package = {};
        
        //laod package information
        this.package = await this._api.loadPackage();
        
        //do setup
        var pres = await this.loadPlatforms();
            
            
        
    
        
    }

    

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
                "path":""
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

        return config;
    }

    async run() {

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
                        } catch(e) {
                            log.error("Unable to load " + platform + ", skipping ...");
                            log.debug("path=" + mainPath);
                            log.error(e);
                            log.error("");
                            continue;
                        }
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

    async shutdown(){
        log.info('Shuttingdown Ioriver server')
    }
}

module.exports = {
    Server: Server, log:log
}