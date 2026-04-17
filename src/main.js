const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const urlInput = document.getElementById("url-input");
const urlBtn = document.getElementById("url-btn");
const status = document.getElementById("status");
const resultWrapper = document.getElementById("result-wrapper");
const result = document.getElementById("result");
const copyBtn = document.getElementById("copy-btn");
const mapBtn = document.getElementById("map-btn");
const mapImg = document.getElementById("map-img");

const mapContainer = document.getElementById("map-container");
const downloadBtn = document.getElementById("download-btn");

let currentMapData = null;

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = type;
}

function showResult(data) {
  result.textContent = data.text;
  currentMapData = data;
  mapContainer.classList.remove("visible");
  resultWrapper.classList.add("visible");
}

// --- URL Google Maps ---

function parseGoogleMapsUrl(url) {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/\/maps\/dir\/(.+?)(?:\?|@|$)/);
  if (!match) return null;

  const parts = match[1]
    .replace(/\/+$/, "")
    .split("/")
    .filter((p) => p && !p.startsWith("data="));

  if (parts.length < 2) return null;

  return parts.map((p) => ({ name: p.replace(/\+/g, " ") }));
}

async function processUrl() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Collez une URL Google Maps.", "error");
    return;
  }

  const waypoints = parseGoogleMapsUrl(url);
  if (!waypoints) {
    setStatus(
      "URL non reconnue. Attendu : https://www.google.com/maps/dir/A/B/...",
      "error"
    );
    return;
  }

  setStatus(
    `${waypoints.length} étapes détectées. Calcul de l'itinéraire…`,
    "loading"
  );

  const res = await fetch("/api/directions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    setStatus(data.error || "Erreur serveur", "error");
    return;
  }

  setStatus("");
  showResult(data);
}

// --- GPX ---

function extractGpxWaypoints(xml) {
  const points = [];
  const re = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)">([\s\S]*?)<\/wpt>/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const block = match[3];

    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    const name = nameMatch
      ? nameMatch[1].replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim()
      : "";

    points.push({ name, lat, lng });
  }

  return points;
}

function extractGpxTrackCoords(xml) {
  const points = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    points.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
  }

  return points;
}

function sampleWaypoints(coords, maxWaypoints = 25) {
  if (coords.length <= maxWaypoints) return coords;

  const sampled = [coords[0]];
  const step = (coords.length - 1) / (maxWaypoints - 1);

  for (let i = 1; i < maxWaypoints - 1; i++) {
    sampled.push(coords[Math.round(i * step)]);
  }

  sampled.push(coords[coords.length - 1]);
  return sampled;
}

async function processFile(file) {
  if (!file.name.endsWith(".gpx")) {
    setStatus("Le fichier doit être au format .gpx", "error");
    return;
  }

  setStatus("Lecture du fichier…", "loading");

  const text = await file.text();
  let waypoints = extractGpxWaypoints(text);

  if (waypoints.length < 2) {
    const trackCoords = extractGpxTrackCoords(text);
    if (trackCoords.length < 2) {
      setStatus("Aucun itinéraire trouvé dans le GPX.", "error");
      return;
    }
    waypoints = sampleWaypoints(trackCoords, 25);
  }

  setStatus(
    `${waypoints.length} étapes détectées. Calcul de l'itinéraire…`,
    "loading"
  );

  const res = await fetch("/api/directions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    setStatus(data.error || "Erreur serveur", "error");
    return;
  }

  setStatus("");
  showResult(data);
}

// --- Copy ---

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(result.textContent);
  copyBtn.textContent = "Copié !";
  setTimeout(() => (copyBtn.textContent = "Copier"), 1500);
});

// --- Map image ---

mapBtn.addEventListener("click", async () => {
  if (!currentMapData) return;

  mapBtn.textContent = "Chargement…";

  const res = await fetch("/api/static-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polyline: currentMapData.polyline }),
  });

  if (!res.ok) {
    mapBtn.textContent = "Erreur";
    setTimeout(() => (mapBtn.textContent = "Générer une image"), 1500);
    return;
  }

  const blob = await res.blob();
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const barHeight = 60;
    canvas.width = img.width;
    canvas.height = img.height + barHeight;
    const ctx = canvas.getContext("2d");

    // Fond blanc pour la barre de texte
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, barHeight);

    // Texte résumé
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(currentMapData.summary, canvas.width / 2, 40);

    // Image de la carte
    ctx.drawImage(img, 0, barHeight);

    canvas.toBlob((finalBlob) => {
      const blobUrl = URL.createObjectURL(finalBlob);
      mapImg.src = blobUrl;
      mapContainer.classList.add("visible");
      mapBtn.textContent = "Générer une image";

      downloadBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "itineraire.png";
        a.click();
      };
    });
  };
  img.src = URL.createObjectURL(blob);
});

// --- Events ---

urlBtn.addEventListener("click", processUrl);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") processUrl();
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) processFile(file);
});
