var AccessoryType;
const HarmonySubPlatform = require('./harmonySubPlatform').HarmonySubPlatform;
const HarmonyTools = require('./harmonyTools.js');
const HarmonyHubDiscover = require('harmonyhubjs-discover');
var EventEmitter = require('events');
var inherits = require('util').inherits;

module.exports = {
  HarmonyPlatform: HarmonyPlatform,
};

function HarmonyPlatform(log, config, api) {
  EventEmitter.call(this);

  this.log = log;

  this.log('HarmonyPlatform Init');

  this.api = api;

  AccessoryType = this.api.hap.Accessory.Categories;

  if (!config) {
    log('No configuration found for homebridge-harmonyHub');
    return;
  }

  this.plaformsConfigs = [];
  this.plaformsConfigs.push(config);

  if (config['otherPlatforms']) {
    this.plaformsConfigs.push.apply(this.plaformsConfigs, config['otherPlatforms']);
  }

  this.cleanCache = HarmonyTools.checkParameter(config['cleanCache'], false);

  this.publishAllTVAsExternalAccessory = HarmonyTools.checkParameter(
    config['publishAllTVAsExternalAccessory'],
    false
  );

  this.platforms = [];

  for (let i = 0, len = this.plaformsConfigs.length; i < len; i++) {
    let platformConfig = this.plaformsConfigs[i];

    this.platforms.push(new HarmonySubPlatform(log, platformConfig, api, this));
  }

  this.api
    .on(
      'shutdown',
      function () {
        this.log('INFO - shutdown');
        for (let i = 0, len = this.platforms.length; i < len; i++) {
          let platform = this.platforms[i];
          platform.harmonyBase.harmony.removeAllListeners();
          platform.harmonyBase.harmony.close();
        }
      }.bind(this)
    )
    .on(
      'didFinishLaunching',
      function () {
        this.log('DidFinishLaunching');

        if (this.cleanCache) {
          this.log('WARNING - Removing Accessories');

          for (let i = 0, len = this.platforms.length; i < len; i++) {
            let platform = this.platforms[i];
            platform.api.unregisterPlatformAccessories(
              'homebridge-harmonyHub',
              'HarmonyHubWebSocket',
              platform._foundAccessories
            );
            platform._foundAccessories = [];
          }
        }

        var launchDiscovery = false;
        for (let i = 0, len = this.platforms.length; i < len; i++) {
          let platform = this.platforms[i];
          platform.harmonyBase.configureAccessories(platform);

          //check for discovery
          if (platform.hubIP == undefined) {
            launchDiscovery = true;
          }
        }
        if (launchDiscovery) {
          this.discover = new HarmonyHubDiscover(61991);
          this.discoverHub();
        }
      }.bind(this)
    );
}

HarmonyPlatform.prototype = {
  //Restore from cache
  configureAccessory: function (accessory) {
    let platformName = accessory.context.subPlatformName;
    var platform;

    if (this.platforms && this.platforms.length > 0)
      platform = this.platforms.find((x) => x.name == platformName);

    if (platform == undefined) {
      this.log(
        'WARNING - configureAccessory - The platform ' +
          platformName +
          " is not there anymore in your config (name property). It won't be loaded and will be removed from cache."
      );

      this.api.unregisterPlatformAccessories('homebridge-harmonyHub', 'HarmonyHubWebSocket', [
        accessory,
      ]);
    } else {
      this.log.debug(
        accessory.displayName,
        'Got cached Accessory ' + accessory.UUID + ' for ' + platform.name
      );

      platform._foundAccessories.push(accessory);

      if (accessory.category == AccessoryType.TELEVISION) {
        this._oneTVAdded = true;
        this.log(
          'WARNING - configureAccessory - TV accessory added in your bridge from cache, if another plugin is exposing a TV accessory this one might not be visible in your remote widget'
        );
      }
    }
  },

  //HUB discovery
  discoverHub: function () {
    this.discover.on('update', (hubs) => {
      // Combines the online & update events by returning an array with all known
      // hubs for ease of use.
      const knownHubs = hubs.reduce(function (prev, hub) {
        return (
          prev + (prev.length > 0 ? ',' : '') + hub.ip + '|' + hub.friendlyName + '|' + hub.remoteId
        );
      }, '');

      knownHubsArray = knownHubs.split(',');
      this.discover.stop();
      this.discoverInProgress = false;
      this.emit('discoveredHubs', knownHubsArray);
    });

    try {
      if (!this.discoverInProgress) {
        this.discoverInProgress = true;
        this.discover.start();
      }
    } catch (error) {
      harmonyPlatform.log('ERROR - cannot discover hub - ' + error);
      setTimeout(() => {
        this.discoverHub();
      }, HarmonyConst.DELAY_BEFORE_RECONNECT);
    }
  },
};

inherits(HarmonyPlatform, EventEmitter);
