import "./style.css";
import * as d3 from "d3";
import * as topojson from "topojson-client";

const atlasURL = {land: "https://unpkg.com/world-atlas@2/land-110m.json", countries: "https://unpkg.com/world-atlas@2/countries-110m.json"}
const atlasCountriesList = "https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv";
const countriesURL = "https://restcountries.com/v3.1/all";

const totalPopulationEl = d3.select("#total-population");
const hoverCountryEl = d3.select("#hover-country");
const flagsNameEl = d3.select("#current-flag-name");
const flagsContainerEl = d3.select("#flags");
const flagsPopulationEl = d3.select("#current-flag-data");

// intersecation observer to animate flags only when user see the container in the screen
let observerOptions = {
    root: document.querySelector('#scrollArea'),
    rootMargin: '0px',
    threshold: 1.0
}
const flagsContainerObserver = new IntersectionObserver(observerCallback, observerOptions);

let canvasWidth = 500;
let canvasHeight =  500;

const svgOptions = {
    width: window.innerWidth,
    height: 500,
    padding: 20
}

const svg = d3.select("#countries-graph").append("svg")
.attr("width", svgOptions.width).attr("height", svgOptions.height)
.attr('style', 'transform: rotateX(180deg)');

// Globe
const globeCanvas = d3.select("#globe-container").append("canvas")
    .on("mousemove", onMouseMove).on("click", onClick)
    .call(d3.drag().on("drag", onDrag))
    .call(d3.zoom().on("zoom", onZoom))
globeCanvas.attr("width", canvasWidth).attr("height", canvasHeight).attr("data-globe", true);

const globeCtx = globeCanvas.node().getContext("2d");
const globeProjection = d3.geoOrthographic().translate([canvasWidth / 2, canvasHeight / 2]).rotate([0, 0]).precision(0.1);
const globeGeoPath = d3.geoPath(globeProjection).context(globeCtx);

const scaleFactor = 25;
const dragFactor = 50;

let countries = null, 
    totalPopulation = 0,
    landPaths = null, 
    countriesPaths = null, 

    globeRotation, // [number, number, number]
    speedRotation = 2,

    hoverCountry = null,
    selectedCountries = [],

    currentFlag = null,
    currentFlagEl = null,

    timestamp = 0,
    flagsTimer = null;

const globePaths = () => ([
    { geometry: { type: "Sphere" }, color: "#0074ba", type: "fill" },
    { geometry: landPaths, color: "#00d26a", type: "fill" },
    { geometry: countriesPaths, color: "#ffffff", type: "stroke" },
]);

(async () => {
    countries = await d3.json(countriesURL);
    countries = countries.reduce((prev, current) => [...prev, filterCountryData(current)], []);

    initTotalPopulation();
    await initGlobe();
    // initCountrieFlags();

    window.addEventListener("resize", onResize);
})();

function initTotalPopulation(){
    totalPopulation = calcultateTotalPopulation(countries);
    totalPopulationEl.text(separateNumberWithCommas(totalPopulation));
    d3.interval(animateTotalPopulation, 1000);
}

function initCountrieFlags(){
    flagsContainerEl.selectAll("span").data(countries)
    .enter()
    .append("span")
    .attr("data-flag", (d) => d.name)
    .text(d => d.flag);
    currentFlag = getRandomCountry();
    currentFlagEl = flagsContainerEl.select(`span[data-flag='${currentFlag.name}']`);
    flagsContainerObserver.observe(flagsContainerEl.node())
}

async function initGlobe(){
    let landTopology = await d3.json(atlasURL.land);
    let countriesTopology = await d3.json(atlasURL.countries);
    landPaths = topojson.feature(landTopology, landTopology.objects.land);
    countriesPaths = topojson.feature(countriesTopology, countriesTopology.objects.countries);
    await hydrateCountriesPaths();
    requestAnimationFrame(animateGlobe);
}

function drawGeometry(geoPath, geometry, color, type = "fill") {
    const ctx = geoPath.context();
    ctx.beginPath();
    geoPath(geometry);
    ctx[`${type}Style`] = color;
    ctx.lineWidth = 0.5;
    ctx[type]();
    ctx.closePath();
}

function drawGeoPath(geoPath, paths) {
    const ctx = geoPath.context();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    paths.forEach(({ geometry, color, type }) => drawGeometry(geoPath, geometry, color, type));
}

function animateTotalPopulation(){
    totalPopulation += randomInt();
    totalPopulationEl.text(separateNumberWithCommas(totalPopulation))
}

function animateFlags(){
    currentFlagEl.attr("class", "");
    currentFlag = countries[randomInt(0, countries.length)];
    currentFlagEl = flagsContainerEl.select(`span[data-flag='${currentFlag.name}']`).attr("class", "current");
    flagsNameEl.text(currentFlag.name);
    flagsPopulationEl.text(separateNumberWithCommas(currentFlag.population));
    currentFlagEl.node().scrollIntoView({behavior: "smooth", inline: "center"});
}

function animateGlobe(elapsed) {
    const now = d3.now();
    const gap = now - timestamp;
    timestamp = now;
    requestAnimationFrame(animateGlobe);
    if (gap >= elapsed) return;
    !hoverCountry && rotateGlobe(gap);
    drawGeoPath(globeGeoPath, globePaths());
    hoverCountry && drawGeometry(globeGeoPath, hoverCountry, "#c43636", "fill");
    selectedCountries.forEach(c => drawGeometry(globeGeoPath, c, "#c43636", "fill"))
}

