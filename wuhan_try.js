Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjNjQ2MWNlYS1mOWI4LTQ1MWMtYWFmYi0yMmU1NjhmMTc1MWIiLCJpZCI6NzYwMjYsImlhdCI6MTYzOTA1NzczNH0.mBGBG9J2ZrDWeL32_4Nqru2Sj7RRELfMNThb0GmVDSQ";
var viewer = new Cesium.Viewer("cesiumContainer");
//隐藏版权信息
viewer._cesiumWidget._creditContainer.style.display = "none";
viewer.scene.debugShowFramesPerSecond = true;
viewer.baseLayerPicker = true;
viewer.imageryProvider = Cesium.createWorldImagery({
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
});
if (Cesium.FeatureDetection.supportsImageRenderingPixelated()) {
    //判断是否支持图像渲染像素化处理
    viewer.resolutionScale = window.devicePixelRatio;
}
//开启抗锯齿
viewer.scene.fxaa = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
//如果广告牌、折线、标签等基元应针对地形表面进行深度测试，则为 true;如果此类基元应始终绘制在地形顶部，则为 false，除非它们位于地球的另一侧。针对地形进行深度测试基元的缺点是，切换轻微的数值噪声或地形细节层次有时会使应该在表面上的基元在其下方消失。
viewer.scene.globe.depthTestAgainstTerrain = true;

// 启用基于太阳/月亮位置的照明
// viewer.scene.globe.enableLighting = true;
//双图层
// var layers = viewer.scene.imageryLayers;
// //注意要在网页中添加
// var blackMarble = layers.addImageryProvider(new Cesium.IonImageryProvider({
//     assetId: 3812
// }));
//初始化camera view
// 将三维球定位到中国
ini_camera_view("china");
var options_for_mouseclick = { "lakuangxuanqu": 0, "dianjihuaxian": 0 }
var inspectorViewModel;
var osmBuildings;
var wuhan_Regional_geojson;
var wuhan_Regional_kml;
var dronePromise;
var jump_to_wuhan = document.getElementById("jump_to_wuhan");
jump_to_wuhan.addEventListener(
    "click",
    function (event) {
        var select_posi = document.getElementById("select_position");
        var index = select_posi.selectedIndex;
        var posi = select_posi.options[index].value;
        ini_camera_view(posi);
    },
    false
);

//数据加载
int_building_3dtiles();
var kmlOptions = {
    camera: viewer.scene.camera,
    canvas: viewer.scene.canvas,
    clampToGround: true,
};
wuhan_Regional_kml = Cesium.KmlDataSource.load(
    "source/wuhan_bound.kml",
    kmlOptions
);
int_wuhan_Regional_boundary();
move_show_labels();
dram_path_czml();

//图层管理
Layer_management();
terrain_management();
var update_entity = document.getElementById("update_entity"); //字符串!!!
update_entity.addEventListener(
    "click",
    function (event) {
        entity_management();
        Primitives_management();
    },
    false
);

//勾选菜单
elevation_and_grid();
other_func();
click_for_drawline_func();
right_click_for_draw_rect();

//其他设置
//不弹出浏览器菜单
document.oncontextmenu = function () {
    return false;
};
function elevation_and_grid() {
    var viewModel = {
        la_lo_grid: false,
        elevation_show_open: false,
        elevationRamp_show_open: false,
        shading_show_open: false,
    };
    Cesium.knockout.track(viewModel);
    //3.激活属性,将viewModel对象与html控件绑定

    var elevation_and_grid_check_id = document.getElementById(
        "elevation_and_grid_check_id"
    );
    Cesium.knockout.applyBindings(viewModel, elevation_and_grid_check_id); // 绑定监控

    //4.监听控件值的变化
    var canvas = viewer.scene.canvas;
    var moverlatlng_show = new Cesium.ScreenSpaceEventHandler(canvas);
    subscribeLayerParameter("la_lo_grid");
    subscribeLayerParameter("elevation_show_open");
    subscribeLayerParameter("elevationRamp_show_open");
    subscribeLayerParameter("shading_show_open");
    var old_material = viewer.scene.globe.material;
    //添加色表
    var elevationRamp = [0.0, 0.045, 0.1, 0.15, 0.37, 0.54, 1.0];
    var slopeRamp = [0.0, 0.29, 0.5, Math.sqrt(2) / 2, 0.87, 0.91, 1.0];

    function getColorRamp(selectedShading) {
        var ramp = document.createElement("canvas");
        ramp.width = 100;
        ramp.height = 1;
        var ctx = ramp.getContext("2d");
        var values = [];
        // var values = selectedShading == 'elevation' ? elevationRamp : slopeRamp;
        if (selectedShading == "elevation") {
            values = elevationRamp;
        } else {
            values = slopeRamp;
        }
        var grd = ctx.createLinearGradient(0, 0, 100, 0);
        grd.addColorStop(values[0], "#000000"); //black
        grd.addColorStop(values[1], "#2747E0"); //blue
        grd.addColorStop(values[2], "#D33B7D"); //pink
        grd.addColorStop(values[3], "#D33038"); //red
        grd.addColorStop(values[4], "#FF9742"); //orange
        grd.addColorStop(values[5], "#ffd700"); //yellow
        grd.addColorStop(values[6], "#ffffff"); //white
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 100, 1);

        return ramp;
    }

    function subscribeLayerParameter(name) {
        //监听控件的变化事件：
        Cesium.knockout
            .getObservable(viewModel, name)
            .subscribe(function (newValue) {
                //name如‘saturation’的value值改变后得到newvalue
                //会赋值给imagelayer的相应属性，如赋给图层的layer[saturation]新值
                if (name == "elevation_show_open") {
                    if (newValue == true) {
                        //生成等高线
                        var contourUniforms = {};
                        var material = Cesium.Material.fromType("ElevationContour"); //这是一个等高线类型的材质,uniforms是glsl着色器语言中的变量
                        contourUniforms = material.uniforms;
                        contourUniforms.width = 1;
                        contourUniforms.spacing = 500;
                        contourUniforms.color = Cesium.Color.RED;
                        viewer.scene.globe.material = material;
                    } else {
                        viewer.scene.globe.material = old_material;
                    }
                }
                if (name == "elevationRamp_show_open") {
                    if (newValue == true) {
                        //生成等高线
                        var contourUniforms = {};

                        // //高程设色
                        var shadingUniforms = {};
                        var material = Cesium.Material.fromType("ElevationRamp");
                        shadingUniforms = material.uniforms;
                        shadingUniforms.minHeight = -414.0;
                        shadingUniforms.maxHeight = 8777;
                        selectedShading = "elevation";

                        shadingUniforms.image = getColorRamp(selectedShading);
                        viewer.scene.globe.material = material;
                    } else {
                        viewer.scene.globe.material = old_material;
                    }
                }
                if (name == "shading_show_open") {
                    if (newValue == true) {
                        //生成等高线
                        var contourUniforms = {};
                        // //坡度设色
                        var shadingUniforms = {};
                        var material = Cesium.Material.fromType("SlopeRamp");
                        shadingUniforms = material.uniforms;
                        selectedShading = "slopeRamp";

                        shadingUniforms.image = getColorRamp(selectedShading);
                        viewer.scene.globe.material = material;
                    } else {
                        viewer.scene.globe.material = old_material;
                    }
                }
            });
    }
}

