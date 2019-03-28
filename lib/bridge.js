'use strict';
var UltraApi = require(`imse-ultra-api`).Api;

const {log,transports} = require('./logger');



const CONTROL_MODE = {
    0: {sv:"Observera", en:"Observe"},
    1: {sv:"Styr", en:"Control"}
};

/**
 * 
 */
class Bridge {
    constructor (bridgeconfig, ioriver_api) {
        this.config = bridgeconfig;
        this._api = ioriver_api;
        this.connected = false;
        this.CONTROL_MODE = CONTROL_MODE;
        this.loaded = false;
        
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
        log.debug(`Ultra system=`);
        log.debug(sys);

        if(!sys.data) {
            log.error(`Unable to get system information from https://${this.config.host + (this.config.port!=="443" ? ":" + this.config.port : "") + (this.config.path!=="" ? "/" + this.config.path : "")}.`);
        } else {
            this.connected = true;
        }

    }

    updateNames() {
        return this.config.update_names;
    }

    async getState() {
        log.debug(` getState()`);
        var list = {};
        var basesn = this._api.baseSn;

        var ioUnits = await this.listIOUnits();
        if(ioUnits.ok && ioUnits.authorized && ioUnits.data) {
            var d = ioUnits.data;
            for(var i=0; i < d.length; i++) {
                var serial = d[i].DecSN;
                var id = d[i].i;
                var name = d[i].Name;
                if(serial > basesn && serial < (basesn + 100000)){
                    list[serial] = {id:id, name:name, channels:[]};
                    //get iochannels
                    var ioChannels = await this.api.getIOUnitChannels(id);
                    if(ioChannels.ok && ioChannels.authorized && ioChannels.data) {
                        log.debug(ioChannels.data);
                        var c = ioChannels.data;
                        for(var j=0; j < c.length; j++) {
                            var chId = c[j].i;
                            var chOrder = c[j].ConnectionIO;
                            var chName = c[j].Name;
                            var chDirection = c[j].Direction;
                            var chValue = c[j].Value;
                            if(typeof chValue === 'string') chValue = +(chValue);
                            list[serial].channels.push({id:chId, name:chName, order:chOrder, direction:chDirection, value:chValue});
                        }
                    }
                }
            }
        }
        log.debug(list);
        this.loaded=true;
        return list;
    }


