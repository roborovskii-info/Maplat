define(["ol3"], function(ol) {
    // スマホタッチで中間ズームを許す
    ol.interaction.PinchZoom.handleUpEvent_ = function(mapBrowserEvent) {
        if (this.targetPointers.length < 2) {
            var map = mapBrowserEvent.map;
            var view = map.getView();
            view.setHint(ol.ViewHint.INTERACTING, -1);
            //var resolution = view.getResolution();
            // Zoom to final resolution, with an animation, and provide a
            // direction not to zoom out/in if user was pinching in/out.
            // Direction is > 0 if pinching out, and < 0 if pinching in.
            //var direction = this.lastScaleDelta_ - 1;
            //ol.interaction.Interaction.zoom(map, view, resolution,
            //    this.anchor_, this.duration_, direction);
            return false;
        } else {
            return true;
        }
    };

    ol.View.prototype.getDecimalZoom = function() {
        var offset;
        var resolution = this.getResolution();

        offset = Math.log(this.maxResolution_ / resolution) / Math.log(2);
        return offset !== undefined ? this.minZoom_ + offset : offset;
    };

    ol.control.GPSControl = function(opt_options) {

        var options = opt_options || {};

        var button = document.createElement('button');
        button.innerHTML = '⬇︎';

        var this_ = this;
        var handleGPS = function(e) {
            var geolocation = new ol.Geolocation({tracking:true});
            // listen to changes in position
            geolocation.once('change', function(evt) {
                var lnglat = geolocation.getPosition();
                geolocation.setTracking(false);
                var source = this_.getMap().getLayers().item(0).getSource();
                var view = this_.getMap().getView();
                var merc = ol.proj.transform(lnglat, "EPSG:4326", "EPSG:3857");
                source.merc2XyAsync(merc).then(function(xy){
                    view.setCenter(xy);
                });
            });
        };

        button.addEventListener('click', handleGPS, false);
        button.addEventListener('touchstart', handleGPS, false);

        var element = document.createElement('div');
        element.className = 'gps ol-unselectable ol-control';
        element.appendChild(button);

        ol.control.Control.call(this, {
            element: element,
            target: options.target
        });

    };
    ol.inherits(ol.control.GPSControl, ol.control.Control);

    ol.const = ol.const ? ol.const : {};
    ol.const.MERC_MAX = 20037508.342789244;

    ol.source.setCustomFunction = function(target) {
        target.prototype.getMap = function() {
            if (this._map) {
                return this._map;
            }

            this._map = new ol.Map({
                controls: ol.control.defaults().extend([
                    new ol.control.GPSControl()
                ]),
                layers: [
                    new ol.layer.Tile({
                        source: this
                    })
                ],
                target: this.map_option.div,
                view: new ol.View({
                    center: this.map_option.default_center || [0,0],
                    zoom: this.map_option.default_zoom || 2,
                    rotation: this.map_option.default_rotation || 0
                })
            });

            /*var self = this;
            this._map.on('click', function(evt) {
                var stringifyFunc = ol.coordinate.createStringXY(8);
                var coordinate = evt.coordinate;
                self.xy2MercAsync(coordinate).then(function(values){
                    var outstr = stringifyFunc(values);//ol.proj.transform(coordinate, "EPSG:3857", "EPSG:4326"));
                    console.log(outstr);
                    outstr = stringifyFunc(ol.proj.transform(values, "EPSG:3857", "EPSG:4326"));
                    console.log(outstr);
                    self.merc2XyAsync(values).then(function(values2){
                        var outstr = stringifyFunc(values2);
                        console.log(outstr);
                    });
                });
                var promise = self.size2MercsAsync(coordinate);
                promise.then(function(vals){
                    console.log("########");
                    console.log(vals);
                    promise2 = self.mercs2SizeAsync(vals);
                    promise2.then(function(vals2){
                        console.log("********");
                        console.log(vals2);  
                    });
                });


                var stringifyFunc = ol.coordinate.createStringXY(8);//initPrecision);
                var outstr = stringifyFunc(coordinate);//ol.proj.transform(coordinate, "EPSG:3857", "EPSG:4326"));
                console.log(outstr);
            });*/

            return this._map;
        };

        target.prototype.getRadius = function() {
            var size = this._map.getSize();
            console.log(size);
            var radius = Math.floor(Math.min(size[0],size[1]) / 4);
            var zoom = this._map.getView().getDecimalZoom();
            var ratio = radius * ol.const.MERC_MAX / 128 / Math.pow(2,zoom);
            console.log(zoom, ratio);
            return ratio;
        };

        target.prototype.rotateMatrix = function(xys) {
            var theta = 1.0 * this._map.getView().getRotation();
            var result = [];
            for (var i=0;i<xys.length;i++) {
                var xy = xys[i];
                var x = xy[0] * Math.cos(theta) - xy[1] * Math.sin(theta);
                var y = xy[0] * Math.sin(theta) + xy[1] * Math.cos(theta);
                result.push([x,y]);
            }
            return result;
        }

        target.prototype.size2Xys = function(center) {
            if (!center) {
                center = this._map.getView().getCenter();
            }
            var radius = this.getRadius();
            var crossMatrix = [
                [0.0,0.0],
                [0.0,radius],
                [radius,0.0],
                [0.0,-1.0 * radius],
                [-1.0 * radius,0.0]
            ];
            var crossDelta = this.rotateMatrix(crossMatrix);
            var cross = crossDelta.map(function(xy){
                return [xy[0]+center[0],xy[1]+center[1]];
            });
            return cross;
        };

        target.prototype.size2MercsAsync = function(center) {
            var cross = this.size2Xys(center);
            var self = this;
            var promises = cross.map(function(val) {
                return self.xy2MercAsync(val);
            });
            return Promise.all(promises);
        };

        target.prototype.mercs2SizeAsync = function(mercs) {
            var self = this;
            var promises = mercs.map(function(merc) {
                return self.merc2XyAsync(merc);
            });
            return Promise.all(promises).then(function(xys){
                var size = self.xys2Size(xys);
                return size;
            });
        };

        target.prototype.xys2Size = function(xys) {
            var center = xys[0];
            var nesw = xys.slice(1);
            var neswDelta = nesw.map(function(val){
                return [val[0] - center[0],val[1] - center[1]];
            });
            var normal = [[0.0,1.0],[1.0,0.0],[0.0,-1.0],[-1.0,0.0]];
            var abss = 0;
            var cosx = 0;
            var sinx = 0;
            for (var i = 0; i < 4; i++) {
                var delta = neswDelta[i];
                var norm  = normal[i];
                var abs   = Math.sqrt(Math.pow(delta[0], 2) + Math.pow(delta[1], 2));
                abss     += abs;
                var outer = delta[0] * norm[1] - delta[1] * norm[0];
                var inner = Math.acos((delta[0] * norm[0] + delta[1] * norm[1]) / abs);
                var theta = outer > 0.0 ? -1.0 * inner : inner;
                cosx     += Math.cos(theta);
                sinx     += Math.sin(theta);
            }
            var scale = abss / 4.0;
            var omega = Math.atan2(sinx, cosx);

            var size = this._map.getSize();
            var radius = Math.floor(Math.min(size[0],size[1]) / 4);
            var zoom = Math.log(radius * ol.const.MERC_MAX / 128 / scale) / Math.log(2);

            return [center,zoom,omega];
        }
    };
    ol.source.setCustomInitialize = function(self, options) {
        self.map_option = options.map_option || {};
    }

    ol.source.nowMap = function(opt_options) {
        var options = opt_options || {};
        ol.source.OSM.call(this, options);
        ol.source.setCustomInitialize(this, options);
    };
    ol.inherits(ol.source.nowMap, ol.source.OSM);
    ol.source.nowMap.createAsync = function(options) {
        var promise = new Promise(function(resolve, reject) {
            var obj = new ol.source.nowMap(options);
            resolve(obj);
        });
        return promise;
    };
    ol.source.setCustomFunction(ol.source.nowMap);
    ol.source.nowMap.prototype.xy2MercAsync = function(xy) {
        var promise = new Promise(function(resolve, reject) {
            resolve(xy);    
        });
        return promise;        
    };
    ol.source.nowMap.prototype.merc2XyAsync = function(merc) {
        var promise = new Promise(function(resolve, reject) {
            resolve(merc);            
        });
        return promise;
    };

    return ol;
});