function other_func() {
    //显示经纬度
    var viewModel = {
        right_BOX: false,
        latlng_show_open: false,
        left_chick_drawline_open: false
    };
    Cesium.knockout.track(viewModel);
    //3.激活属性,将viewModel对象与html控件绑定

    var otherfunc_check_id = document.getElementById("otherfunc_check_id");
    Cesium.knockout.applyBindings(viewModel, otherfunc_check_id); // 绑定监控

    //4.监听控件值的变化
    var canvas = viewer.scene.canvas;
    var moverlatlng_show = new Cesium.ScreenSpaceEventHandler(canvas);
    subscribeLayerParameter("latlng_show_open");
    subscribeLayerParameter("right_BOX");
    subscribeLayerParameter("left_chick_drawline_open");

    function subscribeLayerParameter(name) {
        //监听控件的变化事件：
        Cesium.knockout
            .getObservable(viewModel, name)
            .subscribe(function (newValue) {
                //name如‘saturation’的value值改变后得到newvalue
                //会赋值给imagelayer的相应属性，如赋给图层的layer[saturation]新值
                if (name == "latlng_show_open") {
                    if ((newValue = true)) {
                        var longitude_show = document.getElementById("longitude_show");
                        var latitude_show = document.getElementById("latitude_show");
                        var altitude_show = document.getElementById("altitude_show");
                        //具体事件的实现
                        var ellipsoid = viewer.scene.globe.ellipsoid;
                        moverlatlng_show.setInputAction(function (movement) {
                            //捕获椭球体，将笛卡尔二维平面坐标转为椭球体的笛卡尔三维坐标，返回球体表面的点
                            var cartesian = viewer.camera.pickEllipsoid(
                                movement.endPosition,
                                ellipsoid
                            );
                            if (cartesian) {
                                //将笛卡尔三维坐标转为地图坐标（弧度）
                                var cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(
                                    cartesian
                                );
                                //将地图坐标（弧度）转为十进制的度数
                                var lat_String = Cesium.Math.toDegrees(
                                    cartographic.latitude
                                ).toFixed(4);
                                var log_String = Cesium.Math.toDegrees(
                                    cartographic.longitude
                                ).toFixed(4);
                                var alti_String = (
                                    viewer.camera.positionCartographic.height / 1000
                                ).toFixed(2);
                                longitude_show.innerHTML = log_String;
                                latitude_show.innerHTML = lat_String;
                                altitude_show.innerHTML = alti_String;
                            }
                        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
                    } else {
                        moverlatlng_show.removeInputAction(
                            Cesium.ScreenSpaceEventType.MOUSE_MOVE
                        );
                    }
                } else if (name == "right_BOX") {
                    if (newValue == true) {
                        //cesium默认右键为放大缩小，此处给zoomEventTypes设置新值
                        viewer.scene.screenSpaceCameraController.zoomEventTypes = [
                            Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
                        ];
                        //earthsdk默认右键为改变视角，此处禁止。
                        viewer.scene.screenSpaceCameraController.lookEventTypes = [];
                        options_for_mouseclick["lakuangxuanqu"] = 1;
                    } else {
                        options_for_mouseclick["lakuangxuanqu"] = 0;
                    }
                }
                if (name == "left_chick_drawline_open") {
                    if (newValue == true) {
                        options_for_mouseclick["dianjihuaxian"] = 1;
                    } else if (newValue == false) {
                        options_for_mouseclick["dianjihuaxian"] = 0;
                    }
                }
            });
    }
}

function Layer_management() {
    var imageryLayers = viewer.imageryLayers;
    // var subdomains = ['0', '1', '2', '3', '4', '5', '6', '7'];
    // var tiandituTk = "748b96108d97cab94d22fb77cba673e9";

    var viewModel = {
        layers: [],
        baseLayers: [],
        upLayer: null,
        downLayer: null,
        selectedLayer: null,
        isSelectableLayer: function (layer) {
            return this.baseLayers.indexOf(layer) >= 0;
        },
        raise: function (layer, index) {
            imageryLayers.raise(layer);
            viewModel.upLayer = layer;
            viewModel.downLayer = viewModel.layers[Math.max(0, index - 1)];
            updateLayerList();
            window.setTimeout(function () {
                viewModel.upLayer = viewModel.downLayer = null;
            }, 10);
        },
        lower: function (layer, index) {
            imageryLayers.lower(layer);
            viewModel.upLayer =
                viewModel.layers[Math.min(viewModel.layers.length - 1, index + 1)];
            viewModel.downLayer = layer;
            updateLayerList();
            window.setTimeout(function () {
                viewModel.upLayer = viewModel.downLayer = null;
            }, 10);
        },
        canRaise: function (layerIndex) {
            return layerIndex > 0;
        },
        canLower: function (layerIndex) {
            return layerIndex >= 0 && layerIndex < imageryLayers.length - 1;
        },
    };
    var baseLayers = viewModel.baseLayers;

    Cesium.knockout.track(viewModel);

    function setupLayers() {
        //创建本示例支持的所有基础层。
        //这些基础层其实并不特别。也有可能有多个
        //启用一次，就像其他层，但它没有太多意义，因为
        //所有这些层覆盖整个地球，是不透明的。
        addBaseLayerOption("Bing Maps Aerial", undefined); // the current base layer
        addBaseLayerOption(
            "Bing Maps Road",
            Cesium.createWorldImagery({
                style: Cesium.IonWorldImageryStyle.ROAD,
            })
        );
        // addAdditionalLayerOption(
        //     "深色底图",
        //     new Cesium.ArcGisMapServerImageryProvider({
        //         url: "https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineStreetPurplishBlue/MapServer",
        //     }), 1.0, false
        // );
        // addBaseLayerOption(
        //     "夜间图",
        //     new Cesium.OpenStreetMapImageryProvider()
        // );

        // Create the additional layers

        addAdditionalLayerOption(
            "高德影像底图",
            new Cesium.AmapImageryProvider({
                style: "img", // style: img、elec、cva
                crs: "WGS84", // 使用84坐标系，默认为：GCJ02
            }),
            1.0,
            false
        );
        addAdditionalLayerOption(
            "天地图影像底图",
            new Cesium.TdtImageryProvider({
                style: "vec", //style: vec、cva、img、cia、ter
                key: "b3684b4c7a17c3ef86233c88fce86177",
            }),
            1.0,
            false
        );
        addAdditionalLayerOption(
            "天地图影像标注",
            new Cesium.WebMapTileServiceImageryProvider({
                //影像注记
                url:
                    "http://t0.tianditu.com/cia_w/wmts?service=wmts&request=GetTile&version=1.0.0" +
                    "&LAYER=cia&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles" +
                    "&tk=b3684b4c7a17c3ef86233c88fce86177",
                layer: "tdtCiaLayer",
                // subdomains: subdomains,
                style: "default",
                format: "image/jpeg",
            }),
            1.0,
            false
        );
        addAdditionalLayerOption(
            "百度黑夜影像",
            new Cesium.BaiduImageryProvider({
                style: "dark", // style: img、vec、normal、dark
                crs: "WGS84", // 使用84坐标系，默认为：BD09
            }),
            1.0,
            false
        );
        // addAdditionalLayerOption(
        //     "TileMapService Image",
        //     new Cesium.TileMapServiceImageryProvider({
        //         url: "../images/cesium_maptiler/Cesium_Logo_Color",
        //     }),
        //     0.2
        // );
        // addAdditionalLayerOption(
        //     "Single Image",
        //     new Cesium.SingleTileImageryProvider({
        //         url: "../images/Cesium_Logo_overlay.png",
        //         rectangle: Cesium.Rectangle.fromDegrees(-115.0,
        //             38.0, -107,
        //             39.75
        //         ),
        //     }),
        //     1.0
        // );
        addAdditionalLayerOption(
            "网格",
            new Cesium.GridImageryProvider(),
            1.0,
            false
        );
        addAdditionalLayerOption(
            "瓦片坐标",
            new Cesium.TileCoordinatesImageryProvider(),
            1.0,
            false
        );
    }

    function addBaseLayerOption(name, imageryProvider) {
        var layer;
        if (typeof imageryProvider === "undefined") {
            layer = imageryLayers.get(0);
            viewModel.selectedLayer = layer;
        } else {
            layer = new Cesium.ImageryLayer(imageryProvider);
        }
        layer.name = name;
        baseLayers.push(layer);
    }

    function addAdditionalLayerOption(name, imageryProvider, alpha, show) {
        var layer = imageryLayers.addImageryProvider(imageryProvider);
        layer.alpha = Cesium.defaultValue(alpha, 0.5);
        layer.show = Cesium.defaultValue(show, true);
        layer.name = name;
        Cesium.knockout.track(layer, ["alpha", "show", "name"]);
    }

    function updateLayerList() {
        var numLayers = imageryLayers.length;
        viewModel.layers.splice(0, viewModel.layers.length);
        for (var i = numLayers - 1; i >= 0; --i) {
            viewModel.layers.push(imageryLayers.get(i));
        }
    }

    setupLayers();
    updateLayerList();

    //Bind the viewModel to the DOM elements of the UI that call for it.
    var toolbar = document.getElementById("toolbar");
    Cesium.knockout.applyBindings(viewModel, toolbar);

    Cesium.knockout
        .getObservable(viewModel, "selectedLayer")
        .subscribe(function (baseLayer) {
            // Handle changes to the drop-down base layer selector.
            var activeLayerIndex = 0;
            var numLayers = viewModel.layers.length;
            for (var i = 0; i < numLayers; ++i) {
                if (viewModel.isSelectableLayer(viewModel.layers[i])) {
                    activeLayerIndex = i;
                    break;
                }
            }
            var activeLayer = viewModel.layers[activeLayerIndex];
            var show = activeLayer.show;
            var alpha = activeLayer.alpha;
            imageryLayers.remove(activeLayer, false);
            imageryLayers.add(baseLayer, numLayers - activeLayerIndex - 1);
            baseLayer.show = show;
            baseLayer.alpha = alpha;
            updateLayerList();
        });
}

function terrain_management() {
    viewer.terrainProvider = Cesium.createWorldTerrain({
        requestVertexNormals: true, //Needed to visualize slope
        requestWaterMask: true,
    });
    var viewModel = {
        default_terrain: true,
        default_terrain_name: "default_terrain",
    };
    //	监测viewModel中的属性
    Cesium.knockout.track(viewModel);
    //3.激活属性,将viewModel对象与html控件绑定

    var toolbar_Terrain = document.getElementById("toolbar_Terrain");
    Cesium.knockout.applyBindings(viewModel, toolbar_Terrain); // 绑定监控

    //4.监听控件值的变化
    function subscribeLayerParameter(name) {
        //监听控件的变化事件：
        Cesium.knockout
            .getObservable(viewModel, name)
            .subscribe(function (newValue) {
                //name如‘saturation’的value值改变后得到newvalue
                //会赋值给imagelayer的相应属性，如赋给图层的layer[saturation]新值

                if (newValue == false) {
                    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                } else {
                    viewer.terrainProvider = Cesium.createWorldTerrain({
                        requestVertexNormals: true, //Needed to visualize slope
                        requestWaterMask: true,
                    });
                }
            });
    }
    subscribeLayerParameter("default_terrain");
}

function entity_management() {
    // var layers = viewer.entities.values;

    var layers = viewer.dataSources;
    layers.dataSourceAdded.addEventListener(updateLayer);
    layers.dataSourceMoved.addEventListener(updateLayer);
    layers.dataSourceRemoved.addEventListener(updateLayer);

    // var layers = viewer.dataSources;

    var count = layers.length;
    var entityLayers = [];
    entityLayers.splice(0, entityLayers.length);
    //找到所有实体
    for (var i = count - 1; i >= 0; --i) {
        var layer = layers.get(i);
        !layer.name && (layer.name = "[未命名]");
        layer.name = layer.name.replace(/^(.*[\/\\])?(.*)*(\.[^.?]*.*)$/, "$2");
        // layer.show = Cesium.defaultValue(show, true);
        layer.show = true;
        entityLayers.push(layer);
    }
    updateLayer();

    function updateLayer() {
        //创建HTML标签
        // var toolbar_entity = document.createElement("toolbar_entity");
        // var tr = document.createElement("tr");
        // var td1 = document.createElement("td");
        // var td2 = document.createElement("td");
        // var input_check = document.createElement("input");
        // input_check.setAttribute("type", "checkbox");
        // input_check.setAttribute("data-bind", "checked: wuhan_bian");
        // td2.appendChild(input_check)
        // tr.appendChild(td2)
        // toolbar_entity.appendChild(tr);
        var dic_view = { wuhan_bian: 0, xiaoche: 1 };
        var viewModel = {
            wuhan_bian: true,
            wuhan_bian_name: entityLayers[0].name,
            xiaoche: true,
            xiaoche_name: entityLayers[1].name,
            // { show: 'true', name: 'wuhanxingzheng' }
        };
        //	监测viewModel中的属性
        Cesium.knockout.track(viewModel);
        //3.激活属性,将viewModel对象与html控件绑定

        var toolbar_entity = document.getElementById("toolbar_entity");
        Cesium.knockout.applyBindings(viewModel, toolbar_entity); // 绑定监控

        //4.监听控件值的变化
        function subscribeLayerParameter(name) {
            //监听控件的变化事件：
            Cesium.knockout
                .getObservable(viewModel, name)
                .subscribe(function (newValue) {
                    //name如‘saturation’的value值改变后得到newvalue
                    //会赋值给imagelayer的相应属性，如赋给图层的layer[saturation]新值
                    var num = dic_view[name];
                    if (newValue == false) {
                        entityLayers[num].show = false;
                    } else {
                        entityLayers[num].show = true;
                    }
                });
        }
        subscribeLayerParameter("wuhan_bian");
        subscribeLayerParameter("xiaoche");
    }
}

function Primitives_management() {
    var layers = viewer.scene.primitives;
    var primitivesLayers = [];
    var count = layers.length;
    primitivesLayers.splice(0, primitivesLayers.length);
    //找到所有实体
    for (var i = count - 1; i >= 0; --i) {
        var layer = layers.get(i);
        if (!(layer instanceof Cesium.Cesium3DTileset)) continue;
        // !layer.name && (layer.name = "[未命名]");
        // layer.name = layer.name.replace(/^(.*[\/\\])?(.*)*(\.[^.?]*.*)$/, "$2");
        // layer.show = Cesium.defaultValue(show, true);
        // layer.show = true;
        primitivesLayers.push(layer);
    }
    var dic_view = { OSMbuilding: 0, Wuhanbuilding: 1 };
    var viewModel = {
        OSMbuilding: true,
        OSMbuilding_name: primitivesLayers[0].name,
        Wuhanbuilding: true,
        Wuhanbuilding_name: primitivesLayers[1].name,
        // { show: 'true', name: 'wuhanxingzheng' }
    };
    //	监测viewModel中的属性
    Cesium.knockout.track(viewModel);
    //3.激活属性,将viewModel对象与html控件绑定

    var toolbar_Primitives = document.getElementById("toolbar_Primitives");
    Cesium.knockout.applyBindings(viewModel, toolbar_Primitives); // 绑定监控

    //4.监听控件值的变化
    function subscribeLayerParameter(name) {
        //监听控件的变化事件：
        Cesium.knockout
            .getObservable(viewModel, name)
            .subscribe(function (newValue) {
                //name如‘saturation’的value值改变后得到newvalue
                //会赋值给imagelayer的相应属性，如赋给图层的layer[saturation]新值
                var num = dic_view[name];
                if (newValue == false) {
                    primitivesLayers[num].show = false;
                } else {
                    primitivesLayers[num].show = true;
                }
            });
    }
    subscribeLayerParameter("OSMbuilding");
    subscribeLayerParameter("Wuhanbuilding");
}

function int_building_3dtiles() {
    //添加武汉建筑轮廓
    // 添加3DTilesInspector
    // viewer.extend(Cesium.viewerCesium3DTilesInspectorMixin);
    // inspectorViewModel = viewer.cesium3DTilesInspector.viewModel;

    //添加3d tiles（ OSM）
    //Add Cesium OSM buildings to the scene as our example 3 D Tileset.
    osmBuildings = Cesium.createOsmBuildings();
    osmBuildings.style = new Cesium.Cesium3DTileStyle({
        color: "color('white', 0.3)",
        show: true,
        // color: {
        //     conditions: [
        //         // ["${cesium# estimatedHeight } >= 100 ", " rgba(45, 0, 75, 0.5)"]
        //         ["true", "rgb(127, 59, 8)"]
        //     ],
        // },
    });
    var heightOffset = 32; //负数会向天上
    osmBuildings.readyPromise.then(function (tileset) {
        // Position tileset
        var boundingSphere = tileset.boundingSphere;
        var cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        var surface = Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            0.0
        );
        var offset = Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            heightOffset
        );
        var translation = Cesium.Cartesian3.subtract(
            offset,
            surface,
            new Cesium.Cartesian3()
        );
        tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
    });
    var temp = viewer.scene.primitives.add(osmBuildings, { clamptoGround: true });
    temp.name = "osmBuildings";
    var wuhan_tileset = new Cesium.Cesium3DTileset({
        url: "3dtile_wuhan/tileset.json",
        //根据高度设定不同的颜色
        color: {
            conditions: [
                ["${height} >= 300", "rgba(45, 0, 75, 0.5)"],
                ["${height} >= 200", "rgb(102, 71, 151)"],
                ["${height} >= 100", "rgb(170, 162, 204)"],
                ["${height} >= 50", "rgb(224, 226, 238)"],
                ["${height} >= 25", "rgb(252, 230, 200)"],
                ["${height} >= 10", "rgb(248, 176, 87)"],
                ["${height} >= 5", "rgb(198, 106, 11)"],
                ["true", "rgb(127, 59, 8)"],
            ],
        },
        show: true,
    });

    temp = viewer.scene.primitives.add(wuhan_tileset);
    temp.name = "武汉三维瓦片数据";
}

