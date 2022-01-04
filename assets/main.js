import "./style.css";
import * as d3 from "d3";
import * as topojson from "topojson-client";

const atlasURL = "https://unpkg.com/world-atlas@1/world/110m.json";
const atlasCountriesUrl = "https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv";
const countriesURL = "https://restcountries.com/v3.1/all";

const totalPopulationEl = d3.select("#total-population");
const countriesFlagsNameEl = d3.select("#current-flag-name");
const countriesFlagsEl = d3.select("#flags");
const countriesFlagsDataEl = d3.select("#current-flag-data");

let width = window.innerWidth;
let height = Math.max(width / 2, 600);

// Globe
const globeCanvas = d3.select("#globe-container").append("canvas")
    .on("mousemove", onMouseMove).on("click", onClick)
    .call(d3.drag().on("start", () => isDragging = true).on("drag", onDragGlobe).on("end", () => isDragging = false))
    .call(d3.zoom().on("zoom", onZoom))
globeCanvas.attr("width", width).attr("height", height).attr("data-globe", true);

const globeCtx = globeCanvas.node().getContext("2d");

const globeBackground = document.createElement("img");
globeBackground.src = "./assets/img/background.jpg";

const globeProjection = d3.geoOrthographic().translate([width / 2, height / 2]).rotate([0, 0]).precision(0.1);
const globeGeoPath = d3.geoPath(globeProjection).context(globeCtx);

// Map
const mapCanvas = d3.select("#country-container").append("canvas")
                    .call(d3.drag().on("drag", onDragMap))
                    .call(d3.zoom().on("zoom", onZoom));
mapCanvas.attr("width", width).attr("height", height);

const mapCtx = mapCanvas.node().getContext("2d");

const mapProjection = d3.geoEquirectangular().precision(0.5);
const mapGeoPath = d3.geoPath(mapProjection).context(mapCtx);

const scaleFactor = 25;
const dragFactor = 50;

let countries, 
    totalPopulation, 
    topology = null, 
    landPaths = null, 
    countriesPaths = null, 
    countriesList = null, 

    globeRotation, // [number, number, number]
    speedRotation = 2,

    mapPosition, // [number, number]

    hoverCountry = null, 
    currentCountry = null,

    timestamp = 0,
    animationID = 0, 
    isDragging = false;

const globePaths = () => ([
    { geometry: { type: "Sphere" }, color: "#0063A7", type: "fill" },
    { geometry: landPaths, color: "#6ccc00", type: "fill" },
    { geometry: countriesPaths, color: "#ffffff", type: "stroke" },
]);

const mapPaths = () => [{ geometry: currentCountry?.path, color: "#ff0000", type: "fill" }];

(async () => {
    countries = await d3.json(countriesURL);
    totalPopulation = countries.reduce((acc, current) => (acc += current.population), 0);
    totalPopulationEl.text(totalPopulation)
    countriesList = countries.reduce((acc, current) => ([...acc, {name: current.name.common, flag: current.flag}]), []);
    countriesFlagsEl.selectAll("span").data(countriesList).enter().append("span").text(d => d.flag);
    topology = await d3.json(atlasURL);
    landPaths = topojson.feature(topology, topology.objects.land);
    countriesPaths = topojson.feature(topology, topology.objects.countries);
    hydrateCountriesPaths();
    animationID = requestAnimationFrame(animateGlobe);
    window.addEventListener("resize", onResize);
})();

function drawGeometry(geoPath, geometry, color, type = "fill") {
    const ctx = geoPath.context();
    ctx.beginPath();
    geoPath(geometry);
    ctx[`${type}Style`] = color;
    ctx.lineWidth = 0.5;
    ctx[type]();
    ctx.closePath();
}

function drawGeoPath(geoPath, paths, background = null) {
    const ctx = geoPath.context();
    ctx.clearRect(0, 0, width, height);
    background && ctx.drawImage(background, 0, 0, width, height);
    paths.forEach(({ geometry, color, type }) => drawGeometry(geoPath, geometry, color, type));
}

function animateGlobe(elapsed) {
    if (animationID === 0) return;
    const now = d3.now();
    const gap = now - timestamp;
    timestamp = now;
    animationID = requestAnimationFrame(animateGlobe);
    if (gap >= elapsed) return;
    !hoverCountry && rotateGlobe(gap);
    drawGeometry(globeGeoPath, { type: "Sphere" }, "#ff0000", "fill", true);
    drawGeoPath(globeGeoPath, globePaths(), globeBackground);
    hoverCountry && drawGeometry(globeGeoPath, hoverCountry, "#ff0000", "fill", true);
}

function rotateGlobe(gap) {
    globeRotation = globeProjection.rotate();
    globeRotation[0] += gap * (speedRotation / 100);
    globeProjection.rotate(globeRotation);
}

function findCountry(e) {
    const mousePosition = globeProjection.invert(d3.pointer(e));
    const country = countriesPaths.features.find((country) => (
      country.geometry.coordinates.some((polygon) =>(
          d3.polygonContains(polygon, mousePosition) ||
          polygon.some((subPoly) => d3.polygonContains(subPoly, mousePosition))
      )))
    );
    return country ?? null;
}

async function hydrateCountriesPaths(){
    let countriesListTemp = await d3.tsv(atlasCountriesUrl);
    countriesListTemp.forEach(country => {
        countriesPaths.features = countriesPaths.features.map(path => (
            parseInt(path.id) === parseInt(country.id) ? {...path, properties : {name: country.name}} : path
        ))
    });
}

// Events functions

function onResize() {
    width = document.documentElement.clientWidth;
    height = width / 2;
    globeCanvas.attr("width", width).attr("height", height);
    globeProjection.scale((0.7 * Math.min(width, height)) / 2).translate([width / 2, height / 2]);
    mapCanvas.attr("width", width).attr("height", height);
    mapProjection.scale((0.7 * Math.min(width, height)) / 2).translate([width / 2, height / 2]);
    drawGeoPath(mapGeoPath, mapPaths());
}

function onMouseMove(e) {
    if (e.target.tagName !== "CANVAS" && !e.target.dataset.globe) return;
    hoverCountry = findCountry(e);
}

function onClick(e) {
    if (e.target.tagName !== "CANVAS" && !e.target.dataset.globe) return;
    currentCountry = findCountry(e);
    drawGeoPath(mapGeoPath, mapPaths());
}

function onZoom(e) {
    const currentProjection = e.sourceEvent.target.dataset.globe ? globeProjection : mapProjection;
    let zoom = currentProjection.scale();
    e.sourceEvent.deltaY > 0 ? (zoom += scaleFactor) : (zoom -= scaleFactor);
    zoom = Math.min(Math.max(zoom, 50), 300);
    currentProjection.scale(zoom);
    currentProjection === mapProjection && drawGeoPath(mapGeoPath, mapPaths());
}

function onDragMap(e) {
    let [x, y] = mapProjection.translate();
    mapPosition = [x + e.dx, y + e.dy];
    mapProjection.translate(mapPosition);
    drawGeoPath(mapGeoPath, mapPaths());
}

function onDragGlobe(e) {
    globeRotation = globeProjection.rotate();
    const offset = dragFactor / globeProjection.scale();
    globeRotation[0] += e.dx * offset;
    globeRotation[1] += (-e.dy) * offset;
    globeProjection.rotate(globeRotation);
}