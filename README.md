Ioriver
=======

Home automation bridge mainly for the IMSE Ultra PLC/BAC. Currently supports:
- IMSE UltraBase20
- IMSE UltraBase30
- ER EW-1
- ER EW-3

## Setup

The current version only have one plugin **ioriver-telldus** with Telldus local API and you need at least one plugin to run therefore we install it too.

For global setup:
```
>sudo npm -g i ioriver
>sudo npm -g i ioriver-telldus
```

## Configuration 
Copy config-sample.json to your ioriver directory (/root/.ioriver)
```
>sudo mkdir /root/.ioriver
>cd /root/.ioriver
>sudo cp /usr/local/lib/node_modules/ioriver/config-sample.json ./config.json 
```
Edit the config file:
```json
{
    "bridge": {
        "name":"Ioriver",
        "host":"10.0.48.94",
        "username":"config",
        "password": "ef56",
        "port":"443",
        "path":"",
        "sn_x100000":4212,
        "update_names":false
    },
    "description":"this is a sample config file",
    "platforms":[
        {
            "platform":"ioriver-telldus",
            "name":"My Telldus",
            "sn_x1000":1,
            "ip": "10.0.48.95",
            "access_token":"MY_LOCAL_ACCESS_TOKEN",
            "ignore_id_list": [1,2,3]
        }
    ]

}
```
### Configure options for IMSE Ultra PLC

bridge section of the file
| Label | Description |
| --- | --- |
| name | Arbitary name of your installation |
| host | ip adress or hostname of your IMSE Ultra PLC |
| username | IMSE Ultra username. Default is *config*. |
| password | IMSE Ultra password. The default is *ef56*, please change it! |
| port | IMSE Ultra port. The default is 443 |
| path | IMSE Ultra path if behind a proxypass or such. Usually an emptry string |
| sn_x100000 | This is used as an identifier for this bridge on the IMSE Ultra. An integer 1-9999.|
| update_names | Setting this to true will update the IOUNIT name to the current name from the plugin and change it if it is changed on the plugin platform(s) |


### Configure plugins
Plugins are configured in the platforms section of the file. Multiple platforms are allowed even of the same type as long as they have different sn_x1000.

| Label | Description |
| --- | --- |
| platform | The npm package name |
| name | Arbitary name of the platform |
| sn_x1000 | Unique serial number for the platform on this bridge. Integer 1-99 |
| ??? | plugin specific data, see plugin documentation for details. |


#### Configure ioriver-telldus plugin
See [ioriver-telldus](https://www.npmjs.com/package/ioriver-telldus) documentation for details.


## Usage

To run ioriver in a specific directory with config.json
```
>ioriver -U /root/.ioriver
```

Option -D show debug information

Running on Rasberry it is recommended to redirect standard output to /dev/null to avoid trashing the SD card
```
>ioriver -U /root/.ioriver >/dev/null 2>/dev/null
```

Use pm2 or similar utilities to make it run at startup

## Release History

### 0.4.0 2018-03-14
- Support for Telldus energy meter
- Support for automatic unit name changes (update unit on IMSE if the name changes on plugin platform)
- buggfixes 

### 0.1.0 2018-02-06
- Support for Telldus local api
- Support for OnOff and dimmer devices
- Support for common sensors (temperature, humidity, and weather)