function int_wuhan_Regional_boundary() {
    //武汉区划地理边界矢量
    // wuhan_Regional_geojson = Cesium.GeoJsonDataSource.load("source/wuhan_bound.geojson", { clampToGround: true })
    var neighborhoods; //

    // wuhan_Regional_geojson.then(function(dataSource) {
    wuhan_Regional_kml.then(function (dataSource) {
        dataSource.name = "武汉区划图";
        viewer.dataSources.add(dataSource);
        neighborhoods = dataSource.entities;

        var entities = dataSource.entities.values;
        var colorHash = {};

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (Cesium.defined(entity.polygon)) {
                // entity.polygon.material = Cesium.Color.RED;
                // entity.polygon.extrudedHeight = 100;
                entity.polygon.material = Cesium.Color.fromRandom({
                    Red: 1.0,
                    minimumGreen: 137 / 255,
                    minimumBlue: 0.5,
                    alpha: 0.6,
                });
                // var material_temp = getColorRamp("rgba(255, 137, 125, 20)", "rgba(255, 137, 125, 0)")
                // entity.polygon.material = material_temp;
                // entity.polygon.fill = false;
                entity.polygon.outline = null;

                //由于宽度不起作用将多边形转换为带轮廓的折线
                // entity.polyline = new Cesium.PolylineGraphics();
                // entity.polyline.positions = entity.polygon.hierarchy.getValue().positions;
                // entity.polygon = undefined;

                // entity.polyline.width = 3;
                // entity.polyline.material = new Cesium.PolylineOutlineMaterialProperty({
                //     color: Cesium.Color.WHITE,
                //     outlineWidth: 10,
                //     outlineColor: Cesium.Color.BLUE
                // });

                //// Tells the polygon to color the terrain. ClassificationType.CESIUM_3D_TILE will color the 3D tileset, and ClassificationType.BOTH will color both the 3d tiles and terrain (BOTH is the default)
                // entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
            }

            // entity.polygon.extrudedHeight = 10;
        }
    });
    var last_picked = 0;
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
        var pick = viewer.scene.pick(e.position);
        if (Cesium.defined(pick) && pick.id) {
            var feature = pick.id;
            viewer.entities.removeById("select_grid");
            viewer.entities.removeById(`line_${feature.id}`);
            let positions = feature.polygon.hierarchy.getValue(
                Cesium.JulianDate.now()
            ).positions;
            last_picked = viewer.entities.add({
                id: "select_grid",
                polygon: {
                    hierarchy: positions,
                    material: getColorRamp("rgba(0, 255, 255,1)", "rgba(255,0,0,0.3)"),
                    height: 1499,
                },
            });
        } else if (last_picked.length != 0) {
            viewer.entities.remove(last_picked);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement) => {
        var pickFeature =
            viewer.scene.pick(movement.endPosition) &&
            viewer.scene.pick(movement.endPosition).id;
        if (Cesium.defined(pickFeature) && this.preLineId !== pickFeature.id) {
            this.preLineId && viewer.entities.removeById(`line_${this.preLineId}`);
            this.preLineId = pickFeature.id;
            viewer.entities.add({
                id: "line_" + pickFeature.id,
                name: "line_" + pickFeature.name,
                polyline: {
                    positions: pickFeature.polygon.hierarchy.getValue(
                        Cesium.JulianDate.now()
                    ).positions,
                    width: 8,
                    material: Cesium.Color.RED,
                },
            });
        } else {
            this.preLineId && viewer.entities.removeById(`line_${this.preLineId}`);
            this.preLineId = null;
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    //渐变色

    function getColorRamp(rampColor, centerColor) {
        var ramp = document.createElement("canvas");
        ramp.width = 50;
        ramp.height = 50;
        var ctx = ramp.getContext("2d");

        var grd = ctx.createRadialGradient(25, 25, 0, 25, 25, 50);
        grd.addColorStop(0, centerColor); // "rgba(255,255,255,0)"
        grd.addColorStop(1, rampColor);

        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 50, 50);

        // return ramp;

        return new Cesium.ImageMaterialProperty({
            image: ramp,
            transparent: true,
        });
    }
}

