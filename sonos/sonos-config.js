module.exports = function(RED) 
{
    function SonosPlayerNode(config) {
        RED.nodes.createNode(this, config);

        this.serialnum = config.serialnum;
        this.ipaddress = config.ipaddress;
    }

    //Build API to auto detect IP Addresses
    RED.httpAdmin.get("/sonosSearch", function(req, res) {
        RED.log.error("GET /sonosSearch");
        discoverSonos(function(devices) {
            RED.log.error("GET /sonosSearch: " + devices.length + " found");
            res.json(devices);
        });
    });

    function discoverSonos(discoveryCallback) 
    {
        RED.log.error("Start Sonos discovery");

        var sonos = require("sonos");

        const search = sonos.DeviceDiscovery({ timeout: 30000 });

        var devices = [];
        search.on('DeviceAvailable', function (device, model) {
            device.deviceDescription().then(info => {
                
                console.log(info);
                
                var label = "" + info.friendlyName + " (" + info.roomName + ")";
                devices.push({
                    label:label,
                    value:info.serialNum
                });
            }).catch(e => console.error(e));
          })

        /*
        var search = sonos.search().then(device => {
            device.deviceDescription().then(info => {
                if (err) {
                    console.log(err);
                    return;
                }
                var label = "" + info.friendlyName + " (" + info.roomName + ")";
                devices.push({
                    label:label,
                    value:info.serialNum
                });
            });
        });
        search.setMaxListeners(Infinity);
        */
        //Stop searching after 5 seconds
        setTimeout(function() { 
            search.destroy();
        }, 5000);
  
        //Add a bit of delay for all devices to be discovered
        if (discoveryCallback) {
            setTimeout(function() { 
                discoveryCallback(devices);
            }, 5000);
        }
    }

    RED.nodes.registerType("better-sonos-config", SonosPlayerNode);
};