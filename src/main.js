const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const status = document.getElementById("status");
const result = document.getElementById("result");

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = type;
}

function showResult(text) {
  result.textContent = text;
  result.classList.add("visible");
}

function extractRouteCoords(xml) {
  const lineMatch = xml.match(
    /<LineString>\s*<tessellate>[^<]*<\/tessellate>\s*<coordinates>([\s\S]*?)<\/coordinates>\s*<\/LineString>/i
  );
  if (!lineMatch) return [];

  return lineMatch[1]
    .trim()
    .split(/\s+/)
    .map((c) => {
      const [lng, lat] = c.split(",").map(Number);
      return { lat, lng };
    })
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
}

function extractPlacemarkNames(xml) {
  const names = [];
  const re = /<Placemark[\s>]([\s\S]*?)<\/Placemark>/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    if (!/<Point>/i.test(block)) continue;
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    if (nameMatch) names.push(nameMatch[1].trim());
  }

  return names;
}

function sampleWaypoints(coords, maxWaypoints = 25) {
  if (coords.length <= maxWaypoints) return coords;

  const result = [coords[0]];
  const step = (coords.length - 1) / (maxWaypoints - 1);

  for (let i = 1; i < maxWaypoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }

  result.push(coords[coords.length - 1]);
  return result;
}

async function processFile(file) {
  if (!file.name.endsWith(".kml")) {
    setStatus("Le fichier doit être au format .kml", "error");
    return;
  }

  setStatus("Lecture du fichier…", "loading");

  const text = await file.text();
  const coords = extractRouteCoords(text);
  const names = extractPlacemarkNames(text);

  if (coords.length < 2) {
    setStatus(
      "Pas de tracé trouvé dans le KML. Vérifiez qu'il contient un itinéraire avec une LineString.",
      "error"
    );
    return;
  }

  const waypoints = sampleWaypoints(coords, 25);
  if (names[0]) waypoints[0].name = names[0];
  if (names[names.length - 1]) waypoints[waypoints.length - 1].name = names[names.length - 1];

  setStatus(
    `${coords.length} points → ${waypoints.length} waypoints. Calcul de l'itinéraire…`,
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
  showResult(data.text);
}

// Drag & drop
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

// Click fallback
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) processFile(file);
});
