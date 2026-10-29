# SUDAL (수달)

Search Korean places, then open them in the map app that works best for you.

Use it now here: [SUDAL](https://alexriss.github.io/SudalMaps/)

| Main app | Taxi card |
| --- | --- |
| ![SUDAL main screen](screenshots/main.jpg) | ![SUDAL taxi card](screenshots/taxi.png) |

## Features

- Search for places in English or Korean, using Google Places or Kakao Local, with built-in presets and OpenStreetMap Nominatim as fallbacks.
- Search with Google, then send the destination to Naver Maps or Kakao Maps for turn-by-turn driving directions in Korea, where Google Maps does not currently offer driving navigation.
- Use the **Apps / Web** toggle for Naver and Kakao place and directions links. Apps mode opens the installed map app when available and falls back to its HTTPS map link; Web mode opens HTTPS links directly.
- Show a full-screen taxi card with the destination's Korean name and road address, play the request aloud in Korean, or copy the address.
- Install SUDAL as a Progressive Web App (PWA) from your browser's **Install** or **Add to Home Screen** option.

## API keys

You can get API keys for free, and adding them is recommended for expanded search and map options. Add keys in **Options**; free quotas and usage terms vary by provider, so check before use.

- [Google Places](https://mapsplatform.google.com/maps-demo-key/)
- [Kakao Local](https://developers.kakao.com/console/app/)
- [CARTO basemaps](https://carto.com/basemaps/apikey/)

Keys are saved in this browser only. Restrict keys to your website where the provider allows it.

Kakao Local requires the site to be registered in Kakao Developers under **App > General > App basic information > App primary domain**. For the hosted app, register the URL `https://alexriss.github.io/SudalMaps/`. When developing locally, you can try to serve the site over localhost and register its URL (but haven't tested this). Opening `index.html` directly with `file://` is not supported for Kakao search.

## License

SUDAL is licensed under the [GNU General Public License v3.0 or later](LICENSE). Third-party services, libraries, and assets remain subject to their own terms.
