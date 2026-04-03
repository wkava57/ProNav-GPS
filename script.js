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
geocoder.on('result', (e) => {
    const coords = e.result.geometry.coordinates;
    
    // On simule un clic pour placer nos propres marqueurs (vert/rouge)
    map.fire('click', {
        lngLat: { lng: coords[0], lat: coords[1] },
        point: map.project([coords[0], coords[1]])
    });
    
    console.log("Lieu trouvé : ", e.result.place_name);
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
async function calculateRoute() {
    if (markers.length < 2) return;

    const start = markers[0].getLngLat();
    const end = markers[1].getLngLat();
    const vehicleHeight = parseFloat(document.getElementById('height').value);
    
    // Vérification des options ADR
    const isExplosive = document.getElementById('adr-explosive').checked;
    const isGas = document.getElementById('adr-gas').checked;

if (isExplosive || isGas) {
    console.log("Attention : Transport ADR détecté.");
    // Ici on pourra plus tard ajouter des paramètres de filtrage Mapbox
    // Pour l'instant, on prévient l'utilisateur
    document.getElementById('status-text').innerHTML = "⚠️ <span style='color:#f1c40f'>Itinéraire ADR : Évitez les tunnels catégorie E.</span>";
}

    // Construction de l'URL pour l'API Directions
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${ACCESS_TOKEN}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            throw new Error("Aucun itinéraire trouvé");
        }

        const routeData = data.routes[0];
        const routeGeojson = routeData.geometry;

        // Mise à jour de l'interface (Distance & Temps)
        document.getElementById('dist').innerText = (routeData.distance / 1000).toFixed(1);
        document.getElementById('time').innerText = Math.floor(routeData.duration / 60);
        document.getElementById('route-details').style.display = 'block';

        // Affichage du tracé sur la carte
        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeojson);
        } else {
            map.addSource('route', { 
                'type': 'geojson', 
                'data': routeGeojson 
            });
            map.addLayer({
                'id': 'route',
                'type': 'line',
                'source': 'route',
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': { 
                    'line-color': '#48abe0', 
                    'line-width': 6, 
                    'line-opacity': 0.8 
                }
            });
        }

        // Message d'alerte selon le gabarit
        if (vehicleHeight > 3.8) {
            document.getElementById('status-text').innerHTML = "⚠️ <span style='color:#e67e22'>Gabarit haut détecté. Vérifiez manuellement les ponts.</span>";
        } else {
            document.getElementById('status-text').innerText = "✅ Itinéraire routier chargé.";
        }

    } catch (error) {
        console.error("Erreur lors du calcul :", error);
        document.getElementById('status-text').innerText = "❌ Erreur de connexion au service de routage.";
    }
}