const map = L.map('map').setView([18.5204, 73.8567], 13);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Blocky Technology'
});
osm.addTo(map);

// Icons
const taxiIcon = L.icon({
    iconUrl: 'icons/taxi.png',
    iconSize: [50, 50]
});

const startIcon = L.icon({
    iconUrl: 'icons/start.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

const endIcon = L.icon({
    iconUrl: 'icons/end.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

// Get DOM elements
const timeSelect = document.querySelector('.time-select');
const speedControl = document.querySelector('.speed-control');
const speedSlider = speedControl.querySelector('.speed-slider');
const speedLabel = speedControl.querySelector('label span');
const startButton = document.querySelector('.simulation-button.start');
const stopButton = document.querySelector('.simulation-button.stop');
const resetButton = document.querySelector('.simulation-button.reset');

let currentLocationMarker = null;
let currentLocationCircle = null;
let startMarker = null;
let endMarker = null;
let currentSimulation = null;
let routingControl = null;
let currentStep = 0;
let simulationSpeed = 50;
let locationWatchId = null;
let startTime = null;
let totalDistance = 0;
let lastPosition = null;

// Speed control event listener
speedSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    simulationSpeed = value;
    const speedMultiplier = (200 - value + 10) / 100;
    speedLabel.textContent = speedMultiplier.toFixed(1) + 'x';
});

// Handle time period changes
timeSelect.addEventListener('change', async () => {
    const isToday = timeSelect.value === 'today';
    
    // Stop any ongoing simulation and tracking
    stopSimulation();
    stopLocationTracking();
    
    // Remove existing markers and routes
    cleanupMarkers();
    
    // Update controls visibility
    speedControl.style.display = isToday ? 'none' : 'flex';
    document.querySelector('.simulation-buttons').style.display = isToday ? 'none' : 'flex';
    
    try {
        if (isToday) {
            checkAndRequestLocation();
        } else {
            await showRouteForDay(timeSelect.value);
        }
    } catch (error) {
        console.error('Error switching modes:', error);
        handleError('Failed to switch modes. Please try again.');
    }
});

function handleError(message) {
    // Remove any existing error message
    const existingError = document.querySelector('.location-error');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'location-error';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    // Remove the message after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

// Create taxi marker with popup
const taxiMarker = L.marker([18.5204, 73.8567], { icon: taxiIcon });

// Add click event listener to taxi marker
taxiMarker.on('click', function(e) {
    const content = createPopupContent();
    if (content) {
        const popup = L.popup()
            .setLatLng(e.target.getLatLng())
            .setContent(content);
        e.target.unbindPopup();
        e.target.bindPopup(popup);
        e.target.openPopup();
    }
});

function createPopupContent() {
    if (timeSelect.value === 'today') return null;

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB');
    const formattedTime = currentDate.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Get start coordinates from route
    let startCoords = routingControl && routingControl._routes ? 
        routingControl._routes[0].coordinates[0] : taxiMarker.getLatLng();

    return `
        <div class="taxi-info-popup">
            <h2>Vehicle Information</h2>
            <p><span class="info-label">Date:</span> ${formattedDate}</p>
            <p><span class="info-label">Time:</span> ${formattedTime}</p>
            <p><span class="info-label">Start Coordinates:</span> ${startCoords.lat.toFixed(4)}, ${startCoords.lng.toFixed(4)}</p>
            <p><span class="info-label">Current Coordinates:</span> ${taxiMarker.getLatLng().lat.toFixed(4)}, ${taxiMarker.getLatLng().lng.toFixed(4)}</p>
            <p><span class="info-label">Total Distance:</span> ${totalDistance.toFixed(2)} km</p>
        </div>
    `;
}

async function showRouteForDay(selectedPeriod) {
    try {
        const routeData = await loadRouteData();
        if (!routeData) {
            throw new Error('No route data available');
        }

        const route = routeData[selectedPeriod];
        if (!route || !route.coordinates.length) {
            throw new Error('No route data available for selected period');
        }

        const coordinates = route.coordinates;
        const startPos = coordinates[0];
        const endPos = coordinates[coordinates.length - 1];

        // Add start and end markers
        startMarker = L.marker([startPos.lat, startPos.lng], { icon: startIcon })
            .bindPopup('Start Point')
            .addTo(map);
        
        endMarker = L.marker([endPos.lat, endPos.lng], { icon: endIcon })
            .bindPopup('End Point')
            .addTo(map);

        // Position taxi at start
        taxiMarker.setLatLng([startPos.lat, startPos.lng]).addTo(map);

        // Show route
        if (routingControl) {
            map.removeControl(routingControl);
        }

        routingControl = L.Routing.control({
            waypoints: coordinates.map(coord => L.latLng(coord.lat, coord.lng)),
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            showAlternatives: false,
            show: false,
            lineOptions: {
                styles: [
                    {color: '#4285f4', opacity: 0.8, weight: 4}
                ]
            },
            createMarker: function() { return null; }
        }).addTo(map);

        // Fit map to show entire route with padding
        routingControl.on('routesfound', function(e) {
            const routes = e.routes[0];
            const bounds = L.latLngBounds(routes.coordinates);
            map.fitBounds(bounds, { padding: [50, 50] });
        });

    } catch (error) {
        console.error('Error showing route:', error);
        handleError(error.message || 'Failed to show route. Please try again.');
        
        // Reset to a clean state
        cleanupMarkers();
        map.setView([18.5204, 73.8567], 13);
    }
}

function cleanupMarkers() {
    if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
        currentLocationMarker = null;
    }
    if (currentLocationCircle) {
        map.removeLayer(currentLocationCircle);
        currentLocationCircle = null;
    }
    if (taxiMarker && map.hasLayer(taxiMarker)) {
        map.removeLayer(taxiMarker);
    }
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
}

function checkAndRequestLocation() {
    if (!navigator.geolocation) {
        handleError("Geolocation is not supported by your browser");
        switchToYesterday();
        return;
    }

    navigator.permissions.query({ name: 'geolocation' })
        .then(permission => {
            if (permission.state === 'granted') {
                startLocationTracking();
            } else if (permission.state === 'prompt') {
                // Show a custom message before requesting permission
                if (confirm('This app needs your location to show real-time tracking. Allow location access?')) {
                    startLocationTracking();
                } else {
                    handleError("Location access was denied");
                    switchToYesterday();
                }
            } else {
                handleError("Location access is blocked. Please enable it in your browser settings.");
                switchToYesterday();
            }
        })
        .catch(() => {
            // If permissions API fails, try direct geolocation
            startLocationTracking();
        });
}

function switchToYesterday() {
    timeSelect.value = 'yesterday';
    speedControl.style.display = 'flex';
    document.querySelector('.simulation-buttons').style.display = 'flex';
    showRouteForDay('yesterday');
}

function startLocationTracking() {
    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };

    try {
        // Get initial position
        navigator.geolocation.getCurrentPosition(
            updateLocation,
            handleLocationError,
            options
        );

        // Start watching position
        locationWatchId = navigator.geolocation.watchPosition(
            updateLocation,
            handleLocationError,
            options
        );
    } catch (e) {
        handleLocationError({ code: 'UNKNOWN', message: "Failed to start location tracking" });
    }
}

function updateLocation(position) {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    cleanupMarkers();

    currentLocationMarker = L.marker([lat, long]).addTo(map);
    currentLocationCircle = L.circle([lat, long], { 
        radius: accuracy,
        color: '#4285f4',
        fillColor: '#4285f4',
        fillOpacity: 0.2
    }).addTo(map);

    const featureGroup = L.featureGroup([currentLocationMarker, currentLocationCircle]);
    map.fitBounds(featureGroup.getBounds());
}

function handleLocationError(error) {
    let message = "Location error occurred. Switching to simulation mode.";
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
        case 'PERMISSION_DENIED':
            message = "Location access was denied. Please enable location services to use live tracking.";
            break;
        case error.POSITION_UNAVAILABLE:
            message = "Location information is currently unavailable. Please try again later.";
            break;
        case error.TIMEOUT:
            message = "Location request timed out. Please check your connection.";
            break;
        case 'NOT_SUPPORTED':
            message = "Your browser doesn't support geolocation.";
            break;
    }

    // Show error in a non-blocking way
    const errorDiv = document.createElement('div');
    errorDiv.className = 'location-error';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    // Remove the message after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);

    // Switch to yesterday's view
    timeSelect.value = 'yesterday';
    speedControl.style.display = 'flex';
    document.querySelector('.simulation-buttons').style.display = 'flex';
    
    stopLocationTracking();
    const taxiMarker = L.marker([18.5204, 73.8567], { icon: taxiIcon });
    taxiMarker.addTo(map);
    map.setView([18.5204, 73.8567], 13);
}