    async run(api=this._api) {
        if(!this.loaded) return;
        this._api = api;
        log.debug(`Bridge: *** Run starts`);


        var registered = this._api.getRegisteredDevices();
        for(var i=0; i < registered.length; i++) {
            var device = this._api.getDevice(registered[i]);

            //update names from plugin if needed
            log.debug(`${device.getName()}(${device.getParentUnitName()}) namecheck ${this.updateNames()} ${device.getName() !== device.getParentUnitName()}`);
            if(this.updateNames() && device.getName() !== device.getParentUnitName() && device.getParentUnitName()) {
                log.info(`Bridge: update IOUNIT ${device.getParentUnitName()} name to ${device.getName()}`);
                var resN = await this.api.renameIOUnit(device.getParentUnitId(), device.getName());
                log.debug(resN);
            }

            if(device && device.hasParentUnit()) {
                log.debug(`${device.getName()} has battery ${device.hasBattery()} needing update ${device.needBatteryUpdate()}`);
                if(device.hasBattery() && device.needBatteryUpdate()) {
                    log.info(`Bridge: update ${device.getName()} battery to ${device.getBattery()} on IOChannel ${device.getBatteryIOChannelId()}`);
                    var resB = await this.api.setIOChannel(device.getBatteryIOChannelId(), device.getBattery());
                    log.debug(resB);
                }

                if(device.isSensor()) {
                    log.debug(`Bridge: device ${device.getName()} is a sensor`);
                    var inputs = device.getInputs();
                    for(var j=0; j < inputs.length; j++){
                        if(device.need2UpdateInput(inputs[j].name)) {
                            log.info(`Bridge: update ${device.getName()}.${inputs[j].name} value to ${inputs[j].value}`);
                            var resS = await this.api.setIOChannel(device.getIOChannelIdByName(inputs[j].name),inputs[j].value);
                            if(!resS.ok || !resS.authorized) {
                                log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${device.getIOChannelIdByName(inputs[j].name)} and input ${inputs[j].name}`);
                                log.warn(`this.api.setIOChannel(${device.getIOChannelIdByName(inputs[j].name)},${inputs[j].value});`);
                                log.warn(resS);
                            }
                        } else {
                            log.debug(`Bridge: no change of ${device.getName()}.${inputs[j].name} value ${inputs[j].value}`);
                        }
                    }

                }
                if(device.isDevice() && device.hasIOChannels()) {
                    var mode = device.getMode();
                    var methods = device.getMethods();
                    var channels = device.getParentUnit().channels;
                    log.debug(`Bridge: ${device.getName()} is a device with mode ${mode}`);
                    
                    //set platform values if needed
                    for(var k = 0; k < channels.length; k++) {
                        if(channels[k].direction === 0 && mode===1) {
                            log.debug(`Bridge: Device ${device.getName()} with value ${device.getValue()}, state ${device.getState()} and IOChannel ${channels[k].name} ${channels[k].value}`);
                            var plugin = await this._api.getDevicePlatform(device.getSn());
                            if(!plugin) {//check we have a plugin to set stuff with
                                log.warn(`Bridge: Unable to load plugin for ${device.getName()} with serial ${device.getSn()}`);
                            } else {
                                if(methods.on && methods.off) {
                                    if(methods.dim && channels[k].order === device.getConnectionIObyName("dimmer")){
                                        log.debug(`Bridge: Check to to set plugin dimmer ${device.getName()} value ${device.getValue()}, state ${device.getState()} and IOChannel ${channels[k].value}`);
                                        if(channels[k].value === 0 && (device.getState() !== "off" || (device.state !== "dim" && device.getValue() !==0) )) {
                                            log.info(`Bridge: Set plugin ${device.getName()} value to 0%.`);
                                            await plugin.setDim(device.getSn(),0);
                                        } else if((device.getState() === "off" || (device.getValue() !== channels[k].value)) && channels[k].value > 0) {
                                            log.info(`Bridge: Set plugin ${device.getName()} value to ${channels[k].value}% (${Math.round(channels[k].value/100*255)}) `);
                                            await plugin.setDim(device.getSn(), channels[k].value);
                                        }
                                    } 
                                    if(channels[k].order === device.getConnectionIObyName("on/off")) {
                                        log.debug(`Bridge: Check to to set plugin onoff ${device.getName()} value ${device.getValue()}, state ${device.getState()} and IOChannel ${channels[k].name} = ${channels[k].value}`);
                                        if(channels[k].value === 1 && device.getState() !== "on" ) {
                                            log.info(`Bridge: Set plugin ${device.getName()} value to on.`);
                                            await plugin.setOnOff(device.getSn(),1);
                                        } else if(channels[k].value === 0 && device.getState() !== "off") {
                                            log.info(`Bridge: Set plugin ${device.getName()} value to off.`);
                                            await plugin.setOnOff(device.getSn(),0);
                                        }
                                    }
                                    
                                }
                            }
                        } else if(channels[k].direction === 1 && channels[k].order < 100) {
                            log.debug(`Bridge: Check to set bridge ${channels[k].name} value ${device.getValue()}, state ${device.getState()} and IOChannel  ${channels[k].name} = ${channels[k].value}`);
                            //set input iochannels if needed
                            if(methods.on && methods.off) {
                                if(methods.dim && channels[k].order === device.getConnectionIObyName("dimmer")){
                                    //dimmer
                                    log.debug(`Bridge: dimmer state ${device.getState()} value ${device.getValue()} and IOChannel ${channels[k].value}`);
                                    if((device.getState() === "off" || (device.getState() === "dim" && device.getValue()===0)) && channels[k].value !== 0) {
                                        log.info(`Bridge: Set ${device.getName()} current value to 0%.`);
                                        var resDim1 = await this.api.setIOChannel(channels[k].id,0);
                                        if(!resDim1.ok || !resDim1.authorized) {
                                            log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${channels[k].id} and value 0%`);
                                            log.warn(`this.api.setIOChannel(${channels[k].id},0);`);
                                            log.warn(resDim1);
                                        }
                                        log.debug(resDim1);
                                    } else if(device.getState() === "dim" && device.getValue() !== channels[k].value) {
                                        log.info(`Bridge: Set ${device.getName()} current value to ${device.getValue()}%.`);
                                        var resDim2 = await this.api.setIOChannel(channels[k].id,device.getValue());
                                        if(!resDim2.ok || !resDim2.authorized) {
                                            log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${channels[k].id} and value ${device.getValue()}%`);
                                            log.warn(`this.api.setIOChannel(${channels[k].id},${device.getValue()});`);
                                            log.warn(resDim2);
                                        }
                                        log.debug(resDim2);
                                    } else if(device.getState() === "on" && channels[k].value !== 100) {
                                        log.info(`Bridge: Set ${device.getName()} current value to 100%.`);
                                        var resDim3 = await this.api.setIOChannel(channels[k].id,100);
                                        if(!resDim3.ok || !resDim3.authorized) {
                                            log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${channels[k].id} and value 100%`);
                                            log.warn(`this.api.setIOChannel(${channels[k].id},100);`);
                                            log.warn(resDim3);
                                        }
                                        log.debug(resDim3);
                                    }
                                    
                                }else if(channels[k].order === device.getConnectionIObyName("on/off")) {
                                    //onoff switch
                                    log.debug(`Bridge: onoff state is ${device.getState()} value ${device.getValue()} and IOChannel ${channels[k].value}`);
                                    if(device.getState() === "off" && channels[k].value !== 0) {
                                        log.info(`Bridge: Set ${device.getName()} current value to off.`);
                                        var resO1 = await this.api.setIOChannel(channels[k].id,0);
                                        if(!resO1.ok || !resO1.authorized) {
                                            log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${channels[k].id} and value 0`);
                                            log.warn(`this.api.setIOChannel(${channels[k].id},0);`);
                                            log.warn(resO1);
                                        }
                                        log.debug(resO1);
                                    } else if(device.getState() === "on" && channels[k].value !== 1) {
                                        log.info(`Bridge: Set ${device.getName()} current value to on.`);
                                        var resO2 = await this.api.setIOChannel(channels[k].id,1);
                                        if(!resO2.ok || !resO2.authorized) {
                                            log.warn(`Bridge: ${new Date().toISOString().replace('T', ' ').substr(0, 19)} update failed for iochannel ${channels[k].id} and value 1`);
                                            log.warn(`this.api.setIOChannel(${channels[k].id},1);`);
                                            log.warn(resO2);
                                        }
                                        log.debug(resO2);
                                    }
                                    
                                }
                            }
                        }

                    }

                    
                    

                }

                if(!(device.isDevice && device.hasIOChannels()) && !device.isSensor()) {
                    log.warn(`Bridge: No valid device for ${registered[i]}!`);
                }
                
            } else {
                log.warn(`Bridge: No valid IOUnit for ${device.getName()} with serial ${registered[i]}!`);
                //create IOUnit
                if(device.isSensor() || device.isDevice()) {
                    await this.createIOUnit(device);
                }
                log.debug(device.getConfig());
            }
        }

    }

    async updateDevice(device) {
        if(!device) {
            log.warn('Trying to update nonexisting device!');
            return;
        }
        log.debug(`Bridge: Update device ${device.getName()}`);
        var res = await this.api.getIOUnitChannels(device.getParentUnitId());
        log.debug(res);
        if(res.ok && res.authorized && res.data) {
            var d = res.data;
            if(d.length===0) {
                log.warn(`Trying to update sensor ${device.getName()} without inputs.`);
            }
            for(var i = 0; i < d.length; i++) {
                var ConnectionIO = d[i].ConnectionIO;
                if(ConnectionIO < 100) {

                } else if(ConnectionIO === device.getConnectionIObyName(`battery`)) {
                    log.debug(`API.updateDevice(): update ${device.getName()}.battery value to ${device.getBattery()}`);
                    var res3 = await this.api.setIOChannel(d[i].i,device.getBattery());
                    log.debug(res3);
                }
            }
        }
        
    }

    async updateSensor(device) {
        if(!device) {
            log.warn('Trying to update nonexisting sensor!');
            return;
        }
        log.debug(`   Update sensor ${device.getName()}`);
        var res = await this.api.getIOUnitChannels(device.getParentUnitId());
        log.debug(res);
        if(res.ok && res.authorized && res.data) {
            var d = res.data;
            if(d.length===0) {
                log.warn(`Trying to update sensor ${device.getName} without inputs.`);
            }
            for(var i = 0; i < d.length; i++) {
                var ConnectionIO = d[i].ConnectionIO;
                if(ConnectionIO < 250) {
                    var name = device.getNameByConnectionIO(ConnectionIO);
                    var input = device.getInputByName(name);
                    if(input) {
                        log.debug(`        update ${device.getName()}.${name} value to ${input.value}`);
                        var res2 = await this.api.setIOChannel(d[i].i,input.value);
                        log.debug(res2);    
                    }
                    
                } else if(ConnectionIO === device.getConnectionIObyName(`battery`)) {
                    log.debug(`        update ${device.getName()}.battery value to ${device.getBattery()}`);
                    var res3 = await this.api.setIOChannel(d[i].i,device.getBattery());
                    log.debug(res3);
                }
            }
        }
    }

    async createIOUnit(device) {
        var name = device.getName();
        var serial = device.getSn();
        if (serial && serial !== '' && await !this.haveIOUnitSn(serial)) {
            log.info(`Bridge: Creating IOUNIT for device ${name} with serial nummber ${serial}`);
            log.debug(device);
            var res = await this.api.createIOUnit(name,serial);
            log.debug(res);

            if(res.ok && res.authorized && res.data && res.data && res.data.i) {
                await device.storeParentUnit(res.data.i);
        
                await this.populateIOUnit(device);
        
            } else {
                log.warn(`Bridge: Failed to create IOUNIT`);
            }
        } else {
            log.info(`Bridge: IOUNIT for device ${name} with serial nummber ${serial} exist, skip creating!`);
        }
    }

    async populateIOUnit(device) {
        if(device.hasBattery()) {
            await this.createBattery(device);
        }

        if(device.isSensor()) {
            log.debug(`isSensor!`);
            await this.createSensor(device);
        } 
        if(device.isDevice()) {
            log.debug(`isDevice!`);          
            await this.createModeChannel(device);
            var method = device.getMethods();
            if(method.on && method.off) {
                if(method.dim) {
                    await this.createDimmer(device);
                } else {
                    await this.createOnOff(device);
                }
            }
            if(method.bell) {
                log.info(`Support for method bell not implemented`);
            }
            if(method.up || method.down || method.stop) {
                log.info(`Support for method up, down and stop not implemented`);
            }
            if(method.toggle) {
                log.info(`Support for method toggle not implemented`);
                //await this.createToggle(device);
            }

        } 
        if(!device.isSensor() && device.isDevice()) {
            log.warn(`Unknown device Sn=${device.getSn()}`);
        }
    }

    async createBattery(device) {
        log.debug(`    Creating Battery`);
        var r1 = await this.api.createIOChannel(device.getParentUnitId(), 'battery', this.api.def.IOCHANNEL.INPUT, 252, `Value=${device.getBattery()};Unit="%";`);
        log.debug(r1);
    }

    async createSensor(device) {
        log.debug(`    Creating Sensor`);
        log.debug(device.getConfig());
        var inputs = device.getInputs();
        for(var i = 0; i < inputs.length; i++) {
            log.debug(`        Creating input ${inputs[i].name}`);
            if(typeof inputs[i].unit !== `undefined`) log.debug(`           with Unit=${inputs[i].unit};`);
            var r1 = await this.api.createIOChannel(device.getParentUnitId(), inputs[i].name, this.api.def.IOCHANNEL.INPUT, device.getConnectionIObyName(inputs[i].name),`Value=${inputs[i].value};${(typeof inputs[i].unit === 'undefined'?``:`Unit="${inputs[i].unit}";`)}`);
            log.debug(r1);
        }

    }

    async createDimmer(device) {
        log.debug(`    Creating Dimmer`);
        var r1 = await this.api.createIOChannel(device.getParentUnitId(), 'Dimmer Status', this.api.def.IOCHANNEL.INPUT, device.getConnectionIObyName(`dimmer`));
        log.debug(r1);
        //todo: 0 decimals
        var r2 = await this.api.createIOChannel(device.getParentUnitId(), 'Dimmer Control', this.api.def.IOCHANNEL.OUTPUT, device.getConnectionIObyName(`dimmer`));
        log.debug(r2);
    }

    async createOnOff(device) {
        log.debug(`    Creating OnOff`);
        var r1 = await this.api.createIOChannel(device.getParentUnitId(), 'OnOff Status', this.api.def.IOCHANNEL.INPUT, device.getConnectionIObyName(`on/off`));
        log.debug(r1);
        //todo: Enum 0=Off, 1=On
        var r2 = await this.api.createIOChannel(device.getParentUnitId(), 'OnOff Control', this.api.def.IOCHANNEL.OUTPUT, device.getConnectionIObyName(`on/off`));
        log.debug(r2);
    }

    async createToggle(device) {
        log.debug(`    Creating Toggle`);
        //todo: Enum 0=No, 1=Toggle
        var r2 = await this.api.createIOChannel(device.getParentUnitId(), 'Toggle Control', this.api.def.IOCHANNEL.OUTPUT, device.getConnectionIObyName(`toggle`));
        log.debug(r2);
    }

    async createModeChannel(device){
        log.debug(`    Creating Mode`);
        var r1 = await this.api.createIOChannel(device.getParentUnitId(), 'Mode', this.api.def.IOCHANNEL.OUTPUT, device.getConnectionIObyName(`mode`));
            log.debug(r1);
            if(r1.ok && r1.authorized && r1.data && r1.data && r1.data.i && r1.data.Code === 0) {
                var index1 = r1.data.i;
                var lang = this.api.getLang();
                var r2 = await this.api.formatIOChannel(index1,this.api.def.FORMAT.NAMED,0,0,0,`{'0':'${this.getMode(0,lang)}'},{'1':'${this.getMode(1,lang)}'}`);
                log.debug(r2);
            }
    }

    async listIOUnits(sn='') {
        var res = await this.api.get(`IOUNIT{i>0;Identifier;Name;NAME;Type=${this.api.def.IOUNIT.TYPE_OBJECT};ProtocolAddress;Timestamp;AlarmStatus;DecSN${(sn.length>0?`"=${sn}"`:``)};}`);
        if(res.ok) { return {ok:true, authorized:true, data:res.data.IOUNIT, status:res.status}; }else{ return res; }
    }

    async haveIOUnitSn(sn=``) {
        if(sn===``) return true;
        var res = await this.api.get(`IOUNIT{i>0;Identifier;Name;NAME;Type=${this.api.def.IOUNIT.TYPE_OBJECT};ProtocolAddress;Timestamp;AlarmStatus;DecSN=${sn};}`);
        log.info(`Bridge.haveIOUnit(${sn}) `);
        if(res.ok && res.data && res.data.IOUNIT && res.data.IOUNIT.length > 0) {
            return true;
        } else {
            //return true if request failed
            if(!res.ok) return true;
        }
        return false;
    }


    getMode(nr,lang){
        if(nr>2 || nr<0) nr=0;
        if(!this.CONTROL_MODE[nr][lang]) {
            return this.CONTROL_MODE[nr]['en'];
        }
        return this.CONTROL_MODE[nr][lang];
    }

    /**
     * 
     * @depriciated not used 
     */
    sleep(ms){
        return new Promise(resolve=>{
            setTimeout(resolve,ms);
        });
    }

}

module.exports = {Bridge:Bridge};