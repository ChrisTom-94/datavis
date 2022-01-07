import "./style.css";
import * as d3 from "d3";
import * as topojson from "topojson-client";

const ATLAS_LAND_URL = "https://unpkg.com/world-atlas@2/land-110m.json";
const ATLAS_COUNTRIES_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";
const ATLAS_COUNTRIES_LIST_URL = "https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv"
const COUNTRIES_URL = "https://restcountries.com/v3.1/all";

let canvasOptions = {
    width: Math.min(550, window.innerWidth),
    height: Math.min(550, window.innerWidth),
    dragFactor: 50,
    scaleFactor: 25,
    speedRotation: 2
}

const randomInt = (min = 1, max = 4) => Math.floor(Math.random() * (max - min + 1) + min);
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const randomCountry = () => countries[randomInt(0, countries.length -1)];

let countries = [], 
    totalPopulation = 0,
    landPath = null,
    countriesPath = null,
    projection = null,
    geoPath = null,
    globeRotation = [0, 0, 0],
    timestamp = 0,
    isGlobeHover = false,
    hoverCountry = null,
    selectedCountries = [],
    flagSlider = null,
    currentFlag = null;
    
(async () => {
    countries = await d3.json(COUNTRIES_URL);
    countries = countries.map(filterCountriesData);

    totalPopulation = countries.reduce((prev, current) => (prev += current.population), 0);
    d3.select("#total-population").text(new Intl.NumberFormat("en-US").format(totalPopulation));
    d3.interval(animateTotalPopulation, 1000);

    let atlasLand = await d3.json(ATLAS_LAND_URL);
    let atlasCountries = await d3.json(ATLAS_COUNTRIES_URL);

    let atlasCountriesList = await d3.tsv(ATLAS_COUNTRIES_LIST_URL);
    atlasCountriesList = fixCountriesNames(atlasCountriesList);

    landPath = topojson.feature(atlasLand, atlasLand.objects.land);
    countriesPath = topojson.feature(atlasCountries, atlasCountries.objects.countries);
    countriesPath = hydrateCountriesPaths(atlasCountriesList, countriesPath);

    let {width, height} = canvasOptions
    let globeCanvas = d3.select("#globe-container")
        .append("canvas")
        .attr("width", width)
        .attr("height", height)
        .attr("data-globe", true)
        .on("mousemove", onMouseMove)
        .on("click", onClick)
        .call(d3.drag().on("drag", onDrag))
        .call(d3.zoom().on("zoom", onZoom));

    let ctx = globeCanvas.node().getContext("2d");
    projection = d3.geoOrthographic().translate([width / 2, height / 2]).rotate([0, 0]).precision(0.1);
    geoPath = d3.geoPath(projection).context(ctx);

    animateGlobe();

    flagSlider = d3.select("#flag-slider");
    flagSlider.selectAll("span").data(countries)
    .enter()
    .append("span")
    .attr("data-flag", (d) => d.name)
    .text(d => d.flag);
    currentFlag = randomCountry();

    animateFlags();
    d3.interval(animateFlags, randomInt(5, 7) * 1000);

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMoveWindow);

})();


function filterCountriesData(country){
    let {name: {common}, population, flag, area, region} = country;
    return {name: common, population, flag, area, region};
}

function animateTotalPopulation(){
    totalPopulation += randomInt();
    d3.select("#total-population").text(new Intl.NumberFormat("en-US").format(totalPopulation));
}

function fixCountriesNames(countriesList){
    let toReplace = [
        ["Russian Federation", "Russia"], 
        ["Venezuela, Bolivarian Republic of", "Venezuela"], 
        ["Congo, the Democratic Republic of the", "DR Congo"],
        ["Congo", "Republic of the Congo"],
        ["Iran, Islamic Republic of", "Iran"],
        ["Côte d'Ivoire", "Ivory Coast"],
        ["Korea, Democratic People's Republic of", "North Korea"],
        ["Korea, Republic of", "South Korea"],
        ["Bolivia, Plurinational State of", "Bolivia"],
        ["Czech Republic", "Czechia"],
        ["Viet Nam", "Vietnam"],
        ["Lao People's Democratic Republic", "Laos"],
        ["Syrian Arab Republic", "Syria"],
        ["Somaliland", "Mali"],
        ["Tanzania, United Republic of", "Tanzania"],
    ];
    return countriesList.map(c => {
        let replacement = toReplace.find(([replaced]) => replaced === c.name)
        return replacement ? {...c, name: replacement[1]} : c;
    });
}

function hydrateCountriesPaths(countries, paths){
    countries.forEach(country => {
        paths.features = paths.features.map(path => (
            parseInt(path.id) === parseInt(country.id) ? {...path, properties : {name: country.name}} : path
        ))
    });
    return paths;
}