function rotateGlobe(gap) {
    globeRotation = globeProjection.rotate();
    globeRotation[0] += gap * (speedRotation / 100);
    globeProjection.rotate(globeRotation);
}

function findCountry(e) {
    // get mouse position based on projection
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
    let list = await d3.tsv(atlasCountriesList);
    let countriesListTemp = addMissedCountries(list);
    countriesListTemp.forEach(country => {
        countriesPaths.features = countriesPaths.features.map(path => (
            parseInt(path.id) === parseInt(country.id) ? {...path, properties : {name: country.name}} : path
        ))
    });
}

function hydrateSelectedCountries(country, action = "add"){
    if(action === "remove") selectedCountries = selectedCountries.filter(c => c.name !== country.name)
    else {
        if(selectedCountries.findIndex(c => c.name === country.name) < 0) selectedCountries = [...selectedCountries, country];
    }
    displaySelectedCountries();
    displayGraphSelectedCountries();
}

function displaySelectedCountries(){
    let selectedCountriesEls = d3.select(".selected-countries").selectAll("span").data(selectedCountries.map(c => c.flag))
    selectedCountriesEls.exit().remove();
    selectedCountriesEls.enter().append("span").merge(selectedCountriesEls)
    .text((d) => d).attr("class", "selected-countries__flags").on("click", (e) => {
        let country = selectedCountries.find(c => c.flag === e.target.innerText)
        hydrateSelectedCountries(country, "remove");
    });
}

function displayGraphSelectedCountries(){
    let maxPopulation = d3.max(selectedCountries, (d) => +d.population)
    let rectWidth = (svgOptions.width - svgOptions.padding) / (selectedCountries.length + 1)
    const myscale = d3.scaleLinear()
    .domain([0, maxPopulation])
    .range([1, svgOptions.height - (svgOptions.padding * 2)]);
    let rects = svg.selectAll("rect").data(selectedCountries);
    rects.exit().remove();
    rects.enter().append("rect").merge(rects)
    .attr("x", (d, i) => (((rectWidth) * i) + svgOptions.padding))
    .attr("y", svgOptions.padding)
    .attr('width', rectWidth)
    .attr("data-flag", (d) => d.flag)
    .attr('data-country', (d) => d.name)
    .transition()
    .duration(300)
    .delay((d, i) => i * 250)
    .attr('height', (d) => myscale(d.population))
    .attr('fill', (d, i) => `hsl(237, 100%, ${7 * i}%)`)
}

function addMissedCountries(countriesList){
    let toReplace = [
        ["Russian Federation", "Russia"], 
        ["Venezuela, Bolivarian Republic of", "Venezuela"], 
        ["Congo, the Democratic Republic of the", "Republic of the Congo"]
    ];
    return countriesList.map(c => {
        let replacement = toReplace.find(([replaced]) => replaced === c.name)
        return replacement ? {...c, name: replacement[1]} : c;
    });
}

const separateNumberWithCommas = (number) => new Intl.NumberFormat("en-US").format(number);

const randomInt = (min = 1, max = 4) => Math.floor(Math.random() * (max - min + 1) + min);

const filterCountryData = ({population, name: {common}, flag}) => ({name: common, flag, population});

const calcultateTotalPopulation = (countries) => countries.reduce((prev, current) => (prev += current.population), 0);

const getRandomCountry = () => countries[randomInt(0, countries.length)];

// Events functions

function observerCallback(entries) {
    entries.forEach(e => {
        if(!e.isIntersecting){
            flagsTimer ? flagsTimer.stop() : null;
            return;
        }
        if(flagsTimer) flagsTimer.restart(animateFlags, randomInt(5, 7) * 1000)
        else{
            animateFlags();
            flagsTimer = d3.interval(animateFlags, randomInt(5, 7) * 1000);
        }
    })
}

function onResize() {
    globeProjection.scale((Math.min(canvasWidth, canvasHeight)) / 2).translate([canvasWidth / 2, canvasHeight / 2]);
}

function onMouseMove(e) {
    hoverCountry = findCountry(e);
    let country = countries.find(c => c.name === hoverCountry?.properties.name);
    country ? hoverCountryEl.html(`<p>${country.name}</p><p>${country.flag}</p>`) : hoverCountryEl.html("")
}

function onClick(e) {
    if (e.target.tagName !== "CANVAS" && !e.target.dataset.globe) return;
    let clickedPath = findCountry(e);
    console.log(clickedPath)
    let country = countries.find(c => c.name === clickedPath?.properties.name)
    hydrateSelectedCountries(country);
}

function onZoom(e) {
    let zoom = globeProjection.scale();
    e.sourceEvent.deltaY > 0 ? (zoom += scaleFactor) : (zoom -= scaleFactor);
    zoom = Math.min(Math.max(zoom, 130), 250);
    globeProjection.scale(zoom);
}

function onDrag(e) {
    globeRotation = globeProjection.rotate();
    const offset = dragFactor / globeProjection.scale();
    globeRotation[0] += e.dx * offset;
    globeRotation[1] += (-e.dy) * offset;
    globeProjection.rotate(globeRotation);
}
