/**
 * @exports OSMBuildingLayer
 */
define(['libraries/WebWorldWind/src/error/ArgumentError',
        'libraries/WebWorldWind/src/util/Logger',
        'src/OSMLayer',
        'src/GeoJSONParserTriangulationOSM',
        'jquery',
        'osmtogeojson'],
       function (ArgumentError, Logger, OSMLayer, GeoJSONParserTriangulationOSM, $, osmtogeojson) {
  "use strict";

  /**
   * Creates a sublass of the {@link OSMLayer} class.
   * @alias OSMBuildingLayer
   * @constructor
   * @classdesc Fetches OSM buildings, converts them to GeoJSON, and adds them to the WorldWindow.
   * @param {WorldWindow} worldWindow The WorldWindow where the OSMBuildingLayer is added to.
   * @param {Object} configuration Configuration is used to set the attributes of {@link ShapeAttributes}. Four more attributes can be defined, which are "extrude", "heatmap", "altitude" and "altitudeMode".
   * @param {Object} source Defines the data source of the {@link OSMBuildingLayer}.
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
  };

  OSMBuildingLayer.prototype = Object.create(OSMLayer.prototype);

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
    else if (this._source.type == "GeoJSONFile" && this._source.path)
      this.addByGeoJSONFile();
    else {
      throw new ArgumentError(
        Logger.logMessage(Logger.LEVEL_SEVERE, "OSMBuildingLayer", "add", "The source definition of the layer is wrong.")
      );
    }
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