function animateGlobe(elapsed) {
    const now = d3.now();
    const gap = now - timestamp;
    timestamp = now;
    requestAnimationFrame(animateGlobe);
    if (gap >= elapsed) return;
    drawGlobe();
    hoverCountry && drawGeometry( hoverCountry, "#c43636", "fill");
    selectedCountries.forEach(country => drawGeometry(country, "#c43636", "fill"))
    if(isGlobeHover) return;
    !hoverCountry && rotateGlobe(gap);
}

function drawGlobe(){
    let {width, height} = canvasOptions
    geoPath.context().clearRect(0, 0, width, height);

    let paths = [
        { geometry: { type: "Sphere" }, color: "#0074ba", type: "fill" },
        { geometry: landPath, color: "#00d26a", type: "fill" },
        { geometry: countriesPath, color: "#ffffff", type: "stroke" },
    ];
    paths.forEach(({ geometry, color, type }) => drawGeometry(geometry, color, type));
}

function drawGeometry(geometry, color, type){
    let ctx = geoPath.context();
    ctx.beginPath();
    geoPath(geometry);
    ctx[`${type}Style`] = color;
    ctx.lineWidth = 0.5;
    ctx[type]();
    ctx.closePath();
}

function findCountry(e) {
    // get mouse position based on projection
    const mousePosition = projection.invert(d3.pointer(e));
    return countriesPath.features.find((country) => (
      country.geometry.coordinates.some((polygon) =>(
          d3.polygonContains(polygon, mousePosition) ||
          polygon.some((subPoly) => d3.polygonContains(subPoly, mousePosition))
      )))
    ) ?? null;
}

function rotateGlobe(gap) {
    let {speedRotation} = canvasOptions
    globeRotation = projection.rotate();
    globeRotation[0] += gap * (speedRotation / 100);
    projection.rotate(globeRotation);
}

function hydrateGlobeTooltip(country, x, y){
    let hoverCountryEl = d3.select('#hover-country');
    let offset = 10;
    country ? hoverCountryEl.html(`<p>${country.name}</p><p>${country.flag}</p>`)
                            .style("top", `${y + offset}px`)
                            .style("left", `${x + offset}px`) 
                            .style("display", `block`) 
            : hoverCountryEl.html("")
                            .style("top", `0`)
                            .style("left", `0`)
                            .style("display", `none`) 
}

function animateFlags(){
    // remove class to old flag
    let currentFlagElement = flagSlider.select(`span[data-flag='${currentFlag.name}']`)
    currentFlagElement.attr("class", "");
    
    // get new country
    currentFlag = randomCountry();

    // hydrate flag element and tooltip
    currentFlagElement = flagSlider.select(`span[data-flag='${currentFlag.name}']`);
    currentFlagElement.attr("class", "current")
    d3.select("#current-flag").html(`<h4>${currentFlag.name}</h4><p>${new Intl.NumberFormat("en-US").format(currentFlag.population)}</p>`)
    currentFlagElement.node().scrollIntoView({behavior: "smooth", inline: "start"});
}

// events callbacks

function onMouseMove(e) {
    isGlobeHover = true;
    hoverCountry = findCountry(e);
    let country = countries.find(c => c.name === hoverCountry?.properties.name);
    hydrateGlobeTooltip(country, e.clientX, e.clientY);
    country && drawGeometry( hoverCountry, "#c43636", "fill");
}

function onClick(e) {
    let clickedPath = findCountry(e);
    console.log(clickedPath)
    let country = countries.find(c => c.name === clickedPath?.properties.name)
    country && hydrateSelectedCountries(country);
}

function onDrag(e) {
    globeRotation = projection.rotate();
    let {dragFactor} = canvasOptions;
    let offset = dragFactor / projection.scale();
    globeRotation[0] += e.dx * offset;
    globeRotation[1] += (-e.dy) * offset;
    projection.rotate(globeRotation);
}

function onZoom(e) {
    let zoom = projection.scale();
    let {scaleFactor} = canvasOptions;
    e.sourceEvent.deltaY > 0 ? (zoom += scaleFactor) : (zoom -= scaleFactor);
    zoom = clamp(zoom, 200, 300);
    projection.scale(zoom);
}

function onResize() {
    let {width, height} = canvasOptions;
    projection.scale((Math.min(width, height)) / 2).translate([width / 2, height / 2]);
}

function onMouseMoveWindow(e){
    if(("globe" in e.target.dataset)) return
    isGlobeHover = false;
    hydrateGlobeTooltip(null);
}
