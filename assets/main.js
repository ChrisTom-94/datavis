import './style.css';
import * as d3 from "d3";
import * as topojson from "topojson-client";

// const worker = new Worker("./assets/worker.js");

let width = window.innerWidth;
let height = Math.max(width / 2, 600);
let globeRotation; // [number, number, number]
let speedRotation = 3;
let mapPosition; // [number, number]
d3.select('#speed-rotation').on("change", e => speedRotation = parseInt(e.target.value));

let timestamp = 0, animationID = 0;

const globeBackground = document.createElement("img");
globeBackground.src = "./assets/img/background.jpg";
const globeCanvas = d3.select("#globe-container").append("canvas").on("mousemove", onMouseMove).on("click", onClick)
globeCanvas.attr("width", width).attr("height", height).attr("data-globe", true);
const globeCtx = globeCanvas.node().getContext("2d");

const globeProjection = d3.geoOrthographic().translate([width / 2, height / 2]).precision(.1);
const globeGeoPath = d3.geoPath(globeProjection).context(globeCtx);

const mapCanvas = d3.select("#country-container").append("canvas").call(d3.drag().on("drag", onDrag));
mapCanvas.attr("width", width).attr("height", height);
const mapCtx = mapCanvas.node().getContext("2d");

const mapProjection = d3.geoEquirectangular().precision(0.5);
const mapGeoPath = d3.geoPath(mapProjection).context(mapCtx);

let topology, land, countries, countriesList, hoverCountry = null, currentCountry = null;

(async () => {
    topology = await d3.json('https://unpkg.com/world-atlas@1/world/110m.json');
    countriesList = await d3.tsv('https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv');
    land = topojson.feature(topology, topology.objects.land)
    countries = topojson.feature(topology, topology.objects.countries)
    animationID = requestAnimationFrame(animateGlobe);
    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onWheel, {passive: false})
})();

function drawGeometry(geoPath, geometry, color, type = "fill"){
    const ctx = geoPath.context();
    ctx.beginPath();
    geoPath(geometry);
    ctx[`${type}Style`] = color;
    ctx[type]();
    ctx.closePath();
}

function drawGeoPath(geoPath, background, paths){
    const ctx = geoPath.context();
    ctx.clearRect(0,0, width, height);
    ctx.drawImage(background, 0, 0, width, height)
    paths.forEach(({geometry, color, type}) => drawGeometry(geoPath, geometry, color, type))
}

function getGlobePaths(){
    return [
        {geometry: {type: "Sphere"}, color: "#1a285a", type: "fill"},
        {geometry: land, color: "#3b5842", type: "fill"},
        {geometry: countries, color: "#ffffff", type: "stroke"}
    ]
}

function animateGlobe(elapsed){
    if(animationID === 0) return
    const now = d3.now();
    const gap = now - timestamp;
    timestamp = now;
    animationID = requestAnimationFrame(animateGlobe)
    if(gap >= elapsed) return
    !hoverCountry && rotateGlobe(gap);
    drawGeoPath(globeGeoPath, globeBackground, getGlobePaths());
    hoverCountry && drawGeometry(globeGeoPath, hoverCountry.path, "#ff0000", "fill");
}

function rotateGlobe(gap){
    globeRotation = globeProjection.rotate();
    globeRotation[0] += gap * (speedRotation / 100);
    globeProjection.rotate(globeRotation);
}

function findCountry(e){
    const mousePosition = globeProjection.invert(d3.pointer(e));
    const path = countries.features.find(country => country.geometry.coordinates.some(polygon => (
        d3.polygonContains(polygon, mousePosition) || polygon.some(subPoly => d3.polygonContains(subPoly, mousePosition))
    )));
    const data = path && countriesList.find(c => c.id === path.id);
    return {path, data};
}

// Events functions

function onResize(){
    width = document.documentElement.clientWidth;
    height = width / 2;
    globeCanvas.attr('width', width).attr('height', height);
    globeProjection.scale((0.7 * Math.min(width, height)) / 2).translate([width / 2, height / 2]);
    mapCanvas.attr('width', width).attr('height', height);
    mapProjection.scale((0.7 * Math.min(width, height)) / 2).translate([width / 2, height / 2]);
}

function onMouseMove(e){
    hoverCountry = findCountry(e);
}

function onClick(e){
    currentCountry = findCountry(e);
    drawGeoPath(mapGeoPath, globeBackground, [{geometry: currentCountry.path, color: "#ff0000", type: "stroke"}]);
}

function onWheel(e){
    if(e.target.tagName !== "CANVAS") return
    e.preventDefault();
    const currentProjection = e.target.dataset.globe ? globeProjection : mapProjection;
    let zoom = currentProjection.scale();
    e.deltaY > 0 ? zoom++ : zoom--;
    currentProjection.scale(zoom);
    currentProjection === mapProjection && drawGeoPath(mapGeoPath, globeBackground, [{geometry: currentCountry.path, color: "#ff0000", type: "fill"}]);
}

function onDrag(e){
    let [x, y] = mapProjection.translate()
    mapPosition = [x + (e.dx), y + (e.dy)]
    mapProjection.translate(mapPosition);
    drawGeoPath(mapGeoPath, globeBackground, [{geometry: currentCountry.path, color: "#ff0000", type: "fill"}]);
}

