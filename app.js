(function(){
  "use strict";

  function fmtDateInput(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  (function setDefaultDates(){
    var earliest = '2000-01-01';
    var d1 = document.getElementById('d1');
    var d2 = document.getElementById('d2');
    var today = new Date();
    var todayStr = fmtDateInput(today);
    [d1,d2].forEach(function(el){ el.min = earliest; el.max = todayStr; });

    var twoYearsAgo = new Date(today); twoYearsAgo.setFullYear(today.getFullYear()-2);
    d1.value = fmtDateInput(twoYearsAgo);
    d2.value = todayStr;
  })();

  function pad(n){return n.toString().padStart(2,'0');}
  function tickClock(){
    var now = new Date();
    document.getElementById('clock').textContent =
      pad(now.getUTCHours())+':'+pad(now.getUTCMinutes())+':'+pad(now.getUTCSeconds());
  }
  tickClock();
  setInterval(tickClock,1000);

  var currentLat = 26.4499, currentLon = 80.3319, currentPlaceName = 'Kanpur, India';

  var map = L.map('worldMap', {zoomControl:true, attributionControl:true}).setView([currentLat, currentLon], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
  var marker = L.marker([currentLat, currentLon]).addTo(map);

  function setPin(lat, lon, name, panMap, bounds){
    currentLat = lat; currentLon = lon;
    if(name) currentPlaceName = name;
    marker.setLatLng([lat, lon]);
    if(panMap !== false){
      if(bounds){
        map.fitBounds(bounds, {maxZoom:17, padding:[20,20]});
      } else {
        map.setView([lat, lon], Math.max(map.getZoom(), 7));
      }
    }
    document.getElementById('pinName').textContent = currentPlaceName;
    document.getElementById('pinCoords').textContent = lat.toFixed(6)+', '+lon.toFixed(6);
  }
  setPin(currentLat, currentLon, currentPlaceName, false);

  (function initResizer(){
    var resizer = document.getElementById('dragResizer');
    var panel = document.querySelector('.panel');
    if(!resizer || !panel) return;

    var MIN_WIDTH = 240, MAX_WIDTH = 750;
    var dragging = false, startX = 0, startWidth = 0;
    var rafId = null;

    function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

    function applyWidth(px){
      var w = clamp(px, MIN_WIDTH, MAX_WIDTH);
      panel.style.width = w + 'px';
    }

    function scheduleMapInvalidate(){
      if(rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function(){
        if(typeof map !== 'undefined' && map && map.invalidateSize){
          map.invalidateSize();
        }
        rafId = null;
      });
    }

    function onMouseDown(e){
      dragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      document.body.classList.add('resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }

    function onMouseMove(e){
      if(!dragging) return;
      var delta = e.clientX - startX;
      applyWidth(startWidth + delta);
      scheduleMapInvalidate();
    }

    function onMouseUp(){
      if(!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      scheduleMapInvalidate();
    }

    resizer.addEventListener('mousedown', onMouseDown);

    resizer.addEventListener('touchstart', function(e){
      var touch = e.touches[0];
      onMouseDown({clientX:touch.clientX, preventDefault:function(){e.preventDefault();}});
    }, {passive:false});
    document.addEventListener('touchmove', function(e){
      if(!dragging) return;
      var touch = e.touches[0];
      onMouseMove({clientX:touch.clientX});
    }, {passive:false});
    document.addEventListener('touchend', onMouseUp);
  })();

  function reverseGeocode(lat, lon){
    var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lon+'&zoom=18&addressdetails=1&accept-language=en';
    fetch(url).then(function(r){ return r.json(); }).then(function(data){
      var name = (data && data.display_name) ? data.display_name.split(',').slice(0,4).join(',') : (lat.toFixed(5)+', '+lon.toFixed(5));
      currentPlaceName = name;
      document.getElementById('pinName').textContent = name;
    }).catch(function(){
      document.getElementById('pinName').textContent = lat.toFixed(5)+', '+lon.toFixed(5);
    });
  }

  map.on('click', function(e){
    setPin(e.latlng.lat, e.latlng.lng, null, false);
    document.getElementById('pinName').textContent = 'Locating…';
    reverseGeocode(e.latlng.lat, e.latlng.lng);
  });

  var searchInput = document.getElementById('placeSearch');
  var searchResults = document.getElementById('searchResults');
  var searchBtn = document.getElementById('searchBtn');
  var searchDebounce = null;

  function placeTypeTag(item){
    var t = (item.type || item.class || '').replace(/_/g,' ');
    var addr = item.address || {};
    if(addr.house_number && addr.road) return 'address';
    if(t) return t;
    return item.class || 'place';
  }

  function runSearch(){
    var q = searchInput.value.trim();
    if(!q){ searchResults.innerHTML=''; return; }
    searchResults.innerHTML = '<div class="search-status">Searching…</div>';
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q)+
      '&limit=15&addressdetails=1&extratags=0&namedetails=0&dedupe=1&accept-language=en';
    fetch(url).then(function(r){ return r.json(); }).then(function(list){
      if(!list || !list.length){
        searchResults.innerHTML = '<div class="search-status">No matches found. Try adding a district/state, or a nearby landmark, for a more precise area match.</div>';
        return;
      }
      var precisionRank = {house:0,building:0,address:0,residential:1,suburb:1,neighbourhood:1,village:1,hamlet:1,town:2,city_district:2,municipality:2,city:3,county:4,state_district:4,state:5,country:6};
      list.sort(function(a,b){
        var ra = precisionRank[placeTypeTag(a)] != null ? precisionRank[placeTypeTag(a)] : 3;
        var rb = precisionRank[placeTypeTag(b)] != null ? precisionRank[placeTypeTag(b)] : 3;
        return ra-rb;
      });
      searchResults.innerHTML = '';
      list.forEach(function(item){
        var div = document.createElement('div');
        div.className = 'search-result-item';
        var tag = placeTypeTag(item);
        div.innerHTML = '<span style="display:inline-block;background:var(--bg-panel);border:1px solid var(--line-bright);border-radius:4px;padding:1px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--amber);margin-right:6px;">'+tag+'</span>'+item.display_name;
        div.addEventListener('click', function(){
          var lat = parseFloat(item.lat), lon = parseFloat(item.lon);
          var name = item.display_name.split(',').slice(0,4).join(',');
          var bounds = null;
          if(item.boundingbox && item.boundingbox.length===4){
            var bb = item.boundingbox.map(parseFloat);
            bounds = [[bb[0], bb[2]], [bb[1], bb[3]]];
          }
          setPin(lat, lon, name, true, bounds);
          searchResults.innerHTML = '';
          searchInput.value = name;
        });
        searchResults.appendChild(div);
      });
    }).catch(function(){
      searchResults.innerHTML = '<div class="search-status">Search failed — check your connection.</div>';
    });
  }
  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); runSearch(); } });
  searchInput.addEventListener('input', function(){
    if(searchDebounce) clearTimeout(searchDebounce);
    var q = searchInput.value.trim();
    if(q.length<3){ searchResults.innerHTML=''; return; }
    searchDebounce = setTimeout(runSearch, 450);
  });

  document.getElementById('loc').addEventListener('change', function(e){
    var parts = e.target.value.split('|');
    setPin(parseFloat(parts[1]), parseFloat(parts[2]), parts[0], true);
  });

  var analysisMode = 'standard';
  var modeStandardBtn = document.getElementById('modeStandardBtn');
  var modeNdviBtn = document.getElementById('modeNdviBtn');
  var liveHint = document.getElementById('liveHint');
  var ndviSection = document.getElementById('ndviSection');
  var imgSourceSelect = document.getElementById('imgSource');
  var sentinelKeyField = document.getElementById('sentinelKeyField');
  var sentinelIdInput = document.getElementById('sentinelId');
  var esriPreview = document.getElementById('esriPreview');
  var providerResults = document.getElementById('providerResults');

  var PROVIDER_LABEL = {
    modis: 'NASA MODIS (GIBS)',
    viirs: 'NASA VIIRS (GIBS)',
    sentinel: 'Copernicus Sentinel-2',
    esri: 'Esri World Imagery'
  };

  function updateLiveHint(){
    var src = imgSourceSelect.value;
    sentinelKeyField.style.display = src==='sentinel' ? 'block' : 'none';
    fetchLiveBtn.style.display = src==='crosscheck' ? 'none' : '';
    esriPreview.style.display = 'none';
    providerResults.innerHTML = '';
    if(src==='sentinel'){
      liveHint.textContent = analysisMode==='ndvi'
        ? 'Sentinel-2 vegetation index uses its own NIR band via Sentinel Hub, at ~10m resolution — much finer than the NASA feeds. Needs your free instance ID above.'
        : 'Pulls true-colour Sentinel-2 imagery (Copernicus/ESA, ~10m resolution) via Sentinel Hub for the pinned location on both dates. Needs your free instance ID above.';
    } else if(src==='viirs'){
      liveHint.textContent = analysisMode==='ndvi'
        ? 'Fetches a false-colour NIR-capable NASA VIIRS band composite (GIBS) for both dates and derives an approximate vegetation index. VIIRS imagery is available from late 2015 onward — pick dates within that range.'
        : 'Pulls real NASA VIIRS true-colour imagery (GIBS, ~375m resolution, sharper than MODIS) for the pinned location on both dates. Available from late 2015 onward. Cloud cover varies by day.';
    } else if(src==='esri'){
      liveHint.textContent = 'Esri World Imagery blends recent Maxar/DigitalGlobe/Airbus aerial and satellite passes — often sub-metre detail. It\'s the best available current view, not matched to Date 1/Date 2, so both preview slots load the same current pass for visual reference alongside the dated analysis.';
    } else if(src==='crosscheck'){
      liveHint.textContent = 'Opens the pinned location and dates on other authentic public satellite-imagery platforms, so you can verify what this tool shows against the original source. Pick a link below — no images are loaded into the analyzer.';
    } else {
      liveHint.textContent = analysisMode==='ndvi'
        ? 'Fetches a false-colour NIR-capable NASA MODIS band composite (GIBS) for both dates, then derives an approximate vegetation index from it. Manual uploads of ordinary photos won\'t produce a meaningful index.'
        : 'Pulls real NASA MODIS true-colour imagery (GIBS) for the pinned location on both dates. Cloud cover varies by day, so results aren\'t always clear — if a fetch fails or looks unusable, upload your own images below instead.';
    }
    if(src==='crosscheck') renderCrossCheckLinks();
  }

  function setMode(mode){
    analysisMode = mode;
    modeStandardBtn.classList.toggle('active', mode==='standard');
    modeNdviBtn.classList.toggle('active', mode==='ndvi');
    updateLiveHint();
  }
  modeStandardBtn.addEventListener('click', function(){ setMode('standard'); });
  modeNdviBtn.addEventListener('click', function(){ setMode('ndvi'); });
  imgSourceSelect.addEventListener('change', updateLiveHint);

  var roiPolygon = null;
  var roiBoundsLL = null;
  var drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  var drawControl = new L.Control.Draw({
    draw: {
      polygon: { allowIntersection:false, showArea:true, shapeOptions:{ color:'#ffb347', weight:2 } },
      rectangle:false, circle:false, circlemarker:false, marker:false, polyline:false
    },
    edit: false
  });
  var roiStatus = document.getElementById('roiStatus');
  var drawRoiBtn = document.getElementById('drawRoiBtn');
  var clearRoiBtn = document.getElementById('clearRoiBtn');
  var drawHandler = null;

  drawRoiBtn.addEventListener('click', function(){
    if(drawHandler){ drawHandler.disable(); drawHandler = null; return; }
    drawHandler = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
    drawHandler.enable();
  });

  map.on(L.Draw.Event.CREATED, function(e){
    drawnItems.clearLayers();
    var layer = e.layer;
    drawnItems.addLayer(layer);
    drawHandler = null;

    var latlngs = layer.getLatLngs()[0];
    roiPolygon = latlngs.map(function(ll){ return [ll.lng, ll.lat]; });
    var b = layer.getBounds();
    roiBoundsLL = { minLon:b.getWest(), minLat:b.getSouth(), maxLon:b.getEast(), maxLat:b.getNorth() };

    roiStatus.className = 'roi-status active';
    roiStatus.textContent = '✓ ROI set ('+latlngs.length+'-point polygon). Live fetch will pull imagery for this exact area and analysis will be limited to inside the polygon.';
  });

  clearRoiBtn.addEventListener('click', function(){
    drawnItems.clearLayers();
    roiPolygon = null; roiBoundsLL = null;
    if(drawHandler){ drawHandler.disable(); drawHandler = null; }
    roiStatus.className = 'roi-status';
    roiStatus.textContent = 'No region of interest drawn — live fetch will use a fixed square around the pin.';
  });

  function pointInPolygon(lon, lat, poly){
    var inside = false;
    for(var i=0, j=poly.length-1; i<poly.length; j=i++){
      var xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
      var intersect = ((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi);
      if(intersect) inside = !inside;
    }
    return inside;
  }

  var liveStatus = document.getElementById('liveStatus');
  var fetchLiveBtn = document.getElementById('fetchLiveBtn');
  var currentImageBBox = null;

  var GIBS_LAYERS = {
    modis: { standard:'MODIS_Terra_CorrectedReflectance_TrueColor', ndvi:'MODIS_Terra_CorrectedReflectance_Bands721', earliest:'2000-02-24' },
    viirs: { standard:'VIIRS_SNPP_CorrectedReflectance_TrueColor', ndvi:'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1', earliest:'2015-11-24' }
  };

  function gibsUrl(bbox, layerName, dateStr, pxW, pxH){
    var base = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
    var params = [
      'SERVICE=WMS','VERSION=1.1.1','REQUEST=GetMap',
      'LAYERS='+layerName,
      'SRS=EPSG:4326',
      'BBOX='+bbox.minLon+','+bbox.minLat+','+bbox.maxLon+','+bbox.maxLat,
      'WIDTH='+pxW,'HEIGHT='+pxH,
      'FORMAT=image/jpeg',
      'TIME='+dateStr
    ];
    return base+'?'+params.join('&');
  }

  function sentinelUrl(bbox, dateStr, pxW, pxH, instanceId, ndvi){
    var base = 'https://services.sentinel-hub.com/ogc/wms/'+encodeURIComponent(instanceId);
    var params = [
      'SERVICE=WMS','REQUEST=GetMap','VERSION=1.3.0',
      'LAYERS='+(ndvi?'NDVI':'TRUE-COLOR'),
      'CRS=EPSG:4326',
      'BBOX='+bbox.minLat+','+bbox.minLon+','+bbox.maxLat+','+bbox.maxLon,
      'WIDTH='+pxW,'HEIGHT='+pxH,
      'FORMAT=image/jpeg',
      'TIME='+dateStr+'/'+dateStr,
      'MAXCC=60'
    ];
    return base+'?'+params.join('&');
  }

  function fetchImageAsElement(url){
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.blob();
    }).then(function(blob){
      return new Promise(function(resolve, reject){
        var img = new Image();
        var objUrl = URL.createObjectURL(blob);
        img.onload = function(){ resolve({img:img, url:objUrl}); };
        img.onerror = function(){ reject(new Error('decode failed')); };
        img.src = objUrl;
      });
    });
  }

  var blankCheckCanvas = document.createElement('canvas');
  function isBlankTile(img){
    var w = 24, h = 24;
    blankCheckCanvas.width = w; blankCheckCanvas.height = h;
    var ctx = blankCheckCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch(e){ return false; }
    var sum = 0, sumSq = 0, n = w*h;
    for(var i=0;i<data.length;i+=4){
      var lum = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
      sum += lum; sumSq += lum*lum;
    }
    var mean = sum/n;
    var variance = sumSq/n - mean*mean;
    return mean < 8 || variance < 4;
  }

  fetchLiveBtn.addEventListener('click', function(){
    var date1 = document.getElementById('d1').value, date2 = document.getElementById('d2').value;
    if(!date1 || !date2){
      liveStatus.className = 'live-status err';
      liveStatus.textContent = '⚠ Pick both dates before fetching imagery.';
      return;
    }
    var source = imgSourceSelect.value;
    if(source==='crosscheck') return;
    if(source==='sentinel' && !sentinelIdInput.value.trim()){
      liveStatus.className = 'live-status err';
      liveStatus.textContent = '⚠ Sentinel-2 needs a free Sentinel Hub instance ID — paste one above, or switch source to NASA MODIS/VIIRS.';
      return;
    }
    var span = 0.35;

    var bbox;
    if(roiBoundsLL){
      var padLon = (roiBoundsLL.maxLon-roiBoundsLL.minLon)*0.08 || 0.02;
      var padLat = (roiBoundsLL.maxLat-roiBoundsLL.minLat)*0.08 || 0.02;
      bbox = {
        minLon: roiBoundsLL.minLon-padLon, maxLon: roiBoundsLL.maxLon+padLon,
        minLat: roiBoundsLL.minLat-padLat, maxLat: roiBoundsLL.maxLat+padLat
      };
    } else {
      bbox = { minLon:currentLon-span/2, maxLon:currentLon+span/2, minLat:currentLat-span/2, maxLat:currentLat+span/2 };
    }

    var url1, url2, providerLabel, dateMatched = true;
    if(source==='esri'){
      url1 = url2 = esriUrl(bbox);
      providerLabel = 'Esri World Imagery';
      dateMatched = false;
    } else if(source==='sentinel'){
      var instanceId = sentinelIdInput.value.trim();
      url1 = sentinelUrl(bbox, date1, W, H, instanceId, analysisMode==='ndvi');
      url2 = sentinelUrl(bbox, date2, W, H, instanceId, analysisMode==='ndvi');
      providerLabel = 'Sentinel-2';
    } else {
      var layers = GIBS_LAYERS[source];
      var layerName = analysisMode==='ndvi' ? layers.ndvi : layers.standard;
      url1 = gibsUrl(bbox, layerName, date1, W, H);
      url2 = gibsUrl(bbox, layerName, date2, W, H);
      providerLabel = PROVIDER_LABEL[source];
      if(date1 < layers.earliest || date2 < layers.earliest){
        liveStatus.className = 'live-status err';
        liveStatus.textContent = '⚠ '+providerLabel+' imagery only goes back to '+layers.earliest+'. Pick later dates, or switch to NASA MODIS for full 2000-present coverage.';
        return;
      }
    }

    fetchLiveBtn.disabled = true;
    liveStatus.className = 'live-status busy';
    liveStatus.textContent = '⏳ Contacting '+providerLabel+' for '+(dateMatched ? date1+' and '+date2 : currentPlaceName)+'…';

    Promise.all([
      fetchImageAsElement(url1),
      fetchImageAsElement(url2)
    ]).then(function(results){
      beforeImg = results[0].img;
      afterImg = results[1].img;
      currentImageBBox = bbox;
      previews[1].src = results[0].url; zones[1].classList.add('has-image');
      previews[2].src = results[1].url; zones[2].classList.add('has-image');
      fnames[1].textContent = providerLabel+(dateMatched ? ' · '+date1 : ' · current pass')+(roiBoundsLL?' · ROI':'');
      fnames[2].textContent = providerLabel+(dateMatched ? ' · '+date2 : ' · current pass')+(roiBoundsLL?' · ROI':'');
      checkReady();

      if(!dateMatched){
        liveStatus.className = 'live-status ok';
        liveStatus.textContent = '✓ High-res reference loaded for '+currentPlaceName+' — most recent available pass, not matched to Date 1/Date 2, so it\'s for visual reference only rather than the change analysis.';
        fetchLiveBtn.disabled = false;
        return;
      }

      var blankBefore = isBlankTile(beforeImg);
      var blankAfter = isBlankTile(afterImg);
      if(blankBefore || blankAfter){
        liveStatus.className = 'live-status err';
        liveStatus.textContent = '⚠ The '+(blankBefore && blankAfter ? 'before AND after' : blankBefore ? 'before' : 'after')
          +' pass came back blank/black — '+providerLabel+' has no real data for that exact date and area (common for a specific day/small ROI). '
          +'Analyzing this would give meaningless numbers. Try a date a few days earlier/later, widen the ROI, or switch provider.';
      } else {
        liveStatus.className = 'live-status ok';
        liveStatus.textContent = '✓ Live imagery loaded for '+currentPlaceName+(roiBoundsLL?' (your drawn ROI)':'')+'. Cloud cover may affect clarity — check the previews before analyzing.';
      }
      fetchLiveBtn.disabled = false;
    }).catch(function(err){
      liveStatus.className = 'live-status err';
      liveStatus.textContent = '⚠ Live fetch didn\'t go through ('+providerLabel+' may be unreachable, or no cloud-free pass exists for that date/area). Please upload two images manually below, or load the demo tile.';
      fetchLiveBtn.disabled = false;
    });
  });

  function esriUrl(bbox){
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
      + '?bbox='+bbox.minLon+','+bbox.minLat+','+bbox.maxLon+','+bbox.maxLat
      + '&bboxSR=4326&imageSR=4326&size='+W+','+H+'&format=jpg&f=image';
  }

  function renderCrossCheckLinks(){
    var lat = currentLat, lon = currentLon;
    var date2 = document.getElementById('d2').value || new Date().toISOString().slice(0,10);
    var span = 0.35;
    var bbox = roiBoundsLL || { minLon:lon-span/2, maxLon:lon+span/2, minLat:lat-span/2, maxLat:lat+span/2 };

    var links = [
      {
        name: 'NASA Worldview',
        note: 'Same GIBS feed, official NASA viewer — pick any historical date on the timeline',
        url: 'https://worldview.earthdata.nasa.gov/?v='+bbox.minLon+','+bbox.minLat+','+bbox.maxLon+','+bbox.maxLat+'&t='+date2
      },
      {
        name: 'Copernicus Browser (ESA)',
        note: 'Official Sentinel-2/3 viewer from the European Space Agency',
        url: 'https://browser.dataspace.copernicus.eu/?zoom=11&lat='+lat.toFixed(4)+'&lng='+lon.toFixed(4)+'&themeId=DEFAULT-THEME'
      },
      {
        name: 'USGS EarthExplorer',
        note: 'US Geological Survey — Landsat archive back to the 1970s (search coordinates manually)',
        url: 'https://earthexplorer.usgs.gov/'
      },
      {
        name: 'Google Earth Web',
        note: 'Google\'s composited high-resolution basemap for the same coordinates',
        url: 'https://earth.google.com/web/@'+lat.toFixed(6)+','+lon.toFixed(6)+',0a,20000d,35y,0h,0t,0r'
      },
      {
        name: 'Bhuvan (ISRO)',
        note: 'India\'s national satellite imagery portal, run by the Indian Space Research Organisation',
        url: 'https://bhuvan.nrsc.gov.in/'
      },
      {
        name: 'Zoom Earth',
        note: 'Recent near-real-time satellite mosaic, good for active weather and storms',
        url: 'https://zoom.earth/#view='+lat.toFixed(4)+','+lon.toFixed(4)+',8z'
      }
    ];

    providerResults.innerHTML = '';
    links.forEach(function(l){
      var a = document.createElement('a');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'search-result-item';
      a.style.display = 'block';
      a.style.textDecoration = 'none';
      a.innerHTML = '<strong style="color:var(--text-primary);">'+l.name+'</strong><br>'+l.note;
      providerResults.appendChild(a);
    });
  }

  updateLiveHint();

  var W = 320, H = 220;
  var beforeImg = null, afterImg = null;

  var fileInputs = {1:document.getElementById('file1'), 2:document.getElementById('file2')};
  var fnames = {1:document.getElementById('fname1'), 2:document.getElementById('fname2')};
  var previews = {1:document.getElementById('preview1'), 2:document.getElementById('preview2')};
  var zones = {1:document.getElementById('zone1'), 2:document.getElementById('zone2')};
  var analyzeBtn = document.getElementById('analyzeBtn');
  var demoBtn = document.getElementById('demoBtn');

  function checkReady(){
    analyzeBtn.disabled = !(beforeImg && afterImg);
  }

  function loadFileToImage(file, slot){
    if(!file || !file.type || file.type.indexOf('image')!==0) return;
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        if(slot===1) beforeImg = img; else afterImg = img;
        currentImageBBox = null;
        checkReady();
      };
      img.src = e.target.result;
      previews[slot].src = e.target.result;
      zones[slot].classList.add('has-image');
    };
    reader.readAsDataURL(file);
  }

  [1,2].forEach(function(slot){
    var zone = zones[slot], input = fileInputs[slot];

    zone.addEventListener('click', function(){ input.click(); });
    zone.addEventListener('keydown', function(e){
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); input.click(); }
    });

    input.addEventListener('change', function(e){
      if(e.target.files[0]){
        fnames[slot].textContent = e.target.files[0].name;
        loadFileToImage(e.target.files[0], slot);
      }
    });

    ['dragover','dragenter'].forEach(function(evt){
      zone.addEventListener(evt, function(e){
        e.preventDefault(); e.stopPropagation();
        zone.classList.add('drag');
      });
    });
    ['dragleave','dragend'].forEach(function(evt){
      zone.addEventListener(evt, function(e){
        zone.classList.remove('drag');
      });
    });
    zone.addEventListener('drop', function(e){
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('drag');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if(f){
        fnames[slot].textContent = f.name;
        loadFileToImage(f, slot);
      }
    });
  });

  function seededRand(seed){
    var s = seed;
    return function(){
      s = (s*1103515245+12345) & 0x7fffffff;
      return (s % 1000)/1000;
    };
  }

  function drawScene(ctx, before, seed){
    var rand = seededRand(seed);
    ctx.clearRect(0,0,W,H);

    ctx.fillStyle = '#8a7256';
    ctx.fillRect(0,0,W,H);
    for(var i=0;i<400;i++){
      var shade = 118 + Math.floor(rand()*30);
      ctx.fillStyle = 'rgba('+(shade+20)+','+(shade)+','+(shade-30)+',0.5)';
      ctx.fillRect(rand()*W, rand()*H, 3, 3);
    }

    var riverBandH = 46;
    var riverY = H - riverBandH;
    var riverW = before ? W : W*0.72;

    var vegW = before ? W*0.56 : W*0.30;
    ctx.fillStyle = '#2f8f46';
    ctx.fillRect(0,0,vegW, riverY);
    for(var v=0; v<650; v++){
      var gx = rand()*vegW, gy = rand()*riverY;
      var g = 130 + Math.floor(rand()*70);
      ctx.fillStyle = 'rgba('+Math.floor(g*0.35)+','+g+','+Math.floor(g*0.4)+',0.55)';
      ctx.fillRect(gx,gy,2.5,2.5);
    }

    var builtStart = before ? W*0.80 : W*0.52;
    ctx.fillStyle = '#9098a0';
    ctx.fillRect(builtStart,0, W-builtStart, riverY);
    var bStep = 12;
    for(var bx=builtStart; bx<W; bx+=bStep){
      for(var by=0; by<riverY; by+=bStep){
        if(rand()>0.28){
          var gray = 140+Math.floor(rand()*70);
          var roofTint = rand()>0.75 ? 40 : 0;
          ctx.fillStyle = 'rgb('+(gray+roofTint)+','+gray+','+gray+')';
          ctx.fillRect(bx+1,by+1,bStep-3,bStep-3);
        }
      }
    }
    ctx.fillStyle = 'rgba(210,205,195,0.55)';
    ctx.fillRect(builtStart, riverY*0.5-1, W-builtStart, 2);
    ctx.fillRect(builtStart+(W-builtStart)*0.5, 0, 2, riverY);

    ctx.fillStyle = '#2f7fbd';
    ctx.fillRect(0, riverY, riverW, riverBandH);
    for(var w2=0; w2<160; w2++){
      var wx = rand()*riverW, wy = riverY + rand()*riverBandH;
      var bshade = 90+Math.floor(rand()*80);
      ctx.fillStyle = 'rgba(30,'+Math.floor(bshade*0.7)+','+bshade+',0.5)';
      ctx.fillRect(wx,wy,3,2);
    }
    if(riverW < W){
      ctx.fillStyle = '#a08a63';
      ctx.fillRect(riverW, riverY, W-riverW, riverBandH);
    }

    return ctx.getImageData(0,0,W,H);
  }

  demoBtn.addEventListener('click', function(){
    var seed = 42;
    var c1 = document.createElement('canvas'); c1.width=W; c1.height=H;
    var c2 = document.createElement('canvas'); c2.width=W; c2.height=H;
    drawScene(c1.getContext('2d'), true, seed);
    drawScene(c2.getContext('2d'), false, seed+7);
    var d1url = c1.toDataURL(), d2url = c2.toDataURL();
    currentImageBBox = null;
    var i1 = new Image(); i1.onload=function(){ beforeImg = i1; checkReady(); };
    i1.src = d1url;
    var i2 = new Image(); i2.onload=function(){ afterImg = i2; checkReady(); };
    i2.src = d2url;
    fnames[1].textContent = 'demo-tile-before.png';
    fnames[2].textContent = 'demo-tile-after.png';
    previews[1].src = d1url; zones[1].classList.add('has-image');
    previews[2].src = d2url; zones[2].classList.add('has-image');
  });

  var CATS = ['veg','water','built','bare','other'];

  var CATS_INFO = [
    { key:'none',      label:'No significant change',              color:[0,0,0],       weight:0  },
    { key:'veg_loss',  label:'Vegetation loss',                     color:[251,107,91],  weight:70 },
    { key:'built',     label:'New construction / built-up expansion', color:[255,138,76],weight:80 },
    { key:'water',     label:'Water-body change',                   color:[56,189,248],  weight:65 },
    { key:'road',      label:'Road / infrastructure change',        color:[220,210,140], weight:55 },
    { key:'agri',      label:'Agricultural / land-use change',      color:[255,209,102], weight:35 },
    { key:'burn',      label:'Burned / damaged area',                color:[139,20,20],   weight:90 }
  ];

  function classifyChangeCategory(cb, ca, ndviDelta, brightB, brightA, colorD, ar, ag, ab){
    if(cb===ca) return { idx:0, conf:0 };
    if(ndviDelta < -0.22 && brightA < brightB*0.72){
      return { idx:6, conf:Math.min(0.92, 0.5+Math.abs(ndviDelta)) };
    }
    if(ca==='built' && cb!=='built'){
      var maxc=Math.max(ar,ag,ab), minc=Math.min(ar,ag,ab);
      var sat = maxc===0 ? 0 : (maxc-minc)/maxc;
      var bright = (ar+ag+ab)/3;
      if(sat<0.12 && bright>90 && bright<165) return { idx:4, conf:0.45 };
      return { idx:2, conf:0.8 };
    }
    if(cb==='water' || ca==='water') return { idx:3, conf:0.72 };
    if(cb==='veg' && ca!=='veg') return { idx:1, conf:0.6 };
    if((cb==='bare' && ca==='veg') || (cb==='veg' && ca==='bare') || (cb==='bare' && ca==='bare')) return { idx:5, conf:0.5 };
    if(colorD>40) return { idx:5, conf:0.3 };
    return { idx:0, conf:0 };
  }

  var currentAnalysisType = 'environmental';

  var lastCategoryMap = null;
  var lastConfidenceMap = null;
  var lastMask = null;
  var lastCategoryCounts = null;
  var lastCategoryConfSum = null;
  var lastPrimaryCatIdx = 0;
  var lastOverallConfidence = 0;
  var lastAreaKm2 = 2.4;
  var observations = [];

  function dist2(a,b){
    var dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
    return dr*dr+dg*dg+db*db;
  }
  function nearestCentroidIdx(pt, centroids){
    var best=0, bestD=Infinity;
    for(var c=0;c<centroids.length;c++){
      var d = dist2(pt,centroids[c]);
      if(d<bestD){ bestD=d; best=c; }
    }
    return best;
  }
  function kppInit(samples, k){
    var centroids = [ samples[Math.floor(Math.random()*samples.length)] ];
    while(centroids.length < k){
      var bestPt=null, bestDist=-1;
      for(var i=0;i<samples.length;i+=3){
        var d = dist2(samples[i], centroids[nearestCentroidIdx(samples[i],centroids)]);
        if(d>bestDist){ bestDist=d; bestPt=samples[i]; }
      }
      centroids.push(bestPt);
    }
    return centroids;
  }
  function kmeansFit(dataB, dataA, k, iterations){
    var samples = [];
    var totalPx = W*H, step = 6;
    for(var p=0;p<totalPx;p+=step){
      var i=p*4;
      samples.push([dataB.data[i],dataB.data[i+1],dataB.data[i+2]]);
      samples.push([dataA.data[i],dataA.data[i+1],dataA.data[i+2]]);
    }
    var centroids = kppInit(samples, k);
    for(var it=0; it<iterations; it++){
      var sums = []; for(var c=0;c<k;c++) sums.push([0,0,0,0]);
      for(var s=0;s<samples.length;s++){
        var idx = nearestCentroidIdx(samples[s], centroids);
        sums[idx][0]+=samples[s][0]; sums[idx][1]+=samples[s][1]; sums[idx][2]+=samples[s][2]; sums[idx][3]++;
      }
      for(var ci=0; ci<k; ci++){
        if(sums[ci][3]>0) centroids[ci] = [sums[ci][0]/sums[ci][3], sums[ci][1]/sums[ci][3], sums[ci][2]/sums[ci][3]];
      }
    }
    return centroids;
  }
  function labelCentroid(rgb){
    var r=rgb[0], g=rgb[1], b=rgb[2];
    var maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
    var sat = maxc===0 ? 0 : (maxc-minc)/maxc;
    var bright = (r+g+b)/3;
    if(g > r*1.12 && g > b*1.12 && g > 50) return 'veg';
    if(b > r*1.12 && b > g*1.02 && b > 50) return 'water';
    if(sat < 0.14 && bright > 115) return 'built';
    if(r>80 && g>60 && b>40 && r>=b && sat<0.38) return 'bare';
    return 'other';
  }
  function classifyImageFull(data, centroids){
    var totalPx = W*H;
    var labels = new Uint8Array(totalPx);
    for(var p=0;p<totalPx;p++){
      var i=p*4;
      labels[p] = nearestCentroidIdx([data.data[i],data.data[i+1],data.data[i+2]], centroids);
    }
    return labels;
  }

  function colorDist(d1,d2,i){
    var dr=d1[i]-d2[i], dg=d1[i+1]-d2[i+1], db=d1[i+2]-d2[i+2];
    return Math.sqrt(dr*dr+dg*dg+db*db);
  }

  function buildRoiMask(bbox){
    var mask = new Uint8Array(W*H);
    if(!roiPolygon || !bbox){
      mask.fill(1);
      return mask;
    }
    for(var y=0;y<H;y++){
      var lat = bbox.maxLat - (y/H)*(bbox.maxLat-bbox.minLat);
      for(var x=0;x<W;x++){
        var lon = bbox.minLon + (x/W)*(bbox.maxLon-bbox.minLon);
        mask[y*W+x] = pointInPolygon(lon, lat, roiPolygon) ? 1 : 0;
      }
    }
    return mask;
  }

  var scans = [document.getElementById('scanBefore'),document.getElementById('scanAfter'),document.getElementById('scanDiff')];

  analyzeBtn.addEventListener('click', function(){
    document.getElementById('emptyState').style.display='none';
    document.getElementById('results').style.display='block';

    var cvBefore = document.getElementById('canvasBefore');
    var cvAfter = document.getElementById('canvasAfter');
    var cvDiff = document.getElementById('canvasDiff');
    [cvBefore,cvAfter,cvDiff].forEach(function(c){c.width=W;c.height=H;});

    var ctxB = cvBefore.getContext('2d');
    var ctxA = cvAfter.getContext('2d');
    var ctxD = cvDiff.getContext('2d');

    ctxB.drawImage(beforeImg,0,0,W,H);
    ctxA.drawImage(afterImg,0,0,W,H);

    scans.forEach(function(s){ s.classList.remove('active'); void s.offsetWidth; s.classList.add('active'); });

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ Processing…';

    setTimeout(function(){
      runDetection(ctxB, ctxA, ctxD);
      maybeCallBackendModel(cvBefore, cvAfter);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '🔍 Analyze Changes';
    }, 900);
  });

  function maybeCallBackendModel(cvBefore, cvAfter){
    var endpoint = document.getElementById('apiEndpoint').value.trim();
    var hint = document.getElementById('engineHint');
    if(!endpoint){
      hint.innerHTML = 'Classification engine: <span class="badge badge-demo">DEMO / PROTOTYPE</span> heuristic pipeline (k-means colour clusters + NDVI/NDWI-proxy rules) — runs entirely in your browser. See Methodology section below for the real-model architecture.';
      return;
    }
    hint.innerHTML = 'Classification engine: <span class="badge badge-demo">CONTACTING BACKEND…</span>';
    var payload = {
      before_image: cvBefore.toDataURL('image/jpeg',0.85),
      after_image: cvAfter.toDataURL('image/jpeg',0.85),
      bbox: currentImageBBox, date1: document.getElementById('d1').value, date2: document.getElementById('d2').value
    };
    fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(res){
        hint.innerHTML = 'Classification engine: <span class="badge badge-real">REAL MODEL</span> response received from '+endpoint+
          (res.model_name ? ' ('+res.model_name+')' : '')+'. Demo heuristic results above are kept as a cross-check.';
        if(res.category && lastStats){
          document.getElementById('intelPanel').insertAdjacentHTML('afterbegin',
            '<div class="explain-reason" style="margin-bottom:12px;"><b>Backend model result:</b> '+res.category+
            (res.confidence!=null ? ' · confidence '+Math.round(res.confidence*100)+'%' : '')+'</div>');
        }
      })
      .catch(function(err){
        hint.innerHTML = 'Classification engine: <span class="badge badge-demo">DEMO / PROTOTYPE</span> (backend call failed — '+err.message+'). Using in-browser heuristic results above.';
      });
  }

  var lastStats = null;

  function ndviApprox(data, i){
    var g = data[i+1], b = data[i+2];
    return (g-b)/(g+b+1);
  }
  function ndviColor(v){
    var t = Math.max(0, Math.min(1, (v+1)/2));
    if(t<0.5){
      var t2=t/0.5;
      return [Math.round(140-40*t2), Math.round(100+90*t2), Math.round(70-20*t2)];
    } else {
      var t3=(t-0.5)/0.5;
      return [Math.round(100-60*t3), Math.round(190+30*t3), Math.round(50+30*t3)];
    }
  }

  function runDetection(ctxB, ctxA, ctxD){
    var dataB = ctxB.getImageData(0,0,W,H);
    var dataA = ctxA.getImageData(0,0,W,H);

    var mask = buildRoiMask(currentImageBBox);
    var maskedTotal = 0;
    for(var m=0;m<mask.length;m++) if(mask[m]) maskedTotal++;
    if(maskedTotal===0){ mask.fill(1); maskedTotal = W*H; }

    var centroids = kmeansFit(dataB, dataA, 5, 6);
    var centroidLabels = centroids.map(labelCentroid);
    var labelsB = classifyImageFull(dataB, centroids);
    var labelsA = classifyImageFull(dataA, centroids);

    ctxD.drawImage(document.getElementById('canvasAfter'),0,0);
    var base = ctxD.getImageData(0,0,W,H);

    var counts = {before:{veg:0,water:0,built:0,bare:0,other:0}, after:{veg:0,water:0,built:0,bare:0,other:0}};
    var changedPixels = 0;

    var categoryMap = new Uint8Array(W*H);
    var confidenceMap = new Float32Array(W*H);
    var categoryCounts = [0,0,0,0,0,0,0];
    var categoryConfSum = [0,0,0,0,0,0,0];

    for(var p=0;p<W*H;p++){
      if(!mask[p]){
        var oi0 = p*4;
        base.data[oi0]=base.data[oi0]*0.25; base.data[oi0+1]=base.data[oi0+1]*0.25; base.data[oi0+2]=base.data[oi0+2]*0.25;
        continue;
      }
      var i = p*4;
      var cb = centroidLabels[labelsB[p]];
      var ca = centroidLabels[labelsA[p]];
      counts.before[cb]++; counts.after[ca]++;

      var overlayColor = null;
      if(cb!==ca){
        changedPixels++;

        var ndviB = ndviApprox(dataB.data, i), ndviA = ndviApprox(dataA.data, i);
        var brightB = (dataB.data[i]+dataB.data[i+1]+dataB.data[i+2])/3;
        var brightA = (dataA.data[i]+dataA.data[i+1]+dataA.data[i+2])/3;
        var cDist = colorDist(dataB.data, dataA.data, i);
        var cat = classifyChangeCategory(cb, ca, ndviA-ndviB, brightB, brightA, cDist,
          dataA.data[i], dataA.data[i+1], dataA.data[i+2]);

        categoryMap[p] = cat.idx;
        confidenceMap[p] = cat.conf;
        if(cat.idx>0){
          categoryCounts[cat.idx]++;
          categoryConfSum[cat.idx]+=cat.conf;
          overlayColor = CATS_INFO[cat.idx].color;
        } else if(cDist > 40){
          overlayColor=[255,209,102];
        }
      }

      if(overlayColor){
        base.data[i]   = base.data[i]*0.35 + overlayColor[0]*0.65;
        base.data[i+1] = base.data[i+1]*0.35 + overlayColor[1]*0.65;
        base.data[i+2] = base.data[i+2]*0.35 + overlayColor[2]*0.65;
      }
    }
    ctxD.putImageData(base,0,0);

    var primaryIdx = 0, primaryCount = 0;
    for(var ci=1; ci<CATS_INFO.length; ci++){
      if(categoryCounts[ci] > primaryCount){ primaryCount = categoryCounts[ci]; primaryIdx = ci; }
    }
    var overallConfidence = primaryIdx>0 ? (categoryConfSum[primaryIdx]/categoryCounts[primaryIdx]) : 0;

    lastCategoryMap = categoryMap;
    lastConfidenceMap = confidenceMap;
    lastMask = mask;
    lastCategoryCounts = categoryCounts;
    lastCategoryConfSum = categoryConfSum;
    lastPrimaryCatIdx = primaryIdx;
    lastOverallConfidence = overallConfidence;

    function pct(o,k){ return o[k]/maskedTotal*100; }
    var vegBefore = pct(counts.before,'veg'), vegAfter = pct(counts.after,'veg');
    var waterBefore = pct(counts.before,'water'), waterAfter = pct(counts.after,'water');
    var builtBefore = pct(counts.before,'built'), builtAfter = pct(counts.after,'built');

    var vegChange = vegAfter - vegBefore;
    var waterChange = waterAfter - waterBefore;
    var builtChange = builtAfter - builtBefore;
    var changedPct = changedPixels/maskedTotal*100;

    var areaKm2 = roiBoundsLL ? estimateAreaKm2(roiBoundsLL) : 2.4;
    var changedArea = (areaKm2*changedPct/100).toFixed(2);
    lastAreaKm2 = areaKm2;

    lastStats = {vegBefore,vegAfter,waterBefore,waterAfter,builtBefore,builtAfter,vegChange,waterChange,builtChange,changedPct,areaKm2,changedArea,
      primaryCatIdx:primaryIdx, confidence:overallConfidence, categoryCounts:categoryCounts, maskedTotal:maskedTotal};

    renderStats(lastStats);
    populateCompareSlider();

    if(analysisMode==='ndvi'){
      runNdviAnalysis(dataB, dataA, mask, maskedTotal);
    } else {
      ndviSection.style.display = 'none';
      lastStats.ndvi = null;
    }
  }

  function estimateAreaKm2(bbox){
    var latMid = (bbox.minLat+bbox.maxLat)/2;
    var kmPerDegLat = 111.32;
    var kmPerDegLon = 111.32 * Math.cos(latMid*Math.PI/180);
    var h = (bbox.maxLat-bbox.minLat)*kmPerDegLat;
    var w = (bbox.maxLon-bbox.minLon)*kmPerDegLon;
    return Math.max(0.01, w*h);
  }

  function runNdviAnalysis(dataB, dataA, mask, maskedTotal){
    var cvB = document.getElementById('canvasNdviBefore');
    var cvA = document.getElementById('canvasNdviAfter');
    cvB.width=W; cvB.height=H; cvA.width=W; cvA.height=H;
    var ctxNB = cvB.getContext('2d'), ctxNA = cvA.getContext('2d');
    var outB = ctxNB.createImageData(W,H), outA = ctxNA.createImageData(W,H);

    var sumBefore=0, sumAfter=0;
    for(var p=0;p<W*H;p++){
      var i=p*4;
      var vB = mask[p] ? ndviApprox(dataB.data,i) : 0;
      var vA = mask[p] ? ndviApprox(dataA.data,i) : 0;
      if(mask[p]){ sumBefore+=vB; sumAfter+=vA; }
      var cB = mask[p] ? ndviColor(vB) : [10,14,20];
      var cA = mask[p] ? ndviColor(vA) : [10,14,20];
      outB.data[i]=cB[0]; outB.data[i+1]=cB[1]; outB.data[i+2]=cB[2]; outB.data[i+3]=255;
      outA.data[i]=cA[0]; outA.data[i+1]=cA[1]; outA.data[i+2]=cA[2]; outA.data[i+3]=255;
    }
    ctxNB.putImageData(outB,0,0);
    ctxNA.putImageData(outA,0,0);

    var meanBefore = sumBefore/maskedTotal, meanAfter = sumAfter/maskedTotal;
    lastStats.ndvi = { meanBefore:meanBefore, meanAfter:meanAfter, delta:meanAfter-meanBefore };

    document.getElementById('ndviD1Label').textContent = document.getElementById('d1').value;
    document.getElementById('ndviD2Label').textContent = document.getElementById('d2').value;
    document.getElementById('ndviBeforeVal').textContent = meanBefore.toFixed(3);
    document.getElementById('ndviAfterVal').textContent = meanAfter.toFixed(3);
    var d = meanAfter-meanBefore;
    document.getElementById('ndviDeltaVal').textContent = (d>=0?'+':'')+d.toFixed(3);
    ndviSection.style.display = 'block';
  }

  var compareWrap = document.getElementById('compareWrap');
  var compareHandle = document.getElementById('compareHandle');
  var compareBeforeCanvas = document.getElementById('compareBeforeCanvas');
  var compareAfterCanvas = document.getElementById('compareAfterCanvas');
  var comparePct = 50;

  function populateCompareSlider(){
    compareBeforeCanvas.width=W; compareBeforeCanvas.height=H;
    compareAfterCanvas.width=W; compareAfterCanvas.height=H;
    compareBeforeCanvas.getContext('2d').drawImage(document.getElementById('canvasBefore'),0,0);
    compareAfterCanvas.getContext('2d').drawImage(document.getElementById('canvasAfter'),0,0);
    setComparePct(50);
  }
  function setComparePct(pct){
    comparePct = Math.max(0, Math.min(100, pct));
    compareBeforeCanvas.style.clipPath = 'inset(0 '+(100-comparePct)+'% 0 0)';
    compareHandle.style.left = comparePct+'%';
  }
  function comparePointerHandler(e){
    var rect = compareWrap.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    setComparePct((x/rect.width)*100);
  }
  var dragging = false;
  compareWrap.addEventListener('pointerdown', function(e){ dragging=true; comparePointerHandler(e); });
  window.addEventListener('pointermove', function(e){ if(dragging) comparePointerHandler(e); });
  window.addEventListener('pointerup', function(){ dragging=false; });

  function fmtSigned(n){
    var s = n>=0? '+':'';
    return s+n.toFixed(1)+'%';
  }

  function renderStats(s){
    document.getElementById('valBuiltup').textContent = fmtSigned(s.builtChange);
    document.getElementById('valVeg').textContent = fmtSigned(s.vegChange);
    document.getElementById('valWater').textContent = fmtSigned(s.waterChange);

    document.getElementById('barBuiltup').style.width = Math.min(100,Math.abs(s.builtChange)*4)+'%';
    document.getElementById('barVeg').style.width = Math.min(100,Math.abs(s.vegChange)*4)+'%';
    document.getElementById('barWater').style.width = Math.min(100,Math.abs(s.waterChange)*4)+'%';

    document.getElementById('cardBuiltup').className = 'stat-card '+(s.builtChange>=0?'up':'down');
    document.getElementById('cardVeg').className = 'stat-card '+(s.vegChange>=0?'up':'down');
    document.getElementById('cardWater').className = 'stat-card '+(s.waterChange>=0?'up':'down');

    document.getElementById('areaKm').textContent = s.areaKm2.toFixed(1)+' km² tile ('+s.changedArea+' km² changed)';
    document.getElementById('pctChanged').textContent = s.changedPct.toFixed(1)+'% of pixels';
    document.getElementById('pctLabel').textContent = s.changedPct.toFixed(1)+'% changed';

    var locName = currentPlaceName;
    var d1 = document.getElementById('d1').value, d2 = document.getElementById('d2').value;
    document.getElementById('d1Label').textContent = d1;
    document.getElementById('d2Label').textContent = d2;
    document.getElementById('locEcho').textContent = locName+' · '+d1+' → '+d2;
    document.getElementById('footerStamp').textContent = 'Last run: '+new Date().toISOString().replace('T',' ').slice(0,19)+' UTC';

    var alertBox = document.getElementById('alertBox');
    if(s.vegChange <= -8 || s.waterChange <= -5){
      alertBox.className = 'alert severe';
      alertBox.innerHTML = '<span class="glyph">⚠️</span><div><b>Significant environmental change detected</b>'+
        'Vegetation and/or water coverage dropped sharply between '+d1+' and '+d2+' in '+locName+'. Recommend flagging this tile for review.</div>';
    } else if(s.builtChange >= 10){
      alertBox.className = 'alert moderate';
      alertBox.innerHTML = '<span class="glyph">🏗️</span><div><b>Rapid built-up expansion detected</b>'+
        'Built-up area increased by '+s.builtChange.toFixed(1)+' percentage points, consistent with new construction or urban expansion.</div>';
    } else {
      alertBox.className = 'alert calm';
      alertBox.innerHTML = '<span class="glyph">✅</span><div><b>No major anomalies</b>'+
        'Change levels are within an ordinary range for this tile and time span.</div>';
    }

    var sev = computeSeverity(s);
    lastStats.severity = sev;
    renderSeverity(sev);
    renderExplainDefault(sev);
    renderWarnings(sev, s, locName, d1, d2);
    renderIntelSummary(sev, s, locName, d1, d2);
    document.getElementById('addObservationBtn').disabled = false;
  }

  var ATYPE_CAT_BOOST = {
    deforestation: 1, water: 3, urban: 2, disaster: 3, burn: 6, agri: 5, environmental: 0
  };

  function computeSeverity(s){
    var areaFactor = Math.min(1, s.changedPct/40) * 100;
    var absAreaFactor = Math.min(1, parseFloat(s.changedArea)/5) * 100;
    var catInfo = CATS_INFO[s.primaryCatIdx] || CATS_INFO[0];
    var categoryWeight = catInfo.weight;
    var boostIdx = ATYPE_CAT_BOOST[currentAnalysisType];
    if(boostIdx && s.categoryCounts && s.categoryCounts[boostIdx] > 0){
      var boostShare = s.categoryCounts[boostIdx] / Math.max(1, s.categoryCounts.reduce(function(a,b){return a+b;},0));
      categoryWeight = Math.max(categoryWeight, CATS_INFO[boostIdx].weight * (0.5 + 0.5*boostShare));
    }
    var confidenceFactor = (s.confidence||0) * 100;

    var persistenceFactor = 50;
    var persistenceNote = 'No multi-temporal history for this ROI yet — persistence held neutral.';
    if(observations.length >= 1){
      var last = observations[observations.length-1];
      var sameDirVeg = (s.vegChange<0) === (last.vegAfter - (observations.length>1?observations[observations.length-2].vegAfter:last.vegAfter) < 0);
      var consistentRuns = observations.filter(function(o){ return (o.vegAfter < 0) === (s.vegChange<0); }).length;
      persistenceFactor = Math.min(100, 40 + observations.length*15);
      persistenceNote = observations.length+' prior observation(s) on record for this ROI — change appears '+(observations.length>=2?'part of an ongoing multi-year trend.':'to be building a trend; add more observations to confirm.');
    }

    var score = areaFactor*0.30 + absAreaFactor*0.15 + categoryWeight*0.30 + confidenceFactor*0.15 + persistenceFactor*0.10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    var band = score<=25 ? 'Low' : score<=50 ? 'Moderate' : score<=75 ? 'High' : 'Critical';
    var bandClass = score<=25 ? 'sev-low' : score<=50 ? 'sev-moderate' : score<=75 ? 'sev-high' : 'sev-critical';
    var bandColor = score<=25 ? 'var(--veg)' : score<=50 ? 'var(--yellow)' : score<=75 ? 'var(--amber)' : 'var(--red)';

    var reason = 'Primary driver: <b>'+catInfo.label+'</b> across '+s.changedPct.toFixed(1)+'% of the analyzed tile ('+s.changedArea+' km²). '+
      'Score = 0.30×area% + 0.15×absolute-area + 0.30×category-risk + 0.15×confidence + 0.10×persistence. '+persistenceNote;

    return {
      score: score, band: band, bandClass: bandClass, bandColor: bandColor, reason: reason,
      catInfo: catInfo, areaFactor: areaFactor, absAreaFactor: absAreaFactor,
      categoryWeight: categoryWeight, confidenceFactor: confidenceFactor, persistenceFactor: persistenceFactor
    };
  }

  function renderSeverity(sev){
    var scoreEl = document.getElementById('severityScore');
    scoreEl.textContent = sev.score;
    scoreEl.style.color = sev.bandColor;
    var bandEl = document.getElementById('severityBand');
    bandEl.textContent = sev.band.toUpperCase();
    bandEl.className = 'severity-band '+sev.bandClass;
    var fill = document.getElementById('severityBarFill');
    fill.style.width = sev.score+'%';
    fill.style.background = sev.bandColor;
    document.getElementById('sevFactorArea').textContent = lastStats.changedArea+' km² ('+lastStats.changedPct.toFixed(1)+'%)';
    document.getElementById('sevFactorCategory').textContent = sev.catInfo.label;
    document.getElementById('sevFactorConfidence').textContent = Math.round(sev.confidenceFactor)+'%';
    document.getElementById('sevFactorPersistence').textContent = observations.length+' obs.';
    document.getElementById('severityReason').innerHTML = sev.reason;
  }

  function buildExplanationHTML(catIdx, conf, areaHa, source){
    var cat = CATS_INFO[catIdx] || CATS_INFO[0];
    if(catIdx===0){
      return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);">No significant change classified at this point — colours here matched between before/after under the current classifier.</div>';
    }
    var sev = lastStats.severity;
    var html = '<div class="explain-grid">'+
      '<div>Primary change<b>'+cat.label+'</b></div>'+
      '<div>Affected area (local)<b>'+areaHa.toFixed(2)+' ha</b></div>'+
      '<div>Model confidence<b>'+Math.round(conf*100)+'%</b></div>'+
      '<div>Severity<b style="color:'+(sev?sev.bandColor:'inherit')+'">'+(sev?sev.band.toUpperCase():'—')+'</b></div>'+
      '</div>'+
      '<div class="explain-reason"><b>Reason:</b> '+explanationReason(cat.key)+' ('+source+')</div>';
    return html;
  }
  function explanationReason(key){
    switch(key){
      case 'veg_loss': return 'A pixel that classified as vegetation before the change no longer does after it, without matching the built-up or burn signatures — consistent with clearing, thinning, or die-off.';
      case 'built': return 'A pixel that was not built-up before now matches the built-up colour cluster (low saturation, brighter, grey/roof-like tone) — consistent with new construction.';
      case 'water': return 'Water classification changed between the two dates at this location — consistent with a water body expanding, shrinking, or shifting.';
      case 'road': return 'A newly built-up pixel has a low-saturation, mid-brightness tone resembling paved surface rather than rooftops — a weak heuristic signal for road/infrastructure, flagged with lower confidence.';
      case 'agri': return 'A transition between bare soil and vegetation was detected — consistent with a crop cycle, tilling, or other reversible land-use change rather than permanent conversion.';
      case 'burn': return 'A sharp drop in brightness combined with a sharp loss of the greenness index between the two dates — consistent with burn scarring or structural damage, not simple seasonal change.';
      default: return 'Colour signature changed beyond the classifier\'s noise threshold, but did not match a specific category confidently.';
    }
  }
  function renderExplainDefault(sev){
    if(!lastCategoryCounts) return;
    var body = document.getElementById('explainBody');
    var catIdx = sev.catInfo === CATS_INFO[0] ? 0 : CATS_INFO.indexOf(sev.catInfo);
    if(catIdx<=0){
      body.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);">No dominant change category for this run. Click a coloured area on the AI Change Map for a pixel-level look.</div>';
      return;
    }
    var conf = lastCategoryConfSum[catIdx] / Math.max(1,lastCategoryCounts[catIdx]);
    var pxShare = lastCategoryCounts[catIdx] / lastStats.maskedTotal;
    var areaHa = lastAreaKm2 * pxShare * 100;
    body.innerHTML = buildExplanationHTML(catIdx, conf, areaHa, 'region-wide summary — click the map for a specific point');
  }

  document.getElementById('canvasDiff').addEventListener('click', function(e){
    if(!lastCategoryMap) return;
    var rect = this.getBoundingClientRect();
    var x = Math.floor((e.clientX-rect.left)/rect.width*W);
    var y = Math.floor((e.clientY-rect.top)/rect.height*H);
    if(x<0||x>=W||y<0||y>=H) return;

    var counts = {}, confSum = {}, n=0;
    var win=6;
    for(var dy=-win;dy<=win;dy++){
      for(var dx=-win;dx<=win;dx++){
        var xx=x+dx, yy=y+dy;
        if(xx<0||xx>=W||yy<0||yy>=H) continue;
        var p = yy*W+xx;
        if(!lastMask[p]) continue;
        var c = lastCategoryMap[p];
        counts[c] = (counts[c]||0)+1;
        confSum[c] = (confSum[c]||0)+lastConfidenceMap[p];
        n++;
      }
    }
    if(n===0) return;
    var bestIdx=0, bestCount=-1;
    Object.keys(counts).forEach(function(k){ if(counts[k]>bestCount){ bestCount=counts[k]; bestIdx=parseInt(k,10);} });
    var conf = bestIdx>0 ? confSum[bestIdx]/counts[bestIdx] : 0;
    var pxShare = bestCount/n;
    var windowAreaKm2 = lastAreaKm2 * ((win*2+1)*(win*2+1)/(W*H));
    var areaHa = windowAreaKm2 * pxShare * 100;

    document.getElementById('explainBody').innerHTML = buildExplanationHTML(bestIdx, conf, areaHa, 'clicked point ('+x+','+y+')');
    document.getElementById('explainPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
  });

  function renderWarnings(sev, s, locName, d1, d2){
    var panel = document.getElementById('warningPanel');
    var extra = '';
    if(s.builtBefore < 3 && s.builtAfter - s.builtBefore >= 4){
      extra = '<div class="warning-item mod" style="margin-top:8px;">'+
        '<span class="glyph">🏗️</span>'+
        '<div><b>New construction on previously undeveloped land <span class="badge badge-demo" style="margin-left:6px;">DEMO HEURISTIC</span></b>'+
        'Built-up coverage went from '+s.builtBefore.toFixed(1)+'% to '+s.builtAfter.toFixed(1)+'% in a tile that had almost no built-up area before — worth checking against local land records/permits, since this is not connected to any permit or zoning database.'+
        '<div class="warning-meta">This is a pixel-change signal, not a legal determination of unauthorized construction. Verify with municipal/land records before acting on it.</div>'+
        '</div></div>';
    }
    if(sev.score <= 25){
      panel.innerHTML = extra;
      return;
    }
    var cls = sev.score<=50 ? 'mod' : sev.score<=75 ? 'high' : 'crit';
    var glyph = sev.score<=50 ? '🔶' : sev.score<=75 ? '🟠' : '🚨';
    var priority = sev.score<=50 ? 'MODERATE PRIORITY CHANGE' : sev.score<=75 ? 'HIGH PRIORITY CHANGE' : 'CRITICAL PRIORITY CHANGE';
    panel.innerHTML = '<div class="warning-item '+cls+'">'+
      '<span class="glyph">'+glyph+'</span>'+
      '<div><b>'+priority+'</b>'+
      'Location: '+locName+'<br>Type: '+sev.catInfo.label+'<br>Affected area: '+s.changedArea+' km²<br>Severity: '+sev.band+' ('+sev.score+'/100)'+
      '<div class="warning-meta">Confidence '+Math.round(sev.confidenceFactor)+'% · '+d1+' → '+d2+' · Alert threshold: severity > 25</div>'+
      '</div></div>' + extra;
  }

  function recommendAction(sev){
    if(sev.score>=76) return 'Priority investigation — dispatch field verification as soon as possible.';
    if(sev.score>=51) return 'Field verification recommended within the normal review cycle.';
    if(sev.score>=26) return 'Continued monitoring — re-check this ROI at the next available pass.';
    return 'No action required — change is within an ordinary range.';
  }
  function renderIntelSummary(sev, s, locName, d1, d2){
    var findings = [];
    findings.push(sev.catInfo.label+' is the dominant change category ('+s.changedPct.toFixed(1)+'% of the tile).');
    if(s.builtBefore < 3 && s.builtAfter - s.builtBefore >= 4) findings.push('New construction appeared on land with almost no prior built-up presence ('+s.builtBefore.toFixed(1)+'% → '+s.builtAfter.toFixed(1)+'%) — a heuristic flag only, verify against land records before treating as unauthorized.');
    if(Math.abs(s.vegChange)>=2) findings.push('Vegetation cover '+(s.vegChange<0?'decreased':'increased')+' by '+Math.abs(s.vegChange).toFixed(1)+' percentage points.');
    if(Math.abs(s.waterChange)>=1) findings.push('Water coverage '+(s.waterChange<0?'decreased':'increased')+' by '+Math.abs(s.waterChange).toFixed(1)+' percentage points.');
    if(Math.abs(s.builtChange)>=1) findings.push('Built-up area '+(s.builtChange<0?'decreased':'increased')+' by '+Math.abs(s.builtChange).toFixed(1)+' percentage points.');
    if(findings.length<3) findings.push('Model confidence for the primary category is '+Math.round(sev.confidenceFactor)+'%.');

    var html = '<div class="panel-label">AI Change Intelligence <span class="badge badge-demo" style="margin-left:8px;">DEMO MODEL — computed from actual pixel stats, heuristic classifier</span></div>'+
      '<div class="intel-grid">'+
        '<div>Location: <b>'+locName+'</b></div><div>Primary change: <b>'+sev.catInfo.label+'</b></div>'+
        '<div>Before date: <b>'+d1+'</b></div><div>Affected area: <b>'+s.changedArea+' km²</b></div>'+
        '<div>After date: <b>'+d2+'</b></div><div>Change percentage: <b>'+s.changedPct.toFixed(1)+'%</b></div>'+
        '<div>Severity: <b style="color:'+sev.bandColor+'">'+sev.band+' ('+sev.score+'/100)</b></div><div>Confidence: <b>'+Math.round(sev.confidenceFactor)+'%</b></div>'+
      '</div>'+
      '<div><b style="color:var(--text-primary);font-family:var(--font-mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;">Key findings</b>'+
      '<ol class="intel-findings">'+findings.slice(0,4).map(function(f){return '<li>'+f+'</li>';}).join('')+'</ol></div>'+
      '<div class="intel-action"><b>Recommended action:</b> '+recommendAction(sev)+'</div>';
    document.getElementById('intelPanel').innerHTML = html;
  }

  document.getElementById('addObservationBtn').addEventListener('click', function(){
    if(!lastStats) return;
    var d1 = document.getElementById('d1').value, d2 = document.getElementById('d2').value;
    var isDemo = !currentImageBBox;
    observations.push({
      date1:d1, date2:d2, location:currentPlaceName,
      vegAfter:lastStats.vegAfter, waterAfter:lastStats.waterAfter, builtAfter:lastStats.builtAfter,
      changedPct:lastStats.changedPct, severity:lastStats.severity ? lastStats.severity.score : 0,
      demo:isDemo
    });
    observations.sort(function(a,b){ return a.date2 < b.date2 ? -1 : 1; });
    renderMultiTemporal();
  });
  document.getElementById('clearObservationsBtn').addEventListener('click', function(){
    observations = [];
    renderMultiTemporal();
  });

  function renderMultiTemporal(){
    var empty = document.getElementById('mtEmpty');
    var content = document.getElementById('mtContent');
    if(observations.length===0){ empty.style.display='block'; content.style.display='none'; return; }
    empty.style.display='none'; content.style.display='block';

    var anyReal = observations.some(function(o){ return !o.demo; });
    var anyDemo = observations.some(function(o){ return o.demo; });
    document.getElementById('mtBadge').className = 'badge '+(anyReal && !anyDemo ? 'badge-real' : 'badge-demo');
    document.getElementById('mtBadge').textContent = anyReal && !anyDemo ? 'REAL OBSERVATIONS' : (anyReal ? 'MIXED REAL + DEMO' : 'DEMO DATA');

    var list = document.getElementById('mtList');
    list.innerHTML = observations.map(function(o,idx){
      return '<div class="mt-list-item"><span>'+o.date2+' · '+o.location+' '+(o.demo?'<span class="badge badge-demo" style="margin-left:6px;padding:1px 7px;">DEMO</span>':'<span class="badge badge-real" style="margin-left:6px;padding:1px 7px;">REAL</span>')+'</span>'+
        '<span>veg '+o.vegAfter.toFixed(1)+'% · water '+o.waterAfter.toFixed(1)+'% · built '+o.builtAfter.toFixed(1)+'% · sev '+o.severity+'</span></div>';
    }).join('');

    drawTrendChart();

    if(observations.length>=2){
      var first = observations[0], lastObs = observations[observations.length-1];
      var years = Math.max(1, (new Date(lastObs.date2) - new Date(first.date2)) / (365.25*24*3600*1000));
      var cumVeg = lastObs.vegAfter - first.vegAfter;
      var cumBuilt = lastObs.builtAfter - first.builtAfter;
      var cumWater = lastObs.waterAfter - first.waterAfter;
      document.getElementById('mtSummary').innerHTML =
        '<span>Cumulative vegetation change: <b>'+fmtSigned(cumVeg)+'</b></span>'+
        '<span>Cumulative built-up change: <b>'+fmtSigned(cumBuilt)+'</b></span>'+
        '<span>Cumulative water change: <b>'+fmtSigned(cumWater)+'</b></span>'+
        '<span>Rate of vegetation change: <b>'+(cumVeg/years>=0?'+':'')+(cumVeg/years).toFixed(2)+' pts/yr</b></span>';
    } else {
      document.getElementById('mtSummary').innerHTML = '<span style="color:var(--text-faint);">Add at least 2 observations to see cumulative change and rate of change.</span>';
    }
  }

  function drawTrendChart(){
    var canvas = document.getElementById('mtChart');
    var cw = canvas.width, ch = canvas.height;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,cw,ch);
    ctx.fillStyle = '#0b1420'; ctx.fillRect(0,0,cw,ch);
    if(observations.length===0) return;

    var padL=36, padR=14, padT=14, padB=26;
    var plotW = cw-padL-padR, plotH = ch-padT-padB;
    var maxVal = 100;

    ctx.strokeStyle = 'rgba(124,143,166,0.15)'; ctx.lineWidth=1; ctx.font='10px monospace'; ctx.fillStyle='#7c8fa6';
    for(var gv=0; gv<=100; gv+=25){
      var gy = padT + plotH - (gv/maxVal)*plotH;
      ctx.beginPath(); ctx.moveTo(padL,gy); ctx.lineTo(cw-padR,gy); ctx.stroke();
      ctx.fillText(gv+'%', 4, gy+3);
    }

    function plot(key, color){
      ctx.strokeStyle = color; ctx.lineWidth=2; ctx.beginPath();
      observations.forEach(function(o,idx){
        var x = padL + (observations.length===1 ? plotW/2 : (idx/(observations.length-1))*plotW);
        var y = padT + plotH - (o[key]/maxVal)*plotH;
        if(idx===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      observations.forEach(function(o,idx){
        var x = padL + (observations.length===1 ? plotW/2 : (idx/(observations.length-1))*plotW);
        var y = padT + plotH - (o[key]/maxVal)*plotH;
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });
    }
    plot('vegAfter', '#4ade80');
    plot('waterAfter', '#38bdf8');
    plot('builtAfter', '#fb6b5b');

    ctx.fillStyle = '#7c8fa6'; ctx.font='9px monospace'; ctx.textAlign='center';
    observations.forEach(function(o,idx){
      var x = padL + (observations.length===1 ? plotW/2 : (idx/(observations.length-1))*plotW);
      ctx.fillText(o.date2, x, ch-8);
    });
    ctx.textAlign='left';
  }

  document.getElementById('resetBtn').addEventListener('click', function(){
    document.getElementById('results').style.display='none';
    document.getElementById('emptyState').style.display='flex';
    beforeImg = null; afterImg = null;
    currentImageBBox = null;
    fnames[1].textContent=''; fnames[2].textContent='';
    fileInputs[1].value=''; fileInputs[2].value='';
    previews[1].src=''; previews[2].src='';
    zones[1].classList.remove('has-image'); zones[2].classList.remove('has-image');
    liveStatus.textContent=''; liveStatus.className='live-status';
    ndviSection.style.display='none';
    lastCategoryMap = null; lastConfidenceMap = null; lastMask = null;
    document.getElementById('explainBody').innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);">No point selected yet — click a changed (coloured) area on the AI Change Map.</div>';
    document.getElementById('warningPanel').innerHTML = '';
    document.getElementById('intelPanel').innerHTML = '';
    document.getElementById('addObservationBtn').disabled = true;
    checkReady();
  });

  document.getElementById('downloadBtn').addEventListener('click', function(){
    if(!lastStats) return;
    var s = lastStats;
    var locName = currentPlaceName;
    var d1 = document.getElementById('d1').value, d2 = document.getElementById('d2').value;

    var lines = [
      'SATELLITE CHANGE ANALYSIS REPORT',
      '=================================',
      'Location: '+locName,
      'Period: '+d1+' -> '+d2,
      'Generated: '+new Date().toISOString(),
      '',
      'AREA ANALYZED: '+s.areaKm2.toFixed(1)+' km2',
      'CHANGED AREA: '+s.changedArea+' km2 ('+s.changedPct.toFixed(1)+'% of tile)',
      '',
      'LAND COVER SUMMARY',
      '-------------------',
      'Built-up area : '+s.builtBefore.toFixed(1)+'% -> '+s.builtAfter.toFixed(1)+'%  ('+fmtSigned(s.builtChange)+')',
      'Vegetation    : '+s.vegBefore.toFixed(1)+'% -> '+s.vegAfter.toFixed(1)+'%  ('+fmtSigned(s.vegChange)+')',
      'Water coverage: '+s.waterBefore.toFixed(1)+'% -> '+s.waterAfter.toFixed(1)+'%  ('+fmtSigned(s.waterChange)+')',
      '',
      'NOTE: Land cover is classified using k-means colour clustering fitted to',
      'this image pair (not a trained neural network), labelled by centroid',
      'colour into vegetation / water / built-up / bare land.'+(roiPolygon?' Stats are':' ')+
      (roiPolygon?' limited to your drawn ROI polygon.':''),
    ];
    if(s.builtBefore < 3 && s.builtAfter - s.builtBefore >= 4){
      lines.push('',
        'CONSTRUCTION FLAG (DEMO HEURISTIC)',
        '----------------------------------',
        'New built-up area detected on land with almost no prior built-up presence',
        '('+s.builtBefore.toFixed(1)+'% -> '+s.builtAfter.toFixed(1)+'%). This is a pixel-change',
        'signal only -- it does not check permits, land records, or zoning/no-construction',
        'zone boundaries. Verify against municipal/land records before treating this as',
        'confirmed unauthorized construction.');
    }
    if(s.ndvi){
      lines.push('','VEGETATION INDEX (approx., NIR-capable band composite)',
        '-------------------------------------------------------',
        'Mean index before: '+s.ndvi.meanBefore.toFixed(3),
        'Mean index after : '+s.ndvi.meanAfter.toFixed(3),
        'Delta            : '+(s.ndvi.delta>=0?'+':'')+s.ndvi.delta.toFixed(3));
    }
    if(s.severity){
      var sev = s.severity;
      lines.push('','CHANGE SEVERITY / RISK SCORE (DEMO SCORING MODEL)',
        '--------------------------------------------------',
        'Score: '+sev.score+'/100 ('+sev.band.toUpperCase()+')',
        'Primary category: '+sev.catInfo.label,
        'Confidence: '+Math.round(sev.confidenceFactor)+'%',
        'Recommended action: '+recommendAction(sev));
    }
    if(s.categoryCounts){
      lines.push('','CHANGE CATEGORY BREAKDOWN', '--------------------------');
      for(var ciT=1; ciT<CATS_INFO.length; ciT++){
        if(s.categoryCounts[ciT]>0){
          lines.push(CATS_INFO[ciT].label+': '+(s.categoryCounts[ciT]/s.maskedTotal*100).toFixed(1)+'% of analyzed pixels');
        }
      }
    }
    if(observations.length){
      lines.push('','MULTI-TEMPORAL OBSERVATIONS ('+(observations.some(function(o){return !o.demo;})?'REAL/MIXED':'DEMO DATA')+')','----------------------------------------------------');
      observations.forEach(function(o){
        lines.push(o.date2+': veg '+o.vegAfter.toFixed(1)+'%, water '+o.waterAfter.toFixed(1)+'%, built '+o.builtAfter.toFixed(1)+'%, severity '+o.severity+(o.demo?' [DEMO]':' [REAL]'));
      });
    }
    var blob = new Blob([lines.join('\n')], {type:'text/plain'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'satellite_change_report_'+locName.replace(/\s+/g,'_')+'_'+d1+'-'+d2+'.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function buildStatsChartCanvas(s){
    var cw=500, ch=210;
    var c = document.createElement('canvas'); c.width=cw; c.height=ch;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1420'; ctx.fillRect(0,0,cw,ch);
    var groups = [
      {label:'Built-up', before:s.builtBefore, after:s.builtAfter, color:'#fb6b5b'},
      {label:'Vegetation', before:s.vegBefore, after:s.vegAfter, color:'#4ade80'},
      {label:'Water', before:s.waterBefore, after:s.waterAfter, color:'#38bdf8'}
    ];
    var maxVal = Math.max(5, s.builtBefore,s.builtAfter,s.vegBefore,s.vegAfter,s.waterBefore,s.waterAfter);
    var chartH = ch-50, chartTop=15, groupW = cw/groups.length;
    ctx.font = '12px monospace'; ctx.fillStyle='#7c8fa6';
    groups.forEach(function(g,gi){
      var gx = gi*groupW;
      var barW = 46;
      var bH = (g.before/maxVal)*chartH, aH = (g.after/maxVal)*chartH;
      var bx = gx+groupW/2-barW-8, ax = gx+groupW/2+8;
      ctx.fillStyle = g.color; ctx.globalAlpha=0.5;
      ctx.fillRect(bx, chartTop+chartH-bH, barW, bH);
      ctx.globalAlpha=1;
      ctx.fillRect(ax, chartTop+chartH-aH, barW, aH);
      ctx.fillStyle='#e8eef5'; ctx.textAlign='center';
      ctx.fillText(g.before.toFixed(1)+'%', bx+barW/2, chartTop+chartH-bH-6);
      ctx.fillText(g.after.toFixed(1)+'%', ax+barW/2, chartTop+chartH-aH-6);
      ctx.fillStyle='#7c8fa6';
      ctx.fillText(g.label, gx+groupW/2, ch-24);
      ctx.fillText('(light=before, solid=after)', gx+groupW/2, ch-8);
    });
    return c;
  }

  document.getElementById('downloadPdfBtn').addEventListener('click', function(){
    if(!lastStats){ return; }
    if(!window.jspdf){ alert('PDF library failed to load — check your connection and try again.'); return; }
    var s = lastStats;
    var locName = currentPlaceName;
    var d1 = document.getElementById('d1').value, d2 = document.getElementById('d2').value;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({unit:'mm', format:'a4'});
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 15, y = 18;

    doc.setFont('helvetica','bold'); doc.setFontSize(17);
    doc.text('Satellite Change Analysis Report', margin, y); y+=8;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90);
    doc.text('Location: '+locName, margin, y); y+=5.5;
    doc.text('Period: '+d1+' → '+d2+'    ·    Generated: '+new Date().toISOString().slice(0,19).replace('T',' ')+' UTC', margin, y); y+=9;

    var imgW = (pageW-2*margin-10)/3;
    var imgH = imgW*(H/W);
    var thumbs = [
      {canvas:document.getElementById('canvasBefore'), label:'Before ('+d1+')'},
      {canvas:document.getElementById('canvasAfter'), label:'After ('+d2+')'},
      {canvas:document.getElementById('canvasDiff'), label:'AI Change Map'}
    ];
    thumbs.forEach(function(t,idx){
      var x = margin + idx*(imgW+5);
      doc.addImage(t.canvas.toDataURL('image/jpeg',0.85), 'JPEG', x, y, imgW, imgH);
      doc.setFontSize(8.5); doc.setTextColor(120);
      doc.text(t.label, x, y+imgH+4.5);
    });
    y += imgH+12;

    doc.setDrawColor(210); doc.line(margin, y, pageW-margin, y); y+=8;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('Land cover summary', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
    var rows = [
      ['Built-up area', s.builtBefore.toFixed(1)+'%', s.builtAfter.toFixed(1)+'%', fmtSigned(s.builtChange)],
      ['Vegetation', s.vegBefore.toFixed(1)+'%', s.vegAfter.toFixed(1)+'%', fmtSigned(s.vegChange)],
      ['Water coverage', s.waterBefore.toFixed(1)+'%', s.waterAfter.toFixed(1)+'%', fmtSigned(s.waterChange)]
    ];
    var colX = [margin, margin+55, margin+90, margin+125];
    doc.setFont('helvetica','bold');
    doc.text('Category', colX[0], y); doc.text('Before', colX[1], y); doc.text('After', colX[2], y); doc.text('Change', colX[3], y);
    y+=6; doc.setFont('helvetica','normal');
    rows.forEach(function(r){
      doc.text(r[0], colX[0], y); doc.text(r[1], colX[1], y); doc.text(r[2], colX[2], y); doc.text(r[3], colX[3], y);
      y+=6.5;
    });
    y+=3;
    doc.text('Area analyzed: '+s.areaKm2.toFixed(2)+' km²   ·   Changed area: '+s.changedArea+' km² ('+s.changedPct.toFixed(1)+'% of pixels)'+(roiPolygon?'   ·   Limited to drawn ROI':''), margin, y);
    y+=10;

    if(s.builtBefore < 3 && s.builtAfter - s.builtBefore >= 4){
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(200,110,20);
      doc.text('⚠ Construction flag (demo heuristic)', margin, y); y+=6;
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(70);
      var cLines = doc.splitTextToSize('New built-up area detected on land with almost no prior built-up presence ('+s.builtBefore.toFixed(1)+'% → '+s.builtAfter.toFixed(1)+'%). This is a pixel-change signal only — it does not check permits, land records, or zoning/no-construction-zone boundaries. Verify against municipal/land records before treating this as confirmed unauthorized construction.', pageW-2*margin);
      doc.text(cLines, margin, y); y += cLines.length*4.5 + 6;
    }

    var chartCanvas = buildStatsChartCanvas(s);
    var chartW = pageW-2*margin, chartH = chartW*(chartCanvas.height/chartCanvas.width)*0.7;
    doc.addImage(chartCanvas.toDataURL('image/png'), 'PNG', margin, y, chartW, chartH);
    y += chartH+8;

    if(s.ndvi){
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
      doc.text('Vegetation index (approx.)', margin, y); y+=7;
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
      doc.text('Mean before: '+s.ndvi.meanBefore.toFixed(3)+'   ·   Mean after: '+s.ndvi.meanAfter.toFixed(3)+'   ·   Δ: '+(s.ndvi.delta>=0?'+':'')+s.ndvi.delta.toFixed(3), margin, y);
      y+=8;
    }

    function ensureSpace(need){
      if(y+need > doc.internal.pageSize.getHeight()-15){ doc.addPage(); y=18; }
    }
    var sev = s.severity;
    var source = document.getElementById('imgSource').options[document.getElementById('imgSource').selectedIndex].text;

    ensureSpace(40);
    doc.setDrawColor(210); doc.line(margin, y, pageW-margin, y); y+=8;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('Change severity / risk score', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
    if(sev){
      doc.text('Score: '+sev.score+'/100  ('+sev.band.toUpperCase()+')   ·   Primary category: '+sev.catInfo.label+'   ·   Confidence: '+Math.round(sev.confidenceFactor)+'%', margin, y); y+=6;
      var reasonLines = doc.splitTextToSize(sev.reason.replace(/<\/?b>/g,''), pageW-2*margin);
      doc.text(reasonLines, margin, y); y += reasonLines.length*4.6 + 6;
    }

    ensureSpace(50);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('Change category breakdown', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
    if(s.categoryCounts){
      for(var ciP=1; ciP<CATS_INFO.length; ciP++){
        var cnt = s.categoryCounts[ciP];
        if(cnt>0){
          var pctOfTile = (cnt/s.maskedTotal*100).toFixed(1);
          doc.text('• '+CATS_INFO[ciP].label+': '+pctOfTile+'% of analyzed pixels', margin, y); y+=5.5;
          ensureSpace(10);
        }
      }
    }
    y+=4;

    ensureSpace(35);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('AI explanation (why flagged)', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
    if(sev && sev.catInfo.key!=='none'){
      var expl = doc.splitTextToSize(explanationReason(sev.catInfo.key), pageW-2*margin);
      doc.text(expl, margin, y); y += expl.length*4.6+6;
    } else {
      doc.text('No dominant change category identified for this run.', margin, y); y+=8;
    }

    ensureSpace(25);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('Recommended action', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(60);
    doc.text(sev ? recommendAction(sev) : 'N/A', margin, y); y+=10;

    if(observations.length>=2){
      ensureSpace(70);
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
      doc.text('Multi-temporal trend ('+(observations.some(function(o){return !o.demo;})?'includes real observations':'DEMO DATA')+')', margin, y); y+=7;
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(60);
      observations.forEach(function(o){
        doc.text(o.date2+' — veg '+o.vegAfter.toFixed(1)+'%, water '+o.waterAfter.toFixed(1)+'%, built '+o.builtAfter.toFixed(1)+'%, severity '+o.severity+(o.demo?' (DEMO)':' (REAL)'), margin, y);
        y+=5.2; ensureSpace(10);
      });
      var trendCanvas = document.getElementById('mtChart');
      var tW = pageW-2*margin, tH = tW*(trendCanvas.height/trendCanvas.width);
      ensureSpace(tH+10);
      doc.addImage(trendCanvas.toDataURL('image/png'), 'PNG', margin, y, tW, tH);
      y += tH+8;
    }

    ensureSpace(60);
    doc.setDrawColor(210); doc.line(margin, y, pageW-margin, y); y+=8;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('Technical methodology', margin, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(60);
    var methodLines = doc.splitTextToSize(
      'Satellite imagery ('+source+') -> blank/cloud check -> alignment to a common bounding box -> '+
      'spectral feature extraction (NDVI/NDWI-style proxies, k-means colour clusters) -> rule-based change '+
      'classification into 6 categories -> weighted severity score (0.30*area% + 0.15*absolute-area + '+
      '0.30*category-risk + 0.15*confidence + 0.10*persistence) -> visualization -> alert/report. '+
      'The classification stage is a DEMO/PROTOTYPE heuristic pipeline, not a trained neural network. '+
      'A real model (e.g. Siamese U-Net) can be connected via the documented POST /api/classify endpoint.',
      pageW-2*margin);
    doc.text(methodLines, margin, y); y += methodLines.length*4.2+8;

    ensureSpace(30);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30);
    doc.text('Data limitations', margin, y); y+=6;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(90);
    var limitLines = doc.splitTextToSize(
      'Results are indicative screening output, not survey-grade measurement. Cloud cover, seasonal variation, '+
      'sun angle, sensor resolution and the demo classifier\'s colour-based heuristics can all affect accuracy. '+
      'This report does not claim trained-neural-network performance. Field verification is recommended before '+
      'any action is taken on High/Critical severity findings.'+(roiPolygon?' Statistics are limited to the hand-drawn region of interest.':''),
      pageW-2*margin);
    doc.text(limitLines, margin, y); y += limitLines.length*4+4;

    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Coordinates: '+currentLat.toFixed(4)+', '+currentLon.toFixed(4)+'   ·   Satellite source: '+source, margin, doc.internal.pageSize.getHeight()-10);

    doc.save('satellite_change_report_'+locName.replace(/\s+/g,'_')+'_'+d1+'-'+d2+'.pdf');
  });

  window.__sihGetContextSummary = function(){
    if(!lastStats) return null;
    var s = lastStats, sev = s.severity;
    var d1v = document.getElementById('d1').value, d2v = document.getElementById('d2').value;
    var lines = [
      'Here is the current satellite change analysis for context:',
      'Location: '+currentPlaceName+' ('+currentLat.toFixed(4)+', '+currentLon.toFixed(4)+')',
      'Period: '+d1v+' to '+d2v,
      'Changed area: '+s.changedArea+' km2 ('+s.changedPct.toFixed(1)+'% of tile)',
      'Vegetation: '+s.vegBefore.toFixed(1)+'% -> '+s.vegAfter.toFixed(1)+'%',
      'Water: '+s.waterBefore.toFixed(1)+'% -> '+s.waterAfter.toFixed(1)+'%',
      'Built-up: '+s.builtBefore.toFixed(1)+'% -> '+s.builtAfter.toFixed(1)+'%'
    ];
    if(sev){
      lines.push('Primary change category: '+sev.catInfo.label);
      lines.push('Severity: '+sev.score+'/100 ('+sev.band+')');
      lines.push('Confidence: '+Math.round(sev.confidenceFactor)+'%');
    }
    if(observations.length>=2){
      lines.push(observations.length+' multi-temporal observations on record for this ROI.');
    }
    lines.push('This came from a DEMO/PROTOTYPE heuristic classifier, not a trained neural network — please account for that in your answer.');
    return lines.join('\n');
  };

})();

(function(){
  "use strict";

  var DL_BASE = 'https://directline.botframework.com/v3/directline';
  var dlToken = null, dlConversationId = null, dlStreamUrl = null, dlWatermark = null;
  var dlUserId = 'sih-user-' + Math.random().toString(36).slice(2,10);
  var pollTimer = null, connected = false;

  var panel = document.getElementById('copilotPanel');
  var bubble = document.getElementById('copilotBubble');
  var bubbleDot = document.getElementById('cpBubbleDot');
  var closeBtn = document.getElementById('cpCloseBtn');
  var settingsBtn = document.getElementById('cpSettingsBtn');
  var settingsPanel = document.getElementById('cpSettings');
  var connectBtn = document.getElementById('cpConnectBtn');
  var connStatus = document.getElementById('cpConnStatus');
  var statusDot = document.getElementById('cpStatusDot');
  var messagesEl = document.getElementById('cpMessages');
  var inputEl = document.getElementById('cpInput');

  var SITE_KB = [
    { keys:['what is this','what does this do','about this website','about this site','about this tool','purpose of this'],
      a:'This is an AI Satellite Change Detector — pick a location and two dates, and it compares satellite imagery between them to detect and classify land-cover change (vegetation loss, construction, water change, roads, agriculture, or burn damage), score its severity, and generate a report.' },
    { keys:['how do i use','how to use','get started','how does this work','walkthrough'],
      a:'1) Search or click a location on the map. 2) Optionally draw a Region of Interest (ROI) polygon. 3) Pick two dates and an imagery source (MODIS/VIIRS/Sentinel-2/Esri), or upload your own images, or load the demo tile. 4) Click "Analyze Changes". Results appear with before/after/change-map panes, stats, severity score, and explainability.' },
    { keys:['roi','region of interest','draw a polygon','draw polygon'],
      a:'Use the "Draw ROI" button under the map to trace a polygon around your exact area of interest. Live satellite fetches will then pull imagery for that shape, and all statistics/severity scoring are limited to inside the polygon. "Clear ROI" removes it and falls back to a fixed square around the pin.' },
    { keys:['severity','risk score','how is severity calculated','severity score'],
      a:'Severity (0-100) = 0.30×(% of tile changed) + 0.15×(absolute km² changed) + 0.30×(risk weight of the dominant change category) + 0.15×(model confidence) + 0.10×(persistence across multi-temporal observations). Bands: 0-25 Low, 26-50 Moderate, 51-75 High, 76-100 Critical. It is a DEMO/PROTOTYPE scoring model — the arithmetic is real, but the underlying classifier is heuristic, not a trained model.' },
    { keys:['confidence','how accurate','how reliable','accuracy'],
      a:'Confidence is a per-detection heuristic score, not a validated accuracy metric. This tool is a screening/triage prototype, not survey-grade measurement — results should be field-verified before any action is taken, especially at High/Critical severity.' },
    { keys:['satellite','imagery source','modis','viirs','sentinel','esri','which data'],
      a:'Four imagery sources are supported: NASA MODIS (GIBS, free, since 2000), NASA VIIRS (GIBS, sharper, since late 2015), Copernicus Sentinel-2 (10m resolution, needs a free Sentinel Hub instance ID), and Esri World Imagery (high-res but current-pass only, not date-matched). You can also upload your own before/after images or load a synthetic demo tile.' },
    { keys:['category','categories','change type','vegetation loss','construction','burn','water change','road','agricultural'],
      a:'Changes are classified into 6 categories: Vegetation loss, New construction/built-up expansion, Water-body change, Road/infrastructure change, Agricultural/land-use change, and Burned/damaged area. The classifier is a rule-based DEMO/PROTOTYPE, using k-means colour clusters plus NDVI/NDWI-style proxies — not a trained neural network yet.' },
    { keys:['neural network','trained model','real ai','machine learning model','is this real ai'],
      a:'The classification engine running in your browser right now is a heuristic DEMO/PROTOTYPE (k-means colour clustering + NDVI/NDWI-style proxy rules), not a trained neural network — this is stated throughout the app. There\'s an optional "ML Backend" field in the control panel: if you deploy a real trained model (e.g. a Siamese U-Net) behind an HTTP endpoint, this app will POST both images there and use its response instead.' },
    { keys:['multi-temporal','multi temporal','trend','observations','multi-year','2022','2023','2024','2025','2026'],
      a:'After running an analysis, click "Add this result as an observation" in the left panel. Repeat across different date pairs for the same ROI to build a trend — vegetation/water/built-up % over time, cumulative change, and rate of change per year. Observations are tagged REAL or DEMO depending on whether real dated imagery was used.' },
    { keys:['pdf','report','download','export'],
      a:'The "Download PDF Report" button generates a report with before/after/change-map thumbnails, land-cover summary, severity score, category breakdown, AI explanation, recommended action, multi-temporal trend (if available), technical methodology, and data limitations. "Raw data (.txt)" exports the same numbers as plain text.' },
    { keys:['alert','warning','early warning'],
      a:'An alert/warning panel appears automatically once severity crosses 25 (Moderate or above), showing priority level, location, change type, affected area, severity, and confidence. Below that threshold no alert is shown — just the calm-state summary.' },
    { keys:['analysis type','deforestation mode','urban expansion','disaster mode','flood','environmental monitoring'],
      a:'There\'s no analysis-type selector — every run does full environmental monitoring automatically, scoring vegetation loss, water change, and built-up expansion together with equal weight, so you see the complete picture without having to pick a mode first.' },
    { keys:['ndvi','ndwi','vegetation index'],
      a:'The "Vegetation Index" toggle switches to an approximate NDVI-style greenness index derived from a false-colour NIR-capable band composite — it is indicative of trend, not a scientifically calibrated NDVI measurement.' },
    { keys:['why flagged','explain','explainability','why was this flagged'],
      a:'Click any point on the AI Change Map and the "Why was this region flagged?" panel shows the local category, affected area, confidence, severity, and a plain-language reason based on the actual pixel signals detected there.' },
    { keys:['who made','who built','who created this','developer'],
      a:'I don\'t have information about who built or deployed this particular instance of the app — that\'s not part of what\'s recorded in the app itself.' },
    { keys:['data upload','privacy','is my data sent','server'],
      a:'By default, all image analysis runs entirely in your browser — nothing is uploaded to a server unless you explicitly fill in the "ML Backend" endpoint field, in which case only the before/after images, bounding box, and dates for that one analysis are sent to whatever URL you provided.' },
    { keys:['construction','illegal','unauthorized','encroachment','no construction zone','no-construction'],
      a:'When new built-up area is detected somewhere that had no prior built-up presence (e.g. it was previously water, forest, or open land), the report flags it as new/unauthorized-looking construction for review. That flag is a pixel-change signal, not a legal determination — it doesn\'t check permits, land records, or zoning boundaries, so anything flagged should be verified against actual municipal/land records before being treated as confirmed illegal construction.' },
    { keys:['hi','hello','hey','help'],
      a:'Hi — ask me about locations, dates, imagery sources, ROI drawing, severity scoring, change categories, multi-temporal trends, or reports, and I\'ll answer from what\'s actually implemented in this app.' }
  ];

  function findLocalAnswer(query){
    var q = query.toLowerCase();
    var best = null, bestScore = 0;
    SITE_KB.forEach(function(entry){
      var score = 0;
      entry.keys.forEach(function(k){ if(q.indexOf(k)!==-1) score += k.split(' ').length; });
      if(score > bestScore){ bestScore = score; best = entry; }
    });
    return bestScore > 0 ? best.a : null;
  }

  var sendBtn = document.getElementById('cpSendBtn');
  var contextBtn = document.getElementById('cpSendContextBtn');

  bubble.addEventListener('click', function(){
    panel.classList.toggle('open');
    if(panel.classList.contains('open') && !connected) settingsPanel.classList.add('open');
  });
  closeBtn.addEventListener('click', function(){ panel.classList.remove('open'); });
  settingsBtn.addEventListener('click', function(){ settingsPanel.classList.toggle('open'); });

  function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderMarkdown(text){
    var esc = escapeHtml(text);
    esc = esc.replace(/`([^`]+)`/g, '<code>$1</code>');
    esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    esc = esc.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    var lines = esc.split(/\n/);
    var html = '', inList = false;
    lines.forEach(function(line){
      var bullet = /^\s*[-*]\s+(.*)/.exec(line);
      if(bullet){
        if(!inList){ html += '<ul>'; inList = true; }
        html += '<li>'+bullet[1]+'</li>';
      } else {
        if(inList){ html += '</ul>'; inList = false; }
        html += line + '<br>';
      }
    });
    if(inList) html += '</ul>';
    return html;
  }

  function addMsg(text, cls){
    var d = document.createElement('div');
    d.className = 'cp-msg '+cls;
    if(cls==='bot') d.innerHTML = renderMarkdown(text);
    else d.textContent = text;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  var typingEl = null;
  function showTyping(){
    if(typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'cp-typing';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping(){
    if(typingEl){ typingEl.remove(); typingEl = null; }
  }

  function setConnected(isConnected){
    connected = isConnected;
    statusDot.className = 'cp-status-dot'+(isConnected?' connected':'');
    bubbleDot.className = 'dot'+(isConnected?' connected':'');
    contextBtn.disabled = !isConnected;
  }

  function getToken(){
    var tokenEndpoint = document.getElementById('cpTokenEndpoint').value.trim();
    var secret = document.getElementById('cpSecret').value.trim();
    if(tokenEndpoint){
      return fetch(tokenEndpoint).then(function(r){
        if(!r.ok) throw new Error('Token endpoint returned HTTP '+r.status);
        return r.json();
      }).then(function(data){ return data.token; });
    }
    if(secret) return Promise.resolve(secret);
    return Promise.reject(new Error('Enter a token endpoint URL or a Direct Line secret.'));
  }

  function startConversation(){
    connStatus.className = 'live-status busy';
    connStatus.textContent = '⏳ Connecting to Copilot Studio…';
    getToken().then(function(token){
      dlToken = token;
      return fetch(DL_BASE+'/conversations', { method:'POST', headers:{ 'Authorization':'Bearer '+dlToken } });
    }).then(function(r){
      if(!r.ok) throw new Error('Could not start conversation (HTTP '+r.status+')');
      return r.json();
    }).then(function(data){
      dlConversationId = data.conversationId;
      dlStreamUrl = data.streamUrl;
      dlWatermark = null;
      setConnected(true);
      connStatus.className = 'live-status ok';
      connStatus.textContent = '✓ Connected to Copilot Studio bot.';
      messagesEl.innerHTML = '';
      addMsg('Connected — ask me anything, not just about this analysis. Use "Send current analysis results" below if you want me to factor in the current ROI\'s numbers.', 'system');
      settingsPanel.classList.remove('open');
      startPolling();
    }).catch(function(err){
      setConnected(false);
      connStatus.className = 'live-status err';
      connStatus.textContent = '⚠ '+err.message;
    });
  }
  connectBtn.addEventListener('click', startConversation);

  function startPolling(){
    if(pollTimer) clearTimeout(pollTimer);
    function poll(){
      if(!dlConversationId) return;
      var url = DL_BASE+'/conversations/'+dlConversationId+'/activities'+(dlWatermark ? '?watermark='+dlWatermark : '');
      fetch(url, { headers:{ 'Authorization':'Bearer '+dlToken } })
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data){
          dlWatermark = data.watermark;
          var gotBotReply = false;
          (data.activities||[]).forEach(function(a){
            if(a.type==='message' && a.from && a.from.id!==dlUserId && a.text){
              gotBotReply = true;
              hideTyping();
              addMsg(a.text, 'bot');
            }
            if(a.type==='typing' && a.from && a.from.id!==dlUserId){
              showTyping();
            }
          });
          if(gotBotReply) hideTyping();
          pollTimer = setTimeout(poll, 1500);
        })
        .catch(function(err){
          hideTyping();
          connStatus.className = 'live-status err';
          connStatus.textContent = '⚠ Lost connection to Copilot Studio ('+err.message+'). Reconnect from ⚙.';
          setConnected(false);
        });
    }
    poll();
  }

  function sendToBot(text){
    if(!text) return;
    addMsg(text, 'user');

    var local = findLocalAnswer(text);
    if(local){
      showTyping();
      setTimeout(function(){ hideTyping(); addMsg(local, 'bot'); }, 350);
      return;
    }

    if(!dlConversationId){
      showTyping();
      setTimeout(function(){
        hideTyping();
        addMsg('That\'s outside what I know about this site directly. Connect a Copilot Studio bot via ⚙ for open-ended questions, or try asking about locations, dates, imagery sources, severity scoring, categories, or reports.', 'bot');
      }, 350);
      return;
    }

    showTyping();
    fetch(DL_BASE+'/conversations/'+dlConversationId+'/activities', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+dlToken, 'Content-Type':'application/json' },
      body: JSON.stringify({ type:'message', from:{ id:dlUserId, name:'SIH user' }, text:text })
    }).catch(function(err){
      hideTyping();
      addMsg('⚠ Message failed to send: '+err.message, 'system');
    });
  }

  function autoGrow(){
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(90, inputEl.scrollHeight)+'px';
  }
  inputEl.addEventListener('input', autoGrow);

  sendBtn.addEventListener('click', function(){
    var text = inputEl.value.trim();
    if(!text) return;
    sendToBot(text);
    inputEl.value = '';
    autoGrow();
  });
  inputEl.addEventListener('keydown', function(e){
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendBtn.click(); }
  });

  contextBtn.addEventListener('click', function(){
    if(typeof window.__sihGetContextSummary !== 'function'){
      addMsg('No analysis has been run yet in this tab.', 'system');
      return;
    }
    var summary = window.__sihGetContextSummary();
    if(!summary){
      addMsg('Run an analysis first, then send its results here.', 'system');
      return;
    }
    sendToBot(summary);
  });
})();