'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {"favicon.png": "b6010005d44ac30589dddf39ddffdee1",
"canvaskit/canvaskit.js": "140ccb7d34d0a55065fbd422b843add6",
"canvaskit/skwasm_heavy.js": "413f5b2b2d9345f37de148e2544f584f",
"canvaskit/skwasm_heavy.wasm": "8034ad26ba2485dab2fd49bdd786837b",
"canvaskit/chromium/canvaskit.js": "5e27aae346eee469027c80af0751d53d",
"canvaskit/chromium/canvaskit.js.symbols": "193deaca1a1424049326d4a91ad1d88d",
"canvaskit/chromium/canvaskit.wasm": "24c77e750a7fa6d474198905249ff506",
"canvaskit/skwasm.js": "1ef3ea3a0fec4569e5d531da25f34095",
"canvaskit/canvaskit.js.symbols": "58832fbed59e00d2190aa295c4d70360",
"canvaskit/skwasm_heavy.js.symbols": "3c01ec03b5de6d62c34e17014d1decd3",
"canvaskit/skwasm.wasm": "264db41426307cfc7fa44b95a7772109",
"canvaskit/skwasm.js.symbols": "0088242d10d7e7d6d2649d1fe1bda7c1",
"canvaskit/canvaskit.wasm": "07b9f5853202304d3b0749d9306573cc",
"flutter_bootstrap.js": "5da18ddcfe23b04b0b8a3b53895e338d",
"assets/NOTICES": "04d9ae823d765f98caa95141c6a60cea",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "33b7d9392238c04c131b6ce224e13711",
"assets/AssetManifest.bin": "f6393ad103f815cacd5f47777e3f46ca",
"assets/assets/images/search_cat_dog.png": "0064eb85c46a2b476da85d852fb5da4e",
"assets/assets/images/icon_verified_check.svg": "004ae36977e577c7c93cbc7d8d20f724",
"assets/assets/images/zoovo_logo_text.png": "2d086e289a63c3884975ad2454ba3417",
"assets/assets/images/home_tile_cats.png": "8535f2d5752de843394cb263e352677f",
"assets/assets/images/yellow_wave_bottom.png": "56e2258ec74b12ebc0434ddd8960e76a",
"assets/assets/images/post_card_avatar_badge.png": "373f31242ae4e9a3070352d4d53cd1a9",
"assets/assets/images/yellow_intersect_bg.png": "3a64832fa1f3abce4f8ebbc5a3ca49ae",
"assets/assets/images/pet_step2_footer_dog.png": "70ded6e90ef520c6fb68b8406862906c",
"assets/assets/images/icon_pet_cat.svg": "940d789c94b689a8ebeb22f7d54fb23a",
"assets/assets/images/home_tile_playdates.png": "ed8019bd39e5e63f9b9bebc383e0ee1b",
"assets/assets/images/home_post_paw_heart.svg": "c1bd0fb38bbeb15c04a35dd987865eb0",
"assets/assets/images/nav_shop.svg": "8cc651e89dd6270f60109d91ba73964b",
"assets/assets/images/nav_home.svg": "48abe25011106c10714e30f3bb6c7da1",
"assets/assets/images/icon_google.svg": "8f959ed2408374e15f26072f2b016025",
"assets/assets/images/gray_button.png": "970bdc4bac82ea971bc806f9154a4c26",
"assets/assets/images/signin_button.png": "99dd39300412bf6ac664ff4007247875",
"assets/assets/images/sign_in_header.png": "d4005a2dc0ef7669eb446285e075f87b",
"assets/assets/images/icon_person.svg": "283cb0768ae041f0bb7ee8f38cb5691f",
"assets/assets/images/signin_header_bg.png": "2df4a7eae6b1c1b32c91008491cae1e4",
"assets/assets/images/msg_send_paw.png": "8d86db977b42e47930ebd422fd13095b",
"assets/assets/images/zoov_badge_icon.png": "8d86db977b42e47930ebd422fd13095b",
"assets/assets/images/sign_in_paw_deco.png": "d43bbab86d0f7526d2daf1588cf2bb14",
"assets/assets/images/signin_dog_button_deco.png": "1b4fa28625a66e365ba237580453f70c",
"assets/assets/images/nav_profile.svg": "b040c5fe91c93c047490709d044d98b8",
"assets/assets/images/icon_size_paw_large.svg": "9508b6be0ed23f4689ce49caeeddd5ae",
"assets/assets/images/icon_password.svg": "949f65f17e04a212e90c5c18f2ff6972",
"assets/assets/images/home_notif_bell_paw.svg": "40e3b32301c8b7178534d21446543304",
"assets/assets/images/home_tile_your_feed-4c5720.png": "cbc9fc710a17db5d4282267fd07b5d1f",
"assets/assets/images/zoovo_logo.svg": "dfb6b147779c50a6321288861212c31e",
"assets/assets/images/pet_hero_cat.png": "37c54852056cf5833842d0a4e04bd5b3",
"assets/assets/images/cat_mascot.png": "06601a837f66970a385b4c170fea4af7",
"assets/assets/images/home_tile_professionals.png": "133530cb2333f4676448068be609441e",
"assets/assets/images/dog_shape.png": "575234fef2130c2d403eb371b2500316",
"assets/assets/images/welcome_dog_mascot.png": "0dd4fa3a60af582e05625073606e4123",
"assets/assets/images/search_cat_pro.png": "133530cb2333f4676448068be609441e",
"assets/assets/images/paw_pattern.png": "2850327ea4dea2670aa90563abaa5f4d",
"assets/assets/images/pet_type_cat.svg": "940d789c94b689a8ebeb22f7d54fb23a",
"assets/assets/images/welcome_buttons_group.png": "3517020afa024042320a10fd29554c39",
"assets/assets/images/pet_type_dog.svg": "2f6b4a375ec790273cc4afb5cae0bfac",
"assets/assets/images/reset_corner_dog.png": "637cf61dd5733cd3c4156ecdb6606a72",
"assets/assets/images/notif_bubble_paw.png": "e1f83210f9cd3e0912e9e3c24d91cd22",
"assets/assets/images/home_filter_paw_fab.svg": "cfc2355b48aaefedd80c0474015f1df1",
"assets/assets/images/home_tile_dogs.png": "0064eb85c46a2b476da85d852fb5da4e",
"assets/assets/images/bubble_paw.png": "e1f83210f9cd3e0912e9e3c24d91cd22",
"assets/assets/images/post_card_avatar_placeholder.png": "ba148e35e385a7745bbbd1b3cbafb305",
"assets/assets/images/sign_in_button.png": "674a92d359c553c09e51c2ef0cbb07ea",
"assets/assets/images/zoovo_logo_navy.webp": "bed480767aaf8b5dcd4d586948968fc6",
"assets/assets/images/nav_center_paw.svg": "bbbf44f0138c18865d286d7e7d8cccf9",
"assets/assets/images/icon_edit.svg": "8dda52d59feeed87216b58c3379733c9",
"assets/assets/images/google_icon.png": "a59e22498e95b2a6780adeb5fbacbdfe",
"assets/assets/images/icon_pet_dog.svg": "2f6b4a375ec790273cc4afb5cae0bfac",
"assets/assets/images/icon_friends_person.svg": "bf5b330156ed798a0c9945d4980e8e5c",
"assets/assets/images/home_categories_divider.svg": "403db4b9cc5808eb91e8f4e461c75002",
"assets/assets/images/pet_step9_footer_dog.png": "06601a837f66970a385b4c170fea4af7",
"assets/assets/images/forgot_corner_dog.png": "64eeb0e8c9e4a0e75c3d50c5e3f61b9e",
"assets/assets/images/signup_dog_side_deco.png": "77e0ddb3c0fe316cfc98920c6c43710e",
"assets/assets/images/coral_button_with_paw.png": "674a92d359c553c09e51c2ef0cbb07ea",
"assets/assets/images/welcome_text.png": "082ea1660634bdf6e5f8323ea1f53074",
"assets/assets/images/signin_header_wave.png": "2df4a7eae6b1c1b32c91008491cae1e4",
"assets/assets/images/icon_size_paw_medium.svg": "6f6db236537e099adb6ab67141f7ce0a",
"assets/assets/images/zoovo_logo.png": "2d086e289a63c3884975ad2454ba3417",
"assets/assets/images/paw_small_deco.png": "77e0ddb3c0fe316cfc98920c6c43710e",
"assets/assets/images/comment_paw.svg": "29a6a91aac44f013fb8a6fe9680e7345",
"assets/assets/images/home_bubble_paw.png": "4263469c3627bc501174f890229f814d",
"assets/assets/images/cat_deco_side.png": "637cf61dd5733cd3c4156ecdb6606a72",
"assets/assets/images/bone_button.png": "c23bdf2c109c06a58616b34de1ddd260",
"assets/assets/images/photo_picker_placeholder.png": "4a0041a3b47632142928f5a15edcf9bf",
"assets/assets/images/post_card_paw.svg": "d04e94a91df2e7665e23f5a17867f3bb",
"assets/assets/images/msg_cat_header.png": "5edb340dd50c63f882df2cd278ffbd83",
"assets/assets/images/search_cat_other.png": "4a0041a3b47632142928f5a15edcf9bf",
"assets/assets/images/icon_friends_pair.svg": "a0161af7a7a5b5427516f6ada59f9d7f",
"assets/assets/images/msg_bird_mascot.png": "1fd92b7dce145c9d24674540c6a93cfc",
"assets/assets/images/signup_bone_button.svg": "57a5cdc5f0fcdf5034b07da16ea3240a",
"assets/assets/images/icon_pet_turtle.svg": "dac5d7ea7e4671d4e090aa3be3caba9e",
"assets/assets/images/icon_mail.svg": "2b3dc77319b2ad83bd38bf049e25459e",
"assets/assets/images/forgot_bottom_dog.svg": "0036cb05c91053120afb999397094d8e",
"assets/assets/images/home_post_avatar_badge.png": "373f31242ae4e9a3070352d4d53cd1a9",
"assets/assets/images/icon_apple.svg": "03121465d04c9a78a9100b31e3232e9b",
"assets/assets/images/pet_type_turtle.svg": "6873bd9f10fd6c000f62159b95e03036",
"assets/assets/images/icon_size_paw_small.svg": "f90b512d9410392f9cd33d804f45a60f",
"assets/assets/images/pet_footer_wave.svg": "a98f1acedef3a5c764a23cce27948a80",
"assets/assets/images/home_post_comment.svg": "c8618610891e357e0f89fb91597491f0",
"assets/assets/images/pet_hero_dog.png": "5ff5c59bc6cc4ce11789cf728040648d",
"assets/assets/images/apple_icon.png": "62233fb7560e915d05ed3a510eb3cf89",
"assets/assets/images/search_cat_playdates.png": "ed8019bd39e5e63f9b9bebc383e0ee1b",
"assets/assets/images/home_zoovo_logo.svg": "71cd4db6b1dd8dd9843c2158de07bcdb",
"assets/assets/images/bone_button_full.png": "534899b8e487901a0ea1d8ba31c18e61",
"assets/assets/images/notif_header_dog.png": "134f745868571bbff18c09c23f571147",
"assets/assets/images/verify_paw_header.png": "2850327ea4dea2670aa90563abaa5f4d",
"assets/assets/images/nav_search.svg": "ea709edc2df9ceb5fe29927d28013235",
"assets/assets/images/post_card_location_pin.svg": "6f3927e93656604364e1ca79393dc9cf",
"assets/assets/images/search_cat_cat.png": "8535f2d5752de843394cb263e352677f",
"assets/assets/images/comment_send_message.svg": "97cddcb869195c4367b6c492717d9a5b",
"assets/assets/images/icon_city.svg": "deca34fdf4ffc232018e835743d015cc",
"assets/assets/images/notif_logo_zoovo.png": "1b3d28d8c057fca050828f5da5334a5f",
"assets/assets/images/home_bottomnav_center_fab.svg": "7e7e44d3994abed7f2e6bc8720463271",
"assets/assets/images/welcome_bubble_paw.png": "e1f83210f9cd3e0912e9e3c24d91cd22",
"assets/assets/images/icon_location.svg": "04ef0e69d7e08797ef3e902fcd0ce448",
"assets/assets/images/post_card_comment.svg": "3c59dea2061a7275ff68d04f1fc8f964",
"assets/assets/images/home_post_location_pin.svg": "6f3927e93656604364e1ca79393dc9cf",
"assets/assets/images/welcome_bottom_shape.png": "b979cf27a99ef0c5c1f2b62fc82c6fdf",
"assets/assets/images/bubble_paw.svg": "ac30f253f4112e16befaa61530b5f939",
"assets/assets/images/sign_in_divider.png": "2f7613f0f0102836fd21be2dbb4452fb",
"assets/assets/images/home_search_glass.svg": "a17511e2fbd26116d34a13613bf16c9e",
"assets/assets/images/nav_services_dogs.png": "5662a3ab152badc8fd32d69a579b614c",
"assets/assets/images/icon_gallery.svg": "d940a25dac60280afa3dd4c0cca43aa5",
"assets/assets/images/zoovs_palette_icon-2fa81d.png": "8a466a734253d721739884206d54dba0",
"assets/FontManifest.json": "dc3d03800ccca4601324923c0b1d6d57",
"assets/AssetManifest.json": "9535987e88a68579d9ee56031d1d6559",
"assets/fonts/MaterialIcons-Regular.otf": "4ebcdb1280964a62268e8ea4cd247e5f",
"assets/AssetManifest.bin.json": "86d65baa7f0180a28bcfcead747c509d",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"index.html": "c5c6b1f7e97ea5fa78ae4ec885571f92",
"/": "c5c6b1f7e97ea5fa78ae4ec885571f92",
"flutter.js": "888483df48293866f9f41d3d9274a779",
"main.dart.js": "845baef0eb1d16e06e8eea3ccec6444c",
"manifest.json": "10fa1886363c3e5d4face4c1b117e236",
"icons/Icon-512.png": "8fd30aece2b3e4d05f1a79e9d31f9d13",
"icons/Icon-maskable-512.png": "79441b3cea510f0e94ef9b61c0ebd224",
"icons/Icon-maskable-192.png": "239d14c4160c3a7f857cbc8535e98e81",
"icons/Icon-192.png": "ffa7ac76cf97c859881b7363b9e4367f",
"version.json": "9ffb0d7ea83b723d7fef52c1bf610f74"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"flutter_bootstrap.js",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
