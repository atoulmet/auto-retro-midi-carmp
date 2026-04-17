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

function extractWaypoints(xml) {
  const points = [];
  const re = /<Placemark[\s>]([\s\S]*?)<\/Placemark>/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    const block = match[1];

    const pointMatch = block.match(
      /<Point>\s*<coordinates>\s*([\s\S]*?)\s*<\/coordinates>\s*<\/Point>/i
    );
    if (!pointMatch) continue;

    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    const name = nameMatch ? nameMatch[1].trim() : "";

    const coords = pointMatch[1].trim().split(",");
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);

    points.push({ name, lat, lng });
  }

  return points;
}

async function processFile(file) {
  if (!file.name.endsWith(".kml")) {
    setStatus("Le fichier doit être au format .kml", "error");
    return;
  }

  setStatus("Lecture du fichier…", "loading");

  const text = await file.text();
  const waypoints = extractWaypoints(text);

  if (waypoints.length < 2) {
    setStatus(
      "Moins de 2 points trouvés dans le KML. Vérifiez qu'il contient un itinéraire avec des étapes.",
      "error"
    );
    return;
  }

  setStatus(
    `${waypoints.length} points détectés. Calcul de l'itinéraire…`,
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