function ini_camera_view(start_city) {
    if (start_city == "china") {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(103.84, 31.15, 17850000),
            orientation: {
                heading: Cesium.Math.toRadians(348.4202942851978),
                pitch: Cesium.Math.toRadians(-89.74026687972041),
                roll: Cesium.Math.toRadians(0),
            },
            complete: function callback() {
                // 定位完成之后的回调函数
            },
        });
        return;
    }
    var initialPosition = new Cesium.Cartesian3.fromDegrees(
        114.304408,
        30.614473,
        370
    ); //武汉

    var initialOrientation = new Cesium.HeadingPitchRoll.fromDegrees(
        7.1077496389876024807,
        -31.987223091598949054,
        0.025883251314954971306
    );
    if (start_city == "wuhan_b") {
        initialPosition = new Cesium.Cartesian3.fromDegrees(
            114.61308,
            30.45902,
            370
        ); //武汉
    }
    var homeCameraView = {
        destination: initialPosition,
        orientation: {
            heading: initialOrientation.heading,
            pitch: initialOrientation.pitch,
            roll: initialOrientation.roll,
        },
    };
    // Set the initial view
    viewer.scene.camera.setView(homeCameraView);
    return;
}
//鼠标移动到3d tiles上就显示编号
function move_show_labels() {
    // 鼠标移动时增加HTML overlay
    var nameOverlay = document.createElement("div");
    viewer.container.appendChild(nameOverlay);
    nameOverlay.className = "backdrop";
    nameOverlay.style.display = "none";
    nameOverlay.style.position = "absolute";
    nameOverlay.style.bottom = "0";
    nameOverlay.style.left = "0";
    nameOverlay.style["pointer-events"] = "none";
    nameOverlay.style.padding = "4px";
    nameOverlay.style.backgroundColor = "rgba(255,255,255,0.5)";
    nameOverlay.style.color = "black";
    // Information about the currently selected feature
    var selected = {
        feature: undefined,
        originalColor: new Cesium.Color(),
    };
    // Silhouettes are supported
    var silhouetteBlue = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
    silhouetteBlue.uniforms.color = Cesium.Color.BLUE;
    silhouetteBlue.uniforms.length = 0.01;
    silhouetteBlue.selected = [];

    var silhouetteGreen = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
    silhouetteGreen.uniforms.color = Cesium.Color.LIME;
    silhouetteGreen.uniforms.length = 0.01;
    silhouetteGreen.selected = [];

    viewer.scene.postProcessStages.add(
        Cesium.PostProcessStageLibrary.createSilhouetteStage([
            silhouetteBlue,
            silhouetteGreen,
        ])
    );

    var highlighted = {
        feature: undefined,
        originalColor: new Cesium.Color(),
    };

    // 覆盖黄色
    viewer.screenSpaceEventHandler.setInputAction(function onMouseMove(movement) {
        // If a feature was previously highlighted, undo the highlight
        if (Cesium.defined(highlighted.feature)) {
            highlighted.feature.color = highlighted.originalColor;
            highlighted.feature = undefined;
        }
        //获取的是一个3dtiles的feature
        var pickedFeature = viewer.scene.pick(movement.endPosition);
        if (
            !Cesium.defined(pickedFeature) ||
            !(pickedFeature instanceof Cesium.Cesium3DTileFeature)
        ) {
            nameOverlay.style.display = "none";
            return;
        }
        // A feature was picked, so show it's overlay content

        // var name = pickedFeature.getProperty("name");
        // if (!Cesium.defined(name)) {
        //     name = pickedFeature.getProperty("id");
        // }
        // nameOverlay.textContent = name;
        //可通过建立字典实现颜色与区域的一一对应
        if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
            nameOverlay.style.display = "block";
            nameOverlay.style.bottom =
                viewer.canvas.clientHeight - movement.endPosition.y + "px";
            nameOverlay.style.left = movement.endPosition.x + "px";
            var propertyNames = pickedFeature.getPropertyNames();
            var length = propertyNames.length;
            var str = pickedFeature.getProperty("name");
            if (!Cesium.defined(str)) {
                str = pickedFeature.getProperty("elementId");
            }
            // for (var i = 0; i < length; ++i) {
            //     var propertyName = propertyNames[i];
            //     str += propertyName + ': ' + pickedFeature.getProperty(propertyName) + '\n';
            // }
            //
            nameOverlay.textContent = str;
        }
        // Highlight the feature if it's not already selected.
        if (pickedFeature !== selected.feature) {
            highlighted.feature = pickedFeature;
            Cesium.Color.clone(pickedFeature.color, highlighted.originalColor);
            pickedFeature.color = Cesium.Color.YELLOW;
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

function highlightLine() {
    //单击面后高亮
    // var temp = new Array();

    // function Highlight(nameId) {
    //     var exists = temp.indexOf(nameId);
    //     if (exists <= -1) {
    //         temp.push(nameId);
    //     } else {
    //         temp.splice(exists, 1); //删除对应的nameID
    //     }
    // }
    // viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
    //     var pickedFeature = viewer.scene.pick(movement.position);

    //     //判断之前是否有高亮面存在
    //     if (highlightFace) {
    //         highlightFace.material = highlightFace.material0;
    //     }
    //     pickedFeature.id.polygon.material0 = pickedFeature.id.polygon.material;
    //     pickedFeature.id.polygon.material = Cesium.Color.WHITE;
    //     highlightFace = pickedFeature.id.polygon;
    //     showDivPositionOld = pickedFeature.id.properties;

    //     if (typeof pickedFeature != "undefined")
    //         //鼠标是否点到面上
    //         var id = pickedFeature.id;
    //     linehHghtlight(id);
    // }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function dram_path_czml() {
    var statusDisplay = document.createElement("div");
    var fuelDisplay = document.createElement("div");
    var czmlPath = "SampleData/";
    var vehicleEntity;

    // Add a blank CzmlDataSource to hold our multi-part entity/entities.
    var dataSource = new Cesium.CzmlDataSource();
    viewer.dataSources.add(dataSource);
    dataSource.name = "小车";
    // This demo shows how a single path can be broken up into several CZML streams.
    var partsToLoad = [
        {
            url: "MultipartVehicle_part1.czml",
            range: [0, 1500],
            requested: false,
            loaded: false,
        },
    ];

    function updateStatusDisplay() {
        var msg = "";
        partsToLoad.forEach(function (part) {
            msg += part.url + " - ";
            if (part.loaded) {
                msg += "Loaded.<br/>";
            } else if (part.requested) {
                msg += "Loading now...<br/>";
            } else {
                msg += "Not needed yet.<br/>";
            }
        });
        statusDisplay.innerHTML = msg;
    }

    // Helper function to mark a part as requested, and process it into the dataSource.
    function processPart(part) {
        part.requested = true;
        updateStatusDisplay();
        dataSource.process(czmlPath + part.url).then(function () {
            part.loaded = true;
            updateStatusDisplay();
            //锁定相机视角
            // if (!viewer.trackedEntity) {
            //     //
            //     viewer.trackedEntity = vehicleEntity = dataSource.entities.getById(
            //         "Vehicle"
            //     );
            // }
        });
    }
    processPart(partsToLoad[0]);
} // Follow the vehicle with the camera.

function click_for_drawline_func() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    let drawMode = 'line'
    let activePoints = []
    let floatPoint, dynamicShape
    handler.setInputAction(function (e) {
        if (options_for_mouseclick["dianjihuaxian"] == 0) return;
        const wp = viewer.scene.globe.pick(viewer.camera.getPickRay(e.position), viewer.scene)
        if (Cesium.defined(wp)) {
            activePoints.push(wp)
            //下面这个if中的代码用于创建一个临时多边形（线）多边形的开关跟随鼠标的位置变化，
            if (!Cesium.defined(floatPoint)) {
                floatPoint = new Cesium.CallbackProperty(function () {
                    return activePoints
                })
                activePoints.push(wp)
                dynamicShape = drawShape(floatPoint)
            }
        }

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction(function (e) {
        if (options_for_mouseclick["dianjihuaxian"] == 0) return;
        const wp = viewer.scene.globe.pick(viewer.camera.getPickRay(e.endPosition), viewer.scene)
        if (Cesium.defined(wp)) {
            if (activePoints.length > 1) {
                activePoints.pop()
                activePoints.push(wp)
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    handler.setInputAction(function (e) {
        drawShape(activePoints)
        activePoints = []
        floatPoint = null
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
    function drawShape(position) {
        if (options_for_mouseclick["dianjihuaxian"] == 0) return;
        console.log(position)
        const entity = drawMode == 'line' ?
            viewer.entities.add({
                polyline: {
                    positions: position,
                    width: 3,
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.8)),
                    clampToGround: true

                }
            }) :
            viewer.entities.add({
                polygon: {
                    hierarchy: position,
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.3)),
                    //material: new Cesium.ColorMaterialProperty(new Cesium.Color(205, 139, 14, 1)),
                    outline: true,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3
                }
            })
        return entity
        //viewer.entities.add(entity)
    }

}

function right_click_for_draw_rect() {

    var entitys_in_rect = {}
    var nameOverlay
    var mouse_temp;
    //右键按下标识
    var flag = false;
    //起点终点x,y
    var startX = null;
    var startY = null;
    var endX = null;
    var endY = null;
    //创建框选元素
    var selDiv = document.createElement("div");
    var handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    //右键按下事件，设置起点，div设置样式和位置，添加到页面
    handler.setInputAction(function (event) {
        if (options_for_mouseclick["lakuangxuanqu"] == 0) return;
        nameOverlay.style.display = "none";
        selDiv.style.display="none"
        entitys_in_rect = {}
        flag = true;
        startX = event.position.x;
        startY = event.position.y;
        mouse_temp = event.position;
        selDiv.style.cssText =
            "position:absolute;width:0px;height:0px;font-size:0px;margin:0px;padding:0px;border:1px dashed #0099FF;background-color:#C3D5ED;z-index:1000;filter:alpha(opacity:60);opacity:0.6;";
        selDiv.id = "selectDiv";
        selDiv.style.left = startX + "px";
        selDiv.style.top = startY + "px";
        document.body.appendChild(selDiv);
    }, Cesium.ScreenSpaceEventType.RIGHT_DOWN);

    //鼠标抬起事件，获取div坐上和右下的x,y 转为经纬度坐标
    handler.setInputAction(function (event) {
        if (options_for_mouseclick["lakuangxuanqu"] == 0) return;
        flag = false;
        var l = parseInt(selDiv.style.left);
        var t = parseInt(selDiv.style.top);
        var w = parseInt(selDiv.style.width);
        var h = parseInt(selDiv.style.height);
        //找出区域内所有实体
        var divx = w / 10;
        var divy = h / 10;
        for (var posi_x = l; posi_x < l + w; posi_x += divx) {
            for (var posi_y = t; posi_y < t + h; posi_y += divx) {
                mouse_temp.x = posi_x;
                mouse_temp.y = posi_y;
                var pickedFeature = viewer.scene.pick(mouse_temp);
                if (Cesium.defined(pickedFeature)) {
                    if (pickedFeature instanceof Cesium.Cesium3DTileFeature) continue;
                    if (entitys_in_rect[pickedFeature.id._id] == 1) {
                        continue;
                    }
                    if (pickedFeature.id) {
                        entitys_in_rect[pickedFeature.id._id] = 1;
                    }
                    // if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {}
                }

            }
        }
        //遍历id字典
        nameOverlay = document.createElement("div");
        viewer.container.appendChild(nameOverlay);
        nameOverlay.className = "backdrop";
        nameOverlay.style.display = "none";
        nameOverlay.style.position = "absolute";
        nameOverlay.style.bottom = "0";
        nameOverlay.style.left = "0";
        nameOverlay.style["pointer-events"] = "none";
        nameOverlay.style.padding = "4px";
        nameOverlay.style.backgroundColor = "rgba(255,255,255,0.5)";
        nameOverlay.style.color = "black";
        nameOverlay.style.display = "block";
        var str="";
        var id="id:";
        for (var key in entitys_in_rect) {
            str += id + key + "<br> ";
        }
        nameOverlay.style.display = "block";
        nameOverlay.style.bottom = viewer.canvas.clientHeight - (t + h) + "px";
        nameOverlay.style.left = (l + w) + "px";
        // var propertyNames = pickedFeature.getPropertyNames();
        // var length = propertyNames.length;
        // var str = pickedFeature.getProperty("name");
        // if (!Cesium.defined(str)) {
        //     str = pickedFeature.getProperty("elementId");
        // }
        nameOverlay.textContent = str;



        var earthPosition = viewer.camera.pickEllipsoid(
            { x: l, y: t },
            viewer.scene.globe.ellipsoid
        );
        var cartographic = Cesium.Cartographic.fromCartesian(
            earthPosition,
            viewer.scene.globe.ellipsoid,
            new Cesium.Cartographic()
        );
        console.log(
            "左上坐标为：" +
            [
                Cesium.Math.toDegrees(cartographic.longitude),
                Cesium.Math.toDegrees(cartographic.latitude),
            ]
        );
        earthPosition = viewer.camera.pickEllipsoid(
            { x: l + w, y: t + h },
            viewer.scene.globe.ellipsoid
        );
        cartographic = Cesium.Cartographic.fromCartesian(
            earthPosition,
            viewer.scene.globe.ellipsoid,
            new Cesium.Cartographic()
        );
        console.log(
            "右下坐标为：" +
            [
                Cesium.Math.toDegrees(cartographic.longitude),
                Cesium.Math.toDegrees(cartographic.latitude),
            ]
        );

        //根据业务确定是否删除框选div
        // document
        //     .getElementById("selectDiv").parentNode.removeChild(document.getElementById("selectDiv"));

        // document
        //     .getElementById("nameOverlay").parentNode.removeChild(document.getElementById("nameOverlay"));


    }, Cesium.ScreenSpaceEventType.RIGHT_UP);

    //鼠标移动事件，处理位置css
    handler.setInputAction(function (event) {
        if (options_for_mouseclick["lakuangxuanqu"] == 0) return;
        if (flag) {
            endX = event.endPosition.x;
            endY = event.endPosition.y;

            selDiv.style.left = Math.min(endX, startX) + "px";
            selDiv.style.top = Math.min(endY, startY) + "px";
            selDiv.style.width = Math.abs(endX - startX) + "px";
            selDiv.style.height = Math.abs(endY - startY) + "px";
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);


    // viewer.screenSpaceEventHandler.setInputAction(function onMouseMove(movement) {
    //     // If a feature was previously highlighted, undo the highlight
    //     if (Cesium.defined(highlighted.feature)) {
    //         highlighted.feature.color = highlighted.originalColor;
    //         highlighted.feature = undefined;
    //     }
    //     //获取的是一个3dtiles的feature
    //     var pickedFeature = viewer.scene.pick(movement.endPosition);
    //     if (
    //         !Cesium.defined(pickedFeature) ||
    //         !(pickedFeature instanceof Cesium.Cesium3DTileFeature)
    //     ) {
    //         nameOverlay.style.display = "none";
    //         return;
    //     }
    //     if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
    //         nameOverlay.style.display = "block";
    //         nameOverlay.style.bottom =
    //             viewer.canvas.clientHeight - movement.endPosition.y + "px";
    //         nameOverlay.style.left = movement.endPosition.x + "px";
    //         var propertyNames = pickedFeature.getPropertyNames();
    //         var length = propertyNames.length;
    //         var str = pickedFeature.getProperty("name");
    //         if (!Cesium.defined(str)) {
    //             str = pickedFeature.getProperty("elementId");
    //         }
    //         // for (var i = 0; i < length; ++i) {
    //         //     var propertyName = propertyNames[i];
    //         //     str += propertyName + ': ' + pickedFeature.getProperty(propertyName) + '\n';
    //         // }
    //         //
    //         nameOverlay.textContent = str;
    //     }
    //     // Highlight the feature if it's not already selected.
    //     if (pickedFeature !== selected.feature) {
    //         highlighted.feature = pickedFeature;
    //         Cesium.Color.clone(pickedFeature.color, highlighted.originalColor);
    //         pickedFeature.color = Cesium.Color.YELLOW;
    //     }
    // }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}