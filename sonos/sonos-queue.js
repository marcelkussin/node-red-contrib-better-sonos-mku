var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function(RED) {
	'use strict';

	function Node(n) {
	  
		RED.nodes.createNode(this, n);
		var node = this;
		var configNode = RED.nodes.getNode(n.confignode);

		var isValid = helper.validateConfigNode(node, configNode);
		if (!isValid)
			return;

		//clear node status
		node.status({});

		//Hmmm?		
		node.songuri = n.songuri;
		node.position = n.position;
		if (node.position === "empty") {
			node.position = "";
		}
		node.positioninqueue = n.positioninqueue;

		//handle input message
		node.on('input', function (msg) {
			helper.preprocessInputMsg(node, configNode, msg, function(device) {
				setSonosQueue(node, msg, device.ipaddress);
			});
		});
	}

	function setSonosQueue(node, msg, ipaddress)
	{
		if(!msg) msg = {};
		const Sonos = require('sonos').Sonos
		var client = new Sonos(ipaddress);
		if (client === null || client === undefined) {
			node.status({fill:"red", shape:"dot", text:"sonos client is null"});
			return;
		} else {
			console.log('sonos client is', client);
		}

		var payload = typeof msg.payload === 'object' ? msg.payload : {};

		var _songuri = node.songuri;
		if (payload.songuri)
			_songuri = payload.songuri;
		
		if (node.position === "next" || payload.position === "next") {
			node.log("Queueing URI next: " + _songuri);
			client.queueNext(_songuri).then(result => {
				helper.handleSonosApiRequest(node, err, result, msg, null, null);
			});
		} 
		else if (node.position === "directplay" || payload.position === "directplay") {
			node.log("Direct play URI: " + _songuri);
			client.play(_songuri).then(result => {
				helper.handleSonosApiRequest(node, err, result, msg, null, null);
			});
		} 
		else if (node.position === "notification" || payload.position === "notification") {
			node.log("Direct play Notification URI: " + _songuri);
			client.playNotification({
				uri: _songuri,
				onlyWhenPlaying: true, // It will query the state anyway, don't play the notification if the speaker is currently off.
				volume: 80 // Change the volume for the notification, and revert back afterwards.
			  }).then(result => {
				// It will wait until the notification is played until getting here.
				helper.handleSonosApiRequest(node, null, {playedNotification: true}, {}, null, null);

			  }).catch(err => { 
				helper.handleSonosApiRequest(node, err, {playedNotification: false}, {}, null, null);
			   })
			// client.playNotification({
			// 	uri: 'https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-the-sound-pack-tree/tspt_angry_dog_02_003.mp3?_=1',
			// 	onlyWhenPlaying: false, // It will query the state anyway, don't play the notification if the speaker is currently off.
			// 	volume: 20 // Change the volume for the notification, and revert back afterwards.
			//   }).then(result => {
			// 	// It will wait until the notification is played until getting here.
			// 	console.log('Did play notification %j', result)
			  
			// 	// It starts (and stops) a listener in the background so you have to exit the process explicitly.
			// 	process.exit()
			//   }).catch(err => { console.log('Error occurred %j', err) })
		} 
		else {				
			// Default is append to the end of current queue
			var set_position = 0;
			// Evaluate different inputs (json payload preferred, node option second, default third)
			if (payload.position) {
				set_position = payload.position;
			} else if (node.positioninqueue) {
				if (isNaN(node.positioninqueue) == false) {
					set_position = parseInt(node.positioninqueue, 10);
				}
			}
			// Queue song now
			node.log("Queuing at " + set_position + " URI: " + _songuri );
			client.queue(_songuri, set_position).then(result => {
				helper.handleSonosApiRequest(node, err, result, msg, null, null);
			});
		}
	}

	RED.nodes.registerType('better-sonos-queue', Node);
};