const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function section(start, end) {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end: ${end}`);
  return html.slice(startIndex, endIndex);
}

function element() {
  return {
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      toggle(value, force) {
        if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
        else this.values.delete(value);
      },
      contains(value) { return this.values.has(value); }
    }
  };
}

function documentStub() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelectorAll() { return []; }
  };
}

test('inline application script parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length);
  assert.doesNotThrow(() => new vm.Script(scripts[scripts.length - 1][1]));
});

test('map clicks create separate pins in spot and route modes', () => {
  const source = section("      map.on('click',", '\n      });') + '\n      });';
  for (const mode of ['spot', 'route']) {
    const context = {
      appMode: mode,
      currentSpot: { enName: 'Old spot', koAddress: 'Old address' },
      routeEnd: { enName: 'Old end', koAddress: 'Old address' },
      document: documentStub(),
      dismissSearchResults() {},
      renderActiveView() {},
      map: { on(name, handler) { context.onMapClick = handler; } }
    };
    vm.runInNewContext(source, context);
    context.onMapClick({ latlng: { lat: 37.1234567, lng: 127.1234567 } });
    const pin = mode === 'spot' ? context.currentSpot : context.routeEnd;
    assert.equal(pin.enName, 'Dropped pin');
    assert.equal(pin.koAddress, '');
    assert.equal(pin.enAddress, '');
    assert.equal(pin.lat, 37.123457);
    assert.equal(pin.lng, 127.123457);
  }
});

test('OSM translations match by type and ID, not response order', () => {
  const context = {};
  vm.runInNewContext(section('    function mapOsmResults(', '    async function runSearch('), context);
  const english = [
    { osm_type: 'node', osm_id: 1, name: 'One', display_name: 'One, Seoul', lat: '37.1', lon: '127.1' },
    { osm_type: 'way', osm_id: 2, name: 'Two', display_name: 'Two, Seoul', lat: '37.2', lon: '127.2' }
  ];
  const korean = [
    { osm_type: 'way', osm_id: 2, name: 'Korean Two', display_name: 'Address Two' },
    { osm_type: 'node', osm_id: 1, name: 'Korean One', display_name: 'Address One' }
  ];
  const results = context.mapOsmResults(english, korean);
  assert.equal(results[0].koName, 'Korean One');
  assert.equal(results[1].koName, 'Korean Two');
  assert.equal(context.mapOsmResults(english, [])[0].koName, 'One');
  assert.equal(context.mapOsmResults([{ ...english[0], osm_id: null }], [korean[0]])[0].koName, 'One');
});

test('search automatically selects its first result and keeps alternatives', async () => {
  const document = documentStub();
  document.getElementById('spot-input').value = 'Test';
  const candidates = [{ enName: 'First' }, { enName: 'Second' }];
  const context = {
    document,
    searchProvider: 'osm',
    searchProviderHasKey: () => true,
    localStorage: { getItem: () => null },
    ensureGpsFix() {},
    PRESET_SPOTS: [],
    fetch: async () => ({ json: async () => [] }),
    mapOsmResults: () => candidates,
    selectSearchResult(place, slot, keepOpen) { context.selected = { place, slot, keepOpen }; },
    renderSearchResults() {},
    lastSearchCandidates: null,
    lastSearchTargetSlot: null,
    searchSequence: 0
  };
  vm.runInNewContext(section('    function dismissSearchResults(', '    function selectSearchResult('), context);
  await context.runSearch('spot');
  assert.equal(context.selected.place.enName, 'First');
  assert.equal(context.selected.keepOpen, true);
  assert.equal(context.lastSearchCandidates.length, 2);
  assert.equal(context.lastSearchTargetSlot, 'spot');
});

test('switching modes dismisses results but reselecting the same mode keeps them', () => {
  const document = documentStub();
  const context = {
    document,
    appMode: 'route',
    routeEnd: { enName: 'Destination', koName: 'Destination' },
    currentSpot: {},
    searchSequence: 0,
    lastSearchCandidates: [{ enName: 'Previous result' }],
    lastSearchTargetSlot: 'end',
    map: { invalidateSize() {} },
    renderFavoritesView() {},
    renderActiveView() {}
  };
  vm.runInNewContext(
    section('    function dismissSearchResults(', '    async function runSearch(') +
    section('    function switchMode(', '    function renderActiveView('),
    context
  );
  const dropdown = document.getElementById('search-results-dropdown');
  dropdown.innerHTML = 'Previous result';
  context.switchMode('route');
  assert.equal(dropdown.classList.contains('hidden'), false);
  context.switchMode('spot');
  assert.equal(dropdown.classList.contains('hidden'), true);
  assert.equal(dropdown.innerHTML, '');
  assert.equal(context.lastSearchCandidates, null);
  assert.equal(context.lastSearchTargetSlot, null);
  assert.equal(context.currentSpot.enName, 'Destination');
});

test('loading a favorite closes results and updates the active search field', () => {
  for (const mode of ['spot', 'route']) {
    const document = documentStub();
    const context = {
      document,
      appMode: mode,
      favoriteSpots: [{ enName: 'Favorite', koName: 'Saved' }],
      suppressSavedSpotClick: null,
      searchSequence: 0,
      lastSearchCandidates: [{ enName: 'Previous result' }],
      lastSearchTargetSlot: mode === 'spot' ? 'spot' : 'end',
      renderActiveView() {}
    };
    vm.runInNewContext(
      section('    function dismissSearchResults(', '    async function runSearch(') +
      section('    function loadFavoriteSpot(', '    function startSavedSpotHold('),
      context
    );
    context.loadFavoriteSpot(0);
    assert.equal(document.getElementById('search-results-dropdown').classList.contains('hidden'), true);
    assert.equal(context.lastSearchCandidates, null);
    assert.equal((mode === 'spot' ? context.currentSpot : context.routeEnd).enName, 'Favorite');
    assert.equal(document.getElementById(mode === 'spot' ? 'spot-input' : 'route-end-input').value, 'Favorite (Saved)');
  }
});

test('a late search response cannot replace a favorite or reopen results', async () => {
  const document = documentStub();
  document.getElementById('spot-input').value = 'Old search';
  const requests = [];
  const context = {
    document,
    appMode: 'spot',
    searchProvider: 'osm',
    searchProviderHasKey: () => true,
    localStorage: { getItem: () => null },
    ensureGpsFix() {},
    PRESET_SPOTS: [],
    fetch: () => new Promise(resolve => requests.push(resolve)),
    mapOsmResults: () => [{ enName: 'Old result' }],
    selectSearchResult(place) { context.currentSpot = place; },
    renderSearchResults() {},
    renderActiveView() {},
    favoriteSpots: [{ enName: 'Favorite', koName: 'Saved' }],
    suppressSavedSpotClick: null,
    lastSearchCandidates: null,
    lastSearchTargetSlot: null,
    searchSequence: 0
  };
  vm.runInNewContext(
    section('    function dismissSearchResults(', '    function selectSearchResult(') +
    section('    function loadFavoriteSpot(', '    function startSavedSpotHold('),
    context
  );
  const search = context.runSearch('spot');
  assert.equal(requests.length, 2);
  context.loadFavoriteSpot(0);
  requests.forEach(resolve => resolve({ json: async () => [] }));
  await search;
  assert.equal(context.currentSpot.enName, 'Favorite');
  assert.equal(context.lastSearchCandidates, null);
  assert.equal(document.getElementById('search-results-dropdown').classList.contains('hidden'), true);
});

test('an older search cannot replace a newer search result', async () => {
  const document = documentStub();
  const requests = [];
  const context = {
    document,
    searchProvider: 'osm',
    searchProviderHasKey: () => true,
    localStorage: { getItem: () => null },
    ensureGpsFix() {},
    PRESET_SPOTS: [],
    fetch: () => new Promise(resolve => requests.push(resolve)),
    mapOsmResults: english => english,
    selectSearchResult(place) { context.selected = place; },
    renderSearchResults() {},
    lastSearchCandidates: null,
    lastSearchTargetSlot: null,
    searchSequence: 0
  };
  vm.runInNewContext(section('    function dismissSearchResults(', '    function selectSearchResult('), context);
  document.getElementById('spot-input').value = 'Old';
  const older = context.runSearch('spot');
  document.getElementById('spot-input').value = 'New';
  const newer = context.runSearch('spot');
  requests.slice(2).forEach(resolve => resolve({ json: async () => [{ enName: 'New' }] }));
  await newer;
  requests.slice(0, 2).forEach(resolve => resolve({ json: async () => [{ enName: 'Old' }] }));
  await older;
  assert.equal(context.selected.enName, 'New');
  assert.equal(context.lastSearchCandidates[0].enName, 'New');
});

test('route preview and swapping require actual GPS coordinates', () => {
  const document = documentStub();
  let lineCount = 0;
  const context = {
    document,
    appMode: 'route',
    routeEnd: { enName: 'End', koName: 'End', koAddress: 'Address', lat: 37.5, lng: 127 },
    spotMarker: null,
    startMarker: null,
    endMarker: null,
    routeLine: null,
    map: { removeLayer() {}, setView() {}, fitBounds() {} },
    L: {
      circleMarker: () => ({ addTo: () => ({}) }),
      polyline: () => {
        lineCount++;
        return { addTo: () => ({ getBounds: () => ({}) }) };
      }
    },
    dismissSearchResults() {},
    renderFavoritesBar() {}
  };
  vm.runInNewContext(
    section('    function createCurrentGpsStart(', '    function applyUiScale(') +
    section('    function renderActiveView(', '    let activeSpeech') +
    section('    function swapRouteEndpoints(', '    function getActiveDestination('),
    context
  );
  context.routeStart = context.createCurrentGpsStart();
  context.renderActiveView();
  assert.equal(lineCount, 0);
  assert.equal(document.getElementById('swap-route-btn').disabled, true);
  assert.match(document.getElementById('route-preview-status').innerText, /not yet available/);
  context.swapRouteEndpoints();
  assert.equal(context.routeEnd.enName, 'End');

  context.routeStart = context.createCurrentGpsStart({ lat: 37.4, lng: 126.9 });
  context.renderActiveView();
  assert.equal(lineCount, 1);
  assert.equal(document.getElementById('swap-route-btn').disabled, false);
  assert.match(document.getElementById('route-preview-status').innerText, /Straight-line/);
  context.swapRouteEndpoints();
  context.swapRouteEndpoints();
  assert.equal(context.routeStart.isCurrentGps, true);
});

test('taxi card does not copy or speak a missing address', () => {
  const document = documentStub();
  const context = { document, activeTaxiTarget: null };
  vm.runInNewContext(section('    function openTaxiModal(', '    function closeTaxiModal('), context);
  context.openTaxiModal({ enName: 'Dropped pin', koName: 'Pin', enAddress: '', koAddress: '', lat: 37.5, lng: 127 });
  assert.equal(document.getElementById('taxi-copy-address').disabled, true);
  assert.equal(document.getElementById('taxi-speak-address').disabled, true);
  assert.equal(document.getElementById('taxi-coords').innerText, '37.500000, 127.000000');
  assert.equal(document.getElementById('taxi-coords').classList.contains('hidden'), false);

  context.openTaxiModal({ enName: 'Place', koName: 'Place', enAddress: 'Road', koAddress: 'Address', lat: 37.5, lng: 127 });
  assert.equal(document.getElementById('taxi-copy-address').disabled, false);
  assert.equal(document.getElementById('taxi-speak-address').disabled, false);
  assert.equal(document.getElementById('taxi-coords').classList.contains('hidden'), true);
});

test('GPS permission errors are visible without changing the route', () => {
  const document = documentStub();
  const context = {
    document,
    navigator: { geolocation: { getCurrentPosition(success, failure) { failure({ code: 1 }); } } },
    routeStart: { enName: 'Original' }
  };
  vm.runInNewContext(section('    function useCurrentGps(', '    function swapRouteEndpoints('), context);
  context.useCurrentGps('start');
  assert.match(document.getElementById('gps-status').textContent, /denied/);
  assert.equal(context.routeStart.enName, 'Original');
});

test('a successful GPS fix updates an unresolved route start', () => {
  const document = documentStub();
  const context = {
    document,
    navigator: { geolocation: { getCurrentPosition(success) { success({ coords: { latitude: 37.51, longitude: 127.02 } }); } } },
    lastGpsFix: null,
    dismissSearchResults() {},
    renderActiveView() {},
    routeStart: null
  };
  vm.runInNewContext(
    section('    function createCurrentGpsStart(', '    function applyUiScale(') +
    section('    function useCurrentGps(', '    function swapRouteEndpoints('),
    context
  );
  context.routeStart = context.createCurrentGpsStart();
  context.useCurrentGps('start');
  assert.equal(context.routeStart.lat, 37.51);
  assert.equal(context.routeStart.lng, 127.02);
  assert.equal(context.routeStart.isCurrentGps, true);
  assert.equal(document.getElementById('gps-status').textContent, 'GPS location found.');
});

test('saved GPS routes use the current fix instead of stored coordinates', () => {
  const document = documentStub();
  const context = {
    document,
    suppressSavedRouteClick: null,
    favoriteRoutes: [{ start: { isCurrentGps: true, lat: 1, lng: 2 }, end: { enName: 'End', koName: 'End', lat: 37.5, lng: 127 } }],
    lastGpsFix: null,
    dismissSearchResults() {},
    switchMode() {},
    renderActiveView() {}
  };
  vm.runInNewContext(
    section('    function createCurrentGpsStart(', '    function applyUiScale(') +
    section('    function loadFavoriteRoute(', '    function startSavedRouteHold('),
    context
  );
  context.loadFavoriteRoute(0);
  assert.equal(context.routeStart.isCurrentGps, true);
  assert.equal(context.routeStart.lat, null);
  context.lastGpsFix = { lat: 37.51, lng: 127.02 };
  context.loadFavoriteRoute(0);
  assert.equal(context.routeStart.lat, 37.51);
  assert.equal(context.routeStart.lng, 127.02);
});