'use strict';
const baseUrl = process.env.ST_API_URL;

const request = require('request');

exports.handler = (event, context, callback) => {
    console.log('Base URL from config file is: ', baseUrl);
    console.log('Event payload: ' + JSON.stringify(event, null, 2));
    console.log(event);
    try {
        let res;

        switch(event.lifecycle) {
            case 'PING': {
                callback(null, {
                    statusCode: 200,
                    pingData: {
                        challenge: event.pingData.challenge
                    }
                });
                break;
            }
            case 'CONFIGURATION': {
                res = handleConfig(event.configurationData);
                callback(null, {
                    configurationData: res,
                    statusCode: 200
                });
                break;
            }
            case 'INSTALL': {
                handleInstall(event.installData.installedApp, event.installData.authToken);
                callback(null, {
                    installData: {},
                    statusCode: 200
                });
                break;
            }
            case 'UPDATE': {
                handleUpdate(event.updateData.installedApp, event.authToken);
                callback(null, {
                    updateData: {},
                    statusCode: 200
                });
                break;
            }
            case 'UNINSTALL': {
                // Delete subscriptions
                break;
            }
            case 'EVENT': {
                handleEvents(event.eventData);
                callback(null, {
                    eventData: {},
                    statusCode: 200
                });
                break;
            }
            default: {
                callback('Error, execType is not supported: ${event.executionType}');
            }
        }
    } catch (error) {
        callback('Error occurred: ' + error);
    }
};

function handleConfig(event) {
    if (!event.config) {
        throw new Error('No config section set in request.');
    }

    const configurationData = {};
    const phase = event.phase;
    const pageId = event.pageId;
    const settings = event.config;

    switch (phase) {
        case 'INITIALIZE':
            configurationData.initialize = createAppInfo();
            break;
        case 'PAGE':
            configurationData.page = createConfigPage(pageId, settings);
            break;
        default:
            throw new Error('Unsupported config phase: ${phase}');
            break;
    }

    return configurationData;
}

function createAppInfo() {
    return {
        name: 'Baby Care',
        description: 'Smartapp for monitoring kids.',
        id: 'babycare',
        permissions: ['r:devices:*', 'x:devices:*', 'w:devices:*', 'w:installedapps', 'x:notifications:*'],
        firstPageId: '1'
    }
}

function createConfigPage(pageId, currentConfig) {
    if (pageId !== '1') {
        throw new Error('Unsupported page name: ${pageId}');
    }

    return {
        pageId: '1',
        name: 'Baby Care',
        nextPageId: null,
        previousPageId: null,
        complete: true,
        sections: [
            {
                name: 'When baby cries',
                settings: [
                    {
                        id: 'ipcamera', // ID of this field
                        name: 'Select a IP Camera',
                        description: 'Tap to set',
                        type: 'DEVICE',
                        required: true,
                        multiple: false,
                        capabilities: ['soundDetection'],
                        permissions: ['r']
                    }
                ]
            },
            {
                name: 'Notify me with below message',
                settings: [
                    {
                        id: 'notify', // ID of this field
                        name: 'Enter message',
                        description: 'Tap to set',
                        type: 'TEXT',
                        required: true,
                        defaultValue: 'Need attention. Baby is crying.'
                    }
                ]
            }
        ]
    };
}

function handleInstall(installedApp, authCode) {
   const path = '/installedapps/' + installedApp.installedAppId + '/subscriptions';
    console.log('Config payload: ' + JSON.stringify(installedApp.config, null, 2));

   console.log('Permissions payload: ' + installedApp.permissions); 
   let subRequest = {
        sourceType: 'DEVICE',
        device: {
            componentId: installedApp.config.ipcamera[0].deviceConfig.componentId,
            deviceId: installedApp.config.ipcamera[0].deviceConfig.deviceId,
            capability: 'soundDetection',
            attribute: 'soundDetected',
            stateChangeOnly: true,
            value: '*'
        }
    };

    console.log('subscribeToSoundDetection:', [installedApp.installedAppId, installedApp.config, authCode, path]);

    request.post({
        url: baseUrl + path,
        json: true,
        body: subRequest,
        headers: {
            'Authorization': 'Bearer ' + authCode,
        }
    },function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('Babycry subscriptions successful.')
        } else {
            console.log('Babycry subscriptions failed.');
            console.log(error);
        }
    });

}

function handleUpdate(installedApp, authToken) {
    const path = '/locations/${installedApp.locationId}/installedapps/${installedApp.installedAppId}/subscriptions';

    request.delete({
        url: baseUrl + path,
        headers: {
            'Authorization': 'Bearer ' + authToken
        }
    }, function () {
	var ipcamera = 'ipcamera' in installedApp.config
	var notify = 'notify' in installedApp.config
	console.log('Check for device deletion scenario. ipcamera: ' + ipcamera, 'notify: ' + notify);
	if ((ipcamera == false) || (notify == false)) {
	    console.log("Some device got deleted. Uninstalling the app.");		
	    unInstallApp(installedApp, authToken);
	} else {
            handleInstall(installedApp, authToken);
	}
    });
}

function unInstallApp(installedApp, authToken) {
    // TODO
    const path = '/v1/installedapps/${installedApp.installedAppId}';
    request.delete({
        url: baseUrl + path,
        headers: {
            'Authorization': 'Bearer ' + authToken
        }
    }, function (error, response, body) {
         if (!error && response.statusCode == 200) {
            console.log('uninstall app successful.')
        } else {
            console.log('uninstall app failed.');
            console.log(error, response, body);
        }
    });
}

function handleEvents(eventData) {
    const eventType = eventData.events[0].eventType;
    if ('DEVICE_EVENT' === eventType) {
        console.log(eventData.events[0].deviceEvent);
        babyHandler(eventData.installedApp.installedAppId, eventData.events[0].deviceEvent, eventData.installedApp.config, eventData.authToken);
    }
}

function babyHandler(installedAppId, deviceEvent, config, authToken) {
    if (deviceEvent.deviceId === config.ipcamera[0].deviceConfig.deviceId) {
        if (deviceEvent.value === 'babyCrying') {
            console.log('send notification');
            //sendNotification(config.switches[0].deviceConfig.deviceId, 'on', authToken);
        }
    }
}