// Add CSS for error message
const style = document.createElement('style');
style.textContent = `
.location-error {
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #ff4444;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 1000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
    from {
        top: -50px;
        opacity: 0;
    }
    to {
        top: 70px;
        opacity: 1;
    }
}
`;
document.head.appendChild(style);

// Simulation functions
async function loadRouteData() {
    try {
        const response = await fetch('data/taxi_routes.json');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error loading route data:', error);
        return null;
    }
}

function stopSimulation() {
    if (currentSimulation) {
        clearTimeout(currentSimulation);
        currentSimulation = null;
        startTime = null;
    }
}

async function resetSimulation() {
    // Stop the current animation
    stopSimulation();
    
    const routeData = await loadRouteData();
    if (!routeData) return;

    const selectedPeriod = timeSelect.value;
    const route = routeData[selectedPeriod];
    
    if (!route || !route.coordinates.length) {
        alert('No route data available for selected period');
        return;
    }

    // Remove taxi from current position
    if (map.hasLayer(taxiMarker)) {
        map.removeLayer(taxiMarker);
    }

    // Reset taxi to initial position
    const startPosition = route.coordinates[0];
    taxiMarker.setLatLng([startPosition.lat, startPosition.lng]);
    taxiMarker.addTo(map);
    
    // Reset tracking variables
    currentStep = 0;
    totalDistance = 0;
    lastPosition = null;
    startTime = null;

    // If we don't have a route displayed, show it
    if (!routingControl || !routingControl._routes) {
        await showRouteForDay(selectedPeriod);
    }
}

