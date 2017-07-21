/**
 * @exports OSMBuildingLayer
 */
define(['libraries/WebWorldWind/src/cache/MemoryCache',
        'libraries/WebWorldWind/src/error/ArgumentError',
        'libraries/WebWorldWind/src/util/Logger',
        'libraries/WebWorldWind/src/geom/BoundingBox',
        'libraries/WebWorldWind/src/geom/Sector',
        'libraries/WebWorldWind/src/gesture/DragRecognizer',
        'libraries/WebWorldWind/src/gesture/PanRecognizer',
        'src/OSMLayer',
        'src/GeoJSONParserTriangulationOSM',
        'jquery',
        'osmtogeojson'],
       function (MemoryCache, ArgumentError, Logger, BoundingBox, Sector, DragRecognizer, PanRecognizer, OSMLayer, GeoJSONParserTriangulationOSM, $, osmtogeojson) {
  "use strict";

  /**
   * Creates a sublass of the {@link OSMLayer} class.
   * @alias OSMBuildingLayer
   * @constructor
   * @classdesc Fetches OSM buildings, converts them to GeoJSON, and adds them to the WorldWindow.
   * @param {WorldWindow} worldWindow The WorldWindow where the OSMBuildingLayer is added to.
   * @param {Object} source Defines the data source of the {@link OSMBuildingLayer}.
   * @param {Object} configuration Configuration is used to set the attributes of {@link ShapeAttributes}. Four more attributes can be defined, which are "extrude", "heatmap", "altitude" and "altitudeMode".
   */
  var OSMBuildingLayer = function (worldWindow, configuration, source) {
    OSMLayer.call(this, worldWindow, configuration);
    this._type = "way";
    this._tag = "building";

    /**
     * Defines the data source of the {@link OSMBuildingLayer}. Its "type" can be either "boundingBox" or "GeoJSONFile".
     * If the "type" is "boundingBox", "coordinates" must be defined. The order of the "coordinates" is "x1, y1, x2, y2".
     * If the "type" is "GeoJSONFile", "path" where the file resides must be defined.
     * @memberof OSMBuildingLayer.prototype
     * @type {Object}
     */
    this._source = source;

    /**
     * The cache for the geometry of each feature of the OSMBuildingLayer.
     * @memberof OSMBuildingLayer.prototype
     * @type {MemoryCache}
     */
    this._geometryCache = new MemoryCache(30000, 24000);

    /**
     * The cache for the properties of each feature of the OSMBuildingLayer.
     * @memberof OSMBuildingLayer.prototype
     * @type {MemoryCache}
     */
    this._propertiesCache = new MemoryCache(50000, 40000);

    this._cache = new MemoryCache(100000, 80000);
  };

  OSMBuildingLayer.prototype = Object.create(OSMLayer.prototype);

  /**
   *
   */
  OSMBuildingLayer.prototype.detectVisibilityChange = function () {

  }

  /**
   * Sectorizes a bounding box. Each sector initially will be 0.01 to 0.01 degrees for all the zoom levels.
   * @param {Float[]} boundingBox The bounding box to be sectorized. Intended to be the bounding box of the whole layer.
   * @returns {Sector[]} An array of [sectors]{@link Sector} making up the given bounding box.
   */
  OSMBuildingLayer.prototype.createSectors = function(boundingBox) {
    var sectorSize = 0.01;
    var decimalCount = 5; // Can be derived from the coordinates.
    var sectors = [];
    var sectorsOnXCount = Math.ceil((boundingBox[2]-boundingBox[0]).toFixed(decimalCount)/sectorSize);
    var sectorsOnYCount = Math.ceil((boundingBox[3]-boundingBox[1]).toFixed(decimalCount)/sectorSize);

    for (var indexY = 0; indexY < sectorsOnYCount; indexY++) {
      for (var indexX = 0; indexX < sectorsOnXCount; indexX++) {
        var x1 = (boundingBox[0]+sectorSize*indexX).toFixed(decimalCount);

        if (indexX+1 == sectorsOnXCount)
          var x2 = boundingBox[2].toFixed(decimalCount);
        else
          var x2 = (boundingBox[0]+sectorSize*(indexX+1)).toFixed(decimalCount);

        var y1 = (boundingBox[1]+sectorSize*indexY).toFixed(decimalCount);

        if (indexY+1 == sectorsOnYCount)
          var y2 = boundingBox[3].toFixed(decimalCount);
        else
        var y2 = (boundingBox[1]+sectorSize*(indexY+1)).toFixed(decimalCount);

        sectors.push(new Sector(y1, y2, x1, x2));
      }
    }

    return sectors;
  };

  /**
   * Checks if a given bounding box is visible.
   * @param {Sector} sector A {@link Sector} of the OSMBuildingLayer.
   * @returns {boolean} True if the sector intersects the frustum, otherwise false.
   */
  OSMBuildingLayer.prototype.intersectsVisible = function(sector) {
    var boundingBox = new BoundingBox();
    boundingBox.setToSector(sector, this._worldWindow.drawContext.globe, 0, 15); // Maximum elevation 15 should be changed.

    return boundingBox.intersectsFrustum(this._worldWindow.drawContext.navigatorState.frustumInModelCoordinates);
  };

  /**
   * Caches the features of the {@link OSMBuildingLayer}. The features' geometry is cached in the layer's "_geometryCache" member variable, properties are cached in the layer's "_propertiesCache" member variable.
   * @param {Object} dataOverpassGeoJSON GeoJSON object to be cached.
   */
  OSMBuildingLayer.prototype.cache = function(dataOverpassGeoJSON) {
    for (var featureIndex = 0; featureIndex < dataOverpassGeoJSON.features.length; featureIndex++) {
      this._geometryCache.putEntry(dataOverpassGeoJSON.features[featureIndex].id, dataOverpassGeoJSON.features[featureIndex].geometry, Object.keys(dataOverpassGeoJSON.features[featureIndex].geometry).length);
      this._propertiesCache.putEntry(dataOverpassGeoJSON.features[featureIndex].id, dataOverpassGeoJSON.features[featureIndex].properties, Object.keys(dataOverpassGeoJSON.features[featureIndex].properties).length);
    }
  };

  /**
   *
   * @param
   * @param
   */
  /* OSMBuildingLayer.prototype.cache = function(id, dataOverpassGeoJSON) {
    // console.log(id + ", " + dataOverpassGeoJSON);
    if(dataOverpassGeoJSON.features.length > 0)
      this._cache.putEntry(id, dataOverpassGeoJSON, dataOverpassGeoJSON.features.length);
    // console.log(this._cache);
  }; */

  /**
   * Sets the attributes of {@link ShapeAttributes} and four more attributes defined specifically for OSMBuildingLayer, which are "extrude", "heatmap", "altitude" and "altitudeMode".
   * @param {GeoJSONGeometry} geometry An object containing the geometry of the OSM data in GeoJSON format for the OSMBuildingLayer.
   * @returns {Object} An object with the attributes {@link ShapeAttributes} and four more attributes, which are "extrude", "heatmap", "altitude" and "altitudeMode", where all of them are defined in the configuration of the OSMBuildingLayer.
   */
  OSMBuildingLayer.prototype.shapeConfigurationCallback = function (geometry) {
    var configuration = OSMLayer.prototype.shapeConfigurationCallback.call(this, geometry);

    configuration.extrude = this._configuration.extrude ? this._configuration.extrude : false;
    configuration.heatmap = this._configuration.heatmap ? this._configuration.heatmap : false;
    if (configuration.heatmap) {
      configuration.heatmap.enabled = this._configuration.heatmap.enabled ? this._configuration.heatmap.enabled : false;
      configuration.heatmap.thresholds = this._configuration.heatmap.thresholds ? this._configuration.heatmap.thresholds : [0, 15, 900];
    }
    configuration.altitude = this._configuration.altitude ? this._configuration.altitude : null;
    if (configuration.altitude) {
      configuration.altitude.type = this._configuration.altitude.type ? this._configuration.altitude.type : "number";
      configuration.altitude.value = this._configuration.altitude.value ? this._configuration.altitude.value : 15;
    }
    configuration.altitudeMode = this._configuration.altitudeMode ? this._configuration.altitudeMode : WorldWind.RELATIVE_TO_GROUND;

    return configuration;
  };

  /**
   * Calls [addByBoundingBox]{@link OSMBuildingLayer#addByBoundingBox} if the "type" of the layer's "_source" member variable is "boundingBox" and the "coordinates" of the layer's "_source" member variable is defined.
   * Calls [addByGeoJSONFile]{@link OSMBuildingLayer#addByGeoJSONFile} if the "type" of the layer's "_source" member variable is "GeoJSONFile" and the "path" of the layer's "_source" member variable is defined.
   * @throws {ArgumentError} If the source definition is wrong.
   */
  OSMBuildingLayer.prototype.add = function () {
    if (this._source.type == "boundingBox" && this._source.coordinates)
      this.addByBoundingBox();
    /* if (this._source.type == "boundingBox" && this._source.coordinates) {
      this.boundingBox = this._source.coordinates;
      this.zoom(); // temporary
      var sectors = this.createSectors(this.boundingBox);
      for (var sectorIndex = 0; sectorIndex < sectors.length; sectorIndex++){
        if (this.intersectsVisible(sectors[sectorIndex]))
          this.addBySector(sectors[sectorIndex]);
      }
    } */
    else if (this._source.type == "GeoJSONFile" && this._source.path)
      this.addByGeoJSONFile();
    else {
      throw new ArgumentError(
        Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "add", "The source definition of the layer is wrong.")
      );
    }
  };

  /**
   *
   */
  OSMBuildingLayer.prototype.addBySector = function (sector) {

    var worldWindow = this._worldWindow;
    var _self = this;

    var data = '[out:json][timeout:25];';
    data += '(' + this._type + '[' + this._tag + '](' + sector.minLatitude + ',' + sector.minLongitude + ',' + sector.maxLatitude + ',' + sector.maxLongitude + '); ';
    data += 'relation[' + this._tag + '](' + sector.minLatitude + ',' + sector.minLongitude + ',' + sector.maxLatitude + ',' + sector.maxLongitude + ');); out body; >; out skel qt;';

    $.ajax({
      url: 'http://overpass-api.de/api/interpreter',
      data: data,
      type: 'POST',
      success: function(dataOverpass) {
        var dataOverpassGeoJSON = osmtogeojson(dataOverpass);
        _self.cache(sector.minLatitude + ',' + sector.minLongitude + ',' + sector.maxLatitude + ',' + sector.maxLongitude, dataOverpassGeoJSON);
        var dataOverpassGeoJSONString = JSON.stringify(dataOverpassGeoJSON);
        var OSMBuildingLayer = new WorldWind.RenderableLayer("OSMBuildingLayer");
        var OSMBuildingLayerGeoJSON = new GeoJSONParserTriangulationOSM(dataOverpassGeoJSONString);
        OSMBuildingLayerGeoJSON.load(null, _self.shapeConfigurationCallback.bind(_self), OSMBuildingLayer);
        worldWindow.addLayer(OSMBuildingLayer);
      },
      error: function(e) {
        throw new ArgumentError(
          Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "addBySector", "Request failed. Error: " + JSON.stringify(e))
        );
      }
    });
  };

  /**
   * Makes an AJAX request to fetch the OSM building data using the "coordinates" of the layer's "_source" member variable and Overpass API, converts it to GeoJSON using osmtogeojson API,
   * adds the GeoJSON to the {@link WorldWindow} using the {@link GeoJSONParserTriangulationOSM}.
   * It also sets the "boundingBox" member variable of the layer.
   * @throws {ArgumentError} If the "coordinates" of the layer's "_source" member variable doesn't have four values.
   * @throws {ArgumentError} If the request to OSM fails.
   */
  OSMBuildingLayer.prototype.addByBoundingBox = function () {

    if (this._source.coordinates.length != 4) {
      throw new ArgumentError(
        Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "addByBoundingBox", "The bounding box is invalid.")
      );
    }

    this.boundingBox = this._source.coordinates;
    var worldWindow = this._worldWindow;
    var _self = this;

    var data = '[out:json][timeout:25];';
    data += '(' + this._type + '[' + this._tag + '](' + this.boundingBox[1] + ',' + this.boundingBox[0] + ',' + this.boundingBox[3] + ',' + this.boundingBox[2] + '); ';
    data += 'relation[' + this._tag + '](' + this.boundingBox[1] + ',' + this.boundingBox[0] + ',' + this.boundingBox[3] + ',' + this.boundingBox[2] + ');); out body; >; out skel qt;';

    $.ajax({
      url: 'http://overpass-api.de/api/interpreter',
      data: data,
      type: 'POST',
      success: function(dataOverpass) {
        var dataOverpassGeoJSON = osmtogeojson(dataOverpass);
        _self.cache(dataOverpassGeoJSON);
        var dataOverpassGeoJSONString = JSON.stringify(dataOverpassGeoJSON);
        var OSMBuildingLayer = new WorldWind.RenderableLayer("OSMBuildingLayer");
        var OSMBuildingLayerGeoJSON = new GeoJSONParserTriangulationOSM(dataOverpassGeoJSONString);
        OSMBuildingLayerGeoJSON.load(null, _self.shapeConfigurationCallback.bind(_self), OSMBuildingLayer);
        worldWindow.addLayer(OSMBuildingLayer);
        _self.zoom(); // temporary
      },
      error: function(e) {
        throw new ArgumentError(
          Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "addByBoundingBox", "Request failed. Error: " + JSON.stringify(e))
        );
      }
    });
  };

  /**
   * Calculates the bounding box of a GeoJSON object, where its features are expected to be of type "Polygon" or "MultiPolygon".
   * It also sets the "boundingBox" member variable of the layer.
   * @param {Object} dataOverpassGeoJSON GeoJSON object of which the bounding box is calculated.
   */
  OSMBuildingLayer.prototype.calculateBoundingBox = function (dataGeoJSON) {
    var boundingBox = [Infinity, Infinity, -Infinity, -Infinity], polygons, coordinates, latitude, longitude;

    for (var featureIndex = 0; featureIndex < dataGeoJSON.features.length; featureIndex++) {
      polygons = dataGeoJSON.features[featureIndex].geometry.coordinates;

      for (var polygonsIndex = 0; polygonsIndex < polygons.length; polygonsIndex++) {
        for (var coordinatesIndex = 0; coordinatesIndex < polygons[polygonsIndex].length; coordinatesIndex++) {
          longitude = polygons[polygonsIndex][coordinatesIndex][0];
          latitude = polygons[polygonsIndex][coordinatesIndex][1];
          boundingBox[0] = boundingBox[0] < longitude ? boundingBox[0] : longitude; // minimum longitude (x1)
          boundingBox[1] = boundingBox[1] < latitude ? boundingBox[1] : latitude; // minimum latitude (y1)
          boundingBox[2] = boundingBox[2] > longitude ? boundingBox[2] : longitude; // maximum longitude (x2)
          boundingBox[3] = boundingBox[3] > latitude ? boundingBox[3] : latitude; // maximum latitude (y2)
        }
      }
    }
    this.boundingBox = boundingBox;
  };

  /**
   * Makes an AJAX request using the "path" of the layer's "_source" member variable to fetch the GeoJSON file, adds the GeoJSON to the {@link WorldWindow} using the {@link GeoJSONParserTriangulationOSM}.
   * It also sets the "boundingBox" member variable of the layer by calling [calculateBoundingBox]{@link OSMBuildingLayer#calculateBoundingBox}. // Not anymore, because for big files it would take time.
   * @throws {ArgumentError} If the data returned from the request is empty.
   * @throws {ArgumentError} If the request fails.
   */
  OSMBuildingLayer.prototype.addByGeoJSONFile = function () {
    var worldWindow = this._worldWindow;
    var _self = this;

    $.ajax({
      beforeSend: function(xhr) {
        if(xhr.overrideMimeType)
          xhr.overrideMimeType("application/json");
      },
      dataType: "json",
      url: this._source.path,
      success: function(data) {
        if (data.length == 0) {
          throw new ArgumentError(
            Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "addByGeoJSONFile", "File is empty.")
          );
        }
        // _self.calculateBoundingBox(data);
        var GeoJSONString = JSON.stringify(data);
        var OSMBuildingLayer = new WorldWind.RenderableLayer("OSMBuildingLayer");
        var OSMBuildingLayerGeoJSON = new GeoJSONParserTriangulationOSM(GeoJSONString);
        OSMBuildingLayerGeoJSON.load(null, _self.shapeConfigurationCallback.bind(_self), OSMBuildingLayer);
        worldWindow.addLayer(OSMBuildingLayer);
        // _self.zoom();
      },
      error: function(e) {
        throw new ArgumentError(
          Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "addByGeoJSONFile", "Request failed. Error: " + JSON.stringify(e))
        );
      }
    });
  };

  return OSMBuildingLayer;
});
