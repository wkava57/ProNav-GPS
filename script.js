// 1. CONFIGURATION : Remplace par ton vrai Token Mapbox (pk.xxx)
const ACCESS_TOKEN = 'pk.eyJ1Ijoid2thdmE1NyIsImEiOiJjbW5pZjM2cGQwY2FvMm9xdWRrYjZxOTJ5In0.6KNi_KsVSgrnRb291uib0w';
mapboxgl.accessToken = ACCESS_TOKEN;

// 2. Initialisation de la carte
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/navigation-night-v1', 
    center: [2.3522, 48.8566], // Centré sur la France
    zoom: 6
});

// 1. On crée l'objet de recherche (Geocoder)
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken, // Ton token
    mapboxgl: mapboxgl,
    placeholder: 'Rechercher une ville ou adresse', // Le texte d'aide
    //countries: 'fr', // Pour rester en France
    marker: false // On ne veut pas le marqueur par défaut de Mapbox
});

// 2. ON L'AJOUTE RÉELLEMENT À LA CARTE (C'est cette ligne qui fait apparaître la loupe)
map.addControl(geocoder, 'top-left'); 

// 3. Que se passe-t-il quand on choisit une adresse ?
// Écouter quand l'utilisateur choisit une adresse
geocoder.on('result', (e) => {
    const coordsDestination = e.result.geometry.coordinates; // [Longitude, Latitude]
    console.log("Destination reçue :", coordsDestination);
    
    // APPEL DE LA FONCTION DE TRACÉ
    calculateRoute(coordsDestination);
});

// 2bis. Bouton de Géolocalisation (Point Bleu)
const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true // Force l'utilisation du GPS précis du téléphone
    },
    trackUserLocation: true, // Suit le mouvement du camion sur la carte
    showUserHeading: true   // Affiche la flèche de direction (Boussole)
});

// Ajoute le bouton en haut à droite (ou en bas pour le mobile si tu préfères)
map.addControl(geolocate, 'top-right');

map.on('load', () => {
    // On attend un court instant pour que la carte soit stable
    setTimeout(() => {
        console.log("Tentative de localisation automatique...");
        geolocate.trigger(); 
    }, 1500);
});

// Optionnel : Quand on clique sur le bouton, on définit le départ à ma position
geolocate.on('geolocate', (e) => {
    const lon = e.coords.longitude;
    const lat = e.coords.latitude;
    console.log("Position captée :", lon, lat);
    document.getElementById('status-text').innerText = "📍 Ma position détectée.";
});

let markers = [];

// 3. Fonction pour mettre à jour les gabarits selon le type de véhicule
function updateDefaults() {
    const type = document.getElementById('vehicleType').value;
    const h = document.getElementById('height');
    const w = document.getElementById('width');
    const weight = document.getElementById('weight');
    const axle = document.getElementById('axleLoad');

    const specs = {
        truck: [4.0, 2.5, 44, 11.5],
        van: [2.6, 2.1, 3.5, 2.0],
        bus: [3.8, 2.5, 19, 11.5],
        minibus: [2.8, 2.3, 7.5, 5.0],
        motorhome: [3.2, 2.3, 4.5, 3.0],
        emergency: [3.0, 2.2, 7.5, 5.0]
    };

    const val = specs[type] || [2.0, 1.8, 2.5, 1.5];
    h.value = val[0]; 
    w.value = val[1]; 
    weight.value = val[2]; 
    axle.value = val[3];
}

// 4. Gestion des clics sur la carte
map.on('click', (e) => {
    // Si on a déjà 2 points, on nettoie pour recommencer
    if (markers.length >= 2) {
        markers.forEach(m => m.remove());
        markers = [];
        if (map.getLayer('route')) map.removeLayer('route');
        if (map.getSource('route')) map.removeSource('route');
        document.getElementById('route-details').style.display = 'none';
        document.getElementById('status-text').innerText = "Cliquez pour définir le départ.";
    }

    const color = markers.length === 0 ? '#27ae60' : '#e74c3c';
    const marker = new mapboxgl.Marker({ color: color })
        .setLngLat(e.lngLat)
        .addTo(map);
    
    markers.push(marker);

    if (markers.length === 1) {
        document.getElementById('status-text').innerText = "Maintenant, cliquez pour l'arrivée.";
    } else {
        document.getElementById('status-text').innerText = "Points définis. Calcul en cours...";
        calculateRoute(); // Calcul automatique au 2ème clic
    }
});

// 5. Fonction de calcul d'itinéraire RÉEL (API Mapbox)
async function calculateRoute(endCoords) {
    // 1. VERIFICATION GPS
    if (!geolocate._lastKnownPosition) {
        alert("Position GPS introuvable. Activez la localisation.");
        return;
    }

    const start = [
        geolocate._lastKnownPosition.coords.longitude,
        geolocate._lastKnownPosition.coords.latitude
    ];

    // 2. CONSTRUCTION DE L'URL (L'arme anti-avion)
    // driving : force le passage sur route
    // geometries=geojson : pour une ligne fluide
    // overview=full : demande TOUS les points de la route au serveur
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            console.error("Aucun itinéraire trouvé sur route.");
            return;
        }

        const routeGeometry = data.routes[0].geometry;

        // 3. AFFICHAGE SUR LA CARTE
        // Si la source existe déjà, on met juste à jour les données
        if (map.getSource('route')) {
            map.getSource('route').setData({
                type: 'Feature',
                properties: {},
                geometry: routeGeometry
            });
        } 
        // Sinon, on crée la source et la couche (Layer)
        else {
            map.addSource('route', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: routeGeometry
                }
            });

            map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#00b4d8', // Bleu azur
                    'line-width': 6,          // Épaisseur visible
                    'line-opacity': 0.8
                }
            });
        }

        // 4. MISE À JOUR DES INFOS DANS LE HTML
        const distance = (data.routes[0].distance / 1000).toFixed(1); // KM
        const duration = Math.floor(data.routes[0].duration / 60);    // MIN
        
        document.getElementById('trip-distance').innerText = `${distance} km`;
        document.getElementById('trip-duration').innerText = `${duration} min`;
        document.getElementById('mission-data').style.display = 'block';

        // 5. AJUSTEMENT DE LA VUE
        // La carte s'adapte pour montrer tout l'itinéraire
        const bounds = new mapboxgl.LngLatBounds();
        routeGeometry.coordinates.forEach(coord => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 50 });

    } catch (error) {
        console.error("Erreur lors du calcul de l'itinéraire :", error);
    }
}