async function startSimulation() {
    if (timeSelect.value === 'today') return;
    
    // Reset tracking variables
    startTime = Date.now();
    totalDistance = 0;
    lastPosition = null;
    
    // Stop any existing simulation
    stopSimulation();
    
    const routeData = await loadRouteData();
    if (!routeData) return;

    const selectedPeriod = timeSelect.value;
    const route = routeData[selectedPeriod];
    
    if (!route || !route.coordinates.length) {
        alert('No route data available for selected period');
        return;
    }

    // If we already have a route, start animating
    if (routingControl && routingControl._routes && routingControl._routes.length > 0) {
        const coordinates = routingControl._routes[0].coordinates;
        animateRoute(coordinates);
    } else {
        // Create new route if we don't have one
        routingControl = L.Routing.control({
            waypoints: route.coordinates.map(coord => L.latLng(coord.lat, coord.lng)),
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            showAlternatives: false,
            show: false,
            lineOptions: {
                styles: [
                    {color: '#4285f4', opacity: 0.8, weight: 4}
                ]
            },
            createMarker: function() { return null; }
        }).addTo(map);

        routingControl.on('routesfound', function(e) {
            const coordinates = e.routes[0].coordinates;
            animateRoute(coordinates);
        });
    }
}

function animateRoute(coordinates) {
    let step = currentStep;
    
    function animateStep() {
        if (step >= coordinates.length) {
            stopSimulation();
            return;
        }
        
        const newPos = [coordinates[step].lat, coordinates[step].lng];
        taxiMarker.setLatLng(newPos);
        
        // Update popup if it's open
        if (taxiMarker.isPopupOpen()) {
            const content = createPopupContent();
            if (content) {
                taxiMarker.getPopup().setContent(content);
            }
        }
        
        // Update last position for speed calculation
        lastPosition = taxiMarker.getLatLng();
        
        currentStep = step;
        step++;
        currentSimulation = setTimeout(animateStep, simulationSpeed);
    }
    
    animateStep();
}

function stopLocationTracking() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
}

// Event listeners for simulation controls
startButton.addEventListener('click', () => {
    if (timeSelect.value !== 'today') {
        startSimulation();
    }
});

stopButton.addEventListener('click', stopSimulation);

resetButton.addEventListener('click', () => {
    if (timeSelect.value !== 'today') {
        resetSimulation();
    }
});

// Initialize with current selection
document.addEventListener('DOMContentLoaded', () => {
    try {
        const isToday = timeSelect.value === 'today';
        speedControl.style.display = isToday ? 'none' : 'flex';
        document.querySelector('.simulation-buttons').style.display = isToday ? 'none' : 'flex';

        if (isToday) {
            checkAndRequestLocation();
        } else {
            showRouteForDay(timeSelect.value);
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        handleError('Failed to initialize. Please refresh the page.');
    }
});