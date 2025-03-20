document.addEventListener('DOMContentLoaded', function() {
    // Mapbox configuration
    const mapboxAccessToken = 'pk.eyJ1Ijoib3Jlc2hlYSIsImEiOiJjbThmZGJqb2QwYjFxMnhwdXo1MHJoaXAxIn0.ZSd88vk0C2eDeJZdQ1ouGg';
    const mapboxUsername = 'oreshea'; // Your Mapbox username
    const mapboxStyleId = 'cm8fdlohc00yp01r09f6y8jbj'; // Your style ID
    
    let trafficLayer = null;
    let baseLayer = null;

    // Map centered on Calgary initially
    const map = L.map('map').setView([51.0447, -114.0719], 11);

    // OpenStreetMap tile layer as the base layer
    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // marker cluster group
    const markers = L.markerClusterGroup({
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });

    // Spiderfier
    const oms = new OverlappingMarkerSpiderfier(map);

    // date range picker
    $('#daterange').daterangepicker({
        opens: 'center',
        startDate: moment().subtract(7, 'days'),
        endDate: moment(),
        locale: {
            format: 'YYYY-MM-DD'
        },
        maxDate: moment()
    });

    // Add event listeners
    document.getElementById('search-form').addEventListener('submit', function(event) {
        event.preventDefault();
        searchPermits();
    });

    // Traffic layer toggle
    document.getElementById('traffic-layer-toggle').addEventListener('change', function() {
        toggleTrafficLayer(this.checked);
    });

    // Setup popup on spiderfier
    const popup = new L.Popup();
    oms.addListener('click', function(marker) {
        popup.setContent(marker.desc);
        popup.setLatLng(marker.getLatLng());
        map.openPopup(popup);
    });

    // Toggle traffic incidents layer
    function toggleTrafficLayer(show) {
        try {
            if (show) {
                // Create traffic layer if it doesn't exist
                if (!trafficLayer) {
                    // Create a Mapbox tiled layer using Leaflet
                    const mapboxUrl = `https://api.mapbox.com/styles/v1/${mapboxUsername}/${mapboxStyleId}/tiles/256/{z}/{x}/{y}?access_token=${mapboxAccessToken}`;
                    
                    trafficLayer = L.tileLayer(mapboxUrl, {
                        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
                        maxZoom: 19
                    });
                }
                
                // Remove base layer
                if (map.hasLayer(baseLayer)) {
                    map.removeLayer(baseLayer);
                }
                
                // Add traffic layer to map
                trafficLayer.addTo(map);
                
                
                if (map.hasLayer(markers)) {
                    markers.bringToFront();
                }
            } else {
                // Remove traffic layer if it exists
                if (trafficLayer && map.hasLayer(trafficLayer)) {
                    map.removeLayer(trafficLayer);
                }
                
                // Add back base layer if not on map
                if (!map.hasLayer(baseLayer)) {
                    baseLayer.addTo(map);
                }
            }
        } catch (error) {
            console.error('Error toggling traffic layer:', error);
            showStatusMessage('Error toggling traffic incidents layer: ' + error.message);
        }
    }

    // Function to search for permits based on date range
    function searchPermits() {
        // Show loader
        document.getElementById('loader').style.display = 'block';
        // Hide any previous error messages
        document.getElementById('status-message').style.display = 'none';

        // Get date range
        const dates = $('#daterange').data('daterangepicker');
        const startDate = dates.startDate.format('YYYY-MM-DD');
        const endDate = dates.endDate.format('YYYY-MM-DD');

        // Clear existing markers
        markers.clearLayers();
        if (map.hasLayer(markers)) {
            map.removeLayer(markers);
        }

        // Construct API URL w/ date range query
        const apiUrl = `https://data.calgary.ca/resource/c2es-76ed.geojson?$where=issueddate >= '${startDate}' and issueddate <= '${endDate}'`;

        // Fetch data from Open Calgary API
        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                // Process GeoJSON data
                if (data.features.length === 0) {
                    showStatusMessage('No permits found for the selected date range.');
                    return;
                }

                // Create markers for each permit
                data.features.forEach(feature => {
                    if (feature.geometry && feature.geometry.coordinates) {
                        const coordinates = feature.geometry.coordinates;

                        // Coordinates [longitude, latitude]
                        if (coordinates.length >= 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                            // Create marker
                            const marker = L.marker([coordinates[1], coordinates[0]]);

                            // Create popup
                            const properties = feature.properties;
                            const popupContent = `
                                <div class="popup-content">
                                    <h3>Building Permit</h3>
                                    <p><strong>Issued Date:</strong> ${formatDate(properties.issueddate)}</p>
                                    <p><strong>Work Class:</strong> ${properties.workclassgroup || 'N/A'}</p>
                                    <p><strong>Contractor:</strong> ${properties.contractorname || 'N/A'}</p>
                                    <p><strong>Community:</strong> ${properties.communityname || 'N/A'}</p>
                                    <p><strong>Address:</strong> ${properties.originaladdress || 'N/A'}</p>
                                </div>
                            `;

                            // Attach popup to marker
                            marker.desc = popupContent;
                            oms.addMarker(marker);
                            markers.addLayer(marker);
                        }
                    }
                });

                map.addLayer(markers);

                if (document.getElementById('traffic-layer-toggle').checked && trafficLayer) {
                    markers.bringToFront();
                }

                if (markers.getLayers().length > 0) {
                    map.fitBounds(markers.getBounds(), { padding: [50, 50] });
                }

                document.getElementById('loader').style.display = 'none';
            })
            .catch(error => {
                console.error('Error fetching permits:', error);
                showStatusMessage('Error loading permits. Please try again.');
                document.getElementById('loader').style.display = 'none';
            });
    }

    // Format date
    function formatDate(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        // Check if date is valid
        if (isNaN(date.getTime())) return dateString;
        // Format date as YYYY-MM-DD
        return date.toISOString().split('T')[0];
    }

    // Show status messages
    function showStatusMessage(message) {
        const statusElement = document.getElementById('status-message');
        statusElement.textContent = message;
        statusElement.style.display = 'block';
    }

    // Default date range from initial search
    searchPermits();
});