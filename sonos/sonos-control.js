var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function(RED) {
	'use strict';

	function Node(config) {
	  
		RED.nodes.createNode(this, config);
		var node = this;
		var configNode = RED.nodes.getNode(config.confignode);

		var isValid = helper.validateConfigNode(node, configNode);
		if (!isValid)
			return;

		//clear node status
		node.status({});

		//Hmmm?
		node.mode = config.mode;
		node.track = config.track;
		node.volume = config.volume;
		if (node.volume === "empty")
			node.volume = "";
		node.volume_value = config.volume_value;
		
		//handle input message
		node.on('input', function (msg) {
			helper.preprocessInputMsg(node, configNode, msg, function(device) {
				handleInputMsg(node, configNode, msg, device.ipaddress);
			});
		});
	}

	//------------------------------------------------------------------------------------

	function handleInputMsg(node, configNode, msg, ipaddress)
	{
		var sonos = require('sonos');
		var client = new sonos.Sonos(ipaddress);
		if (client === null || client === undefined) {
			node.status({fill:"red", shape:"dot", text:"sonos client is null"});
			return;
		}

		//Convert payload to lowercase string
		var payload = "";
		if (msg.payload !== null && msg.payload !== undefined && msg.payload) 
			payload = "" + msg.payload;
		payload = payload.toLowerCase();

		//Handle simple string payload format, rather than specific JSON format previously
		if (payload === "play" || payload === "pause" || payload === "stop" || payload === "toggle" || payload === "playpause") {
			payload = {mode: payload};
		}
		else if (payload === "next" || payload === "previous") {
			payload = {track: payload};
		}
		else if (payload === "mute" || payload === "unmute" || payload === "vol_up" || payload === "vol_down" || payload === "vol+" || payload === "vol+") {
			payload = {volume: payload};
		}
		else if (payload.startsWith("+") && parseInt(payload) > 0 && parseInt(payload) <= 100) {
			payload = {volume: "vol_up", volstep: parseInt(payload)};
		}
		else if (payload.startsWith("-") && parseInt(payload) < 0 && parseInt(payload) >= -100) {
			payload = {volume: "vol_down", volstep: -parseInt(payload)};
		}
		else if (!isNaN(parseInt(payload)) && parseInt(payload) >= 0 && parseInt(payload) <= 100) {
			payload = {volume: "vol_set", volume_value: payload};
		}
		else if (payload === "flush" || payload === "clear") {
			payload = {command: "flush"};
		}

		//Grouping
		else if (payload === "join" || payload === "join_group" || payload === "joingroup" || payload === "join group") {
			payload = "join_group";
			handleGroupingCommand(node, configNode, msg, client, payload);
		}
		else if (payload === "leave" || payload === "leave_group" || payload === "leavegroup" || payload === "leave group") {
			payload = "leave_group";
			handleGroupingCommand(node, configNode, msg, client, payload);
		}
		
		//Use payload values only if config via dialog is empty
		var _mode = payload.mode;
		if (node.mode)
			_mode = node.mode;
		var _track = payload.track;
		if (node.track)
			_track = node.track;
		var _volume = payload.volume;
		if (node.volume)
			_volume = node.volume;
		var _command = payload.command;
		if (node.command)
			_command = node.command;

		// simple control commands
		if (_mode)
			handleCommand(node, configNode, msg, client, _mode);
		if (_track)
			handleCommand(node, configNode, msg, client, _track);
		if (_volume)
			handleCommand(node, configNode, msg, client, _volume);
		if (_command)
			handleCommand(node, configNode, msg, client, _command);

		// commands with parameters
		if (payload.volume || node.volume)
			handleVolumeCommand(node, configNode, msg, client, payload);

		node.send(msg);
	}

	//------------------------------------------------------------------------------------

	function handleCommand(node, configNode, msg, client, cmd)
	{
		switch (cmd) 
		{
			case "pause":
				client.pause().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "paused", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;
			case "stop":
				client.stop().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "stopped", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;
			case "toggle":
			case "playpause":
				//Retrieve current playing state
				client.getCurrentState(function (err, state) {
					if (err) {
						node.error(JSON.stringify(err));
						node.status({fill:"red", shape:"dot", text:"failed to retrieve current state"});
						return;
					}
					if (state === null || state === undefined) {
						node.status({fill:"red", shape:"dot", text:"invalid current state retrieved"});
						return;	
					}

					//Toggle playing state
					if (state === "playing") {
						client.pause().then(result => 
							helper.handleSonosApiRequest(node, null, result, msg, "paused", null)
						).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
					}
					else {
						client.play().then(result => 
							helper.handleSonosApiRequest(node, null, result, msg, "playing", null)
						).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
					}
				});
				break;
			case "play":
			case "playing":
				client.play().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "playing", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;

			case "next":
				client.next().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "next", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;
			case "previous":
				client.previous().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "previous", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;

			case "mute":
				client.setMuted(true).then(result => {
					helper.handleSonosApiRequest(node, null, result, msg, "muted", null);
				}).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;
			case "unmute":
				client.setMuted(false).then(result => {
					helper.handleSonosApiRequest(node, null, result, msg, "unmuted", null);
				}).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;

			case "flush":
				client.flush().then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "queue cleared", null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, {}, null, null));
				break;
		}
	}

	function handleVolumeCommand(node, configNode, msg, client, payload)
	{
		var _volumeFunction;
		var _volumeValue;

		//Use payload values as default
		if (payload.volume) {
			if (payload.volume === "vol_up" || payload.volume === "volup" || payload.volume === "vol+") {
				_volumeFunction = "vol_up";
				_volumeValue = payload.volstep;
				
			} else if (payload.volume === "vol_down" || payload.volume === "voldown" || payload.volume === "vol-") {
				_volumeFunction = "vol_down";
				_volumeValue = payload.volstep;
					
			} else if (payload.volume === "mute") {
				_volumeFunction = "mute";
					
			} else if (payload.volume === "unmute") {
				_volumeFunction = "unmute";
					
			} else if (payload.volume === "vol_set") {
				_volumeFunction = "vol_set";
				_volumeValue = payload.volume_value;
			}
		}
		
		//Use payload values only if config via dialog is empty
		if (node.volume === "volume") {
			_volumeFunction = "vol_set";
			_volumeValue = node.volume_value;

		} else if (node.volume === "vol_up") {
			_volumeFunction = "vol_up";
			_volumeValue = node.volume_value;

		} else if (node.volume === "vol_down") {
			_volumeFunction = "vol_down";
			_volumeValue = node.volume_value;

		} else if (node.volume === "mute") {
			_volumeFunction = "mute";

		} else if (node.volume === "unmute") {
			_volumeFunction = "unmute";
		}
		
		switch (_volumeFunction) 
		{
			case "vol_set":
				var volume_val = parseInt(_volumeValue);
				if (isNaN(volume_val) || volume_val < 0 || volume_val > 100) {
					node.status({fill:"red", shape:"dot", text:"invalid value for volume"});
					break;
				}
				client.setVolume(String(_volumeValue)).then(result => 
					helper.handleSonosApiRequest(node, null, result, msg, "vol: " + String(_volumeValue), null)
				).catch(e => helper.handleSonosApiRequest(node, e, null, msg, "error vol: " + String(_volumeValue), null));
				break;

			
			case "vol_up":
				var volume_step = parseInt(_volumeValue);
				if (isNaN(volume_step) || volume_step > 100 || volume_step <= 0)
					volume_step = 5;
				client.getVolume().then(result => {
					// if (err) {
					// 	node.error(JSON.stringify(err));
					// 	node.status({fill:"red", shape:"dot", text:"failed to execute request"});
					// 	return;
					// }
						var volume_val = parseInt(result) + volume_step;
						volume_val = Math.min(100, volume_val);
						volume_val = Math.max(0, volume_val);
						client.setVolume(volume_val).then(result => 
							helper.handleSonosApiRequest(node, null, result, msg, "vol: " + String(volume_val), null)
						);
				}).catch(e => helper.handleSonosApiRequest(node, e, null, msg, "error vol: " + String(volume_val), null));
				break;

			case "vol_down":
				var volume_step = parseInt(_volumeValue);
				if (isNaN(volume_step) || volume_step > 100 || volume_step <= 0)
					volume_step = 5;
				client.getVolume(function (err, result) {
					if (err) {
						node.error(JSON.stringify(err));
						node.status({fill:"red", shape:"dot", text:"failed to execute request"});
						return;
					}
						var volume_val = parseInt(result) - volume_step;
						volume_val = Math.min(100, volume_val);
						volume_val = Math.max(0, volume_val);
						client.setVolume(volume_val).then(result => 
							helper.handleSonosApiRequest(node, null, result, msg, "vol: " + String(volume_val), null)
						).catch(e => helper.handleSonosApiRequest(node, e, null, msg, "error vol: " + String(volume_val), null));
				});
				break;
		}
	}

	function handleGroupingCommand(node, configNode, msg, client, payload)
	{
		if (payload === "leave_group") {
			client.leaveGroup().then(result => 
				helper.handleSonosApiRequest(node, null, result, msg, "left group", null)
			).catch(e => helper.handleSonosApiRequest(node, e, null, msg, null, null));
		}

		if (payload === "join_group") {
			//validation
			var deviceName = msg.topic;
			if (!deviceName) {
				node.error(JSON.stringify(err));
				node.status({fill:"red", shape:"dot", text:"msg.topic is not defined"});
				return;
			}

			client.joinGroup(deviceName).then(result => 
				helper.handleSonosApiRequest(node, null, result, msg, "joined group with " + deviceName, null)
			).then(err => {
				helper.handleSonosApiRequest(node, err, null, msg, "error joined group with " + deviceName, null)
			});
		}
	}
	
	RED.nodes.registerType('better-sonos-control', Node);
};